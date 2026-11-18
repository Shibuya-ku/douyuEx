function initPkg_LiveTool_LiveNotice_Handle(text) {
    if (getType(text) == "rss") {
        let rid = getStrMiddle(text, "rid@=", "/");
        let ss = getStrMiddle(text, "ss@=", "/");
        let ivl = getStrMiddle(text, "ivl@=", "/"); // 区分轮播，当ivl为1时则为轮播
        if (ss == "1" && ivl == "0") {
            showMessageWindow("开播提醒", "直播间：" + rid + "开播了，点我签到", () => {
                signRoom(rid);
            });
        }
    }
}
