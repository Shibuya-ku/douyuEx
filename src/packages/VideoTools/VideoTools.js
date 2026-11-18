var liveVideoNode; // 直播video标签节点
var isInput = false;
let videotools_num = 0;
let videoToolsTimer = null;
let videoToolsInitialized = false;
let videoToolsFocusBound = false;
function initPkg_VideoTools() {
    if (videoToolsTimer !== null || videoToolsInitialized) return;
    videoToolsTimer = setInterval(() => {
        const controlbar = getValidDom([".right-e7ea5d", ".right-17e251"]);
        const video = document.querySelector(".layout-Player-videoEntity video");
        if (controlbar && video) {
            clearInterval(videoToolsTimer);
            videoToolsTimer = null;
            videoToolsInitialized = true;
            liveVideoNode = video;
            const version = document.getElementsByClassName("disable-23f484")[0];
            if (version) version.textContent = `DouyuEx Lite_${curVersion}`;
            initPkg_VideoTools_Module();
            initPkg_VideoTools_Func();
        }
        videotools_num++;
        if (videotools_num >= 100) {
            clearInterval(videoToolsTimer);
            videoToolsTimer = null;
        }
    }, 1500);
}

function initPkg_VideoTools_Module() {
    runInitializers([
        initPkg_VideoTools_VideoToolbarMenu, initPkg_VideoTools_VideoSpeed,
        initPkg_VideoTools_Cinema, initPkg_VideoTools_VideoSync,
        initPkg_VideoTools_VideoRecall, initPkg_VideoTools_Filter,
        initPkg_VideoTools_Camera, initPkg_VideoTools_VideoZoom,
        initPkg_VideoTools_MetaData, initPkg_PictureInPictureControl,
    ]);
}

function initPkg_VideoTools_Func() {
    const hideFilterOnLeave = () => {
        if (typeof VideoToolbarMenu_hideFilterPanel === "function") {
            VideoToolbarMenu_hideFilterPanel();
        } else if (typeof Filter_hidePanel === "function") {
            Filter_hidePanel();
        }
    };
    const toolbar = document.getElementById("js-player-toolbar");
    const aside = document.getElementById("js-player-asideMain");
    if (toolbar) toolbar.addEventListener("mouseover", hideFilterOnLeave);
    if (aside) aside.addEventListener("mouseover", hideFilterOnLeave);
    if (!videoToolsFocusBound) {
        videoToolsFocusBound = true;
        document.addEventListener("focusin", VideoTools_updateInputFocus);
        document.addEventListener("focusout", () => setTimeout(VideoTools_updateInputFocus, 0));
        new DomHook(".app-f0f9c7", false, VideoTools_updateInputFocus);
    }
    VideoTools_updateInputFocus();
}

function VideoTools_updateInputFocus() {
    let active = document.activeElement;
    while (active && active.shadowRoot && active.shadowRoot.activeElement) {
        active = active.shadowRoot.activeElement;
    }
    isInput = !!(active && (/^(?:INPUT|TEXTAREA|SELECT)$/.test(active.tagName)
        || active.isContentEditable));
}
