async function initPkg_Sign_AnchorStar() {
  const result = await getAnchorStarRoomList();
  const rooms = result?.data?.rankItemList;
  if (!Array.isArray(rooms) || !rooms.length) return;
  for (const room of rooms.slice(0, 3)) {
    if (!room?.rid) continue;
    try {
      const ret = await signAnchorStar(room.rid);
      if (ret.error != null && ret.error != 0) showMessage(`【星推】${room.rid} ${ret.msg || "签到未成功"}`, "warning");
    } catch (error) {
      showMessage(`【星推】${room.rid}签到请求失败`, "error");
    }
    await sleep(500);
  }
  showMessage("【星推】签到任务处理完成", "info");
  for (const room of rooms.slice(0, 5)) {
    if (!room?.rid) continue;
    try {
      const ret = await followRoom(room.rid);
      await sleep(500);
      if (ret.error == 1) {
        await unfollowRoom(room.rid);
        await sleep(500);
        await followRoom(room.rid);
      } else {
        await unfollowRoom(room.rid);
      }
    } catch (error) {
      showMessage(`【星推】${room.rid}关注任务请求失败`, "error");
    }
    await sleep(500);
  }
  showMessage("【星推】关注任务处理完成", "info");
}

function getAnchorStarRoomList() {
  return signFetch(`https://www.douyu.com/japi/livebiznc/web/anchorstardiscover/rank/info?rid=${rid}&type=5&track=3`);
}

function signAnchorStar(roomId) {
  return signFetch("https://www.douyu.com/japi/livebiznc/web/anchorstardiscover/user/task/report", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `ctn=${getCCN()}&type=5&rid=${roomId}`
  });
}
