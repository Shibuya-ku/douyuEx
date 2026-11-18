function initPkg_Sign_Room(isAll) {
  return signAllRoom(isAll);
}

async function signAllRoom(isAll) {
  const base = "https://www.douyu.com/wgapi/livenc/liveweb/follow/list?page=";
  const summary = await signFetch(base + "1428");
  const pageCount = Number(summary?.data?.pageCount);
  if (!Number.isSafeInteger(pageCount) || pageCount < 0) throw new Error(summary?.msg || "无法获取关注房间");
  let signed = 0;
  let skipped = 0;
  let failed = 0;
  let failedPages = 0;
  for (let page = 1; page <= pageCount; page++) {
    let rooms;
    try {
      const result = await signFetch(base + page);
      rooms = result?.data?.list;
      if (!Array.isArray(rooms)) throw new Error("关注房间列表无效");
    } catch (error) {
      failedPages++;
      showMessage(`【房间签到】第${page}页获取失败，继续其他页`, "error");
      console.warn("【房间签到】分页请求失败", page, error);
      continue;
    }
    for (const room of rooms) {
      if (!isAll && room.show_status != "1") {
        skipped++;
        continue;
      }
      try {
        const ret = await signRoom(room.room_id);
        if (ret.error != null && ret.error != 0) {
          failed++;
          showMessage(`【房间签到】${room.room_id} ${ret.msg || "未能签到"}`, "warning");
        } else {
          signed++;
        }
      } catch (error) {
        failed++;
        console.warn("【房间签到】请求失败", room.room_id, error);
      }
    }
  }
  showMessage(`【房间签到】${signed}个房间已处理，${skipped}个未开播跳过，${failed}个失败${failedPages ? `，${failedPages}页未能获取` : ""}`, failed || failedPages ? "warning" : "success");
}

function signRoom(roomId) {
  return signRequest({
    method: "POST",
    url: "https://apiv2.douyucdn.cn/japi/roomuserlevel/apinc/checkIn?client_sys=android",
    data: "rid=" + roomId,
    responseType: "json",
    headers: { "Content-Type": "application/x-www-form-urlencoded", token: dyToken, aid: "android1" }
  });
}
