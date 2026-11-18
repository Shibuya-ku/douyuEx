// Optional read-only public-page smoke. Uses a fresh, unsigned-in browser profile.
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const output = path.resolve(__dirname, '../test-results');
  await fs.mkdir(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE });
  const results = [];
  try {
    for (const proxy of [undefined, { server: 'http://127.0.0.1:7890' }]) {
      const context = await browser.newContext({ proxy, bypassCSP: true, viewport: { width: 1440, height: 1000 } });
      const page = await context.newPage();
      try {
        const response = await page.goto('https://www.douyu.com/999', { waitUntil: 'domcontentloaded', timeout: 20000 });
        const result = { proxy: !!proxy, status: response.status(), title: await page.title(), url: page.url() };
        // Observe page readiness; do not sign in, claim rewards, send gifts, or fish.
        await page.waitForSelector('.Barrage-main', { timeout: 15000 }).catch(() => {});
        result.dom = await page.evaluate(() => ({
          barrage: !!document.querySelector('.Barrage-main'),
          gift: !!document.querySelector('.BackpackButton,#js-backpack-enter'),
          video: !!document.querySelector('video'),
          toolbar: !!document.querySelector('.right-e7ea5d,.right-17e251'),
          text: document.body.innerText.slice(0, 500),
        }));
        if (result.dom.barrage && result.dom.gift) {
          const pluginErrors = [];
          page.on('pageerror', error => {
            const detail = error.stack || error.message;
            if (/DouyuEx|douyuex|Lite|refresh-barrage|extool|ExPanel/i.test(detail)) pluginErrors.push(detail);
          });
          page.on('console', message => {
            if (message.type() === 'error' && message.text().includes('[DouyuEx Lite]')) pluginErrors.push(message.text());
          });
          await page.evaluate(() => {
            window.unsafeWindow = window;
            window.__liteTestOpened = [];
            window.__liteTestRequests = [];
            window.GM_getValue = (_, fallback) => fallback;
            window.GM_setValue = () => {};
            window.GM_listValues = () => [];
            window.GM_deleteValue = () => {};
            window.GM_registerMenuCommand = () => {};
            window.GM_openInTab = url => window.__liteTestOpened.push(url);
            window.GM_setClipboard = value => { window.__liteTestClipboard = value; };
            // Plugin business requests are substituted even though this profile has no login.
            window.__liteTestFetch = async (url, options) => {
              window.__liteTestRequests.push({ url: String(url), method: options?.method || 'GET' });
              return { ok: true, json: async () => ({ error: 1, msg: '未登录测试', data: {} }), text: async () => '<html></html>' };
            };
            window.GM_xmlhttpRequest = options => {
              window.__liteTestRequests.push({ url: options.url, method: options.method });
              queueMicrotask(() => options.onload?.({ response: { error: 1, data: {} }, responseText: '{}', responseHeaders: '' }));
              return { abort() {} };
            };
          });
          const script = await fs.readFile(path.resolve(__dirname, '../dist/douyuex.js'), 'utf8');
          // Evaluate as a userscript, without putting its own source into the page HTML.
          await page.evaluate('(function () { const fetch = window.__liteTestFetch;\n' + script + '\n})()\n//# sourceURL=douyuex-lite-smoke.js');
          await page.waitForSelector('#ex-vtoolbar-menu', { timeout: 15000 });
          result.plugin = await page.evaluate(() => ({
            tools: [...document.querySelectorAll('.ex-panel__wrap > div')].map(node => node.className),
            menu: !!document.querySelector('#vtoolbar-menu-popup-player'),
            preferences: [...document.querySelectorAll('.extool input[type=checkbox]')].map(node => node.id),
            prefix: !!document.querySelector('#refresh-barrage'),
            raised: !!document.querySelector('#refresh-barrage-frame'),
            video: { paused: document.querySelector('.layout-Player-videoEntity video')?.paused, width: document.querySelector('.layout-Player-videoEntity video')?.videoWidth },
          }));
          await page.locator('#refresh-barrage').evaluate(node => node.click());
          await page.locator('#refresh-barrage-frame').evaluate(node => node.click());
          result.plugin.layout = await page.evaluate(() => JSON.parse(localStorage.getItem('ExSave_Refresh')));
          await page.locator('.vtoolbar-menu__trigger').evaluate(node => node.click());
          await page.locator('#vtoolbar-menu-filter').evaluate(node => node.click());
          await page.locator('#filter__select').selectOption({ label: '1977' });
          result.plugin.filterApplied = await page.locator('#Ex_Style_Filter').count() === 1;
          await page.locator('#filter__reset2').evaluate(node => node.click());
          result.plugin.filterReset = await page.locator('#Ex_Style_Filter').count() === 0;
          await page.locator('.ex-icon').evaluate(node => node.click());
          await page.locator('.extool-icon').evaluate(node => node.click());
          result.plugin.expand = await page.evaluate(() => {
            const panel = document.querySelector('.extool');
            const rect = panel?.getBoundingClientRect();
            return {
              display: panel ? getComputedStyle(panel).display : null,
              rect: rect ? { width: rect.width, height: rect.height, top: rect.top, left: rect.left } : null,
              controls: [...document.querySelectorAll('.extool input[type="checkbox"]')].map(node => node.id),
              text: panel?.innerText?.slice(0, 300) || '',
            };
          });
          result.plugin.errors = pluginErrors;
        }
        await page.screenshot({ path: path.join(output, 'douyu-public-page.png') });
        results.push(result);
        if (result.dom.barrage) break;
      } catch (error) { results.push({ proxy: !!proxy, error: error.message }); }
      finally { await context.close(); }
    }
  } finally { await browser.close(); }
  await fs.writeFile(path.join(output, 'live-smoke.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
  const success = results.find(result => result.plugin);
  assert.ok(success, 'Public room and Lite plugin must initialize');
  assert.deepEqual(success.plugin.tools, ['ex-sign', 'fans-continue', 'extool-icon', 'ex-monitor']);
  assert.equal(success.plugin.preferences.length, 6);
  assert.deepEqual(success.plugin.expand.controls, [
    'extool__autobarragecolor', 'extool__fullscreen', 'extool__highestvideoquality',
    'extool__tabSwitch', 'extool__p2p', 'extool__autofish_start',
  ]);
  assert.equal(success.plugin.expand.display, 'block');
  assert.equal(success.plugin.layout.barrage.status, true);
  assert.equal(success.plugin.layout.barrageFrame.status, true);
  assert.equal(success.plugin.filterApplied, true);
  assert.equal(success.plugin.filterReset, true);
  assert.deepEqual(success.plugin.errors, []);
})().catch(error => { console.error(error); process.exitCode = 1; });
