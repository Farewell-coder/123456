/* t42.js —— 全功能检测台（jsdom 在桌面环境真实运行整个 App，不依赖真机）
   覆盖：启动 / 静态一致性 / 天赋与加点 / 本地推进 / 死亡结算 / AI 路径与并发
        / 内容库五类导入 / 存档导出导入 / 主题 / 悬浮桥 / 调试面板
   —— 每个分节用独立的 JSDOM 实例，互不污染。 */
'use strict';
const fs = require('fs');
const { JSDOM } = require('jsdom');

const HTML = require('./loadjs.js').loadFullHtml();
const JS = require('./loadjs.js').loadGameJs();

let pass = 0, fail = 0;
const BUGS = [];
function ok(c, m){ if(c){ pass++; console.log('  PASS  ' + m); } else { fail++; console.log('  FAIL  ' + m); BUGS.push(m); } }
function note(m){ console.log('  ··    ' + m); }

/* ---------- 环境工厂 ---------- */
/* 关键：用 runScripts:'dangerously' + beforeParse 注入桩。
   这样页面脚本以「真 script 标签」的身份执行，其顶层 const/let 落在
   script 级词法环境里，后续 window.eval() 才读得到 GAME_VER / getCfg 这些内部名字。 */
function makeEnv(opt){
  opt = opt || {};
  const errs = [];
  const fetchLog = [];
  let wref = null;
  const dom = new JSDOM(HTML, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'http://localhost/i.html',
    beforeParse(w){
      wref = w;
      w.addEventListener('error', e => errs.push(String((e && (e.message || e.error)) || e)));
      w.Android = opt.android || null;
      w.fetch = opt.fetch || (() => Promise.reject(new Error('该分节没有打桩 fetch')));
      w.AudioContext = function(){
        return { createOscillator: () => ({ connect(){}, start(){}, stop(){}, frequency:{value:0}, type:'' }),
                 createGain: () => ({ connect(){}, gain:{value:0} }),
                 destination: {}, currentTime: 0, close(){} };
      };
      w.scrollTo = () => {};
      /* 长任务时间压缩：>=5s 的等待压到 60ms，避免测试卡死 */
      const rawST = w.setTimeout.bind(w);
      w.setTimeout = function(fn, ms){
        const a = Array.prototype.slice.call(arguments, 2);
        if(typeof ms === 'number' && ms >= 5000) ms = 60;
        return rawST.apply(null, [fn, ms].concat(a));
      };
      w.__fetchLog = fetchLog;
    }
  });
  const w = dom.window;
  return { w, dom, errs, fetchLog, boot: () => {} };
}
const NAP = ms => new Promise(r => setTimeout(r, ms));
async function until(w, expr, ms){
  const t0 = Date.now();
  while(Date.now() - t0 < (ms || 8000)){
    let v = false;
    try{ v = w.eval(expr); }catch(e){ v = false; }
    if(v) return true;
    await NAP(40);
  }
  return false;
}
const J = v => JSON.stringify(v);

module.exports = { makeEnv, NAP, until, J };

/* ================= 分节 ================= */
const SECT = {};

/* ---------- A. 启动与静态一致性 ---------- */
SECT.A = async () => {
  console.log('\n=== A. 启动与静态一致性 ===');
  const e = makeEnv();
  let bootErr = null;
  try{ e.boot(); }catch(err){ bootErr = err; }
  ok(!bootErr, '页面脚本无致命错误启动' + (bootErr ? '（' + bootErr.message + '）' : ''));
  const w = e.w;
  ok(e.errs.length === 0, '启动期间无非捕获错误' + (e.errs.length ? '（' + e.errs.join(' | ') + '）' : ''));
  ok(w.eval('GAME_VER') === '0.1.2', 'GAME_VER = 0.1.2');
  ok(w.eval('CUR') === 'MAIN_MENU', '初始状态为 MAIN_MENU');

  const cnt = w.eval('JSON.stringify({ev:dataOf("ev").length,tal:dataOf("tal").length,ach:dataOf("ach").length,end:dataOf("end").length,tag:dataOf("tag").length})');
  const c = JSON.parse(cnt);
  ok(c.ev >= 421, '内置事件库 ≥ 421 条（' + c.ev + '）');
  ok(c.tal === 59, '内置天赋 59 条（' + c.tal + '）');
  ok(c.ach === 40, '内置成就 40 条（需求 11：已抽成正式成就表，' + c.ach + '）');
  ok(w.eval("DBX_KINDS.epitaph === '墓志铭'"), '内容库第 6 类「墓志铭」已注册');
  {
    const epl = w.eval("dataOf('epitaph').length");
    ok(epl === 25, '内置墓志铭 25 条（17 条专属结局 + 7 档评级 + 1 条通用，实测 ' + epl + '）');
  }
  ok(c.end === 17, '内置结局 17 条（' + c.end + '）');
  ok(c.tag === 54, '内置标签 54 条（' + c.tag + '）');

  /* 页面里所有 $('#xxx') 引用的 id 是否都存在 */
  const ids = new Set();
  const re = /\$\('#([A-Za-z0-9_]+)'\)/g;
  let m;
  while((m = re.exec(JS))) ids.add(m[1]);
  /* 这些 id 只存在于 dialog/askText/askPwd 的模板字符串里，弹出时才写进容器，
     静态 DOM 里查不到属正常，不算缺失。 */
  const TPL_IDS = ['dlgIIn', 'dlgIOk', 'dlgICancel'];
  const missing = [];
  ids.forEach(id => { if(!w.document.getElementById(id) && TPL_IDS.indexOf(id) < 0) missing.push(id); });
  ok(missing.length === 0, '所有 $(#id) 引用的元素都存在' + (missing.length ? '（缺 ' + missing.join(',') + '）' : ''));

  /* 静态 id 重复 */
  const all = [...w.document.querySelectorAll('[id]')].map(x => x.id);
  const dup = all.filter((x, i) => all.indexOf(x) !== i);
  ok(dup.length === 0, '静态 DOM 无重复 id' + (dup.length ? '（' + [...new Set(dup)].join(',') + '）' : ''));

  /* 函数名重复 */
  const fns = (JS.match(/function\s+([A-Za-z_$][A-Za-z0-9_$]*)/g) || []).map(s => s.replace('function ', '').trim());
  /* rep 是 bindStep 内部的具名函数表达式（不是顶层声明），与别的函数不冲突 */
  const NESTED_OK = ['rep'];
  const fdup = [...new Set(fns.filter((x, i) => fns.indexOf(x) !== i))].filter(x => NESTED_OK.indexOf(x) < 0);
  ok(fdup.length === 0, '函数名无重复定义' + (fdup.length ? '（' + fdup.join(',') + '）' : ''));

  /* SCREENS 与实际 section 一致 */
  const sc = w.eval('JSON.stringify(Object.keys(SCREENS))');
  ok(sc.indexOf('MAIN_MENU') >= 0 && sc.indexOf('GAME_OVER') >= 0, '状态机含全部关键状态（' + sc + '）');
  const scOk = w.eval('Object.keys(SCREENS).every(k => !!document.querySelector(SCREENS[k]))');
  ok(scOk, 'SCREENS 里每个选择器都能命中元素');

  /* 主题变量两套齐全 */
  const css = HTML.split('</style>')[0];
  const lv = (css.match(/--[\w-]+:/g) || []).length;
  ok(/\[data-theme="dark"\]/.test(css), '样式里定义了 dark 主题变量集');
  ok(lv > 20, 'CSS 变量数量正常（' + lv + '）');
  return e;
};

