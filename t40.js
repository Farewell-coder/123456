/* t40.js —— 世界书 + 开局读条 + 悬浮球桥接（patch40）专项自检 */
'use strict';
const fs = require('fs');

let pass = 0, fail = 0;
function ok(c, m){ if(c){ pass++; console.log('  PASS  ' + m); } else { fail++; console.log('  FAIL  ' + m); } }

/* ---------- DOM 打桩 ---------- */
function mkClassList(){
  const s = new Set();
  return {
    add: c => s.add(c), remove: c => s.delete(c),
    contains: c => s.has(c),
    toggle: (c, f) => { const on = (f === undefined) ? !s.has(c) : !!f; on ? s.add(c) : s.delete(c); return on; },
    _set: s
  };
}
function stubEl(){
  const e = {
    _cls: mkClassList(), style: {}, dataset: {}, children: [], _html: '', _txt: '',
    onclick: null, onkeydown: null,
    set innerHTML(v){ this._html = String(v); }, get innerHTML(){ return this._html; },
    set textContent(v){ this._txt = String(v); }, get textContent(){ return this._txt; },
    set className(v){ this._cn = v; }, get className(){ return this._cn || ''; },
    setAttribute(){}, getAttribute(){ return null; }, removeAttribute(){},
    appendChild(c){ return c; }, removeChild(){}, insertBefore(){},
    addEventListener(){}, removeEventListener(){},
    querySelector(){ return null; }, querySelectorAll(){ return []; },
    closest(){ return null; }, focus(){}, blur(){}, click(){}, select(){}, remove(){},
    getBoundingClientRect(){ return { top:0, left:0, width:0, height:0 }; },
    scrollTo(){}, getContext(){ return null; }, classList: null
  };
  Object.defineProperty(e, 'classList', { get(){ return e._cls; } });
  return e;
}
const ELS = {};
const el = sel => (ELS[sel] || (ELS[sel] = stubEl()));
['#bootPage','#bootBar','#bootPct','#bootTip','#dgFloatRow','#dgFloat','#dgFloatTip',
 '#log','#status','#playbar','#endbar','#deathCard','#scPlay','#scMenu','#dlg','#dlgA','#dlgD','#toast']
  .forEach(s => el(s));
const doc = {
  body: stubEl(), documentElement: stubEl(),
  getElementById: id => el('#' + id),
  querySelector: sel => el(sel),
  querySelectorAll: () => [],
  createElement: () => stubEl(),
  createDocumentFragment: () => stubEl(),
  addEventListener(){}, removeEventListener(){}, hidden: false, visibilityState: 'visible'
};
const win = {
  matchMedia: () => ({ matches:false, addEventListener(){}, removeEventListener(){} }),
  addEventListener(){}, removeEventListener(){},
  scrollTo(){}, requestAnimationFrame: cb => setTimeout(cb, 0),
  innerWidth: 420, innerHeight: 900, devicePixelRatio: 1,
  getComputedStyle: () => ({ getPropertyValue: () => '' }),
  location: { href:'file:///index.html', reload(){} }
};
const store = {
  'lr_cfg_0.0.1': JSON.stringify({
    on:true, prefetch:true, theme:'auto', ai:50, active:'默认配置',
    profiles:{ '默认配置': { base:'http://x/v1', model:'m', key:'sk-TESTKEY' } }
  })
};
const localStorage = {
  getItem: k => (store[k] === undefined ? null : store[k]),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; },
  clear: () => {}, get length(){ return Object.keys(store).length; },
  key: i => Object.keys(store)[i]
};
const nav = { userAgent:'node-t40', language:'zh-CN' };

const js = require('./loadjs.js').loadGameJs();
const src = require('./loadjs.js').loadFullHtml();

/* 受控定时器：把 setTimeout 收进队列，测试自己决定什么时候放行 */
const timers = [];
const fakeSetTimeout = (fn, ms) => { timers.push({ fn, ms: ms || 0 }); return timers.length; };
const fakeClearTimeout = id => { if(id >= 1) timers[id - 1] = null; };
function flushTimers(limit){
  let n = 0;
  while(timers.length && n < (limit || 50)){
    const t = timers.shift();
    n++;
    if(t && t.fn){ try{ t.fn(); }catch(e){} }
  }
}

/* 打桩 fetch：记录请求，返回一个合法的事件 JSON 数组 */
const CALLS = [];
global.fetch = (url, opt) => {
  CALLS.push({ url, body: opt && opt.body ? String(opt.body) : '' });
  const payload = JSON.stringify({
    choices: [{ message: { content: '[{"age":1,"text":"你在院子里学会走路，摔了两跤。","effects":{"STR":1}}]' },
                finish_reason: 'stop' }]
  });
  return Promise.resolve({
    ok: true, status: 200,
    headers: { get: () => 'application/json; charset=utf-8' },
    text: () => Promise.resolve(payload),
    json: () => Promise.resolve(JSON.parse(payload))
  });
};

