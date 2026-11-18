const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../src/packages/Night/Night.js'), 'utf8');
function harness({ url = 'https://www.douyu.com/123', embedded = false, savedMode = 0 } = {}) {
    const listeners = new Map(), hooks = [], sent = [], styles = new Map();
    const icon = { addEventListener(type, fn) { this[type] = fn; } };
    let frame = null;
    const win = { addEventListener(type, fn) {
        const list = listeners.get(type) || []; list.push(fn); listeners.set(type, list);
    } };
    win.parent = embedded ? { postMessage: (data, origin) => sent.push({ data: JSON.parse(JSON.stringify(data)), origin }) } : win;
    const storage = new Map([['ExSave_Mode', JSON.stringify({ mode: savedMode })]]);
    const c = vm.createContext({
        URL, window: win, location: new URL(url),
        document: {
            querySelector: selector => selector === '.BottomGroup iframe' ? frame : null,
            getElementById: id => id === 'ex-night' ? icon : null,
            getElementsByClassName: () => [],
        },
        localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
        StyleHook_set: (key, value) => styles.set(key, value),
        StyleHook_remove: key => styles.delete(key),
        DomHook: class { constructor(selector, subtree, callback) { hooks.push({ selector, subtree, callback }); } },
    });
    vm.runInContext(source, c);
    return {
        c, win, styles, sent, hooks, icon, storage,
        dispatch: event => { for (const fn of listeners.get('message') || []) fn(event); },
        listenerCount: () => (listeners.get('message') || []).length,
        mount(value) { frame = value; for (const hook of hooks) hook.callback([]); },
    };
}
function frame(src = 'https://yuba.douyu.com/group/123') {
    const sent = [], listeners = new Map();
    return {
        src, sent,
        contentWindow: { postMessage: (data, origin) => sent.push({ data: JSON.parse(JSON.stringify(data)), origin }) },
        getAttribute(name) { return name === 'src' ? this.src : null; },
        addEventListener(name, fn) { const list = listeners.get(name) || []; list.push(fn); listeners.set(name, list); },
        load() { for (const fn of listeners.get('load') || []) fn(); },
        listenerCount: () => (listeners.get('load') || []).length,
    };
}

test('saved night mode reaches an existing iframe and single-click toggles synchronize both themes', () => {
    const h = harness({ savedMode: 1 }), f = frame();
    h.mount(f);
    h.c.initPkg_Night_Set_Fast();
    h.c.initPkg_Night_Set();
    h.c.initPkg_Night_Func();
    h.c.watchBottomIframe();
    assert.equal(h.styles.has('Ex_Style_NightMode'), true);
    assert.deepEqual(f.sent.at(-1), { data: { type: 'douyuex:night-mode', mode: 1 }, origin: 'https://yuba.douyu.com' });
    h.icon.click();
    assert.equal(h.styles.has('Ex_Style_NightMode'), false);
    assert.equal(f.sent.at(-1).data.mode, 0);
    assert.equal(JSON.parse(h.storage.get('ExSave_Mode')).mode, 0);
    h.icon.click();
    assert.equal(h.styles.has('Ex_Style_NightMode'), true);
    assert.equal(f.sent.at(-1).data.mode, 1);
});

test('late iframe, reload and replacement synchronize without duplicate listeners or stale frame messages', () => {
    const h = harness({ savedMode: 1 });
    h.c.initPkg_Night_Set_Fast();
    h.c.watchBottomIframe();
    h.c.watchBottomIframe();
    assert.equal(h.hooks.length, 1);
    assert.equal(h.listenerCount(), 1);
    const a = frame();
    h.mount(a);
    assert.equal(a.sent.length, 1);
    assert.equal(a.sent[0].data.mode, 1);
    h.mount(a);
    assert.equal(a.sent.length, 1);
    assert.equal(a.listenerCount(), 1);
    a.load();
    assert.equal(a.sent.length, 2);
    const b = frame();
    h.mount(b);
    assert.equal(b.sent.length, 1);
    a.load();
    assert.equal(a.sent.length, 2);
    h.mount(null);
    b.load();
    assert.equal(b.sent.length, 1);
});

