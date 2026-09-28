/* t41.js —— patch41 专项自检
   1) 整局并发预加载（80% 放行 + 后台继续跑）
   2) 配比债务轮盘（长程 AI 占比贴近目标）
   3) 深渊值（被拒绝的世界线）
   4) 状态行 / 属性条显示准确化
   5) 结算页属性面板与深渊卡片
   6) 悬浮窗三个新功能（关闭悬浮球 / 无口令进调试 / 开调试模式）
*/
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
    onclick: null, onkeydown: null, disabled: false,
    set innerHTML(v){ this._html = String(v); }, get innerHTML(){ return this._html; },
    set textContent(v){ this._txt = String(v); }, get textContent(){ return this._txt; },
    set className(v){ this._cn = v; }, get className(){ return this._cn || ''; },
    setAttribute(){}, getAttribute(){ return null; }, removeAttribute(){},
    appendChild(c){ return c; }, removeChild(){}, insertBefore(){},
    addEventListener(){}, removeEventListener(){},
    querySelector(){ return null; }, querySelectorAll(){ return []; },
    closest(){ return null; }, focus(){}, blur(){}, click(){}, select(){}, remove(){},
    getBoundingClientRect(){ return { top:0, left:0, width:0, height:0 }; },
    scrollTo(){}, getContext(){ return null; }, classList: null, parentNode: null
  };
  Object.defineProperty(e, 'classList', { get(){ return e._cls; } });
  return e;
}
const ELS = {};
const el = sel => (ELS[sel] || (ELS[sel] = stubEl()));
['#bootPage','#bootBar','#bootPct','#bootTip','#plStatus','#plAttrs','#plTags','#plYear','#plStage',
 '#log','#playbar','#endbar','#deathCard','#scPlay','#scMenu','#dlg','#toast',
 '#ovStats','#ovAbyss','#ovYears','#ovRank','#ovRankDesc','#ovSub','#ovTags','#ovText','#ovAiDbN','#ovAiDbRow']
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
const nav = { userAgent:'node-t41', language:'zh-CN' };

const js = require('./loadjs.js').loadGameJs();
const src = require('./loadjs.js').loadFullHtml();

/* 受控定时器 */
const timers = [];
const fakeSetTimeout = (fn, ms) => { timers.push({ fn, ms: ms || 0 }); return timers.length; };
const fakeClearTimeout = id => { if(id >= 1) timers[id - 1] = null; };
function flushTimers(limit){
  let n = 0;
  while(timers.length && n < (limit || 60)){
    const t = timers.shift();
    n++;
    if(t && t.fn){ try{ t.fn(); }catch(e){} }
  }
}
/* 推进一个（内部会 await 受控定时器的）Promise 直到结束 */
async function pump(p, rounds){
  let done = false;
  Promise.resolve(p).then(() => { done = true; }, () => { done = true; });
  for(let i = 0; i < (rounds || 400) && !done; i++){
    flushTimers(80);
    await new Promise(r => setImmediate(r));
  }
  return done;
}

/* 打桩 fetch：可以控制「同时有几个在飞」，用来验证并发 */
let live = 0, maxLive = 0;
const CALLS = [];
let FAILNEXT = 0;
global.fetch = (url, opt) => {
  CALLS.push({ url, body: opt && opt.body ? String(opt.body) : '' });
  live++; if(live > maxLive) maxLive = live;
  const age = (CALLS.length % 60) + 1;
  const payload = JSON.stringify({
    choices: [{ message: { content: JSON.stringify([
      { age: age, text: '第' + CALLS.length + '条：你在这一年做了件小事，日子照旧。', effects: { STR: 1 } }
    ]) }, finish_reason: 'stop' }]
  });
  const p = new Promise(res => {
    setTimeout(() => {
      live--;
      if(FAILNEXT > 0){ FAILNEXT--; res({ ok:false, status:500, headers:{get:()=>''}, text:()=>Promise.resolve('err'), json:()=>Promise.resolve({}) }); return; }
      res({ ok:true, status:200, headers:{ get:()=> 'application/json; charset=utf-8' },
        text: () => Promise.resolve(payload), json: () => Promise.resolve(JSON.parse(payload)) });
    }, 5);
  });
  return p;
};

