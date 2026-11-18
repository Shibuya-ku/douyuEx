const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
function load(context, ...files) {
    for (const file of files) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
}
async function flush() { for (let i = 0; i < 12; i++) await Promise.resolve(); }
function clock() {
    let now = 0, next = 1;
    const jobs = new Map();
    const add = (fn, ms, interval) => { const id = next++; jobs.set(id, { fn, ms, time: now + ms, interval }); return id; };
    return {
        jobs, now: () => now,
        setInterval: (fn, ms) => add(fn, ms, true), clearInterval: id => jobs.delete(id),
        setTimeout: (fn, ms) => add(fn, ms, false), clearTimeout: id => jobs.delete(id),
        async tick(ms) {
            const end = now + ms;
            while (true) {
                const first = [...jobs].filter(([, job]) => job.time <= end).sort((a, b) => a[1].time - b[1].time)[0];
                if (!first) break;
                const [id, job] = first;
                now = job.time;
                if (job.interval) job.time += job.ms;
                else jobs.delete(id);
                job.fn();
                await flush();
            }
            now = end;
            await flush();
        },
    };
}
function element() {
    const classes = new Set();
    return {
        style: {}, attrs: {}, events: {}, value: '', checked: false, children: [],
        classList: { add: x => classes.add(x), remove: x => classes.delete(x), contains: x => classes.has(x) },
        addEventListener(type, fn) { this.events[type] = fn; },
        setAttribute(key, value) { this.attrs[key] = value; },
        click() { if (this.events.click) this.events.click({ stopPropagation() {} }); },
        focus() { this.focused = true; }, remove() { this.removed = true; },
    };
}
function harness(extra = {}) {
    const timer = clock();
    const events = {};
    const context = vm.createContext({
        console: { log() {} }, URL, AbortController, ...timer,
        performance: { now: timer.now },
        window: { addEventListener: (name, fn) => { events[name] = fn; } },
        rid: '123', StyleHook_set() {}, ...extra,
    });
    return { context, timer, events };
}

test('Douyu same-screen accepts room IDs/aliases and rejects external streams or disguised hosts', () => {
    const { context: c } = harness();
    load(c, 'src/packages/PopupPlayer/PopupPlayer.js');
    assert.equal(c.PopupPlayer_roomUrl(' 123 '), 'https://www.douyu.com/123');
    assert.equal(c.PopupPlayer_roomUrl('http://www.douyu.com/somename?from=share'), 'https://www.douyu.com/somename');
    for (const url of ['https://huya.com/123', 'https://live.bilibili.com/123', 'https://douyu.com.evil.test/1', 'https://evil.test/douyu.com/1', 'https://www.douyu.com@evil.test/1', 'javascript:alert(1)', 'https://www.douyu.com:8443/123', 'https://www.douyu.com/a/b.flv']) {
        assert.equal(c.PopupPlayer_roomUrl(url), '', url);
    }
    const opened = [];
    c.createNewVideo_Douyu = (id, room) => opened.push([id, room]);
    c.createNewVideo(0, '123', 'Douyu');
    c.createNewVideo(1, '456', 'Huya');
    assert.deepEqual(opened, [[0, '123']]);
});

test('same-screen prompt routes to official stream or official page and preserves cancel/Enter', () => {
    const ids = Object.fromEntries(['prompt', 'url', 'cancel', 'ok', 'noiframe'].map(name => ['popup-player__' + name, element()]));
    const calls = [];
    const { context: c } = harness({ document: { getElementById: id => ids[id] }, showMessage: () => calls.push('invalid') });
    load(c, 'src/packages/PopupPlayer/PopupPlayer.js');
    c.createNewVideo = (...args) => calls.push(args);
    c.createNewVideo_iframe = (...args) => calls.push(args);
    c.initPkg_PopupPlayer_Func();
    ids['popup-player__url'].value = '123';
    ids['popup-player__noiframe'].checked = true;
    ids['popup-player__prompt'].events.keydown({ key: 'Enter' });
    assert.deepEqual(calls.pop(), [0, '123', 'Douyu']);
    ids['popup-player__noiframe'].checked = false;
    ids['popup-player__ok'].click();
    assert.deepEqual(calls.pop(), [0, 'https://www.douyu.com/123']);
    ids['popup-player__url'].value = 'https://outside.test/live.flv';
    ids['popup-player__ok'].click();
    assert.equal(calls.pop(), 'invalid');
    ids['popup-player__cancel'].click();
    assert.equal(ids['popup-player__prompt'].style.display, 'none');
});