test('parent handshake accepts only the current official Yuba iframe and exact origin', () => {
    const h = harness(), f = frame();
    h.mount(f); h.c.watchBottomIframe();
    const event = { data: { type: 'douyuex:night-ready' }, source: f.contentWindow, origin: 'https://yuba.douyu.com' };
    for (const origin of ['https://evil.test', 'https://yuba.douyu.com.evil.test', 'https://yuba.douyu.com:8443', 'null']) h.dispatch({ ...event, origin });
    h.dispatch({ ...event, source: {} });
    h.dispatch({ ...event, data: { type: 'other' } });
    assert.equal(f.sent.length, 1);
    h.dispatch(event);
    assert.equal(f.sent.length, 2);
    for (const src of ['about:blank', 'https://evil.test', 'https://yuba.douyu.com.evil.test/', 'https://yuba.douyu.com:8443/']) {
        const bad = frame(src); h.mount(bad); bad.load();
        assert.equal(bad.sent.length, 0, src);
    }
});

test('embedded Yuba accepts only parent-origin mode and always applies its fixed local CSS', () => {
    const h = harness({ url: 'https://yuba.douyu.com/group/1', embedded: true });
    h.c.initPkg_Night_EmbeddedYuba(); h.c.initPkg_Night_EmbeddedYuba();
    assert.equal(h.listenerCount(), 1);
    assert.deepEqual(h.sent.map(x => x.origin), ['https://www.douyu.com', 'https://douyu.com']);
    const event = { source: h.win.parent, origin: 'https://www.douyu.com', data: { type: 'douyuex:night-mode', mode: 1 } };
    for (const origin of ['https://evil.test', 'https://www.douyu.com.evil.test', 'https://www.douyu.com:8443', 'null']) h.dispatch({ ...event, origin });
    h.dispatch({ ...event, source: {} });
    for (const mode of ['1', true, -1, 2, null]) h.dispatch({ ...event, data: { ...event.data, mode } });
    assert.equal(h.styles.size, 0);
    h.dispatch({ ...event, data: { ...event.data, css: 'evil { color: red }' } });
    const css = h.styles.get('Ex_Style_NightModeIframe');
    assert.equal(css, h.c.Night_getIframeStyles());
    assert.match(css, /#groupListBox/);
    assert.doesNotMatch(css, /evil/);
    h.dispatch({ ...event, origin: 'https://douyu.com', data: { ...event.data, mode: 0 } });
    assert.equal(h.styles.size, 0);
});

test('standalone Yuba and other embedded sites never install the bridge', () => {
    for (const options of [{ url: 'https://yuba.douyu.com/group/1' }, { url: 'https://evil.test/', embedded: true }, { url: 'https://www.douyu.com/123', embedded: true }]) {
        const h = harness(options); h.c.initPkg_Night_EmbeddedYuba();
        assert.equal(h.listenerCount(), 0);
        assert.equal(h.sent.length, 0);
    }
});

test('ready handshake recovers a theme sent before the child script was ready', () => {
    const parent = harness({ savedMode: 1 }), child = harness({ url: 'https://yuba.douyu.com/group/1', embedded: true }), f = frame();
    parent.mount(f); parent.c.initPkg_Night_Set_Fast(); parent.c.watchBottomIframe();
    assert.equal(f.sent.length, 1); // this initial post may precede child initialization
    child.c.initPkg_Night_EmbeddedYuba();
    parent.dispatch({ data: child.sent[0].data, origin: 'https://yuba.douyu.com', source: f.contentWindow });
    child.dispatch({ data: f.sent.at(-1).data, source: child.win.parent, origin: 'https://www.douyu.com' });
    assert.equal(child.styles.has('Ex_Style_NightModeIframe'), true);
});
