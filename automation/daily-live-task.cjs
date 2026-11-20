"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { BarrageReceipt } = require("./barrage-receipt.cjs");
const barrageReceipts = new WeakMap();
const ROOT = path.resolve(__dirname, "..");
const DEFAULT_CONFIG = {
  roomIds: ["6657", "12306", "3487376", "3168536"],
  schedule: "00:30", weightedCheckAt: "00:40", message: "嗯嗯对对",
  basePerRoom: 1, stayMinutes: 40, browser: "chrome", closeAfter: true,
  userDataDir: "./automation/chrome-profile", logDir: "./automation/logs",
  stateDir: "./automation/state",
};
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const resolveRoot = value => path.resolve(ROOT, value);
const shanghaiDay = (now = new Date()) => new Date(now.getTime() + 8 * 3600000).toISOString().slice(0, 10);
const shanghaiDateTime = (now = new Date()) => new Date(now.getTime() + 8 * 3600000).toISOString().replace("T", " ").slice(0, 19);

function formatChineseLog(entry, now = new Date()) {
  const prefix = `[${shanghaiDateTime(now)}]`;
  const stepNames = { sign: "一键签到", renew: "续牌", barrage: "弹幕", distribution: "剩余荧光棒分配" };
  const stepName = stepNames[entry.step] || entry.step || "流程步骤";
  const room = entry.roomId ? `房间 ${entry.roomId}` : "";
  const error = entry.error ? `，原因：${entry.error}` : "";
  const notices = Array.isArray(entry.notices) ? entry.notices.filter(Boolean).join("；") : "";
  const allocation = Array.isArray(entry.allocation)
    ? entry.allocation.map(item => `${item.roomId} ${item.amount} 根（${item.multiplier} 倍）`).join("，")
    : "";
  switch (entry.event) {
    case "room_probe":
      return `${prefix} [提示] 选房：检查别名 ${entry.alias}，真实房间 ${entry.roomId}，${entry.live ? "实时开播" : "未实时开播"}。`;
    case "fallback_room":
      return `${prefix} [提示] 选房：候选房间均未实时开播，按规则回退到别名 ${entry.alias}（${entry.roomId}）。`;
    case "extension_warmup_reload":
      return `${prefix} [提示] 浏览器：全量 DouyuEx 尚未及时加载，已刷新页面后继续。`;
    case "run_start":
      return `${prefix} [进行中] 任务：开始执行，${room}，预计观看 ${entry.deadline || "未记录"} 结束。`;
    case "step_started":
      return `${prefix} [进行中] ${stepName}：开始。`;
    case "step_completed":
      return `${prefix} [成功] ${stepName}：完成。`;
    case "sign_clicked":
      return `${prefix} [成功] 一键签到：已点击全量脚本入口，等待各签到子任务反馈。`;
    case "renew_plan":
      return `${prefix} [进行中] 续牌：计划给 ${entry.rooms?.length || 0} 个粉丝牌房间各赠送 1 根，当前可用 ${entry.available ?? "未知"} 根。`;
    case "gift_response":
      return entry.code === 0 && entry.message === "success"
        ? `${prefix} [成功] 荧光棒赠送：${entry.roomId} 赠送 ${entry.amount} 根，接口确认成功。`
        : `${prefix} [失败] 荧光棒赠送：${entry.roomId} 赠送 ${entry.amount} 根，接口未确认成功${entry.message ? `（${entry.message}）` : ""}。`;
    case "renew_complete":
      return `${prefix} [成功] 续牌：${entry.count} 个粉丝牌房间各赠送 1 根完成。`;
    case "barrage_response":
      return entry.result === "server_ack" || entry.result === "own_message_echo"
        ? `${prefix} [成功] 弹幕：${entry.message || "嗯嗯对对"} 已收到斗鱼发送确认。`
        : `${prefix} [失败] 弹幕：未收到明确发送确认。`;
    case "watch_started":
      return `${prefix} [进行中] 观看：开始保持直播播放。`;
    case "watch_heartbeat": {
      const video = Array.isArray(entry.playback) ? entry.playback.find(item => item.readyState > 0) : null;
      return video && !video.paused && !video.ended
        ? `${prefix} [进行中] 观看：视频正常播放，剩余约 ${entry.remainingSeconds} 秒。`
        : `${prefix} [警告] 观看：未检测到正常播放，剩余约 ${entry.remainingSeconds} 秒。`;
    }
    case "master_notices":
      return notices ? `${prefix} [成功] 斗鱼任务反馈：${notices}` : `${prefix} [提示] 斗鱼任务反馈：本次没有新增提示。`;
    case "multiplier_probe":
      return `${prefix} [成功] 亲密度倍数：${entry.alias}（${entry.roomId}）读取为 ${entry.multiplier} 倍。`;
    case "allocation":
      return `${prefix} [进行中] 剩余荧光棒分配：共 ${entry.total} 根，计划 ${allocation || "无可分配房间"}。`;
    case "distribution_complete":
      return `${prefix} [成功] 剩余荧光棒分配：共 ${entry.total} 根，全部赠送完成。`;
    case "distribution_skipped":
      return `${prefix} [失败] 剩余荧光棒分配：已跳过，原因：${entry.reason || "前置步骤未确认成功"}。`;
    case "watch_only":
      return `${prefix} [提示] 补充测试：仅观看，不重复签到、续牌、弹幕或荧光棒分配。`;
    case "step_error":
      return `${prefix} [失败] ${stepName}：执行失败${error}。`;
    case "stay_complete":
      return entry.failures?.length
        ? `${prefix} [失败] 观看：已达到计划时长，但失败步骤为 ${entry.failures.join("、")}。`
        : `${prefix} [成功] 观看：达到计划时长 ${entry.elapsedSeconds} 秒。`;
    case "run_complete":
      return `${prefix} [成功] 任务：全部流程完成。`;
    case "run_error":
      return `${prefix} [失败] 任务：执行终止${error}。`;
    case "browser_closed":
      return `${prefix} [成功] 浏览器：自动化 Chrome 已关闭。`;
    default:
      return `${prefix} [提示] 流程记录：${entry.event || "未知事件"}${error}。`;
  }
}

