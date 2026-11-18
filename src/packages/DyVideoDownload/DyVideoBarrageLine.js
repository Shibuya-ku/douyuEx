let dyVideoBarrage_domhook_videoChange = null;
let dyVideoBarrage_loadingId = "";
let dyVideoBarrage_generation = 0;
const dyVideoBarrage_domName = "ex-barrageLine";

function DyVideoBarrage_getDom() {
    const shadow = document.getElementsByTagName("demand-video")[0]?.shadowRoot;
    const controls = shadow?.getElementById("demandcontroller-bar")?.shadowRoot;
    const progress = controls?.querySelector("demand-video-controller-progress")?.shadowRoot;
    const share = document.getElementsByTagName("demand-video-toolbar")[0]?.shadowRoot?.querySelector("share-hover");
    return { controls, progress, share };
}

function initPkg_DyVideoBarrageLine() {
    let timer = setInterval(() => {
        const { progress, share } = DyVideoBarrage_getDom();
        if (!progress?.querySelector(".ProgressBar-Sign") || !share) return;
        clearInterval(timer);
        initPkg_DyVideoBarrageLine_Dom();
        renderVideoBarrageLine();
        dyVideoBarrage_domhook_videoChange = new MutationObserver((mutations) => {
            if (mutations.some(item => item.attributeName === "hashid")) renderVideoBarrageLine();
        });
        dyVideoBarrage_domhook_videoChange.observe(share, { attributes: true, childList: false, subtree: false });
    }, 1000);
}

function initPkg_DyVideoBarrageLine_Dom() {
    const { progress } = DyVideoBarrage_getDom();
    if (!progress) return;
    const style = document.createElement("style");
    style.innerHTML = `.no-hasLR #ex-barrageLine { display: none !important; }`;
    progress.append(style);
}

async function renderVideoBarrageLine() {
    const { controls, progress, share } = DyVideoBarrage_getDom();
    const progressBar = progress?.querySelector(".ProgressBar");
    const hashid = share?.getAttribute("hashid");
    if (!progressBar || !hashid || dyVideoBarrage_loadingId === hashid) return;
    const parts = controls.querySelector("#time-label")?.innerText.split("/");
    const totalMs = parts?.length > 1 ? timeText2Ms(parts[1]) : 0;
    if (!Number.isFinite(totalMs) || totalMs <= 0) return;
    const generation = ++dyVideoBarrage_generation;
    dyVideoBarrage_loadingId = hashid;
    const old = progress.querySelector("#" + dyVideoBarrage_domName);
    if (old) old.remove();
    showMessage("弹幕高能进度条加载中，请耐心等待", "info");
    try {
        const list = new Array(100).fill(0);
        const msStep = totalMs / 99;
        const cursors = new Set();
        let pre = 0;
        do {
            if (cursors.has(String(pre))) throw new Error("弹幕分页未前进");
            cursors.add(String(pre));
            const result = await getVideoBarrageByTime(hashid, pre);
            if (generation !== dyVideoBarrage_generation || share.getAttribute("hashid") !== hashid) return;
            if (!result?.data || !Array.isArray(result.data.list)) throw new Error("弹幕数据不可用");
            pre = Number(result.data.pre);
            if (!Number.isFinite(pre)) throw new Error("弹幕分页无效");
            for (const item of result.data.list) {
                const time = Number(item.tl);
                if (!Number.isFinite(time) || time < 0 || time > totalMs) continue;
                list[Math.min(99, Math.floor(time / msStep))]++;
            }
        } while (pre >= 0);
        const maximum = Math.max(...list);
        const points = list.map((count, index) => [index * 10, maximum ? count / maximum * 100 : 0]);
        let path = "M 0 100 L 0 80 ";
        for (let i = 0; i < points.length - 1; i++) {
            const [x1, y1] = points[i];
            const [x2, y2] = points[i + 1];
            const middle = 80 - (y1 + y2) / 2;
            path += `C ${x1} ${middle}, ${x2} ${middle}, ${x2} ${80 - y2} `;
        }
        path += "L 1000 100 Z";
        const line = document.createElement("div");
        line.id = dyVideoBarrage_domName;
        line.style = "position:absolute;width:100%;height:30px;bottom:0px;pointer-events:none;cursor:default;";
        line.innerHTML = `<svg preserveAspectRatio="none" width="100%" height="100%" viewBox="0 0 1000 100"><path fill="rgba(255,255,255,0.3)" d="${path}" /></svg>`;
        progressBar.insertBefore(line, progressBar.childNodes[0]);
    } catch (error) {
        if (generation === dyVideoBarrage_generation) showMessage("弹幕高能进度条加载失败：" + error.message, "error");
    } finally {
        if (generation === dyVideoBarrage_generation) dyVideoBarrage_loadingId = "";
    }
}