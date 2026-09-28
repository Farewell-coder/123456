/* =========================================================
   [03-logic.js] 游戏逻辑层（拆分文件 4/6）
   职责：属性变更 applyEffect、年度推进 tick、年龄/寿命/死亡判定、
         tag 增删、随机事件派发等「每回合发生什么」的逻辑。
   依赖：00-config.js + 01-data.js + 02-core.js（常量 / 数据 / 规则）
   ========================================================= */
/* ========== 属性变更 ========== */
function applyEffect(e, silent){
  if(!e) return [];
  const h = hooks();
  const out = [];
  /* 退役键（情商 / 意志力 / 心理健康）：不再写进主属性表。
     它们已并入 7 大类，界面永不显示；继续写进去只会累积成不可见的脏数据
     （老库里 455 条事件的 effects 带着这三个键）。改成按语义落点记成子项 Δ。 */
  Object.keys(e).forEach(k => {
    if(!LEGACY_SUB[k]) return;
    const v0 = Number(e[k]) || 0;
    if(!v0) return;
    if(!S.hid) S.hid = {};
    const sb = LEGACY_SUB[k];
    const dv = Math.round(v0 * yearScale() * 10) / 10;
    if(!dv) return;
    S.hid[sb] = clamp(Math.round((Number(S.hid[sb]) || 0) + dv), -SUB_DCAP, SUB_DCAP);
  });
  /* ===== 年龄属性（AGE，0~200）=====
     需求：时间会推进年龄（每年 +1），事件里写了 AGE 增减时按它额外调整 ——
     写了正数就再多长几岁，写了负数就「这几年没在他身上留下痕迹」把年龄还回去。
     硬边界 0~200：无论时间推进还是事件增减，年龄永远落在这一段里。 */
  Object.keys(e).forEach(k => {
    const u = String(k).toUpperCase();
    if(u !== 'AGE') return;
    const v0 = Number(e[k]) || 0;
    if(!v0) return;
    if(S.age == null) S.age = 0;
    const before = S.age;
    S.age = clamp(S.age + v0, 0, AGE_MAX);
    const dv = Math.round((S.age - before) * 10) / 10;
    if(!dv) return;
    out.push('AGE' + (dv > 0 ? '+' : '') + dv);
  });
  Object.keys(e).forEach(k => {
    if(LEGACY_SUB[k]) return;
    if(k === 'AGE') return;          // 年龄在上面的循环里已经单独结算
    if(!(k in S.attr)) return;
    let v = Number(e[k]) || 0;
    if(!v) return;
    if(h.lateBloom) v = (S.age < 40 ? v * 0.5 : v * 3);
    if(k === 'INT' && h.growInt) v *= h.growInt;
    if(k === 'SOC' && h.growSoc) v *= h.growSoc;
    if(k === 'SOC' && S.tags.indexOf('网红') >= 0) v *= 2;
    if(h.grow) v *= h.grow;
    /* patch54：一年内同一项反复被加时按次数打折（第 2 次半价、第 3 次起 1/4） */
    if(!silent){ v *= margMul(k) * yearScale(); }
    /* 需求 9：属性增益权重整体上调到 1.5 倍。
       只抬正向收益，惩罚保持原样 —— 两边一起放大只会让曲线更陡，不是想要的。 */
    if(v > 0) v *= 1.5;
    v = softAttr(k, v);
    /* 抑郁症的额外惩罚：作用于本条事件的负收益。
       注意 k 只会是 S.attr 里的七个主属性（隐藏四项与 35 子项在这里进不来），
       所以这里只能写 CHR；心理层面的持续消耗由标签自身的年度效果负责
       （见 applyYearTag：抑郁症每年扣一次心理与颜值）。 */
    if(v < 0 && S.tags.indexOf('抑郁症') >= 0 && k === 'CHR') v -= 1;
    if(v < 0 && k === 'MNY' && S.tags.indexOf('投资亏损') >= 0) v -= 1;
    /* 硬边界兜底：主属性永远落在 [-15, 30]（界面看得见的那七项） */
    S.attr[k] = clamp((S.attr[k] || 0) + v, ATTR_VMIN, ATTR_VMAX);
    if(!silent) S.yearAttr[k] = (S.yearAttr[k] || 0) + 1;
    out.push(k + (v > 0 ? '+' : '') + (Math.round(v * 10) / 10));
  });
  return out;
}
function addTag(t){
  if(!t) return '';
  if(S.tags.indexOf(t) >= 0) return '';
  S.tags.push(t);
  /* 标签变了就顺手刷新推进页属性条：避免调用方忘了刷新导致界面与数据不一致 */
  try{ renderPlayHead(); }catch(e){}
  return '【' + t + '】';
}
function delTag(t){
  const i = S.tags.indexOf(t);
  if(i < 0) return '';
  S.tags.splice(i, 1);
  try{ renderPlayHead(); }catch(e){}
  return '摆脱【' + t + '】';
}

/* ========== 日志 ========== */
/* ===== 文案净化：日志一律「纯文本入库存档，HTML 只在渲染时拼」 =====
   以前是把展示用的徽章 HTML 直接拼进 text 存进存档，
   一旦文案里带尖括号（AI 最爱干这事），读档重放 / 导出就会冒出奇怪内容。 */
function stripTags(s){
  return String(s == null ? '' : s).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}
/* 兼容旧存档：老数据把「· 本地 / · AI」徽章混在正文里，拆出来交给 src 字段 */
function cleanLogText(t){
  const s = stripTags(t);
  const m = /^([\s\S]*?)\s*·\s*(本地|AI)\s*$/.exec(s);
  if(m) return {text: m[1], src: m[2]};
  return {text: s, src: ''};
}
/* 年份卡机制已废弃：需求改为「一年里的事同样一条一条出」，不再把同一年
   归拢进可折叠的卡。保留这个空实现，只为兼容历史上的「清日志」调用点。 */
function clearYearCards(){}
/* 记一条事：进 S.logs（存档/结算用），并作为独立的一行追加进日志流。
   一年里发生多件事，就是多行按发生顺序各自出现 —— 不归拢、不折叠。 */
let lastYShown = -1;
/* 只记账、不渲染：抉择结果留在原框里显示，但仍要进 S.logs 供回看 / 结算 / 导出。 */
function logOnly(age, text, kind, delta){
  const c = cleanLogText(text);
  const who = (c.src === 'AI') ? 'AI' : '';
  S.logs.push({age: age, text: c.text, kind: kind, delta: delta || '', src: who});
  if(S.logs.length > LOG_KEEP) S.logs.shift();
}
function pushLog(age, text, kind, delta, src){
  const c = cleanLogText(text);
  /* 需求变更：本地来源不再作为徽章出现在日志里（只保留 AI）。
     c.src 仍会从旧存档的「· 本地」拆出来，但只用于记录，不渲染。 */
  const who = (src === 'AI' || c.src === 'AI') ? 'AI' : '';
  S.logs.push({age, text: c.text, kind, delta, src: who});
  if(S.logs.length > LOG_KEEP) S.logs.shift();
  const li = document.createElement('li');
  li.className = 'li' + (kind ? ' ' + kind : '') + ' enter';
  /* 需求：同一年里只有第一件事标年份，后面的直接写事件文字。 */
  const yr = Math.round(age);
  const showY = (yr !== lastYShown);
  lastYShown = yr;
  li.innerHTML = (showY ? '<span class="y">' + yr + '岁</span>' : '') + esc(c.text) +
    (who ? '<span class="d">· ' + esc(who) + '</span>' : '') + deltaHTML(delta);
  /* 一条事 ＝ 日志流里独立的一行。拿不到 #log 时静默跳过，绝不让日志抛错。 */
  const lg = $('#log');
  if(lg) lg.appendChild(li);
  scrollLogToEnd();
}
/* 新增日志后把滚动条拉到最底。等一帧再滚：新节点刚插入时浏览器可能还没算完高度，
   立刻设 scrollTop 往往滚不到位，表现就是「视角不跟着新日志走」。 */
function scrollLogToEnd(){
  const pg = $('#playPage');
  if(!pg) return;
  pg.scrollTop = pg.scrollHeight;
  try{
    if(window && typeof window.requestAnimationFrame === 'function'){
      window.requestAnimationFrame(() => { pg.scrollTop = pg.scrollHeight; });
    }
  }catch(e){}
}
function setStatus(t){ $('#plStatus').textContent = t; }

/* ========== AI 调用 ========== */
function stripThink(s){
  if(s == null) return '';
  return String(s)
    .replace(/<(think|thinking|reasoning|analysis)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<(think|thinking|reasoning|analysis)\b[^>]*>[\s\S]*$/gi, '')
    .trim();
}
/* 单次请求。thinking:{type:'disabled'} 关闭推理链 ——
   实测（deepseek-v4.1-flash）：不关时模型先写 2000-5400 字推理链，
   把 max_tokens 吃光后 content 返回空串、finish_reason=length，
   事件生成必然报「格式错误」，表现出来就是「AI 暂不可用，已用本地事件兜底」。
   关掉后 12/12 成功、快 2.4 倍、省 81% token（242 vs 1264）。 */
async function callAIOnce(p, messages, maxTokens, contentOnly, useNoThink){
  const url = endpointOf(p.base, '/chat/completions');
  const body = {model:p.model, messages, temperature:1.0, max_tokens:maxTokens || 900};
  if(useNoThink) body.thinking = {type:'disabled'};
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 40000);
  try{
    const r = await fetch(url, {
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer ' + p.key},
      body: JSON.stringify(body),
      signal: ctl.signal
    });
    if(!r.ok){
      let d = ''; try{ d = (await r.text()).slice(0, 180); }catch(e){}
      throw new Error('HTTP ' + r.status + (d ? ' ' + d : ''));
    }
    const ct = String(r.headers.get('content-type') || '').toLowerCase();
    const raw = await r.text();
    if(ct.indexOf('json') < 0){
      /* 以前这里直接 r.json() 会抛「Unexpected token <」，看不出病根 */
      throw new Error('端点返回网页而非接口数据（地址可能少了 /v1）');
    }
    let d = null;
    try{ d = JSON.parse(raw); }
    catch(e){ throw new Error('返回的不是合法 JSON'); }
    const ch = (d.choices && d.choices[0]) || {};
    const m = ch.message || {};
    let out = (typeof m.content === 'string') ? m.content : '';
    if(!out && !contentOnly && typeof m.reasoning_content === 'string') out = m.reasoning_content;
    if(!out && ch.finish_reason === 'length') throw new Error('模型输出被长度截断');
    return stripThink(out);
  } finally { clearTimeout(timer); }
}
async function callAI(messages, maxTokens, contentOnly){
  const c = getCfg(), p = curProf(c);
  const tk = maxTokens || 900;
  let firstErr = null;
  /* 全局并发闸门放在这里（而不是只放在 runTasks）：整局预生成 / 队列补货 / 生成人生大纲 /
     墓志铭 / 悬浮窗问答 / 死亡总结 全都要先抢槽位，任意时刻真正在飞的请求数
     硬性 ≤ AI_CONCURRENCY，各路径不会互相叠加把接口打爆。 */
  await takeSlot();
  try{
    try{
      return await callAIOnce(p, messages, tk, contentOnly, true);
    }catch(e1){
      firstErr = e1;
      const msg = String((e1 && e1.message) || '');
      /* 兼容性兜底：个别供应商不认 thinking 参数会直接 400，去掉它再试一次 */
      if(/^HTTP 4\d\d/.test(msg) && /thinking|reasoning|invalid|unknown|param/i.test(msg)){
        try{ return await callAIOnce(p, messages, tk, contentOnly, false); }
        catch(e2){ firstErr = e2; }
      }
      /* 其它失败（超时 / 被截断 / 空返回）：放大预算重试一次 */
      try{ return await callAIOnce(p, messages, Math.min(tk * 2, 4000), contentOnly, false); }
      catch(e3){ throw (e3 || firstErr); }
    }
  } finally { freeSlot(); }
}
function extractJSON(s){
  if(!s) return null;
  s = String(s).replace(/```json/gi, '').replace(/```/g, '').trim();
  /* 依次尝试 [ ] 与 { }。事件生成本该是数组，所以数组候选优先 ——
     旧版按「先出现的括弧」定序，遇到模型先写一段带花括号的解释就会取错。 */
  const tryAt = (st, open, close) => {
    let dep = 0;
    for(let k = st; k < s.length; k++){
      if(s[k] === open) dep++;
      else if(s[k] === close){
        dep--;
        if(!dep){ try{ return JSON.parse(s.slice(st, k + 1)); }catch(e){ return null; } }
      }
    }
    return null;
  };
  const cands = [];
  for(let k = 0; k < s.length && cands.length < 40; k++){
    if(s[k] === '[') cands.push([k, '[', ']']);
    else if(s[k] === '{') cands.push([k, '{', '}']);
  }
  cands.sort((a, b) => (a[1] === '[' ? 0 : 1) - (b[1] === '[' ? 0 : 1));
  for(let i = 0; i < cands.length; i++){
    const v = tryAt(cands[i][0], cands[i][1], cands[i][2]);
    if(v && (Array.isArray(v) ? v.length : Object.keys(v).length)) return v;
  }
  return null;
}

