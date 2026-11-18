const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

class Element {
  constructor(tag = 'div') {
    this.tagName = tag.toLowerCase();
    this.children = [];
    this.parentNode = null;
    this.style = {};
    this.attributes = {};
    this.listeners = {};
    this.id = '';
    this.className = '';
    this.checked = false;
    this.clicks = 0;
    this.classList = {
      contains: (value) => this.className.split(/\s+/).includes(value),
      add: (...values) => { this.className = [...new Set([...this.className.split(/\s+/).filter(Boolean), ...values])].join(' '); },
      remove: (...values) => { this.className = this.className.split(/\s+/).filter((v) => !values.includes(v)).join(' '); },
      toggle: (value, enabled) => {
        if (enabled === undefined) enabled = !this.classList.contains(value);
        this.classList[enabled ? 'add' : 'remove'](value);
        return enabled;
      },
    };
  }
  get childNodes() { return this.children; }
  get firstChild() { return this.children[0] || null; }
  get isConnected() { let node = this; while (node.parentNode) node = node.parentNode; return node.tagName === 'document'; }
  get parentElement() { return this.parentNode; }
  get nextSibling() { return this.parentNode?.children[this.parentNode.children.indexOf(this) + 1] || null; }
  set innerHTML(value) {
    this.children = [];
    this.html = value;
    for (const match of value.matchAll(/<([a-z][a-z0-9-]*)\b([^>]*)>/gi)) {
      const node = new Element(match[1]);
      for (const attr of match[2].matchAll(/([\w-]+)(?:="([^"]*)"|='([^']*)')?/g)) {
        const key = attr[1], val = attr[2] ?? attr[3] ?? '';
        node.setAttribute(key, val);
      }
      this.appendChild(node);
    }
  }
  get innerHTML() { return this.html || ''; }
  appendChild(node) { return this.insertBefore(node, null); }
  remove() { if (this.parentNode) { this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1); this.parentNode = null; } }
  insertBefore(node, before) {
    if (node.parentNode) node.parentNode.children.splice(node.parentNode.children.indexOf(node), 1);
    const index = before ? this.children.indexOf(before) : this.children.length;
    this.children.splice(index < 0 ? this.children.length : index, 0, node);
    node.parentNode = this;
    return node;
  }
  setAttribute(name, value) {
    this.attributes[name] = value;
    if (name === 'class') this.className = value;
    else if (name === 'checked') this.checked = true;
    else this[name] = value;
  }
  getAttribute(name) { return this.attributes[name]; }
  addEventListener(type, callback) { (this.listeners[type] ||= []).push(callback); }
  dispatchEvent(event) { for (const callback of this.listeners[event.type] || []) callback(event); }
  click() {
    this.clicks++;
    if (this.type === 'checkbox') this.checked = !this.checked;
    this.dispatchEvent({ type: 'click', stopPropagation() {}, stopImmediatePropagation() {} });
  }
  matches(selector) {
    if (selector.includes(',')) return selector.split(',').some((part) => this.matches(part.trim()));
    const descendants = selector.trim().split(/\s+/);
    if (descendants.length > 1) {
      if (!this.matches(descendants.pop())) return false;
      const ancestorSelector = descendants.join(' ');
      for (let ancestor = this.parentNode; ancestor; ancestor = ancestor.parentNode) if (ancestor.matches(ancestorSelector)) return true;
      return false;
    }
    const tag = selector.match(/^[a-z][\w-]*/i)?.[0];
    if (tag && this.tagName !== tag) return false;
    if (selector.includes(':checked') && !this.checked) return false;
    const id = selector.match(/#([\w-]+)/)?.[1];
    if (id && this.id !== id) return false;
    for (const match of selector.matchAll(/\.([\w-]+)/g)) if (!this.classList.contains(match[1])) return false;
    for (const match of selector.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)) {
      if (match[2] !== undefined ? String(this[match[1]]) !== match[2] : !(match[1] in this.attributes)) return false;
    }
    return true;
  }
  querySelectorAll(selector) {
    const nodes = [];
    for (const child of this.children) {
      if (child.matches(selector)) nodes.push(child);
      nodes.push(...child.querySelectorAll(selector));
    }
    return nodes;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  getElementsByClassName(name) { return this.querySelectorAll('.' + name.trim().split(/\s+/).join('.')); }
  getElementsByTagName(name) { return this.querySelectorAll(name); }
  getBoundingClientRect() { return { top: 500, left: 300, width: 100 }; }
}

