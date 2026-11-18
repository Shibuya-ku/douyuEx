function initPkg_BarragePanel_Tip() {
    setBarragePanelTipCallBack();
}

function setBarragePanelTipCallBack() {
    let a = new DomHook("#comment-dzjy-container", false, (m) => {
        if (m.length <= 0) {
            return;
        }
        if (m[0].addedNodes.length <= 0) {
            return;
        }
        renderBarragePanelTip();
        setBarragePanelTipFunc();
    })
}

function renderBarragePanelTip() {
    if (document.getElementById("barrage-panel-tip__+1")) return;
    const labelDoms = document.getElementsByClassName("labelfisrt-407af4");
    if (labelDoms.length === 0) return;
    const dom = labelDoms[0].parentElement;

    // Douyu now renders its own "+1" action in some rooms. Keep one action
    // instead of appending the Lite helper beside the native button.
    const children = dom && (dom.querySelectorAll ? dom.querySelectorAll("*") : dom.children || []);
    if (children && Array.from(children).some((node) => {
        if (node.id === "barrage-panel-tip__+1") return false;
        const text = (node.innerText || node.textContent || "").trim();
        return text === "+1";
    })) return;

    let a = document.createElement("div");
    a.style.display = "inline-block";
    dom.appendChild(a);


    a = document.createElement("p");
    a.className = "sugun-e3fbf6";
    a.innerText = "|";
    dom.appendChild(a);

    a = document.createElement("div");
    a.className = "labelfisrt-407af4 thirdBtn-06cde5 fourBtn-0845d4";
    a.id = "barrage-panel-tip__+1"
    a.innerText = "+1";
    dom.appendChild(a);
}

function setBarragePanelTipFunc() {
    const button = document.getElementById("barrage-panel-tip__+1");
    if (!button) return;
    button.onclick = () => {
        const dom = document.getElementById("comment-higher-container");
        if (!dom) return;
        if (dom.getElementsByClassName("ex-image-danmaku").length > 0) {
            const textDom = dom.getElementsByClassName("text-879f3e")[0];
            if (!textDom) return;
            sendBarrage(textDom.innerHTML.replace(/<a[^>]*><img\s+(?:.*?\s+)?src="(.*?)"[^>]*?\/?><\/a>/g, (match, src) => {
                return getImageDanmakuFromImgSrc(src);
            }));
        } else {
            sendBarrage(dom.innerText);
        }
    }
}
