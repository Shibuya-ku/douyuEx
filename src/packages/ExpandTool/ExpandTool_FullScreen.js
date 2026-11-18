let exFullScreenTimer = null;
let exHighestVideoQualityTimer = null;

function initPkg_ExpandTool_FullScreen() {
    ExpandTool_FullScreen_insertDom();
    ExpandTool_FullScreen_insertFunc();
    ExpandTool_HighestVideoQuality_insertFunc();
    initPkg_ExpandTool_FullScreen_Set();
    initPkg_ExpandTool_HighestVideoQuality_Set();
}

function ExpandTool_FullScreen_insertDom() {
    let a = document.createElement("span");
    // a.className = "extool__bsize";
    a.innerHTML = '<label title="自动网页全屏"><input id="extool__fullscreen" type="checkbox">自动网页全屏</label><label title="自动最高画质"><input id="extool__highestvideoquality" type="checkbox">自动最高画质</label>';
    
    let b = document.getElementsByClassName("extool")[0];
    b.insertBefore(a, b.childNodes[0]);
}


function getFullScreen() {
    return document.getElementById("extool__fullscreen").checked;
}
function ExpandTool_FullScreen_insertFunc() {
    document.getElementById("extool__fullscreen").addEventListener("click", function() {
        saveData_FullScreen();
        if (getFullScreen()) {
            showMessage("刷新页面生效", "success");
        }
    });
}

function saveData_FullScreen() {
	let data = {
		isFullScreen: getFullScreen()
	}
	localStorage.setItem("ExSave_FullScreen", JSON.stringify(data));
}
function initPkg_ExpandTool_FullScreen_Set() {
	// 设置初始化
	let ret = localStorage.getItem("ExSave_FullScreen");
	if (ret != null) {
		let retJson = JSON.parse(ret);
        if (retJson.isFullScreen) {
            document.getElementById("extool__fullscreen").checked = retJson.isFullScreen;
        }
	}
}


function initFullScreen() {
	let ret = localStorage.getItem("ExSave_FullScreen");
	if (ret != null) {
		let retJson = JSON.parse(ret);
        if (retJson.isFullScreen) {
            fullScreen();
        }
	}
}

function fullScreen() {
    if (exFullScreenTimer !== null) clearInterval(exFullScreenTimer);
    let count = 0;
    let intID1 = exFullScreenTimer = setInterval(() => {
        count++;
        if (count > 100) {
            clearInterval(intID1);
            exFullScreenTimer = null;
            return;
        }
        if (getValidDom([".wfs-2a8e83", ".icon-c8be96"])) {
            let dom = document.querySelector("div.wfs-2a8e83");
            if (dom) {
                dom.click();
            } else {
                dom = document.querySelectorAll(".icon-c8be96");
                if (dom.length >= 2) {
                    // 因为网页全屏按钮在倒数第二个
                    dom[dom.length - 2].click();
                } else {
                    return;
                }
            }
            clearInterval(intID1);
            exFullScreenTimer = null;
        }
    }, 1000);
}

function getHighestVideoQuality() {
    return document.getElementById("extool__highestvideoquality").checked;
}
function ExpandTool_HighestVideoQuality_insertFunc() {
    document.getElementById("extool__highestvideoquality").addEventListener("click", function() {
        saveData_HighestVideoQuality();
        if (getHighestVideoQuality()) {
            showMessage("刷新页面生效", "success");
        }
    });
}

function saveData_HighestVideoQuality() {
	let data = {
		isHighestVideoQuality: getHighestVideoQuality()
	}
	localStorage.setItem("ExSave_HighestVideoQuality", JSON.stringify(data));
}
function initPkg_ExpandTool_HighestVideoQuality_Set() {
	// 设置初始化
	let ret = localStorage.getItem("ExSave_HighestVideoQuality");
	if (ret != null) {
		let retJson = JSON.parse(ret);
        if (retJson.isHighestVideoQuality) {
            document.getElementById("extool__highestvideoquality").checked = retJson.isHighestVideoQuality;
        }
	}
}

function initHighestVideoQuality() {
	let ret = localStorage.getItem("ExSave_HighestVideoQuality");
	if (ret != null) {
		let retJson = JSON.parse(ret);
        if (retJson.isHighestVideoQuality) {
            highestVideoQuality();
        }
	}
}

function highestVideoQuality() {
    if (exHighestVideoQualityTimer !== null) clearInterval(exHighestVideoQualityTimer);
    let count = 0;
    let intID1 = exHighestVideoQualityTimer = setInterval(() => {
        count++;
        if (count > 100) {
            clearInterval(intID1);
            exHighestVideoQualityTimer = null;
            return;
        }
        const qualityContainer = document.querySelector('[class^="tipItem-"]:has([value^="画质"])') || document.querySelector('[class^="tip-"]:has([value^="画质"])');
        if (qualityContainer) {
            const highestQualityOption = qualityContainer.querySelector('ul > li:first-child');
            if (highestQualityOption) {
                clearInterval(intID1);
                exHighestVideoQualityTimer = null;
                const isAlreadySelected = highestQualityOption.matches('[class^="selected-"]');
                if (!isAlreadySelected) highestQualityOption.click(); 
            }
        }
    }, 1000);
}
