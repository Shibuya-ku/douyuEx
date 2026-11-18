const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
function load(context, ...files) {
  for (const file of files) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
}
function node(extra = {}) {
  const events = {};
  return {
    style: {}, children: [], childNodes: [], className: '', innerHTML: '',
    addEventListener(type, fn) { events[type] = fn; },
    dispatch(type, event = {}) { events[type]?.(event); },
    click() { events.click?.({ stopPropagation() {} }); },
    get events() { return events; },
    appendChild(child) { this.children.push(child); this.childNodes.push(child); return child; },
    insertBefore(child, ref) { this.children.push(child); this.childNodes.push(child); return child; },
    remove() { this.removed = true; },
    ...extra,
  };
}

test('AudioLine switches the official stream and rebuilds the audio player', () => {
  let pauses = 0;
  const pause = node({ click() { pauses++; } });
  const audio = node();
  const calls = [];
  const c = vm.createContext({
    document: { getElementsByClassName: () => [], getElementById: id => id === 'ex-audio-line' ? audio : null },
    getValidDom: () => pause, rid: '123', videoPlayerArr: [],
    getRealLive_Douyu: (...args) => { calls.push(args.slice(0, 4)); args[4]('stream-url'); },
    createNewAudio_Douyu: (...args) => calls.push(args),
  });
  load(c, 'src/packages/AudioLine/AudioLine.js');
  c.AudioLine_switch();
  assert.equal(pauses, 1);
  assert.deepEqual(calls[0], ['123', true, false, '1428']);
  assert.deepEqual(calls[1], [0, '123']);
});

test('CopyRealLive maps quality labels and copies the selected official URL', () => {
  const clipboard = [];
  const requests = [];
  const selected = node({ className: 'selected', innerText: '蓝光4M' });
  const c = vm.createContext({
    document: {
      querySelectorAll: selector => selector.includes('tipItem') ? [selected] : [],
    },
    rid: 'room-1', GM_setClipboard: value => clipboard.push(value),
    showMessage: (...args) => clipboard.push(args),
    getRealLive_Douyu: (...args) => { requests.push(args.slice(0, 4)); args[4]('https://cdn.example/live.flv'); },
  });
  load(c, 'src/packages/CopyRealLive/CopyRealLive.js');
  assert.equal(c.CopyRealLive_getQn('蓝光8M'), 8);
  assert.equal(c.CopyRealLive_getQn('蓝光4M'), 4);
  assert.equal(c.CopyRealLive_getQn('高清'), 2);
  c.CopyRealLive_copySelected();
  assert.deepEqual(requests, [['room-1', true, false, 4]]);
  assert.deepEqual(clipboard, ['https://cdn.example/live.flv', ['复制成功', 'success']]);
});

test('VideoZoom only handles Ctrl wheel inside the player and supports drag', () => {
  const wrap = node({ getBoundingClientRect: () => ({ left: 10, top: 20, right: 410, bottom: 320 }) });
  const videoWrap = node();
  const events = {};
  const c = vm.createContext({
    document: { getElementsByClassName: name => name === 'layout-Player-videoEntity' ? [videoWrap] : [], },
    window: {
      addEventListener: (type, fn) => { events[type] = fn; },
      removeEventListener: () => {},
    },
    getValidDom: () => wrap,
  });
  load(c, 'src/packages/VideoTools/VideoZoom/VideoZoom.js');
  c.initPkg_VideoTools_VideoZoom();
  const outside = { ctrlKey: true, deltaY: -100, clientX: 500, clientY: 500, preventDefault() { this.prevented = true; }, stopImmediatePropagation() {} };
  events.wheel(outside);
  assert.equal(outside.prevented, undefined);
  const inside = { ctrlKey: true, deltaY: -100, clientX: 100, clientY: 100, preventDefault() { this.prevented = true; }, stopImmediatePropagation() {} };
  events.wheel(inside);
  assert.equal(inside.prevented, true);
  assert.match(videoWrap.style.transform, /scale\(1\.1\)/);
  events.mousedown({ ctrlKey: true, button: 0, clientX: 100, clientY: 100, preventDefault() {} });
  events.mousemove({ clientX: 130, clientY: 120 });
  events.mouseup({});
  assert.match(videoWrap.style.transform, /translate\(/);
});

test('MetaData ignores missing stream URLs', () => {
  const main = node();
  const created = [];
  const c = vm.createContext({
    rid: '123',
    DomHook: function() {},
    document: {
      querySelector: () => null,
      getElementById: id => created.find(item => item.id === id) || null,
      createElement: tag => { const el = node({ tagName: tag, id: '' }); created.push(el); return el; },
      getElementsByClassName: () => [],
    },
    getValidDom: () => main,
    flvjs: { isSupported: () => false },
    getRealLive_Douyu: (...args) => args[4](null),
    showMessage: () => {},
  });
  load(c, 'src/packages/VideoTools/MetaData/MetaData.js');
  c.MetaData_init();
  assert.equal(created.some(item => item.id === 'exVideoDivFake'), false);
});

test('MetaData consumes media_info, releases the temporary player and mounts only populated fields', () => {
  const main = node();
  const menu = node();
  const created = [];
  const media = node();
  const events = {};
  let destroyed = 0, attached = 0, loads = 0;
  const c = vm.createContext({
    rid: '123', DomHook: function() {},
    document: {
      querySelector: selector => selector === '.menu-da2a9e' ? menu : null,
      getElementById: id => id === 'exVideoPlayerFake' ? media : created.find(item => item.id === id) || null,
      createElement: tag => { const el = node({ tagName: tag, id: '' }); created.push(el); return el; },
      getElementsByClassName: name => name === 'menu-da2a9e' ? [menu] : [],
    },
    getValidDom: () => main,
    flvjs: { isSupported: () => true, createPlayer: () => ({
      on(type, cb) { events[type] = cb; },
      attachMediaElement(element) { assert.equal(element, media); attached++; },
      load() { loads++; }, destroy() { destroyed++; },
    }) },
    getRealLive_Douyu: (...args) => args[4]('https://official-cdn.example/live/test.flv'),
    showMessage: () => {},
  });
  load(c, 'src/packages/VideoTools/MetaData/MetaData.js');
  c.MetaData_init();
  assert.equal(attached, 1); assert.equal(loads, 1);
  events.media_info({ metadata: { dy_cpu_model: 'CPU test', dy_gpu_model: 'GPU test' } });
  assert.equal(destroyed, 1); assert.equal(media.removed, true);
  assert.equal(created.find(item => item.id === 'exVideoDivFake').removed, true);
  const panel = created.find(item => item.id === 'ex-metadata');
  assert.match(panel.innerHTML, /CPU test/); assert.match(panel.innerHTML, /GPU test/);
  assert.doesNotMatch(panel.innerHTML, /设备/);
  c.initPkg_VideoTools_MetaData_Dom();
  assert.equal(created.filter(item => item.id === 'ex-metadata').length, 1);
});
