const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

async function run(browser, root = path.resolve(__dirname, '..'), artifact = 'douyuex.js') {
  const fixture = await fs.readFile(path.join(__dirname, 'fixtures/room.html'), 'utf8');
  const code = await fs.readFile(path.join(root, 'dist', artifact), 'utf8');
  const results = [];
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  async function createPage(storage = {}) {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.route('**/*', route => {
      if (route.request().isNavigationRequest()) return route.fulfill({ contentType: 'text/html', body: fixture });
      return route.fulfill({ status: 200, body: '', contentType: 'text/plain' });
    });
    await page.goto('https://www.douyu.com/999');
    await page.clock.install({ time: new Date('2026-11-17T12:00:00+08:00') });
    await page.evaluate(storage => {
      localStorage.clear();
      Object.entries(storage).forEach(([key, value]) => localStorage.setItem(key, value));
      window.__opened = [];
      window.__requests = [];
      window.__menus = {};
      window.__settings = { Ex_isAutoReply: true, Ex_isAutoTreasure: true, Ex_isRedPacket: true };
      window.__confirmations = 0;
      window.__confirmResult = false;
      window.unsafeWindow = window;
      window.GM_getValue = (key, fallback) => window.__settings[key] ?? fallback;
      window.GM_setValue = (key, value) => { window.__settings[key] = value; };
      window.GM_listValues = () => Object.keys(window.__settings);
      window.GM_deleteValue = key => { delete window.__settings[key]; };
      window.GM_registerMenuCommand = (name, callback) => { window.__menus[name] = callback; };
      window.GM_setClipboard = value => { window.__clipboard = value; };
      window.GM_openInTab = url => { window.__opened.push(url); };
      const response = url => {
        if (url.includes('getRoomBaseInfo')) return { error: 0, data: { room: { title: '测试直播间', owner_name: '测试主播' } } };
        if (url.includes('getCardTaskInfo')) return { error: 0, data: { watchTask: { hasWatchTime: 600 } } };
        if (url.includes('getlastlive') || url.includes('getLastLive')) return { error: 0, data: {} };
        return { error: 0, data: { list: [], taskList: [], taskIds: [] } };
      };
      window.fetch = async url => {
        window.__requests.push(String(url));
        return { ok: true, json: async () => response(String(url)), text: async () => '<html></html>' };
      };
      window.GM_xmlhttpRequest = options => {
        window.__requests.push(options.url);
        queueMicrotask(() => options.onload?.({ response: response(options.url), responseText: '{}', responseHeaders: '' }));
        return { abort() {} };
      };
      window.__sockets = [];
      window.WebSocket = class {
        static OPEN = 1;
        static CONNECTING = 0;
        constructor(url) { this.url = url; this.readyState = 1; this.sent = []; window.__sockets.push(this); queueMicrotask(() => this.onopen?.()); }
        send(value) { this.sent.push(value); }
        close() { this.readyState = 3; this.onclose?.(); }
      };
      window.flvjs = { isSupported: () => false };
      window.confirm = () => { window.__confirmations++; return window.__confirmResult; };
      window.alert = text => { window.__lastAlert = text; };
      window.__playCalls = 0;
      HTMLMediaElement.prototype.play = function() { window.__playCalls++; return Promise.resolve(); };
      HTMLMediaElement.prototype.pause = function() {};
      const video = document.querySelector('video');
      Object.defineProperty(video, 'buffered', { get: () => ({ length: 1, end: () => 120 }) });
      // Simulate an old DouyuEx instance that already mounted its own UI.
      const legacyPanel = document.createElement('div');
      legacyPanel.className = 'ex-panel';
      legacyPanel.innerHTML = '<div class="ex-panel__wrap"><div class="ex-sign"></div><div class="fans-continue"></div><div class="extool-icon"></div><div class="ex-monitor"></div></div>';
      document.body.appendChild(legacyPanel);
      const legacyExpand = document.createElement('div');
      legacyExpand.className = 'extool';
      legacyExpand.innerHTML = '<div class="legacy-expand-placeholder">旧版扩展面板</div>';
      document.body.appendChild(legacyExpand);
      const toolbar = document.querySelector('.Barrage-toolbar');
      for (const id of ['refresh-barrage', 'refresh-barrage-frame']) {
        const legacy = document.createElement('a'); legacy.id = id; toolbar.appendChild(legacy);
      }
    }, storage);
    await page.addScriptTag({ content: code });
    await page.clock.runFor(7000);
    return { page, errors };
  }
  async function check(name, action) {
    try { await action(); results.push({ name, status: 'passed' }); }
    catch (error) { results.push({ name, status: 'failed', error: error.stack }); }
  }
  const { page, errors } = await createPage();
  await check('完整构建启动、四项工具条、播放器菜单', async () => {
    assert.deepEqual(errors, []);
    assert.deepEqual(await page.locator('.ex-panel__wrap > div').evaluateAll(nodes => nodes.map(node => node.className)), ['ex-sign', 'fans-continue', 'extool-icon', 'ex-monitor']);
    assert.equal(await page.locator('#ex-vtoolbar-menu').count(), 1);
    assert.equal(await page.locator('#vtoolbar-menu-popup-player').count(), 1);
    assert.equal(await page.locator('.livetool,.bloop,.exlottery,.ex-update').count(), 0);
  });
  await check('前缀/拉高直接切换、偏好保存和刷新恢复', async () => {
    await page.locator('#refresh-barrage').evaluate(node => node.click());
    await page.locator('#refresh-barrage-frame').evaluate(node => node.click());
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('ExSave_Refresh')));
    assert.equal(saved.barrage.status, true);
    assert.equal(saved.barrageFrame.status, true);
    assert.equal(await page.evaluate(() => window.__confirmations), 0);
    const restored = await createPage({ ExSave_Refresh: JSON.stringify(saved) });
    assert.equal(await restored.page.locator('#refresh-barrage').evaluate(node => node.classList.contains('ex-active')), true);
    assert.equal(await restored.page.locator('#refresh-barrage-frame').evaluate(node => node.classList.contains('ex-active')), true);
    await restored.page.close();
    await page.locator('#refresh-barrage').evaluate(node => node.click());
    await page.locator('#refresh-barrage-frame').evaluate(node => node.click());
  });
  await check('在线弹幕仅点击打开、旧删除功能设置不启动', async () => {
    assert.deepEqual(await page.evaluate(() => window.__opened), []);
    assert.equal((await page.evaluate(() => window.__requests)).some(url => /douyuex|doseeing|shadiao|huya|bilibili|baidu|bojianger/.test(url)), false);
    await page.locator('.ex-monitor').evaluate(node => node.click());
    assert.deepEqual(await page.evaluate(() => window.__opened), ['https://www.douyuex.com/999']);
  });
  await check('倍速、影院比例、缓冲同步、音量', async () => {
    await page.evaluate(() => document.getElementById('videospeed__1.5').click());
    assert.equal(await page.locator('.layout-Player-videoEntity > video').evaluate(video => video.playbackRate), 1.5);
    await page.locator('#cinema__cover').evaluate(node => node.click());
    assert.equal(await page.locator('.layout-Player-videoEntity > video').evaluate(video => getComputedStyle(video).objectFit), 'cover');
    await page.locator('#ex-videosync').evaluate(node => node.click());
    assert.equal(await page.locator('.layout-Player-videoEntity > video').evaluate(video => video.currentTime), 120);
    await page.locator('.layout-Player-videoEntity > video').evaluate(video => { video.volume = 0.5; });
    await page.locator('.volume-07c230').dispatchEvent('wheel', { deltaY: -100 });
    assert.ok(await page.locator('.layout-Player-videoEntity > video').evaluate(video => video.volume > 0.5));
  });
  await check('夜间模式保存与切回', async () => {
    await page.locator('#ex-night').evaluate(node => node.click());
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('ExSave_Mode')).mode), 1);
    await page.locator('#ex-night').evaluate(node => node.click());
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('ExSave_Mode')).mode), 0);
  });
  await check('扩展五项偏好与钓鱼独立区域', async () => {
    assert.deepEqual(await page.locator('.extool input[type=checkbox]').evaluateAll(nodes => nodes.map(node => node.id)), [
      'extool__autobarragecolor', 'extool__fullscreen', 'extool__highestvideoquality',
      'extool__tabSwitch', 'extool__p2p', 'extool__autofish_start',
    ]);
    for (const id of ['extool__fullscreen', 'extool__highestvideoquality', 'extool__p2p']) {
      await page.locator('#' + id).evaluate(node => node.click());
      assert.equal(await page.locator('#' + id).isChecked(), true);
      await page.locator('#' + id).evaluate(node => node.click());
    }
    assert.equal(await page.locator('#extool__autofish_start').isChecked(), false);
  });
  await check('弹幕历史、小尾巴添加一次及关闭', async () => {
    await page.locator('.ChatSend-txt').fill('历史消息');
    await page.locator('.ChatSend-button').evaluate(node => node.click());
    await page.locator('.ChatSend-txt').fill('');
    await page.locator('.ChatSend-txt').dispatchEvent('keydown', { key: 'ArrowUp', keyCode: 38 });
    assert.equal(await page.locator('.ChatSend-txt').inputValue(), '历史消息');
    await page.locator('#DanmakuTail-input').evaluate(node => { node.value = '尾巴'; node.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.locator('#DanmakuTail-checkbox').evaluate(node => node.click());
    await page.locator('.ChatSend-txt').fill('消息');
    await page.locator('.ChatSend-button').evaluate(node => node.click());
    await page.locator('.ChatSend-button').evaluate(node => node.click());
    assert.equal(await page.locator('.ChatSend-txt').inputValue(), '消息尾巴');
    await page.locator('#DanmakuTail-checkbox').evaluate(node => node.click());
    await page.locator('.ChatSend-txt').fill('新消息');
    await page.locator('.ChatSend-button').evaluate(node => node.click());
    assert.equal(await page.locator('.ChatSend-txt').inputValue(), '新消息');
  });
  await check('弹幕收藏搜索和重复打开', async () => {
    const panel = '<div class="ChatBarrageCollectPop-title">收藏</div><section><div class="ChatBarrageCollectPop-barrageContent"></div><div class="TagItem">苹果</div><div class="TagItem">香蕉</div></section>';
    await page.locator('.ChatBarrageCollect').evaluate((node, html) => { node.innerHTML = html; }, panel);
    await page.clock.runFor(20);
    assert.equal(await page.locator('#ex-danmaku-collect-search').count(), 1);
    await page.locator('#ex-danmaku-collect-search').fill('苹果');
    assert.deepEqual(await page.locator('.TagItem').evaluateAll(nodes => nodes.map(node => node.style.display)), ['', 'none']);
    await page.locator('.ChatBarrageCollect').evaluate((node, html) => { const replacement = node.cloneNode(false); replacement.innerHTML = html; node.replaceWith(replacement); }, panel);
    await page.clock.runFor(20);
    assert.equal(await page.locator('#ex-danmaku-collect-search').count(), 1);
    await page.locator('#ex-danmaku-collect-search').fill('香蕉');
    assert.deepEqual(await page.locator('.TagItem').evaluateAll(nodes => nodes.map(node => node.style.display)), ['none', '']);
  });
  await check('屏蔽面板三项开关、保存及重新打开', async () => {
    await page.locator('.BarrageFilter').evaluate(node => { node.innerHTML = '<div class="FilterKeywords"></div>'; });
    await page.clock.runFor(50);
    for (const id of ['ex-removeEnterBarrage', 'ex-removeDanmakuBackground', 'ex-removeRepeatedDanmaku']) {
      assert.equal(await page.locator('#' + id).count(), 1);
      await page.locator('#' + id).evaluate(node => node.click());
    }
    assert.equal(await page.evaluate(() => localStorage.getItem('ExSave_isRemoveEnterBarrage')), '1');
    await page.locator('.BarrageFilter').evaluate(node => { const next = document.createElement('div'); next.className = 'BarrageFilter'; next.innerHTML = '<div class="FilterKeywords"></div>'; node.replaceWith(next); });
    await page.clock.runFor(50);
    assert.equal(await page.locator('#ex-removeRepeatedDanmaku').count(), 1);
    assert.equal(await page.locator('#ex-removeEnterBarrage .FilterSwitchStatus-status').innerText(), '已开启');
  });
  await check('滤镜、镜像、重置和延迟右键菜单', async () => {
    await page.locator('.vtoolbar-menu__trigger').evaluate(node => node.click());
    await page.locator('#vtoolbar-menu-filter').evaluate(node => node.click());
    await page.locator('#filter__select').selectOption({ label: '1977' });
    assert.equal(await page.locator('#Ex_Style_Filter').count(), 1);
    await page.locator('#filter__mirror').evaluate(node => node.click());
    assert.ok(await page.locator('.layout-Player-videoEntity').evaluate(node => node.style.transform.includes('180deg')));
    await page.locator('#filter__reset').evaluate(node => node.click());
    assert.equal(await page.locator('#Ex_Style_Filter').count(), 0);
    await page.locator('.menu-da2a9e').evaluate(node => { const next = document.createElement('ul'); next.className = 'menu-da2a9e'; node.replaceWith(next); });
    await page.clock.runFor(50);
    assert.equal(await page.locator('#filter__mirror').count(), 1);
    await page.locator('#filter__mirror').evaluate(node => node.click());
    assert.ok(await page.locator('.layout-Player-videoEntity').evaluate(node => node.style.transform.includes('180deg')));
  });
  await check('重置仍需确认且取消不清设置', async () => {
    await page.evaluate(() => { localStorage.setItem('ExSave_test', 'keep'); window.__menus['重置所有设置'](); });
    assert.equal(await page.evaluate(() => localStorage.getItem('ExSave_test')), 'keep');
    assert.equal(await page.evaluate(() => window.__confirmations), 1);
  });
  await check('DOM控件迟到、替换后挂接和关闭清理', async () => {
    const source = await fs.readFile(path.join(root, 'src/require/DomHook/DomHook.js'), 'utf8');
    const result = await page.evaluate(async source => {
      const Hook = new Function(source + ';return DomHook;')();
      let calls = 0;
      const hook = new Hook('#late-hook-test', true, () => { calls++; });
      const node = document.createElement('div'); node.id = 'late-hook-test'; node.appendChild(document.createElement('span')); document.body.appendChild(node);
      await new Promise(resolve => queueMicrotask(resolve));
      const afterInsert = calls;
      const replacement = node.cloneNode(true); node.replaceWith(replacement);
      await new Promise(resolve => queueMicrotask(resolve));
      const afterReplace = calls;
      hook.closeHook(); replacement.appendChild(document.createElement('i'));
      await new Promise(resolve => queueMicrotask(resolve));
      replacement.remove();
      return { afterInsert, afterReplace, afterClose: calls };
    }, source);
    assert.ok(result.afterInsert > 0); assert.ok(result.afterReplace > result.afterInsert); assert.equal(result.afterClose, result.afterReplace);
  });
  await check('播放器控制栏重渲染后菜单重新挂接', async () => {
    await page.evaluate(() => {
      const old = document.querySelector('.right-e7ea5d');
      const next = document.createElement('div');
      next.className = 'right-e7ea5d';
      old.replaceWith(next);
    });
    await page.clock.runFor(20);
    assert.equal(await page.locator('.right-e7ea5d #ex-vtoolbar-menu').count(), 1);
    assert.equal(await page.locator('#ex-vtoolbar-filter-host .filter__wrap').count(), 1);
    await page.locator('#vtoolbar-menu-expanel').evaluate(node => node.click());
    assert.equal(await page.locator('.ex-panel').evaluate(node => node.style.display), 'block');
  });
  await check('礼物栏重建后四项主工具条仍可用', async () => {
    await page.evaluate(() => {
      const old = document.querySelector('.PlayerToolbar-Wealth');
      const next = document.createElement('div'); next.className = 'PlayerToolbar-Wealth';
      next.innerHTML = '<div class="BackpackButton" id="js-backpack-enter"></div>';
      old.replaceWith(next);
    });
    await page.clock.runFor(50);
    assert.equal(await page.locator('.ex-icon').count(), 1);
    assert.equal(await page.locator('.ex-panel__wrap > div').count(), 4);
    await page.locator('#vtoolbar-menu-expanel').evaluate(node => node.click());
    assert.equal(await page.locator('.ex-panel').count(), 1);
  });
  await check('最终浏览器未捕获异常', async () => assert.deepEqual(errors, []));
  const output = path.join(root, 'test-results');
  await fs.mkdir(output, { recursive: true });
  if (await page.locator('.ex-icon').count()) await page.locator('.ex-icon').evaluate(node => node.click());
  const suffix = artifact.includes('.user.') ? '-user' : '';
  await page.screenshot({ path: path.join(output, `lite-browser${suffix}.png`), fullPage: true });
  await fs.writeFile(path.join(output, `browser-results${suffix}.json`), JSON.stringify({ artifact, browser: browser.version(), results, errors }, null, 2));
  await context.close();
  return results;
}

module.exports = { run };
if (require.main === module) {
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
  (async () => {
    const browser = await chromium.launch(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE, headless: true } : { headless: true });
    try {
      for (const artifact of ['douyuex.js', 'douyuex.user.js']) {
        const results = await run(browser, path.resolve(__dirname, '..'), artifact);
        console.log(JSON.stringify({ artifact, results }, null, 2));
        if (results.some(result => result.status !== 'passed')) process.exitCode = 1;
      }
    } finally { await browser.close(); }
  })().catch(error => { console.error(error); process.exitCode = 1; });
}