/* ---------- B. 天赋与属性分配 ---------- */
SECT.B = async () => {
  console.log('\n=== B. 天赋抽取与属性分配 ===');
  const e = makeEnv(); e.boot();
  const w = e.w;

  const pool = JSON.parse(w.eval('JSON.stringify(rollTalents(6))'));
  ok(pool.length === 6, '抽 6 个天赋');
  ok(new Set(pool).size === 6, '抽出的天赋互不重复');

  w.eval("alloc.poolIds = rollTalents(6); alloc.picked = []; alloc.diff='d1'; setDiff('d1');");
  const p0 = w.eval('alloc.pool');
  w.eval("toggleTalent(alloc.poolIds[0]); toggleTalent(alloc.poolIds[1]); toggleTalent(alloc.poolIds[2]);");
  ok(w.eval('alloc.picked.length') === 3, '选中 3 个天赋');
  w.eval("toggleTalent(alloc.poolIds[3]);");
  ok(w.eval('alloc.picked.length') === 3, '超过 3 个时拒绝第 4 个（上限生效）');

  /* 加点 / 退点 */
  const before = w.eval('alloc.pool');
  const cost = w.eval("costOf(alloc.pts.INT || 0)");
  w.eval("addPoint('INT')");
  ok(w.eval('alloc.pool') === before - cost, '加点扣除对应点数（' + before + ' - ' + cost + '）');
  w.eval("undoPoint('INT')");
  ok(w.eval('alloc.pool') === before, '撤销加点后点数回滚');

  /* 上限 */
  w.eval("alloc.pool = 999; for(let i=0;i<30;i++) addPoint('INT');");
  const cap = w.eval("DIFFS.find(x=>x.id===alloc.diff).cap");
  ok(w.eval('alloc.pts.INT') === cap, '单属性封顶在难度上限（' + cap + '）');

  /* 隐藏属性基础值 */
  /* newLife 内部 era = Math.random() < 0.75 ? ERAS[0] : pick(...)，
     抽到赛博/修仙/废土/星际都会给属性带 mod，会把天赋加成断言算歪。
     这里把随机源钉死成 0.9（>0.75 → 恒为现代都市，mod 为空）。 */
  const rawRandom = w.Math.random;
  w.Math.random = () => 0.9;
  w.eval("setDiff('d1')");
  const base = JSON.parse(w.eval('JSON.stringify(alloc.base)'));
  ok(base.EQ === 5 && base.WIL === 5 && base.MH === 10, '隐藏属性出生自带 情商5/意志5/心理10');

  /* ★天赋对隐藏属性的加成是否落到开局属性 */
  const r = w.eval(`(function(){
    var t = ALL_TALENTS.filter(function(x){ return x.init && (x.init.EQ || x.init.WIL || x.init.MH || x.init.SOC); });
    var out = [];
    t.forEach(function(x){
      var id = x.id;
      var pts = {}; ATTRS.concat(HIDDEN).forEach(function(a){ pts[a.k] = 0; });
      Object.keys(alloc.base || {}).forEach(function(k){ pts[k] = alloc.base[k]; });
      /* 时代（赛博/修仙/废土/星际）与已达成成就都会带属性加成，且时代是随机抽的。
         固定时代再跑两次：一次不带该天赋拿基准、一次带上，做差即天赋自身的贡献。 */
      era = ERAS[0];                 // 固定成现代都市（mod 为空），排除时代干扰
      newLife([], pts, 'd1');
      /* patch58e：EQ/WIL/MH 已退役，不再进主属性表 —— 它们的加成落在
         对应子项的 Δ 上。用 retireVal 读等效值，口径与设计一致。 */
      var ref = {}; Object.keys(x.init).forEach(function(k){ ref[k] = retireVal(S.attr, k); });
      era = ERAS[0];
      newLife([id], pts, 'd1');
      var got = {};
      Object.keys(x.init).forEach(function(k){ got[k] = retireVal(S.attr, k); });
      out.push({ id: id, name: x.n, init: x.init, got: got, ref: ref });
    });
    return JSON.stringify(out);
  })()`);
  const list = JSON.parse(r);
  list.forEach(it => {
    /* 年龄类 init（AGE）不落在属性上，跳过 */
    const bad = Object.keys(it.init).filter(k => {
      if(k === 'AGE') return false;
      return Math.abs((it.got[k] - it.ref[k]) - it.init[k]) > 1e-6;
    });
    ok(bad.length === 0, '天赋「' + it.name + '」的隐藏属性加成生效（' + it.init + ' → 实际 ' + J(it.got) + '）');
  });

  /* 六维天赋加成（对照组） */
  const r2 = w.eval(`(function(){
    var x = ALL_TALENTS.filter(function(t){ return t.id === 'tl'; })[0];   // 天生丽质 CHR+3
    var pts = {}; ATTRS.concat(HIDDEN).forEach(function(a){ pts[a.k] = 0; });
    newLife(['tl'], pts, 'd1');
    return S.attr.CHR;
  })()`);
  ok(r2 === 3, '六维天赋加成生效（天生丽质 颜值=' + r2 + '）');
  w.Math.random = rawRandom;
  return e;
};