function environment(saved = {}) {
  const document = new Element('document');
  document.body = document.appendChild(new Element('body'));
  document.head = document.appendChild(new Element('head'));
  document.createElement = (tag) => new Element(tag);
  document.getElementById = (id) => document.querySelector('#' + id);
  const values = new Map(Object.entries(saved).map(([key, value]) => [key, typeof value === 'string' ? value : JSON.stringify(value)]));
  const intervals = new Map(), timeouts = new Map(), styles = new Map(), notices = [];
  let nextId = 1;
  const clock = { now: new Date(2026, 10, 17, 12, 0).getTime() };
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [clock.now])); }
    static now() { return clock.now; }
  }
  const context = vm.createContext({
    document, console: { log() {}, error() {} }, Date: ClockDate, AbortController,
    Event: class { constructor(type) { this.type = type; } },
    window: { innerHeight: 800, innerWidth: 1200 }, unsafeWindow: {}, rid: '123',
    setInterval(fn, ms) { const id = nextId++; intervals.set(id, { fn, ms }); return id; },
    clearInterval(id) { intervals.delete(id); },
    setTimeout(fn, ms) { const id = nextId++; timeouts.set(id, { fn, ms }); return id; },
    clearTimeout(id) { timeouts.delete(id); },
    sleep: async () => {},
    localStorage: { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)) },
    showMessage: (...args) => notices.push(args),
    StyleHook_set: (key, value) => styles.set(key, value),
    StyleHook_remove: (key) => styles.delete(key),
    getValidDom: (selectors) => selectors.map((s) => document.querySelector(s)).find(Boolean),
    PostbirdAlertBox: { confirm() { throw new Error('Unexpected layout confirmation'); } },
    getCCN: () => 'token', exPanelTimer: null,
    showExRightPanel() {}, resizeWindow() {},
  });
  return {
    context, document, values, intervals, timeouts, styles, notices, clock,
    load(...files) { for (const file of files) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file }); },
    run(code) { return vm.runInContext(code, context); },
    add({ tag = 'div', id = '', className = '', parent = document.body, ...attrs } = {}) {
      const node = new Element(tag); Object.assign(node, { id, className }, attrs); parent.appendChild(node); return node;
    },
    async tick(ms) { for (const { fn, ms: period } of [...intervals.values()]) if (ms === undefined || ms === period) await fn(); await settle(); },
  };
}

async function settle() { for (let i = 0; i < 12; i++) await Promise.resolve(); }
const expand = 'src/packages/ExpandTool/';
const refresh = 'src/packages/Refresh/';

test('扩展面板只有五项偏好和钓鱼，旧删减功能设置不再创建界面或任务', () => {
  const env = environment({ ExSave_Gold: { enabled: true }, ExSave_RedPacket: { enabled: true } });
  env.add({ className: 'layout-Player-chat' });
  env.add({ className: 'ex-panel__wrap' });
  env.load(...['ExpandTool.js', 'ExpandTool_AutoFish.js', 'ExpandTool_AutoBarrageColor.js', 'ExpandTool_FullScreen.js', 'ExpandTool_P2P.js', 'ExpandTool_TabSwitch.js'].map((name) => expand + name));
  env.context.initPkg_ExpandTool();
  const ids = env.document.querySelectorAll('input[type="checkbox"]').map((node) => node.id);
  assert.deepEqual(ids, ['extool__autobarragecolor', 'extool__fullscreen', 'extool__highestvideoquality', 'extool__tabSwitch', 'extool__p2p', 'extool__autofish_start']);
  assert.equal(env.document.querySelectorAll('input[type="radio"]').length, 2);
  assert.equal(env.intervals.size, 0);
  env.context.initPkg_ExpandTool();
  assert.equal(env.document.querySelectorAll('.extool').length, 1);
  assert.ok(env.document.querySelectorAll('input[type="checkbox"]').every((node) => !node.checked));
});

function layoutEnvironment(saved) {
  const env = environment(saved);
  env.add({ className: 'Barrage-toolbar' });
  env.add({ className: 'Barrage original-layout' });
  env.context.refresh_Video_getStatus = () => true;
  env.load(refresh + 'Refresh.js', refresh + 'Refresh_Barrage.js', refresh + 'Refresh_BarrageFrame.js');
  env.context.initPkg_Refresh_BarrageFrame();
  env.context.initPkg_Refresh_Barrage();
  return env;
}

