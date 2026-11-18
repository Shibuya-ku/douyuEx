let fansBadgeRoomsRequest = null;

// Share only an in-flight request. A later run must see the current account/list.
function getFansBadgeRooms() {
  if (fansBadgeRoomsRequest) return fansBadgeRoomsRequest;
  fansBadgeRoomsRequest = (async () => {
    const html = await signFetch("https://www.douyu.com/member/cp/getFansBadgeList", {}, "text");
    const doc = new DOMParser().parseFromString(html, "text/html");
    const list = doc.querySelector(".fans-badge-list");
    if (!list) throw new Error("未能获取粉丝牌列表，请确认已登录");
    return [...new Set(Array.from(list.querySelectorAll("[data-fans-room]"), node => node.getAttribute("data-fans-room"))
      .filter(roomId => /^\d+$/.test(roomId) && Number(roomId) > 0))];
  })().finally(() => { fansBadgeRoomsRequest = null; });
  return fansBadgeRoomsRequest;
}
