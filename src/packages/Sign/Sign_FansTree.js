async function initPkg_Sign_FansTree() {
  const rooms = await getFansBadgeRooms();
  for (const roomId of rooms) {
    try {
      const ret = await signRoomTree(roomId);
      if (ret.error != 0) {
        showMessage(`【粉丝家园】${roomId}${ret.msg || "签到未成功"}`, "error");
      } else {
        showMessage(`【粉丝家园】${roomId}签到成功！`, "success");
      }
    } catch (error) {
      showMessage(`【粉丝家园】${roomId}请求失败，继续其他房间`, "error");
    }
  }
}

function signRoomTree(rid) {
  return signFetch("https://www.douyu.com/japi/interactnc/web/fanshome/sign", {
        method: 'POST',
        mode: 'no-cors',
        credentials: 'include',
        headers: {'Content-Type': 'application/x-www-form-urlencoded'},
        body: `ctn=${getCCN()}&rid=${rid}`
    });
}
