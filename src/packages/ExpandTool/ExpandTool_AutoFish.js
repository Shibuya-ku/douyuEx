let autoFishInfo = [];
let baitId = null;
let nextFishEndTime = 0;
let isFishing = false;
let timerAutoFish = null;
let autoFishGeneration = 0;
let autoFishBusy = false;
let autoFishReady = false;

function initPkg_ExpandTool_AutoFish() {
  ExpandTool_AutoFish_insertDom();
  ExpandTool_AutoFish_insertFunc();
  ExpandTool_AutoFish_Set();
}

function ExpandTool_AutoFish_insertDom() {
  const section = document.createElement("div");
  section.className = "extool__autofish";
  section.innerHTML = '<label><input id="extool__autofish_start" type="checkbox">自动钓鱼</label><br>'
    + '<label><input name="autofish_mode" type="radio" value="all" checked>全天</label>'
    + '<label><input name="autofish_mode" type="radio" value="contest">钓鱼大赛</label>';
  const panel = document.getElementsByClassName("extool")[0];
  panel.insertBefore(section, panel.childNodes[0]);
}

function ExpandTool_AutoFish_insertFunc() {
  document.querySelectorAll('input[name="autofish_mode"]').forEach((radio) => {
    radio.addEventListener("change", saveData_AutoFish);
  });
  document.getElementById("extool__autofish_start").addEventListener("click", () => {
    saveData_AutoFish();
    if (document.getElementById("extool__autofish_start").checked) {
      AutoFish_startLoop();
    } else {
      AutoFish_stopLoop();
    }
  });
}

function AutoFish_isActive(generation) {
  const checkbox = document.getElementById("extool__autofish_start");
  return generation === autoFishGeneration && !!(checkbox && checkbox.checked);
}

function AutoFish_stopLoop() {
  autoFishGeneration++;
  if (timerAutoFish !== null) clearInterval(timerAutoFish);
  timerAutoFish = null;
  autoFishReady = false;
  const checkbox = document.getElementById("extool__autofish_start");
  if (checkbox) checkbox.checked = false;
  AutoFish_lockMode(false);
  saveData_AutoFish();
}

function AutoFish_startLoop() {
  if (timerAutoFish !== null) clearInterval(timerAutoFish);
  const generation = ++autoFishGeneration;
  autoFishReady = false;
  AutoFish_lockMode(true);
  showMessage("【自动钓鱼】开始自动钓鱼", "info");
  // 即使一次请求失败也保留后续检查；所有轮次共享请求锁，避免慢请求重叠。
  timerAutoFish = setInterval(() => AutoFish_tick(generation), 1500);
  AutoFish_tick(generation);
}

async function AutoFish_prepare(generation) {
  const info = await AutoFish_getFishInfo();
  if (!AutoFish_isActive(generation)) return;
  autoFishInfo = Array.isArray(info) ? info : [];
  const homepageRes = await AutoFish_getHomepageData();
  if (!AutoFish_isActive(generation)) return;
  const data = homepageRes && homepageRes.data;
  if (!data || !data.fishing) {
    throw new Error("未能获取活动信息");
  }
  const bait = Array.isArray(data.baits) && data.baits.find((item) => item.inUse);
  if (!bait || !data.myCh) {
    AutoFish_stopLoop();
    showMessage(bait ? "【自动钓鱼】请设置形象" : "【自动钓鱼】请设置鱼饵", "error");
    return;
  }
  baitId = bait.id;
  isFishing = data.fishing.stat == 1;
  nextFishEndTime = isFishing ? data.fishing.fishEtMs : 0;
  if (data.fishing.stat == 2) {
    // 恢复上一次已完成但未收竿的结果。
    await endFish(generation);
    if (!AutoFish_isActive(generation)) return;
    await sleep(1000);
  }
  if (AutoFish_isActive(generation)) autoFishReady = true;
}

async function AutoFish_tick(generation) {
  if (!AutoFish_isActive(generation) || autoFishBusy) return;
  autoFishBusy = true;
  try {
    if (!autoFishReady) {
      await AutoFish_prepare(generation);
      return;
    }
    if (!isInFishingTime()) return;
    if (isFishing) {
      if (Date.now() <= nextFishEndTime) return;
      await endFish(generation);
      return;
    }
    const fishRes = await AutoFish_startFish();
    if (!AutoFish_isActive(generation)) return;
    if (fishRes.error !== 0) {
      showMessage("【自动钓鱼】" + fishRes.msg, "error");
      if (fishRes.error == 1001007) await endFish(generation);
      if (fishRes.error == 1005003) AutoFish_stopLoop();
      return;
    }
    isFishing = true;
    nextFishEndTime = fishRes.data.fishing.fishEtMs;
  } catch (err) {
    if (AutoFish_isActive(generation)) {
      showMessage("【自动钓鱼】请求失败，将继续检查", "error");
      console.log("自动钓鱼请求失败", err);
    }
  } finally {
    autoFishBusy = false;
  }
}

