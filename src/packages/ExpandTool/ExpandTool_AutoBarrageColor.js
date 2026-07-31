function initPkg_ExpandTool_AutoBarrageColor() {
    ExpandTool_AutoBarrageColor_insertDom();
    ExpandTool_AutoBarrageColor_insertFunc();
    initPkg_ExpandTool_AutoBarrageColor_Set();
}

function ExpandTool_AutoBarrageColor_insertDom() {
    let a = document.createElement("span");
    a.innerHTML = '<label title="进入直播间后自动选择当前已解锁的最高档粉丝弹幕颜色"><input id="extool__autobarragecolor" type="checkbox">自动最高弹幕色</label>';
    let b = document.getElementsByClassName("extool")[0];
    b.insertBefore(a, b.childNodes[0]);
}

function getAutoBarrageColor() {
    return document.getElementById("extool__autobarragecolor").checked;
}

function ExpandTool_AutoBarrageColor_insertFunc() {
    document.getElementById("extool__autobarragecolor").addEventListener("click", function () {
        saveData_AutoBarrageColor();
        if (getAutoBarrageColor()) {
            selectHighestUnlockedBarrageColor();
        }
    });
}

function saveData_AutoBarrageColor() {
    let data = {
        isAutoBarrageColor: getAutoBarrageColor()
    };
    localStorage.setItem("ExSave_AutoBarrageColor", JSON.stringify(data));
}

function initPkg_ExpandTool_AutoBarrageColor_Set() {
    let ret = localStorage.getItem("ExSave_AutoBarrageColor");
    if (ret != null) {
        let retJson = JSON.parse(ret);
        if (retJson.isAutoBarrageColor) {
            document.getElementById("extool__autobarragecolor").checked = retJson.isAutoBarrageColor;
            selectHighestUnlockedBarrageColor();
        }
    }
}

function selectHighestUnlockedBarrageColor() {
    let count = 0;
    let intID = setInterval(() => {
        count++;
        if (count > 100) {
            clearInterval(intID);
            return;
        }
        let switcher = document.getElementsByClassName("FansBarrageSwitcher")[0];
        let isMatch = false;
        if (!switcher) {
            switcher = document.getElementsByClassName("MatchSystemFansBarrageSwitcher")[0];
            isMatch = true;
        }
        if (!switcher) {
            return;
        }
        clearInterval(intID);

        let itemClass = isMatch ? "MatchSystemFansBarrageColor-item" : "FansBarrageColor-item";
        let items = document.getElementsByClassName(itemClass);
        // 色板未展开时先点开
        if (items.length === 0) {
            switcher.click();
            items = document.getElementsByClassName(itemClass);
        }

        let lastUnlocked = null;
        for (let i = 0; i < items.length; i++) {
            if (items[i].className.indexOf("is-lock") === -1) {
                lastUnlocked = items[i];
            }
        }
        if (lastUnlocked) {
            lastUnlocked.click();
        }
    }, 1000);
}