function normalizeConfig(input) {
  const config = { ...DEFAULT_CONFIG, ...input };
  if (!Array.isArray(config.roomIds) || !config.roomIds.length || config.roomIds.some(id => !/^\d+$/.test(String(id)))) throw new Error("roomIds 必须是房间编号数组");
  config.roomIds = [...new Set(config.roomIds.map(String))];
  for (const key of ["schedule", "weightedCheckAt"]) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(config[key])) throw new Error(`${key} 必须为 HH:mm`);
  }
  for (const key of ["basePerRoom", "stayMinutes"]) {
    if (!Number.isSafeInteger(config[key]) || config[key] < 1) throw new Error(`${key} 必须是正整数`);
  }
  if (config.basePerRoom !== 1) throw new Error("当前授权续牌数量为每个粉丝牌 1 根");
  if (!String(config.message || "").trim()) throw new Error("message 不能为空");
  if (config.testRun && (!Number.isSafeInteger(config.weightedDelayMinutes) || config.weightedDelayMinutes < 1 || config.weightedDelayMinutes >= config.stayMinutes)) throw new Error("测试倍数检查时间必须在停留时间内");
  if (config.watchOnly && !config.testRun) throw new Error("watchOnly 仅用于补充观看测试");
  return config;
}

function delayUntilClockTime(hhmm, now = new Date()) {
  return Math.max(0, Date.parse(`${shanghaiDay(now)}T${hhmm}:00+08:00`) - now.getTime());
}

