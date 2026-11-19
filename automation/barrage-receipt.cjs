"use strict";

function parseFields(text) {
  const fields = {};
  const decode = s => s.replace(/@S/g, "/").replace(/@A/g, "@");
  for (const field of text.split("/")) {
    const split = field.indexOf("@=");
    if (split > 0) fields[decode(field.slice(0, split))] = decode(field.slice(split + 2));
  }
  return fields;
}

// Douyu STT frames: repeated little-endian packet length, 4-byte protocol header,
// then UTF-8 fields and a terminating zero. A WebSocket frame may contain several packets.
class PacketDecoder {
  constructor() { this.pending = Buffer.alloc(0); }
  push(payload) {
    if (typeof payload === "string" && payload.includes("@=")) {
      return payload.split("\0").filter(Boolean).map(parseFields);
    }
    this.pending = Buffer.concat([this.pending, Buffer.from(payload)]);
    const result = [];
    while (this.pending.length >= 12) {
      const length = this.pending.readUInt32LE(0);
      if (length < 9 || length > 8 * 1024 * 1024 || length !== this.pending.readUInt32LE(4)) {
        this.pending = Buffer.alloc(0); break;
      }
      if (this.pending.length < length + 4) break;
      const body = this.pending.subarray(12, length + 4).toString("utf8").replace(/\0+$/, "");
      result.push(parseFields(body));
      this.pending = this.pending.subarray(length + 4);
    }
    return result;
  }
}

class BarrageReceipt {
  constructor(page) {
    this.active = null;
    page.on("websocket", socket => {
      const outgoing = new PacketDecoder(), incoming = new PacketDecoder();
      socket.on("framesent", ({ payload }) => outgoing.push(payload).forEach(m => this.sent(socket, m)));
      socket.on("framereceived", ({ payload }) => incoming.push(payload).forEach(m => this.received(socket, m)));
    });
  }
  arm(message, uid, timeout = 20000) {
    if (this.active) throw new Error("已经存在待核验弹幕");
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    // Attach a handler now so a delayed click cannot cause an unhandled rejection.
    promise.catch(() => {});
    const timer = setTimeout(() => this.finish(new Error("弹幕发送回执未确认，禁止自动重发")), timeout);
    this.active = { message, uid: String(uid), socket: null, resolve, reject, timer };
    return { promise, cancel: () => this.finish(new Error("弹幕点击未完成，禁止自动重发")) };
  }
  sent(socket, fields) {
    const a = this.active;
    if (a && fields.type === "chatmessage" && fields.content === a.message && String(fields.sender) === a.uid) a.socket = socket;
  }
  received(socket, fields) {
    const a = this.active;
    if (!a?.socket) return;
    if (fields.type === "chatmsg" && String(fields.uid) === a.uid && fields.txt === a.message) {
      this.finish(null, { transport: "websocket", result: "own_message_echo" });
    } else if (socket === a.socket && fields.type === "chatres" && /^\d+$/.test(fields.res || "")) {
      const code = Number(fields.res);
      if (code === 0) this.finish(null, { transport: "websocket", result: "server_ack", code });
      else this.finish(new Error(`弹幕服务器返回错误码 ${code}`));
    }
  }
  finish(error, value) {
    const a = this.active;
    if (!a) return;
    this.active = null; clearTimeout(a.timer);
    if (error) a.reject(error); else a.resolve(value);
  }
}

module.exports = { PacketDecoder, parseFields, BarrageReceipt };
