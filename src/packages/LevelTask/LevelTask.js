let levelTaskTimer = null;
let levelTaskChecking = false;

function initPkg_LevelTask_Timer() {
  if (levelTaskTimer !== null) return;
  levelTaskTimer = setInterval(checkLevelTask, 35 * 1000);
  return checkLevelTask();
}

async function checkLevelTask() {
  if (levelTaskChecking) return;
  levelTaskChecking = true;
  try {
    const ids = await getLevelTaskIds(rid);
    if (!ids) return;
    const tasks = await getLevelTasks(ids);
    if (!Array.isArray(tasks)) return;
    for (const task of tasks) {
      if (task.taskStatus != 1 || task.prizeStatus != 0 || task.taskId == null) continue;
      try {
        const result = await finishLevelTask(rid, task.taskId);
        for (const prize of result) {
          showMessage(`【等级任务】${task.name} 获得${prize.name}${prize.num}`, "success");
        }
      } catch (error) {
        console.warn("【等级任务】领取失败，下轮继续检查", error);
      }
    }
  } catch (error) {
    console.warn("【等级任务】检查失败，下轮重试", error);
  } finally {
    levelTaskChecking = false;
  }
}

async function getLevelTaskIds(roomId) {
  const ret = await signFetch("https://www.douyu.com/japi/interactnc/web/userLevel/userLevelDetail?rid=" + roomId);
  return Array.isArray(ret?.data?.taskIds) ? ret.data.taskIds.join(",") : "";
}

async function getLevelTasks(ids) {
  const ret = await signFetch("https://www.douyu.com/japi/tasksys/userLevelTask/getTaskStatus?taskIds=" + ids);
  return ret?.data?.list;
}

async function finishLevelTask(roomId, taskId) {
  const ret = await signFetch("https://www.douyu.com/japi/tasksys/userLevelTask/getPrize", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `ctn=${getCCN()}&taskIds=${taskId}&roomId=${roomId}`
  });
  if (!Array.isArray(ret?.data?.list)) throw new Error(ret?.msg || "未返回领奖结果");
  return ret.data.list;
}
