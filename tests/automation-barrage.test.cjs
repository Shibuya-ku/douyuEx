const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { PacketDecoder, BarrageReceipt } = require("../automation/barrage-receipt.cjs");

function packet(text) {
  const body = Buffer.from(text + "\0");
  const buffer = Buffer.alloc(12 + body.length);
  buffer.writeUInt32LE(buffer.length - 4, 0); buffer.writeUInt32LE(buffer.length - 4, 4);
  buffer.writeUInt16LE(690, 8); body.copy(buffer, 12);
  return buffer;
}
function setup() {
  const page = new EventEmitter(), socket = new EventEmitter();
  const receipt = new BarrageReceipt(page);
  page.emit("websocket", socket);
  return { receipt, socket, emit: (direction, text) => socket.emit(direction, { payload: packet(text) }) };
}

test("decoder supports concatenated packets, split UTF-8 frames and escaped STT fields", () => {
  const d = new PacketDecoder();
  const bytes = Buffer.concat([packet("content@=嗯嗯对对/type@=chatmessage/sender@=7/"), packet("type@=chatmsg/txt@=a@Sb@AAS/uid@=7/")]);
  assert.deepEqual(d.push(bytes.subarray(0, 18)), []);
  const messages = d.push(bytes.subarray(18));
  assert.equal(messages[0].content, "嗯嗯对对");
  assert.equal(messages[1].txt, "a/b@AS");
  assert.deepEqual(d.push(Buffer.alloc(16)), []);
});

test("only the outgoing message and server acknowledgment on its socket confirm sending", async () => {
  const { receipt, socket, emit } = setup();
  const wait = receipt.arm("嗯嗯对对", "7", 1000);
  emit("framereceived", "type@=chatres/res@=0/");
  assert.equal(receipt.active.socket, null);
  emit("framesent", "content@=other/type@=chatmessage/sender@=7/");
  assert.equal(receipt.active.socket, null);
  emit("framesent", "content@=嗯嗯对对/type@=chatmessage/sender@=7/");
  receipt.received({}, { type: "chatres", res: "0" });
  assert.equal(receipt.active.socket, socket);
  emit("framereceived", "type@=chatres/res@=0/");
  assert.equal((await wait.promise).result, "server_ack");
});

test("matching message from another account cannot be used as delivery proof", async () => {
  const { receipt, emit } = setup();
  const wait = receipt.arm("嗯嗯对对", "7", 1000);
  emit("framesent", "type@=chatmessage/content@=嗯嗯对对/sender@=7/");
  emit("framereceived", "type@=chatmsg/txt@=嗯嗯对对/uid@=8/");
  assert.ok(receipt.active);
  emit("framereceived", "type@=chatmsg/txt@=嗯嗯对对/uid@=7/");
  assert.equal((await wait.promise).result, "own_message_echo");
});

test("negative acknowledgments and missing replies fail without another send", async () => {
  const { receipt, emit } = setup();
  const rejected = receipt.arm("嗯嗯对对", "7", 1000);
  emit("framesent", "type@=chatmessage/content@=嗯嗯对对/sender@=7/");
  emit("framereceived", "type@=chatres/res@=308/");
  await assert.rejects(rejected.promise, /308/);
  const timeout = receipt.arm("嗯嗯对对", "7", 5);
  await assert.rejects(timeout.promise, /禁止自动重发/);
  assert.equal(receipt.active, null);
});