test('前缀与拉高直接切换、独立保存，缺少榜单/活动节点也正常，刷新恢复一致', () => {
  const env = layoutEnvironment();
  const prefix = env.document.getElementById('refresh-barrage');
  const frame = env.document.getElementById('refresh-barrage-frame');
  prefix.click(); frame.click();
  assert.equal(prefix.classList.contains('ex-active'), true);
  assert.equal(frame.classList.contains('ex-active'), true);
  assert.equal(env.document.querySelector('.Barrage').classList.contains('top-0-important'), true);
  assert.equal(env.document.querySelector('.Barrage').classList.contains('original-layout'), true);
  assert.equal(env.styles.size, 2);
  const saved = JSON.parse(env.values.get('ExSave_Refresh'));
  assert.deepEqual(saved, { barrageFrame: { status: true }, video: { status: true }, barrage: { status: true } });
  const restored = layoutEnvironment({ ExSave_Refresh: saved });
  assert.equal(restored.document.querySelector('.Barrage').classList.contains('top-0-important'), true);
  assert.equal(restored.styles.size, 2);
  prefix.click();
  assert.equal(env.styles.has('Ex_Style_RefreshBarrage'), false);
  assert.equal(env.styles.has('Ex_Style_RefreshBarrageFrame'), true);
  frame.click();
  assert.equal(env.styles.size, 0);
  assert.equal(env.document.querySelector('.Barrage').classList.contains('original-layout'), true);
  assert.equal(JSON.parse(env.values.get('ExSave_Refresh')).video.status, true);
});

test('主工具条固定四项顺序，浮动回礼物栏时恢复定位', () => {
  const env = environment();
  const row = env.add({ className: 'PlayerToolbar-ContentRow' });
  env.add({ className: 'PlayerToolbar', offsetHeight: 80 });
  env.add({ id: 'js-player-dialog' });
  const panel = env.add({ className: 'ex-panel', parent: row });
  const wrap = env.add({ className: 'ex-panel__wrap', parent: panel });
  for (const className of ['ex-monitor', 'extool-icon', 'ex-sign', 'fans-continue']) env.add({ className, parent: wrap });
  env.load('src/packages/ExPanel/ExPanel.js');
  env.context.ExPanel_orderLiteTools();
  assert.deepEqual(wrap.children.map((node) => node.className), ['ex-sign', 'fans-continue', 'extool-icon', 'ex-monitor']);
  row.style.visibility = 'hidden'; env.context.showExPanel();
  assert.equal(panel.classList.contains('ex-panel--floating'), true);
  assert.equal(panel.style.position, 'fixed');
  row.style.visibility = 'visible'; env.context.ExPanel_onGiftBarShow();
  assert.equal(panel.parentNode, row);
  assert.equal(panel.style.position, '');
  assert.equal(panel.style.bottom, '80px');
});

test('播放器right宿主替换后迁回同一菜单和滤镜，保留选择和点击监听', () => {
  const env = environment();
  let toolbar = env.add({ className: 'right-e7ea5d' });
  let attached = 0, actionCount = 0;
  const callbacks = [];
  env.context.getValidDom = () => toolbar;
  env.context.DomHook = class { constructor(selector, subtree, callback) { callbacks.push(callback); } };
  env.load('src/packages/VideoTools/VideoToolbarMenu/VideoToolbarMenu.js');
  env.context.VideoToolbarMenu_insertDom = () => {
    const root = env.add({ id: 'ex-vtoolbar-menu', parent: toolbar });
    const filter = env.add({ id: 'ex-vtoolbar-filter-host', parent: root });
    env.add({ tag: 'select', id: 'filter__select', value: 'Aden', parent: filter });
  };
  env.context.VideoToolbarMenu_bindEvents = () => {
    attached++;
    env.document.getElementById('ex-vtoolbar-menu').addEventListener('click', () => actionCount++);
  };
  env.context.initPkg_VideoTools_VideoToolbarMenu();
  const menu = env.document.getElementById('ex-vtoolbar-menu');
  const filter = env.document.getElementById('ex-vtoolbar-filter-host');
  const selection = env.document.getElementById('filter__select');
  menu.click(); assert.equal(actionCount, 1);
  toolbar.parentNode.children.splice(toolbar.parentNode.children.indexOf(toolbar), 1);
  toolbar.parentNode = null;
  toolbar = env.add({ className: 'right-17e251' });
  callbacks[0](); callbacks[0]();
  assert.equal(env.document.getElementById('ex-vtoolbar-menu'), menu);
  assert.equal(env.document.getElementById('ex-vtoolbar-filter-host'), filter);
  assert.equal(env.document.getElementById('filter__select'), selection);
  assert.equal(selection.value, 'Aden');
  assert.equal(menu.parentNode, toolbar);
  menu.click(); assert.equal(actionCount, 2); assert.equal(attached, 1);
  env.context.initPkg_VideoTools_VideoToolbarMenu();
  assert.equal(callbacks.length, 1);
});

