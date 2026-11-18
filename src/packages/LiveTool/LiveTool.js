let liveToolSocket = null;
let liveToolInitialized = false;

// Viewing subscriptions remain independent of the removed management panel.
function initPkg_LiveTool() {
    if (liveToolInitialized) return;
    liveToolInitialized = true;
    initPkg_LiveTool_BarrageSpeed();
    initPkg_LiveTool_RankList();
    initPkg_LiveTool_BarrageSendCheck().catch((error) => console.log("弹幕发送检查初始化失败", error));
    initPkg_LiveTool_HandleFunc();
    window.addEventListener("pagehide", () => {
        if (liveToolSocket) liveToolSocket.close();
        liveToolSocket = null;
    });
    window.addEventListener("pageshow", () => {
        initPkg_LiveTool_HandleFunc();
    });
}

function initPkg_LiveTool_HandleFunc() {
    if (liveToolSocket) return;
    liveToolSocket = new Ex_WebSocket_UnLogin(rid, (ret) => {
        const handlers = [
            initPkg_LiveTool_LiveNotice_Handle,
            initPkg_LiveTool_BarrageSpeed_Handle,
            initPkg_LiveTool_RankList_Handle,
            initPkg_LiveTool_BarrageSendCheck_Handle,
            initPkg_RealAudience_Handle,
        ];
        for (const handle of handlers) {
            try { handle(ret); }
            catch (error) { console.log("观看消息处理失败", error); }
        }
    });
}

function getType(str) {
    return getStrMiddle(str, "type@=", "/");
}