const exportTail = `
;return {
  get S(){ return S; }, set S(v){ S = v; },
  get gen(){ return gen; }, set gen(v){ gen = v; },
  WORLD_BOOK, bootShow, bootHide, bootNeeded, bootPrepare, enterLife,
  floatCfg, floatSet, floatSync, get bootBusy(){ return bootBusy; },
  newLife, goState, getCfg, setCfg, aiReady, buildOutline, prefetch,
  get queue(){ return queue; }, GAME_VER, get CUR(){ return CUR; }
};`;
const api = new Function('document','window','localStorage','navigator',
  'setTimeout','clearTimeout','setInterval','console','fetch',
  js + exportTail)(doc, win, localStorage, nav,
  fakeSetTimeout, fakeClearTimeout, () => 0, console, global.fetch);

/* ---------- 1. 世界书 ---------- */
console.log('=== 1. 游戏世界书 ===');
ok(typeof api.WORLD_BOOK === 'string' && api.WORLD_BOOK.length > 800,
   '世界书已内置（' + (api.WORLD_BOOK || '').length + ' 字）');
const wb = api.WORLD_BOOK || '';
ok(wb.indexOf('My Life, My Sim') >= 0, '世界书里有游戏名');
ok(wb.indexOf('CHR') >= 0 && wb.indexOf('MH') >= 0, '世界书写清了属性体系（含隐藏属性）');
ok(wb.indexOf('幼年') >= 0 && wb.indexOf('老年') >= 0, '世界书交代了人生六阶段');
ok(wb.indexOf('JSON') >= 0 && wb.indexOf('effects') >= 0, '世界书定义了事件数据格式');
ok(wb.indexOf('绝不重复') >= 0, '世界书写明了「不重复内容库」铁律');
ok(wb.indexOf('暗线大纲') >= 0, '世界书解释了暗线大纲机制');
ok(wb.indexOf('玄幻') >= 0 && wb.indexOf('穿越') >= 0, '世界书明确了题材禁区');
ok(src.indexOf("const sys = WORLD_BOOK + '\\n\\n'") >= 0, '事件生成请求的 system 里拼了世界书');
ok(src.indexOf('WORLD_BOOK + \'\\n\\n【本次任务】你是这台模拟器的幕后编剧') >= 0,
   '大纲生成请求的 system 里也拼了世界书');
ok(src.indexOf('你是这款游戏的随身助手') >= 0, '悬浮窗对话也用世界书');

/* ---------- 2. 开局读条：未启用 AI 时不出现 ---------- */
console.log('\n=== 2. 开局读条 ===');
ok(!!ELS['#bootPage'], '读条页元素存在');
/* 配置里关掉 AI */
const c0 = api.getCfg(); c0.on = false; api.setCfg(c0);
api.newLife([], { EQ:5, WIL:5, MH:10 }, 'd1');
ok(api.S && !api.S.dead, '未启用 AI：正常开局');
ok(!ELS['#bootPage'].classList.contains('on'), '未启用 AI：读条页没有出现');
ok(api.bootNeeded() === false, '未启用 AI：bootNeeded() 为 false');

/* 启用 AI 时应走读条 */
const c1 = api.getCfg(); c1.on = true; api.setCfg(c1);
ok(api.aiReady() === true, '重新启用 AI 后 aiReady() 为 true');
api.newLife([], { EQ:5, WIL:5, MH:10 }, 'd1');
ok(api.bootNeeded() === true, '启用 AI：bootNeeded() 为 true');
ok(ELS['#bootPage'].classList.contains('on'), '启用 AI：读条页立即出现');
ok(ELS['#bootTip'].textContent.indexOf('大纲') >= 0, '读条首条文案是「正在生成人生大纲…」');

/* 进度条会前进，并最终收起 */
ok(parseInt(ELS['#bootPct'].textContent, 10) >= 0, '进度百分比有显示（' + ELS['#bootPct'].textContent + '）');

