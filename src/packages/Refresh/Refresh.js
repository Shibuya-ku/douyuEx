let refreshToolbarTimer = null;

function initPkg_Refresh() {
    initPkg_Refresh_Video();
    if (refreshToolbarTimer !== null) return;
    let attempts = 0;
    const mount = () => {
        if (document.getElementsByClassName("Barrage-toolbar")[0]) {
            initPkg_Refresh_BarrageFrame();
            initPkg_Refresh_Barrage();
            clearInterval(refreshToolbarTimer);
            refreshToolbarTimer = null;
            return true;
        }
        return false;
    };
    if (mount()) return;
    refreshToolbarTimer = setInterval(() => {
        if (mount()) return;
        if (++attempts >= 100) {
            clearInterval(refreshToolbarTimer);
            refreshToolbarTimer = null;
        }
    }, 1500);
}

function Refresh_getSaved() {
    try {
        const data = JSON.parse(localStorage.getItem("ExSave_Refresh"));
        return data && typeof data === "object" ? data : {};
    } catch (_) {
        return {};
    }
}

function Refresh_setButtonState(id, enabled) {
    const button = document.getElementById(id);
    if (button) button.classList.toggle("ex-active", !!enabled);
    const text = document.getElementById(id + "__text");
    if (text) text.style.color = enabled ? "#fff" : "";
    const svg = document.getElementById(id + "__svg");
    const path = svg && svg.getElementsByTagName("path")[0];
    if (path) path.setAttribute("fill", enabled ? "#ffffff" : "#AFAFAF");
}

function saveData_Refresh() {
    const data = Refresh_getSaved();
    data.barrageFrame = { status: document.getElementById("refresh-barrage-frame")
        ? refresh_BarrageFrame_getStatus() : !!data.barrageFrame?.status };
    data.video = { status: refresh_Video_getStatus() };
    data.barrage = { status: document.getElementById("refresh-barrage")
        ? refresh_Barrage_getStatus() : !!data.barrage?.status };
    localStorage.setItem("ExSave_Refresh", JSON.stringify(data));
}
