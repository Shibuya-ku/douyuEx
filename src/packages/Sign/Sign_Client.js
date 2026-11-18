function initPkg_Sign_Client() {
  return signClient();
}

async function signClient() {
  const ret = await signRequest({
    method: "POST",
    url: "https://apiv2.douyucdn.cn/h5nc/sign/sendSign",
    data: "token=" + dyToken,
    responseType: "json",
    headers: { "Content-Type": "application/x-www-form-urlencoded" }
  });
  if (ret.error != null && ret.error != 0) throw new Error(ret.msg || "客户端签到失败");
  if (!ret.data) throw new Error(ret.msg || "客户端签到未返回有效数据");
  if (Array.isArray(ret.data) && ret.data.length === 0) {
    showMessage("【客户端】今日已签到", "warning");
    return;
  }
  const gifts = ret.data.sign_pl;
  if (Array.isArray(gifts) && gifts.length) {
    showMessage("【客户端】签到成功！获得物品：" + gifts.map(gift => `${gift.cnt}个${gift.name}`).join("，"), "success");
  } else {
    showMessage("【客户端】签到成功，未获得物品", "success");
  }
}
