function getImageDanmakuHtml(str) {
  if (!/^[a-z0-9]+\.[a-z]+$/i.test(str) || !isValidImageFile(str)) return "";
  const split = str.split(".");
  const url = decompressImageUrl(split[0]);
  const realImageUrl = DOMPurify.sanitize(`https://img.douyucdn.cn/data/yuba/weibo/${url.slice(0, 4) + "/" + url.slice(4, 6) + "/" + url.slice(6, 8) + "/" + url}.200x0.${split[1]}`);
  const imgHtml = `<a href="${realImageUrl.replace("200x0.", "")}" target="_blank"><img class="ex-image-danmaku" src="${realImageUrl}" alt=""></a>`;
  return DOMPurify.sanitize(imgHtml);
}

function compressImageUrl(text) {
  let number = BigInt(text);
  return number.toString(36);
}

function decompressImageUrl(base36Str) {
  const base36Chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let decimal = 0n;
  let multiplier = 1n;

  for (let i = base36Str.length - 1; i >= 0; i--) {
    const char = base36Str[i].toUpperCase();
    const charIndex = base36Chars.indexOf(char);
    if (charIndex === -1) {
      throw new Error(`Invalid base36 character: ${char}`);
    }
    decimal += BigInt(charIndex) * multiplier;
    multiplier *= 36n;
  }

  return decimal.toString();
}

function getImageDanmakuFromImgSrc(src) {
  const split = src.split("/");
  const url = split.pop();
  const split2 = url.split(".");
  return `[DouyuEx图片${compressImageUrl(split2[0])}.${split2[2]}]`;
}
