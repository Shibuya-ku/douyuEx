// 续牌共用的背包查询；不依赖扩展送礼面板。
function getBagGifts(room_id, callback) {
    return signFetch('https://www.douyu.com/japi/prop/backpack/web/v5?rid=' + encodeURIComponent(room_id), {
        method: 'GET',
        credentials: 'include',
        headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    }).then((ret) => {
        if (callback) callback(ret);
        return ret;
    });
}