test('精灵球支持礼物栏迟到和空宿主替换，四项面板及事件保留', () => {
  const env = environment();
  const hooks = [];
  env.context.DomHook = class { constructor(selector, subtree, callback) { hooks.push(callback); } };
  env.context.curVersion = 'test';
  env.load('src/packages/ExIcon/ExIcon.js', 'src/packages/ExPanel/ExPanel.js');
  env.context.initPkg_ExIcon(); env.context.initPkg_ExPanel();
  const panel = env.document.querySelector('.ex-panel');
  const wrap = panel.querySelector('.ex-panel__wrap');
  assert.equal(panel.parentNode, env.document.body);
  assert.equal(env.document.querySelector('.ex-icon'), null);
  let invoked = 0;
  for (const className of ['ex-sign', 'fans-continue', 'extool-icon', 'ex-monitor']) {
    env.add({ className, parent: wrap }).addEventListener('click', () => invoked++);
  }
  const cell = env.add({ className: 'PlayerToolbar-ContentCell' });
  let host = env.add({ className: 'PlayerToolbar-Wealth', parent: cell });
  hooks.forEach((callback) => callback());
  const icon = env.document.querySelector('.ex-icon');
  assert.equal(icon.parentNode, host); assert.equal(panel.parentNode, host);
  icon.click(); assert.equal(panel.style.display, 'block');
  host.remove(); host = env.add({ className: 'PlayerToolbar-Wealth', parent: cell });
  hooks.forEach((callback) => callback());
  assert.equal(env.document.querySelector('.ex-panel'), panel);
  assert.equal(env.document.querySelector('.ex-icon'), icon);
  assert.equal(panel.parentNode, host); assert.equal(icon.parentNode, host);
  assert.equal(panel.style.display, 'block');
  wrap.children.forEach((action) => action.click()); assert.equal(invoked, 4);
  icon.click(); assert.equal(panel.style.display, 'none');
  env.context.initPkg_ExIcon(); env.context.initPkg_ExPanel();
  assert.equal(env.document.querySelectorAll('.ex-icon').length, 1);
  assert.equal(env.document.querySelectorAll('.ex-panel').length, 1);
  assert.equal(hooks.length, 6);
});

test('浮动精灵球所在播放器宿主替换后迁回原面板', () => {
  const env = environment();
  const hooks = [];
  env.context.DomHook = class { constructor(selector, subtree, callback) { hooks.push(callback); } };
  const row = env.add({ className: 'PlayerToolbar-ContentRow' }); row.style.visibility = 'hidden';
  let dialog = env.add({ id: 'js-player-dialog' });
  env.load('src/packages/ExPanel/ExPanel.js'); env.context.initPkg_ExPanel();
  const panel = env.document.querySelector('.ex-panel');
  env.context.showExPanel(); assert.equal(panel.parentNode, dialog);
  dialog.remove(); dialog = env.add({ id: 'js-player-dialog' });
  hooks.forEach((callback) => callback());
  assert.equal(env.document.querySelector('.ex-panel'), panel);
  assert.equal(panel.parentNode, dialog); assert.equal(panel.style.display, 'block');
});