test('closing iframe or audio releases resources even without a main video element', () => {
    const ids = Object.fromEntries(['exVideoDiv0', 'exVideoPlayer0', 'exVideoInfo0', 'exVideoScale0', 'exVideoQn0', 'exVideoCDN0', 'exVideoClose0', 'exVideoRID0'].map(id => [id, element()]));
    const { context: c } = harness({ document: { getElementById: id => ids[id] || null } });
    load(c, 'src/packages/PopupPlayer/PopupPlayer.js');
    c.videoPlayerArr[0] = 'iframe';
    c.setElementFunc_iframe(0);
    ids.exVideoClose0.onclick();
    assert.equal(ids.exVideoDiv0.removed, true);
    let destroyed = 0;
    c.videoPlayerArr[0] = { destroy: () => destroyed++ };
    c.setElementFunc_Douyu(0, '123');
    ids.exVideoClose0.onclick();
    assert.equal(destroyed, 1);
    assert.equal(ids.exVideoPlayer0.removed, true);
});

test('official viewing information refreshes after initial failures and rotates without third-party requests', async () => {
    const ids = Object.fromEntries(['real-audience__time', 'real-audience__watchtime', 'real-audience__noble'].map(id => [id, element()]));
    ids['real-audience__time'].style.display = 'block';
    let fail = true;
    const urls = [];
    const { context: c, timer } = harness({
        document: { getElementById: id => ids[id] || null },
        fetch: async url => {
            urls.push(url);
            if (fail) throw Error('offline');
            return { json: async () => url.includes('h5room') ? { data: { show_time: 100, show_status: 1 } } : { error: 0, data: { todayWatch: 1800 } } };
        },
        formatSeconds: n => n + 's', dateFormat: () => 'start',
        getType: () => 'oni', getStrMiddle: () => '15000',
    });
    load(c, 'src/packages/RealAudience/RealAudience.js');
    c.initPkg_RealAudience_Dom = () => {};
    c.setAvatarVideo = () => {};
    c.initPkg_RealAudience();
    c.initPkg_RealAudience();
    await flush();
    assert.equal([...timer.jobs.values()].filter(job => job.interval).length, 2);
    await timer.tick(5000);
    assert.equal(ids['real-audience__time'].style.display, 'none');
    fail = false;
    await timer.tick(145000);
    assert.equal(ids['real-audience__watchtime'].innerText, '已观看:1800s');
    assert.equal(urls.length, 4);
    assert.ok(urls.every(url => url.startsWith('https://www.douyu.com/')));
    c.initPkg_RealAudience_Handle('oni');
    assert.equal(ids['real-audience__noble'].innerText, '1.5万');
});

test('official watch progress survives independent room-info failure and slow requests do not overlap', async () => {
    let resolveWatch;
    let requests = 0;
    const nodes = Object.fromEntries(['real-audience__time', 'real-audience__watchtime'].map(id => [id, element()]));
    const { context: c } = harness({
        document: { getElementById: id => nodes[id] }, formatSeconds: n => n + 's', dateFormat: () => '',
        fetch: async url => {
            requests++;
            if (url.includes('h5room')) throw Error('room failure');
            return { json: () => new Promise(resolve => { resolveWatch = resolve; }) };
        },
    });
    load(c, 'src/packages/RealAudience/RealAudience.js');
    c.initPkg_RealAudience_Dom = () => {}; c.setAvatarVideo = () => {};
    const first = c.setRealViewer();
    await flush();
    await c.setRealViewer();
    assert.equal(requests, 2);
    resolveWatch({ error: 0, data: { todayWatch: 1900 } });
    await first;
    assert.equal(nodes['real-audience__watchtime'].innerText, '已观看:1900s');
});

