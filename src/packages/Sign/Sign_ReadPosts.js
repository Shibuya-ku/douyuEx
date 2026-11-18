async function initPkg_Sign_ReadPosts() {
  for (let i = 0; i < 5; i++) {
    try {
      await readPosts();
    } catch (error) {
      console.warn("【阅读任务】请求失败", error);
    }
    await sleep(2000);
  }
}

function readPosts() {
  return signRequest({
    method: "GET",
    url: "https://yuba.douyu.com/wbapi/web/post/detail/555691541586843641?cid=&timestamp=" + Date.now(),
    responseType: "json",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "dy-token": dyToken, "dy-client": "pc" }
  });
}