test('DomHook 支持仅 class/id 改名的迟到宿主，忽略无关已绑定节点属性变化', () => {
  const env = environment(); const observers = [];
  env.document.documentElement = env.document.body;
  env.context.MutationObserver = class {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe(target, options) { this.target = target; this.options = options; }
    disconnect() { this.target = null; }
  };
  env.load('src/require/DomHook/DomHook.js');
  let calls = 0; env.context.hostChanged = () => calls++;
  env.run('globalThis.hook = new DomHook(".late-host", false, hostChanged)');
  const late = env.add({ className: 'pending-host' });
  late.className = 'late-host';
  observers[1].callback([{ type: 'attributes', attributeName: 'class', target: late }]);
  assert.equal(calls, 1); assert.equal(env.context.hook.target, late);
  assert.deepEqual(Array.from(observers[1].options.attributeFilter), ['class', 'id']);
  let queries = 0; const query = env.document.querySelector.bind(env.document);
  env.document.querySelector = (...args) => { queries++; return query(...args); };
  const unrelated = env.add({ className: 'scrolling-comment' });
  observers[1].callback([{ type: 'attributes', attributeName: 'class', target: unrelated }]);
  assert.equal(queries, 0); assert.equal(calls, 1);
  late.className = 'old-host';
  observers[1].callback([{ type: 'attributes', attributeName: 'class', target: late }]);
  assert.equal(env.context.hook.target, null);
  late.className = 'late-host';
  observers[1].callback([{ type: 'attributes', attributeName: 'class', target: late }]);
  assert.equal(calls, 2);
  env.context.hook.closeHook(); assert.equal(observers[1].target, null);
});

function followEnvironment() {
  const env = environment();
  const tab = env.add({ className: 'Header-follow-tab is-active', innerText: '全部关注' });
  const panel = env.add({ className: 'Header-follow-listWrap' });
  const original = env.add({ className: 'Header-follow-listBox', parent: panel });
  env.context.GM_getValue = async () => false;
  env.context.GM_setValue = async () => {};
  env.context.formatSeconds = () => '1小时';
  env.context.CClick = class { constructor(node) { this.node = node; } longClick(callback) { this.node.longClick = callback; } click(callback) { this.node.shortClick = callback; } };
  const pages = [], videos = [];
  env.context.videoPlayerArr = [];
  env.context.openPage = (...args) => pages.push(args);
  env.context.createNewVideo = (...args) => videos.push(args);
  env.load('src/packages/Sign/Sign_Request.js', 'src/packages/FollowList/FollowList.js');
  const payload = { error: 0, data: { list: [{ show_status: '1', videoLoop: '0', room_id: '456', avatar_small: '', nickname: '主播', online: 10, room_name: '直播中', show_time: 0 }] } };
  return { ...env, tab, panel, original, payload, pages, videos };
}

test('关注列表请求去重且原列表成功前可用，刷新不重复并保留三种打开方式', async () => {
  const env = followEnvironment(); let resolveRequest, requests = 0, nativeClicks = 0;
  env.original.addEventListener('click', () => nativeClicks++);
  env.context.fetch = () => { requests++; return new Promise((resolve) => { resolveRequest = resolve; }); };
  const first = env.context.setNewFollowList(env.panel), second = env.context.setNewFollowList(env.panel);
  assert.equal(first, second); await settle(); assert.equal(requests, 1);
  assert.notEqual(env.original.style.display, 'none');
  resolveRequest({ json: async () => env.payload }); await first;
  assert.equal(env.original.style.display, 'none');
  assert.equal(env.document.querySelectorAll('#refreshFollowList').length, 1);
  env.context.fetch = async () => ({ json: async () => env.payload });
  await env.context.setNewFollowList(env.panel);
  assert.equal(env.document.querySelectorAll('#refreshFollowList').length, 1);
  assert.equal(env.document.querySelectorAll('.ExFollowListItem').length, 1);
  env.original.click(); assert.equal(nativeClicks, 1);
  const item = env.document.querySelector('.ExFollowListItem');
  await item.shortClick({ preventDefault() {} }); item.longClick(); item.dispatchEvent({ type: 'mousedown', button: 1 });
  assert.equal(env.pages.length, 2); assert.equal(env.videos.length, 1);
  assert.equal(env.pages[0][0], 'https://www.douyu.com/456');
  assert.equal(env.timeouts.size, 0);
});

for (const failure of ['network', 'timeout', 'api']) {
  test('关注列表 ' + failure + ' 失败保留原列表，下一次加载可恢复', async () => {
    const env = followEnvironment();
    env.context.fetch = async (url, options) => {
      if (failure === 'network') throw new Error('offline');
      if (failure === 'api') return { json: async () => ({ error: 1 }) };
      return new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('timeout'))));
    };
    const request = env.context.handleFollowList(); await settle();
    if (failure === 'timeout') [...env.timeouts.values()].find(({ ms }) => ms === 30000).fn();
    await request;
    assert.notEqual(env.original.style.display, 'none');
    assert.equal(env.document.querySelector('.ExFollowListItem'), null);
    assert.equal(env.timeouts.size, 0);
    env.context.fetch = async () => ({ json: async () => env.payload });
    await env.context.handleFollowList();
    assert.equal(env.document.querySelectorAll('.ExFollowListItem').length, 1);
  });
}

