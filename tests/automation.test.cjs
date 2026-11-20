const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { normalizeConfig, parseRoomInfo, detectIntimacyMultiplier, allocateSticks, delayUntilClockTime, shanghaiDay, parseGiftBalance, resolveFansBadgeFrameUrl, onceAction } = require("../automation/daily-live-task.cjs");

test("confirmed config keeps two distinct gifting phases and full 40-minute stay", () => {
  const c = normalizeConfig({});
  assert.equal(c.schedule, "00:30"); assert.equal(c.weightedCheckAt, "00:40");
  assert.equal(c.basePerRoom, 1); assert.equal(c.stayMinutes, 40);
  assert.throws(() => normalizeConfig({ roomIds: ["6657", "invalid"] }));
  assert.throws(() => normalizeConfig({ basePerRoom: 0 }));
  assert.throws(() => normalizeConfig({ testRun: true, weightedDelayMinutes: 40 }));
  assert.throws(() => normalizeConfig({ watchOnly: true }));
  assert.equal(normalizeConfig({ testRun: true, watchOnly: true, weightedDelayMinutes: 10 }).watchOnly, true);
});

test("clock calculations use Shanghai time regardless of host time zone", () => {
  assert.equal(delayUntilClockTime("00:40", new Date("2026-11-18T16:30:00Z")), 600000);
  assert.equal(delayUntilClockTime("00:40", new Date("2026-11-18T16:45:00Z")), 0);
  assert.equal(shanghaiDay(new Date("2026-11-18T23:59:59Z")), "2026-11-19");
});

test("room metadata resolves aliases and ignores unrelated live adverts", () => {
  const room = { room_id: 6979222, show_status: 2, name: 'a } " {', nested: { a: 1 } };
  assert.deepEqual(parseRoomInfo('window.$ROOM = '+JSON.stringify(room)+'; {"show_status":1}'), { roomId: "6979222", status: 2, live: false });
  assert.equal(parseRoomInfo('window.$ROOM={"room_id":12306,"show_status":1};').live, true);
  assert.equal(parseRoomInfo('window.$ROOM={"room_id":6979222,"show_status":1,"room_biz_all":{"videoLoop":1}};').live, false);
  assert.throws(() => parseRoomInfo('<video></video>{"show_status":1}'));
  assert.throws(() => parseRoomInfo('window.$ROOM={"room_id":0,"show_status":1}'));
});

test("only room badge intimacy buff is accepted; gift adverts and caps are rejected", () => {
  assert.equal(detectIntimacyMultiplier("今日亲密2倍提升"), 2);
  assert.equal(detectIntimacyMultiplier("今日亲密1.5倍提升"), 1.5);
  assert.equal(detectIntimacyMultiplier("今日亲密1倍提升"), 1);
  for (const text of ["", "送限定礼物双倍亲密度", "2倍上限", "无限亲密度", "今日亲密0倍提升"]) assert.throws(() => detectIntimacyMultiplier(text));
});

test("fans badge iframe URL waits for navigation and accepts relative src", () => {
  assert.equal(resolveFansBadgeFrameUrl({ frameUrl: "", src: "/pages/vibe-lab-fansbadgejobchange?rid=12306", baseUrl: "https://www.douyu.com/12306" }).searchParams.get("rid"), "12306");
  assert.equal(resolveFansBadgeFrameUrl({ frameUrl: "about:blank", src: "https://www.douyu.com/pages/vibe-lab-fansbadgejobchange?rid=6979222", baseUrl: "https://www.douyu.com/6657" }).searchParams.get("rid"), "6979222");
  assert.equal(resolveFansBadgeFrameUrl({ frameUrl: "https://www.douyu.com/pages/vibe-lab-fansbadgejobchange?rid=3168536", src: "", baseUrl: "https://www.douyu.com/3168536" }).searchParams.get("rid"), "3168536");
  assert.throws(() => resolveFansBadgeFrameUrl({ frameUrl: "", src: "", baseUrl: "https://www.douyu.com/6657" }), /URL 尚未就绪/);
  assert.throws(() => resolveFansBadgeFrameUrl({ frameUrl: "https://www.douyu.com/pages/vibe-lab-fansbadgejobchange", src: "about:blank", baseUrl: "https://www.douyu.com/6657" }), /URL 尚未就绪/);
});

test("remaining pool goes wholly to boosted rooms, or equally without boosts", () => {
  const rooms = [1, 1, 1, 2].map((multiplier, i) => ({ roomId: String(i + 1), multiplier }));
  assert.deepEqual(allocateSticks(79, rooms), [{ roomId: "4", multiplier: 2, amount: 79 }]);
  assert.deepEqual(allocateSticks(79, rooms.map(r => ({ ...r, multiplier: 1 }))).map(r => r.amount), [20, 20, 20, 19]);
  assert.deepEqual(allocateSticks(10, [{ roomId: "1", multiplier: 2 }, { roomId: "2", multiplier: 3 }]).map(r => r.amount), [4, 6]);
  assert.throws(() => allocateSticks(4, [{ roomId: "1", multiplier: null }]));
  assert.throws(() => allocateSticks(4.1, rooms));
});

test("allocation conserves every integer budget", () => {
  for (let n = 0; n <= 250; n++) {
    const plan = allocateSticks(n, [{ roomId: "1", multiplier: 1 }, { roomId: "2", multiplier: 1.5 }, { roomId: "3", multiplier: 3 }]);
    assert.equal(plan.reduce((s, r) => s + r.amount, 0), n);
    assert.ok(plan.every(r => r.roomId !== "1" && Number.isSafeInteger(r.amount) && r.amount >= 0));
  }
});

test("backpack failures and paid items cannot be treated as free sticks", () => {
  assert.deepEqual(parseGiftBalance({ error: 0, data: { list: [{ id: 268, count: "84", isValuable: 0 }, { id: 99, count: 200, isValuable: 1 }] } }), [{ id: 268, count: 84 }]);
  for (const json of [{ error: 1 }, { error: 0, data: {} }, { error: 0, data: { list: [{ id: 268, count: -1, isValuable: 0 }] } }, { error: 0, data: { list: [{ id: 268, count: 3, isValuable: 1 }] } }]) assert.throws(() => parseGiftBalance(json));
});

test("durable journal rejects repeats including uncertain network outcomes", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "douyuex-once-"));
  let calls = 0;
  try {
    await onceAction(dir, "sent", async () => { calls++; });
    await assert.rejects(() => onceAction(dir, "sent", async () => { calls++; }));
    await assert.rejects(() => onceAction(dir, "uncertain", async () => { calls++; throw new Error("lost response"); }));
    await assert.rejects(() => onceAction(dir, "uncertain", async () => { calls++; }));
    assert.equal(calls, 2);
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, "uncertain.json"))).status, "uncertain");
  } finally { fs.rmSync(dir, { recursive: true }); }
});
