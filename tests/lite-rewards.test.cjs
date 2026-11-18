const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const sign = name => `src/packages/Sign/Sign_${name}.js`;
const flush = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function world(files, extra = {}) {
  let now = 0, id = 0;
  const timers = new Map(), messages = [], storage = new Map();
  const clock = {
    get now() { return now; },
    timers,
    async tick(ms) {
      const target = now + ms;
      await flush();
      while (true) {
        const due = [...timers].filter(([, t]) => t.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        const [key, timer] = due;
        now = timer.at;
        if (timer.interval) timer.at += timer.interval;
        else timers.delete(key);
        timer.fn();
        await flush();
      }
      now = target;
      await flush();
    }
  };
  const schedule = (fn, delay, interval = 0) => { timers.set(++id, { fn, at: now + delay, interval }); return id; };
  const ctx = vm.createContext({
    console: { warn() {}, log() {} },
    AbortController, URLSearchParams,
    rid: '123', dyToken: 'test-token',
    getCCN: () => 'test-csrf',
    getCsrfToken: async () => 'test-csrf',
    setInterval: (fn, delay) => schedule(fn, delay, delay),
    clearInterval: key => timers.delete(key),
    setTimeout: (fn, delay) => schedule(fn, delay),
    clearTimeout: key => timers.delete(key),
    showMessage: (...args) => messages.push(args),
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    sleep: ms => new Promise(resolve => schedule(resolve, ms)),
    ...extra
  });
  for (const file of files) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), ctx, { filename: file });
  return { ctx, clock, messages, storage };
}

test('观时奖励：立即检查、30 分钟和后续阶段自动领取，已领阶段不重领', async () => {
  const claims = [], checks = [];
  const { ctx, clock } = world([sign('OPFOY')]);
  ctx.getOPFOYViewStatus = async () => {
    checks.push(clock.now);
    return { data: { startTime: 100, taskList: {
      first: { status: clock.now >= 30 * 60000 && !claims.some(x => x[0] === 'first') ? 2 : 1 },
      later: { status: clock.now >= 45 * 60000 && !claims.some(x => x[0] === 'later') ? 2 : 1 }
    } } };
  };
  ctx.getOPFOYGift = async (id, period) => { claims.push([id, period]); return { error: 0 }; };
  await ctx.initPkg_Sign_OPFOY_Timer();
  ctx.initPkg_Sign_OPFOY_Timer();
  await clock.tick(29 * 60000);
  assert.equal(claims.length, 0);
  await clock.tick(60000);
  assert.deepEqual(claims, [['first', 100]]);
  await clock.tick(20 * 60000);
  assert.deepEqual(claims, [['first', 100], ['later', 100]]);
  assert.deepEqual(checks, Array.from({ length: 11 }, (_, i) => i * 5 * 60000));
});

test('观时奖励：慢请求不重入、失败后继续、逐项失败隔离并刷新周期', async () => {
  const { ctx, clock } = world([sign('OPFOY')]);
  const pending = deferred();
  let calls = 0;
  ctx.getOPFOYViewStatus = () => { calls++; return pending.promise; };
  const first = ctx.initPkg_Sign_OPFOY_Timer();
  await clock.tick(10 * 60000);
  assert.equal(calls, 1);
  pending.reject(new Error('offline'));
  await first;
  const claims = [];
  ctx.getOPFOYViewStatus = async () => ({ data: { startTime: 200, taskList: { a: { status: 2 }, b: { status: 2 }, c: { status: 1 } } } });
  ctx.getOPFOYGift = async (id, period) => { claims.push([id, period]); if (id === 'a') throw new Error('failed'); return { error: 0 }; };
  await clock.tick(5 * 60000);
  assert.deepEqual(claims, [['a', 200], ['b', 200]]);
  ctx.getOPFOYViewStatus = async () => ({ data: { startTime: 300, taskList: { a: { status: 2 } } } });
  await clock.tick(5 * 60000);
  assert.deepEqual(claims.at(-1), ['a', 300]);
  ctx.getOPFOYViewStatus = async () => ({ error: 1 });
  await clock.tick(5 * 60000);
  assert.equal(claims.length, 3);
});

