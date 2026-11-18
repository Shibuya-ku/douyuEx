let myLastBarrage = ""; // 浏览器弹幕框中的最后一条自己的弹幕内容
let barrageSendCheckTimer = 0;
let barrageSendCheckInitialized = false;
async function initPkg_LiveTool_BarrageSendCheck() {
  if (barrageSendCheckInitialized) return;
  barrageSendCheckInitialized = true;
  try {
    myName = await getUserName();
  } catch (error) {
    barrageSendCheckInitialized = false;
    throw error;
  }
  let timer = setInterval(() => {
    if (document.getElementById("js-barrage-list")) {
      clearInterval(timer);
      new DomHook("#js-barrage-list", false, (m) => {
        if (m.length <= 0) return;
        if (m[0].addedNodes.length <= 0) return;
        let dom = m[0].addedNodes[0];
        if (!dom || !dom.getElementsByClassName) return;
        let isSelf = dom.getElementsByClassName("is-self").length > 0;
        if (!isSelf) return;
        const contentDom = dom.getElementsByClassName("Barrage-content");
        if (!contentDom || (contentDom && contentDom.length === 0)) return;
        let localLastBarrage = contentDom[0].innerText.trim();
        clearTimeout(barrageSendCheckTimer);
        barrageSendCheckTimer = setTimeout(() => {
          if (myLastBarrage !== "" && localLastBarrage !== "") {
            let data = stt_deserialize(myLastBarrage);
            if (!data.txt) return;
            if (data.txt.includes(`[DouyuEx图片`)) {
              data.txt = data.txt.replace(/\[DouyuEx图片[^\]]+\]/g, "").trim();
            }
            if (data.txt.replace(/\s+/g, " ") !== localLastBarrage.replace(/\s+/g, " ")) {
              let contentDom = dom.getElementsByClassName("Barrage-content")[0];
              if (!contentDom) return;
              contentDom.style.textDecoration = "line-through gray 1px";
              if (contentDom && contentDom.parentNode) {
                contentDom.parentNode.insertBefore(createBarrageFailDom(), contentDom.nextSibling);
              }
            }
          }
        }, 300);
      });
    }
  }, 1000);
}

function createBarrageFailDom() {
  let span = document.createElement("span");
  span.textContent = "(可能发送失败)";
  span.style.marginLeft = "4px";
  span.style.color = "gray";
  span.style.fontSize = "9px";
  span.style.cursor = "point";
  span.title = "该条弹幕发送失败，不会被其他人看到（可能会误判）";
  return span;
}

function initPkg_LiveTool_BarrageSendCheck_Handle(text) {
  if (getType(text) == "chatmsg") {
    if (!myName || stt_deserialize(text).nn !== myName) return;
    myLastBarrage = text;
  }
}