/* ---------- 3. 读条确实等到了 AI 结果 ---------- */
console.log('\n=== 3. 读条等待 AI 完成 ===');
(async () => {
  /* 放行所有 pending 的定时器（含 60s 兜底），让 bootPrepare 跑完 */
  let guard = 0;
  while(api.bootBusy && guard++ < 40){
    flushTimers(30);
    await new Promise(r => setImmediate(r));
    await new Promise(r => setImmediate(r));
  }
  ok(CALLS.length > 0, '读条过程中确实请求了 AI（' + CALLS.length + ' 次）');
  const bodyAll = CALLS.map(x => x.body).join('\n');
  ok(bodyAll.indexOf('CHR') >= 0, '请求体里带上了世界书正文');
  ok(!api.bootBusy, '读条结束（bootBusy 归 false）');
  ok(!ELS['#bootPage'].classList.contains('on'), '读条页已收起，进入游戏');
  ok(api.S && !api.S.dead, '这一局正常进行中');

  /* ---------- 4. 悬浮球桥接 ---------- */
  console.log('\n=== 4. 悬浮球桥接 ===');
  ok(typeof win.__floatAsk === 'function', '页面暴露了 __floatAsk（供悬浮窗提问）');
  ok(typeof win.__floatStat === 'function', '页面暴露了 __floatStat（供悬浮窗读状态）');
  ok(typeof win.__floatDev === 'function', '页面暴露了 __floatDev（供悬浮窗切开发者模式）');
  ok(win.__floatDevNow === false, '__floatDevNow 初始为 false');
  ok(typeof win.__floatEndLife === 'function', 'v0.1.3 D：页面暴露了 __floatEndLife（供悬浮窗结束一局）');

  const cfg = JSON.parse(win.__floatCfg());
  ok(cfg.url === 'http://x/v1/chat/completions', '悬浮窗拿到的是游戏里配置的端点');
  ok(cfg.model === 'm', '模型也来自游戏配置');
  ok(cfg.key === 'sk-TESTKEY', 'key 也来自游戏配置（不用另配一套）');
  ok(cfg.ok === true, '配置可用');

  const st = JSON.parse(win.__floatStat());
  ok(typeof st.life === 'string' && st.life.length > 0, '状态里有本局进度（' + st.life + '）');
  ok(st.dev === false, '状态里的开发者模式为关');
  ok(String(st.attr).indexOf('智') >= 0, '状态里带了属性快照');

  /* 问答链路 */
  CALLS.length = 0;
  const BEFORE = CALLS.length;
  win.__floatAsk('这个游戏怎么玩？', 'lrFloatCbTest');
  let g2 = 0;
  while(CALLS.length === BEFORE && g2++ < 40){ await new Promise(r => setImmediate(r)); }
  ok(CALLS.length > BEFORE, '悬浮窗提问确实发起了 AI 请求');
  ok(CALLS[CALLS.length - 1].body.indexOf('随身助手') >= 0, '请求里带上了「随身助手」身份与世界书');

  /* 切开发者模式 */
  win.__floatDev(true);
  ok(win.__floatDevNow === true, '悬浮窗可以把开发者模式打开（当前 ' + win.__floatDevNow + '）');
  win.__floatDev(false);
  ok(win.__floatDevNow === false, '也能关掉');

  /* 原生桥接契约 */
  console.log('\n=== 5. 原生侧契约 ===');
  const java = fs.readFileSync(__dirname + '/app/src/main/java/com/life/restart/FloatService.java', 'utf8');
  const mf = fs.readFileSync(__dirname + '/app/src/main/AndroidManifest.xml', 'utf8');
  ok(java.indexOf('TYPE_APPLICATION_OVERLAY') >= 0, '原生用 TYPE_APPLICATION_OVERLAY 建悬浮窗');
  ok(java.indexOf('canDrawOverlays') >= 0, '原生存了「是否已授权」判断');
  ok(java.indexOf('onTouch') >= 0 && java.indexOf('ACTION_MOVE') >= 0, '悬浮球可拖动');
  ok(java.indexOf('EditText') < 0, 'v0.1.3 D：面板里的聊天输入框已整体移除');
  ok(java.indexOf('结束这一局') >= 0 && java.indexOf('__floatEndLife') >= 0, 'v0.1.3 D：新增「结束这一局」并接上页面入口');
  ok(java.indexOf('关闭悬浮窗') >= 0 && java.indexOf('进入调试面板') >= 0 && java.indexOf('开启无敌模式') >= 0, 'v0.1.3 D：四按钮齐备');
  ok(mf.indexOf('SYSTEM_ALERT_WINDOW') >= 0, 'Manifest 声明了悬浮窗权限');
  ok(mf.indexOf('FloatService') >= 0, 'Manifest 注册了悬浮球服务');
  const main = fs.readFileSync(__dirname + '/app/src/main/java/com/life/restart/MainActivity.java', 'utf8');
  ok(main.indexOf('floatToggle') >= 0, 'MainActivity 暴露了开关悬浮球的桥接');
  ok(main.indexOf('ACTION_MANAGE_OVERLAY_PERMISSION') >= 0, '没权限时会拉起系统授权页');
  ok(main.indexOf('REQ_OVERLAY') >= 0 && main.indexOf('canDraw(this)') >= 0, '授权回来会自动开启');
  ok(main.indexOf('FloatService.setHost') >= 0, '注入了页面 ↔ 悬浮窗通道');

  console.log('\n' + (fail ? '❌ 失败 ' + fail + ' 项 / 共 ' + (pass + fail) : '✅ 全部通过（' + pass + ' 项）'));
  process.exit(fail ? 1 : 0);
})();