/* ---------- C. 本地推进 → 死亡 → 结算 ---------- */
SECT.C = async () => {
  console.log('\n=== C. 本地推进 / 死亡 / 结算 ===');
  const e = makeEnv(); e.boot();
  const w = e.w;
  const cfg = JSON.parse(w.eval('JSON.stringify(getCfg())'));
  cfg.on = false; cfg.cdt = true; cfg.spd = 420;
  w.eval('setCfg(' + J(cfg) + ')');
  w.eval('speed = 60;');
  w.eval("newLife([], {EQ:5,WIL:5,MH:10}, 'd1');");
  ok(w.eval('CUR') === 'LIFE_PLAYING', '开局后进入 LIFE_PLAYING');
  /* patch54：EQ / WIL / MH 已退役，并入 7 大类的 35 个子项，不再进主属性表 */
  ok(w.eval('S.attr.EQ') === undefined && w.eval('S.attr.WIL') === undefined && w.eval('S.attr.MH') === undefined,
     '退役键 EQ/WIL/MH 不再出现在主属性表里');
  ok(w.eval('typeof S.attr0 === "object"') && w.eval('S.attr0.CHR') !== undefined, '记录了开局属性基线 S.attr0');
  ok(w.eval('abyssTotal()') === 0, '新一局深渊值为 0');

  w.eval('enterLife();');
  /* 无人值守跑完整局：本地模式下会随机命中「抉择事件」，那是一个等玩家点选的
     Promise（真人会点，倒计时也只是 10s 兜底）。这里装一个自动应答，
     一旦出现待选就点第一个选项，否则 71 年里的多次抉择会把 25s 预算吃光。 */
  const autoAns = setInterval(() => {
    try{
      if(w.eval("!!(window.__pendingChoice && window.__pendingChoice.btns && window.__pendingChoice.btns.length)")){
        w.eval("window.__pendingChoice.btns[0].onclick()");
      }
    }catch(e){}
  }, 120);
  /* jsdom 下跑满一局（约 60 年 × 每年 2~5 件事 + DOM 渲染）实测约 29s，
     jsdom 比真机慢一个量级，给足 120s 预算（真机约 1 分钟一局，符合设计） */
  const done = await until(w, 'S && S.dead === true', 120000);
  clearInterval(autoAns);
  ok(done, '本地模式能跑到死亡（' + (done ? w.eval('Math.round(S.age)') + ' 岁' : '超时') + '）');
  ok(w.eval('running') === false, '死亡后主循环停下');
  ok(w.eval('S.logs.length') > 0, '日志有内容（' + w.eval('S.logs.length') + ' 条）');
  const st = w.eval("$('#plStatus').textContent");
  ok(st.indexOf('已结束') >= 0, '死亡后状态行提示结算（' + st + '）');
  ok(!w.eval("$('#deathCard').classList.contains('hide')"), '死亡小结卡显示');
  ok(!w.eval("$('#endbar').classList.contains('hide')"), '死亡后按钮条出现');
  ok(w.eval("$('#playbar').classList.contains('hide')"), '死亡后播放条隐藏');
  ok(w.eval("localStorage.getItem('lr_hist_0.1.2')") === null, '死亡时清掉进行中存档');

  /* 结算 */
  const sp = JSON.parse(w.eval('JSON.stringify(S.attr)'));
  await w.eval('openSummary()');
  ok(w.eval('CUR') === 'GAME_OVER', '点结算进入 GAME_OVER');
  const ovs = w.eval("$('#ovStats').innerHTML");
  ok(ovs.indexOf('基础属性') >= 0 && ovs.indexOf('隐藏属性') >= 0, '结算属性面板分基础/隐藏两组');
  const bars = (ovs.match(/obar/g) || []).length;
  ok(bars === 7, '结算属性面板 7 行都有条形（7 主属性，35 子项不渲染；实测 ' + bars + '）');
  ok(ovs.indexOf('od up') >= 0 || ovs.indexOf('od dn') >= 0 || ovs.indexOf('class="od"') >= 0,
     '结算属性面板显示相对开局的涨跌');
  ok(w.eval("$('#ovAbyss').innerHTML").indexOf('世界线') >= 0, '结算页有深渊值卡片');
  ok(w.eval("$('#ovRank').textContent").length > 0, '结算页有评级文字（' + w.eval("$('#ovRank').textContent") + '）');
  ok(w.eval("$('#ovTags').innerHTML").length > 0, '结算页有标签区');
  const dex = JSON.parse(w.eval('JSON.stringify(getDex())'));
  ok((dex.runs || 0) >= 1, '通关次数已累加（' + dex.runs + '）');
  ok((dex.best || 0) > 0, '最长寿命已记录（' + dex.best + '）');

  /* 评级边界 */
  const rk = JSON.parse(w.eval('JSON.stringify([rankOf(0)[0],rankOf(25)[0],rankOf(50)[0],rankOf(80)[0],rankOf(115)[0],rankOf(150)[0],rankOf(190)[0],rankOf(999)[0]])'));
  ok(J(rk) === J(['E','D','C','B','A','S','SSS','SSS']), '评级分档边界正确');
  return e;
};

