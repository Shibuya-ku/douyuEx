let barragePanelInitialized = false;
function initPkg_BarragePanel() {
    if (barragePanelInitialized) return;
    barragePanelInitialized = true;
    setBarragePanelCallBack();
    initPkg_BarragePanel_Tip();
}
let barragePanel__isUpdating = false;

function barragePanel__withGuard(fn) {
    if (barragePanel__isUpdating) return;
    barragePanel__isUpdating = true;
    try {
        fn();
    } finally {
        setTimeout(() => {
            barragePanel__isUpdating = false;
        }, 0);
    }
}

function barragePanel__replaceImageDanmakuInPanel() {
    const contentDom = document.getElementsByClassName("danmuContent-25f266")[0];
    if (!contentDom) return;
    const oldText = contentDom.innerHTML;
    if (!oldText.includes(`[DouyuEx图片`)) return;
    const newText = oldText.replace(/\[DouyuEx图片(.*?)\]/g, (match, str) => getImageDanmakuHtml(str));
    if (newText !== oldText) contentDom.innerHTML = newText;
}

function setBarragePanelCallBack() {
    const update = () => barragePanel__withGuard(() => {
        const panel = document.getElementsByClassName("danmudiv-32f498")[0];
        if (!panel) return;
        const buttons = panel.getElementsByClassName("buttonGroup-de6b66")[0];
        const author = panel.getElementsByClassName("danmuAuthor-3d7b4a")[0];
        if (buttons && author) {
            const existingName = author.querySelector("#barragePanel__id");
            const name = existingName ? existingName.textContent : author.innerText;
            setUserFansMedal(author, name);
            setReplyBarrageButton(buttons);
            setBarrgePanelFunc(buttons, name);
        }
        barragePanel__replaceImageDanmakuInPanel();
    });
    // The native popup can be replaced after player re-rendering.
    new DomHook(":has(> .danmuTips-1ee820)", true, update);
    update();
}
function getUserFansMedal(userName) {
    let ret = false;
    let barrageList = document.getElementsByClassName("Barrage-listItem");
    for (let i = barrageList.length - 1; i >= 0; i--) {
        let barragePanel = barrageList[i].lastElementChild;
        if (barragePanel != null && barragePanel != undefined && barragePanel.innerHTML.indexOf(userName) != -1) {
            let fansElement = barragePanel.getElementsByClassName("FansMedalWrap");
            if (fansElement.length > 0) {
                ret = fansElement[0].cloneNode(true);
                break;
            }
        }
    }
    return ret;
}
function getUserLevelText(userName) {
    let ret = "";
    let barrageList = document.getElementsByClassName("Barrage-listItem");
    for (let i = barrageList.length - 1; i >= 0; i--) {
        let barragePanel = barrageList[i].lastElementChild;
        if (barragePanel != null && barragePanel != undefined && barragePanel.innerHTML.indexOf(userName) != -1) {
            let roomAdmin = barragePanel.getElementsByClassName("Barrage-icon--roomAdmin");
            if (roomAdmin.length > 0) {
                ret += "【房管】";
            }
            let noble = barragePanel.getElementsByClassName("Barrage-nobleImg");
            if (noble.length > 0) {
                ret += `【${ noble[0].title }】`;
            }
            let level = barragePanel.getElementsByClassName("UserLevel");
            if (level.length > 0) {
                ret += level[0].title;
            }
            break;
        }
    }
    return ret;
}

function setUserFansMedal(dom, userName) {
    if (dom.querySelector("#barragePanel__id") == undefined) {
        if (dom.childNodes && dom.childNodes.length > 0) dom.removeChild(dom.childNodes[0]);
        let userLevel = getUserLevelText(userName);
        let a = document.createElement("span");
        a.textContent = userName;
        a.title = userLevel;
        a.id = "barragePanel__id";
        dom.insertBefore(a, dom.childNodes[0] || null);
    }
    

    let fansMedal = getUserFansMedal(userName);
    if (fansMedal != false) {
        let medalWrap = dom.querySelector("#barragePanel__fansMedal");
        if (!medalWrap) {
            medalWrap = document.createElement("div");
            medalWrap.id = "barragePanel__fansMedal";
            medalWrap.style = "display:inline-block";
            dom.insertBefore(medalWrap, dom.childNodes[0] || null);
        } else {
            medalWrap.innerHTML = "";
        }
        medalWrap.appendChild(fansMedal);
    }
}

function setReplyBarrageButton(dom) {
    if (document.getElementById("barragePanel__reply") != null) {
        return;
    }
    let a = document.createElement("div");
    a.className = "button-7e1395";
    a.innerText = "回复";
    a.id = "barragePanel__reply";
    a.style = "z-index:5";
    dom.appendChild(a);
}

function setBarrgePanelFunc(parentDom, id) {
    document.getElementById("barragePanel__reply").onclick = () => {
        const content = document.getElementsByClassName("danmuContent-25f266")[0];
        const chatDom = document.getElementsByClassName("ChatSend-txt")[0];
        if (!content || !chatDom) return;
        const txt = content.innerText;
        const value = `@${ id }：${ txt }`;
        if (chatDom.tagName == "TEXTAREA") {
            chatDom.value = value;
        } else {
            chatDom.innerText = value;
        }
        chatDom.focus();
    };

}