test('观时奖励：入房前已有进度时立即领取，无须在当前页重新等 30 分钟', async () => {
  const { ctx } = world([sign('OPFOY')]);
  let claimed = 0;
  ctx.getOPFOYViewStatus = async () => ({ data: { startTime: 42, taskList: { ready: { status: 2 } } } });
  ctx.getOPFOYGift = async () => { claimed++; return { error: 0 }; };
  await ctx.initPkg_Sign_OPFOY_Timer();
  assert.equal(claimed, 1);
});

test('网络超时会中止请求并释放奖励检查，不会永久锁住下一轮', async () => {
  let first = true, calls = 0;
  const { ctx, clock } = world([sign('Request'), sign('OPFOY')], {
    fetch: (url, options) => {
      calls++;
      if (!first) return Promise.resolve({ json: async () => ({ data: { taskList: {}, startTime: 1 } }) });
      first = false;
      return new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted'))));
    }
  });
  ctx.initPkg_Sign_OPFOY_Timer();
  await clock.tick(30000);
  await clock.tick(270000);
  assert.equal(calls, 2);
  assert.equal(clock.timers.size, 1);
});

test('等级奖励：后续完成、已领跳过、失败隔离、每 35 秒刷新任务 ID', async () => {
  const { ctx, clock } = world(['src/packages/LevelTask/LevelTask.js']);
  const claims = [], ids = [];
  let period = 'old';
  ctx.getLevelTaskIds = async () => period;
  ctx.getLevelTasks = async id => {
    ids.push(id);
    return [{ taskId: 1, taskStatus: clock.now >= 35000 ? 1 : 0, prizeStatus: 0 },
      { taskId: 2, taskStatus: 1, prizeStatus: 1 }, { taskId: 3, taskStatus: 1, prizeStatus: 0 }];
  };
  ctx.finishLevelTask = async (room, task) => { claims.push([room, task]); if (task === 3) throw new Error('retry'); return []; };
  await ctx.initPkg_LevelTask_Timer();
  ctx.initPkg_LevelTask_Timer();
  period = 'new';
  await clock.tick(35000);
  assert.deepEqual(ids, ['old', 'new']);
  assert.deepEqual(claims, [['123', 3], ['123', 1], ['123', 3]]);
  ctx.getLevelTaskIds = async () => { throw new Error('network'); };
  await clock.tick(35000);
  ctx.getLevelTaskIds = async () => 'recovered';
  await clock.tick(35000);
  assert.equal(ids.at(-1), 'recovered');
});

test('等级慢请求不重叠，空任务不会终止下一轮', async () => {
  const { ctx, clock } = world(['src/packages/LevelTask/LevelTask.js']);
  const pending = deferred();
  let calls = 0;
  ctx.getLevelTaskIds = () => { calls++; return pending.promise; };
  const check = ctx.initPkg_LevelTask_Timer();
  await clock.tick(70000);
  assert.equal(calls, 1);
  pending.resolve('');
  await check;
  ctx.getLevelTaskIds = async () => { calls++; return ''; };
  await clock.tick(35000);
  assert.equal(calls, 2);
});

test('粉丝牌公共查询合并在途请求、去重有效房间、下次重新读取且失败可恢复', async () => {
  const first = deferred();
  let calls = 0;
  const { ctx } = world(['src/require/DouyuAccount/FansBadges.js'], {
    signFetch: () => { calls++; return calls === 1 ? first.promise : Promise.resolve('fresh'); },
    DOMParser: class {
      parseFromString(text) { return { querySelector: () => text === 'missing' ? null : { querySelectorAll: () => ['1', '1', '2', null, 'bad'].map(id => ({ getAttribute: () => id })) } }; }
    }
  });
  const a = ctx.getFansBadgeRooms(), b = ctx.getFansBadgeRooms();
  assert.equal(a, b);
  first.resolve('ok');
  assert.deepEqual(Array.from(await a), ['1', '2']);
  await ctx.getFansBadgeRooms();
  assert.equal(calls, 2);
  ctx.signFetch = async () => 'missing';
  await assert.rejects(ctx.getFansBadgeRooms(), /未能获取/);
  ctx.signFetch = async () => 'recovered';
  assert.equal((await ctx.getFansBadgeRooms()).length, 2);
});