test('viewing message subscriptions run once, isolate failures and reconnect after page restoration', async () => {
    const count = {}, sockets = [];
    const increment = key => () => { count[key] = (count[key] || 0) + 1; };
    const { context: c, events } = harness({
        initPkg_LiveTool_BarrageSpeed: increment('speedInit'), initPkg_LiveTool_RankList: increment('rankInit'),
        initPkg_LiveTool_BarrageSendCheck: async () => increment('sendInit')(),
        initPkg_LiveTool_LiveNotice_Handle: increment('notice'),
        initPkg_LiveTool_BarrageSpeed_Handle: () => { throw Error('missing DOM'); },
        initPkg_LiveTool_RankList_Handle: increment('rank'),
        initPkg_LiveTool_BarrageSendCheck_Handle: increment('send'), initPkg_RealAudience_Handle: increment('noble'),
        Ex_WebSocket_UnLogin: class { constructor(room, callback) { this.room = room; this.callback = callback; sockets.push(this); } close() { this.closed = true; } },
    });
    load(c, 'src/packages/LiveTool/LiveTool.js');
    c.initPkg_LiveTool(); c.initPkg_LiveTool();
    assert.equal(sockets.length, 1);
    sockets[0].callback('later message'); sockets[0].callback('another message');
    assert.equal(count.notice, 2); assert.equal(count.rank, 2); assert.equal(count.send, 2); assert.equal(count.noble, 2);
    assert.equal(count.speedInit, 1);
    events.pagehide(); assert.equal(sockets[0].closed, true);
    events.pageshow(); assert.equal(sockets.length, 2);
});

test('original socket heartbeat and reconnect cadence survive management-panel removal', async () => {
    const sockets = [];
    class Socket {
        static OPEN = 1; static CONNECTING = 0;
        constructor() { this.sent = []; this.readyState = 1; sockets.push(this); }
        send(packet) { this.sent.push(packet); }
        close() { this.readyState = 3; if (this.onclose) this.onclose(); }
    }
    const { context: c, timer } = harness({ window: { WebSocket: Socket }, WebSocket: Socket, getRandom: () => 2, WebSocket_Packet: x => x });
    load(c, 'src/require/WebSocket/WebSocket_UnLogin.js');
    vm.runInContext('globalThis.socket = new Ex_WebSocket_UnLogin(123, () => {})', c);
    sockets[0].onopen();
    await timer.tick(80000);
    assert.equal(sockets[0].sent.filter(x => x === 'type@=mrkl/').length, 2);
    sockets[0].close();
    await timer.tick(2999); assert.equal(sockets.length, 1);
    await timer.tick(1); assert.equal(sockets.length, 2);
    sockets[1].onopen(); c.socket.close();
    await timer.tick(80000);
    assert.equal(sockets[1].sent.length, 2);
});

test('barrage speed continues across five-second windows and tolerates temporarily missing input', async () => {
    const input = element();
    let available = false;
    const { context: c, timer } = harness({ document: { getElementsByClassName: () => available ? [input] : [] }, getType: text => text });
    load(c, 'src/packages/LiveTool/BarrageSpeed/BarrageSpeed.js');
    c.initPkg_LiveTool_BarrageSpeed(); c.initPkg_LiveTool_BarrageSpeed();
    await timer.tick(5000);
    available = true;
    c.initPkg_LiveTool_BarrageSpeed_Handle('chatmsg'); c.initPkg_LiveTool_BarrageSpeed_Handle('chatmsg');
    await timer.tick(5000);
    assert.equal(input.attrs['data-placeholder'], '弹幕时速：24条/分');
    await timer.tick(5000);
    assert.equal(input.attrs['data-placeholder'], '弹幕时速：0条/分');
    assert.equal([...timer.jobs.values()].filter(job => job.interval).length, 1);
});

