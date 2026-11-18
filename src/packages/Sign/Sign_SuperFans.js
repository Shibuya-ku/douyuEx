async function initPkg_Sign_SuperFans() {
  const rooms = await getFansBadgeRooms();
  for (const roomId of rooms) {
    try {
      const ret = await signSuperFans(roomId);
      if (ret.error == 0) {
        showMessage(`【钻粉联赛签到】${roomId}签到成功！`, "success");
      } else if (ret.msg) {
        showMessage(`【钻粉联赛签到】${roomId}${ret.msg}`, "info");
      }
    } catch (error) {
      showMessage(`【钻粉联赛签到】${roomId}请求失败，继续其他房间`, "error");
    }
  }
}

function signSuperFans(rid) {
  return signFetch("https://www.douyu.com/japi/interactnc/web/dfansact/userSign", {
        method: 'POST',
        mode: 'no-cors',
        credentials: 'include',
        headers: {'Content-Type': 'application/x-www-form-urlencoded'},
        body: `ctn=${getCCN()}&rid=${rid}`
    });
}