/* ========== 预加载事件队列 ========== */
let queue = [], prefetching = false, aiFails = 0;
let aiSeen = {};          // AI 事件文案去重
let aiLastFrom = -1;      // 上一次预取覆盖到的年份，避免重复请求同一区间
const QUEUE_TARGET = 12;

/* ===== 并发预取（需求：AI 得多线程地跑，不必单线程问） =====
   JS 没有真线程，这里用「同时挂多个在途请求」实现并发效果（当前 5 路）。
   注意：并发会打乱单游标 aiLastFrom 的语义，所以「谁负责哪几年」
   在发请求前就由 planTasks 切好用区间认领，回来的结果按区间校验。 */
const AI_CONCURRENCY = 5;      // 同时在飞的 AI 请求数
const FILL_RATIO = 0.8;        // 整局预加载到 80% 就放行进游戏，余量后台继续补
let inflight = 0;              // 当前在途请求数（状态行展示用）
/* 全局并发闸门（重要）：整局预生成 bootPrepare() 与常规补货 prefetch() 会同时跑，
   若各自都起 5 路工人，实际在途会叠到 10 路，把接口打爆、也违背「并发 5」的约定。
   所以两条路径共用同一组槽位，任意时刻在途数恒 ≤ AI_CONCURRENCY。 */
let aiSlots = AI_CONCURRENCY;  // 剩余可用槽位
const slotWait = [];           // 没抢到槽位的调用在此排队等唤醒
function takeSlot(){
  if(aiSlots > 0){ aiSlots--; inflight++; return Promise.resolve(); }
  return new Promise(res => { slotWait.push(res); });
}
function freeSlot(){
  const n = slotWait.shift();
  if(n) n();                                   // 有人排队：槽位直接转交（inflight 不变）
  else if(aiSlots < AI_CONCURRENCY){ aiSlots++; if(inflight > 0) inflight--; }
}
let preTotal = 0, preDone = 0; // 整局预加载：总段数 / 已完成段数（只统计 bootPrepare 派发的整局任务）
let preTarget = 0;             // 整局预加载目标年份（本局寿命上限）
let preHi = 0;                 // 已被预加载认领到的年份（bootPrepare 与 prefetch 共用，防重复请求）
/* 需求 6：AI 年度事件的字数上限。文案目标是「一行多一点」，所以要求 22-38 字；
   入库时再硬截断到 48 字兜底（留出余量，不把模型卡得太死）。 */
const AI_TXT_MIN = 22, AI_TXT_MAX = 38, AI_TXT_HARD = 48;
/* 需求 4：整局预加载的硬上限。到点就强制放行，绝不把玩家卡在读条里。 */
const PRELOAD_MAX_MS = 30000;
/* 【预加载量放大（随需求 10「每年多事件」同步放大）】
   以前一年一件事，一年一次请求就够；现在机遇值档位下一年 2~5 件，
   AI 那部分必须跟着按「每年 E 条」生成，否则一年只写一条、同年后半段
   全被本地事件顶上，AI 占比撑不住（T 高时尤其明显）。
   算法：算 1 到 min(寿命, PRELOAD_TARGET_YEARS) 年的「预期事件总数」，
   其中 EXPECT_AI_RATIO 交给 AI（比例跟着设置里的 AI 占比滑条走），
   再折成请求分片数（每片负载 = 每片年数 × 每年条数，钳在合理区间）。 */
const PRELOAD_TARGET_YEARS = 100;  // 整局预加载覆盖到第几年（寿命基线 100，先铺到 100 岁）
const PER_REQ_LOAD_LO = 8;         // 单次请求最少覆盖的「事件条数」负载
const PER_REQ_LOAD_HI = 24;        // 单次请求最多覆盖的「事件条数」负载（再多模型会漏写、串阶段）
const PER_REQ_YEARS_CAP = 8;       // 单次请求最多覆盖的年数（不跨阶段前提下，模型注意力也撑不住更长）

/* 这一年 AI 打算写几条：机遇值档位下每年事件数的期望 μ 乘 AI 目标占比，
   至少 1 条（只要开 AI 就得有货），最多 6 条（与档位上限对齐）。 */
function targetEvPerYear(){
  const T = (getCfg().ai == null ? 50 : getCfg().ai) / 100;
  return clamp(Math.max(1, Math.round(3 * T)), 1, 6);
}
/* 按「每年条数 × AI 占比」折算整局预加载要分多少片请求 */
function planBootLoad(from, to){
  const to2 = Math.max(from, Math.min(Math.round(to), PRELOAD_TARGET_YEARS));
  const epy = targetEvPerYear();
  const years = Math.max(1, to2 - from + 1);
  const evTotal = years * epy;
  const perReq = clamp(Math.max(1, evTotal / 22), PER_REQ_LOAD_LO, PER_REQ_LOAD_HI);
  const nReq = clamp(Math.ceil(years / PER_REQ_YEARS_CAP), 4, Math.ceil(evTotal / perReq));
  return { nReq: nReq, epy: epy, to: to2 };
}

/* 把 from..to 切成「不跨阶段 + 每片 ≤PER_REQ_YEARS_CAP 年」的请求任务。
   want = 期望的片数（由 planBootLoad 折出）：片数够多时把每片压短，
   让每个请求都短小好写、又能并发铺满；片数不多就按年数上限切。 */
function planTasks(from, to, want){
  const out = [];
  const a0 = Math.max(0, Math.round(from));
  const end = Math.max(a0, Math.round(to));
  const cap = clamp(Math.round(want || 40), 1, 40);
  /* 1) 先划出「不跨阶段」的连续区间（这段不能切碎，否则会串阶段） */
  const zones = [];
  let a = a0;
  while(a <= end){
    const st = stageOf(a);
    const rng = STAGE_RANGE[st] || [0, 3];
    const hi = Math.min(rng[1], end);
    if(hi < a) break;
    zones.push({ stage: st, from: a, n: hi - a + 1 });
    a = hi + 1;
  }
  /* 2) 把期望片数按年数比例分配到各区间，再在区间内均分切开。
        每片年数仍受 PER_REQ_YEARS_CAP 约束：片数不够细时必须按上限对齐，
        否则单片过长，模型注意力越界、容易串阶段。 */
  const totalYears = zones.reduce((s, z) => s + z.n, 0) || 1;
  zones.forEach(z => {
    let k = Math.max(1, Math.round(cap * z.n / totalYears));
    k = Math.max(k, Math.ceil(z.n / PER_REQ_YEARS_CAP));   // 每片不超过年数上限
    const base = Math.floor(z.n / k), rest = z.n % k;
    let f = z.from;
    for(let i = 0; i < k; i++){
      const nn = base + (i < rest ? 1 : 0);
      if(nn <= 0) continue;
      out.push({ stage: z.stage, from: f, n: nn });
      f += nn;
    }
  });
  return out.slice(0, 40);
}

/* 整局预加载还剩多少年没备好（进游戏后的「还差多少」判断用） */
function bootLeftYears(){
  if(!S) return 0;
  const qTail = queue.length ? Math.max.apply(null, queue.map(x => x.age)) : 0;
  const done = Math.max(Math.round(S.age), qTail);
  return Math.max(0, (preTarget || PRELOAD_TARGET_YEARS) - done);
}

/* 【被拒绝的世界线】第一处来源：AI 真写出来了，却被闸门否决 */
/* 深渊值三个计数器只在两处 +1：drop（AI 被闸门否决）、nos（抉择没走的分支）；
   gone 是预留位（历史上留给「整条世界线被丢弃」），当前恒为 0，
   读取时仍保留它是为了兼容带该字段的老存档。 */
function abyssNew(){ return { drop:0, nos:0, gone:0 }; }
/* 深渊值求和：读档/存档/回看一律走这一个口径，别再各写一套加法 */
function abyssSum(ab){
  const a = ab || {};
  return (a.drop || 0) + (a.nos || 0) + (a.gone || 0);
}
function abyssDrop(n){
  if(!S || S.dead) return;
  if(!S.abyss) S.abyss = abyssNew();
  S.abyss.drop += (n || 1);
}
function abyssTotal(){ return abyssSum(S && S.abyss); }
/* 深渊块渲染：结算页与战绩回看共用同一份 DOM 结构，避免两处各改一半 */
function renderAbyss(el, ab, tot){
  if(!el) return;
  const a = ab || {};
  const rank = tot >= 200 ? '深渊凝视者' : tot >= 120 ? '万径交错' :
               tot >= 60 ? '歧路繁多' : tot >= 20 ? '略有分支' : '直线一条';
  el.innerHTML =
    '<div class="abN">' + tot + '</div>' +
    '<div class="abT">条世界线被拒绝，沉入深渊<br>「' + rank + '」</div>' +
    '<div class="abRow"><span>AI 写过但被闸门否决</span><b>' + (a.drop || 0) + '</b></div>' +
    '<div class="abRow"><span>抉择时没走的分支</span><b>' + (a.nos || 0) + '</b></div>';
}

/* 【每年 AI 条目配额（需求 10 连带）】
   机遇值档位决定「这一年能有几件事」，AI 那部分最多占满整个上限带；
   超出配额的同年龄 AI 条目才按「撞车世界线」丢掉。
   配额按年记账，换局时随 aiSeen 一起清空。 */
const aiQuota = {
  used: {},
  cap(age){
    let f = 2;
    try{ f = clamp(Math.round((S && S.fort) || 2), 1, 4); }catch(e){}
    return Math.max(1, FORT_HI[f] || 3);
  },
  ok(age){
    try{ return (this.used[age] || 0) < this.cap(age); }catch(e){ return true; }
  },
  take(age){
    try{ this.used[age] = (this.used[age] || 0) + 1; }catch(e){}
  },
  reset(){ this.used = {}; }
};

/* 把一批 AI 事件收进队列：沿用原三道闸门，被拒的记进深渊 */
function addToQueue(res){
  let add = 0;
  const list = (res && res.arr) || [];
  for(const o of list){
    if(!o || !o.text || !String(o.text).trim()) continue;   // 脏数据，不算「世界线」
    const txt = clipAiText(cleanEvText(o.text));
    if(!txt || txt.length < 4 || looksLikeJSON(txt)){ abyssDrop(); continue; }
    let ag = Math.round(Number(o.age));
    if(!isFinite(ag) || !ag) ag = res.from;
    if(ag < res.lo || ag > res.hi){ abyssDrop(); continue; }
    if(ag <= S.age){ abyssDrop(); continue; }
    if(aiSeen[txt]){ abyssDrop(); continue; }
    if(dupWithLib(txt, stageOf(ag))){ abyssDrop(); continue; }
    /* 【需求 10 连带】以前同一年只收 1 条（多出来的当「撞车世界线」丢掉）。
       现在一年要 2~5 件，改成「按机遇值档位给每年留配额」：
       配额满了才丢，且已被本地/因果事件用掉的年份不占 AI 配额。 */
    if(!aiQuota.ok(ag)){ abyssDrop(); continue; }
    if(queue.some(q => q.t === txt)){ abyssDrop(); continue; }
    aiSeen[txt] = 1;
    /* 需求 27：AI 输出的性别编号一并带进队列（空值交给 evSex 运行时推） */
    queue.push({age:ag, t:txt, e:cleanEff(o.effects), src:'AI', stage:stageOf(ag),
                aff:sanAff(o.aff), sex:sanSex(o.sex)});
    aiQuota.take(ag);
    add++;
  }
  return add;
}

/* 需求 6：AI 文案字数收敛。
   —— 超长：优先在句末标点处收尾（读起来还是完整的一句话），收不到就硬截。
   —— 极短（< 8 字）通常是被截断的残句，直接交给调用方按脏数据丢掉。 */
function clipAiText(t){
  let x = String(t == null ? '' : t).replace(/\s+/g, ' ').trim();
  if(!x) return '';
  if(x.length <= AI_TXT_HARD) return x;
  const head = x.slice(0, AI_TXT_HARD);
  const cut = Math.max(head.lastIndexOf('。'), head.lastIndexOf('，'),
                       head.lastIndexOf('；'), head.lastIndexOf('！'), head.lastIndexOf('？'));
  if(cut >= AI_TXT_MIN) return head.slice(0, cut + 1);
  /* 硬截时预留一个省略号的位置，保证结果不超过 AI_TXT_HARD */
  return head.slice(0, AI_TXT_HARD - 1).replace(/[，、；：,;:]$/, '') + '…';
}
/* 需求 3：属性偏向白名单。AI 可能写错键或写成整句，这里统一收敛成合法键数组。 */
/* patch54：偏向白名单扩到 42 键 = 7 个主属性 + 35 个隐藏子项。
   主键用于「这条讲的是哪一类事」的粗粒度，子键用于细化。
   EQ / WIL / MH 已退役（并入新体系），不再参与判定。
   注：AFF_MAIN / AFF_KEYS 已上移到 00-config.js（那里有 SUBS，且 affJudge 要用）。 */
