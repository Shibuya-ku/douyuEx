async function initPkg_Sign_OPFOY() {
  const csrfToken = await getCsrfToken();
  const ret = await signOPFOY(csrfToken);
  if (ret.error == 0 || ret.error == 31200) {
    showMessage(`【积分任务】${ret.msg}`, "success");
  } else {
    showMessage(`【积分任务】${ret.msg}`, "error");
  }
}

function signOPFOY(csrfToken) {
  return signFetch("https://www.douyu.com/japi/carnivalApi/sign/doSign", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `csrfToken=${csrfToken}&signAlias=20250521OPFOY_qd2&useJiYan=false`
  });
}

let opfoyViewTimer = null;
let opfoyViewChecking = false;

function initPkg_Sign_OPFOY_Timer() {
  if (opfoyViewTimer !== null) return;
  opfoyViewTimer = setInterval(checkOPFOYViewStatus, 5 * 60 * 1000);
  return checkOPFOYViewStatus();
}

async function checkOPFOYViewStatus() {
  if (opfoyViewChecking) return;
  opfoyViewChecking = true;
  try {
    const status = await getOPFOYViewStatus();
    const taskList = status?.data?.taskList;
    const startTime = status?.data?.startTime;
    if (!taskList || startTime == null) return;
    for (const id of Object.keys(taskList)) {
      if (taskList[id]?.status !== 2) continue;
      try {
        const ret = await getOPFOYGift(id, startTime);
        if (ret.error == 0) {
          showMessage("【积分任务】观时积分领取成功", "success");
        } else {
          showMessage(`【积分任务】${ret.msg || "暂时无法领取"}`, "error");
        }
      } catch (error) {
        console.warn("【积分任务】领取失败，下轮继续检查", error);
      }
    }
  } catch (error) {
    console.warn("【积分任务】检查失败，下轮重试", error);
  } finally {
    opfoyViewChecking = false;
  }
}

function getOPFOYViewStatus() {
  return signFetch("https://www.douyu.com/wgapi/activitync/gametask/viewStatus", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `ctn=${getCCN()}&actAlias=20250521OPFOY`
  });
}

function getOPFOYGift(id, startTime) {
  return signFetch("https://www.douyu.com/wgapi/activitync/gametask/takeGift", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `ctn=${getCCN()}&id=${id}&actAlias=20250521OPFOY&startTime=${startTime}`
  });
}
