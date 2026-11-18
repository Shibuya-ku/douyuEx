const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const pipDir = 'src/packages/VideoTools/PictureInPictureControl/';

// Run the actual module functions. Browser events, canvas, media tracks and GIF
// encoding are substitutes; these checks do not claim browser codec coverage.
class Node {
  constructor() { this.children = []; this.style = {}; this.listeners = {}; this.className = ''; this.id = ''; }
  appendChild(node) { this.children.push(node); node.parentNode = this; return node; }
  removeChild(node) { const i = this.children.indexOf(node); if (i >= 0) this.children.splice(i, 1); node.parentNode = null; }
  remove() { this.parentNode?.removeChild(this); this.isConnected = false; }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] || []).filter((item) => item !== fn); }
  dispatch(type, event = {}) { for (const fn of [...this.listeners[type] || []]) fn(event); }
  dispatchEvent(event) { this.dispatch(event.type, event); }
  getElementById(id) { return this.children.find((node) => node.id === id) || null; }
  getElementsByClassName(name) { return this.children.filter((node) => node.className === name); }
  querySelector() { return null; }
  querySelectorAll() { return []; }
}

function environment() {
  const doc = new Node();
  doc.body = new Node();
  const intervals = new Map(), timeouts = new Map(), rafs = new Map();
  const clock = { now: 100000 };
  let nextId = 1;
  class FakeDate extends Date {
    constructor(...args) { super(...(args.length ? args : [clock.now])); }
    static now() { return clock.now; }
  }
  const context = vm.createContext({
    window: Object.assign(new Node(), { __pip_is_active__: true, __pip_track_state__: [] }),
    document: doc, console: { log() {}, error() {} },
    Date: FakeDate, performance: { now: () => clock.now },
    setInterval: (fn, ms) => { const id = nextId++; intervals.set(id, { fn, ms }); return id; },
    clearInterval: (id) => intervals.delete(id),
    setTimeout: (fn, ms) => { const id = nextId++; timeouts.set(id, { fn, ms }); return id; },
    clearTimeout: (id) => timeouts.delete(id),
    requestAnimationFrame: (fn) => { const id = nextId++; rafs.set(id, fn); return id; },
    cancelAnimationFrame: (id) => rafs.delete(id),
    navigator: { userAgent: 'Test browser' },
    localStorage: { getItem: () => null, setItem() {} },
    showMessage() {}, dateFormat: () => '2026-11-17', my_uid: '',
    PictureInPictureControl_toggleSourcePagePower() {}, PictureInPictureControl_toggleMainVideoVisibility() {},
  });
  return {
    context, doc, intervals, timeouts, rafs, clock,
    load(file) { vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file }); },
    run(code) { return vm.runInContext(code, context); },
    interval(ms) { const entry = [...intervals.values()].find((value) => value.ms === ms); assert.ok(entry, 'Expected ' + ms + 'ms interval'); entry.fn(); },
    frame() { const [id, fn] = [...rafs.entries()][0] || []; assert.ok(fn, 'Expected next animation frame'); rafs.delete(id); fn(); },
  };
}

function loadPip(env) {
  env.load(pipDir + 'PictureInPictureControlCore.js');
  env.load(pipDir + 'PictureInPictureControl.js');
  // These two page-only effects live in a separate module. The tested cleanup
  // must still invoke them; media/timer/event cleanup is the real implementation.
  const effects = { power: [], visibility: [], socket: 0 };
  env.context.PictureInPictureControl_toggleSourcePagePower = (enabled) => effects.power.push(enabled);
  env.context.PictureInPictureControl_toggleMainVideoVisibility = (enabled) => effects.visibility.push(enabled);
  env.context.PictureInPictureControl_closePipWebSocket = () => effects.socket++;
  return effects;
}

test('合并计数每秒清理八秒窗口，过期后相同文字恢复普通弹幕', () => {
  const env = environment(); loadPip(env);
  let rendered = 0, refreshed = 0;
  env.context.PictureInPictureControl_renderDanmaku = () => rendered++;
  env.context.PictureInPictureControl_refreshComboDisplay = () => refreshed++;
  const msg = { text: '测试弹幕', uid: 'someone', color: 0 };
  env.context.PictureInPictureControl_handleComboAndRender(msg, {}, {});
  env.clock.now += 100;
  env.context.PictureInPictureControl_handleComboAndRender(msg, {}, {});
  assert.equal(rendered, 1);
  assert.equal(env.run('comboMap.size'), 1);
  env.context.PictureInPictureControl_startComboCleaner();
  env.context.PictureInPictureControl_startComboCleaner();
  assert.deepEqual([...env.intervals.values()].map(({ ms }) => ms), [1000]);
  env.clock.now += 8001; env.interval(1000);
  assert.equal(env.run('comboMap.size'), 0);
  env.context.PictureInPictureControl_handleComboAndRender(msg, {}, {});
  assert.equal(rendered, 2);
  assert.ok(refreshed >= 4);
});