function sanAff(a){
  if(!a) return [];
  const arr = Array.isArray(a) ? a : String(a).split(/[^A-Za-z]+/);
  const mains = [], subs = [];
  arr.forEach(k => {
    const u = String(k || '').toUpperCase().trim();
    if(AFF_KEYS.indexOf(u) < 0) return;
    if(AFF_MAIN.indexOf(u) >= 0){ if(mains.indexOf(u) < 0) mains.push(u); }
    else if(subs.indexOf(u) < 0) subs.push(u);
  });
  /* 主键优先：给了主键就不再收子键，避免「智力 / 数理逻辑」同框显示两份 */
  if(mains.length) return [mains[0]];
  /* 子键只允许 1 个或 3 个（需求 3）：一条事要么只讲一个侧面，要么讲三个侧面；
     给到 2 个按 1 个算，避免「半沾边」的模糊标注。 */
  if(!subs.length) return [];
  return subs.length >= 3 ? subs.slice(0, 3) : [subs[0]];
}
/* 并发执行器：W 条「工人」同时从任务队列里取活干；换局/S 结束即停手。
   注意：这里只负责起几个工人，真正的在途上限由 callAI() 里的全局槽位把关 ——
   两处都抢槽位会互相等待造成死锁（工人各自先占一个，再等第二个永远等不到）。 */
async function runTasks(tasks, my, onEach){
  const q = tasks.slice();
  if(!q.length) return 0;
  let add = 0;
  const W = Math.min(AI_CONCURRENCY, q.length);
  const one = async () => {
    while(q.length){
      if(my !== undefined && my !== gen) return;
      if(!S || S.dead) return;
      const t = q.shift();
      if(!t) return;
      try{ add += addToQueue(await prefetchStage(t.stage, t.from, t.n)); }
      catch(e){ aiFails++; }
      finally{ if(onEach) onEach(t); }
    }
  };
  const ws = [];
  for(let i = 0; i < W; i++) ws.push(one());
  await Promise.all(ws);
  return add;
}

/* 每个阶段的「生命主线」：用于约束 AI，保证事件像正常人的成长轨迹，
   且不同阶段绝不串插（幼年不可能有房贷，老年不可能有月考）。 */
const STAGE_THEME = {
  '幼年': '婴儿期：吃睡、翻身学步、第一次说话、生病、被大人抱着哄。绝不能出现上学、考试、工作、恋爱、房贷等任何后来的事。',
  '童年': '学龄前后：幼儿园与小学、玩伴、老师、作业与考试、零食玩具、被夸与被罚、家里的小事。不能出现职场、婚恋、买房。',
  '少年': '青春期：初中高中、月考与升学压力、长身体、暗恋与友情、和父母对抗、偷偷喜欢的东西。不能出现买房、抚养孩子。',
  '青年': '成年初期：大学 / 初入职场、租房与通勤、第一份工资、恋爱与结婚、跳槽与被裁、开始健身或熬夜。不能出现退休、孙辈。',
  '中年': '成家立业：升职与裁员、房贷、孩子出生与教育、父母生病住院、体检异常与养生、夫妻磨合。不能出现幼儿园、月考这类少年事。',
  '老年': '晚年：退休、晨练与老友、孙辈来访、老照片与回忆、骨质疏松与住院、老伴与告别。不能出现求职、加班、房贷这类中年事。'
};
/* 每个阶段允许的年份区间，用于校验 AI 生成的年龄是否越界 */
const STAGE_THEME_RANGE = {
  '幼年':[0,3], '童年':[4,12], '少年':[13,18], '青年':[19,30], '中年':[31,60], '老年':[61,200]
};

function stageThemeOf(age){
  return STAGE_THEME[stageOf(age)] || STAGE_THEME['青年'];
}
function ctxBrief(){
  if(!S) return '';
  const a = S.attr;
  return '性别：' + (S.sex || '通用') + '｜年龄' + Math.round(S.age) + '（' + stageOf(S.age) + '）｜时代：' + era.n +
    '｜属性：颜值' + Math.round(a.CHR) + ' 智力' + Math.round(a.INT) + ' 体质' + Math.round(a.STR) +
    ' 家境' + Math.round(a.MNY) + ' 幸运' + Math.round(a.LUK) + ' 快乐' + Math.round(a.SPR || 0) +
    ' 社交' + Math.round(a.SOC || 0) +
    '（细分：共情' + Math.round(subVal('EMPATHY')) + ' 表达' + Math.round(subVal('EXPRESS')) +
    ' 专注' + Math.round(subVal('FOCUS')) + ' 情绪稳定' + Math.round(subVal('MOOD')) + '）' +
    '｜当前阶段主线：' + stageThemeOf(S.age).split('：')[1] +
    '｜标签：' + (S.tags.length ? S.tags.join('、') : '无') +
    '｜天赋：' + S.talents.map(id => talName(id)).join('、');
}
/* 属性画像：把「这一局是个什么样的人」提炼成可读标签。
   既喂给 AI 让它写的事件贴合属性，也供本地事件加权使用 ——
   这是「属性 × 事件连贯」的关键：先算出身，再让他一辈子像他自己。 */
function attrProfile(){
  const BASE = [['CHR','颜值'],['INT','智力'],['STR','体质'],['MNY','家境'],['LUK','幸运'],['SPR','快乐']];
  if(!S) return {key:'INT', dom:'智力', domV:0, traits:[], paths:['普普通通一条路'], traj:'', low:[]};
  const a = S.attr;
  let dom = BASE[0], mx = -1e9;
  BASE.forEach(x => { const v = Number(a[x[0]]) || 0; if(v >= mx){ mx = v; dom = x; } });
  const hi = (k, v) => (Number(a[k]) || 0) >= v;
  const lo = (k, v) => (Number(a[k]) || 0) <= v;
  const tr = [], low = [];
  if(hi('INT', 9)) tr.push('聪慧过人');
  if(hi('STR', 9)) tr.push('体魄强健');
  if(hi('CHR', 9)) tr.push('外形出众');
  if(hi('MNY', 9)) tr.push('家境优渥');
  if(hi('LUK', 9)) tr.push('运气极好');
  const hiS = (k, v) => subVal(k) >= v;
  const loS = (k, v) => subVal(k) <= v;
  if(hiS('EMPATHY', 9)) tr.push('会来事');
  if(hiS('FOCUS', 9)) tr.push('意志坚定');
  if(hiS('LEAD', 9)) tr.push('人脉广');
  if(hiS('MOOD', 12)) tr.push('心理韧性好');
  if(hi('SPR', 70)) tr.push('性情开朗');
  if(lo('MNY', 2)){ tr.push('家境清寒'); low.push('MNY'); }
  if(lo('STR', 3)){ tr.push('身体单薄'); low.push('STR'); }
  if(lo('INT', 3)){ tr.push('读书吃力'); low.push('INT'); }
  if(lo('CHR', 3)){ tr.push('其貌不扬'); low.push('CHR'); }
  if(lo('LUK', 2)){ tr.push('时运不济'); low.push('LUK'); }
  if(loS('FOCUS', 3)){ tr.push('容易半途而废'); low.push('FOCUS'); }
  if(loS('MOOD', 3)){ tr.push('心里脆弱'); low.push('MOOD'); }
  if(lo('SPR', 25)){ tr.push('情绪低落'); low.push('SPR'); }
  if(loS('EXPRESS', 3)){ tr.push('不太会说话'); low.push('EXPRESS'); }
  const paths = [];
  if(hi('INT', 7)) paths.push('学业/技术路线');
  if(hi('STR', 7)) paths.push('体力/竞技路线');
  if(hi('CHR', 7)) paths.push('外形/社交路线');
  if(hi('MNY', 8)) paths.push('家业/商业路线');
  if(hi('SOC', 7)) paths.push('人脉/资源路线');
  if(hi('LUK', 8)) paths.push('靠运气翻盘');
  if(!paths.length) paths.push('普普通通一条路');
  const age = Number(S.age) || 0;
  const traj = age <= 3 ? '襁褓与学步' : age <= 12 ? '上学与玩耍' : age <= 18 ? '青春期求学'
             : age <= 30 ? '立业起步' : age <= 60 ? '事业与家庭' : '晚年';
  return {key:dom[0], dom:dom[1], domV:mx, traits:tr, paths:paths, traj:traj, low:low};
}
/* 本地事件的属性亲和度：让抽到的事件跟这个人的画像贴合。
   规则简单可解释，并做上下限裁剪，避免权重悬殊导致年年同款：
     · 效果命中「主导属性」      → 只会越来越像他
     · 命中「明显短板」          → 好事打折、坏事加权（短板就是容易在这栽跟头）
     · 已经很高的属性再加成      → 边际递减
     · 情绪低落时纯「快乐+」事件 → 降权，免得低谷期还年年欢天喜地 */
function affMul(ev, pr){
  if(!S) return 1;
  const a = S.attr, ef = (ev && ev.e) ? ev.e : {};
  const ks = Object.keys(ef);
  if(!ks.length) return 1;
  pr = pr || attrProfile();
  let m = 1;
  ks.forEach(k => {
    const v = Number(ef[k]) || 0;
    const cur = Number(a[k]);
    if(k === pr.key) m *= 1.7;
    if(isFinite(cur)){
      if(cur <= 3 && v > 0) m *= 0.65;
      if(cur <= 3 && v < 0) m *= 1.5;
      if(cur >= 10 && v > 0) m *= 0.8;
    }
  });
  if(ks.length === 1 && ks[0] === 'SPR' && (Number(ef.SPR) || 0) > 0 && (Number(a.SPR) || 0) <= 20) m *= 0.6;
  return Math.max(0.25, Math.min(3, m));
}
/* 峰值年龄曲线：越靠近 peak 越容易被抽中（三角曲线）。没有 peak 时恒为 1。 */
function peakMul(ev){
  if(!ev || ev.peak == null || !S) return 1;
  const lo = Number(ev.lo), hi = Number(ev.hi);
  if(!isFinite(lo) || !isFinite(hi) || hi <= lo) return 1;
  const pk = clamp(Number(ev.peak), lo, hi);
  const half = Math.max(1, (hi - lo) / 2);
  const d = Math.abs(Math.round(S.age) - pk);
  return clamp(1 - d / (half * 2), 0.1, 1);
}
/* ===== 事件匹配度（需求 5）=====
   一条事件「挑不挑人」看它的属性要求（req，没有 req 就退到 aff）与
   当前角色的个体增量 Δ 差多少：
     · 差值（平均绝对差）最小的那条最容易被触发；
     · 差值打平 → 比方差，方差小说明要求更集中、更「专一」，优先它；
     · 连方差都一样 → 纯随机挑一条。
   返回 null 表示这批候选都没带属性要求，交给原权重池兜底。 */
function evWants(ev){
  const out = {};
  const r = ev && ev.req;
  if(r && typeof r === 'object') Object.keys(r).forEach(k => { if(SUBN[k]) out[k] = Number(r[k]) || 0; });
  if(!Object.keys(out).length && ev && ev.aff && ev.aff.length){
    ev.aff.forEach(k => { if(SUBN[k]) out[k] = 0; });   // 只标了偏向没写需求 → 按平均水平要求
  }
  return out;
}
function evDev(ev){
  const want = evWants(ev);
  const ks = Object.keys(want);
  if(!ks.length) return null;
  let sum = 0, sq = 0;
  for(let i = 0; i < ks.length; i++){
    const d = want[ks[i]] - (Number((S && S.hid ? S.hid[ks[i]] : 0)) || 0);
    sum += Math.abs(d); sq += d * d;
  }
  return { mad: sum / ks.length, dev: sq / ks.length, n: ks.length };
}
const r3 = v => Math.round(v * 1000) / 1000;
/* 贴合度加权随机（而不是「排序取第一名」）。
   老实现按 mad → dev → 随机 三级排序取最优，结果是确定性的：
   同一类属性的角色一辈子反复撞到那几条事件，玩家反馈「根本就没变化」。
   现在按「越贴合权重越大」抽签，最好的那条也未必中，池子整体都会被用到。
   mad（平均偏离）只做权重衰减，不再做硬排序。 */
