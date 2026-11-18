const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
function load(c, ...files) { for (const file of files) vm.runInContext(read(file), c, { filename: file }); }
async function flush() { for (let i = 0; i < 15; i++) await Promise.resolve(); }
function node() {
    return { style: {}, innerText: '', innerHTML: '', events: {}, childNodes: [],
        addEventListener(type, fn) { this.events[type] = fn; },
        click() { return this.events.click?.(); },
        appendChild(child) { this.childNodes.push(child); }, append(child) { this.appendChild(child); },
        insertBefore(child) { this.childNodes.unshift(child); }, remove() { this.removed = true; },
    };
}
function fixture(extra = {}) {
    let hashid = 'videoA', ready = true;
    const ids = Object.fromEntries(['#download-text', '.download__panel', '#btn-download', '#download__default', '#download__copy', '#download__barrage', '#download__barrageass'].map(id => [id, node()]));
    const label = node(), video = node(), preview = node(), progressBar = node(), sign = node();
    preview.getAttribute = name => name === 'showtime' ? '12.6' : '';
    preview.shadowRoot = { querySelector: () => label };
    const progress = { querySelector: selector => selector === '.ProgressBar-Sign' ? sign : selector === '.ProgressBar' ? progressBar : selector === 'demand-video-controller-preview' ? preview : progressBar.childNodes.find(n => n.id === 'ex-barrageLine' && !n.removed), append() {} };
    const timeLabel = { innerText: '00:00 / 01:00' };
    const bar = { shadowRoot: { querySelector: selector => selector === '#time-label' ? timeLabel : { shadowRoot: progress } } };
    const demand = { shadowRoot: { getElementById: id => id === '__video' ? video : bar } };
    const toolbar = { shadowRoot: { querySelector: selector => selector === 'share-hover' ? { getAttribute: () => hashid } : ids[selector] || node(), appendChild() {} } };
    const observers = [], timers = new Map(); let nextTimer = 1;
    const messages = [], clipboard = [], exports = [], downloads = [];
    const c = vm.createContext({
        TextDecoder, Uint8Array, console: { log() {} }, AbortController,
        window: { location: { pathname: '/show/fallback' } }, unsafeWindow: { $DATA: { ROOM: { vid: 'videoA', point_id: 99, name: 'Replay' } } },
        document: {
            getElementsByTagName: tag => !ready ? [] : tag === 'demand-video' ? [demand] : tag === 'demand-video-toolbar' ? [toolbar] : tag === 'demand-video-title' ? [{ shadowRoot: { querySelector: () => ({ innerText: 'Replay title' }) } }] : [],
            createElement: node,
        },
        MutationObserver: class { constructor(callback) { this.callback = callback; observers.push(this); } observe(target) { this.target = target; } disconnect() {} },
        setInterval(fn, delay) { const id = nextTimer++; timers.set(id, { fn, delay, interval: true }); return id; },
        setTimeout(fn, delay) { const id = nextTimer++; timers.set(id, { fn, delay, interval: false }); return id; },
        clearInterval: id => timers.delete(id), clearTimeout: id => timers.delete(id),
        showMessage: (...args) => messages.push(args), GM_setClipboard: text => clipboard.push(text),
        exportJsonToExcel: (...args) => exports.push(args), downloadFile: (...args) => downloads.push(args),
        formatSeconds2: seconds => `00:00:${String(Math.floor(seconds)).padStart(2, '0')}`,
        dateFormat: (format, date) => date.toISOString(),
        getStrMiddle: (str, start, end) => str.split(start)[1].split(end)[0],
        timeText2Ms: text => text.trim().split(':').reduce((sum, part) => sum * 60 + Number(part), 0) * 1000,
        ...extra,
    });
    return { c, ids, label, preview, video, progress, progressBar, timeLabel, observers, timers, messages, clipboard, exports, downloads,
        setHash: value => { hashid = value; }, setReady: value => { ready = value; },
        async run(delay) { for (const [id, job] of [...timers]) if (job.delay === delay) { if (!job.interval) timers.delete(id); job.fn(); } await flush(); },
    };
}

test('all replay modules tolerate late Shadow DOM instead of throwing during readiness checks', async () => {
    const f = fixture({ fetch: async () => ({ json: async () => ({ data: { viewthumb: [{ url: 'x--20261117120000/x' }] } }) }) });
    f.setReady(false);
    load(f.c, 'src/packages/VideoTime/VideoTime.js', 'src/packages/DyVideoDownload/DyVideoDownload.js', 'src/packages/DyVideoDownload/DyVideoBarrageLine.js');
    f.c.initPkg_VideoTime(); f.c.initPkg_DyVideoDownload(); f.c.initPkg_DyVideoBarrageLine();
    await assert.doesNotReject(f.run(1000));
    assert.equal(f.timers.size, 3);
});

