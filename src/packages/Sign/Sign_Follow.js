async function initPkg_Sign_Follow() {
  const roomId = "3186571";
  await followRoom(roomId);
  await unfollowRoom(roomId);
}

function unfollowRoom(roomId) {
  return signFetch("https://www.douyu.com/wgapi/livenc/liveweb/follow/rm", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `ctn=${getCCN()}&rid=${roomId}`
  });
}

function followRoom(roomId) {
  return signFetch("https://www.douyu.com/wgapi/livenc/liveweb/follow/add", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `ctn=${getCCN()}&rid=${roomId}`
  });
}