// Extract only the page's room object, never another recommended room or an advert.
function parseRoomInfo(html) {
  const source = String(html);
  const match = /window\.\$ROOM\s*=\s*\{/.exec(source);
  if (!match) throw new Error("页面缺少 $ROOM 房间数据");
  const start = match.index + match[0].lastIndexOf("{");
  let depth = 0, quoted = false, escaped = false;
  for (let i = start; i < source.length; i++) {
    const c = source[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) {
      const data = JSON.parse(source.slice(start, i + 1));
      const roomId = String(data.room_id);
      const status = Number(data.show_status);
      if (!/^[1-9]\d*$/.test(roomId) || ![1, 2].includes(status)) throw new Error("房间编号或开播状态无效");
      const replay = Number(data.room_biz_all?.videoLoop || 0) === 1;
      return { roomId, status, live: status === 1 && !replay };
    }
  }
  throw new Error("房间数据不完整");
}

function detectIntimacyMultiplier(text) {
  const match = /^今日亲密\s*(\d+(?:\.\d+)?)\s*倍提升$/.exec(String(text).trim());
  const value = match ? Number(match[1]) : NaN;
  if (!Number.isFinite(value) || value < 1 || value > 100) throw new Error("未读到房间粉丝团的明确亲密度倍数");
  return value;
}

function allocateSticks(total, rooms) {
  if (!Number.isSafeInteger(total) || total < 0) throw new Error("荧光棒数量无效");
  if (!rooms.length || rooms.some(r => !Number.isFinite(r.multiplier) || r.multiplier < 1)) throw new Error("房间倍数缺失");
  const boosted = rooms.filter(r => r.multiplier > 1);
  const targets = boosted.length ? boosted : rooms;
  const weight = targets.reduce((sum, r) => sum + r.multiplier, 0);
  const result = targets.map((r, index) => {
    const exact = total * r.multiplier / weight;
    return { ...r, roomId: String(r.roomId), amount: Math.floor(exact), remainder: exact % 1, index };
  });
  let rest = total - result.reduce((sum, r) => sum + r.amount, 0);
  result.sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (let i = 0; i < rest; i++) result[i % result.length].amount++;
  return result.sort((a, b) => a.index - b.index).map(({ remainder, index, ...r }) => r);
}

function parseGiftBalance(json) {
  if (json?.error !== 0 || !Array.isArray(json.data?.list)) throw new Error("背包读取失败");
  return json.data.list.filter(g => [268, 2358].includes(Number(g.id))).map(g => {
    const count = Number(g.count);
    if (!Number.isSafeInteger(count) || count < 0 || Number(g.isValuable) !== 0) throw new Error("荧光棒数量或免费道具类型异常");
    return { id: Number(g.id), count };
  }).filter(g => g.count > 0);
}

function resolveFansBadgeFrameUrl({ frameUrl = "", src = "", baseUrl = "" } = {}) {
  const candidates = [frameUrl, src].map(value => String(value || "").trim()).filter(Boolean);
  for (const candidate of candidates) {
    try {
      const url = new URL(candidate, baseUrl || undefined);
      if (!/^https?:$/.test(url.protocol)) continue;
      if (url.searchParams.get("rid")) return url;
    } catch {
      // The iframe can expose an empty or incomplete URL while it starts navigating.
    }
  }
  throw new Error("亲密度面板 iframe URL 尚未就绪或缺少 rid");
}

async function waitForFansBadgeFrameUrl(frame, src, baseUrl, timeout = 30000) {
  const deadline = Date.now() + timeout;
  let lastError;
  while (Date.now() < deadline) {
    try {
      return resolveFansBadgeFrameUrl({ frameUrl: frame?.url(), src, baseUrl });
    } catch (error) {
      lastError = error;
      await sleep(100);
    }
  }
  throw lastError || new Error("亲密度面板 iframe URL 尚未就绪");
}

// Mark before a side effect. An interrupted/uncertain operation is never retried automatically.
async function onceAction(stateDir, key, action) {
  fs.mkdirSync(stateDir, { recursive: true });
  const file = path.join(stateDir, `${key}.json`);
  const fd = fs.openSync(file, "wx");
  fs.writeFileSync(fd, JSON.stringify({ status: "started", at: new Date().toISOString() }));
  fs.closeSync(fd);
  try {
    const value = await action();
    fs.writeFileSync(file, JSON.stringify({ status: "completed", at: new Date().toISOString() }));
    return value;
  } catch (error) {
    fs.writeFileSync(file, JSON.stringify({ status: "uncertain", at: new Date().toISOString(), error: error.message }));
    throw error;
  }
}

async function assertLoggedIn(page) {
  const logged = (await page.context().cookies("https://www.douyu.com")).some(c => c.name === "acf_uid" && Number(c.value) > 0);
  if (!logged) throw new Error("斗鱼未登录或登录已失效，请在专用 Chrome 重新登录");
  await page.locator(".UnLogin-icon").waitFor({ state: "hidden", timeout: 20000 });
}

async function openRoom(context, alias) {
  const page = await context.newPage();
  barrageReceipts.set(page, new BarrageReceipt(page));
  try {
    await page.goto(`https://www.douyu.com/${alias}`, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForFunction(() => [...document.scripts].some(s => /window\.\$ROOM\s*=\s*\{/.test(s.textContent)), { }, { timeout: 30000 });
    const info = parseRoomInfo(await page.content());
    return { page, alias, ...info };
  } catch (error) {
    await page.close();
    throw error;
  }
}

async function selectFirstLive(context, roomIds, logger) {
  for (const alias of roomIds) {
    // Unknown is an error, not evidence that a room is offline.
    const room = await openRoom(context, alias);
    logger({ event: "room_probe", alias, roomId: room.roomId, status: room.status, live: room.live });
    if (room.live) return room;
    await room.page.close();
  }
  const room = await openRoom(context, roomIds[0]);
  logger({ event: "fallback_room", alias: room.alias, roomId: room.roomId });
  return room;
}

async function clickSign(page, logger) {
  await page.locator(".ex-icon").first().waitFor({ state: "visible", timeout: 60000 });
  if (await page.locator(".ex-icon").count() !== 1) throw new Error("检测到重复 DouyuEx 控件，请只启用 master 全量脚本");
  const panel = page.locator(".ex-panel").first();
  if (!await panel.isVisible()) await page.locator(".ex-icon").first().click();
  await page.locator(".ex-sign").first().click();
  logger({ event: "sign_clicked", result: "已触发 master 一键签到；各子模块结果见提示日志" });
}

async function sendBarrage(page, message, logger) {
  await assertLoggedIn(page);
  const input = page.locator(".ChatSend-txt").first();
  await input.fill(message, { timeout: 30000 });
  const uid = (await page.context().cookies("https://www.douyu.com")).find(c => c.name === "acf_uid")?.value;
  const receipt = barrageReceipts.get(page);
  if (!receipt || !uid) throw new Error("弹幕监听器或账号信息缺失");
  const pending = receipt.arm(message, uid);
  try {
    await page.locator(".ChatSend-button").first().click();
    logger({ event: "barrage_response", ...await pending.promise });
  } finally { pending.cancel(); }
}

async function fetchGiftBalance(page, roomId) {
  const json = await page.evaluate(async rid => {
    const response = await fetch(`/japi/prop/backpack/web/v5?rid=${rid}`, { credentials: "include" });
    if (!response.ok) throw new Error(`背包 HTTP ${response.status}`);
    return response.json();
  }, roomId);
  return parseGiftBalance(json);
}

async function sendGift(page, giftId, amount, roomId, logger) {
  if (![268, 2358].includes(giftId) || !Number.isSafeInteger(amount) || amount <= 0 || !/^[1-9]\d*$/.test(String(roomId))) throw new Error("赠送参数无效");
  await assertLoggedIn(page);
  const result = await page.evaluate(async data => {
    const body = new URLSearchParams({ propId: String(data.giftId), propCount: String(data.amount), roomId: String(data.roomId), bizExt: '{"yzxq":{}}' });
    const response = await fetch("/japi/prop/donate/mainsite/v1", { method: "POST", credentials: "include", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: body.toString() });
    if (!response.ok) throw new Error(`赠送 HTTP ${response.status}`);
    return response.json();
  }, { giftId, amount, roomId });
  logger({ event: "gift_response", giftId, amount, roomId, code: result.error, message: String(result.msg || "").slice(0, 200) });
  if (result.error !== 0 || result.msg !== "success") throw new Error(`房间 ${roomId} 赠送未获成功确认，停止后续赠送`);
}

async function renewBadges(page, roomId, logger) {
  const rooms = await page.evaluate(async () => {
    const response = await fetch("/member/cp/getFansBadgeList", { credentials: "include" });
    if (!response.ok) throw new Error("粉丝牌列表请求失败");
    const doc = new DOMParser().parseFromString(await response.text(), "text/html");
    if (!doc.querySelector(".fans-badge-list")) throw new Error("没有有效粉丝牌列表");
    return [...new Set([...doc.querySelectorAll(".fans-badge-list tr[data-fans-room]")].map(r => r.getAttribute("data-fans-room")))];
  });
  if (rooms.some(id => !/^[1-9]\d*$/.test(id))) throw new Error("粉丝牌房间编号无效");
  const gifts = await fetchGiftBalance(page, roomId);
  logger({ event: "renew_plan", rooms, amountPerRoom: 1, available: gifts.reduce((n, g) => n + g.count, 0) });
  if (gifts.reduce((n, g) => n + g.count, 0) < rooms.length) throw new Error("荧光棒不足以给所有粉丝牌各续 1 根，停止续牌");
  for (const id of rooms) {
    const gift = gifts.find(g => g.count > 0);
    await sendGift(page, gift.id, 1, id, logger);
    gift.count--;
    await sleep(400);
  }
  logger({ event: "renew_complete", count: rooms.length });
}

async function readRoomMultiplier(context, alias, logger) {
  const room = await openRoom(context, alias);
  try {
    await assertLoggedIn(room.page);
    await room.page.locator(".FansMedalPanel-enter").click({ timeout: 45000 });
    const selector = 'iframe[src*="vibe-lab-fansbadgejobchange"]';
    await room.page.locator(selector).waitFor({ state: "attached", timeout: 30000 });
    const iframe = room.page.locator(selector).first();
    const iframeHandle = await iframe.elementHandle();
    const frame = await iframeHandle?.contentFrame();
    if (!frame) throw new Error("亲密度面板 iframe 尚未建立内容窗口");
    const frameUrl = await waitForFansBadgeFrameUrl(frame, await iframe.getAttribute("src"), room.page.url());
    if (frameUrl.searchParams.get("rid") !== room.roomId) throw new Error("亲密度面板房间编号不匹配");
    const label = frame.locator("small").filter({ hasText: /^今日亲密\s*\d+(?:\.\d+)?\s*倍提升$/ });
    await label.waitFor({ state: "attached", timeout: 30000 });
    // The real badge data must be populated, rather than an uninitialised placeholder.
    await frame.locator("body").filter({ hasText: /[\d,]+\/[\d,]+亲密度/ }).waitFor({ state: "attached", timeout: 30000 });
    const text = await label.innerText();
    const multiplier = detectIntimacyMultiplier(text);
    logger({ event: "multiplier_probe", alias, roomId: room.roomId, multiplier, source: "房间粉丝团今日亲密倍数", text });
    return { roomId: room.roomId, multiplier };
  } finally { await room.page.close(); }
}

async function distributeWeighted(page, context, config, roomId, logger) {
  const rooms = [];
  for (const alias of config.roomIds) rooms.push(await readRoomMultiplier(context, alias, logger));
  if (new Set(rooms.map(r => r.roomId)).size !== rooms.length) throw new Error("候选房间别名指向同一房间");
  const gifts = await fetchGiftBalance(page, roomId);
  const total = gifts.reduce((n, g) => n + g.count, 0);
  const allocation = allocateSticks(total, rooms);
  logger({ event: "allocation", total, gifts, allocation });
  // Allocate the whole pool once; different free stick IDs do not skew the room weights.
  for (const item of allocation) {
    let left = item.amount;
    for (const gift of gifts) {
      const amount = Math.min(left, gift.count);
      if (!amount) continue;
      await sendGift(page, gift.id, amount, item.roomId, logger);
      left -= amount; gift.count -= amount;
      await sleep(400);
    }
  }
  logger({ event: "distribution_complete", total });
}

async function waitUntil(target, page, logger) {
  while (Date.now() < target) {
    await sleep(Math.min(60000, target - Date.now()));
    if (page.isClosed()) throw new Error("观看页面被关闭");
    const playback = await page.locator("video").evaluateAll(vs => vs.map(v => ({ paused: v.paused, ended: v.ended, currentTime: Math.round(v.currentTime), readyState: v.readyState })));
    logger({ event: "watch_heartbeat", remainingSeconds: Math.max(0, Math.round((target - Date.now()) / 1000)), playback });
    const notices = await page.evaluate(() => [...new Set((window.__dailyNotices || []).splice(0))]);
    if (notices.length) logger({ event: "master_notices", notices });
  }
}

async function run(config, options = {}) {
  const c = normalizeConfig(config);
  const logDir = resolveRoot(c.logDir), stateDir = resolveRoot(c.stateDir);
  fs.mkdirSync(logDir, { recursive: true }); fs.mkdirSync(stateDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const logFile = path.join(logDir, `${stamp}.jsonl`);
  const logger = entry => {
    const loggedAt = new Date();
    const line = JSON.stringify({ at: loggedAt.toISOString(), ...entry });
    fs.appendFileSync(logFile, line + "\n"); console.log(line);
    const dailyLogFile = path.join(logDir, `${shanghaiDay(loggedAt)}.log`);
    fs.appendFileSync(dailyLogFile, formatChineseLog(entry, loggedAt) + "\n", "utf8");
  };
  let context;
  const lockPath = path.join(stateDir, "run.lock");
  let locked = false;
  try {
    const lock = fs.openSync(lockPath, "wx");
    fs.writeFileSync(lock, String(process.pid)); fs.closeSync(lock); locked = true;
    const { chromium } = require(options.playwrightModule || process.env.PLAYWRIGHT_MODULE || "playwright");
    context = await chromium.launchPersistentContext(resolveRoot(c.userDataDir), {
      headless: false,
      executablePath: process.env.CHROME_EXECUTABLE || path.join(process.env.LOCALAPPDATA || "", "Google/Chrome/Application/chrome.exe"),
      ignoreDefaultArgs: ["--disable-extensions"],
      args: ["--disable-background-timer-throttling", "--disable-renderer-backgrounding"],
      viewport: { width: 1440, height: 1000 },
    });
    const selected = await selectFirstLive(context, c.roomIds, logger);
    await selected.page.bringToFront();
    await assertLoggedIn(selected.page);
    try {
      await selected.page.locator(".ex-icon").waitFor({ state: "visible", timeout: 20000 });
    } catch {
      // Tampermonkey may still be starting on the first navigation after Chrome launch.
      logger({ event: "extension_warmup_reload" });
      await selected.page.reload({ waitUntil: "domcontentloaded" });
      await selected.page.locator(".ex-icon").waitFor({ state: "visible", timeout: 45000 });
      await assertLoggedIn(selected.page);
    }
    const started = Date.now();
    const deadline = started + c.stayMinutes * 60000;
    const distributionAt = c.testRun ? started + c.weightedDelayMinutes * 60000 : Date.now() + delayUntilClockTime(c.weightedCheckAt);
    if (distributionAt >= deadline) throw new Error("倍数检查时间超出观看时段");
    logger({ event: "run_start", testRun: !!c.testRun, watchOnly: !!c.watchOnly, alias: selected.alias, roomId: selected.roomId, deadline: new Date(deadline).toISOString(), distributionAt: new Date(distributionAt).toISOString() });
    // Preserve all master timers, including 5-minute and 30-minute watch rewards.
    await selected.page.evaluate(() => {
      window.__dailyNotices = [];
      new MutationObserver(records => {
        for (const r of records) for (const n of r.addedNodes) {
          if (n.nodeType === 1) for (const el of [n, ...n.querySelectorAll('[class*="noticejs"]')]) {
            if (String(el.className).includes("noticejs") && el.textContent?.trim()) window.__dailyNotices.push(el.textContent.trim().slice(0, 400));
          }
        }
      }).observe(document.body, { childList: true, subtree: true });
    });
    const day = shanghaiDay();
    const failures = [];
    const step = async (name, action) => {
      logger({ event: "step_started", step: name });
      try {
        await onceAction(stateDir, `${day}-${name}`, action);
        logger({ event: "step_completed", step: name });
      } catch (error) {
        failures.push(name);
        logger({ event: "step_error", step: name, error: error.message });
      }
    };
    if (c.watchOnly) {
      logger({ event: "watch_only", reason: "仅补充连续观看和关闭测试，不重复签到、续牌、弹幕或剩余分配" });
    } else {
      await step("sign", () => clickSign(selected.page, logger));
      await step("renew", () => renewBadges(selected.page, selected.roomId, logger));
      await step("barrage", () => sendBarrage(selected.page, c.message, logger));
      logger({ event: "watch_started" });
      await waitUntil(distributionAt, selected.page, logger);
      if (failures.includes("renew")) {
        failures.push("distribution"); logger({ event: "distribution_skipped", reason: "续牌未确认完成，避免重复或错误消耗" });
      } else {
        await step("distribution", () => distributeWeighted(selected.page, context, c, selected.roomId, logger));
        await selected.page.bringToFront();
      }
    }
    if (c.watchOnly) logger({ event: "watch_started" });
    await waitUntil(deadline, selected.page, logger);
    const notices = await selected.page.evaluate(() => [...new Set(window.__dailyNotices || [])]);
    logger({ event: "master_notices", notices });
    logger({ event: "stay_complete", roomId: selected.roomId, elapsedSeconds: Math.round((Date.now() - started) / 1000), failures });
    if (failures.length) throw new Error(`部分步骤未成功：${failures.join(", ")}`);
    logger({ event: "run_complete" });
  } catch (error) {
    logger({ event: "run_error", error: error.stack || error.message }); throw error;
  } finally {
    try { if (context && c.closeAfter) { await context.close(); logger({ event: "browser_closed" }); } }
    finally { if (locked) fs.unlinkSync(lockPath); }
  }
}

if (require.main === module) {
  const configPath = process.argv[2] || path.join(__dirname, "config.json");
  Promise.resolve().then(() => run(JSON.parse(fs.readFileSync(configPath, "utf8").replace(/^\uFEFF/, "")))).catch(error => { console.error(error.message); process.exitCode = 1; });
}

module.exports = { DEFAULT_CONFIG, normalizeConfig, parseRoomInfo, detectIntimacyMultiplier, allocateSticks, delayUntilClockTime, shanghaiDay, shanghaiDateTime, formatChineseLog, parseGiftBalance, resolveFansBadgeFrameUrl, waitForFansBadgeFrameUrl, onceAction, run, readRoomMultiplier, selectFirstLive };