test('关注列表异步返回不会写入已切换页签或已被替换的旧容器', async () => {
  for (const scenario of ['tab', 'host']) {
    const env = followEnvironment(); let resolveRequest;
    env.context.fetch = () => new Promise((resolve) => { resolveRequest = resolve; });
    const request = env.context.handleFollowList(); await settle();
    if (scenario === 'tab') env.tab.innerText = '特别关注';
    else { env.panel.remove(); env.add({ className: 'Header-follow-listWrap' }); }
    resolveRequest({ json: async () => env.payload }); await request;
    assert.equal(env.panel.querySelector('.ExFollowListItem'), null);
    assert.notEqual(env.original.style.display, 'none');
  }
});

test('动态播放器容器通知不误判输入焦点，后加载的输入框仍阻止方向键', () => {
  const env = environment();
  env.load('src/packages/VideoTools/VideoTools.js');
  env.document.activeElement = env.document.body;
  env.context.VideoTools_updateInputFocus([{ addedNodes: [{}] }]);
  assert.equal(env.run('isInput'), false);
  env.document.activeElement = { tagName: 'TEXTAREA' };
  env.context.VideoTools_updateInputFocus();
  assert.equal(env.run('isInput'), true);
  env.document.activeElement = { tagName: 'DIV', shadowRoot: { activeElement: { tagName: 'DIV', isContentEditable: true } } };
  env.context.VideoTools_updateInputFocus();
  assert.equal(env.run('isInput'), true);
  env.document.activeElement = env.document.body;
  env.context.VideoTools_updateInputFocus();
  assert.equal(env.run('isInput'), false);
});

test('弹幕控件尚未加载时切换礼物栏，不覆盖已保存的前缀与拉高偏好', () => {
  const env = environment({ ExSave_Refresh: { barrageFrame: { status: true }, barrage: { status: true }, video: { status: true } } });
  env.context.refresh_Video_getStatus = () => false;
  env.load(refresh + 'Refresh.js');
  env.context.saveData_Refresh();
  assert.deepEqual(JSON.parse(env.values.get('ExSave_Refresh')), {
    barrageFrame: { status: true }, barrage: { status: true }, video: { status: false },
  });
});

for (const matchRoom of [false, true]) {
  test('自动最高色保留异步色板与锁定规则：' + (matchRoom ? '比赛房间' : '普通房间'), async () => {
    const env = environment();
    const checkbox = env.add({ tag: 'input', id: 'extool__autobarragecolor', type: 'checkbox', checked: true });
    const switcher = env.add({ className: matchRoom ? 'MatchSystemFansBarrageSwitcher' : 'FansBarrageSwitcher' });
    env.load(expand + 'ExpandTool_AutoBarrageColor.js');
    env.context.ExpandTool_AutoBarrageColor_insertFunc();
    env.context.selectHighestUnlockedBarrageColor();
    env.context.selectHighestUnlockedBarrageColor();
    assert.equal(env.intervals.size, 1);
    await env.tick(500); await env.tick(500);
    assert.equal(switcher.clicks, 1);
    const itemClass = matchRoom ? 'MatchSystemFansBarrageColor-item' : 'FansBarrageColor-item';
    const low = env.add({ className: itemClass });
    const high = env.add({ className: itemClass });
    const locked = env.add({ className: itemClass + ' is-lock' });
    await env.tick(500);
    assert.equal(high.clicks, 1); assert.equal(low.clicks, 0); assert.equal(locked.clicks, 0);
    assert.equal(env.intervals.size, 0);
    env.context.selectHighestUnlockedBarrageColor();
    checkbox.click();
    assert.equal(env.intervals.size, 0);
    assert.equal(JSON.parse(env.values.get('ExSave_AutoBarrageColor')).isAutoBarrageColor, false);
  });
}