test('barrage delivery check waits for late DOM and the existing 300ms broadcast grace period', async () => {
    let available = false, callback;
    const text = element(); text.innerText = 'new message'; text.parentNode = { insertBefore() {} };
    const message = { getElementsByClassName: name => name === 'is-self' ? [{}] : [text] };
    const { context: c, timer } = harness({
        document: { getElementById: () => available ? {} : null, createElement: () => element() },
        getUserName: async () => 'myself', myName: '', getType: () => 'chatmsg', stt_deserialize: JSON.parse,
        DomHook: class { constructor(selector, subtree, fn) { callback = fn; } },
    });
    load(c, 'src/packages/LiveTool/BarrageSendCheck/BarrageSendCheck.js');
    await c.initPkg_LiveTool_BarrageSendCheck();
    await timer.tick(1000); assert.equal(callback, undefined);
    available = true; await timer.tick(1000);
    c.initPkg_LiveTool_BarrageSendCheck_Handle(JSON.stringify({ nn: 'myself', txt: 'old message' }));
    callback([{ addedNodes: [message] }]);
    await timer.tick(299); assert.equal(text.style.textDecoration, undefined);
    c.initPkg_LiveTool_BarrageSendCheck_Handle(JSON.stringify({ nn: 'myself', txt: 'new message' }));
    await timer.tick(1); assert.equal(text.style.textDecoration, undefined);
    callback([{ addedNodes: [message] }]);
    c.initPkg_LiveTool_BarrageSendCheck_Handle(JSON.stringify({ nn: 'myself', txt: 'different message' }));
    await timer.tick(300); assert.equal(text.style.textDecoration, 'line-through gray 1px');
});

test('live notice remains available for a later real broadcast, excluding replay status', () => {
    const notices = [], signed = [];
    const { context: c } = harness({
        getType: () => 'rss', getStrMiddle: (text, key) => JSON.parse(text)[key],
        showMessageWindow: (title, text, callback) => notices.push(callback), signRoom: room => signed.push(room),
    });
    load(c, 'src/packages/LiveTool/LiveNotice/LiveNotice.js');
    c.initPkg_LiveTool_LiveNotice_Handle(JSON.stringify({ 'rid@=': '123', 'ss@=': '1', 'ivl@=': '1' }));
    assert.equal(notices.length, 0);
    c.initPkg_LiveTool_LiveNotice_Handle(JSON.stringify({ 'rid@=': '123', 'ss@=': '1', 'ivl@=': '0' }));
    notices[0](); assert.deepEqual(signed, ['123']);
});

test('manual barrage helper and retained image codec work without removed sending/upload modules', () => {
    let sends = 0;
    const input = { tagName: 'TEXTAREA' };
    const { context: c } = harness({
        document: { getElementsByClassName: name => name === 'ChatSend-txt' ? [input] : [{ click: () => sends++ }] },
        isValidImageFile: x => /\.(png|jpg)$/.test(x), DOMPurify: { sanitize: x => x },
    });
    load(c, 'src/require/Barrage/BarrageSend.js', 'src/packages/ImageDanmaku/ImageDanmaku.js');
    c.sendBarrage('hello'); assert.equal(input.value, 'hello'); assert.equal(sends, 1);
    input.tagName = 'DIV'; c.sendBarrage('next'); assert.equal(input.innerText, 'next');
    const encoded = c.compressImageUrl('202611170000000000123');
    assert.equal(c.decompressImageUrl(encoded), '202611170000000000123');
    assert.match(c.getImageDanmakuHtml(encoded + '.png'), /2026\/11\/17\/202611170000000000123\.200x0\.png/);
    assert.equal(c.getImageDanmakuHtml('bad" onclick="evil.png'), '');
    assert.equal(c.getImageDanmakuHtml('bad!.png'), '');
    assert.equal(c.getImageDanmakuFromImgSrc('https://img.douyucdn.cn/data/yuba/weibo/2026/11/17/202611170000000000123.200x0.png'), `[DouyuEx图片${encoded}.png]`);
});