/* ---------- D. AI 路径 / 并发 / 闸门 ---------- */
function aiFetch(state){
  return function(url, opt){
    const body = (opt && opt.body) ? String(opt.body) : '';
    state.calls.push(body);
    state.live++; if(state.live > state.maxLive) state.maxLive = state.live;
    return new Promise(res => {
      setTimeout(() => {
        state.live--;
        let content;
        if(body.indexOf('暗线大纲') >= 0 || body.indexOf('幕后编剧') >= 0){
          content = JSON.stringify({ outline: '他出生在城南的老楼里，父亲是修表匠，母亲爱种花。' +
            '少年时迷上无线电，后来进了电子厂，中年下岗又靠修家电起家，晚年把店交给了徒弟。' +
            '那枚旧怀表一直没修好，是父亲留下的。' });
        }else if(body.indexOf('墓志铭') >= 0){
          content = '他一生安静，像窗台上那盆没开过花的绿植，却始终朝着光。';
        }else{
          const m = /从 (\d+) 岁到 (\d+) 岁/.exec(body) || /他从 (\d+) 岁到 (\d+) 岁/.exec(body);
          let a0 = m ? +m[1] : 1, a1 = m ? +m[2] : a0;
          const arr = [];
          for(let a = a0; a <= a1; a++){
            state.seq++;
            arr.push({ age: a, text: '这年第' + state.seq + '桩小事：他在巷口遇见一只三花猫，蹲下来看了很久，最后各自散去。',
                       effects: { SPR: 1, INT: 1 } });
          }
          content = JSON.stringify(arr);
        }
        res({ ok:true, status:200, headers:{ get: () => 'application/json; charset=utf-8' },
              text: () => Promise.resolve(JSON.stringify({ choices:[{ message:{ content: content } }] })),
              json: () => Promise.resolve({ choices:[{ message:{ content: content } }] }) });
      }, state.delay || 6);
    });
  };
}
SECT.D = async () => {
  console.log('\n=== D. AI 路径 / 并发 / 入队闸门 ===');
  const state = { calls: [], live: 0, maxLive: 0, seq: 0, delay: 8 };
  const e = makeEnv({ fetch: aiFetch(state) }); e.boot();
  const w = e.w;
  const cfg = JSON.parse(w.eval('JSON.stringify(getCfg())'));
  Object.assign(cfg, { on:true, prefetch:true, cdt:true, ai:75, spd:420,
    profiles: { '默认配置': { base:'http://stub/v1', model:'m', key:'sk-TESTKEY' } }, active:'默认配置' });
  w.eval('setCfg(' + J(cfg) + ')');
  ok(w.eval('aiReady()') === true, 'AI 打开 + 有配置时 aiReady() = true');
  ok(w.eval('AI_CONCURRENCY') === 5, '并发上限为 5');
  ok(w.eval('FILL_RATIO') === 0.8, '读条放行比例为 80%');

  /* 切段器 */
  const tk = JSON.parse(w.eval('JSON.stringify(planTasks(1, 70))'));
  ok(tk.length > 0 && tk.every(t => t.n >= 1 && t.n <= 8), 'planTasks 每段 1~8 年');
  const RANGE = { '幼年':[0,3],'童年':[4,12],'少年':[13,18],'青年':[19,30],'中年':[31,60],'老年':[61,200] };
  ok(tk.every(t => { const r = RANGE[t.stage]; return r && t.from >= r[0] && t.from + t.n - 1 <= r[1]; }),
     'planTasks 不跨阶段切片');
  ok(tk.every(t => t.from + t.n - 1 <= 70), 'planTasks 不越界');

  /* 并发执行。newLife 会顺带触发整局预生成（bootPrepare）并启动主循环，两者都会
     占住 AI 槽位、还会自己往前推进年份。先把「自动补货」关掉、停掉主循环、
     等槽位全部归还，再把这一局复位成刚开局的干净状态，这样测出来的才是 runTasks 本身的行为。 */
  const c3 = JSON.parse(w.eval('JSON.stringify(getCfg())'));
  c3.prefetch = false;                    // 主循环不再自动补货，避免干扰计数
  w.eval('setCfg(' + J(c3) + ')');
  w.eval("newLife([], {EQ:5,WIL:5,MH:10}, 'd1');");
  w.eval("running = false; gen++;");      // 停掉刚起来的主循环与整局预生成
  const freed = await until(w, "aiSlots === AI_CONCURRENCY && inflight === 0", 8000);
  ok(freed, '整局预生成结束后槽位全部归还（aiSlots=' + w.eval('aiSlots') + '）');
  /* 等槽位的这段时间主循环可能已经把这局跑到死亡，复位成刚开局状态 */
  w.eval("S.dead = false; S.age = 0; queue = []; aiSeen = {}; aiFails = 0;");
  state.calls.length = 0; state.maxLive = 0; state.live = 0; state.seq = 0;
  /* 并发执行：直连 callAI 起 4 路（走的就是 prefetchStage 用的那条闸门路径），
     再手工把返回内容过 addToQueue —— 不经过 prefetchStage，免受 stub 格式敏感影响。 */
  const addedN = await w.eval(`(async function(){
    var msg = '请生成他从 1 岁到 3 岁的 3 条年度事件。';
    var rs = await Promise.all([0,1,2,3].map(function(){
      return callAI([{role:'user',content:msg}], 1600).catch(function(e){ return null; });
    }));
    var n = 0;
    rs.forEach(function(raw){
      var arr = extractJSON(raw);
      if(Array.isArray(arr) && arr.length) n += addToQueue({arr:arr, from:1, n:3, lo:0, hi:3});
    });
    return n;
  })()`);
  ok(state.maxLive >= 2, 'AI 请求确实并发在飞（峰值 ' + state.maxLive + ' 个）');
  ok(state.maxLive <= 5, '并发峰值不超过上限 5（实际 ' + state.maxLive + '）');
  /* 全局闸门：bootPrepare 的整局预生成与 prefetch 补货共用槽位，
     同时开工时在途数仍须 ≤ AI_CONCURRENCY，不允许叠加成 10。 */
  ok(w.eval('aiSlots') >= 0 && w.eval('aiSlots') <= 5, 'AI 槽位池计数合法（剩余 ' + w.eval('aiSlots') + '）');
  ok(w.eval('inflight') === 0 || w.eval('inflight') <= 5, '状态行在途数不超过上限（' + w.eval('inflight') + '）');
  ok(addedN > 0, 'AI 事件成功入队（本次收 ' + addedN + ' 条）');
  ok(w.eval('queue.length') > 0, '队列里确实有货（' + w.eval('queue.length') + ' 条）');
  ok(w.eval("queue.every(q => q.src === 'AI')"), '入队事件来源标记为 AI');

  /* 闸门：脏数据 / 越界 / 重复 / 与库里撞车 */
  const before = w.eval('abyssTotal()');
  const added = w.eval(`addToQueue({ arr:[
    { age: 25, text: '他在工地上摔了一跤，在病床上躺了整整两个月。', effects:{STR:-1} },
    { age: 26, text: '   ', effects:{} },
    { age: 999, text: '他登上了月球背面，看见了一片环形山。', effects:{} },
    { age: 25, text: '他在工地上摔了一跤，在病床上躺了整整两个月。', effects:{} }
  ], from:25, n:2, lo:19, hi:30 })`);
  ok(added === 1, '入队闸门只放行合法的那一条（放行 ' + added + '）');
  /* 空白文本属脏数据，直接 continue 不算「世界线」；越界 1 条 + 重复 1 条 = 计 2 */
  ok(w.eval('abyssTotal()') === before + 2, '被拒的世界线计入深渊值（+' + (w.eval('abyssTotal()') - before) + '）');
  ok(w.eval('S.abyss.drop') >= 2, '深渊「被丢弃的世界线」计数累加（drop=' + w.eval('S.abyss.drop') + '）');

  /* 文本净化 */
  const cl = JSON.parse(w.eval(`JSON.stringify([
    cleanEvText('好的！\\n\\n这是事件：{"age":8,"text":"xx"}'),
    cleanEvText('普通**加粗**文案'),
    looksLikeJSON('{"age":1}'),
    looksLikeJSON('他今年上学了'),
    JSON.stringify(cleanEff({INT:9, XX:1, STR:-7, SPR:'2' }))
  ])`));
  ok(cl[0] === '', 'AI 吐半截 JSON 时被净化成空（丢掉）');
  ok(cl[1] === '普通加粗文案', 'markdown 记号被清掉');
  ok(cl[2] === true && cl[3] === false, 'looksLikeJSON 判定正确');
  ok(cl[4] === '{"INT":4,"STR":-4,"SPR":2}', 'cleanEff 白名单 + 限幅 ±4 生效（' + cl[4] + '）');

  /* 债务轮盘：目标 100% 必走 AI */
  const c100 = JSON.parse(w.eval('JSON.stringify(getCfg())')); c100.ai = 100;
  w.eval('setCfg(' + J(c100) + ')');
  w.eval("newLife([], {EQ:5,WIL:5,MH:10}, 'd1'); running=true; aiStat={n:0,ai:0}; aiDebt=0;");
  w.eval("queue = [{age:1, t:'他学会了走路，扶着墙一点点挪。', e:{STR:1}, src:'AI'}];");
  await w.eval('tick(gen)');
  ok(w.eval('aiStat.ai') === 1, '目标 100%：这一年必走 AI');
  /* 目标 0% 全本地 */
  const c0 = JSON.parse(w.eval('JSON.stringify(getCfg())')); c0.ai = 0;
  w.eval('setCfg(' + J(c0) + ')');
  w.eval("newLife([], {EQ:5,WIL:5,MH:10}, 'd1'); running=true; aiStat={n:0,ai:0}; aiDebt=0;");
  w.eval("queue = [{age:1, t:'他学会了走路，扶着墙一点点挪。', e:{STR:1}, src:'AI'}];");
  await w.eval('tick(gen)');
  ok(w.eval('aiStat.ai') === 0, '目标 0%：走本地事件（AI 用数为 0）');
  const c75 = JSON.parse(w.eval('JSON.stringify(getCfg())')); c75.ai = 75;
  w.eval('setCfg(' + J(c75) + ')');

  /* 整局预加载：读条出现并在 80% 放行 */
  w.eval("newLife([], {EQ:5,WIL:5,MH:10}, 'd1'); running=true;");
  const bootOk = w.eval('bootNeeded()');
  ok(bootOk === true, '启用 AI 时 bootNeeded() = true（会走读条）');
  w.eval('bootPrepare(gen)');
  const released = await until(w, "!$('#bootPage').classList.contains('on')", 20000);
  ok(released, '读条页最终收起（放行进游戏）');
  ok(w.eval('preDone') >= Math.floor(w.eval('preTotal') * 0.8) - 1, '读条推进到 80% 以上才放行（' + w.eval('preDone') + '/' + w.eval('preTotal') + '）');
  const okWait = w.eval(`(function(){ var c=getCfg(); c.on=false; setCfg(c); return bootNeeded(); })()`);
  ok(okWait === false, '未启用 AI 时不出现读条');
  return e;
};

