var videoPlayerArr = [];

function initPkg_PopupPlayer() {
    if (document.getElementById("popup-player__prompt")) return;
    PopupPlayer_insertPrompt();
    initPkg_PopupPlayer_Func();
}

function PopupPlayer_openPrompt() {
    initPkg_PopupPlayer();
    const prompt = document.getElementById("popup-player__prompt");
    prompt.style.display = "block";
    document.getElementById("popup-player__url").focus();
}

function PopupPlayer_roomUrl(value) {
    const text = String(value).trim();
    if (/^\d+$/.test(text)) return "https://www.douyu.com/" + text;
    try {
        const url = new URL(text);
        if (!/^https?:$/.test(url.protocol) || !["douyu.com", "www.douyu.com"].includes(url.hostname) || url.port || url.username || url.password) return "";
        if (!/^\/[a-zA-Z0-9_-]+\/?$/.test(url.pathname)) return "";
        return "https://www.douyu.com" + url.pathname;
    } catch (error) {
        return "";
    }
}

function PopupPlayer_insertPrompt() {
    const prompt = document.createElement("div");
    prompt.className = "postbird-box-container";
    prompt.id = "popup-player__prompt";
    prompt.innerHTML = `
        <div class="postbird-box-dialog"><div class="postbird-box-content" style="min-height:170px">
            <div class="postbird-box-header"><span class="postbird-box-title">斗鱼同屏播放</span></div>
            <div class="postbird-box-text">
                <input id="popup-player__url" placeholder="斗鱼房间号或直播间地址" style="height:30px;box-sizing:border-box" type="text" class="postbird-prompt-input">
                <label style="margin-right:30px" title="播放斗鱼直播流"><input id="popup-player__noiframe" type="radio" name="ex-popup-mode" checked>无弹幕</label>
                <label title="在小窗打开斗鱼直播间"><input id="popup-player__iframe" type="radio" name="ex-popup-mode">有弹幕</label>
            </div>
            <div class="postbird-box-footer"><button id="popup-player__cancel" class="btn-footer btn-left-footer btn-footer-cancel">取消</button><button id="popup-player__ok" class="btn-footer btn-right-footer btn-footer-ok">确定</button></div>
        </div></div>`;
    const host = getValidDom([".layout-Main", ".playerWrap__8wGvw", ".live-next-body"]) || document.body;
    host.insertBefore(prompt, host.firstChild);
}