test('粉丝家园与钻粉等待公共数据，保留全部房间调用', async () => {
  const pending = deferred(), requests = [];
  const { ctx } = world([sign('FansTree'), sign('SuperFans')], { getFansBadgeRooms: () => pending.promise });
  ctx.signRoomTree = async room => { requests.push(['tree', room]); if (room === '11') throw new Error('offline'); return { error: 0 }; };
  ctx.signSuperFans = async room => { requests.push(['super', room]); if (room === '11') throw new Error('offline'); return { error: 0 }; };
  const tasks = [ctx.initPkg_Sign_FansTree(), ctx.initPkg_Sign_SuperFans()];
  assert.equal(requests.length, 0);
  pending.resolve(['11', '22']);
  await Promise.all(tasks);
  assert.equal(requests.length, 4);
});

test('签到入口：10 个有效任务各自失败均不阻断其他任务，进行中不可叠加批次', async () => {
  const names = ['Yuba', 'Client', 'Room', 'ActqzsUserTask', 'ReadPosts', 'Follow', 'FansTree', 'SuperFans', 'OPFOY', 'AnchorStar'];
  for (const failure of names) {
    const pending = deferred(), calls = [];
    const { ctx } = world(['src/packages/Sign/Sign.js']);
    for (const name of names) ctx['initPkg_Sign_' + name] = async isAll => {
      calls.push([name, isAll]);
      if (name === failure) throw new Error('offline');
      await pending.promise;
    };
    const batch = ctx.initPkg_Sign_Main(true);
    await ctx.initPkg_Sign_Main(false);
    assert.equal(calls.length, 10);
    assert.equal(calls.find(([name]) => name === 'Room')[1], true);
    pending.resolve();
    await batch;
    await ctx.initPkg_Sign_Main(false);
    assert.equal(calls.length, 20);
    assert.equal(calls.filter(([name]) => name === 'Room')[1][1], false);
  }
});

test('签到短按/长按继续分别传入开播范围与全部范围', () => {
  let click, longClick;
  const { ctx } = world(['src/packages/Sign/Sign.js'], {
    document: { getElementsByClassName: () => [{}] },
    CClick: class { click(fn) { click = fn; } longClick(fn) { longClick = fn; } }
  });
  const calls = [];
  ctx.initPkg_Sign_Main = all => calls.push(all);
  ctx.initPkg_Sign_Func();
  click(); longClick();
  assert.deepEqual(calls, [false, true]);
});

test('续牌数量确认、取消不发送、输入校验与上次数量记忆', async () => {
  let click, prompt;
  const { ctx, storage } = world(['src/packages/FansContinue/FansContinue.js'], {
    document: { getElementsByClassName: () => [{ addEventListener: (name, fn) => { click = fn; } }] },
    PostbirdAlertBox: { prompt: value => { prompt = value; } }
  });
  const quantities = [];
  ctx.FansContinue_startSend = async n => quantities.push(n);
  ctx.initPkg_FansContinue_Func();
  click();
  assert.equal(prompt.defaultValue, '1');
  prompt.onCancel();
  for (const value of ['', '1.2', '-1', 'NaN', 'Infinity', null]) await prompt.onConfirm(value);
  assert.equal(quantities.length, 0);
  await prompt.onConfirm('0');
  assert.deepEqual(quantities, [0]);
  assert.equal(storage.get('ExSave_FansContinue'), '0');
  click();
  assert.equal(prompt.defaultValue, '0');
});

test('续牌：0 平均分配、逐房间间隔 250ms、请求失败隔离并防重入', async () => {
  const sends = [];
  const { ctx, clock } = world(['src/packages/FansContinue/FansContinue.js'], {
    getBagGifts: async () => ({ data: { list: [{ id: 268, count: 11 }] } }),
    getFansBadgeRooms: async () => ['11', '22', '33']
  });
  ctx.sendGift_bag = async (...args) => { sends.push([clock.now, ...args]); if (args[2] === '22') throw new Error('failed'); return { msg: 'success' }; };
  const batch = ctx.FansContinue_startSend(0);
  await ctx.FansContinue_startSend(1);
  await clock.tick(1000);
  await batch;
  assert.deepEqual(sends, [[250, 268, 3, '11'], [500, 268, 3, '22'], [750, 268, 3, '33']]);
  ctx.getBagGifts = async () => { throw new Error('expired login'); };
  await ctx.FansContinue_startSend(1);
  ctx.getBagGifts = async () => ({ data: { list: [{ id: 2358, count: 3 }] } });
  const retry = ctx.FansContinue_startSend(1);
  await clock.tick(1000);
  await retry;
  assert.equal(sends.length, 6);
});

