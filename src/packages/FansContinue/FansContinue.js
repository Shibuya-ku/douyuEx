function initPkg_FansContinue() {
  if (document.querySelector('.fans-continue')) return;
  initPkg_FansContinue_Dom();
  initPkg_FansContinue_Func();
}

function initPkg_FansContinue_Dom() {
  FansContinue_insertIcon();
}
function FansContinue_insertIcon() {
  let a = document.createElement("div");
  a.className = "fans-continue";
  a.innerHTML =
    '<a class="ex-panel__icon" title="一键续牌"><img style="width: 32px;height: 32px;" src="https://gfs-op.douyucdn.cn/dygift/1705/7db9beee246848252f1c7fe916259f4e.png"/><i id="fans-continue__tip" class="ex-panel__tip"></i></a>';

  let b = document.getElementsByClassName("ex-panel__wrap")[0];
  b.insertBefore(a, b.childNodes[0]);
}

let fansContinueRunning = false;

function initPkg_FansContinue_Func() {
  document.getElementsByClassName("fans-continue")[0].addEventListener("click", function () {
    if (fansContinueRunning) {
      showMessage("【续牌】上一轮仍在执行，请稍候", "info");
      return;
    }
    const saved = localStorage.getItem("ExSave_FansContinue");
    PostbirdAlertBox.prompt({
      title: "每个直播间赠送几根荧光棒？(输入0则平均赠送)",
      okBtn: "确定",
      cancelBtn: "取消",
      defaultValue: saved != null ? saved : "1",
      contentColor: "rgb(51,51,51)",
      onConfirm: function (value) {
        if (value == null) return;
        const text = String(value).trim();
        const quantity = Number(text);
        if (!/^\d+$/.test(text) || !Number.isSafeInteger(quantity)) {
          showMessage("【续牌】请输入非负整数", "error");
          return;
        }
        localStorage.setItem("ExSave_FansContinue", String(quantity));
        return FansContinue_startSend(quantity);
      },
      onCancel: function () {}
    });
  });
}

async function FansContinue_startSend(quantity) {
  if (fansContinueRunning) return;
  if (!Number.isSafeInteger(quantity) || quantity < 0) {
    showMessage("【续牌】请输入非负整数", "error");
    return;
  }
  fansContinueRunning = true;
  try {
    const bag = await getBagGifts(rid);
    const gifts = bag?.data?.list;
    if (!Array.isArray(gifts)) throw new Error(bag?.msg || "无法获取背包，请确认已登录");
    const gift = gifts.find(item => (item.id == 268 || item.id == 2358) && Number(item.count) > 0);
    if (!gift) {
      showMessage("【续牌】背包中没有荧光棒", "error");
      return;
    }
    const count = Number(gift.count);
    if (!Number.isSafeInteger(count)) throw new Error("背包数量无效");
    const rooms = await getFansBadgeRooms();
    if (!rooms.length) {
      showMessage("【续牌】没有可续牌的房间", "info");
      return;
    }
    const sendNum = quantity === 0 ? Math.floor(count / rooms.length) : quantity;
    if (sendNum < 1) {
      showMessage("【续牌】荧光棒不足，请减少数量或调整平均分配", "error");
      return;
    }
    let remaining = count;
    for (let index = 0; index < rooms.length; index++) {
      if (remaining < sendNum) {
        showMessage(`【续牌】荧光棒不足以赠送每房间 ${sendNum} 根，已跳过剩余 ${rooms.length - index} 个房间`, "warning");
        break;
      }
      const roomId = rooms[index];
      await sleep(250);
      try {
        const data = await sendGift_bag(gift.id, sendNum, roomId);
        if (data.msg === "success") {
          remaining -= sendNum;
          showMessage(`【续牌】${roomId}赠送荧光棒成功`, "success");
        } else {
          showMessage(`【续牌】${roomId}赠送失败 ${data.msg || "请求未成功"}`, "error");
        }
      } catch (error) {
        showMessage(`【续牌】${roomId}赠送失败`, "error");
        console.warn("【续牌】赠送失败", error);
      }
    }
  } catch (error) {
    showMessage(`【续牌】${error.message || "请求失败"}`, "error");
  } finally {
    fansContinueRunning = false;
  }
}

function sendGift_bag(giftId, quantity, roomId) {
  return signFetch("https://www.douyu.com/japi/prop/donate/mainsite/v1", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "propId=" + giftId + "&propCount=" + quantity + "&roomId=" + roomId + "&bizExt=%7B%22yzxq%22%3A%7B%7D%7D"
  });
}