function pickByFit(pool){
  if(!pool || !pool.length || !S) return null;
  const rows = [];
  for(let i = 0; i < pool.length; i++){
    const d = evDev(pool[i]);
    if(d) rows.push({ it: pool[i], mad: r3(d.mad), r: Math.random() });
  }
  if(!rows.length) return null;
  const w = rows.map(o => 1 / (0.6 + o.mad * 1.7 + o.r * 2.8));
  let sum = 0; w.forEach(v => { sum += v; });
  let roll = Math.random() * sum;
  for(let i = 0; i < rows.length; i++){
    roll -= w[i];
    if(roll <= 0) return rows[i].it;
  }
  return rows[rows.length - 1].it;
}
/* 带属性亲和的加权抽取（原 weightedPick 保留给不关心属性的场合） */
function weightedPickAff(pool){
  const pr = attrProfile();
  /* patch54：抽取权重 = 基础权重 × 属性亲和 × 需求向量匹配度
     × 峰值年龄曲线。三者都是乘数，缺省全部为 1 —— 旧数据行为不变。 */
  const w = pool.map(x => Math.max(0.0001, (x.w || 5) * affMul(x, pr) * reqMul(x) * peakMul(x)));
  let sum = 0; w.forEach(v => { sum += v; });
  let r = Math.random() * sum;
  for(let i = 0; i < pool.length; i++){
    r -= w[i];
    if(r <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}
/* ===== AI 输出净化：兼容各家模型五花八门的返回 ===== */
const EFF_KEYS = ['CHR','INT','STR','MNY','LUK','SPR','EQ','WIL','MH','SOC','AGE'];
/* 把 AI 文案洗成一行纯文本：去掉代码块、HTML、markdown 记号、JSON 残片、换行 */
function cleanEvText(t){
  let s = String(t == null ? '' : t);
  s = s.replace(/```[\s\S]*?```/g, ' ');
  s = s.replace(/<\/?[a-zA-Z][^>]*>/g, ' ');
  s = s.replace(/[*_`#~>|]/g, '');
  /* 模型偶尔吐半截 JSON（"age": 8, text: xxx）。
     这种一旦沾上引号键名就整条判定为残片，别洗出「8, xxx」这种半截垃圾。 */
  if(/(^|[{,]\s*)"?(age|text|effects|src|stage|e)"?\s*[:：]/.test(s)) return '';
  // 字面量转义符（AI 常把换行写成 \n 两个字符）与真换行一起压平
  s = s.replace(/\\[nrt]/g, ' ');
  s = s.replace(/[\r\n\t\u2028\u2029]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  return s.slice(0, 140);
}
/* 文案像不像 JSON 残片：像就直接丢，别让它进日志 */
function looksLikeJSON(s){
  const t = String(s || '').trim();
  if(!t) return true;
  if(/^[\{\[]/.test(t)) return true;
  if(/"[^"]+"\s*:\s*[\{\["0-9]/.test(t)) return true;
  if(/([{,]\s*"(age|text|effects)"\s*:)/.test(t)) return true;
  return false;
}
/* effects 只接受白名单键、限幅 ±4 */
function cleanEff(e){
  const out = {};
  if(!e || typeof e !== 'object' || Array.isArray(e)) return out;
  EFF_KEYS.forEach(k => {
    const v = Number(e[k]);
    if(isFinite(v) && v) out[k] = Math.max(-4, Math.min(4, Math.round(v * 10) / 10));
  });
  return out;
}
/* ===== 需求 C：开局隐秘生成「人生大纲」 =====
   只在后台把这条暗线喂给年度事件生成器以保连贯；
   界面不显示、日志不记、结算不提、导出文件与内容库都不含它。 */
async function buildOutline(g){
  if(!aiReady() || !S || S.outline) return;
  try{
    const raw = await callAI([
      {role:'system', content: WORLD_BOOK + '\n\n【本次任务】你是这台模拟器的幕后编剧。只输出 JSON 对象，不要任何解释、不要代码块标记。'},
      {role:'user', content:
        '为下面这个人生先写一条贯穿始终的暗线大纲，供后续逐年生成事件时保持连贯。\n' +
        '角色起手：' + ctxBrief() + '\n' +
        '这个人的底子：主导属性' + attrProfile().dom + '，特征' +
        (attrProfile().traits.length ? attrProfile().traits.join('、') : '平平无奇') +
        '，可能走向' + attrProfile().paths.join('、') + '。大纲必须顺着这个底子铺，不要另起炉灶。\n' +
        '要求：\n' +
        '1. 只输出 {"outline":"..."}，outline 是一段 120-220 字的纯文本\n' +
        '2. 依次交代：出身与家庭底子 → 性格与执念 → 童年关键印记 → 少年志向 → 青年选择 → 中年境遇 → 晚年归宿\n' +
        '3. 埋 2-3 条前后呼应的伏笔（某个人、某个物件、某次意外），后文要能回收\n' +
        '4. 第三人称陈述，不要分点、不要清单、不要出现具体年份数字\n' +
        '5. 不要写成结局宣告，保留自然起伏' +
    choicePrompt()}
    ], 420);
    if(g !== gen || !S || !raw) return;
    const o = extractJSON(raw);
    const t = (o && typeof o === 'object') ? (o.outline || o.text || '') : '';
    const s = String(t).replace(/```/g, '').replace(/\s+/g, ' ').trim();
    if(s.length >= 30){ S.outline = s.slice(0, 400); saveHist(); }
  }catch(e){ /* 隐秘：失败静默跳过，不影响本地池推进 */ }
}
/* 「要玩家自己选」的指令块：这批事件里至少凑够 MIN_CHOICE_PER_REQ 条分支事件 */
const MIN_CHOICE_PER_REQ = 2;
function choicePrompt(){
  const jk = ['INT','CHR','STR','MNY','LUK','SPR','SOC'];
  return '\n【交互事件】这一批里至少要写 ' + MIN_CHOICE_PER_REQ + ' 条「要玩家自己选」的分支事件，' +
    '它们是这批事件的重点，写的时候多花点心思：' +
    '① 每条给 2-3 个选项（字段 o），三选项的必须凑够三条正好走 ' +
    jk.slice(0, 3).join(' / ') + ' 三条判定线（其余判定键：' + jk.join('/') + '）；' +
    '② 选项之间的差别是「活法不同」，不是对错，别写成「正确答案 + 两个陪跑」；' +
    '③ 有的一方带判定（j:{"a":"INT","v":9}，值 = 主属性加成，判定不过走 no 分支），' +
    '也可以有一项干脆无判定、直接承受结果；' +
    '④ ok / no 都要写结果文案 t 与属性增减 e；t 一句 15-30 字，e 的键只能是主属性；' +
    '⑤ 一个选项可以给标签 tag（字符串数组）或摘掉标签 untag；' +
    '⑥ 分支事件同样要落在本阶段的年龄与场景里，年龄用 age:[起,止]；' +
    '⑦ 分支事件也要写 aff / sex / subs / effects，其中 effects 是该事本身的基准影响。';
}
/* 给 AI 的分支事件样例：从本地池现取，跨版本自更新（改了 e1–e20 样例跟着变） */
function choiceSamples(){
  try{
    return (typeof EVENTS !== 'undefined' ? EVENTS : [])
      .filter(e => e && Array.isArray(e.o) && e.o.length)
      .slice(0, 2)
      .map(e => JSON.stringify({
        text: e.t, stage: '中年', age: e.w || [30, 40],
        aff: [(e.aff && e.aff[0]) || 'SOC'], sex: '通用', effects: {},
        o: e.o.map(o => Object.assign({ k: o.k }, o.j ? { j: o.j } : {},
          { ok: String((o.ok && o.ok.t) || '···').slice(0, 40) }))
      }).replace(/\n/g, ' '));
  }catch(e){ return []; }
}
function choiceDemo(){
  const demo = choiceSamples();
  if(!demo.length) return '';
  return '\n【分支事件格式样例（照这个结构写，内容别照抄）】\n' + demo.join('\n');
}
async function prefetchStage(st, from, n){
  const epy = targetEvPerYear();       // 每年生成几条（随 AI 占比滑条走）
  const sys = WORLD_BOOK + '\n\n' +
    '【本次任务】你是这台模拟器的年度事件生成器。严格只输出 JSON 数组，不要任何解释、不要代码块标记。';
  /* 需求 D：把最近几年已发生的事交给 AI（本地 + 它自己写过的），让它有前情可承接。
     本地池的文案多带 # 前缀（标记已用过），这类不喂给 AI 当范文。 */
  /* 禁写清单瘦身：原来把整个阶段内容库（每阶段 55-81 条、六阶段合计 7616 字）
     全塞进 prompt，既拖慢又挤占输出预算。
     改为「只给最近写过/发生过的 10 条」，与参考实现（只喂最近 5 条）同思路。 */
  const avoid = dbAvoidList(st).slice(-16);
  const localRecent = evRecent.slice(-10).filter(x => x.indexOf('#') !== 0);
  const recent = localRecent.concat(aiRecent).slice(-12);
  /* 需求 E①：把「最近一条」单独拎出来 —— 年序承接必须接住它，不能视而不见 */
  const lastOne = recent.length ? recent[recent.length - 1] : '';
  /* 需求 E③：本阶段文风参照（只学笔法与颗粒度，情节措辞一律不得复用） */
  const stageSample = dbAvoidList(st).slice(0, 3);
  /* 属性 × 事件连贯：把「这是个什么样的人」显式交给 AI。
     不给画像时 AI 只能靠年龄瞎写，事件与属性毫无关联；给了之后
     高智力会自然长出读书/技术线，家境清寒会自然长出拮据的日常。 */
  const pr = attrProfile();
  /* 需求 E②：时间 × 属性互相校准 —— 光给画像还不够，得把「这个岁数该有什么」说死，
     否则 AI 会让 8 岁孩子操心房贷、让 70 岁老人备高考。 */
  const ageNow = Math.round(S && S.age || 0);
  const ageFit =
    ageNow <= 3  ? '还是个婴儿，只能吃睡哭闹、学步学话，一切由大人抱着，没有任何自主行为。' :
    ageNow <= 12 ? '小学生，主线是家庭与学校：同学、老师、作业、玩具、被夸被罚。不能有工作、恋爱、买房、开车。' :
    ageNow <= 18 ? '中学生，主线是升学与青春期：月考、同伴、暗恋、和父母较劲。不能有婚姻、子女、房贷、退休。' :
    ageNow <= 30 ? '青年，主线是求学收尾与初入社会：第一份工作、租房通勤、恋爱成家、跳槽被裁。不能有孙辈、退休。' :
    ageNow <= 60 ? '中年人，主线是事业与家庭双线：升职或裁员、房贷、子女教育、父母老去、体检异常。不能有幼儿园、月考。' :
                   '老年人，主线是退休与告别：晨练、老友、孙辈、慢性病、回忆往事。不能有求职、加班、育儿。';
  const profLine =
    '【这个人的底子】性别：' + (S && S.sex ? S.sex : '通用') +
    '｜年龄：' + ageNow + ' 岁（' + stageOf(ageNow) + '）' +
    '｜主导属性：' + pr.dom + '（' + Math.round(pr.domV) + '）' +
    '｜人生阶段：' + pr.traj +
    '｜特征：' + (pr.traits.length ? pr.traits.join('、') : '平平无奇') +
    '｜可能的人生走向：' + pr.paths.join('、') + '\n' +
    '【岁数校准】' + ageFit + '\n' +
    '事件要能看出这个底子：优势属性要成为他的性格底色与惯常选择，' +
    '短板要成为他反复受挫的地方；不要写出与这些特征相悖的桥段。\n' +
    '属性也要与岁数对得上：智力高在幼年是「学话快、记性好」，在少年是成绩，在中年是专业判断；' +
    '不要把一个 10 岁的孩子写成有社会声望、有存款、有职业身份的人。\n' +
    '性别务必贴合：主角是男就写他当丈夫、当父亲、当家里那个扛事的视角；' +
    '主角是女就写她当妻子、当母亲、怀孕生育、婆媳相处的视角；' +
    '不要给男性角色写怀孕坐月子，也不要给女性角色写「你妻子」这类称呼。\n';
  const user =
    '角色状态：' + ctxBrief() + '\n' +
    profLine +
    (S && S.outline ? '【本局人生大纲（内部参考，不要原样复述给玩家）】' + S.outline + '\n' : '') +
    '请生成他从 ' + from + ' 岁到 ' + (from + n - 1) + ' 岁的 ' + (n * epy) + ' 条年度事件' +
    '（每年 ' + epy + ' 条，共 ' + n + ' 年）。\n' +
    '【本阶段铁律】这批事件的年龄全部落在「' + st + '」（' + STAGE_THEME_RANGE[st][0] + '-' + STAGE_THEME_RANGE[st][1] + ' 岁）。\n' +
    '本阶段只允许出现这类内容：' + STAGE_THEME[st] + '\n' +
    '要求：\n' +
    '1. 每条 ' + AI_TXT_MIN + '-' + AI_TXT_MAX + ' 字（务必短，一行多一点就好），以「你」开头，' +
    '读起来像这个普通人真实度过的一年；' +
    '若给了「本局人生大纲」，事件必须扣着那条线走 —— 呼应已发生的事、为后面的伏笔铺垫，不要另起炉灶\n' +
'2. 每一年要把上面说的条数写满，且同一年的几条要换不同场景（不要一年里连写三件同一类小事）；' +
    '也不要用同一个句式反复写，不要和最近发生过的事雷同\n' +
    '3. 允许平淡、允许没有起伏，不必每年都发生大事；也可以有小事连着小事的年份\n' +
    '4. 如果角色状态里有标签（如【房贷】【社畜】【育有子女】），事件要能呼应它\n' +
    (recent.length ? '5. 最近几年已经发生（按时间从早到晚）：' + recent.join('；') + '。可以承接其结果或余波，但不要再写同款桥段。\n' : '') +
    (lastOne ? '5a. 【年序承接】紧挨着这次要写的年份之前，刚发生过的是：「' + lastOne + '」。' +
       '你写的第一条必须与它构成时间上的先后关系 —— 或是它的直接结果，或是同时段的另一条线，' +
       '绝不能写得像在它之前发生，也不能装作它没发生过。\n' : '') +
    (avoid.length ? '5b. 【严禁重复】下列句子已存在于本阶段内容库中，绝不可写出与之相同或含义相近的内容（换词、换场景表述同样算违规）：' + avoid.join(' ｜ ') + '\n' : '') +
    (stageSample.length ? '5c. 【文风参照】下面是本阶段内容库里的几条，只学它们的笔法与颗粒度' +
       '（一行短句、白描、不煽情、不起文名），情节和措辞一个字都不许复用：' + stageSample.join(' ｜ ') + '\n' : '') +
    '6. 每条事件按这五项写：内容（text）｜年龄段（age）｜一到三个属性偏向（aff）｜性别编号（sex）｜增减数字（effects + subs）。\n' +
    '7. aff：这条事偏向哪些隐藏子项，只给 1 个或 3 个 —— 只说一个侧面给 1 个；' +
    '说到同一维度的三个侧面给 3 个。可选子项：' + SUBS.map(x => x.k + '=' + x.n).join('、') + '。\n' +
    '8. sex：这条事只可能发生在哪个性别身上，只能填「男」「女」「通用」三者之一。' +
    '怀孕 / 坐月子 / 婆婆 / 月经这类只有女性会经历的事填「女」；' +
    '妻子 / 岳父 / 当丈夫这类只有男性会经历的事填「男」；' +
    '其余绝大多数（读书、生病、搬家、工作……任何人都可能遇上）一律填「通用」。拿不准就填「通用」。\n' +
    '9. effects 与 subs：增减数字，主词条写 effects、副词条写 subs，两类都要有。' +
    'effects 的键是主属性：CHR/INT/STR/MNY/LUK/SPR/SOC，范围 -4 到 4；' +
    'subs 的键是隐藏子项（即 aff 里第 2、3 个），范围 -4 到 4。' +
    '文案里没写到的事，不要给它加属性；至少有三成的事件要动到「主导属性」或「短板属性」。\n' +
    '10. 严格格式：[{"age":' + from + ',"text":"...","aff":["INT"],"sex":"通用","effects":{"INT":2},"subs":{"MEMO":1,"LOGIC":1}},' +
    ' 年龄区间一律用数字，不要写「幼年」这种阶段名]' +
    choicePrompt() +
    choiceDemo();
  const raw = await callAI([{role:'system',content:sys},{role:'user',content:user}], clamp(n * epy * 90 + 400, 1200, 4000));
  const arr = extractJSON(raw);
  if(!Array.isArray(arr) || !arr.length) throw new Error('格式错误');
  return {arr, sys:'', from, n, lo:STAGE_THEME_RANGE[st][0], hi:STAGE_THEME_RANGE[st][1]};
}
async function prefetch(n){
  if(prefetching || !aiReady()) return;
  if(!S || S.dead) return;
  // 覆盖区间从「当前年龄 / 队列尾部 / 上次请求终点」三者中取最大
  const qTail = queue.length ? Math.max.apply(null, queue.map(x => x.age)) : 0;
  const from = Math.max(Math.round(S.age) + 1, qTail + 1, aiLastFrom + 1, preHi + 1);
  if(n == null) n = QUEUE_TARGET - queue.length;
  n = Math.min(Math.max(n, 0), 12);
  if(n <= 0) return;
  prefetching = true;
  dbAvoidCache = null;   // 每轮重新读内容库（结算入库后可能有变化）
  try{
    /* 按阶段切片，片内并发跑 —— 这是「不串插」的第一道闸门 */
    const tasks = planTasks(from, from + n - 1);
    /* 注意：这里的段数不计入 preTotal —— preTotal/preDone 是「整局预加载」的进度，
       只有 bootPrepare 派发的整局任务才算。进游戏后 prefetch 补货若也累加分母，
       「预加载 x/y 段」的分母会一直涨、放行比例永远显示不达标（曾经的真实 bug）。 */
    const add = await runTasks(tasks);
    if(!add){
      if(CUR === 'LIFE_PLAYING') setStatus('AI 响应滞后，本轮先用本地事件推进…');
      if(S && !S.dead && aiReady()) setTimeout(() => { prefetch(); }, 1400);
      return;
    }
    const last = tasks[tasks.length - 1];
    aiLastFrom = Math.max(aiLastFrom, last.from + last.n - 1);
    queue.sort((x, y) => x.age - y.age);
    aiFails = 0;
  }catch(err){
    aiFails++;
    const em = String(err && err.message || err || '未知错误');
    logLine('AI', '预取失败 #' + aiFails + '：' + em.slice(0, 120));
    if(CUR === 'LIFE_PLAYING') setStatus('AI 暂不可用，已用本地事件兜底（' + em.slice(0, 40) + '）');
    // 失败退避：连错越多等得越久，最多 8 秒；连错 6 次就先放手，避免把接口打爆
    if(S && !S.dead && aiReady() && aiFails < 6){
      const wait = Math.min(800 * Math.pow(1.6, aiFails - 1), 8000);
      setTimeout(() => { prefetch(); }, wait);
    }
  } finally { prefetching = false; }
}
function popQueue(){
  if(!queue.length) return null;
  queue.sort((x, y) => x.age - y.age);
  if(queue[0].age <= S.age) return queue.shift();
  // 队列里最早的事件还没到年份：如果是同一年的就取，否则等
  return null;
}/* =========================================================
   交互事件（分支事件）纳入内容库 —— v0.1.2
   原本只有硬编码 const EVENTS（e1–e20）会弹出选项，内容库里的事件没有 o 字段，
   于是「AI 写的 / 玩家导入的」事件永远只有一句话、没得选，也进不了数据管理页。
   这里把两套格式统一：凡带 o 数组的事件（无论来自本地池、外部导入还是 AI 加入）
   都是交互事件，共享同一条抽取与结算路径。
   ========================================================= */
/* 选项事件专用闸门：need 里的 tag / not / attr / once，一律按当前状态判 */
function evChoiceOK(e){
  const n = evNormNeed(e);
  if(!n) return true;
  if(n.once && S && S.flags['ev_' + e.id]) return false;
  if(n.tag && (!S || S.tags.indexOf(n.tag) < 0)) return false;
  if(n.not && S && S.tags.indexOf(n.not) >= 0) return false;
  if(n.attr){
    for(const kk in n.attr){
      const v = attrVal(kk);
      const lo = n.attr[kk][0], hi = n.attr[kk][1];
      if(v < lo || v > hi) return false;
    }
  }
  return true;
}
/* need 容错：老数据可能是 {tag:'社畜'} 这种单值写法，也可能是 {tags:['社畜']} */
function evNormNeed(e){
  const raw = (e && e.need) ? e.need : ((e && e.req) ? {attr:SQ2ATTR(e.req)} : null);
  if(!raw || typeof raw !== 'object') return null;
  const n = {};
  const t = raw.tag != null ? raw.tag : (Array.isArray(raw.tags) ? raw.tags[0] : null);
  if(t) n.tag = String(t);
  if(raw.not) n.not = String(raw.not);
  if(raw.once) n.once = 1;
  if(raw.attr && typeof raw.attr === 'object'){
    const a = {};
    for(const k in raw.attr){
      const v = raw.attr[k];
      if(Array.isArray(v) && v.length >= 2) a[k] = [Number(v[0]), Number(v[1])];
      else if(isFinite(Number(v))) a[k] = [Number(v), Number(v)];
    }
    if(Object.keys(a).length) n.attr = a;
  }
  return Object.keys(n).length ? n : null;
}
/* req（"INT+3/MNY-2" 这种偏向串）折成属性区间，供老数据当 need 用 */
function SQ2ATTR(req){
  const out = {};
  String(req || '').split(/[|/,]/).forEach(p => {
    const m = p.match(/^\s*([A-Za-z]{2,6})\s*([+\-])\s*(\d+(?:\.\d+)?)/);
    if(!m) return;
    const k = m[1].toUpperCase(), v = Number(m[3]) * (m[2] === '-' ? -1 : 1);
    if(!SUBN[k]) return;
    out[k] = v > 0 ? [v, 999] : [-999, v];
  });
  return out;
}
/* 把两种来源的分支事件合并（按 id 去重，库里的覆盖硬编码的同 id 条目） */
function choicePool(){
  const out = [], byId = {};
  const push = x => {
    if(!x || !x.id) return;
    if(byId[x.id]){ Object.assign(byId[x.id], x); return; }
    byId[x.id] = x; out.push(x);
  };
  (typeof EVENTS !== 'undefined' ? EVENTS : []).forEach(push);
  try{
    dataOf('ev').forEach(x => {
      if(x && Array.isArray(x.o) && x.o.length) push(Object.assign({}, x));
    });
  }catch(e){}
  return out;
}

/* ===== 分支事件额外标签 ===== */
Object.assign(TAGS, {
  '稳重':  {r:0, d:'危机类判定 +1'},
  '负债':  {r:0, d:'每年家境 -1，心理 -1', y:{MNY:-1, MH:-1}},
  '养生':  {r:1, d:'体质与心理每年小幅回升', y:{STR:1}},
  '康复者':{r:1, d:'心理健康不再低于 5', y:{MH:1}},
  '体制内':{r:1, d:'收入稳定，稀有奇遇概率略降'}
});

let S = null;
let era = ERAS[0];
let running = false, gen = 0, speed = 1;
let WAKE = null;   // 需求 B：可被提前唤醒的等待句柄（点日志区立即推进用）
let aiStat = {n:0, ai:0};   // AI 占比统计窗口（偏差回拉用）

/* ========== 开局 ========== */
function newLife(talentIds, attrPts, diffId){
  const d = DIFFS.find(x => x.id === diffId) || DIFFS[1];
  aiStat = {n:0, ai:0};
  preTotal = 0; preDone = 0; preTarget = 0;
  era = Math.random() < 0.75 ? ERAS[0] : pick(ERAS.slice(1));
  S = {
    ver: GAME_VER, age: 0, dead: false, diff: d.id, era: era.id,
    /* 需求 27：出生性别 50/50，隐藏字段 —— 只用于抽取时过滤专属事件 */
    sex: (Math.random() < 0.5 ? '男' : '女'),
    talents: talentIds.slice(), tags: [], logs: [], flags: {}, used: [],
    /* patch54：隐藏四项中的 EQ / WIL / MH 已退役（并入 35 子项体系）。
       退役项只在加点页内部以 alloc.base（情商 5 / 意志力 5 / 心理健康 10）存在，
       用于点数上限与撤回基准，不进 S.attr；主属性表里只留 SOC 这一项。 */
    attr: {CHR:0,INT:0,STR:0,MNY:0,LUK:0,SPR:0,SOC:0},
    /* 隐藏子项个体增量 Δ：主属性是权威值，子项值 = 主属性 + Δ（界面永不显示） */
    hid: {},
    fort: 2,                 // 机遇值档位（1..4），每年事件数由它决定
    yearN: 0, yearCnt: 0,    // 逐年事件数累计（均值回拉用）
    yearAttr: {},            // 本年内各属性已被加过几次（边际递减用）
    yearEvN: 1,              // 当年事件件数（年度总量缩放的基准，tick 每年开头写入）
    lifespan: LIFE_BASE, revived: false, queue: [], aiMade: [],
    /* 深渊值：被拒绝的世界线（闸门丢弃的 AI 事件 + 抉择时没走的分支） */
    abyss: abyssNew(),
    /* 需求 C：本局人生大纲 —— 只在后台喂给 AI，界面 / 导出 / 内容库都不展示 */
    outline: '' 
  };
  resetEndUI();   // 新的人生：清掉上一局残留的结算卡与按钮条
  /* 抉择态复位：上一局若停在「等玩家点选项」的那一刻（读档 / 重开 / 退出都可能），
     这里不清掉的话新局会被 stepOnce / 点击跳过一直挡着，最长要等 10 秒冷却。 */
  window.__pendingChoice = null;
  talentIds.forEach(id => {
    const t = talById(id);
    /* 修复：AGE 不是属性键，写进 retireAdd 只会空转（既不落主属性也不落子项），
       这里显式跳过 —— 寿命修正统一在下面的 lifeDelta 里结算。 */
    if(t && t.init) Object.keys(t.init).forEach(k => { if(k === 'AGE') return; retireAdd(S.attr, k, t.init[k]); });
  });
  ATTRS.forEach(a => { S.attr[a.k] += (attrPts[a.k] || 0); });
  // 隐藏属性同样应用玩家分配（此前漏掉了，导致加点白费）
  /* 情商 / 意志力 / 心理健康 已退役（并入 7 大类的 35 个子项），
     不再进主属性表 —— 隐藏属性「全部隐藏不显示」，留着只会变成看不见的脏数据。
     老存档里残留的这三个键原样留着（无害），新局不再产生。 */
  if(attrPts.SOC) S.attr.SOC = (S.attr.SOC || 0) + Number(attrPts.SOC);
  Object.keys(era.mod).forEach(k => { retireAdd(S.attr, k, era.mod[k]); });
  /* 已达成成就的属性加成（需求 11：成就可同步附带属性效果） */
  const ab = achBonus();
  Object.keys(ab).forEach(k => { retireAdd(S.attr, k, ab[k]); });
  // 家境锁定类天赋
  talentIds.forEach(id => {
    const t = talById(id);
    if(t && t.forceMNY !== undefined) S.attr.MNY = t.forceMNY;
  });
  /* 寿命修正：天赋 init.AGE（长生 +20 / 短命 -15 / 药罐子 -5）
     与 hook.life（天选之人 -15 / 不死鸟 -10）都算进来 ——
     修复：hook.life 此前无人消费，这两条天赋的寿命惩罚写在了文案里却没生效。 */
  let lifeDelta = 0;
  talentIds.forEach(id => {
    const t = talById(id);
    if(!t) return;
    if(t.init && t.init.AGE) lifeDelta += t.init.AGE;
    if(t.hook && t.hook.life) lifeDelta += t.hook.life;
  });
  /* 需求：点体质会增加寿命 —— 按当前年龄分段（0~100 岁容易，每点 +3 年；
     超过 100 岁困难，每点 +1 年）。加点页都在 0 岁完成，故走容易段。 */
  const strPts = Number(attrPts.STR) || 0;
  if(strPts > 0) lifeDelta += strPts * lifeGainPerStr(S.age);
  S.lifespan = Math.max(30, Math.min(LIFE_CAP, S.lifespan + lifeDelta));
  S.attr.SPR = Math.max(0, S.attr.SPR || 0);   // 快乐不能是负的起手
  /* patch54：出生时给每个子项 ±1 的先天微差。
     否则同一组的 5 个子项永远完全相等，35 项会退化成 7 项，判定与需求全失效。 */
  SUBDEF.forEach(g => {
    g[2].forEach(sb => {
      /* 累加而非覆盖：天赋 init 里的退役键（EQ/WIL/MH）已验证落到对应子项 Δ，
         直接赋值会把那份加成抹掉 */
      S.hid[sb[0]] = (Number(S.hid[sb[0]]) || 0) +
        (Math.random() < 0.5 ? -1 : 1) * (Math.random() < 0.45 ? 1 : 0);
    });
  });
  /* 机遇值：主要由难度档位决定；「幸运」与「时机」明显偏离正常水平时 ±1 档（隐藏，不显示） */
  let f0 = clamp(Number(d.fort) || 2, 1, 4);
  /* 修正幅度收窄：原先阈值 6，而默认开局幸运只有 5（基准 8）→ lukScore = -3 + 微差，
     看起来没事，但任何一次幸运负收益都会把整局档位锁死在最低档，难度设置形同虚设。
     现在要求偏离 12 点才动档，且只在难度档位基础上 ±1。 */
  const lukScore = (Number(S.attr.LUK) || 0) - 8 + (Number(S.hid.TIMING) || 0);
  if(lukScore >= 12) f0 += 1; else if(lukScore <= -12) f0 -= 1;
  S.fort = clamp(f0, 1, 4);
  /* 开局属性基线：结算页要显示「这一生涨了多少」 */
  S.attr0 = Object.assign({}, S.attr);
  queue = [];
  aiFails = 0;
  evStamp = {};         // 本地事件 LRU 时间戳：新一局清空
  evTick = 0;
  evRecent = [];        // 近邻窗口也清空
  aiRecent = [];        // AI 前情窗口同样清空
  aiSeen = {};          // AI 事件去重记录（文案 -> 1）
  aiQuota.reset();      // 每年 AI 条目配额（需求 10 连带）：换局重新记账
  aiLastFrom = -1;      // 预取年份游标：新一局重来
  preHi = 0;            // 整局预加载认领到的年份也要复位，否则新局永远从 0 起补
  running = true; gen++;
  $('#log').innerHTML = ''; clearYearCards(); lastYShown = -1;
  goState('LIFE_PLAYING');
  renderPlayHead();
  pushLog(0, '你是个' + S.sex + '孩，在「' + era.n + '」出生了。天赋：' + talentIds.map(i => '【' + talName(i) + '】').join(''));
  setStatus(aiReady() ? '正在预加载 AI 事件池…' : '本地事件模式（未启用 AI 或未配置）');
  saveHist();
  /* 需求 C：统一由 enterLife() 驱动「读条 → 大纲 → 事件池 → 开局」；
     未启用 AI 时它等价于原来的 sleep(500) → runLoop，不出现读条。 */
  enterLife();
}

/* ========== 主循环 ========== */
async function runLoop(my){
  while(my === gen && S && !S.dead){
    await tick(my);
    if(my !== gen) return;
    if(queue.length <= 3 && aiReady()) prefetch();
    await waitWake(Math.max(60, getCfg().spd / speed));
    if(my !== gen) return;
    if(!running && !S.dead){ setStatus('已暂停'); return; }
  }
}
function toggleRun(){
  if(!S || S.dead) return;
  if(running){ running = false; gen++; setStatus('已暂停'); $('#pbGo').textContent = '继续'; }
  else{
    running = true; gen++; const g = gen;
    refreshStatus(); $('#pbGo').textContent = '暂停';
    runLoop(g);
  }
}
/* 点击 = 步进一年：打断当前等待（若有），立刻跑接下来的一年 */
function stepOnce(){
  if(!S || S.dead || CUR !== 'LIFE_PLAYING') return;
  if(window.__pendingChoice) return;   // 有抉择在等：必须先点，不能靠点击跳过
  gen++; const g = gen;
  const f = WAKE; if(f){ WAKE = null; f(); }   // 打断 waitWake
  runLoop(g);
}
function cycleSpeed(){
  /* 需求 B：加入 0.5 倍速，四档循环 0.5 → 1 → 2 → 4 */
  speed = speed === 0.5 ? 1 : speed === 1 ? 2 : speed === 2 ? 4 : 0.5;
  $('#pbSpd').textContent = speed + 'x';
}

/* ========== 每年 ========== */
function yearTags(){
  const a = S.attr;
  S.tags.forEach(t => {
    const def = TAGS[t];
    if(def && def.y) Object.keys(def.y).forEach(k => { retireAdd(a, k, def.y[k]); });
  });
  if(S.tags.indexOf('抑郁症') >= 0){ retireAdd(a, 'MH', -2); a.CHR -= 1; }
  if(S.tags.indexOf('颈椎病') >= 0) a.STR -= 0.5;
  if(S.tags.indexOf('康复者') >= 0 && retireVal(a, 'MH') < 5){
    S.hid.MOOD = clamp(Math.max(Number(S.hid.MOOD) || 0, 5 - (Number(a.SPR) || 0)), -SUB_DCAP, SUB_DCAP);
  }
  const h = hooks();
  if(h.mhYear) retireAdd(a, 'MH', h.mhYear);
  if(h.crisis && S.age % h.crisis === 0 && S.age > 0){
    const lost = Math.max(2, Math.round(a.MNY * 0.4));
    a.MNY -= lost;
    pushLog(S.age, '【金融危机】你的资产大幅缩水。', 'bad', '家境-' + lost);
  }
  if(h.gamble && S.age % h.gamble === 0 && S.age > 0){
    if(Math.random() < 0.5){ a.MNY -= 5; pushLog(S.age, '【豪赌】你又输了个精光。', 'bad', '家境-5'); }
    else { a.MNY += 6; pushLog(S.age, '【豪赌】你赢了一大笔。', 'good', '家境+6'); }
  }
  if(h.burst && S.age % h.burst === 0 && S.age > 0){
    a.MNY += 8; pushLog(S.age, '【龙王归来】一笔隐秘资产被激活。', 'good', '家境+8');
  }
  if(h.strDrop && S.age >= h.strDrop) a.STR -= 0.3;
  // 隐藏属性联动（退役键一律按其语义落点子项，绝不写回主属性表）
  if(retireVal(a, 'MH') < 3 && S.tags.indexOf('抑郁症') < 0){
    S.tags.push('抑郁症');
    pushLog(S.age, '长期的低落压垮了你，医生写下了诊断。', 'bad', '心理崩塌');
  }
  if(retireVal(a, 'WIL') >= 20 && retireVal(a, 'MH') < 8) retireAdd(a, 'MH', 0.5);
  /* 属性边界统一走全局常量：原来手写 -10/99 与 retireAdd 的 [-15,30] 打架，
     会把已经落到 ATTR_VMIN(-15) 的属性又抬回 -10，量纲三套并存。 */
  Object.keys(a).forEach(k => { a[k] = clamp(a[k], ATTR_VMIN, ATTR_VMAX); });
}

async function tick(my){
  if(my !== gen || !S || S.dead) return;
  /* 需求：年龄是 0~200 的属性 —— 时间推进就 +1，永远不出这个区间。 */
  S.age = clamp(S.age + 1, 0, AGE_MAX);
  yearTags();
  /* 无敌模式：寿命锁到 200 岁 —— 「寿终」与年度意外两条死因都不再成立，
     统一由年龄上限在 200 岁收尾（事件库到 200 岁也就走到头了）。 */
  devKeepAlive();
  /* ===== 死亡判定（需求：每年都有概率死亡，年龄越大概率越大；
     数字越低概率越小，但不代表其他年龄就不会死）=====
     两条并存：
       ① 寿命上限到了 —— 老逻辑保留，作为「必然寿终」的兜底；
       ② 每年按当前年龄的死亡概率掷一次 —— 低龄是小概率意外，高龄陡增。
     命中即返回：死亡理由之后绝不再产生任何事件（tick 在这里就结束了）。 */
  /* 年龄 200 是硬上限：既然已经走到顶，就必须收尾。
     若只靠「年龄 > 寿命」，寿命被锁到 200 后会永远停在 200 空转 —— 
     200 岁之后事件库本就没有内容，空转既无意义也没有观感。 */
  const overLife = S.age > S.lifespan || S.age >= AGE_MAX;
  /* 无敌模式免疫年度意外：它承诺的是「必定活到 200 岁」，
     所以要挡掉的正是这类中途意外，最后统一由上面的 200 岁收尾。 */
  const rolled = !DEV_ON && Math.random() < deathRateOf(S.age);
  if(overLife || rolled){
    if(hookHas('revive') && !S.revived){
      S.revived = true; S.attr.STR += 5; S.attr.LUK -= 3; S.lifespan += 8;
      pushLog(S.age, '【不死鸟】你的心脏重新跳动起来，像什么都没发生过。', 'good', '复活');
      renderPlayHead(); saveHist();
      return;
    }
    return die(my, overLife ? '' : deathWhyOf(S.age));
  }
  renderPlayHead();
  beep(720, 55);

  /* ===== patch54：这一年要发生几件事 =====
     机遇值档位决定总概率带（1-3 / 2-4 / 3-5 / 4-6），单年可摸边、长期贴住均值。
     同年多条事件之间：文本级去重；同一属性的增长按次数边际递减（见 applyEffect）。 */
  hidYearDecay();
  S.yearAttr = {};
  const yearN = yearEventCount();
  S.yearEvN = yearN;                  // 当年件数：yearScale() 用它做年度总量缩放
  const cA = getCfg();
  const T = (cA.ai == null ? 50 : cA.ai) / 100;
  const canAI = aiReady();
  const seen = {};                    // 同年文案去重

  for(let k = 0; k < yearN; k++){
    if(my !== gen || !S || S.dead) return;
    /* 「一条一条出」：同年第 2 条起先等一小段，让上一条先落定，
       看得出这是两件事、而不是一坨同时刷出来。间隔跟播放速度联动
       （快档更短），下限 LOG_GAP_MIN 兜底。 */
    if(k){
      await sleep(Math.max(LOG_GAP_MIN, Math.round(getCfg().spd / speed * 0.5)));
      if(my !== gen || !S || S.dead) return;
    }

    // 1) 优先触发带分支的交互事件（本地内置 + 玩家导入 + AI 加入，同一池子）
    const cand0 = choicePool().filter(e => {
      if(S.used.indexOf(e.id) >= 0) return false;
      const w = Array.isArray(e.w) ? e.w : (Array.isArray(e.age) ? e.age : null);
      if(w && (S.age < w[0] || S.age > w[1])) return false;
      return evChoiceOK(e);
    });
    /* 候选池先浅拷贝一份：后面会就地筛选 / 随机抽取，不能改动 choicePool() 的返回数组。
       取自内容库（导入 / AI 加入）的条目是否入库，由 S.used 与结算时的 aiMade 负责。 */
    const cand = cand0.map(e => e);
    /* AI 占比：债务轮盘 —— 按目标占比 T 逐年攒「AI 配额」，攒够 1 就这一年必须走 AI。
       配额用不掉（AI 没货）就留到下一次，长程比例自然贴近 T，不需要事后纠偏。 */
    if(cand.length && Math.random() < 0.42 * (1 - T)){
      const e = pick(cand);
      S.used.push(e.id);
      S.flags['ev_' + e.id] = 1;
      /* 需求：AI 占比按「所有事件」的总量算 —— 带分支的抉择事件同样计入分母 */
      aiStat.n++;
      /* AI 写的分支事件也要记账，不然结算时收不到「AI 加入」里 */
      if(e.src === 'AI'){
        aiStat.ai++;
        if(!S.aiMade) S.aiMade = [];
        if(S.aiMade.every(z => z.t !== (e.t || e.text))) {
          S.aiMade.push({t: e.t || e.text, age: Math.round(S.age), e: {}, aff: e.aff || [], sex: e.sex || ''});
        }
      }
      await doChoice(e, my);
      if(my !== gen) return;
      saveHist(); renderPlayHead();
      continue;
    }

    // 2) 队列（AI 预生成）零延迟弹出
    /* AI 占比：软控制 + 偏差回拉（需求：按总量算，但别太严格符合）。
       不再用硬性「配额」逼着某一年必须走 AI，而是先看当前实际占比偏没偏：
         · 开局样本太少（不足 5 条）→ 不计偏差，按目标概率自由掷
         · AI 明显偏少（偏差 > 15%）→ 这一年直接呼叫 AI
         · AI 明显偏多（偏差 < -15%）→ 这一年直接走本地
         · 偏差在 ±15% 窗口内 → 维持原来的抢答机制，按目标概率掷一次
       这样长程比例会自然贴近滑条，又不会被硬卡到某一年的内容变突兀。 */
    const drift = aiStat.n >= 5 ? (T - aiStat.ai / aiStat.n) : 0;
    let wantAI;
    if(T >= 1) wantAI = canAI;                    // 目标 100%：能 AI 就 AI
    else if(T <= 0) wantAI = false;               // 目标 0%：全走本地
    else if(drift > 0.15) wantAI = canAI;         // AI 明显偏少：直接补
    else if(drift < -0.15) wantAI = false;        // AI 明显偏多：让给本地
    else wantAI = canAI && Math.random() < T;     // 偏差可控：按目标概率自由掷

    await sleep(60);
    let ev = null;
    if(wantAI) ev = popQueue();
    if(!ev && wantAI && k === 0){
      /* 队列没货：给 AI 最多 5 秒现取，别让这一年空转（同年只在第一条时等） */
      try{ await Promise.race([prefetch(), sleep(5000)]); }catch(e){}
      if(my !== gen) return;
      ev = popQueue();
    }
    if(!ev){
      ev = localEvent();
      if(canAI && T > 0 && !prefetching) prefetch();   // 顺手补货
    }
    if(my !== gen || !S || S.dead) return;

    // 兜底一：队列在途对象可能还是旧的 text 字段，统一收敛到 ev.t
    if(!ev.t && ev.text) ev.t = ev.text;
    // 兜底二：文案净化后若为空，宁可给一句中性描述，也不要「只有属性、没有文字」
    if(!ev.t || !String(ev.t).trim()) ev.t = '这一年没什么特别的事发生。';
    ev.t = String(ev.t);
    /* 同年去重：同一条文案一年里不出现两次，撞了就再取一条本地事件（最多试两次） */
    const nt = normTxt(ev.t) || ev.t;
    if(seen[nt]){
      let alt = null;
      for(let t2 = 0; t2 < 2 && !alt; t2++){
        const c2 = localEvent();
        const n2 = normTxt(c2 && c2.t) || (c2 && c2.t);
        if(c2 && n2 && !seen[n2]) alt = c2;
      }
      if(alt) ev = alt; else continue;
    }
    seen[normTxt(ev.t) || ev.t] = 1;

    aiStat.n++;
    if(ev.src === 'AI'){
      aiStat.ai++;
      aiRecent.push(ev.t);            /* 需求 D：记进 AI 前情窗口 */
      if(aiRecent.length > AI_RECENT_WIN) aiRecent.shift();
      // 需求 7：记下本局 AI 生成的事件，结算时收进「AI 加入」库
      if(!S.aiMade) S.aiMade = [];
      if(S.aiMade.every(z => z.t !== ev.t)) S.aiMade.push({t: ev.t, age: Math.round(S.age), e: ev.e || {}, aff: ev.aff || [], sex: ev.sex || ''});
    }

    /* 事件自带的标签（如房贷 / 社畜 / 名校）：抽到即挂上，与抉择里的标签同一条路径 */
    if(ev.tags && ev.tags.length){
      ev.tags.forEach(t => { const r = addTag(t); if(r) pushLog(S.age, '获得标签 ' + r, 'sys', ''); });
    }
    /* 主属性照旧，隐藏子项静默生效 —— 界面只看到主属性的红绿增减 */
    applySubs(ev.subs);
    const delta = applyEffect(ev.e).join(' ');
    let net = 0; const ef = ev.e || {};
    for(const kk in ef){ if(S.attr && (kk in S.attr)) net += Number(ef[kk]) || 0; }
    const kind = net < 0 ? 'bad' : 'good';
    pushLog(S.age, ev.t, kind, delta, ev.src);
    renderPlayHead();
  }

  if(S.age % 5 === 0) saveHist();
}

/* ========== 分支事件交互 ========== */
/* ========== 分支事件交互：直接内联在日志流里，不弹浮层 ==========
   流程：事件按普通日志格式落进日志 → 选项按钮就排在它下面 → 停住等用户点
        → 点完摘掉选项、把结果按普通日志推入 → 继续推进。 */
function doChoice(e, my){
  return new Promise(resolve => {
    setStatus('等待你的选择…');
    const opts = e.o.filter(o => !o.need || o.need(S));

    // 抉择条目：与普通日志行同款（.li），只是底色稍作区分，并多一组按钮
    const li = document.createElement('li');
    li.className = 'li choiceLi enter';
    li.innerHTML = '<span class="y">' + Math.round(S.age) + '岁</span>' +
      '【' + esc(e.n) + '】' + esc(e.t);

    const box = document.createElement('div');
    box.className = 'co';
    const btns = [];

    /* 倒计时句柄：提前声明，settle 里也用它停表 */
    let cdTid = null, cdTick = null;
    const stopCd = () => {
      if(cdTid){ clearTimeout(cdTid); cdTid = null; }
      if(cdTick){ clearInterval(cdTick); cdTick = null; }
    };
    /* 被拒绝的世界线：这一年起过若干分支，只有一条被走成现实 */
    const skipped = Math.max(0, opts.length - 1);
    const settle = fn => {
      stopCd();
      if(S && !S.dead && skipped){
        if(!S.abyss) S.abyss = abyssNew();
        S.abyss.nos += skipped;
      }
      btns.forEach(b => { b.disabled = true; });
      window.__pendingChoice = null;
      if(my !== gen){ resolve(); return; }
      fn();
      li.classList.add('done');
      saveHist(); renderPlayHead();
      refreshStatus();
      resolve();
    };

    opts.forEach(o => {
      const b = document.createElement('button');
      /* 需求：判定需求不要显示（不再露出「智力判定 9 / 智力 + 加成 ≥ 9」这种数字），
         改成不给数字的模糊说法，玩家凭直觉选，而不是先算一遍数值。 */
      const flavor = o.j ? (o.j.a === 'LUK' ? '看造化' : o.j.a === 'SOC' ? '看人缘'
                        : o.j.a === 'INT' ? '凭本事' : o.j.a === 'STR' ? '看身子骨'
                        : o.j.a === 'MNY' ? '看家底' : '看天意') : '不必冒险';
      b.innerHTML = '<div class="on1">' + esc(o.k) + '</div>' +
        '<div class="on2">' + esc(flavor) + '</div>';
      b.onclick = () => settle(() => {
        let res = o.ok, passed = true;
        if(o.j){
          /* 需求：判定加随机性 —— 原来是「你的值 ≥ 阈值」的纯确定性，
             属性够就必成、不够就必败，几十年下来毫无悬念。
             现在改成概率判定：属性越高成功率越高，但两边都留着余地（5% ~ 95%）。 */
          const v = attrVal(o.j.a) + judgeBonus(o.j.a);
          const need = Number(o.j.v) || 0;
          const pr = clamp(0.5 + (v - need) * 0.07, 0.05, 0.95);
          passed = Math.random() < pr;
          res = passed ? o.ok : (o.no || o.ok);
        }
        /* 需求：抉择结果要留在原来的框里（不再摘掉框、也不再把结果当普通日志甩进流里）。 */
        const lines = [];
        lines.push('<div class="resT">你选了「' + esc(o.k) + '」</div>');
        lines.push('<div class="resB' + (passed ? '' : ' bad') + '">' + esc(res.t) + '</div>');
        const d = applyEffect(res.e).join(' ');
        const dh = deltaHTML(d);
        if(dh) lines.push('<div class="resD">' + dh + '</div>');
        (res.tag || []).forEach(t => { const r = addTag(t); if(r) lines.push('<div class="resD">获得标签 ' + esc(r) + '</div>'); });
        (res.untag || []).forEach(t => { const r = delTag(t); if(r) lines.push('<div class="resD">摆脱标签【' + esc(t) + '】</div>'); });
        /* 存档照记（结果不再作为独立日志行渲染，但仍要进 S.logs 供回看 / 结算 / 导出） */
        logOnly(S.age, '【' + e.n + '】' + o.k + '：' + res.t, 'choice', passed ? '' : '失败');
        box.innerHTML = lines.join('');
      });
      btns.push(b);
      box.appendChild(b);
    });

    if(!opts.length){
      const b = document.createElement('button');
      b.innerHTML = '<div class="on1">继续</div>';
      b.onclick = () => settle(() => {
        box.innerHTML = '<div class="resT">你什么也没做。</div>';
        logOnly(S.age, '【' + e.n + '】你什么也没做。', 'choice', '');
      });
      btns.push(b);
      box.appendChild(b);
    }

    /* 倒计时条：就长在选项框里，不另起浮层 —— 一条细进度 + 剩余秒数 */
    const cdBox = document.createElement('div');
    cdBox.className = 'cdbox';
    const cdBar = document.createElement('i');
    const cdTx = document.createElement('b');
    cdTx.className = 'cdtx';
    cdBox.appendChild(cdBar);
    cdBox.appendChild(cdTx);
    box.appendChild(cdBox);
    li.appendChild(box);
    const log = $('#log');
    if(log) log.appendChild(li);
    // 供测试与自动播放使用
    window.__pendingChoice = { li: li, btns: btns };
    /* 抉择倒计时：超时自动执行第 1 个选项（与手点同一条 settle 路径）。
       只显示剩余秒数，判定结果与属性增减仍留在框内，不会因为超时被跳过。 */
    if(btns.length){
      const CD_TOTAL = 10000, t0 = Date.now();
      cdBar.style.width = '100%';
      cdTx.textContent = '10s';
      cdTick = setInterval(() => {
        const left = Math.max(0, CD_TOTAL - (Date.now() - t0));
        cdBar.style.width = (left / CD_TOTAL * 100) + '%';
        cdTx.textContent = Math.ceil(left / 1000) + 's';
      }, 100);
      cdTid = setTimeout(() => {
        stopCd();
        if(window.__pendingChoice && window.__pendingChoice.btns && window.__pendingChoice.btns[0]){
          window.__pendingChoice.btns[0].onclick();
        }
      }, CD_TOTAL);
    }
    scrollLogToEnd();
  });
}

/* ========== 页面渲染 ========== */
/* AI 预存：队列里还没被这场人生用掉的 AI 事件数 + 本局已经用过并记下的数 */
function aiStock(){
  const q = (queue || []).filter(x => x && x.src === 'AI' && !x.used).length;
  const m = (S && Array.isArray(S.aiMade)) ? S.aiMade.length : 0;
  return {q:q, m:m};
}
/* 状态行：把「推进中…」换成真实信息（AI 占比 / AI 预存 / 预加载 / 在途请求） */
function refreshStatus(){
  const el = $('#plStatus'); if(!el || !S) return;
  if(S.dead){ el.textContent = '已结束 · 看完小结点「立即总结这一生」'; return; }
  if(!aiReady()){
    el.textContent = '本地事件模式（未启用 AI 或未配置） · AI 预存 ' + aiStock().q + ' 条';
    return;
  }
  const tot = aiStat.n;
  const pct = tot ? Math.round(aiStat.ai / tot * 100) : 0;
  const T = (getCfg().ai == null ? 50 : getCfg().ai);
  const st = aiStock();
  /* 「AI 预存 N 条」= 已经生成好、还没轮到用的事件数（需求 5） */
  let s = 'AI 占比 ' + aiStat.ai + '/' + tot + ' · ' + pct + '%（目标 ' + T + '%）' +
          ' · AI 预存 ' + st.q + ' 条';
  if(preTotal) s += ' · 预加载 ' + Math.min(preDone, preTotal) + '/' + preTotal + ' 段';
  /* 整局预生成还没铺满时，直接告诉玩家「还差多少年」，比只报段数直观 */
  if(preTotal && preDone < preTotal){
    const ly = bootLeftYears();
    if(ly > 0) s += ' · 还差 ' + ly + ' 年';
  }
  if(inflight > 0) s += ' · 在途 ' + inflight;
  el.textContent = s;
}
function renderPlayHead(){
  if(!S) return;
  $('#plYear').textContent = Math.round(S.age) + ' 岁';
  $('#plStage').textContent = stageOf(S.age) + ' · ' + era.n;
  const tg = $('#plTags'), at = $('#plAttrs');
  tg.innerHTML = S.tags.length ? S.tags.map(t => '<span class="chip">' + esc(t) + '</span>').join('')
    : '<span class="chip">暂无标签</span>';
  /* v0.1.3 G：左七轴雷达图 + 右 4+3 卡片；只显示六维 + 心理健康，不再显示「社交」；
     染色按正负零三态（>0 绿 / <0 红 / =0 灰），替换原来的绝对阈值规则。
     数值保留一位小数，避免 Math.round 把 0.5 的成长抹平。 */
  /* 需求：把右下的 4+3 卡片与左七轴雷达图的第七项，从「心理」改成真正在用的「社交」。
     原第七项用的是已退役的 MH（心理健康），它早被拆进「情绪稳定度 / 自愈力 / 亲密确信」，
     主属性表里没有这个键 —— 那张卡永远显示 0，雷达图第七根轴也是死的。
     SOC（社交）是现行七大类之一，此前完全不显示。 */
  const P7 = ATTRS.concat([{ k:'SOC', n:'社交', d:'共情 / 表达 / 信任 / 边界 / 号召' }]);
  const valOf = a => Math.round((Number(S.attr[a.k]) || 0) * 10) / 10;
  const ptOf = (i, v) => {
    const R = 40, R0 = 3;                      // 半径映射 [-15,30] → [R0,R]
    const vv = Math.max(-15, Math.min(30, v));
    const r = R0 + (vv + 15) / 45 * (R - R0);
    const ang = (-90 + 360 / 7 * i) * Math.PI / 180;
    return [50 + r * Math.cos(ang), 50 + r * Math.sin(ang)];
  };
  const spokes = [], poly = [], dots = [];
  for(let i = 0; i < 7; i++){
    const m = ptOf(i, 30), z = ptOf(i, -15);
    spokes.push('<line x1="' + m[0].toFixed(1) + '" y1="' + m[1].toFixed(1) +
      '" x2="' + z[0].toFixed(1) + '" y2="' + z[1].toFixed(1) + '" class="plG"/>');
    const p = ptOf(i, valOf(P7[i]));
    poly.push(p[0].toFixed(1) + ',' + p[1].toFixed(1));
    dots.push('<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="1.5" class="plD"/>');
  }
  at.innerHTML =
    '<svg class="plRing" viewBox="0 0 100 100" aria-hidden="true">' +
      '<circle cx="50" cy="50" r="40" class="plG"/>' + spokes.join('') +
      '<polygon points="' + poly.join(' ') + '" class="plS"/>' + dots.join('') +
    '</svg>' +
    '<div class="plGrid">' + P7.map(a => {
      const v = valOf(a);
      const cls = v > 0 ? ' up' : (v < 0 ? ' dn' : '');
      return '<div class="pcard' + cls + '" title="' + esc(a.d || a.n) + '">' +
        '<span class="plk">' + a.n + '</span><span class="plv">' + v + '</span></div>';
    }).join('') + '</div>';
  refreshStatus();
}
function renderTalents(){
  const d = $('#talPool'); d.innerHTML = '';
  (alloc.poolIds || []).forEach(id => {
    const t = talById(id);
    const on = (alloc.picked || []).indexOf(id) >= 0;
    const el = document.createElement('div');
    el.className = 'tal' + (on ? ' sel' : '');
    el.innerHTML = '<div class="nm"><span class="rare r' + t.r + '">' + RARE[t.r] + '</span>' + esc(t.n) + '</div>' +
      '<div class="ds">优点：' + esc(t.good) + '<br>缺点：' + esc(t.bad) + '</div>';
    el.onclick = () => toggleTalent(id);
    d.appendChild(el);
  });
  const n = (alloc.picked || []).length;
  $('#talSub').textContent = '已选 ' + n + ' / 3';
  $('#talRemain').textContent = n >= 3 ? '天赋已选满，可以继续' : '还需选择 ' + (3 - n) + ' 个天赋';
  $('#talNext').disabled = n !== 3;
}
function toggleTalent(id){
  alloc.picked = alloc.picked || [];
  const i = alloc.picked.indexOf(id);
  if(i >= 0) alloc.picked.splice(i, 1);
  else if(alloc.picked.length < 3) alloc.picked.push(id);
  else { toast('最多选 3 个天赋'); return; }
  renderTalents();
}
function renderDiff(){
  const row = $('#diffRow'); row.innerHTML = '';
  const un = unlockedDiff();
  DIFFS.forEach(d => {
    const lock = d.need > un;
    const el = document.createElement('div');
    el.className = 'diff' + (alloc.diff === d.id ? ' on' : '') + (lock ? ' lock' : '');
    el.innerHTML = '<b>' + d.n + '</b><small>' + d.pts + ' 点 · 单属性上限 ' + d.cap + '</small>' +
      '<small>' + (lock ? '需通关 ' + d.need + ' 次解锁' : '稀有奇遇 ×' + d.rare) + '</small>';
    el.onclick = () => { if(lock){ toast('通关 ' + d.need + ' 次后可解锁'); return; } setDiff(d.id); };
    row.appendChild(el);
  });
  const cur = DIFFS.find(x => x.id === alloc.diff);
  $('#atSub').textContent = cur.n + ' · ' + (DEV_ON ? '∞' : cur.pts) + ' 点';
  $('#diffNote').textContent = cur.d + '；单属性上限 ' + cur.cap + '。点数越少，稀有奇遇概率越高。';
}
function setDiff(id){
  alloc.diff = id;
  const d = DIFFS.find(x => x.id === id);
  alloc.pts = {};
  ATTRS.concat(HIDDEN).forEach(a => alloc.pts[a.k] = 0);
  alloc.base = {EQ:5, WIL:5, MH:10};
  Object.keys(alloc.base).forEach(k => alloc.pts[k] = alloc.base[k]);
  // 基础值（情商 5 / 意志力 5 / 心理健康 10）属于「出生赠送」，不占用点数池，
  // 否则地狱档 26 点先被扣掉 20 点，玩家几乎无点可加。
  alloc.spent = 0;
  alloc.pool = d.pts;
  alloc.hist = [];
  renderDiff(); renderAttr();
}
function renderAttr(){
  stopStep();   // 重渲染前先掐掉连加循环，避免旧定时器变成孤儿
  const cur = DIFFS.find(x => x.id === alloc.diff);
  const rows = $('#atRows'); rows.innerHTML = '';
  if(alloc.pool < 0) alloc.pool = 0;
  /* 加点页只列「基础六维」。隐藏四项（情商 / 意志力 / 心理健康 / 社会影响力）
     是玩起来之后才长出来的属性，开局分配不出现 —— 但它们仍照常参加
     setDiff / newLife 的初始化，只是不给玩家在这里加点。 */
  /* 加点上限也收进主属性硬边界（[-15, 30]）。d3 档原本 cap=36 高出边界，
     这里统一取 min，避免「买得到 36 点、跑起来被钳回 30」的割裂感。 */
  const capEff = Math.min(cur.cap, ATTR_VMAX);
  ATTRS.forEach(a => {
    const v = alloc.pts[a.k] || 0;
    const nxt = costOf(v);
    const can = (DEV_ON || alloc.pool >= nxt) && v < capEff;
    const nextP = passAt(a.k).find(p => p.at > v);
    const el = document.createElement('div');
    el.className = 'arow';
    el.innerHTML =
      '<span class="an">' + a.n + '</span>' +
      '<span class="av"><b>' + v + '</b>/' + capEff + '</span>' +
      '<span class="abar"><i style="width:' + Math.min(100, v / capEff * 100) + '%"></i></span>' +
      '<span class="ac">' + (v >= capEff ? '满' : '-' + nxt) + '</span>' +
      '<button class="astep minus" data-k="' + a.k + '">−</button>' +
      '<button class="astep' + (can ? '' : ' off') + '" data-k="' + a.k + '">＋</button>';
    el.title = nextP ? ('下一个被动：' + nextP.n + '（' + nextP.at + '）') : '';
    rows.appendChild(el);
  });
  $('#atPool').textContent = DEV_ON ? '∞' : alloc.pool;
  /* 需求：点体质会增加寿命 —— 这里实时显示「这点下去大概能活多久」。
     加点页恒在 0 岁完成，所以按容易段（每点 +3 年）计。 */
  const lifeEl = $('#atLife');
  if(lifeEl){
    const gain = lifeGainPerStr(0);
    const total = LIFE_BASE + (Number(alloc.pts.STR) || 0) * gain;
    lifeEl.innerHTML = '预计寿命 <b>' + total + '</b> 岁 · 体质每点 +' + gain + ' 年';
  }
  $('#btnUndo').classList[((alloc.hist || []).length ? 'remove' : 'add')]('ghostdis');
  // 被动
  const ps = $('#atPass');
  const psAll = [];
  ATTRS.forEach(a => {
    passAt(a.k).forEach(p => psAll.push({p, on:(alloc.pts[a.k] || 0) >= p.at, k:a.k}));
  });
  ps.innerHTML = psAll.map(x => '<span class="pchip' + (x.on ? '' : ' off') + '">' +
    x.p.n + (x.on ? ' · 已激活' : '（' + an(x.p.k) + x.p.at + '）') + '</span>').join('');
  // 绑定加号（支持长按连加）/ 减号（支持长按连退）
  rows.querySelectorAll('.astep:not(.minus)').forEach(btn => bindStep(btn, btn.dataset.k));
  rows.querySelectorAll('.astep.minus').forEach(btn => bindUndo(btn, btn.dataset.k));
}
/* 加一点。返回 true = 真加上了；false = 到顶 / 点数不够（连加循环据此停手）。
   提示交给调用方（单击失败时 toastAddFail，连加失败时静默停）。 */
function addPoint(k){
  const cur = DIFFS.find(x => x.id === alloc.diff);
  const v = alloc.pts[k] || 0;
  if(v >= Math.min(cur.cap, ATTR_VMAX)) return false;
  const c = costOf(v);
  /* 无敌模式：不扣点数池，随便加 */
  if(!DEV_ON && alloc.pool < c) return false;
  if(!DEV_ON) alloc.pool -= c;
  alloc.pts[k] = v + 1;
  alloc.hist = alloc.hist || []; alloc.hist.push({k:k, c:c});
  renderAttr();
  const np = passAt(k).find(p => p.at === v + 1);
  if(np) toast('解锁被动：' + np.n + ' —— ' + np.d);
  return true;
}
/* 撤销上一次加点（长按「−」连退）。返回 true = 真退了；false = 没得退。 */
function undoPoint(k){
  const h = alloc.hist || [];
  if(!h.length){ toast('没有可撤销的加点'); return false; }
  let i = -1;
  if(k !== undefined){
    for(let j = h.length - 1; j >= 0; j--){ if(h[j].k === k){ i = j; break; } }
    if(i < 0){ toast(an(k) + ' 还没有加过点'); return false; }
  }else i = h.length - 1;
  const step = h.splice(i, 1)[0];
  const base = (alloc.base || {})[step.k] || 0;   // 基础值不可退（出生自带）
  alloc.pts[step.k] = Math.max(base, (alloc.pts[step.k] || 0) - 1);
  if(!DEV_ON) alloc.pool = Math.min(DIFFS.find(x => x.id === alloc.diff).pts, alloc.pool + step.c);
  renderAttr();
  return true;
}
/* 单击加点失败时给一次明确提示（连加失败则静默停，免得刷屏） */
function toastAddFail(k){
  const cur = DIFFS.find(x => x.id === alloc.diff);
  const v = alloc.pts[k] || 0;
  const capEff = Math.min(cur.cap, ATTR_VMAX);
  if(v >= capEff) toast(an(k) + '已达上限 ' + capEff);
  else toast('点数不够了（还差 ' + Math.max(1, costOf(v) - alloc.pool) + ' 点）');
}
/* 连加循环的定时器句柄 —— 挂在模块级，而不是绑在按钮闭包里。
   这是「加号停不下来」的根因：以前 handle 存在按钮自己的闭包里，
   renderAttr() 每次都会把 #atRows 整个 innerHTML 重建，旧按钮连它的闭包一起被丢掉，
   于是那个已经在跑的 setTimeout(rep) 就成了「孤儿」，没人再能清掉它 ——
   它会继续每 110ms 调一次 addPoint，点一直涨、你点减号也追不上。
   现在统一放模块级 + addPoint 返回 false 就停，且每次重渲染前先掐掉。 */
let stepHold = null, stepRep = null;
function stopStep(){
  if(stepHold){ clearTimeout(stepHold); stepHold = null; }
  if(stepRep){ clearTimeout(stepRep); stepRep = null; }
}
/* 加号：单击加 1，长按连加（加不动 / 点数不够 / 到上限会自动停） */
function bindStep(btn, k){
  const start = e => {
    e.preventDefault();
    stopStep();                                   // 防重入：先把上一次的循环掐掉
    if(addPoint(k) === false){ toastAddFail(k); return; }
    stepHold = setTimeout(function rep(){
      stepHold = null;
      if(CUR !== 'ATTR_ALLOC'){ stopStep(); return; }   // 已经不在加点页了
      if(addPoint(k) === false){ stopStep(); return; }  // 到顶 / 点数耗尽 → 立即停
      stepRep = setTimeout(rep, 110);
    }, 420);
  };
  const end = () => stopStep();
  btn.addEventListener('touchstart', start, {passive:false});
  btn.addEventListener('mousedown', start);
  ['touchend','touchcancel','mouseup','mouseleave'].forEach(ev =>
    btn.addEventListener(ev, end));
}
/* 减号：单击退 1 点，长按连续退 */
function bindUndo(btn, k){
  const start = e => {
    e.preventDefault();
    stopStep();
    if(undoPoint(k) === false) return;
    stepHold = setTimeout(function rep(){
      stepHold = null;
      if(CUR !== 'ATTR_ALLOC'){ stopStep(); return; }
      if(undoPoint(k) === false){ stopStep(); return; }
      stepRep = setTimeout(rep, 110);
    }, 420);
  };
  const end = () => stopStep();
  btn.addEventListener('touchstart', start, {passive:false});
  btn.addEventListener('mousedown', start);
  ['touchend','touchcancel','mouseup','mouseleave'].forEach(ev =>
    btn.addEventListener(ev, end));
}
