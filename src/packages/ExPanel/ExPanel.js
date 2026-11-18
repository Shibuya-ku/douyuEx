let ExPanel_anchorParent = null;
let ExPanel_anchorNextSibling = null;
let ExPanel_root = null;
let ExPanel_hostHooks = [];

function initPkg_ExPanel() {
    if (ExPanel_root) {
        ExPanel_syncHost();
        return;
    }
    initPkg_ExPanel_insertDom();

    let exPanelDOM = ExPanel_root;
    exPanelDOM.addEventListener(`mouseenter`, () => {
        clearTimeout(exPanelTimer);
    });
    exPanelDOM.addEventListener(`mouseleave`, () => {
        clearTimeout(exPanelTimer);
        exPanelTimer = setTimeout(autoCloseExPanelHandle, 800);
    });
    const closeBtn = exPanelDOM.querySelector(".ex-panel__close");
    if (closeBtn) {
        closeBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            hideExPanel();
        });
    }
    [".PlayerToolbar-ContentCell .PlayerToolbar-Wealth", ".PlayerToolbar-ContentRow, .ToolbarGiftArea-container", "#js-player-dialog", ".room-Player-Box"].forEach((selector) => {
        ExPanel_hostHooks.push(new DomHook(selector, false, ExPanel_syncHost));
    });
}

function ExPanel_getGiftBarAnchor() {
    return document.querySelector(".PlayerToolbar-ContentCell .PlayerToolbar-Wealth")
        || document.querySelector(".PlayerToolbar-ContentRow")
        || document.querySelector(".ToolbarGiftArea-container");
}

function ExPanel_getPanel() {
    return ExPanel_root || document.querySelector(".ex-panel");
}

function ExPanel_isGiftBarHidden() {
    const row = document.getElementsByClassName("PlayerToolbar-ContentRow")[0];
    return !!(row && row.style.visibility === "hidden");
}

function ExPanel_getFloatingHost() {
    return document.getElementById("js-player-dialog")
        || document.getElementsByClassName("room-Player-Box")[0]
        || document.body;
}

function ExPanel_saveAnchor(panel) {
    if (!ExPanel_anchorParent) {
        ExPanel_anchorParent = panel.parentNode;
        ExPanel_anchorNextSibling = panel.nextSibling;
    }
}

function ExPanel_updateFloatingPosition() {
    const panel = document.querySelector(".ex-panel.ex-panel--floating");
    if (!panel) {
        return;
    }
    const playerToolbar = document.getElementById("js-player-toolbar");
    const vtoolbarMenu = document.getElementById("ex-vtoolbar-menu");
    const gap = 8;
    panel.style.position = "fixed";
    panel.style.top = "auto";

    // Vertical: prefer vtoolbarMenu (actual bottom control bar),
    // fall back to playerToolbar, then hardcoded value
    if (vtoolbarMenu) {
        const menuRect = vtoolbarMenu.getBoundingClientRect();
        panel.style.bottom = `${window.innerHeight - menuRect.top + gap}px`;
        const panelWidth = panel.offsetWidth || panel.scrollWidth || 320;
        let left = menuRect.left + menuRect.width / 2 - panelWidth / 2;
        left = Math.max(8, Math.min(left, window.innerWidth - panelWidth - 8));
        panel.style.left = `${left}px`;
        panel.style.right = "auto";
    } else if (playerToolbar) {
        const toolbarRect = playerToolbar.getBoundingClientRect();
        panel.style.bottom = `${window.innerHeight - toolbarRect.top + gap}px`;
        const panelWidth = panel.offsetWidth || panel.scrollWidth || 320;
        let left = toolbarRect.left + toolbarRect.width / 2 - panelWidth / 2;
        left = Math.max(8, Math.min(left, window.innerWidth - panelWidth - 8));
        panel.style.left = `${left}px`;
        panel.style.right = "auto";
    } else {
        panel.style.bottom = "72px";
        panel.style.right = "12px";
        panel.style.left = "";
    }
}