test('replay absolute time follows preview movement and hash changes while ignoring an old response', async () => {
    const requests = [];
    const f = fixture({ fetch: url => new Promise(resolve => requests.push({ url, resolve })) });
    load(f.c, 'src/packages/VideoTime/VideoTime.js');
    f.c.initPkg_VideoTime(); await f.run(1000);
    assert.equal(requests.length, 1);
    f.setHash('videoB');
    const hashObserver = f.observers.find(o => o.target.getAttribute);
    hashObserver.callback([{ attributeName: 'hashid' }]);
    assert.equal(f.c.VideoTime_formatPreview(13), '00:00:13');
    requests[1].resolve({ json: async () => ({ data: { viewthumb: [{ url: 'x--20261117130000/thumb' }] } }) });
    await flush();
    const startB = vm.runInContext('videoStartTime', f.c);
    requests[0].resolve({ json: async () => ({ data: { viewthumb: [{ url: 'x--20261117120000/thumb' }] } }) });
    await flush();
    assert.equal(vm.runInContext('videoStartTime', f.c), startB);
    const previewObserver = f.observers.find(o => o.target === f.preview);
    previewObserver.callback([{ attributeName: 'showtime' }]);
    assert.equal(f.label.innerHTML, new Date(startB + 13000).toISOString() + '<br/>00:00:13');
    previewObserver.callback([{ attributeName: 'isshow' }]); await f.run(0);
    assert.match(f.label.innerHTML, /00:00:13$/);
});

test('download and copy use highest available replay quality, update progress and block stale video identity', async () => {
    const starts = [], handlers = {}, requests = [];
    const f = fixture({
        DyVideoSign: class { getSign() { return 'signed=ok'; } },
        getVideoStreamUrl: async (...args) => { requests.push(args); return { data: { thumb_video: { high: { url: 'high.m3u8' }, super: { url: 'super.m3u8' } } } }; },
        M3U8: class { start(...args) { starts.push(args); const result = { on(type, callback) { handlers[type] = callback; return result; } }; return result; } },
    });
    load(f.c, 'src/packages/DyVideoDownload/DyVideoDownload.js');
    f.c.initPkg_DyVideoDownload_Func();
    await f.ids['#download__copy'].click();
    assert.deepEqual(f.clipboard, ['super.m3u8']);
    await f.ids['#download__default'].click();
    assert.equal(starts[0][0], 'super.m3u8'); assert.equal(starts[0][1].filename, 'Replay.mp4');
    handlers.progress({ percentage: 25.126 }); assert.equal(f.ids['#download-text'].innerText, '25.13%');
    handlers.finished(); assert.equal(f.ids['#download-text'].innerText, '下载完成');
    handlers.error('failed'); assert.equal(f.ids['#download-text'].innerText, '下载失败');
    handlers.aborted(); assert.equal(f.ids['#download-text'].innerText, '下载中止');
    f.setHash('videoB'); await f.ids['#download__copy'].click();
    assert.equal(requests.length, 2); assert.equal(f.clipboard.length, 1);
});

test('XLSX and ASS export buttons traverse every barrage page using current video identity', async () => {
    const offsets = [];
    const f = fixture({ getVideoBarrageByTime: async (vid, offset) => {
        offsets.push([vid, offset]);
        return { data: { pre: offset === 0 ? 10 : -1, list: [{ vid: 100, uid: offset + 1, nn: 'Viewer', ctt: offset === 0 ? 'first' : 'second', tl: offset === 0 ? 2000 : 1000, sts: 1700000000, col: 7 }] } };
    } });
    load(f.c, 'src/require/ASS/ASS.js', 'src/packages/DyVideoDownload/DyVideoDownload.js');
    f.c.initPkg_DyVideoDownload_Func();
    await f.ids['#download__barrage'].click();
    assert.equal(f.exports[0][0].length, 7); assert.equal(f.exports[0][1].length, 2);
    assert.equal(f.exports[0][1][0][1], 'videoA'); assert.equal(f.exports[0][1][1][4], 'second');
    assert.equal(f.exports[0][2], '【Replay title】弹幕数据.xlsx');
    await f.ids['#download__barrageass'].click();
    assert.equal(f.downloads[0][0], 'Replay title.ass');
    assert.match(f.downloads[0][1], /\[Script Info\]/); assert.match(f.downloads[0][1], /Style: Color7/);
    assert.equal((f.downloads[0][1].match(/Dialogue:/g) || []).length, 2);
    assert.ok(f.downloads[0][1].indexOf('second') < f.downloads[0][1].indexOf('first'));
    assert.deepEqual(offsets, [['videoA', 0], ['videoA', 10], ['videoA', 0], ['videoA', 10]]);
});