function setupPip(env) {
  const effects = loadPip(env);
  const tracks = [{ stopped: 0, stop() { this.stopped++; } }, { stopped: 0, stop() { this.stopped++; } }];
  const video = Object.assign(new Node(), { paused: false });
  const pipVideo = {
    srcObject: { getTracks: () => tracks }, plays: 0, pauses: 0,
    play() { this.plays++; return Promise.resolve(); }, pause() { this.pauses++; },
  };
  const pipWindow = Object.assign(new Node(), { closed: false, document: new Node(), close() { this.closed = true; } });
  env.context.window.__pip_window__ = pipWindow;
  env.context.PictureInPictureControl_bindVideoSync(video, pipVideo);
  env.context.PictureInPictureControl_bindCleanup(video, pipWindow, pipVideo);
  env.context.PictureInPictureControl_startComboCleaner();
  return { effects, tracks, video, pipVideo, pipWindow };
}

function assertClean(env, setup) {
  const { effects, tracks, video, pipVideo, pipWindow } = setup;
  assert.deepEqual(tracks.map((track) => track.stopped), [1, 1]);
  assert.equal(pipVideo.srcObject, null);
  assert.equal(env.context.window.__pip_is_active__, false);
  assert.equal(env.context.window.__pip_window__, null);
  assert.equal(env.run('comboCleanerTimer'), null);
  assert.equal(env.intervals.size, 0);
  assert.equal(env.timeouts.size, 0);
  assert.equal(video.listeners.play.length, 0);
  assert.equal(video.listeners.pause.length, 0);
  assert.equal(pipWindow.listeners.pagehide.length, 0);
  assert.deepEqual(effects.power, [false]);
  assert.deepEqual(effects.visibility, [false]);
  assert.equal(effects.socket, 1);
}

test('PiP 窗口关闭兜底每2秒检测，停止媒体轨道和合并任务并解绑播放事件', () => {
  const env = environment(); const setup = setupPip(env);
  env.context.PictureInPictureControl_bindVideoSync(setup.video, setup.pipVideo);
  env.context.PictureInPictureControl_bindCleanup(setup.video, setup.pipWindow, setup.pipVideo);
  assert.equal(setup.video.listeners.play.length, 1);
  assert.equal(setup.pipWindow.listeners.pagehide.length, 1);
  assert.deepEqual([...env.intervals.values()].map(({ ms }) => ms).sort(), [1000, 2000]);
  setup.video.dispatch('play'); assert.equal(setup.pipVideo.plays, 1);
  setup.video.paused = true; setup.video.dispatch('pause'); assert.equal(setup.pipVideo.pauses, 1);
  setup.pipWindow.closed = true; env.interval(2000);
  assertClean(env, setup);
});

test('PiP pagehide 立即清理；旧窗口的迟到清理不能关闭新窗口', () => {
  const env = environment(); const setup = setupPip(env);
  const oldWindow = Object.assign(new Node(), { document: new Node() });
  env.context.PictureInPictureControl_cleanupEnhancedPip(oldWindow, { srcObject: null });
  assert.equal(env.context.window.__pip_is_active__, true);
  assert.equal(env.intervals.size, 2);
  setup.pipWindow.dispatch('pagehide');
  assertClean(env, setup);
  env.context.PictureInPictureControl_cleanupEnhancedPip(setup.pipWindow, setup.pipVideo);
  assert.deepEqual(setup.tracks.map((track) => track.stopped), [1, 1]);
});

test('PiP 唤醒期间退出窗口，不重新捕获视频流', async () => {
  const env = environment(); loadPip(env);
  let release, captures = 0;
  env.context.PictureInPictureControl_wakeSourceVideo = () => new Promise((resolve) => { release = resolve; });
  const video = { captureStream() { captures++; return {}; } };
  const pipWindow = { closed: false, __pip_source_video__: video };
  const pending = env.context.PictureInPictureControl_reloadPipVideo(pipWindow, {});
  pipWindow.closed = true;
  release(true);
  assert.equal(await pending, false);
  assert.equal(captures, 0);
});