function ExPanel_attachToFloatingHost() {
    const panel = ExPanel_getPanel();
    if (!panel) return;
    ExPanel_saveAnchor(panel);
    const host = ExPanel_getFloatingHost();
    if (panel.parentNode !== host) host.appendChild(panel);
    panel.classList.add("ex-panel--floating");
    ExPanel_updateFloatingPosition();
}

function ExPanel_restoreToGiftBar() {
    const panel = ExPanel_getPanel();
    const anchor = ExPanel_getGiftBarAnchor();
    if (!panel || !anchor) {
        return;
    }
    const duplicate = anchor.querySelector(".ex-panel");
    if (duplicate && duplicate !== panel) duplicate.remove();
    if (panel.parentNode !== anchor) {
        if (ExPanel_anchorNextSibling && ExPanel_anchorNextSibling.parentNode === anchor) {
            anchor.insertBefore(panel, ExPanel_anchorNextSibling);
        } else {
            anchor.insertBefore(panel, anchor.childNodes[0]);
        }
    }
    ExPanel_anchorParent = anchor;
    ExPanel_anchorNextSibling = panel.nextSibling;
    panel.classList.remove("ex-panel--floating");
    panel.style.position = "";
    panel.style.top = "";
    panel.style.left = "";
    panel.style.right = "";
    const toolbar = document.querySelector(".PlayerToolbar");
    panel.style.bottom = toolbar ? toolbar.offsetHeight + "px" : "76px";
}

function ExPanel_orderLiteTools() {
    const wrap = document.querySelector(".ex-panel__wrap");
    if (!wrap) return;
    [".ex-sign", ".fans-continue", ".extool-icon", ".ex-monitor"].forEach((selector) => {
        const item = wrap.querySelector(selector);
        if (item) wrap.appendChild(item);
    });
}

function ExPanel_syncHost() {
    if (ExPanel_isGiftBarHidden() || !ExPanel_getGiftBarAnchor()) {
        ExPanel_attachToFloatingHost();
    } else {
        ExPanel_restoreToGiftBar();
    }
}

function ExPanel_onGiftBarHide() {
    const panel = document.querySelector(".ex-panel");
    if (panel && panel.style.display === "block") {
        ExPanel_attachToFloatingHost();
        ExPanel_updateFloatingPosition();
    }
}

function ExPanel_onGiftBarShow() {
    ExPanel_restoreToGiftBar();
}

function initPkg_ExPanel_insertDom() {
	let a = document.createElement("div");
	a.className = "ex-panel";
	a.innerHTML = `<button type="button" class="ex-panel__close" title="关闭工具条" aria-label="关闭 DouyuEx 工具条">×</button><div class="ex-panel__wrap"></div>`;
	ExPanel_root = a;
    let b = ExPanel_getGiftBarAnchor();
    if (!b) {
        b = ExPanel_getFloatingHost();
        a.classList.add("ex-panel--floating");
    } else {
        const domPlayerToolbar = document.querySelector(".PlayerToolbar");
        if (domPlayerToolbar) {
            a.style.bottom = domPlayerToolbar.offsetHeight + "px";
        } else {
            a.style.bottom = "76px";
        }
    }
    b.insertBefore(a, b.childNodes[0]);
    ExPanel_saveAnchor(a);
    if (ExPanel_isGiftBarHidden()) {
        ExPanel_attachToFloatingHost();
    }
}

function hideExPanel() {
    const exPanelDOM = document.querySelector(".ex-panel");
    if (!exPanelDOM) {
        return;
    }
    clearTimeout(exPanelTimer);
    exPanelTimer = null;
    exPanelDOM.style.display = "none";
}

function autoCloseExPanelHandle() {
    hideExPanel();
}

function showExPanel() {
	let a = ExPanel_getPanel();
    if (!a) {
        return;
    }
    ExPanel_syncHost();
	if (a.style.display !== 'block') {
        a.style.display = 'block';
        clearTimeout(exPanelTimer);
        if (a.classList.contains("ex-panel--floating")) {
            ExPanel_updateFloatingPosition();
        }
    } else {
        a.style.display = 'none';
        clearTimeout(exPanelTimer);
    }
}
