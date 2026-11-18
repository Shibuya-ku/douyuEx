// All retained sign-in requests settle, so a failed request cannot lock future runs.
async function signFetch(url, options = {}, responseType = "json") {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(url, { credentials: "include", ...options, signal: controller.signal });
    if (response.ok === false) throw new Error(`请求失败 (${response.status})`);
    return await response[responseType]();
  } finally {
    clearTimeout(timer);
  }
}

function signRequest(options) {
  return new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
      ...options,
      timeout: 30000,
      onload: response => {
        if (response.status >= 400) {
          reject(new Error(`请求失败 (${response.status})`));
        } else if (response.response == null) {
          reject(new Error("接口未返回有效数据"));
        } else {
          resolve(response.response);
        }
      },
      onerror: () => reject(new Error("网络请求失败")),
      ontimeout: () => reject(new Error("网络请求超时")),
      onabort: () => reject(new Error("网络请求已取消"))
    });
  });
}