function cameraEnvironment() {
  const env = environment();
  const gifs = [], revoked = [], downloads = [], draws = [];
  const camera = Object.assign(new Node(), { id: 'ex-camera' });
  const close = Object.assign(new Node(), { id: 'ex-camera-close' });
  const area = new Node(), box = Object.assign(new Node(), { className: 'room-Player-Box' });
  env.doc.children.push(camera, close, box);
  const makeCanvas = () => {
    const canvas = new Node();
    canvas.getContext = () => ({ drawImage(video) { canvas.frame = video.frame; draws.push(video.frame); } });
    canvas.toDataURL = () => 'data:image/png;base64,frame' + canvas.frame;
    return canvas;
  };
  env.doc.createElement = (tag) => {
    if (tag === 'canvas') return makeCanvas();
    const node = new Node();
    node.dispatchEvent = () => downloads.push(node.href);
    return node;
  };
  env.doc.createEvent = () => ({ initEvent() {} });
  env.context.Blob = Blob;
  env.context.URL = {
    createObjectURL: () => 'blob:generated-' + downloads.length,
    revokeObjectURL: (url) => revoked.push(url),
  };
  env.context.GIF = class {
    constructor(options) { this.options = options; this.frames = []; this.aborts = 0; this.renders = 0; this.events = {}; gifs.push(this); }
    addFrame(canvas, options) { this.frames.push({ frame: canvas.frame, delay: options.delay, copy: options.copy }); }
    abort() { this.aborts++; }
    on(name, callback) { this.events[name] = callback; }
    render() { this.renders++; this.events.finished({ type: 'image/gif' }); }
  };
  env.context.getValidDom = () => area;
  env.context.confirm = () => false;
  env.load('src/packages/VideoTools/Camera/index.js');
  env.load('src/packages/VideoTools/Camera/Main/Camera.js');
  env.context.liveVideoNode = { frame: 1, videoWidth: 1920, videoHeight: 1080 };
  env.context.camera_canvas = makeCanvas(); env.context.camera_canvas_img = makeCanvas();
  env.context.camera_width = 480; env.context.camera_height = 270; env.context.camera_anchorName = '主播';
  env.context.initPkg_VideoTools_Camera_Func();
  return { ...env, gifs, revoked, downloads, draws, camera };
}

test('长按截图连续捕获多帧，松开结束采帧并延迟释放GIF URL', () => {
  const env = cameraEnvironment();
  env.camera.dispatch('mousedown', { target: env.camera });
  assert.equal(env.gifs.length, 1);
  for (let frame = 2; frame <= 12; frame++) {
    env.context.liveVideoNode.frame = frame; env.clock.now += 83; env.interval(83);
  }
  env.doc.dispatch('mouseup', { target: env.camera });
  assert.equal(env.gifs[0].frames.length, 12);
  assert.deepEqual(env.gifs[0].frames.map((entry) => entry.frame), Array.from({ length: 12 }, (_, i) => i + 1));
  assert.ok(env.gifs[0].frames.every((entry) => entry.copy && entry.delay === 83));
  assert.equal(env.gifs[0].renders, 1);
  assert.equal(env.intervals.size, 0);
  assert.match(env.downloads[0], /^blob:/);
  const revokeTimer = [...env.timeouts.values()].find((entry) => entry.ms === 1500);
  assert.ok(revokeTimer); revokeTimer.fn(); assert.equal(env.revoked.length, 1);
});

test('短按输出PNG而非GIF，并停止临时采帧', () => {
  const env = cameraEnvironment();
  env.camera.dispatch('mousedown', { target: env.camera });
  env.clock.now += 200;
  env.doc.dispatch('mouseup', { target: env.camera });
  assert.equal(env.gifs[0].renders, 0);
  assert.equal(env.gifs[0].aborts, 1);
  assert.equal(env.intervals.size, 0);
  assert.match(env.downloads[0], /^data:image\/png/);
});

test('鼠标移出截图按钮后松开仍结束GIF，窗口失焦取消采帧且不下载', () => {
  const env = cameraEnvironment();
  env.camera.dispatch('mousedown', { target: env.camera });
  env.clock.now += 900;
  env.doc.dispatch('mouseup', { target: new Node() });
  assert.equal(env.gifs[0].renders, 1);
  assert.equal(env.intervals.size, 0);
  const downloadCount = env.downloads.length;
  env.camera.dispatch('mousedown', { target: env.camera });
  env.clock.now += 1000;
  env.context.window.dispatch('blur');
  assert.equal(env.intervals.size, 0);
  assert.equal(env.gifs[1].aborts, 1);
  env.doc.dispatch('mouseup', { target: new Node() });
  assert.equal(env.downloads.length, downloadCount);
});

test('全景持续逐帧更新；关闭、重置或DOM移除后停止调度并销毁实例', () => {
  const env = environment();
  env.load('src/packages/VideoTools/VideoFilter/VideoFilter.js');
  const container = Object.assign(new Node(), { id: 'ex-panorama', isConnected: true });
  env.doc.children.push(container);
  const instance = { domContainer: container, updates: 0, destroyed: 0, update() { this.updates++; }, destroy() { this.destroyed++; } };
  env.context.testInstance = instance;
  env.run('panorama = testInstance');
  env.context.panoramaAnimation(instance);
  for (let i = 0; i < 5; i++) env.frame();
  assert.equal(instance.updates, 6);
  assert.equal(env.rafs.size, 1);
  env.context.stopPanorama();
  assert.equal(env.rafs.size, 0);
  assert.equal(instance.destroyed, 1);
  assert.equal(env.run('panorama'), null);
  env.context.panoramaAnimation(instance);
  assert.equal(env.rafs.size, 0);
  const next = { domContainer: { isConnected: false }, update() { throw new Error('Detached panorama rendered'); }, destroyed: 0, destroy() { this.destroyed++; } };
  env.context.testInstance = next; env.run('panorama = testInstance');
  env.context.panoramaAnimation(next);
  assert.equal(next.destroyed, 1);
  assert.equal(env.rafs.size, 0);
});
