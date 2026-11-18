const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Uglify = require('uglify-js');
const root = path.resolve(__dirname, '..');
const source = file => fs.readFileSync(path.join(root, file), 'utf8');
function sourceFiles(dir = 'src') {
  return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? sourceFiles(`${dir}/${entry.name}`) : entry.name.endsWith('.js') ? [`${dir}/${entry.name}`] : []);
}
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
function harness(extra = {}) {
  let now = 0, seq = 0;
  const jobs = new Map();
  const add = (fn, ms, interval) => { jobs.set(++seq, { fn, at: now + ms, ms, interval }); return seq; };
  const clock = {
    jobs,
    setTimeout: (fn, ms) => add(fn, ms, false), clearTimeout: id => jobs.delete(id),
    setInterval: (fn, ms) => add(fn, ms, true), clearInterval: id => jobs.delete(id),
    async tick(ms) {
      const end = now + ms;
      while (true) {
        const due = [...jobs].filter(([, job]) => job.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        const [id, job] = due;
        now = job.at;
        if (job.interval) job.at += job.ms; else jobs.delete(id);
        job.fn();
        await flush();
      }
      now = end;
      await flush();
    }
  };
  const context = vm.createContext({ URL, console: { log() {}, error() {}, warn() {} }, ...clock, ...extra });
  return { context, clock, load: file => vm.runInContext(source(file), context, { filename: file }) };
}

test('全部源码和两个构建产物 AST 不存在丢失的内部全局依赖', () => {
  let ast;
  for (const file of sourceFiles().sort()) ast = Uglify.parse(source(file), { toplevel: ast, filename: file });
  ast.figure_out_scope();
  const permitted = new Set([
    'AbortController', 'Array', 'ArrayBuffer', 'BigInt', 'Blob', 'Boolean', 'Date', 'Error', 'Event',
    'Infinity', 'JSON', 'Map', 'Math', 'MouseEvent', 'Node', 'Number', 'Object', 'Promise', 'RegExp',
    'Set', 'String', 'TextDecoder', 'TypeError', 'URL', 'Uint32Array', 'Uint8Array', 'WeakMap', 'WeakSet',
    'DOMParser', 'FileReader', 'MutationObserver', 'Notification', 'WebSocket', 'documentPictureInPicture',
    'alert', 'cancelAnimationFrame', 'clearInterval', 'clearTimeout', 'confirm', 'console',
    'decodeURIComponent', 'document', 'encodeURIComponent', 'escape', 'fetch', 'isNaN', 'localStorage', 'location',
    'navigator', 'parseFloat', 'parseInt', 'performance', 'requestAnimationFrame', 'self', 'setInterval',
    'setTimeout', 'undefined', 'unescape', 'window', 'unsafeWindow',
    'GM', 'GM_deleteValue', 'GM_getValue', 'GM_listValues', 'GM_openInTab', 'GM_registerMenuCommand',
    'GM_setClipboard', 'GM_setValue', 'GM_xmlhttpRequest',
    'DOMPurify', 'GIF', 'THREE', 'XLSX', 'flvjs',
    // Included UMD libraries publish these on window; CommonJS/AMD probes stay inert in the userscript.
    'CryptoJS', 'NoticeJs', 'define', 'exports', 'module'
  ]);
  const trees = [ast, ...['dist/douyuex.js', 'dist/douyuex.user.js'].map(file => {
    const tree = Uglify.parse(source(file), { filename: file });
    tree.figure_out_scope();
    return tree;
  })];
  const missing = [];
  for (const tree of trees) tree.globals.each((definition, name) => {
    if (!permitted.has(name)) missing.push(`${name}: ${definition.references.map(ref => `${ref.start.file}:${ref.start.line}`).join(', ')}`);
  });
  assert.deepEqual(missing, []);
});

test('源码与构建产物无已删除业务域，产物可解析且版本/权限一致', () => {
  const blocked = /(?:doseeing\.com|fz996\.com|shadiao\.(?:app|pro)|bojianger\.com|toubang\.tv|122\.51\.5\.63|hm\.baidu\.com|greasyfork\.org|jscdn\.douyuex\.com)/i;
  const sourceText = sourceFiles().map(source).join('\n');
  assert.doesNotMatch(sourceText, blocked);
  const main = source('src/main.js');
  const version = source('dist/douyuex_version.txt').trim();
  for (const file of ['dist/douyuex.js', 'dist/douyuex.user.js']) {
    const text = source(file);
    assert.doesNotThrow(() => new vm.Script(text, { filename: file }));
    assert.doesNotMatch(text, blocked);
    assert.equal(text.match(/\/\/ @version\s+(\S+)/)[1], version);
    assert.match(text, /@name\s+DouyuEx Lite/);
    const metadata = text.slice(0, text.indexOf('// ==/UserScript=='));
    assert.doesNotMatch(metadata, /GM_cookie|@antifeature|svgaplayer|passport\.douyu|cz\.douyu|msg\.douyu|@connect\s+(?:huya|bilibili|douyuex)/);
    assert.match(metadata, /@match\s+https:\/\/yuba\.douyu\.com\/\*/);
    assert.equal(metadata.match(/@match[^\r\n]*/g).join('\n'), main.match(/@match[^\r\n]*/g).join('\n'));
    assert.equal(metadata.match(/@connect[^\r\n]*/g).join('\n'), main.match(/@connect[^\r\n]*/g).join('\n'));
  }
});

test('初始和房间初始化各执行一次，异常模块不会阻断后续保留模块', async () => {
  const early = ['initPkg_Shield_RemoveRepeatedDanmaku_ScriptHook', 'initPkg_ShowDanmaku_ScriptHook',
    'initScriptHook', 'initPkg_Night_Set_Fast', 'initResponseHook', 'initPkg_ShowDanmaku', 'initKillP2P',
    'initFullScreen', 'initHighestVideoQuality', 'initPkg_NoLogin', 'removeAD', 'initPkg_Console',
    'initPkg_Menu', 'initPkg_Reset', 'initPkg_FollowList'];
  const room = ['initPkg_DanmakuTail', 'initPkg_Night', 'initPkg_ExIcon', 'initPkg_ExPanel',
    'initPkg_RealAudience', 'initPkg_CopyRealLive', 'initPkg_AudioLine', 'initPkg_RemoveAD', 'initPkg_Shield',
    'initPkg_Monitor', 'initPkg_PopupPlayer', 'initPkg_LiveTool', 'initPkg_VideoTools', 'initPkg_ExpandTool',
    'initPkg_Refresh', 'initPkg_FansContinue', 'initPkg_Sign', 'ExPanel_orderLiteTools', 'initPkg_BarragePanel',
    'initPkg_ChatTools', 'initPkg_DanmakuCollect', 'initPkg_ChangeDanmakuLengthLimit', 'initPkg_LastLiveTime',
    'initPkg_VolumeMouseScrolling'];
  const calls = [], errors = [];
  const stubs = Object.fromEntries([...early, ...room].map(name => [name, () => {
    calls.push(name);
    if (name === 'initPkg_Night') throw new Error('fixture unavailable');
    if (name === 'initPkg_CopyRealLive') return Promise.reject(new Error('fixture unavailable'));
  }]));
  const { context, load } = harness({ ...stubs, initRouter() {}, window: { location: { href: 'https://www.douyu.com/123' } }, console: { error: (...args) => errors.push(args) } });
  load('src/main.js');
  context.init(); context.init();
  context.initPkg(); context.initPkg();
  await flush();
  assert.deepEqual(calls, [...early, ...room]);
  assert.equal(errors.length, 2);
  assert.equal(calls.filter(name => name === 'initPkg_Sign').length, 1);
});

test('main 定时入口反复调用仍只启动每 35 秒、5 分钟和 1 秒各一条循环', async () => {
  const { context, clock, load } = harness({
    initRouter() {}, window: { location: { href: 'https://www.douyu.com/123' } }, document: { querySelector: () => null }
  });
  load('src/main.js');
  load('src/packages/LevelTask/LevelTask.js');
  load('src/packages/Sign/Sign_OPFOY.js');
  load('src/packages/DisableCloseJump/DisableCloseJump.js');
  let levels = 0, views = 0;
  context.checkLevelTask = async () => { levels++; };
  context.checkOPFOYViewStatus = async () => { views++; };
  context.initTimer(); context.initTimer();
  assert.equal(levels, 1); assert.equal(views, 1);
  assert.deepEqual([...clock.jobs.values()].map(job => job.ms).sort((a, b) => a - b), [1000, 35000, 300000]);
  await clock.tick(300000);
  assert.equal(levels, 9); assert.equal(views, 2);
});

test('路由：直播/斗鱼同屏/回放分别进入，官方嵌入鱼吧仅同步主题', () => {
  const { context, load } = harness({ window: { parent: {} }, document: { body: {} } });
  load('src/routers/router.js');
  const calls = [];
  context.initRouter_DouyuRoom_Main = () => calls.push('room');
  context.initRouter_DouyuRoom_Popup = () => calls.push('popup');
  context.initRouter_Video = () => calls.push('replay');
  context.initPkg_Night_EmbeddedYuba = () => calls.push('theme');
  for (const url of ['https://www.douyu.com/123', 'https://www.douyu.com/topic/game', 'https://www.douyu.com/123?exid=chun', 'https://v.douyu.com/show/abc']) context.initRouter(url);
  assert.deepEqual(calls, ['room', 'room', 'popup', 'replay']);
  for (const url of ['https://passport.douyu.com/login?exid=chun', 'https://msg.douyu.com/', 'http://yuba.douyu.com/?exRestore', 'https://yuba.douyu.com.evil.test/', 'https://yuba.douyu.com:8443/', 'https://cz.douyu.com/', 'https://www.douyu.com/member/cp/getFansBadgeList', 'https://www.douyu.com/template/a', 'https://www.douyu.com/h5/a', 'https://v.douyu.com/author/1', 'https://evil.test/123']) context.initRouter(url);
  assert.equal(calls.length, 4);
  context.initRouter('https://yuba.douyu.com/group/1?exRestore');
  assert.deepEqual(calls, ['room', 'room', 'popup', 'replay', 'theme']);
});

test('鱼吧主题路由等待 body，独立鱼吧不执行任何初始化', () => {
  const listeners = new Map(), calls = [];
  const win = { parent: {} };
  const doc = { body: null, addEventListener(type, fn, options) {
    assert.equal(type, 'DOMContentLoaded');
    assert.equal(options.once, true);
    listeners.set(fn, options);
  } };
  const { context, load } = harness({
    window: win, document: doc,
    initPkg_Night_EmbeddedYuba: () => { assert.ok(doc.body); calls.push('theme'); }
  });
  load('src/routers/router.js');
  context.initRouter('https://yuba.douyu.com/group/1');
  context.initRouter('https://yuba.douyu.com/group/1');
  assert.equal(calls.length, 0);
  assert.equal(listeners.size, 1);
  doc.body = {};
  for (const [fn] of listeners) fn();
  assert.deepEqual(calls, ['theme']);
  win.parent = win;
  context.initRouter('https://yuba.douyu.com/group/1');
  assert.deepEqual(calls, ['theme']);
});

test('房间异步等待只创建一个调度，DOM 迟到后仍初始化观看模块与奖励', async () => {
  let ready = false;
  const calls = [];
  const { context, clock, load } = harness({
    init: () => calls.push('early'), initStyles: () => calls.push('styles'),
    initPkg: () => calls.push('packages'), initTimer: () => calls.push('timers'),
    document: { getElementsByClassName: () => ready ? [{}] : [], querySelector: () => null }
  });
  load('src/routers/router.js');
  context.initRouter_DouyuRoom_Main(); context.initRouter_DouyuRoom_Main();
  assert.equal(clock.jobs.size, 1);
  await clock.tick(5000);
  assert.ok(!calls.includes('packages'));
  ready = true;
  await clock.tick(1000);
  assert.equal(clock.jobs.size, 1);
  await clock.tick(1500);
  assert.deepEqual(calls.slice(-3), ['styles', 'packages', 'timers']);
  assert.equal(clock.jobs.size, 0);
});

test('礼物节点迟到时仍初始化观看工具和精灵球', async () => {
  let ready = false;
  const calls = [];
  const { context, clock, load } = harness({
    init: () => calls.push('early'), initStyles: () => calls.push('styles'),
    initPkg: () => calls.push('packages'), initTimer: () => calls.push('timers'),
    document: {
      getElementsByClassName: name => name === 'Barrage-main' && ready ? [{}] : [],
      querySelector: () => null,
    }
  });
  load('src/routers/router.js');
  context.initRouter_DouyuRoom_Main();
  await clock.tick(1000);
  ready = true;
  await clock.tick(1000);
  await clock.tick(1500);
  assert.deepEqual(calls.slice(-3), ['styles', 'packages', 'timers']);
});

test('回放数据晚到仍初始化四项回放能力，重复进入不叠加', async () => {
  const calls = [];
  const unsafeWindow = {};
  const { context, clock, load } = harness({
    unsafeWindow, initStyles: () => calls.push('styles'), runInitializers: list => list.forEach(fn => fn()),
    initPkg_VideoTime: () => calls.push('time'), initPkg_VideoTools_Camera_Video: () => calls.push('camera'),
    initPkg_DyVideoDownload: () => calls.push('download'), initPkg_DyVideoBarrageLine: () => calls.push('density')
  });
  load('src/routers/router.js');
  context.initRouter_Video(); context.initRouter_Video();
  await clock.tick(2000);
  assert.equal(calls.length, 0);
  unsafeWindow.$DATA = { ROOM: {} };
  await clock.tick(500);
  context.initRouter_Video();
  assert.deepEqual(calls, ['styles', 'time', 'camera', 'download', 'density']);
  assert.equal(clock.jobs.size, 0);
});

test('弹幕连接：40 秒心跳、消息分发、3 秒断线重连及关闭停止', async () => {
  const sockets = [], delivered = [];
  class Socket {
    static CONNECTING = 0; static OPEN = 1;
    constructor(url) { this.url = url; this.readyState = 0; this.sent = []; sockets.push(this); }
    send(packet) { this.sent.push(packet); }
    open() { this.readyState = 1; this.onopen(); }
    close() { this.readyState = 3; if (this.onclose) this.onclose(); }
  }
  const { context, clock, load } = harness({
    window: { WebSocket: Socket }, WebSocket: Socket, getRandom: () => 2,
    WebSocket_Packet: str => str,
    FileReader: class { readAsText(value) { this.result = value; this.onload(); } }
  });
  load('src/require/WebSocket/WebSocket_UnLogin.js');
  context.onBarrage = data => delivered.push(data);
  const client = vm.runInContext('new Ex_WebSocket_UnLogin("123", onBarrage)', context);
  sockets[0].open();
  assert.deepEqual(sockets[0].sent, ['type@=loginreq/roomid@=123', 'type@=joingroup/rid@=123/gid@=-9999/']);
  await clock.tick(120000);
  assert.equal(sockets[0].sent.filter(value => value === 'type@=mrkl/').length, 3);
  sockets[0].onmessage({ data: 'type@=chatmsg/txt@=hello/\0short\0type@=rss/ss@=1/rid@=123/\0' });
  assert.equal(delivered.length, 2);
  sockets[0].close();
  await clock.tick(2999);
  assert.equal(sockets.length, 1);
  await clock.tick(1);
  assert.equal(sockets.length, 2);
  sockets[1].open();
  await clock.tick(40000);
  assert.equal(sockets[1].sent.length, 3);
  client.close();
  await clock.tick(120000);
  assert.equal(sockets.length, 2);
  assert.equal(sockets[1].sent.length, 3);
  assert.equal(clock.jobs.size, 0);
});

test('弹幕关闭在重连等待期间发生时，不会重建连接', async () => {
  const sockets = [];
  class Socket {
    static CONNECTING = 0; static OPEN = 1;
    constructor() { this.readyState = 0; sockets.push(this); }
    close() { this.readyState = 3; if (this.onclose) this.onclose(); }
  }
  const { context, clock, load } = harness({ window: { WebSocket: Socket }, WebSocket: Socket, getRandom: () => 2 });
  load('src/require/WebSocket/WebSocket_UnLogin.js');
  const client = vm.runInContext('new Ex_WebSocket_UnLogin("123", () => {})', context);
  sockets[0].close();
  client.close();
  await clock.tick(60000);
  assert.equal(sockets.length, 1);
  assert.equal(clock.jobs.size, 0);
});

test('下播提示稍后出现仍每秒关闭，重复初始化不重复执行', async () => {
  let visible = false, clicks = 0;
  const { context, clock, load } = harness({ document: { querySelector: () => visible ? { click: () => { clicks++; visible = false; } } : null } });
  load('src/packages/DisableCloseJump/DisableCloseJump.js');
  context.initPkg_DisableCloseJump_Timer(); context.initPkg_DisableCloseJump_Timer();
  await clock.tick(10000);
  assert.equal(clicks, 0);
  visible = true;
  await clock.tick(1000);
  assert.equal(clicks, 1);
  visible = true;
  await clock.tick(1000);
  assert.equal(clicks, 2);
  assert.equal(clock.jobs.size, 1);
});