test('续牌：空背包/无牌/无荧光棒/不足或无效数量不发赠送请求', async () => {
  const { ctx } = world(['src/packages/FansContinue/FansContinue.js']);
  let sends = 0;
  ctx.sendGift_bag = async () => { sends++; };
  for (const [list, rooms, quantity] of [[[], ['1'], 1], [[{ id: 9, count: 100 }], ['1'], 1], [[{ id: 268, count: 1 }], [], 0], [[{ id: 268, count: 1 }], ['1', '2'], 0], [[{ id: 268, count: 3 }], ['1', '2'], 4]]) {
    ctx.getBagGifts = async () => ({ data: { list } });
    ctx.getFansBadgeRooms = async () => rooms;
    await ctx.FansContinue_startSend(quantity);
  }
  for (const n of [-1, Infinity, 1.5]) await ctx.FansContinue_startSend(n);
  assert.equal(sends, 0);
});

test('续牌库存不足全牌时仍按原顺序完成可支持的份额，平均不足一根不赠送', async () => {
  const sends = [];
  const { ctx, clock, messages } = world(['src/packages/FansContinue/FansContinue.js'], {
    getBagGifts: async () => ({ data: { list: [{ id: 268, count: 2 }] } }),
    getFansBadgeRooms: async () => Array.from({ length: 10 }, (_, i) => String(i + 1))
  });
  ctx.sendGift_bag = async (...args) => { sends.push([clock.now, ...args]); return { msg: 'success' }; };
  const task = ctx.FansContinue_startSend(1);
  await clock.tick(2500);
  await task;
  assert.deepEqual(sends, [[250, 268, 1, '1'], [500, 268, 1, '2']]);
  assert.match(messages.at(-1)[0], /已跳过剩余 8 个房间/);
  assert.equal(messages.at(-1)[1], 'warning');
  sends.length = 0;
  await ctx.FansContinue_startSend(0);
  await ctx.FansContinue_startSend(3);
  assert.equal(sends.length, 0);
});

test('房间签到遍历所有分页，短按只开播、长按全部；失败房间不阻止后续', async () => {
  const calls = [];
  const { ctx } = world([sign('Room')], {
    signFetch: async url => url.endsWith('1428') ? { data: { pageCount: 2 } } : { data: { list: url.endsWith('1') ? [{ room_id: '1', show_status: '1' }, { room_id: '2', show_status: '2' }] : [{ room_id: '3', show_status: '1' }] } }
  });
  ctx.signRoom = async room => { calls.push(room); if (room === '1') throw new Error('offline'); return {}; };
  await ctx.initPkg_Sign_Room(false);
  assert.deepEqual(calls, ['1', '3']);
  calls.length = 0;
  await ctx.initPkg_Sign_Room(true);
  assert.deepEqual(calls, ['1', '2', '3']);
});

test('阅读任务执行 5 次并保留 2 秒间隔，单次失败继续', async () => {
  const calls = [];
  const { ctx, clock } = world([sign('ReadPosts')]);
  ctx.readPosts = async () => { calls.push(clock.now); if (calls.length === 2) throw new Error('offline'); };
  const task = ctx.initPkg_Sign_ReadPosts();
  await clock.tick(10000);
  await task;
  assert.deepEqual(calls, [0, 2000, 4000, 6000, 8000]);
});

