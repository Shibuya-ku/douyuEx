let followListHook;
const followListPending = new WeakMap();
let followListInitTimer = null;
function initPkg_FollowList() {
    if (followListHook || followListInitTimer !== null) return;
    followListInitTimer = setInterval(() => {
        if (getValidDom([".Header-follow-content", "#js-backpack-enter"])) {
            followListHook = new DomHook(".Header-follow-content", false, handleFollowList);
            clearInterval(followListInitTimer);
            followListInitTimer = null;
        }
    }, 1000);
}

function handleFollowList(m) {
    const activeTab = document.getElementsByClassName("Header-follow-tab is-active")[0];
    if (!activeTab) return;
    let active = activeTab.innerText;
    if (active === "特别关注" || active === "视频动态") {
        return;
    }
    let panel = document.getElementsByClassName("Header-follow-listWrap");
    if (panel.length == 0) {
        return;
    }
    return setNewFollowList(panel[0]).catch((error) => console.error("[DouyuEx Lite] 关注列表", error));
}
function setNewFollowList(panel) {
    if (followListPending.has(panel)) return followListPending.get(panel);
    const request = renderFollowList(panel).finally(() => followListPending.delete(panel));
    followListPending.set(panel, request);
    return request;
}
async function renderFollowList(panel) {
    const activeTab = document.getElementsByClassName("Header-follow-tab is-active")[0];
    const requestedTab = activeTab && activeTab.innerText;
    let loadInCurrentPage = await GM_getValue("Ex_LoadInCurrentPage", false);
    let followList = await getFollowList();
    const currentTab = document.getElementsByClassName("Header-follow-tab is-active")[0];
    if (!panel.isConnected || !currentTab || currentTab.innerText !== requestedTab
        || currentTab.innerText === "特别关注" || currentTab.innerText === "视频动态"
        || document.getElementsByClassName("Header-follow-listWrap")[0] !== panel) return;
    if (!followList || followList.error != "0" || !followList.data || !Array.isArray(followList.data.list)) return;
    const FOLLOWLIST_LIMIT = 10; // 关注列表最多显示个数
    let limit = 0;
    let html = `
        <div id="refreshFollowList" style="color: grey; position: absolute; top: 0px; cursor: default; display: flex; align-items: center; justify-content: space-between; width: calc(100% - 10px); padding: 0 5px;">
            <label style="display: flex; align-items: center; cursor: pointer; color: inherit;">
                <input type="checkbox" id="loadInCurrentPageCheckbox" ${loadInCurrentPage ? 'checked' : ''} style="margin-right: 5px;">
                在当前页面加载
            </label>
            <span>长按弹出同屏播放</span>
        </div>
    `;
    let nowTime = Math.floor(Date.now()/1000);
    for (let i = 0; i < followList.data.list.length; i++) {
        let item = followList.data.list[i];
        if (item.show_status == "1" && item.videoLoop == "0") {
            // 开播且非录播
            html += `<li class="DropPaneList FollowList ExFollowListItem" rid="${ item.room_id }"><a><div class="DropPaneList-cover"><div class="LazyLoad is-visible DyImg "><img src="${ String(item.avatar_small).replace("_big","_small") }" alt="${ item.nickname }" class="DyImg-content is-normal "></div></div><div class="DropPaneList-info"><p><span class="DropPaneList-hot"><i></i>${ item.online }</span><span class="DropPaneList-title">${ item.room_name }</span></p><p><span class="DropPaneList-name">${ item.nickname }</span><span class="DropPaneList-time">已播${ formatSeconds(nowTime - Number(item.show_time)) }</span></p></div></a></li>`
            // html += `<li class="DropPaneList FollowList ExFollowListItem" rid="${ item.room_id }"><a><div class="DropPaneList-cover"><div class="DyImg "><img src="${ String(item.avatar_small).replace("_big","_small") }" alt="${ item.nickname }" class="DyImg-content is-normal "></div></div><div class="DropPaneList-info"><p><span class="DropPaneList-hot"><i></i>${ item.online }</span><span class="DropPaneList-title">${ item.room_name }</span></p><p><span class="DropPaneList-name">${ item.nickname }</span><span class="DropPaneList-time">已播${ formatSeconds(nowTime - Number(item.show_time)) }</span></p></div></a></li>`
            limit++;
        }
        if (limit >= FOLLOWLIST_LIMIT) {
            break;
        }
    }
    // Replace only our entries; reparsing the whole native panel drops its listeners.
    const content = document.createElement("div");
    content.innerHTML = html;
    panel.querySelectorAll("#refreshFollowList, .ExFollowListItem").forEach((item) => item.remove());
    while (content.firstChild) panel.appendChild(content.firstChild);
    const originalList = document.getElementsByClassName("Header-follow-listBox")[0];
    if (originalList) originalList.style.display = "none";

    const loadInCurrentPageCheckbox = panel.querySelector('#loadInCurrentPageCheckbox');
    if (loadInCurrentPageCheckbox) {
        loadInCurrentPageCheckbox.addEventListener("change", async (e) => {
            const isChecked = e.target.checked;
            await GM_setValue("Ex_LoadInCurrentPage", isChecked);
            showMessage(`【关注列表】已${isChecked ? "开启" : "关闭"}当前页加载功能（${isChecked ? "当前页面直接加载关注的直播间" : "使用新网页打开关注的直播间"}）`, "info");
        });
    }

    let followListItems = panel.querySelectorAll(".ExFollowListItem");
    for (let i = 0; i < followListItems.length; i++) {
        let cclick = new CClick(followListItems[i]);
        cclick.longClick(() => {
            createNewVideo(videoPlayerArr.length, followListItems[i].getAttribute("rid"), "Douyu");
            const menu = document.querySelector(".Follow .public-DropMenu");
            if (menu) menu.className = "public-DropMenu";
        });
        cclick.click(async (event) => {
            event.preventDefault();
            const shouldLoadInCurrentPage = await GM_getValue("Ex_LoadInCurrentPage", false);
            const targetUrl = "https://www.douyu.com/" + followListItems[i].getAttribute("rid");
            if (shouldLoadInCurrentPage) {
                window.location.href = targetUrl; // 在当前页加载
            } else {
                openPage(targetUrl, true); // 在新页面打开
            }
        });
        followListItems[i].addEventListener("mousedown", (event) => {
            if (event.button == 1) {
                // 鼠标中键
                openPage("https://www.douyu.com/" + followListItems[i].getAttribute("rid"), false);
            }
        })
    }
}

function getFollowList() {
    return signFetch("https://www.douyu.com/wgapi/livenc/liveweb/follow/list?sort=1&cid1=0");
}