test('自动全屏和画质等待迟到控件，重复初始化不叠加定时器', async () => {
  const env = environment();
  env.load(expand + 'ExpandTool_FullScreen.js');
  env.context.fullScreen(); env.context.fullScreen();
  assert.equal(env.intervals.size, 1);
  await env.tick(1000);
  const fullscreen = env.add({ className: 'wfs-2a8e83' });
  await env.tick(1000);
  assert.equal(fullscreen.clicks, 1); assert.equal(env.intervals.size, 0);
  let option = null;
  const quality = { querySelector() { return option; } };
  const original = env.document.querySelector.bind(env.document);
  env.document.querySelector = (selector) => selector.includes(':has(') ? quality : original(selector);
  env.context.highestVideoQuality(); env.context.highestVideoQuality();
  await env.tick(1000);
  assert.equal(env.intervals.size, 1);
  option = { clicks: 0, matches: () => false, click() { this.clicks++; } };
  await env.tick(1000);
  assert.equal(option.clicks, 1); assert.equal(env.intervals.size, 0);
});

test('P2P 偏好只在启用时安装拦截；防冻结关闭保留画中画联动', () => {
  const env = environment();
  const original = function PeerConnection() {};
  env.context.unsafeWindow.RTCPeerConnection = original;
  env.load(expand + 'ExpandTool_P2P.js', expand + 'ExpandTool_TabSwitch.js');
  env.context.initKillP2P(); assert.equal(env.context.unsafeWindow.RTCPeerConnection, original);
  env.values.set('ExSave_P2P', JSON.stringify({ isKillP2P: true }));
  env.context.initKillP2P(); assert.notEqual(env.context.unsafeWindow.RTCPeerConnection, original);
  const toggle = env.add({ tag: 'input', id: 'extool__tabSwitch', type: 'checkbox' });
  let stopCount = 0;
  env.context.window.__pip_is_active__ = true;
  env.context.PictureInPictureControl_stopTabAntiFreeze = () => stopCount++;
  env.context.ExpandTool_TabSwitch_insertFunc(); toggle.click();
  assert.equal(env.document.hidden, false);
  env.context.enableTabSwitch();
  assert.equal(env.document.listeners.visibilitychange.length, 1);
  toggle.click(); assert.equal(stopCount, 1);
  assert.equal(JSON.parse(env.values.get('ExSave_TabSwitch')).isEnableTabSwitch, false);
});

function fishingEnvironment({ mode = 'all', saved } = {}) {
  const env = environment(saved);
  const checkbox = env.add({ tag: 'input', id: 'extool__autofish_start', type: 'checkbox' });
  const all = env.add({ tag: 'input', name: 'autofish_mode', value: 'all', checked: mode === 'all' });
  const contest = env.add({ tag: 'input', name: 'autofish_mode', value: 'contest', checked: mode === 'contest' });
  env.load(expand + 'ExpandTool_AutoFish.js');
  env.context.ExpandTool_AutoFish_insertFunc();
  const calls = { info: 0, home: 0, start: 0, end: 0 };
  const state = { stat: 0, fishEtMs: 0 };
  env.context.AutoFish_getFishInfo = async () => { calls.info++; return [{ fishId: 1, name: '小鱼' }]; };
  env.context.AutoFish_getHomepageData = async () => { calls.home++; return { data: { baits: [{ id: 7, inUse: true }], myCh: {}, fishing: { ...state } } }; };
  env.context.AutoFish_startFish = async () => { calls.start++; return { error: 0, data: { fishing: { fishEtMs: env.clock.now + 3000 } } }; };
  env.context.AutoFish_endFish = async () => { calls.end++; return { error: 0, data: { fish: { id: 1, wei: 2 }, awards: [] } }; };
  return { ...env, checkbox, all, contest, calls, state };
}

test('自动钓鱼连续抛竿/到期收竿，鱼饵不足停止并保存关闭状态', async () => {
  const env = fishingEnvironment();
  env.checkbox.click(); await settle();
  assert.equal(env.calls.home, 1); assert.equal(env.calls.start, 0);
  assert.equal([...env.intervals.values()][0].ms, 1500);
  await env.tick(1500); assert.equal(env.calls.start, 1);
  env.clock.now += 2000; await env.tick(1500); assert.equal(env.calls.end, 0);
  env.clock.now += 1001; await env.tick(1500); assert.equal(env.calls.end, 1);
  await env.tick(1500); assert.equal(env.calls.start, 2);
  env.clock.now += 3001; await env.tick(1500);
  env.context.AutoFish_startFish = async () => ({ error: 1005003, msg: '鱼饵不足' });
  await env.tick(1500);
  assert.equal(env.intervals.size, 0); assert.equal(env.checkbox.checked, false);
  assert.equal(env.all.disabled, false);
  assert.deepEqual(JSON.parse(env.values.get('ExSave_AutoFish')).rids, []);
});