test('房间签到第 2 页请求失败或坏数据时，仍处理第 3 页', async () => {
  for (const malformed of [false, true]) {
    const calls = [], pages = [];
    const { ctx, messages } = world([sign('Room')], {
      signFetch: async url => {
        if (url.endsWith('1428')) return { data: { pageCount: 3 } };
        const page = url.slice(-1);
        pages.push(page);
        if (page === '2') {
          if (malformed) return { error: 1 };
          throw new Error('offline');
        }
        return { data: { list: [{ room_id: page, show_status: '1' }] } };
      }
    });
    ctx.signRoom = async room => { calls.push(room); return { error: 0 }; };
    await ctx.initPkg_Sign_Room(true);
    assert.deepEqual(pages, ['1', '2', '3']);
    assert.deepEqual(calls, ['1', '3']);
    assert.match(messages.at(-1)[0], /1页未能获取/);
    assert.equal(messages.at(-1)[1], 'warning');
  }
});

test('鱼吧失败等待 2 秒重试，完成后按剩余卡数补签；永久失败有界', async () => {
  const calls = [], supplements = [];
  const { ctx, clock } = world([sign('Yuba')], {
    signRequest: async () => { calls.push(clock.now); return { message: calls.length < 3 ? '签到失败' : '' }; }
  });
  let cards = 3;
  ctx.signSupplementary = async group => { supplements.push(group); return { data: { supplementary_cards: --cards } }; };
  const task = ctx.signYuba('42', 'token');
  await clock.tick(4000);
  await task;
  assert.deepEqual(calls, [0, 2000, 4000]);
  assert.deepEqual(supplements, ['42', '42', '42']);
  ctx.signRequest = async () => ({ message: '签到失败' });
  const failing = assert.rejects(ctx.signYuba('42', 'token'), /重试失败/);
  await clock.tick(18000);
  await failing;
});

test('鱼吧获取所有分页，极速请求失败后仍逐个签到，补签无进度停止', async () => {
  const { ctx } = world([sign('Yuba')]);
  const pages = [], groups = [];
  ctx.getYubaPage = async page => { pages.push(page); return { count_page: 2, list: [{ group_id: String(page) }] }; };
  ctx.signYubaFast = async () => { throw new Error('offline'); };
  ctx.signYuba = async group => { groups.push(group); return { message: '' }; };
  await ctx.initPkg_Sign_Yuba();
  assert.deepEqual(pages, [1, 2]);
  assert.deepEqual(groups, ['1', '2']);
  let attempts = 0;
  ctx.signSupplementary = async () => { attempts++; return { data: { supplementary_cards: 3 } }; };
  await ctx.signYubaSupplementary('1');
  assert.equal(attempts, 2);
});

test('月度活动按当前月→前月→后月查询，跨年重新解析，无配置不发签到', async () => {
  let month = 0;
  class CurrentDate extends Date { constructor(...args) { super(...(args.length ? args : [2027, month, 15])); } }
  const { ctx } = world([sign('ActqzsUserTask')], { Date: CurrentDate, dateFormat: (format, date) => `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}` });
  const requested = [];
  assert.equal(await ctx.getMonthlySignActivity(async date => { requested.push(date); return date === '202702' ? 42 : null; }), 42);
  assert.deepEqual(requested, ['202701', '202612', '202702']);
  month = 1;
  requested.length = 0;
  await ctx.getMonthlySignActivity(async date => { requested.push(date); return 43; });
  assert.deepEqual(requested, ['202702']);
  ctx.getActivityId = ctx.getCardArenaId = async () => null;
  ctx.signinAct = ctx.signinCardArena = () => { throw new Error('must not call'); };
  await ctx.initPkg_Sign_ActqzsUserTask();
});

test('月度活动有效配置对所有固定房间执行，单个接口失败不阻断其余任务', async () => {
  const { ctx } = world([sign('ActqzsUserTask')], { dateFormat: () => '202611' });
  ctx.getActivityId = async () => 'activity';
  ctx.getCardArenaId = async () => 'arena';
  const calls = [];
  ctx.signinAct = async (id, room) => { calls.push([id, room]); if (calls.length === 1) throw new Error('offline'); return { error: 0, data: { awards: [] } }; };
  ctx.signinCardArena = async (id, room) => { calls.push([id, room]); return { error: 0, data: { awards: [] } }; };
  await ctx.initPkg_Sign_ActqzsUserTask();
  assert.equal(calls.length, 20);
  assert.equal(new Set(calls.map(x => x[1])).size, 5);
});