const exportTail = `
;return {
  get S(){ return S; }, set S(v){ S = v; },
  get gen(){ return gen; }, set gen(v){ gen = v; },
  get running(){ return running; }, set running(v){ running = v; },
  bootShow, bootHide, bootNeeded, bootPrepare, enterLife, bootFinish,
  planTasks, runTasks, addToQueue, abyssTotal, abyssDrop, refreshStatus,
  bootLeftYears, prefetchStage, prefetch, tick, newLife, openSummary, die,
  goState, getCfg, setCfg, aiReady, buildOutline,
  get queue(){ return queue; }, set queue(v){ queue = v; },
  get aiStat(){ return aiStat; }, set aiStat(v){ aiStat = v; },
  get aiDebt(){ return aiDebt; }, set aiDebt(v){ aiDebt = v; },
  get preTotal(){ return preTotal; }, get preDone(){ return preDone; },
  get preTarget(){ return preTarget; }, get inflight(){ return inflight; },
  get maxConc(){ return AI_CONCURRENCY; }, get fillRatio(){ return FILL_RATIO; },
  GAME_VER, get CUR(){ return CUR; }
};`;
const api = new Function('document','window','localStorage','navigator',
  'setTimeout','clearTimeout','setInterval','console','fetch',
  js + exportTail)(doc, win, localStorage, nav,
  fakeSetTimeout, fakeClearTimeout, () => 0, console, global.fetch);

/* ================= 1. 并发与切段 ================= */
console.log('=== 1. 并发预生成 ===');
ok(api.maxConc >= 2, '并发上限 ≥ 2（当前 ' + api.maxConc + '）');
ok(api.fillRatio === 0.8, '放行比例是 80%（当前 ' + api.fillRatio + '）');
const tk = api.planTasks(1, 70);
ok(Array.isArray(tk) && tk.length > 0, 'planTasks 能切出任务（' + tk.length + ' 段）');
ok(tk.every(t => t.n >= 1), '每段至少 1 年');
ok(tk.every(t => t.from + t.n - 1 <= 70), '段不越界（不超过目标年份）');
/* 不跨阶段 */
let noCross = true;
for(const t of tk){
  const rng = { '幼年':[0,3],'童年':[4,12],'少年':[13,18],'青年':[19,30],'中年':[31,60],'老年':[61,200] }[t.stage];
  if(!rng || t.from < rng[0] || t.from + t.n - 1 > rng[1]) noCross = false;
}
ok(noCross, '每段都落在同一个阶段内（不跨阶段串插）');
ok(tk.every(t => t.n <= 8), '每段不超过 8 年（单次请求不至于过长）');