test('比赛钓鱼跨越午间、午夜窗口后自动继续，无需再次开启', async () => {
  const env = fishingEnvironment({ mode: 'contest' });
  env.clock.now = new Date(2026, 10, 17, 11, 59).getTime();
  env.checkbox.click(); await settle(); await env.tick(1500);
  assert.equal(env.calls.start, 0); assert.equal(env.intervals.size, 1);
  env.clock.now = new Date(2026, 10, 17, 12, 0).getTime(); await env.tick(1500);
  assert.equal(env.calls.start, 1);
  for (const [hour, minute, allowed] of [[12, 29, true], [12, 30, false], [23, 59, false], [0, 0, true], [0, 29, true], [0, 30, false]]) {
    env.clock.now = new Date(2026, 10, 17, hour, minute).getTime();
    assert.equal(env.context.isInFishingTime(), allowed, hour + ':' + minute);
  }
  env.clock.now = new Date(2026, 10, 18, 0, 0).getTime(); await env.tick(1500);
  assert.equal(env.calls.end, 1); assert.equal(env.intervals.size, 1);
  await env.tick(1500); assert.equal(env.calls.start, 2);
});

test('恢复房间钓鱼设置时先处理上次未收竿，不改变其他房间设置', async () => {
  const env = fishingEnvironment({ saved: { ExSave_AutoFish: { rids: ['123', '456'], modes: { 123: 'contest', 456: 'all' } } } });
  env.state.stat = 2;
  env.context.ExpandTool_AutoFish_Set(); await settle();
  assert.equal(env.calls.end, 1); assert.equal(env.calls.start, 0);
  assert.equal(env.checkbox.checked, true);
  env.checkbox.click(); await settle();
  assert.equal(env.intervals.size, 0);
  assert.deepEqual(JSON.parse(env.values.get('ExSave_AutoFish')).rids, ['456']);
});

test('钓鱼失败后重试；慢请求不重叠；关闭后迟到结果不再收竿或创建新循环', async () => {
  const env = fishingEnvironment();
  let fail = true;
  env.context.AutoFish_getFishInfo = async () => { if (fail) { fail = false; throw new Error('offline'); } return []; };
  env.checkbox.click(); await settle();
  assert.equal(env.intervals.size, 1);
  await env.tick(1500); assert.equal(env.calls.home, 1);
  let release;
  env.context.AutoFish_startFish = () => { env.calls.start++; return new Promise((resolve) => { release = resolve; }); };
  const pending = env.tick(1500); await settle();
  await env.tick(1500); assert.equal(env.calls.start, 1);
  env.checkbox.click();
  release({ error: 1001007, msg: 'pending reel' }); await pending;
  assert.equal(env.calls.end, 0); assert.equal(env.intervals.size, 0);
  assert.equal(env.run('autoFishBusy'), false);
});

test('钓鱼开启后立即关闭，不因迟到主页请求恢复循环', async () => {
  const env = fishingEnvironment();
  let release;
  env.context.AutoFish_getFishInfo = () => new Promise((resolve) => { release = resolve; });
  env.checkbox.click(); await settle(); env.checkbox.click();
  release([]); await settle();
  assert.equal(env.calls.home, 0); assert.equal(env.intervals.size, 0);
});

test('钓鱼网络超时中止请求并释放资源，背包查询支持回调和错误传播', async () => {
  const env = environment();
  env.load(expand + 'ExpandTool_AutoFish.js', 'src/packages/Sign/Sign_Request.js', 'src/require/DouyuAccount/DouyuBag.js');
  env.context.fetch = (url, options) => new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted'))));
  const pending = env.context.AutoFish_request('https://www.douyu.com/example');
  const rejected = assert.rejects(pending, /aborted/);
  assert.equal([...env.timeouts.values()][0].ms, 20000);
  [...env.timeouts.values()][0].fn(); await rejected;
  assert.equal(env.timeouts.size, 0);
  let callbackData;
  env.context.fetch = async () => ({ json: async () => ({ data: { list: [{ id: 268, count: 5 }] } }) });
  const result = await env.context.getBagGifts('123', (data) => { callbackData = data; });
  assert.equal(callbackData, result);
  assert.equal(result.data.list[0].count, 5);
  env.context.fetch = async () => { throw new Error('offline'); };
  await assert.rejects(env.context.getBagGifts('123'), /offline/);
});