test('月度公开 CDN 配置不带凭证，官方账号签到请求仍带登录凭证', async () => {
  const calls = [];
  const { ctx } = world([sign('Request'), sign('ActqzsUserTask')], {
    fetch: async (url, options) => {
      calls.push([url, options.credentials]);
      return {
        text: async () => 'DYConfigCallback({"data":{"activity_setting":{"activity_id":42}}});',
        json: async () => ({ error: 0 })
      };
    }
  });
  assert.equal(await ctx.getActivityId('202611'), 42);
  assert.equal(await ctx.getCardArenaId('202611'), 42);
  await ctx.signinAct(42, '1');
  await ctx.signinCardArena(42, '1');
  assert.deepEqual(calls.map(call => call[1]), ['omit', 'omit', 'include', 'include']);
});

test('星推短房间列表仍运行，500ms 步骤间隔及关注恢复顺序不丢失', async () => {
  const { ctx, clock } = world([sign('AnchorStar')]);
  const calls = [];
  ctx.getAnchorStarRoomList = async () => ({ data: { rankItemList: [{ rid: '1' }, { rid: '2' }] } });
  ctx.signAnchorStar = async room => { calls.push([clock.now, 'sign', room]); return { error: 0 }; };
  ctx.followRoom = async room => { calls.push([clock.now, 'follow', room]); return { error: room === '1' ? 1 : 0 }; };
  ctx.unfollowRoom = async room => { calls.push([clock.now, 'unfollow', room]); return { error: 0 }; };
  const task = ctx.initPkg_Sign_AnchorStar();
  await clock.tick(5000);
  await task;
  assert.deepEqual(calls, [[0, 'sign', '1'], [500, 'sign', '2'], [1000, 'follow', '1'], [1500, 'unfollow', '1'], [2000, 'follow', '1'], [2500, 'follow', '2'], [3000, 'unfollow', '2']]);
});

test('固定关注任务保持关注后取关，客户端业务失败不宣称成功', async () => {
  const calls = [];
  const { ctx, messages } = world([sign('Follow'), sign('Client')], {
    signFetch: async (url, options) => { calls.push([url, options.body]); return { error: 0 }; },
    signRequest: async () => ({ error: 1, msg: '未登录' })
  });
  await ctx.initPkg_Sign_Follow();
  assert.ok(calls[0][0].endsWith('/add'));
  assert.ok(calls[1][0].endsWith('/rm'));
  assert.ok(calls.every(x => x[1].includes('3186571')));
  await assert.rejects(ctx.initPkg_Sign_Client(), /未登录/);
  assert.equal(messages.length, 0);
});

test('GM 请求网络错误/超时/空响应会 reject，而成功响应正常返回', async () => {
  let request;
  const { ctx } = world([sign('Request')], { GM_xmlhttpRequest: options => { request = options; } });
  for (const event of ['onerror', 'ontimeout', 'onabort']) {
    const assertion = assert.rejects(ctx.signRequest({ method: 'GET' }));
    assert.equal(request.timeout, 30000);
    request[event]();
    await assertion;
  }
  const success = ctx.signRequest({});
  request.onload({ status: 200, response: { error: 0 } });
  assert.deepEqual(await success, { error: 0 });
});

test('CSRF 响应缺少 Set-Cookie、失败或超时时能结束；有效令牌正常提取', async () => {
  const common = fs.readFileSync(path.join(root, 'src/common.js'), 'utf8');
  const code = common.slice(common.indexOf('function getCsrfToken()'), common.indexOf('function getValidDom('));
  let request;
  const context = vm.createContext({ document: { cookie: '' }, GM_xmlhttpRequest: options => { request = options; } });
  vm.runInContext(code, context);
  for (const responseHeaders of [undefined, '', 'Content-Type: application/json']) {
    const task = context.getCsrfToken();
    request.onload({ responseHeaders });
    assert.equal(await task, '');
  }
  for (const event of ['onerror', 'ontimeout', 'onabort']) {
    const task = context.getCsrfToken();
    assert.equal(request.timeout, 30000);
    request[event]();
    assert.equal(await task, '');
  }
  const task = context.getCsrfToken();
  request.onload({ responseHeaders: 'Set-Cookie: other=x;\r\nset-cookie: cvl_csrf_token=abc123; Path=/' });
  assert.equal(await task, 'abc123');
});