/* 真并发：runTasks 必须同时挂多个请求 */
(async () => {
  api.newLife([], { EQ:5, WIL:5, MH:10 }, 'd1');
  api.running = true;
  CALLS.length = 0;
  const tasks = api.planTasks(1, 40);
  const t0 = Date.now();
  await pump(api.runTasks(tasks, api.gen, null), 200);
  ok(maxLive >= 2, '确实并发在飞（峰值 ' + maxLive + ' 个请求同时在途）');
  /* jsdom 下 40 年并发 + DOM 渲染本身开销大，机器一旦有其它 node 抢 CPU（并行回归）
     耗时会明显上浮。并发性的主判据是上面的 maxLive >= 2；这里只留一道
     「没有退化成串行等待」的宽护栏，阈值放到 60s，避免负载波动造成误报。 */
  ok(Date.now() - t0 < 60000, '并发跑完 40 年用时可控（' + (Date.now() - t0) + 'ms）');

  /* ================= 2. 深渊值 ================= */
  console.log('\n=== 2. 深渊值（被拒绝的世界线）===');
  api.newLife([], { EQ:5, WIL:5, MH:10 }, 'd1');
  api.running = true;
  ok(api.S.abyss && api.abyssTotal() === 0, '新一局深渊值从 0 起');
  /* 制造一批「会被闸门否决」的事件 */
  const dupText = '你考上了大学，全家都很高兴。';
  api.queue = [{ age: 20, t: dupText, e:{INT:1}, src:'AI' }];
  const before = api.abyssTotal();
  const added = api.addToQueue({ arr: [
    { age: 21, text: '你在这一年搬去了新的城市。', effects:{MNY:1} },
    { age: 22, text: /\S/.test('x') ? '    ' : '', effects:{} },        // 洗成空的
    { age: 999, text: '你在这一年登上了月球。', effects:{} },            // 越界
    { age: 21, text: '你在这一年搬去了新的城市。', effects:{} }         // 与队列重复
  ], from: 21, n: 3, lo: 19, hi: 30 });
  ok(api.abyssTotal() > before, '被闸门否决的世界线计入了深渊值（+' + (api.abyssTotal() - before) + '）');
  ok(added >= 1, '合格的那条照常入队（入队 ' + added + ' 条）');

  /* ================= 3. 配比债务轮盘 ================= */
  console.log('\n=== 3. AI 占比（债务轮盘）===');
  /* patch54：一年多事件后配额按当年件数均摊，攒到的总量仍是 T */
  /* 需求 19 定案：配额机制已从「债务轮盘 aiDebt」改为「软控制 + 偏差回拉 drift」 */
  ok(/const drift = aiStat\.n >= 5 \? \(T - aiStat\.ai \/ aiStat\.n\) : 0;/.test(src), '偏差回拉：drift 由目标占比 T 与实测占比算出');
  ok(/drift > 0\.15\) wantAI = canAI/.test(src) && /drift < -0\.15\) wantAI = false/.test(src), '偏差 ±15% 外直接回拉（偏少补 AI / 偏多让本地）');
  ok(!/const dev = \(aiStat\.n >= 5\)/.test(src), '旧的「事后纠偏」已移除');
  /* 目标 100% 必须年年走 AI */
  const c = api.getCfg(); c.ai = 100; api.setCfg(c);
  api.newLife([], { EQ:5, WIL:5, MH:10 }, 'd1');
  api.running = true;
  /* 夹具确定性（其一）：掐掉 newLife 里排队的主循环回调，避免与下面的 api.tick() 并发驱动 */
  api.gen = api.gen + 1;
  /* 夹具确定性（其二）：排空在途定时器 / 预取，避免它们与下面这次 tick 抢同一个 queue */
  await pump(Promise.resolve(), 400);
  api.queue = [{ age: 1, t: '你把家里的收音机拆了又装上。', e:{INT:1}, src:'AI' }];
  api.aiStat = { n:0, ai:0 };
  api.aiStat = { n:0, ai:0 };
  await pump(api.tick(api.gen), 200);
  ok(api.aiStat.ai === 1, '目标 100%：这一年走了 AI（' + api.aiStat.ai + '/' + api.aiStat.n + '）');

  /* ================= 4. 状态行 / 属性条 ================= */
  console.log('\n=== 4. 状态行与属性条 ===');
  api.newLife([], { EQ:5, WIL:5, MH:10 }, 'd1');
  api.running = true;
  api.refreshStatus();
  const st = ELS['#plStatus'].textContent;
  ok(st.indexOf('AI 占比') >= 0, '状态行显示 AI 占比（' + st.slice(0, 40) + '…）');
  ok(st.indexOf('AI 预存') >= 0, '状态行显示 AI 预存长度（patch43 改版）');
  ok(st.indexOf('目标') >= 0, '状态行显示目标占比');
  ok(st.indexOf('推进中') < 0, '状态行不再是干巴巴的「推进中…」');
  ok(/refreshStatus\(\);\n\}/.test(src) || /refreshStatus\(\);/.test(src), '状态行有统一刷新入口');
  ok(!/ALLA\.filter\(a => ATTRS\.indexOf\(a\) >= 0 \|\| S\.attr\[a\.k\] > 0\)/.test(src),
     '属性条不再用「>0 才显示」的漏项过滤');

  /* ================= 5. 结算页 ================= */
  console.log('\n=== 5. 结算页：属性面板 + 深渊值 ===');
  api.S.age = 60;
  /* 真实场景：只有死亡卡片上的「立即总结这一生」才会走到这里，
     故先按真实前提置 dead —— openSummary 现在会拒绝结算未死的局（防跨局竞态）。 */
  api.S.dead = true;
  api.S.attr.MNY = 22;
  api.S.abyss = { drop: 30, nos: 12, gone: 0 };
  api.S.aiMade = [];
  try{ await pump(api.openSummary(), 200); }catch(e){ console.log('   (open 抛错：' + e.message + ')'); }
  const ovs = ELS['#ovStats'].innerHTML;
  ok(ovs.indexOf('基础属性') >= 0 && ovs.indexOf('隐藏属性') >= 0, '属性面板分了基础 / 隐藏两组');
  ok(ovs.indexOf('odot') >= 0 || ovs.indexOf('obar') >= 0, '属性面板带条形显示');
  ok(ovs.indexOf('od up') >= 0 || ovs.indexOf('od dn') >= 0 || ovs.indexOf('class="od') >= 0,
     '属性面板显示相对开局的涨跌');
  const abv = ELS['#ovAbyss'].innerHTML;
  ok(abv.indexOf('42') >= 0, '深渊值卡片显示总数（30+12=42）');
  ok(abv.indexOf('世界线') >= 0, '深渊值卡片有说明文案');
  ok(abv.indexOf('30') >= 0 && abv.indexOf('12') >= 0, '深渊值卡片拆解两个来源');

  /* ================= 6. 悬浮窗三功能 ================= */
  console.log('\n=== 6. 悬浮窗新功能 ===');
  ok(typeof win.__floatOpenDbg === 'function', '页面暴露了无口令调试入口 __floatOpenDbg');
  win.__floatOpenDbg();
  ok(true, '无口令入口可调用（不抛错）');
  const java = fs.readFileSync(__dirname + '/app/src/main/java/com/life/restart/FloatService.java', 'utf8');
  ok(java.indexOf('关闭悬浮窗') >= 0, 'v0.1.3 D：面板有「关闭悬浮窗」');
  ok(java.indexOf('进入调试面板') >= 0, '面板有「进入调试面板」（无需口令）');
  ok(java.indexOf('开启无敌模式') >= 0, 'v0.1.3 E：面板有「开启无敌模式」');
  ok(java.indexOf('开发者模式') < 0, 'v0.1.3 E：悬浮窗源码里已无「开发者模式」旧文案');
  ok(java.indexOf('__floatOpenDbg') >= 0, '「进入调试面板」接了页面的无口令入口');
  ok(/__floatDev\(" \+ next \+"/.test(java) || java.indexOf('window.__floatDev(') >= 0, 'v0.1.3 E：「开关无敌模式」可开可关（按当前状态取反）');
  ok(java.indexOf('stopSelf()') >= 0, '「关闭悬浮球」会停掉服务');
  ok(java.indexOf('FloatService.setOn') >= 0, '「关闭悬浮球」会落盘关闭状态');
  ok(/private TextView rowBtn\(/.test(java), 'v0.1.3 D：整行按钮有统一规格（rowBtn）');

  console.log('\n' + (fail ? '❌ 失败 ' + fail + ' 项 / 共 ' + (pass + fail) : '✅ 全部通过（' + pass + ' 项）'));
  process.exit(fail ? 1 : 0);
})();
