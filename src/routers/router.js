let liteRoomReadyTimer = null;
let liteRoomReadyScheduled = false;
let liteReplayReadyTimer = null;
let liteReplayInitialized = false;

function initRouter(href) {
    const page = new URL(href);
    if (page.hostname === "yuba.douyu.com") {
        if (page.origin === "https://yuba.douyu.com" && window.parent !== window) {
            if (document.body) initPkg_Night_EmbeddedYuba();
            else document.addEventListener("DOMContentLoaded", initPkg_Night_EmbeddedYuba, { once: true });
        }
        return;
    }
    if (page.hostname === "v.douyu.com") {
        if (page.pathname.startsWith("/show/")) initRouter_Video();
        return;
    }
    if (page.hostname !== "www.douyu.com" && page.hostname !== "douyu.com") return;
    if (/^\/(?:template|h5|member)\//.test(page.pathname)) return;
    if (page.searchParams.get("exid") === "chun") {
        initRouter_DouyuRoom_Popup();
    } else {
        initRouter_DouyuRoom_Main();
    }
}

function initRouter_DouyuRoom_Popup() {
    removeAD();
    const timer = setInterval(() => {
        const fullscreen = document.querySelector("div.wfs-2a8e83");
        if (!fullscreen) return;
        fullscreen.click();
        const aside = document.querySelector("label.layout-Player-asidetoggleButton");
        if (aside) aside.click();
        const qualities = document.querySelectorAll(".tip-e3420a > ul > li");
        if (qualities.length) qualities[qualities.length - 1].click();
        clearInterval(timer);
    }, 1000);
}

function initRouter_DouyuRoom_Main() {
    init();
    if (liteRoomReadyTimer !== null || liteRoomReadyScheduled) return;
    liteRoomReadyTimer = setInterval(() => {
        const barrage = document.getElementsByClassName("Barrage-main")[0];
        // 礼物栏可能在播放器重渲染后才出现，不能阻塞观看工具和精灵球初始化。
        if (!barrage) return;
        clearInterval(liteRoomReadyTimer);
        liteRoomReadyTimer = null;
        liteRoomReadyScheduled = true;
        setTimeout(() => {
            initStyles();
            initPkg();
            initTimer();
        }, 1500);
    }, 1000);
}

function initRouter_Video() {
    if (liteReplayInitialized || liteReplayReadyTimer !== null) return;
    const initialize = () => {
        if (!unsafeWindow.$DATA || !("ROOM" in unsafeWindow.$DATA)) return false;
        liteReplayInitialized = true;
        initStyles();
        runInitializers([
            initPkg_VideoTime, initPkg_VideoTools_Camera_Video,
            initPkg_DyVideoDownload, initPkg_DyVideoBarrageLine,
        ]);
        return true;
    };
    if (initialize()) return;
    let attempts = 0;
    liteReplayReadyTimer = setInterval(() => {
        if (initialize() || ++attempts >= 100) {
            clearInterval(liteReplayReadyTimer);
            liteReplayReadyTimer = null;
        }
    }, 500);
}
