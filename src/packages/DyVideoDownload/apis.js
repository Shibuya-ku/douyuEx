function getVideoStreamUrl(vid, sign) {
    return fetch("https://v.douyu.com/api/stream/getStreamUrl", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
        body: `${sign}&vid=${encodeURIComponent(vid)}`,
    }).then((response) => response.json());
}

function getVideoBarrageByTime(vid, pre = 0) {
    // A negative cursor marks the end of official pagination.
    if (pre < 0) return Promise.resolve({ data: { pre: -1, list: [] } });
    return fetch(`https://v.douyu.com/wgapi/vod/center/getBarrageListByPage?vid=${encodeURIComponent(vid)}&offset=${encodeURIComponent(pre)}`, {
        method: "GET",
        credentials: "include",
    }).then((response) => response.json());
}