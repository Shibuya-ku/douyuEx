let current_barrage_frame_status = false;

function initPkg_Refresh_BarrageFrame() {
    if (document.getElementById("refresh-barrage-frame")) return;
    Refresh_BarrageFrame_insertIcon();
    initPkg_Refresh_BarrageFrame_Func();
    initPkg_Refresh_BarrageFrame_Set();
}

function Refresh_BarrageFrame_insertIcon() {
    const toolbar = document.getElementsByClassName("Barrage-toolbar")[0];
    if (!toolbar) return;
    const button = document.createElement("a");
    button.className = "refresh-barrage";
    button.id = "refresh-barrage-frame";
    button.innerHTML = '<svg id="refresh-barrage-frame__svg" class="icon" viewBox="0 0 1024 1024" width="16" height="16"><path d="M512 128 192 448h192v448h256V448h192L512 128z" fill="#AFAFAF"></path></svg><i class="Barrage-toolbarIcon"></i><span id="refresh-barrage-frame__text" class="Barrage-toolbarText">拉高</span>';
    toolbar.insertBefore(button, toolbar.childNodes[0]);
}

function initPkg_Refresh_BarrageFrame_Func() {
    const button = document.getElementById("refresh-barrage-frame");
    if (!button) return;
    button.addEventListener("click", () => {
        setRefreshBarrageFrame(!current_barrage_frame_status);
        saveData_Refresh();
    });
}

function setRefreshBarrageFrame(enabled) {
    current_barrage_frame_status = !!enabled;
    if (enabled) {
        StyleHook_set("Ex_Style_RefreshBarrageFrame",
            ".layout-Player-rank,#js-room-activity{display:none !important;}.Barrage{top:0 !important;}");
    } else {
        StyleHook_remove("Ex_Style_RefreshBarrageFrame");
    }
    // 手动切换和恢复走同一路径，并保留斗鱼为该节点设置的其他类。
    const barrage = document.getElementsByClassName("Barrage")[0];
    if (barrage) barrage.classList.toggle("top-0-important", !!enabled);
    Refresh_setButtonState("refresh-barrage-frame", enabled);
}

function refresh_BarrageFrame_getStatus() {
    return current_barrage_frame_status;
}

function initPkg_Refresh_BarrageFrame_Set() {
    setRefreshBarrageFrame(!!Refresh_getSaved().barrageFrame?.status);
}