function initPkg_PopupPlayer_Func() {
    const prompt = document.getElementById("popup-player__prompt");
    document.getElementById("popup-player__cancel").addEventListener("click", () => {
        prompt.style.display = "none";
    });
    document.getElementById("popup-player__ok").addEventListener("click", () => {
        const roomUrl = PopupPlayer_roomUrl(document.getElementById("popup-player__url").value);
        if (!roomUrl) {
            showMessage("请输入斗鱼房间号或直播间地址", "error");
            return;
        }
        if (document.getElementById("popup-player__noiframe").checked) {
            const room = new URL(roomUrl).pathname.replace(/\//g, "");
            if (/^\d+$/.test(room)) createNewVideo(videoPlayerArr.length, room, "Douyu");
            else getRealRid_Douyu(roomUrl, (roomId) => createNewVideo(videoPlayerArr.length, roomId, "Douyu"));
        } else {
            createNewVideo_iframe(videoPlayerArr.length, roomUrl);
        }
        prompt.style.display = "none";
    });
    prompt.addEventListener("keydown", (event) => {
        if (event.key === "Enter") document.getElementById("popup-player__ok").click();
        if (event.key === "Escape") prompt.style.display = "none";
    });
}

function createNewVideo(id, roomId, platform) {
    if (platform && platform !== "Douyu") return;
    if (!/^\d+$/.test(String(roomId))) return;
    createNewVideo_Douyu(id, roomId);
}

function PopupPlayer_destroy(id) {
    const player = videoPlayerArr[id];
    if (player && typeof player.destroy === "function") player.destroy();
    videoPlayerArr[id] = null;
}
function setElementVideo(id, l) {
    if (flvjs.isSupported()) {
        var videoElement = document.getElementById("exVideoPlayer" + String(id));
        var flvPlayer = flvjs.createPlayer({
            type: 'flv',
            url: l
        },{fixAudioTimestampGap: false});
        if (id > videoPlayerArr.length - 1) {
			videoPlayerArr.push(flvPlayer);
		} else {
			videoPlayerArr[id] = flvPlayer;
		}

        flvPlayer.attachMediaElement(videoElement);
        flvPlayer.load();
        flvPlayer.play();
    }
}

function setElementResize(id) {
    let box = document.getElementById("exVideoDiv" + String(id));

    let scale = document.getElementById("exVideoScale" + String(id));
    scale.onmousedown = function (e) {
        // 阻止冒泡,避免缩放时触发移动事件
        e.stopPropagation();
        e.preventDefault();
        let pos = {
            'w': box.offsetWidth,
            'h': box.offsetHeight,
            'x': e.clientX,
            'y': e.clientY
        };
        let w;
        let h;
        document.onmousemove = function (ev) {
            ev.stopPropagation();
            ev.preventDefault();
            w = Math.max(400, ev.clientX - pos.x + pos.w)
            h = Math.max(0, ev.clientY - pos.y + pos.h)
            w = w >= document.offsetWidth - box.offsetLeft ? document.offsetWidth - box.offsetLeft : w
            h = h >= document.offsetHeight - box.offsetTop ? document.offsetHeight - box.offsetTop : h
            box.style.width = w + 'px';
            box.style.height = h + 'px';
        }
        document.onmouseup = function (e) {
            e.stopPropagation();
            e.preventDefault();


            document.onmousemove = null;
            document.onmouseup = null;
        }
    }

}

function setElementDrag(id) {
    let box = document.getElementById("exVideoDiv" + String(id));
    box.onmousedown = function (event) {
        event.stopPropagation();
        let xx = event.clientX - box.offsetLeft;
        let yy = event.clientY - box.offsetTop;
        let mouseX;
        let mouseY;
        document.onmousemove = function (event) {
            event.stopPropagation();
            mouseX = event.clientX - xx;
            mouseY = event.clientY - yy;
            box.style.left = mouseX + "px";
            box.style.top = mouseY + "px";
        }
        document.onmouseup = function (event) {
            event.stopPropagation();
            document.onmousemove = null;
            document.onmouseup = null;
        }
    }
}



// Douyu
function createNewVideo_Douyu(id, rid) {
    getRealLive_Douyu(rid, true, false, "1", (lurl) => {
        if (lurl && lurl !== "None") {
            if (lurl == "None") {
                showMessage("房间未开播或其他错误", "error");
                return;
            }
            let lurl_host_arr = String(lurl).split("/live");
            let lurl_host = "";
            if (lurl_host_arr.length > 0) {
                lurl_host = lurl_host_arr[0];
            }
            let a = document.createElement("div");
            let html = "";
            a.id = "exVideoDiv" + String(id);
            a.rid = rid;
            a.className = "exVideoDiv";
            html += "<div class='exVideoInfo' id='exVideoInfo" + String(id) + "'><a title='进入直播间' target='_blank' href='https://www.douyu.com/" + rid + "'><span class='exVideoRID' id='exVideoRID" + String(id) + "' style='color:white'>" + "斗鱼 - " + rid + "</span></a>";
            html += "<select class='exVideoQn' id='exVideoQn" + String(id) + "'><option value='2'>高清</option><option value='3'>超清</option><option value='4'>蓝光4M</option><option value='8'>蓝光8M</option></option><option value='0'>原画</option></select>";
            html += "<select style='display:none' class='exVideoCDN' id='exVideoCDN" + String(id) + "'><option value='1'>主线路</option><option value='2'>备用线路5</option><option value='3'>备用线路6</option></select>";
            html += "<a style='margin-left:5px' href='" + lurl_host + "' target='_blank'>无视频？</a>";
            html += `<input id='exVideoEmbed${String(id)}' type='button' value='嵌入视频' style='height:30px;'>`;
            html += `<input id='exVideoUnEmbed${String(id)}' type='button' value='恢复视频' style='height:30px;display:none;'>`;
            html += `<input id='exVideoCopy${String(id)}' type='button' value='复制直播流' style='height:30px;'>`;
            html += "<a><div class='exVideoClose' id='exVideoClose" + String(id) + "'>X</div></a>";
            html += "</div>";
            html += "<video controls='controls' class='exVideoPlayer' id='exVideoPlayer" + String(id) + "'></video><div class='exVideoScale' id='exVideoScale" + String(id) + "'></div>";
            a.innerHTML = html;
            let b = getValidDom([".layout-Main", ".playerWrap__8wGvw", ".live-next-body"]);
            b.insertBefore(a, b.childNodes[0]);
            setElementDrag(id);
            setElementResize(id);
            setElementFunc_Douyu(id, rid);
            setElementVideo(id, lurl);
        }
    });
}


function setElementFunc_Douyu(id, rid) {
    let box = document.getElementById("exVideoDiv" + String(id));
    let exVideoPlayer = document.getElementById("exVideoPlayer" + String(id));
    let info = document.getElementById("exVideoInfo" + String(id));
    let scale = document.getElementById("exVideoScale" + String(id));
    let exVideoEmbed = document.getElementById("exVideoEmbed" + String(id));
    let exVideoUnEmbed = document.getElementById("exVideoUnEmbed" + String(id));
    let originVideo = document.getElementById("__video2");
    exVideoPlayer.onclick = function(e) {
        e.stopPropagation();
        e.preventDefault();
        if (scale.style.display != "block") {
            scale.style.display = "block";
            info.style.display = "block";
        } else {
            scale.style.display = "none";
            info.style.display = "none";
        }
        for (let i = 0; i < videoPlayerArr.length; i++) {
            let box = document.getElementById("exVideoDiv" + String(i));
            if (box != null) {
                if (i == id) {
                    box.style.zIndex = 1016;
                } else {
                    box.style.zIndex = 1428;
                }
            }
        }
    }
    let exVideoQn = document.getElementById("exVideoQn" + String(id));
    let exVideoCDN = document.getElementById("exVideoCDN" + String(id));
    let exVideoClose = document.getElementById("exVideoClose" + String(id));
    exVideoQn.onchange = function() {
        getRealLive_Douyu(rid, true, false, exVideoQn.value, (lurl) => {
            PopupPlayer_destroy(id);
            setElementVideo(id, lurl);
        })
    }
    exVideoCDN.onchange = function() {
        getRealLive_Douyu(rid, true, false, exVideoQn.value, (lurl) => {
			PopupPlayer_destroy(id);
            setElementVideo(id, lurl);
        })
    }
    exVideoClose.onclick = function() {
        if (originVideo) originVideo.style.display = "block";
        PopupPlayer_destroy(id);
        exVideoPlayer.remove();
        box.remove();
    }

    let exVideoCopy = document.getElementById("exVideoCopy" + String(id)) || document.getElementById("exVideoRID" + String(id));
    if (exVideoCopy) {
        exVideoCopy.onclick = function() {
            getRealLive_Douyu(rid, !exVideoCopy.innerHTML.includes("斗鱼音频流"), false, exVideoQn.value, (lurl) => {
                GM_setClipboard(String(lurl).replace("https", "http"));
                showMessage("复制成功", "success");
            })
        }
    }
    if (exVideoEmbed) {
        exVideoEmbed.onclick = function() {
            if (!originVideo) return;
            originVideo.style.display = "none";
            exVideoEmbed.style.display = "none";
            exVideoUnEmbed.style.display = "inline";
            box.style.height = "0px";
            originVideo.parentElement.insertBefore(exVideoPlayer, originVideo);
        }
    }
    if (exVideoUnEmbed && originVideo) {
        exVideoUnEmbed.onclick = function() {
            if (originVideo) originVideo.style.display = "block";
            exVideoUnEmbed.style.display = "none";
            exVideoEmbed.style.display = "inline";
            box.style.height = "250px";
            box.insertBefore(exVideoPlayer, box.childNodes[box.childNodes.length - 1]);
        }
    }
}

function createNewAudio_Douyu(id, rid) {
    getRealLive_Douyu(rid, false, true, "1", (lurl) => {
        if (lurl && lurl !== "None") {
            if (lurl == "None") {
                showMessage("房间未开播或其他错误", "error");
                return;
            }
            let lurl_host_arr = String(lurl).split("/live");
            let lurl_host = "";
            if (lurl_host_arr.length > 0) {
                lurl_host = lurl_host_arr[0];
            }
            let a = document.createElement("div");
            let html = "";
            a.id = "exVideoDiv" + String(id);
            a.rid = rid;
            a.className = "exVideoDiv";
            html += "<div class='exVideoInfo' id='exVideoInfo" + String(id) + "'><a title='复制直播流地址'><span class='exVideoRID' id='exVideoRID" + String(id) + "' style='color:white'>" + "斗鱼音频流 - " + rid + "</span></a>";
            html += "<select style='display:none' class='exVideoQn' id='exVideoQn" + String(id) + "'><option value='1'>流畅</option><option value='2'>高清</option><option value='3'>超清</option><option value='0'>蓝光</option></select>";
            html += "<select style='display:none' class='exVideoCDN' id='exVideoCDN" + String(id) + "'><option value='1'>主线路</option><option value='2'>备用线路5</option><option value='3'>备用线路6</option></select>";
            html += "<a style='margin-left:5px;display:none' href='" + lurl_host + "' target='_blank'>无视频？</a>";
            html += "<a><div class='exVideoClose' id='exVideoClose" + String(id) + "'>X</div></a>";
            html += "</div>";
            html += "<video controls='controls' class='exVideoPlayer' id='exVideoPlayer" + String(id) + "'></video><div class='exVideoScale' id='exVideoScale" + String(id) + "'></div>";
            a.innerHTML = html;
            let b = getValidDom([".layout-Main", ".playerWrap__8wGvw", ".live-next-body"]);
            b.insertBefore(a, b.childNodes[0]);
            setElementDrag(id);
            setElementResize(id);
            setElementFunc_Douyu(id, rid);
            setElementVideo(id, lurl);
        }
    });
}


// iframe
function createNewVideo_iframe(id, url) {
    url = PopupPlayer_roomUrl(url);
    if (!url) {
        showMessage("有弹幕模式仅支持斗鱼直播", "error");
        return;
    }
    let rid_arr = String(url).split("/");
    let rid = rid_arr[rid_arr.length - 1];
    let a = document.createElement("div");
    let html = "";
    a.id = "exVideoDiv" + String(id);
    a.rid = rid;
    a.className = "exVideoDiv";
    html += "<div class='exVideoInfo' id='exVideoInfo" + String(id) + "'><span class='exVideoRID' id='exVideoRID" + String(id) + "' style='color:white'>" + "斗鱼 - " + rid + "</span>";
    html += "<a><div class='exVideoClose' id='exVideoClose" + String(id) + "'>X</div></a>"
    html += "</div>";
    html += "<iframe class='exVideoPlayer' id='exVideoPlayer" + String(id) + "' src=\"" + url + "?exid=chun\"></iframe>"
    html += "<div class='exVideoScale' id='exVideoScale" + String(id) + "'></div>";
    a.innerHTML = html;
    let b = getValidDom([".layout-Main", ".playerWrap__8wGvw", ".live-next-body"]);
    b.insertBefore(a, b.childNodes[0]);
    setElementDrag(id);
    setElementResize(id);
    if (id > videoPlayerArr.length - 1) {
        videoPlayerArr.push("iframe");
    } else {
        videoPlayerArr[id] = "iframe";
    }
    setElementFunc_iframe(id);
}

function setElementFunc_iframe(id) {
    let box = document.getElementById("exVideoDiv" + String(id));
    let exVideoClose = document.getElementById("exVideoClose" + String(id));
    exVideoClose.onclick = function() {
        PopupPlayer_destroy(id);
        box.remove();
    }
    box.onclick = function(e) {
        e.stopPropagation();
        e.preventDefault();
        for (let i = 0; i < videoPlayerArr.length; i++) {
            let box = document.getElementById("exVideoDiv" + String(i));
            if (box != null) {
                if (i == id) {
                    box.style.zIndex = 1016;
                } else {
                    box.style.zIndex = 1428;
                }
            }
        }
    }
}
