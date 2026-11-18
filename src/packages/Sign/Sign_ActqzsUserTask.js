async function initPkg_Sign_ActqzsUserTask() {
  const rooms = ["5189167", "290935", "6979222", "5132174", "4042402"];
  const activityId = await getMonthlySignActivity(getActivityId);
  const cardArenaId = await getMonthlySignActivity(getCardArenaId);
  const ids = [...new Set([activityId, cardArenaId].filter(Boolean))];
  if (!ids.length) {
    showMessage("【一键签到】当前没有可用的月度活动", "info");
    return;
  }
  for (const activityId of ids) {
    for (const roomId of rooms) {
      for (const sign of [signinAct, signinCardArena]) {
        try {
          const ret = await sign(activityId, roomId);
          if (ret.error == 0) {
            const gift = (ret.data?.awards || []).map(item => `${item.name}x${item.num}`).join("、");
            showMessage("【一键签到】右侧活动直播间已签到" + (gift ? "，获得" + gift : ""), "success");
          } else if (ret.msg) {
            showMessage(`【一键签到】${roomId} ${ret.msg}`, "info");
          }
        } catch (error) {
          console.warn("【月度活动】请求失败，继续其他任务", error);
        }
      }
    }
  }
}

async function getMonthlySignActivity(load) {
  const now = new Date();
  for (const offset of [0, -1, 1]) {
    const date = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const id = await load(dateFormat("yyyyMM", date));
    if (id) return id;
  }
  return null;
}

async function getSignActivityConfig(prefix, month) {
  try {
    const text = await signFetch(`https://webconf.douyucdn.cn/resource/common/activity/${prefix}${month}_w.json`, { credentials: "omit" }, "text");
    const start = text.indexOf("(");
    const end = text.lastIndexOf(")");
    const config = JSON.parse(start >= 0 ? text.slice(start + 1, end) : text);
    return config?.data?.activity_setting?.activity_id || null;
  } catch (error) {
    return null;
  }
}

function getActivityId(month) {
  return getSignActivityConfig("actqzs", month);
}

function getCardArenaId(month) {
  return getSignActivityConfig("cardArena", month);
}

function signinCardArena(activityId, roomId) {
  return signFetch("https://www.douyu.com/japi/revenuenc/web/cardArena/userTask/signIn", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `ctn=${getCCN()}&activity_id=${activityId}&rid=${roomId}`
  });
}

function signinAct(activityId, roomId) {
  return signFetch("https://www.douyu.com/japi/revenuenc/web/actqzs/userTask/signIn", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `ctn=${getCCN()}&activity_id=${activityId}&rid=${roomId}`
  });
}