test('replay APIs retain request parameters and reject failures rather than leaving exports pending', async () => {
    const requests = [];
    const f = fixture({ fetch: async (url, options) => { requests.push({ url, options }); if (url.includes('getStreamUrl')) return { json: async () => ({ error: 0 }) }; throw Error('offline'); } });
    load(f.c, 'src/packages/DyVideoDownload/apis.js');
    await f.c.getVideoStreamUrl('videoA', 'signed=yes');
    assert.equal(requests[0].options.body, 'signed=yes&vid=videoA');
    const result = await Promise.race([f.c.getVideoBarrageByTime('videoA', 20).then(() => 'resolved', () => 'rejected'), new Promise(resolve => setTimeout(() => resolve('pending'), 25))]);
    assert.equal(result, 'rejected');
    assert.match(requests[1].url, /vid=videoA&offset=20$/);
});

test('export failures release the action and invalid pagination ends with a visible error', async () => {
    let mode = 'offline';
    const f = fixture({ getVideoBarrageByTime: async () => {
        if (mode === 'offline') throw Error('offline');
        return { data: { pre: mode === 'repeat' ? 0 : -1, list: [] } };
    } });
    load(f.c, 'src/packages/DyVideoDownload/DyVideoDownload.js');
    f.c.initPkg_DyVideoDownload_Func();
    await f.ids['#download__barrage'].click();
    assert.equal(f.exports.length, 0);
    assert.equal(f.messages.at(-1)[1], 'error');
    mode = 'repeat'; await f.ids['#download__barrage'].click();
    assert.match(f.messages.at(-1)[0], /分页未前进/);
    mode = 'ok'; await f.ids['#download__barrage'].click();
    assert.equal(f.exports.length, 1);
});

test('density curve supports empty pages and ignores out-of-duration barrage timestamps', async () => {
    let rows = [];
    const f = fixture({ getVideoBarrageByTime: async () => ({ data: { pre: -1, list: rows } }) });
    load(f.c, 'src/packages/DyVideoDownload/DyVideoBarrageLine.js');
    await f.c.renderVideoBarrageLine();
    assert.equal(f.progressBar.childNodes.filter(n => !n.removed).length, 1);
    assert.doesNotMatch(f.progressBar.childNodes[0].innerHTML, /NaN|Infinity/);
    await f.run(1000);
    rows = [{ tl: -1 }, { tl: 0 }, { tl: 1000 }, { tl: 60000 }, { tl: 65000 }];
    await f.c.renderVideoBarrageLine();
    assert.doesNotMatch(f.progressBar.childNodes[0].innerHTML, /NaN|Infinity/);
    assert.equal(f.progressBar.childNodes.filter(n => !n.removed).length, 1);
});

test('switching replay while density data loads cannot paint the previous video over the new one', async () => {
    const pending = [];
    const f = fixture({ getVideoBarrageByTime: (vid, offset) => new Promise(resolve => pending.push({ vid, resolve })) });
    load(f.c, 'src/packages/DyVideoDownload/DyVideoBarrageLine.js');
    const old = f.c.renderVideoBarrageLine();
    f.setHash('videoB');
    const latest = f.c.renderVideoBarrageLine();
    assert.equal(pending.length, 2);
    pending[1].resolve({ data: { pre: -1, list: [{ tl: 30000 }] } }); await latest;
    const current = f.progressBar.childNodes[0].innerHTML;
    pending[0].resolve({ data: { pre: -1, list: [{ tl: 1000 }] } }); await old;
    assert.equal(f.progressBar.childNodes[0].innerHTML, current);
    assert.equal(f.progressBar.childNodes.filter(n => !n.removed).length, 1);
});

test('replay signature runs the used decoder branch and calls the page signer with point/did/time', () => {
    const calls = [];
    const page = new Proxy({}, { get(target, name) { return (...args) => { calls.push({ name, args }); return 'page-signature'; }; } });
    const f = fixture({ unsafeWindow: page, CryptoJS: { MM: () => ({ toString: () => '00000000000000000000000000000000' }) } });
    load(f.c, 'src/require/DyVideoSign/DyVideoSign.js');
    vm.runInContext('globalThis.signer = new DyVideoSign(99)', f.c);
    const decoded = f.c.signer.d539fa2cf7732d2a(256042, '9f4f419501570ad13334');
    assert.equal(typeof decoded, 'string'); assert.ok(decoded.endsWith('34'));
    assert.equal(f.c.signer.getSign(), 'page-signature');
    assert.equal(calls[0].name, decoded); assert.equal(calls[0].args[0], 99);
    assert.equal(calls[0].args[1], '10000000000000000000000000001501');
    assert.ok(Math.abs(calls[0].args[2] - Math.floor(Date.now() / 1000)) < 2);
    assert.throws(() => f.c.signer.d539fa2cf7732d2a(1, '12345678'), /Unsupported replay signature format/);
});