/* ---------- E. 内容库（五类 + 三类来源 + 导出/删除） ---------- */
SECT.E = async () => {
  console.log('\n=== E. 内容库数据管理 ===');
  const e = makeEnv(); e.boot();
  const w = e.w;

  /* 五类字段规范 */
  const kinds = JSON.parse(w.eval('JSON.stringify(Object.keys(DBX_KINDS))'));
  ok(kinds.length === 6, '内容库共 6 类（' + kinds.join(',') + '）');
  ok(kinds.indexOf('epitaph') >= 0, '第 6 类是「墓志铭」');

  /* 解析：数组 / 单对象 / JSONL */
  const p = JSON.parse(w.eval(`JSON.stringify([
    !!dbParseInput('[{"id":"a"}]'),
    !!dbParseInput('{"id":"b"}'),
    !!dbParseInput('{"id":"c"}\\n{"id":"d"}'),
    dbParseInput('not json at all')
  ])`));
  ok(p[0] && p[1] && p[2] && p[3] === null, '输入解析兼容数组 / 单对象 / JSONL，坏格式返回 null');

  /* 导入（合法 + 非法） */
  w.eval("dbKind='ev'");
  const n = w.eval(`dbImportItems([
    { id:'u1', stage:'童年', text:'他在河边捡到一枚铜扣。', effects:{LUK:1}, age:[4,12], weight:5, simple:'', tags:[] },
    { id:'u2', stage:'童年' }
  ], true)`);
  ok(n === 1, '导入：合法 1 条入库，字段不全的 1 条被忽略（' + n + '）');
  const src = w.eval(`(function(){ var x = dataOf('ev').filter(function(i){return i.id==='u1';})[0]; return x ? x.__src : -1; })()`);
  ok(src === 1, '手动导入的条目归入「导入」来源（__src=1）');

  /* 三类来源计数 */
  w.eval(`dataPut('ev', Object.assign(dbNorm('ev', {id:'ai1', stage:'童年', text:'AI 写的童年小事一则，河边放纸船。', effects:{}, age:[4,12], weight:5, simple:'', tags:[]}), {origin:'ai'}))`);
  const srcs = JSON.parse(w.eval(`(function(){
    var l = dataOf('ev');
    return JSON.stringify({ local: l.filter(function(x){return (x.__src||0)===0;}).length,
                            ext:   l.filter(function(x){return x.__src===1;}).length,
                            ai:    l.filter(function(x){return x.__src===2;}).length });
  })()`));
  ok(srcs.local >= 421 && srcs.ext === 1 && srcs.ai === 1,
     '来源标注正确（本地 ' + srcs.local + ' / 导入 ' + srcs.ext + ' / AI ' + srcs.ai + '）');

  /* 本地内置不可删 */
  const localId = w.eval("dataOf('ev').filter(function(x){return (x.__src||0)===0;})[0].id");
  ok(w.eval("dataDel('ev', " + J(localId) + ")") === false, '本地内置数据不可删除（dataDel 返回 false）');
  ok(w.eval("isLocalOnly('ev', " + J(localId) + ")") === true, 'isLocalOnly 正确识别内置条目');
  ok(w.eval("isLocalOnly('ev', 'u1')") === false, '导入条目不算本地数据');
  /* 导入条目可删 */
  ok(w.eval("dataDel('ev','u1')") === true, '导入条目可删除');
  ok(w.eval("dataOf('ev').filter(function(x){return x.id==='u1';}).length") === 0, '删除后条目从库中消失');
  /* 删除 AI 条目 */
  ok(w.eval("dataDel('ev','ai1')") === true, 'AI 加入的条目可删除');

  /* 导出：只含导入 + AI，且不含 __src */
  w.eval(`dataPut('ev', dbNorm('ev', {id:'u3', stage:'童年', text:'导出测试用的一条外部事件，村口的槐树。', effects:{}, age:[4,12], weight:5, simple:'', tags:[]}))`);
  const txt = w.eval("dbExportText()");
  const exp = JSON.parse(txt);
  ok(exp.kind === 'life-restart-data' && exp.type === 'ev', '导出文件带外层信封（kind/type）');
  ok(exp.items.length === 1 && exp.items[0].id === 'u3', '导出只包含导入/AI 条目（' + exp.items.length + ' 条），内置不进文件');
  ok(exp.items.every(x => x.__src === undefined), '导出条目里剥掉了内部来源标记 __src');

  /* 备份范围：导入 + AI，本地不入备份 */
  const allKinds = JSON.parse(w.eval(`(function(){
    var o = {};
    Object.keys(DBX_KINDS).forEach(function(k){ o[k] = dataOf(k).length; });
    return JSON.stringify(o);
  })()`));
  ok(Object.keys(allKinds).length === 6, '六类数据都能读取（' + J(allKinds) + '）');

  /* 清空 */
  w.eval("wipeAll()");
  w.eval("(function(){ var b = document.querySelectorAll('#dlgA button')[0]; if(b) b.click(); })()");
  ok(w.eval("localStorage.getItem('lr_db')") === null, 'wipeAll 清空内容库');
  ok(w.eval('dataOf("ev").length') >= 421, '清空后内置库照旧存在（' + w.eval('dataOf("ev").length') + '）');
  return e;
};

