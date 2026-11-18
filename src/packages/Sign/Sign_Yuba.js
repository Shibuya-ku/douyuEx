function initPkg_Sign_Yuba() {
  return signYubaList();
}

function signYubaFast() {
  return signRequest({
    method: "POST",
    url: "https://mapi-yuba.douyu.com/wb/v3/fastSign",
    responseType: "json",
    headers: { "Content-Type": "application/x-www-form-urlencoded", client: "android", token: dyToken }
  });
}

async function signYuba(groupId, token) {
  // Keep the delayed retry, and bound failed attempts rather than retrying forever.
  for (let attempt = 0; attempt < 10; attempt++) {
    const result = await signRequest({
      method: "POST",
      url: "https://yuba.douyu.com/ybapi/topic/sign",
      data: "group_id=" + groupId,
      responseType: "json",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "dy-client": "pc",
        "dy-token": token,
        Referer: "https://yuba.douyu.com/group/" + groupId
      }
    });
    if (result.message !== "签到失败") {
      await signYubaSupplementary(groupId);
      return result;
    }
    if (attempt < 9) await sleep(2000);
  }
  throw new Error("鱼吧签到重试失败，请稍后重试");
}

async function signYubaSupplementary(groupId) {
  let result = await signSupplementary(groupId);
  let remaining = Number(result?.data?.supplementary_cards) || 0;
  for (let i = 0; i < remaining; i++) {
    result = await signSupplementary(groupId);
    const next = Number(result?.data?.supplementary_cards);
    // An unavailable activity or unchanged count must not consume endless requests.
    if (!Number.isFinite(next) || next <= 0 || next >= remaining - i) break;
  }
}

async function signYubaList() {
  const first = await getYubaPage(1);
  if (!Array.isArray(first?.list)) throw new Error("无法获取关注鱼吧，请确认已登录");
  let groups = [...first.list];
  const pages = Number(first.count_page) || 1;
  for (let page = 2; page <= pages; page++) {
    const result = await getYubaPage(page);
    if (!Array.isArray(result?.list)) throw new Error("鱼吧分页数据无效");
    groups.push(...result.list);
  }
  groups = [...new Map(groups.filter(group => group?.group_id != null).map(group => [String(group.group_id), group])).values()];
  try { await signYubaFast(); } catch (error) { console.warn("【鱼吧】极速签到失败，继续逐项签到", error); }
  let signed = 0;
  let failed = 0;
  await Promise.all(groups.map(async group => {
    try {
      const result = await signYuba(group.group_id, dyToken);
      if (result.message === "") signed++;
      else if (result.message) showMessage(`【鱼吧】${group.group_id} ${result.message}`, "info");
    } catch (error) {
      failed++;
      console.warn("【鱼吧】签到失败", group.group_id, error);
    }
  }));
  showMessage(`【鱼吧】${groups.length}个鱼吧处理完成，${signed}个新签到，${failed}个失败`, failed ? "warning" : "success");
}

async function getYubaPage(page) {
  const result = await signRequest({
    method: "GET",
    url: "https://yuba.douyu.com/wbapi/web/group/myFollow?page=" + page + "&limit=30",
    responseType: "json",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "dy-client": "pc", "dy-token": dyToken }
  });
  return result.data;
}

function signSupplementary(groupId) {
  return signRequest({
    method: "POST",
    url: "https://mapi-yuba.douyu.com/wb/v3/supplement",
    responseType: "json",
    headers: { "Content-Type": "application/x-www-form-urlencoded", client: "android", token: dyToken },
    data: "group_id=" + groupId
  });
}