test('player menu keeps viewing actions, adds Douyu same-screen and opens the shared toolbar', () => {
    const ids = Object.fromEntries(['ex-vtoolbar-filter-host', 'vtoolbar-menu-filter', 'vtoolbar-menu-copy-live', 'vtoolbar-menu-audio-line', 'vtoolbar-menu-enhanced-pip', 'vtoolbar-menu-expanel', 'vtoolbar-menu-popup-player'].map(id => [id, element()]));
    const trigger = element(), dropdown = element(), rootNode = element();
    rootNode.querySelector = sel => sel.includes('trigger') ? trigger : dropdown;
    ids['ex-vtoolbar-menu'] = rootNode;
    const calls = [];
    const { context: c } = harness({
        document: { getElementById: id => ids[id] || null, addEventListener() {}, createElement: () => rootNode },
        getValidDom: () => ({ insertBefore() {}, childNodes: [] }), curVersion: 'test', PokeballIcon_svg: '<svg></svg>',
        CopyRealLive_copySelected: () => calls.push('copy'), AudioLine_switch: () => calls.push('audio'),
        PictureInPictureControl_launchEnhanced: () => calls.push('pip'), showExPanel: () => calls.push('toolbar'),
        PopupPlayer_openPrompt: () => calls.push('same-screen'),
    });
    load(c, 'src/packages/VideoTools/VideoToolbarMenu/VideoToolbarMenuTemplate.js', 'src/packages/VideoTools/VideoToolbarMenu/VideoToolbarMenu.js');
    c.VideoToolbarMenu_insertDom(); c.VideoToolbarMenu_bindEvents();
    assert.doesNotMatch(rootNode.innerHTML, /joysound/i);
    assert.match(rootNode.innerHTML, /斗鱼同屏播放/);
    for (const id of ['copy-live', 'audio-line', 'enhanced-pip', 'expanel', 'popup-player']) ids['vtoolbar-menu-' + id].click();
    assert.deepEqual(calls, ['copy', 'audio', 'pip', 'toolbar', 'same-screen']);
    ids['vtoolbar-menu-filter'].click(); assert.equal(ids['vtoolbar-menu-filter'].attrs['aria-expanded'], 'true');
    c.VideoToolbarMenu_onKeydown({ key: 'Escape' }); assert.equal(ids['vtoolbar-menu-filter'].attrs['aria-expanded'], 'false');
});

test('native playback controls attach when their host arrives and reattach after replacement', () => {
    let host = null;
    const nodes = {};
    const hooks = [];
    const { context: c } = harness({
        document: { querySelector: () => host, getElementById: id => nodes[id] || null },
        getValidDom: () => host, DomHook: class { constructor(selector, subtree, callback) { hooks.push(callback); } },
    });
    load(c, 'src/packages/VideoTools/VideoSpeed/VideoSpeed.js', 'src/packages/VideoTools/Cinema/Cinema.js', 'src/packages/VideoTools/VideoSync/VideoSync.js');
    const actions = [
        ['initPkg_VideoTools_VideoSpeed', 'ex-videospeed'],
        ['initPkg_VideoTools_Cinema', 'ex-cinema'],
        ['initPkg_VideoTools_VideoSync', 'ex-videosync'],
    ];
    const attached = [];
    for (const [init, id] of actions) {
        c[init + '_Dom'] = () => { nodes[id] = {}; };
        c[init + '_Func'] = () => { attached.push(id); };
        c[init]();
    }
    assert.equal(attached.length, 0);
    host = {};
    for (const hook of hooks) hook();
    assert.deepEqual(attached, actions.map(([, id]) => id));
    for (const hook of hooks) hook();
    assert.equal(attached.length, 3);
    for (const [, id] of actions) delete nodes[id];
    for (const hook of hooks) hook();
    assert.equal(attached.length, 6);
});

