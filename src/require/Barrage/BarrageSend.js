// Shared by manual +1/reply actions; no automatic or repeated sending.
function sendBarrage(text) {
    const chat = document.getElementsByClassName("ChatSend-txt")[0];
    const send = document.getElementsByClassName("ChatSend-button")[0];
    if (!chat || !send) return false;
    if (chat.tagName === "TEXTAREA") chat.value = text;
    else chat.innerText = text;
    send.click();
    return true;
}
