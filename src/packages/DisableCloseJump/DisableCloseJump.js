let disableCloseJumpTimer = null;
function initPkg_DisableCloseJump_Timer() {
  if (disableCloseJumpTimer !== null) return;
  disableCloseJumpTimer = setInterval(() => {
    const x = document.querySelector(".ClosingRecommend .dy-ModalRadius-close-x");
    if (!x) return;
    x.click();
  }, 1000);
}