test('barrage reply and +1 remain manual and need no removed moderation or search handlers', () => {
    const reply = element(), plus = element(), input = element(); input.tagName = 'TEXTAREA';
    const content = { innerText: 'hello' };
    let sent;
    const { context: c } = harness({
        document: {
            getElementById: id => ({ barragePanel__reply: reply, 'barrage-panel-tip__+1': plus, 'comment-higher-container': { innerText: 'hello', getElementsByClassName: () => [] } })[id],
            getElementsByClassName: name => name === 'ChatSend-txt' ? [input] : [content],
        }, sendBarrage: text => { sent = text; },
    });
    load(c, 'src/packages/BarragePanel/BarragePanel.js', 'src/packages/BarragePanel/BarragePanel_Tip.js');
    c.setBarrgePanelFunc({}, 'viewer');
    reply.onclick();
    assert.equal(input.value, '@viewer：hello');
    assert.equal(input.focused, true);
    assert.equal(sent, undefined);
    c.setBarragePanelTipFunc(); plus.onclick();
    assert.equal(sent, 'hello');
});

test('native hover +1 prevents the Lite helper from adding a duplicate button', () => {
    const nativePlus = { id: 'douyu-native-plus', innerText: '+1' };
    const parent = {
        children: [nativePlus],
        querySelectorAll: () => [nativePlus],
        appendChild() { this.appended = true; },
    };
    const { context: c } = harness({
        document: {
            getElementById: () => null,
            getElementsByClassName: () => [{ parentElement: parent }],
            createElement: () => ({ style: {}, className: '', innerText: '', appendChild() {} }),
        },
    });
    load(c, 'src/packages/BarragePanel/BarragePanel_Tip.js');
    c.renderBarragePanelTip();
    assert.equal(parent.appended, undefined);
});

test('PiP source keepalive repeats at 200ms and stops on close', async () => {
    let draws = 0;
    const { context: c, timer } = harness({
        window: { __pip_is_active__: true },
        document: { createElement: () => ({ getContext: () => ({ drawImage: () => draws++ }) }) },
    });
    load(c, 'src/packages/VideoTools/PictureInPictureControl/PictureInPictureControl.js');
    c.PictureInPictureControl_startSourceVideoKeepAlive({ readyState: 2 });
    await timer.tick(600); assert.equal(draws, 4);
    c.window.__pip_is_active__ = false;
    c.PictureInPictureControl_stopSourceVideoKeepAlive();
    await timer.tick(600); assert.equal(draws, 4);
});

test('PiP stalled frames recover after threshold while user pause suppresses recovery', async () => {
    let recoveries = 0;
    const { context: c, timer } = harness({ window: { __pip_is_active__: true } });
    load(c, 'src/packages/VideoTools/PictureInPictureControl/PictureInPictureControl.js');
    c.PictureInPictureControl_reloadPipVideo = async () => { recoveries++; };
    const video = { requestVideoFrameCallback() {}, paused: false, readyState: 3 };
    c.PictureInPictureControl_startFrameStallWatch(video, {}, {});
    await timer.tick(2500); assert.equal(recoveries, 0);
    await timer.tick(2500); assert.equal(recoveries, 1);
    video.paused = true;
    await timer.tick(10000); assert.equal(recoveries, 1);
    c.window.__pip_is_active__ = false;
    await timer.tick(2500); assert.equal(timer.jobs.size, 0);
});
