let real_info = { showtime: null, isShow: 2, todayWatch: null, noble_count: "" };
let realAudienceRefreshTimer = null;
let realAudienceSwitchTimer = null;
let realAudienceRefreshing = false;

function formatNobleCount(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "--";
    if (n >= 10000) return parseFloat((n / 10000).toFixed(1)) + "万";
    return String(n);
}

function initPkg_RealAudience() {
    StyleHook_set("Ex_Style_RealAudience", ".layout-Player-rank{top:34px !important;}");
    initPkg_RealAudience_Dom();
    setAvatarVideo();
    if (realAudienceRefreshTimer !== null) return;
    setRealViewer();
    realAudienceRefreshTimer = setInterval(setRealViewer, 150000);
    realAudienceSwitchTimer = setInterval(switchRealAndTodayWatch, 5000);
}

function initPkg_RealAudience_Dom() {
    if (document.querySelector(".real-audience")) return;
    const host = getValidDom([".layout-Player-announce", ".layout-Player-rankAll"]);
    if (!host) return;
    const panel = document.createElement("div");
    panel.className = "real-audience";
    panel.innerHTML = `
        <span style="flex:1;white-space:nowrap" title="斗鱼弹幕消息提供的贵宾数">贵宾:<span id="real-audience__noble">--</span></span>
        <span id="real-audience__time" style="white-space:nowrap;display:block">已播:--</span>
        <span id="real-audience__watchtime" style="white-space:nowrap;display:none">已观看:--</span>`;
    host.insertBefore(panel, host.firstChild);
}

async function setRealViewer() {
    if (realAudienceRefreshing) return;
    realAudienceRefreshing = true;
    try {
        initPkg_RealAudience_Dom();
        setAvatarVideo();
        const [roomResult, watchResult] = await Promise.allSettled([
            RealAudience_fetchJSON("https://www.douyu.com/swf_api/h5room/" + rid),
            getTodayWatch(rid),
        ]);
        if (roomResult.status === "fulfilled" && roomResult.value.data) {
            const data = roomResult.value.data;
            const showtime = Number(data.show_time);
            if (Number.isFinite(showtime) && showtime > 0) real_info.showtime = showtime;
            real_info.isShow = data.show_status;
        }
        if (watchResult.status === "fulfilled" && watchResult.value.error == 0 && watchResult.value.data) {
            const watched = Number(watchResult.value.data.todayWatch);
            if (Number.isFinite(watched) && watched >= 0) real_info.todayWatch = watched;
        }
        RealAudience_render();
    } catch (error) {
        console.log("观看信息刷新失败", error);
    } finally {
        realAudienceRefreshing = false;
    }
}

function RealAudience_render() {
    const time = document.getElementById("real-audience__time");
    const watch = document.getElementById("real-audience__watchtime");
    const noble = document.getElementById("real-audience__noble");
    const elapsed = real_info.isShow == 2 ? 0 : Math.max(0, Math.floor(Date.now() / 1000) - real_info.showtime);
    const title = real_info.showtime ? "开播时间:" + dateFormat("yyyy年MM月dd日hh时mm分ss秒", new Date(real_info.showtime * 1000)) : "";
    if (time) {
        time.innerText = "已播:" + (real_info.showtime ? formatSeconds(elapsed) : "--");
        time.title = title;
    }
    if (watch) {
        watch.innerText = "已观看:" + (real_info.todayWatch === null ? "--" : formatSeconds(real_info.todayWatch));
        watch.title = title;
    }
    if (noble && real_info.noble_count !== "") noble.innerText = formatNobleCount(real_info.noble_count);
}

function setAvatarVideo() {
    if (document.getElementById("Ex_VideoReview")) return;
    const home = document.querySelector(".VideoEntry-tabItem>a");
    const avatar = document.getElementsByClassName("Title-anchorPicBack")[0];
    if (!home || !avatar) return;
    let videoUrl;
    try {
        videoUrl = new URL(home.href);
        if (!/^https?:$/.test(videoUrl.protocol) || !/(^|\.)douyu\.com$/.test(videoUrl.hostname)) return;
    } catch (error) { return; }
    const existing = document.getElementsByClassName("Title-anchorPic-bottom")[0];
    const panel = existing || document.createElement("div");
    if (!existing) {
        panel.className = "Title-anchorPic-bottom";
        avatar.appendChild(panel);
    }
    const links = document.createElement("div");
    links.innerHTML = '<div id="Ex_VideoReview" class="Title-anchorPic-bottomItem"><span>回看</span></div><div id="Ex_VideoSubmit" class="Title-anchorPic-bottomItem"><span>投稿</span></div>';
    panel.insertBefore(links, panel.firstChild);
    panel.style.display = "none";
    panel.style.height = "auto";
    avatar.addEventListener("mouseenter", () => { panel.style.display = "block"; });
    avatar.addEventListener("mouseleave", () => { panel.style.display = "none"; });
    for (const [id, type] of [["Ex_VideoReview", "liveReplay"], ["Ex_VideoSubmit", "video"]]) {
        document.getElementById(id).addEventListener("click", () => {
            const url = new URL(videoUrl.href);
            url.searchParams.set("type", type);
            openPage(url.href, true);
        });
    }
    const entry = document.getElementsByClassName("VideoEntry")[0];
    if (entry) entry.style.display = "none";
}

function getTodayWatch(roomId) {
    return RealAudience_fetchJSON("https://www.douyu.com/japi/interactnc/web/fsjk/getCardTaskInfo?rid=" + roomId);
}

async function RealAudience_fetchJSON(url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
        const response = await fetch(url, { credentials: "include", signal: controller.signal });
        return await response.json();
    } finally {
        clearTimeout(timeout);
    }
}

function initPkg_RealAudience_Handle(ret) {
    if (getType(ret) !== "oni") return;
    const count = getStrMiddle(ret, "vn@=", "/");
    if (count === "" || !Number.isFinite(Number(count))) return;
    real_info.noble_count = count;
    const element = document.getElementById("real-audience__noble");
    if (element) element.innerText = formatNobleCount(count);
}

function switchRealAndTodayWatch() {
    const time = document.getElementById("real-audience__time");
    const watch = document.getElementById("real-audience__watchtime");
    if (!time || !watch) return;
    const showTime = time.style.display === "none";
    time.style.display = showTime ? "block" : "none";
    watch.style.display = showTime ? "none" : "block";
}