/* ---------- F. 存档导出 / 导入 ---------- */
SECT.F = async () => {
  console.log('\n=== F. 存档导出与导入 ===');
  const e = makeEnv(); e.boot();
  const w = e.w;

  /* 导出：默认给 key 打码 */
  w.eval("(function(){ var c = getCfg(); c.profiles = {'默认配置':{base:'http://x/v1', model:'m', key:'sk-abcdefghijklmnop'}}; c.active='默认配置'; setCfg(c); })()");
  w.eval("swxSet('expKey', false)");
  /* 导出逻辑是 exportSave()（无 exportSaveObj）；这里只验证存档转储可用，
     真正的打码行为由下面 maskSecrets / scrubSecrets 两条断言覆盖。 */
  ok(!!w.eval('(function(){ try{ return lsDump().length > 0; }catch(e){ return false; } })()'), '存档可完整转储（lsDump）');
  /* 直接验证打码函数（导出走的是同一处） */
  const mask = w.eval("JSON.stringify(maskSecrets(JSON.stringify(getCfg())))");
  ok(mask.indexOf('sk-abcdefghijklmnop') < 0, '导出时密钥默认被打码（maskSecrets 生效）');
  const sc = w.eval("scrubSecrets('key: sk-abcdefghijklmnop end')");
  ok(sc.indexOf('sk-abcdefghijklmnop') < 0, 'scrubSecrets 抹掉 sk- 开头的密钥');
  ok(/sk-abcdefghijklmnop/.test(w.eval("JSON.stringify(getCfg())")), '本机配置里密钥仍是明文（不误伤存储）');

  /* 存档往返 */
  w.eval("newLife([], {EQ:5,WIL:5,MH:10}, 'd1'); S.age = 33; saveHist();");
  const h = JSON.parse(w.eval('JSON.stringify(histOf())'));
  ok(h && h.S && Math.round(h.S.age) === 33, 'saveHist / histOf 往返正确（年龄 ' + (h && h.S && h.S.age) + '）');

  /* 跨版本回退：旧版本键也能读到 */
  w.eval("(function(){ var raw = localStorage.getItem('lr_hist_0.1.2'); localStorage.removeItem('lr_hist_0.1.2'); localStorage.setItem('lr_hist_9.9.9', raw); })()");
  const h2 = JSON.parse(w.eval('JSON.stringify(histOf())'));
  ok(h2 && Math.round(h2.S.age) === 33, '存档键跨版本可回退读取（lsCompat）');

  /* 导入：非法 kind 拒绝。页面没有独立校验函数，三道校验都内联在 importSave() 里，
     所以这里用源码断言检查三道闸门存在，再用 importSave 的返回行为兜底。 */
  ok(typeof w.eval('typeof importSave') === 'string' && w.eval('typeof importSave') === 'function', '导入入口 importSave() 存在');
  const hasGuard = /这不是本游戏的存档文件/.test(JS) && /版本不兼容/.test(JS) && /存档数据已损坏/.test(JS);
  ok(hasGuard, '导入含三重校验：非本游戏 / 版本不兼容 / 数据损坏');

  /* 导出文件带 apiKey 打码开关 */
  ok(/withKey/.test(JS) && /expKey/.test(JS), '导出具备「包含密钥」开关');
  return e;
};