async function endFish(generation = autoFishGeneration) {
  if (!AutoFish_isActive(generation)) return;
  const fishRes = await AutoFish_endFish();
  if (!AutoFish_isActive(generation)) return;
  if (fishRes.error !== 0) {
    const homepageRes = await AutoFish_getHomepageData();
    if (!AutoFish_isActive(generation)) return;
    const fishing = homepageRes.data && homepageRes.data.fishing;
    if (!fishing) throw new Error("未能确认收竿状态");
    isFishing = fishing.stat != 0;
    nextFishEndTime = isFishing ? fishing.fishEtMs : 0;
    return;
  }
  const fish = fishRes.data && fishRes.data.fish;
  const fishData = fish && autoFishInfo.find((item) => item.fishId == fish.id);
  let message = "【自动钓鱼】";
  if (fishData) message += "获得" + fishData.name + fish.wei + "斤";
  const awards = fishRes.data && fishRes.data.awards;
  if (Array.isArray(awards)) {
    awards.forEach((award) => {
      message += (message !== "【自动钓鱼】" ? "，" : "") + "获得" + award.awardName + "x" + award.awardNum;
    });
  }
  if (message !== "【自动钓鱼】") showMessage(message, "success");
  isFishing = false;
  nextFishEndTime = 0;
}

function AutoFish_getSave() {
  let data;
  try {
    data = JSON.parse(localStorage.getItem("ExSave_AutoFish"));
  } catch (e) {
    data = null;
  }
  if (!data || typeof data !== "object") data = {};
  if (!Array.isArray(data.rids)) data.rids = [];
  if (!data.modes || typeof data.modes !== "object") data.modes = {};
  return data;
}

function AutoFish_lockMode(lock) {
  document.querySelectorAll('input[name="autofish_mode"]').forEach((r) => (r.disabled = lock));
}

function saveData_AutoFish() {
  let checkbox = document.getElementById("extool__autofish_start");
  let modeRadio = document.querySelector('input[name="autofish_mode"]:checked');
  if (!checkbox || !modeRadio) return;

  let value = checkbox.checked;
  let mode = modeRadio.value;
  let data = AutoFish_getSave();
  
  if (value) {
    if (!data.rids.includes(rid)) data.rids.push(rid);
    data.modes[rid] = mode;
  } else {
    data.rids = data.rids.filter((item) => item !== rid);
    delete data.modes[rid];
  }
  
  localStorage.setItem("ExSave_AutoFish", JSON.stringify(data));
}

function AutoFish_getRids() {
  return AutoFish_getSave().rids;
}

function ExpandTool_AutoFish_Set() {
  let data = AutoFish_getSave();
  if (!data.rids.includes(rid)) return;
  
  // 设置模式（兼容旧版本，默认全天）
  let mode = data.modes && data.modes[rid] === "contest" ? "contest" : "all";
  document.querySelector(`input[name="autofish_mode"][value="${mode}"]`).checked = true;
  
  document.getElementById("extool__autofish_start").click();
}

async function AutoFish_request(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(url, { credentials: "include", ...options, signal: controller.signal });
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function AutoFish_getFishInfo() {
  const ret = await AutoFish_request("https://www.douyu.com/japi/revenuenc/web/actfans/achieve/accList?rid=" + rid + "&type=1&period=1");
  return ret.data && ret.data.accList || [];
}

function AutoFish_getHomepageData() {
  return AutoFish_request("https://www.douyu.com/japi/revenuenc/web/actfans/fishing/homePage?rid=" + rid + "&opt=1");
}

function AutoFish_startFish() {
  return AutoFish_request("https://www.douyu.com/japi/revenuenc/web/actfans/fishing/fishing", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "ctn=" + getCCN() + "&rid=" + rid + "&baitId=" + baitId + "&ver=1.1"
  });
}

function AutoFish_endFish() {
  return AutoFish_request("https://www.douyu.com/japi/revenuenc/web/actfans/fishing/reelIn", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "ctn=" + getCCN() + "&rid=" + rid
  });
}

function isInFishingTime() {
  let modeRadio = document.querySelector('input[name="autofish_mode"]:checked');
  let mode = modeRadio ? modeRadio.value : "all";
  if (mode === "all") return true;
  
  let now = new Date();
  let hour = now.getHours();
  let minute = now.getMinutes();
  
  // 钓鱼大赛：12:00-24:00，每个整点的前半小时（包括00:00-00:30）
  return (hour >= 12 && minute < 30) || (hour === 0 && minute < 30);
}