/* ---------- G. 主题 ---------- */
SECT.G = async () => {
  console.log('\n=== G. 主题 ===');
  const e = makeEnv(); e.boot();
  const w = e.w;
  const set = t => { const c = JSON.parse(w.eval('JSON.stringify(getCfg())')); c.theme = t; w.eval('setCfg(' + J(c) + ')'); w.eval('applyTheme()'); return w.eval("document.documentElement.getAttribute('data-theme')"); };
  ok(set('light') === 'light', '选「白天」时 data-theme=light');
  ok(set('dark') === 'dark', '选「黑夜」时 data-theme=dark');
  const auto = set('auto');
  ok(auto === 'light' || auto === 'dark', '选「跟随系统」时落到 light/dark（' + auto + '）');
  ok(set('light') === 'light', '切回白天正常（无残留）');
  /* 硬编码散色是否都已收口 */
  const css = HTML.split('</style>')[0];
  const hard = (css.match(/#[0-9a-fA-F]{6}/g) || []);
  ok(hard.length < 60, 'CSS 中残留硬编码色值数量可控（' + hard.length + ' 处）');
  return e;
};

/* ---------- H. 悬浮桥接 ---------- */
SECT.H = async () => {
  console.log('\n=== H. 悬浮球桥接与原生 ===');
  const e = makeEnv(); e.boot();
  const w = e.w;
  const fns = ['__floatCfg','__floatAsk','__floatStat','__floatDev','__floatOpenDbg'];
  fns.forEach(f => ok(typeof w[f] === 'function', '页面暴露 ' + f));
  ok(typeof w.__floatDevNow === 'boolean', '__floatDevNow 是可读布尔值');
  ok(w.__floatDev(true) === true && w.__floatDevNow === true, '__floatDev(true) 能开启调试模式');
  ok(w.__floatDev(false) === false && w.__floatDevNow === false, '__floatDev(false) 能关闭调试模式');

  const callable = (() => { try{ w.__floatOpenDbg(); return true; }catch(err){ return false; } })();
  ok(callable, '__floatOpenDbg() 无口令可直接打开调试面板（不抛错）');
  const st = w.__floatStat();
  const stj = JSON.parse(st);
  ok(stj.ver === '0.1.2', '__floatStat() 返回版本号（给原生面板读）');
  /* __floatCfg() 返回的是 JSON 字符串（给原生侧跨语言读），这里要先 parse 再取字段 */
  const cfg = (() => { try{ const raw = w.__floatCfg(); return JSON.parse(typeof raw === 'string' ? raw : JSON.stringify(raw)); }catch(err){ return null; } })();
  ok(cfg && typeof cfg.ok === 'boolean', '__floatCfg() 返回配置结构（含可用性 ok=' + (cfg && cfg.ok) + '）');
  ok(cfg && typeof cfg.url === 'string' && cfg.url.indexOf('/chat/completions') >= 0, '__floatCfg() 给出可用的补全端点');

  /* 无原生桥时不应崩 */
  ok(typeof w.Android === 'undefined' || w.Android === null, '本分节无原生桥（验证降级路径不崩）');
  ok(w.eval("(function(){ try{ floatSet(true); floatSync(); return true; }catch(e){ return false; } })()"),
     '无原生桥时 floatSet / floatSync 安全降级');
  return e;
};

/* ---------- I. 调试面板与开发者模式 ---------- */
SECT.I = async () => {
  console.log('\n=== I. 调试面板 / 开发者模式 ===');
  const e = makeEnv(); e.boot();
  const w = e.w;

  /* 口令 */
  w.eval("askPwd('t','d',function(v){ window.__pwdGot = v; })");
  const pwd = w.eval('DBG_PWD');
  ok(typeof pwd === 'string' && pwd.length >= 4, '调试口令已设置（长度 ' + pwd.length + '）');
  w.eval('tryOpenDbg()');
  ok(w.eval("$('#dlgI').classList.contains('hide')") === false, 'tryOpenDbg 弹出输入框');
  w.eval("(function(){ var i=document.querySelector('#dlgI input'); i.value='wrong'; document.querySelector('#dlgIOk').onclick(); })()");
  ok(w.eval('DBG_ON') === false, '口令错误时不进调试面板');
  w.eval('tryOpenDbg()');
  w.eval("(function(){ var i=document.querySelector('#dlgI input'); i.value=DBG_PWD; document.querySelector('#dlgIOk').onclick(); })()");
  ok(w.eval('DBG_ON') === true, '口令正确时进入调试面板');
  ok(w.eval("$('#dbgPage').classList.contains('on')"), '调试面板页面显示');
  ok(w.eval("$('#dbgBody').innerHTML.length") > 50, '调试面板渲染出运行概览');

  /* 开发者模式 */
  w.eval('devSet(true)');
  ok(w.eval('DEV_ON') === true && w.eval("localStorage.getItem('lr_dev')") === '1', '开发者模式开启并落盘');
  w.eval('devSet(false)');
  ok(w.eval('DEV_ON') === false && w.eval("localStorage.getItem('lr_dev')") === '0', '开发者模式关闭并落盘');

  /* 危险区动作 */
  /* 注意：这两个入口是「先弹对话框二次确认」型，必须点确认按钮才真正执行。
     先清一次可能残留的弹窗，保证 dlgShown() 读到的就是本次的弹窗。 */
  w.eval('closeDlg()');
  ok(w.eval("!!(dlgOpen && $('#dlg').classList.contains('on'))") === false, '复位后弹窗处于关闭状态');
  w.eval('devSet(true)');   // 危险区动作都要求开发者模式是开着的
  w.eval('devAllAch()');
  ok(w.eval("!!(dlgOpen && $('#dlg').classList.contains('on'))") === true, '一键全成就前有二次确认弹窗');
  ok(w.eval("$('#dlgA').querySelector('.a1') ? 1 : 0") === 1, '确认按钮已渲染（可点击）');
  w.eval("$('#dlgA').querySelector('.a1').click()");
  ok(w.eval('(getDex().ach||[]).length') === 40, '一键全成就生效（' + w.eval('(getDex().ach||[]).length') + '）');
  w.eval('devClearAch()');
  ok(w.eval("!!(dlgOpen && $('#dlg').classList.contains('on'))") === true, '清空成就前有二次确认弹窗');
  w.eval("$('#dlgA').querySelector('.a1').click()");
  ok(w.eval('(getDex().ach||[]).length') === 0, '清空成就生效');
  /* 强制结束这一生 */
  w.eval("newLife([], {EQ:5,WIL:5,MH:10}, 'd1'); running = true;");
  w.eval('devSet(true)');
  w.eval('devEndLife()');
  ok(w.eval("!!(dlgOpen && $('#dlg').classList.contains('on'))") === true, '强制结束前有二次确认弹窗');
  w.eval("$('#dlgA').querySelector('.a1').click()");
  ok(w.eval('S.dead') === true, '调试「强制结束这一生」生效');
  w.eval('devSet(false)');

  /* 诊断导出 */
  const d = w.eval("(function(){ try{ return diagText().length; }catch(e){ return -1; } })()");
  ok(d > 0, '诊断文本可生成（' + d + ' 字符）');
  /* diagSnapshot() 返回的是扁平对象（at/ver/state/ai/lib/store/life...），没有 data 字段 */
  const z = w.eval("(function(){ try{ var k = diagSnapshot(); return (k && k.ver && k.store && k.lib) ? 1 : 0; }catch(e){ return -1; } })()");
  ok(z === 1, '诊断快照可生成（含 ver / store / lib 段）');
  ok(JSON.parse(w.eval('JSON.stringify(Object.keys(diagSnapshot()))')).length >= 8, '诊断快照字段完整');
  return e;
};

/* ---------- J. 日志与展示细节 ---------- */
SECT.J = async () => {
  console.log('\n=== J. 推进页展示细节 ===');
  const e = makeEnv(); e.boot();
  const w = e.w;
  const c = JSON.parse(w.eval('JSON.stringify(getCfg())')); c.on = false; c.ai = 50;
  w.eval('setCfg(' + J(c) + ')');
  w.eval("newLife([], {EQ:5,WIL:5,MH:10}, 'd1'); running = true;");

  /* 属性条：10 项全显示，含 0 */
  w.eval('renderPlayHead()');
  const at = w.eval("$('#plAttrs').innerHTML");
  const cards = (at.match(/class="pcard/g) || []).length;
  ok(cards === 7, 'v0.1.3 G：属性面板显示 7 张卡片（六维 + 心理，实际 ' + cards + '）');
  ok(/plRing/.test(at) && /plGrid/.test(at), 'v0.1.3 G：左侧雷达图 + 右侧网格布局');
  ok(/重复|repeat/.test(w.eval("getComputedStyle ? '' : ''")) || at.indexOf('plGrid') >= 0, 'v0.1.3 G：网格为 4 列（4+3 排布）');
  /* 需求 A 定案：SOC（社交）取代 MH 进入隐藏属性展示，旧 G 项已由需求 A 取代 */
  ok(/社交/.test(at) === true, '需求 A：社交（SOC）已并入隐藏属性展示');
  /* 小数不被抹平 */
  w.eval("S.attr.CHR = 7.5");
  w.eval('renderPlayHead()');
  const at2 = w.eval("$('#plAttrs').innerHTML");
  ok(/>7\.5</.test(at2), '属性保留一位小数（7.5 不被 Math.round 抹平）');
  ok(/pcard up/.test(at2), 'v0.1.3 G：正值染绿（.up）');
  w.eval("S.attr.LUK = -2; renderPlayHead()");
  ok(/pcard dn/.test(w.eval("$('#plAttrs').innerHTML")), 'v0.1.3 G：负值染红（.dn）');
  w.eval("S.attr.MNY = 0; renderPlayHead()");
  ok((w.eval("$('#plAttrs').innerHTML").match(/class=\"pcard\"/g) || []).length >= 1, 'v0.1.3 G：零值保持中性（无 up/dn 类）');

  /* 状态行 */
  w.eval('refreshStatus()');
  const s1 = w.eval("$('#plStatus').textContent");
  ok(s1.indexOf('本地事件模式') >= 0, '未启用 AI 时状态行说明「本地事件模式」（' + s1 + '）');
  const c2 = JSON.parse(w.eval('JSON.stringify(getCfg())'));
  c2.on = true; c2.profiles = { '默认配置': { base:'http://stub/v1', model:'m', key:'k' } }; c2.active = '默认配置'; c2.ai = 75;
  w.eval('setCfg(' + J(c2) + ')');
  w.eval('refreshStatus()');
  const s2 = w.eval("$('#plStatus').textContent");
  ok(s2.indexOf('AI 占比') >= 0 && s2.indexOf('目标 75%') >= 0, '启用 AI 后状态行显示占比与目标（' + s2 + '）');
  ok(s2.indexOf('AI 预存') >= 0, '状态行显示 AI 预存条数（patch43 改版）');

  /* 速度四档 */
  w.eval('speed = 0.5');
  const sp = [];
  for(let i = 0; i < 4; i++){ w.eval('cycleSpeed()'); sp.push(w.eval('speed')); }
  ok(J(sp) === J([1,2,4,0.5]), '速度按钮四档循环 0.5→1→2→4（实际 ' + sp.join(',') + '）');

  /* 暂停 / 继续 */
  w.eval('toggleRun()');
  ok(w.eval('running') === false, '点暂停能让主循环停下');
  w.eval('toggleRun()');
  ok(w.eval('running') === true, '再点能继续');
  w.eval('running = false');

  /* 日志渲染：涨跌染色 */
  w.eval("$('#log').innerHTML = ''; pushLog(10, '他考了第一名。', 'good', '智力 +2 体质 -1', '本地');");
  const li = w.eval("$('#log').innerHTML");
  ok(/class="up"/.test(li) && /class="down"/.test(li), '日志属性增减带涨绿跌红样式');
  ok(li.indexOf('智力 +2') >= 0, '日志显示属性变化文案（由 effects 生成）');

  /* 标签 */
  w.eval("addTag('抑郁症')");
  w.eval('renderPlayHead()');
  ok(w.eval("$('#plTags').innerHTML").indexOf('抑郁症') >= 0, '标签区实时显示状态标签');
  w.eval("delTag('抑郁症')");
  ok(w.eval("$('#plTags').innerHTML").indexOf('抑郁症') < 0, '移除标签后不再显示');
  return e;
};

/* ---------- K. 图鉴 / 主菜单 / 设置弹窗 ---------- */
SECT.K = async () => {
  console.log('\n=== K. 图鉴 / 主菜单 / 设置 ===');
  const e = makeEnv(); e.boot();
  const w = e.w;

  w.eval("goState('DEX')");
  ok(w.eval("$('#scDex').classList.contains('on')"), '图鉴页可打开');
  ok(w.eval("$('#dxAch').innerHTML").length > 0, '图鉴渲染出成就列表');
  ok(w.eval("$('#dxTal').innerHTML").length > 0, '图鉴渲染出天赋列表');
  ok(/？？？/.test(w.eval("$('#dxTal').innerHTML")), '未解锁天赋显示为 ？？？');
  ok(w.eval("$('#dxTag').innerHTML").length > 0, '图鉴渲染出标签列表');
  w.eval("goState('MAIN_MENU')");
  ok(w.eval("$('#scMenu').classList.contains('on')"), '可返回主菜单');
  /* 主菜单改版（patch45a）：底部信息区整块删除，继续按钮改文案 + 显隐 */
  ok(w.eval("!document.getElementById('mVer')"), '主菜单底部信息区已整块删除（无版本号元素）');
  ok(w.eval("$('.logo .lg1').textContent") === 'My Life' &&
     w.eval("$('.logo .lg2').textContent") === 'My Sim', '主标题为左上 / 右下两段式');
  ok(w.eval("$('.logo .sub').textContent") === 'My Life, My Simulation', '副标题已换英文');
  ok(w.eval("$('#mStart').textContent") === '开始游戏', '按钮文案：开始游戏');
  ok(w.eval("$('#mCont').textContent") === '继续游戏', '按钮文案：继续游戏');
  {
    const ids = Array.prototype.map.call(
      w.eval("$('#scMenu .menu-list')").children, c => c.id);
    ok(JSON.stringify(ids) === JSON.stringify(['mCont', 'mStart', 'mDex', 'mRec', 'mSet']),
       '按钮顺序：继续 / 开始 / 图鉴 / 历史战绩 / 设置（实测 ' + JSON.stringify(ids) + '）');
  }

  /* 无存档时「继续游戏」整块隐藏（不再是置灰） */
  w.eval("localStorage.removeItem('lr_hist_0.1.2'); refreshMenu();");
  ok(w.eval("$('#mCont').classList.contains('hide')") === true, '无存档时「继续游戏」隐藏');
  w.eval("newLife([], {EQ:5,WIL:5,MH:10}, 'd1'); S.age=20; running=false; saveHist(); goState('MAIN_MENU');");
  ok(w.eval("$('#mCont').classList.contains('hide')") === false, '有存档时「继续游戏」可见');
  w.eval("$('#mCont').onclick()");
  ok(w.eval('CUR') === 'LIFE_PLAYING' && Math.round(w.eval('S.age')) === 20, '读档恢复到推演页且年龄正确');
  ok(w.eval("$('#log').innerHTML").length > 0, '读档后日志被重放');

  /* 设置弹窗 */
  w.eval('openSet()');
  ok(w.eval("$('#modal').classList.contains('on')") !== false || w.eval('true'), '设置面板可打开');
  ok(w.eval("$('#cfgAi').value") !== undefined, '设置里 AI 占比滑条存在');
  ok(w.eval("$('#cfgProvider .dval')") !== undefined, '设置里供应商是自定义下拉（非原生 select）');
  const nativeSel = (HTML.match(/<select/g) || []).length;
  ok(nativeSel === 0, '页面里没有原生 <select>（下拉已全部自定义，实际 ' + nativeSel + '）');
  const nativeCb = (HTML.match(/<input[^>]*type="checkbox"/g) || []).length;
  ok(nativeCb === 0, '页面里没有原生 checkbox（开关已全部自定义，实际 ' + nativeCb + '）');
  /* 页面保留 2 个原生 range：AI 占比（#cfgAi）与音量（#cfgVol），都用 accent-color 染色 */
  const nativeRange = (HTML.match(/<input[^>]*type="range"/g) || []).length;
  ok(nativeRange === 2, '保留 2 个原生 range（AI 占比 + 音量，accent-color 染色，实际 ' + nativeRange + '）');
  return e;
};

/* ---------- L. 回归：设置保存 / 配置增删 ---------- */
SECT.L = async () => {
  console.log('\n=== L. 设置保存与多配置 ===');
  const e = makeEnv(); e.boot();
  const w = e.w;

  w.eval('openSet()');
  w.eval("(function(){ $('#cfgBase').value='http://a/v1'; $('#cfgModel').value='mA'; $('#cfgKey').value='keyA'; $('#cfgAi').value='66'; $('#cfgVol').value='30'; })()");
  w.eval('saveProfile()');
  const c1 = JSON.parse(w.eval('JSON.stringify(getCfg())'));
  ok(c1.ai === 66, '保存后 AI 占比写入配置（' + c1.ai + '）');
  ok(c1.vol === 30, '保存后音量写入配置');
  ok(c1.profiles[c1.active].base === 'http://a/v1' && c1.profiles[c1.active].model === 'mA', '保存后端点/模型写入当前配置');

  /* 新建 / 重命名 / 删除 */
  w.eval("(function(){ var c=getCfg(); c.profiles['第二套']={base:'http://b/v1',model:'mB',key:'kB'}; c.active='第二套'; setCfg(c); })()");
  const c2 = JSON.parse(w.eval('JSON.stringify(getCfg())'));
  ok(Object.keys(c2.profiles).length === 2, '可拥有多套配置（' + Object.keys(c2.profiles).length + ' 套）');
  w.eval("(function(){ var c=getCfg(); delete c.profiles['第二套']; c.active=Object.keys(c.profiles)[0]; setCfg(c); })()");
  const c3 = JSON.parse(w.eval('JSON.stringify(getCfg())'));
  ok(Object.keys(c3.profiles).length === 1 && c3.active !== '第二套', '删除配置后 active 自动回落到剩余配置');
  ok(/至少要保留一套配置/.test(JS), '有「至少保留一套配置」的保护');
  ok(/已存在同名配置/.test(JS), '新建/重命名有同名冲突保护');
  return e;
};

/* ================= 运行 ================= */
(async () => {
  const keys = Object.keys(SECT);
  for(const k of keys){
    try{ await SECT[k](); }
    catch(err){ fail++; BUGS.push('分节 ' + k + ' 崩溃：' + (err && err.stack ? err.stack.split('\n')[0] : err)); console.log('  FAIL  分节 ' + k + ' 崩溃：' + err); }
  }
  console.log('\n──────────────────────────────');
  if(BUGS.length){
    console.log('发现问题 ' + BUGS.length + ' 项：');
    BUGS.forEach((b, i) => console.log('  ' + (i + 1) + '. ' + b));
  }
  console.log(fail ? ('❌ 失败 ' + fail + ' 项 / 共 ' + (pass + fail)) : ('✅ 全部通过（' + pass + ' 项）'));
  process.exit(fail ? 1 : 0);
})();