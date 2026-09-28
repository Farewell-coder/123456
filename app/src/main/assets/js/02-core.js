/* =========================================================
   [02-core.js] 核心引擎层（拆分文件 3/6）
   职责：默认配置 DEF_CFG、数值边界（已上移边界常量到 00-config）、
         寿命体系（LIFE_* / DEV_LIFE）、核心判定 costOf / passAt /
         softAttr 收益衰减等「规则」函数。
   依赖：00-config.js（clamp / clamp 边界常量 / 属性表）
   ========================================================= */
/* ========== 配置 ========== */
const DEF_CFG = {
  on:false, prefetch:true, theme:'auto', vol:0, spd:420, cdt:true, ai:50,
  active:'默认配置', provider:'',
  profiles:{'默认配置':{base:'', model:'', key:''}}
};
function getCfg(){
  let raw = null;
  try{ raw = JSON.parse(lsCompat(SAVE_CFG, 'lr_cfg_') || 'null'); }catch(e){}
  if(!raw) return JSON.parse(JSON.stringify(DEF_CFG));
  if(!raw.profiles){
    raw.profiles = {'默认配置':{base:raw.base||'',model:raw.model||'',key:raw.key||''}};
    raw.active = '默认配置';
  }
  if(!raw.profiles[raw.active]) raw.active = Object.keys(raw.profiles)[0];
  return Object.assign({}, DEF_CFG, raw);
}
/* ========== localStorage 安全封装 ==========
   WebView 在隐私模式 / 存储配额满 / 被系统清理时会直接抛 DOMException，
   原来裸调 localStorage.setItem / removeItem 的地方一抛就中断整个流程
   （典型症状：结算页走到一半白屏、导入存档写不进还弹不出提示）。
   统一走这三个函数：失败只警告一次，绝不向上抛。 */
let __lsWarned = 0;
function lsSet(k, v){
  try{ localStorage.setItem(k, v); return true; }
  catch(e){ if(!__lsWarned++) console.warn('本地存储写入失败（后续不再重复提示）', e); return false; }
}
function lsGet(k){
  try{ return localStorage.getItem(k); }catch(e){ return null; }
}
function lsDel(k){
  try{ localStorage.removeItem(k); return true; }
  catch(e){ if(!__lsWarned++) console.warn('本地存储删除失败（后续不再重复提示）', e); return false; }
}
function setCfg(c){ lsSet(SAVE_CFG, JSON.stringify(c)); }
function curProf(c){
  c = c || getCfg();
  return c.profiles[c.active] || {base:'',model:'',key:''};
}
function aiReady(){
  const c = getCfg(), p = curProf(c);
  return !!(c.on && p.base && p.model);
}
/* ===== 新增：HTML 转义 ===== */
const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&' + 'quot;').replace(/'/g, '&#39;');

/* ===== 新增：自定义滑动开关（替代原生 checkbox） ===== */
const swxEl = id => (typeof id === 'string' ? $('#' + id) : id);
const swxGet = id => !!(swxEl(id) && swxEl(id).classList.contains('on'));
const swxSet = (id, on) => { const e = swxEl(id); if(e) e.classList.toggle('on', !!on); };

/* ===== 自定义下拉：数据填充（把 [{v,n}] 渲染成 dval 标题 + dopt 选项） =====
 * el: .dsel 容器；list: [{v:值, n:显示名}]；value: 当前选中值；cb: 选中回调。
 * 无障碍语义：dval 是 combobox 触发器，dpanel 是 listbox，dopt 是 option；
 *   aria-expanded 由开合逻辑维护，读屏据此播报「已展开/已收起」。
 * 安全：value 与显示文本都经 esc() 转义，防止名称里带引号/尖括号破坏 DOM 或注入。 */
function dselFill(el, list, value, cb){
  if(!el) return;
  const sval = String(value == null ? '' : value);
  el.dataset.v = sval;
  el._cb = cb || el._cb || null;
  const cur = list.filter(x => String(x.v) === sval)[0];
  /* 触发钮：补无障碍角色，展开态由开合逻辑同步 aria-expanded */
  const dv = el.querySelector('.dval');
  if(dv){
    dv.setAttribute('role', 'combobox');
    dv.setAttribute('aria-haspopup', 'listbox');
    dv.setAttribute('tabindex', '0');
    dv.textContent = cur ? cur.n : (list[0] ? list[0].n : '请选择');
  }
  /* 面板：listbox + 唯一关联 id，供触发钮 aria-controls 引用 */
  const dp = el.querySelector('.dpanel');
  if(dp){
    const pid = 'dpanel-' + (el.id || Math.random().toString(36).slice(2, 8));
    dp.id = pid;
    dp.setAttribute('role', 'listbox');
    if(dv) dv.setAttribute('aria-controls', pid);
    dp.innerHTML = list.map((x, i) =>
      '<div class="dopt' + (String(x.v) === sval ? ' sel' : '') + '" data-v="' +
      esc(x.v) + '" role="option" id="' + pid + '-o' + i + '" aria-selected="' +
      (String(x.v) === sval ? 'true' : 'false') + '">' + esc(x.n) + '</div>').join('');
  }
}
/* 选中某项：更新高亮、datastore.v、标题文本，并同步 aria-selected + aria-expanded。
 * v: 选中值；cb: 本次传入的回调（优先级高于 el._cb，用于一次性覆盖）。 */
function dselSet(el, v, cb){
  if(!el) return;
  const sval = String(v);
  const opts = el.querySelectorAll('.dopt');
  let hit = null;
  for(let i = 0; i < opts.length; i++){
    opts[i].classList.remove('sel');
    opts[i].setAttribute('aria-selected', 'false');
    if(opts[i].dataset.v === sval) hit = opts[i];
  }
  el.dataset.v = sval;
  const dv = el.querySelector('.dval');
  if(hit){
    hit.classList.add('sel');
    hit.setAttribute('aria-selected', 'true');
    if(dv) dv.textContent = hit.textContent;
  }
  /* 收起面板并复位触发器展开态（选中即关闭，符合移动端下拉直觉） */
  el.classList.remove('on');
  if(dv) dv.setAttribute('aria-expanded', 'false');
  if(cb) cb(el.dataset.v); else if(el._cb) el._cb(el.dataset.v);
}
function dselVal(el){ return el ? (el.dataset.v == null ? '' : el.dataset.v) : ''; }

/* ===== 新增：设置卡折叠（本地持久化） ===== */
const FOLD_KEY = 'lr_fold';   // 折叠态：跨版本保留
function foldLoad(){
  try{ return JSON.parse(lsCompat(FOLD_KEY, 'lr_fold_') || '{}') || {}; }catch(e){ return {}; }
}
function foldApply(){
  const st = foldLoad();
  /* 设置面板与数据管理页共用同一套折叠态（同一个 lr_fold），卡名不重名即可互不干扰 */
  document.querySelectorAll('#modal .card[data-ck], #dbPage .card[data-ck]').forEach(card => {
    /* 默认一律收起：只有玩家手动展开过（记录为 0）的卡才是展开态 */
    const v = st[card.dataset.ck];
    card.classList.toggle('fold', v === undefined ? true : !!v);
  });
}
function foldToggle(card){
  if(!card) return;
  card.classList.toggle('fold');
  const st = foldLoad();
  st[card.dataset.ck] = card.classList.contains('fold') ? 1 : 0;
  lsSet(FOLD_KEY, JSON.stringify(st));
}
/* 需求变更：本地数据整类不再出现在数据管理页 —— 不是加一个开关，
   而是那个位置只留「导入」与「AI 加入」两类，连本地条目数也不报出来。 */

/* 存档日志保留条数上限。一年里可能发生好几件事，多留一些不会拖慢渲染，
   也能让玩家事后回看整局经历。 */
const LOG_KEEP = 1200;
/* 一年里多件事之间的最小间隔（毫秒）。日志要「一条一条出」，
   太快就糊成一片、看不出逐条出现的感觉。 */
const LOG_GAP_MIN = 90;

/* ===== 新增：日志增减逐项着色 ===== */
function deltaHTML(delta){
  if(!delta) return '';
  const s = String(delta).trim();
  if(!s) return '';
  /* 属性增减文案有两种形态：英文属性键（INT+2 STR-1）与中文名（智力 +2 体质 -1）。
     旧实现先按空格切、再用 ^[A-Za-z]+[+\-][0-9.]+$ 匹配，只认前一种；
     中文名会被切碎、匹配失败，退化成原样文本，于是日志里看不到涨绿跌红。
     这里改成整串扫描：凡能识别成「名字+正负号+数字」的片段才染色，其余原样输出。 */
  const re = /([A-Za-z][A-Za-z0-9_]*|[\u4e00-\u9fa5]{1,6})\s*([+\-])\s*([0-9.]+)/g;
  let out = '', last = 0, m, hit = false, hidden = false;
  while((m = re.exec(s))){
    out += esc(s.slice(last, m.index));
    last = m.index + m[0].length;
    /* 需求：日志里的属性增减只显示非隐藏项。
       隐藏子项（共情力 / 专注力 / 情绪稳定度 ……）与退役的 EQ / WIL / MH 一律吞掉。 */
    const raw = String(m[1]).trim();
    const key = /^[A-Za-z]/.test(raw) ? raw.toUpperCase() : NAME2KEY[raw];
    if(key && !SHOW_ATTR_KEYS[key]){ hidden = true; continue; }
    hit = true;
    const up = m[2] === '+';
    const num = m[3].replace(/\.0+$/, '');
    out += '<i class="' + (up ? 'up' : 'down') + '">' + esc(an(key || raw)) + ' ' + m[2] + num + '</i>';
  }
  if(!hit && hidden) return '';        // 整串都是隐藏属性：干脆不显示
  if(!hit) return '<span class="dl"><i>' + esc(s) + '</i></span>';
  out += esc(s.slice(last));
  return '<span class="dl">' + out + '</span>';
}

function endpointOf(base, path){
  let b = String(base || '').trim().replace(/\/+$/, '');
  b = b.replace(/\/chat\/completions$/i, '').replace(/\/models$/i, '').replace(/\/+$/, '');
  return b + path;
}

/* ========== 图鉴数据 ========== */
function getDex(){
  try{ return JSON.parse(lsCompat(SAVE_DEX, 'lr_dex_') || '{}') || {}; }
  catch(e){ return {}; }
}
function setDex(d){ lsSet(SAVE_DEX, JSON.stringify(d)); }
function learn(talents, tags){
  const d = getDex();
  d.tal = d.tal || []; d.tag = d.tag || []; d.runs = d.runs || 0;
  (talents || []).forEach(x => { if(d.tal.indexOf(x) < 0) d.tal.push(x); });
  (tags || []).forEach(x => { if(d.tag.indexOf(x) < 0) d.tag.push(x); });
  d.best = Math.max(d.best || 0, S ? Math.round(S.age) : 0);
  setDex(d);
}
const unlockedDiff = () => (getDex().runs || 0);

/* ========== 存档 ========== */
/* 跨版本兼容：新版 key 读不到时回退到旧版本 key（存档/图鉴/配置都不丢），
   读到后顺手迁移到新 key，之后就走新 key。 */
function lsCompat(curKey, prefix){
  let v = localStorage.getItem(curKey);
  if(v != null) return v;
  let bestK = null, best = null;
  // 版本号须按数字段比较：字符串比较下 'lr_hist_0.9' > 'lr_hist_0.11' 会选错旧档
  const verOf = k => {
    const m = String(k).match(/(\d+(?:\.\d+)*)/);
    return m ? m[1].split('.').map(x => parseInt(x, 10)) : null;
  };
  const newer = (a, b) => {
    const va = verOf(a), vb = verOf(b);
    if(va && vb){
      for(let i = 0; i < Math.max(va.length, vb.length); i++){
        const x = va[i] || 0, y = vb[i] || 0;
        if(x !== y) return x > y;
      }
    }
    return a > b;
  };
  for(let i = 0; i < localStorage.length; i++){
    const k = localStorage.key(i);
    if(k && k !== curKey && k.indexOf(prefix) === 0){
      if(!bestK || newer(k, bestK)){ bestK = k; best = localStorage.getItem(k); }
    }
  }
  if(best != null){ try{ localStorage.setItem(curKey, best); }catch(e){} }
  return best;
}
const histOf = () => {
  try{ return JSON.parse(lsCompat(SAVE_HIST, 'lr_hist_') || 'null'); }catch(e){ return null; }
};
const saveHist = () => {
  if(!S) return;
  if(!lsSet(SAVE_HIST, JSON.stringify({ver:GAME_VER, at:Date.now(), S})))
    console.warn('saveHist: 存档写入失败（本地存储不可用）');
};

/* ========== 主题 ========== */
let mq = null;
let timerTheme = null;
function sysDark(){
  // 1) 有原生壳：原生是唯一真相，不再用媒体查询兜底
  //    （WebView 的 prefers-color-scheme 在部分 ROM 上不随系统刷新，会把亮色误判成暗色）
  let hasBridge = false;
  try{
    if(window.Android && window.Android.isNight){
      hasBridge = true;
      return !!window.Android.isNight();
    }
  }catch(e){ hasBridge = true; }
  if(hasBridge) return false;
  // 2) 无原生壳（纯浏览器调试）：退回媒体查询
  try{
    if(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) return true;
  }catch(e){}
  return false;
}
/* 把「页面此刻是深还是浅」推给原生悬浮窗（面板配色跟游戏主题一致） */
function pushFloatTheme(){
  try{
    const dark = document.documentElement.getAttribute('data-theme') === 'dark' ? 1 : 0;
    if(window.Android && window.Android.floatTheme) window.Android.floatTheme(dark);
  }catch(e){}
}
function applyTheme(){
  const c = getCfg();
  let t = c.theme;
  if(t === 'auto') t = sysDark() ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', t);
  // 仅在「没有原生桥」时才依赖媒体查询（有桥时以原生为准，避免被陈旧媒体查询带偏）
  if(mq) mq.onchange = null;
  mq = null;
  if(!(window.Android && window.Android.isNight) && window.matchMedia){
    mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.onchange = () => { if(getCfg().theme === 'auto') applyTheme(); };
  }
  // 状态栏图标只跟随「系统」深浅色，绝不跟随页面主题
  // —— 选「黑暗」只是把页面变暗，不改系统、也不改状态栏
  try{ if(window.Android && window.Android.applyNight) window.Android.applyNight(sysDark() ? 1 : 0); }catch(e){}
  // 悬浮窗面板跟游戏主题走：把当前页面是深是浅推给原生（原生按这套配色重画面板）
  pushFloatTheme();
  // 每 3 秒兜底复查一次系统外观（切回前台/系统换主题时能立刻跟上）
  if(timerTheme) clearInterval(timerTheme);
  timerTheme = setInterval(() => {
    if(getCfg().theme !== 'auto'){ clearInterval(timerTheme); timerTheme = null; return; }
    const want = sysDark() ? 'dark' : 'light';
    if(document.documentElement.getAttribute('data-theme') !== want){
      document.documentElement.setAttribute('data-theme', want);
      try{ if(window.Android && window.Android.applyNight) window.Android.applyNight(sysDark() ? 1 : 0); }catch(e){}
    }
  }, 3000);
}
/* 原生侧在系统切换深浅色时会调用它（见 MainActivity.onConfigurationChanged） */
window.__syncTheme = function(){
  if(getCfg().theme === 'auto') applyTheme();
};

/* ========== 音效 ========== */
let actx = null;
/* 播完即释放：AudioContext 常驻会占用音频通道，释放后下次按需重建 */
function releaseActx(ctx){
  try{
    if(ctx && typeof ctx.close === 'function' && ctx.state !== 'closed') ctx.close();
  }catch(e){}
  if(actx === ctx) actx = null;
}
function beep(f, ms){
  const c = getCfg();
  if(!c.vol) return;
  try{
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const ctx = actx;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = f || 660; o.type = 'sine';
    g.gain.value = (c.vol / 100) * 0.05;
    o.connect(g); g.connect(ctx.destination);
    o.start();
    setTimeout(() => { try{ o.stop(); }catch(e){} releaseActx(ctx); }, ms || 70);
  }catch(e){}
}

/* ========== 通用 UI ========== */
function toast(msg){
  const t = $('#toast');
  t.textContent = msg; t.classList.add('on');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('on'), 1800);
}
let dlgOpen = false;
function dialog(title, desc, actions){
  $('#dlgT').textContent = title;
  $('#dlgD').textContent = desc || '';
  const box = $('#dlgA'); box.innerHTML = '';
  actions.forEach((a, i) => {
    const b = document.createElement('button');
    b.textContent = a.t;
    if(a.pri) b.className = 'a1';
    if(a.plain) b.className = 'a3';
    b.onclick = () => { closeDlg(); a.fn && a.fn(); };
    box.appendChild(b);
  });
  $('#dlg').classList.add('on');
  dlgOpen = true;
}
const exitLayer = el => {
  if(!el) return;
  if(!el.classList.contains('on')){ el.classList.remove('out'); return; }
  el.classList.remove('on');
  el.classList.add('out');
  el.onanimationend = e => {
    if(e.animationName === 'ovlOut'){ el.classList.remove('out'); el.onanimationend = null; }
  };
};
const closeDlg = () => { dlgOpen = false; exitLayer($('#dlg')); };

/* 游戏风格输入弹窗：替代原生 prompt()（原生弹窗样式丑、且不跟随主题） */
function askText(title, defVal, ph, onOk){
  const box = $('#dlgI');
  box.innerHTML =
    '<div class="dc">' +
      '<h3>' + esc(title) + '</h3>' +
      '<p class="sub">请输入新的名称</p>' +
      '<input type="text" id="dlgIIn" autocomplete="off" placeholder="' + esc(ph || '') + '">' +
      '<div class="da">' +
        '<button class="a1" id="dlgIOk">确定</button>' +
        '<button class="a3" id="dlgICancel">取消</button>' +
      '</div>' +
    '</div>';
  box.classList.remove('hide');
  const inp = $('#dlgIIn');
  inp.value = defVal == null ? '' : String(defVal);
  setTimeout(() => { try{ inp.focus(); inp.select(); }catch(e){} }, 60);
  const done = v => { box.classList.add('hide'); if(onOk) onOk(v); };
  $('#dlgIOk').onclick = () => done(inp.value);
  $('#dlgICancel').onclick = () => done(null);
  inp.onkeydown = e => { if(e.key === 'Enter'){ e.preventDefault(); done(inp.value); } };
}

/* ========== 状态机 ========== */
let CUR = 'MAIN_MENU';
const SCREENS = {
  MAIN_MENU:'#scMenu', MODE_SELECT:'#scMode', TALENT_SELECTION:'#scTalent', ATTR_ALLOC:'#scAttr',
  LIFE_PLAYING:'#scPlay', GAME_OVER:'#scOver', DEX:'#scDex', REC:'#scRec'
};
function goState(s){
  CUR = s;
  Object.keys(SCREENS).forEach(k => {
    const el = $(SCREENS[k]);
    if(el) el.classList[k === s ? 'add' : 'remove']('on');
  });
  window.scrollTo(0, 0);
  const pg = $(SCREENS[s] + ' .page');
  if(pg) pg.scrollTop = 0;
  if(s === 'MAIN_MENU') refreshMenu();
  if(s === 'DEX') renderDex();
  if(s === 'REC') renderRec();
}

/* ========== 天赋抽取 ==========
   池 = 原有 15 个双刃剑天赋 + 文本数据库的 40 个外貌/出身类天赋。
   数据库天赋只带 init（属性修正），所以给它们补一个「隐性代价」，
   保持「每个天赋都是双刃剑」的设计不变。 */
const DB_TALENT_COST = {
  '天生丽质':'走到哪都被盯着看，是非也多','眉清目秀':'总被人当成好脾气的人使唤',
  '过目不忘':'记得太清楚，连难堪的细节都忘不掉','书虫':'朋友不多，运动也少',
  '铁人':'不太懂得示弱，病了也硬扛','药罐子':'三天两头跑医院，钱都花在药上',
  '富二代':'家里的安排很难拒绝','官二代':'父亲的同事总在饭桌上考你',
  '拆迁户':'钱来得太容易，花得也快','白手起家':'从小就明白没人能帮你',
  '天才':'和同龄人聊不到一块去','神童':'被寄予的期待压得喘不过气',
  '长生':'活得久，就要送走更多人','短命':'你知道自己的时间不多',
  '欧皇':'运气太好，努力反而变成了可有可无','非酋':'做什么都先想最坏的结果',
  '锦鲤':'总有人接近你是为了沾点运气','社恐':'错过不少本来属于你的机会',
  '运动健将':'落下一身旧伤','艺术细胞':'敏感，容易被情绪拖住',
  '音乐天才':'练琴的童年没有周末','数学废物':'一到关键考试就拖后腿',
  '语言天赋':'别人总觉得你会翻译是理所当然','熬夜冠军':'身体在账本上记着每一笔',
  '早睡早起':'和朋友的夜生活永远错开','大胃王':'体检报告上从不缺箭头',
  '铁胃':'什么都敢吃，风险也照着来','选择困难症':'好几次机会在犹豫里溜走',
  '嘴硬':'在意的人被你气走好几个','老实人':'被占便宜了也不太会争',
  '腹黑':'身边的人迟早会发现你看得太透','恋爱脑':'一恋爱，别的都往后排',
  '钢铁直男':'聊天记录常年是尴尬的沉默','二次元宅':'现实里的关系越来越薄',
  '网瘾少年':'视力、体力、成绩一起往下掉','网红体质':'隐私变成了可以被围观的东西',
  '高考移民':'这件事你不能对任何人讲','寒门贵子':'回头时，身后没有人',
  '钝感力':'有些该察觉的信号你也错过了','玻璃心':'别人一句玩笑你要消化很久'
};
/* 把数据库天赋转成内部结构（id 前缀 dbt，避免与原有天赋冲突） */
const TALENT_EXTRA = DB_TALENTS.map((x, i) => {
  const init = {};
  Object.keys(x.e).forEach(k => { init[k] = x.e[k]; });
  const good = Object.keys(x.e).map(k => (k === 'AGE' ? '寿命' : an(k)) +
    (x.e[k] > 0 ? '+' : '') + x.e[k]).join('、');
  return {
    id: 'dbt' + i, n: x.n, r: x.r,
    good: good + (x.good ? '；' + x.good : ''),
    bad: DB_TALENT_COST[x.n] || '代价说不太清楚，总之有',
    init: init, hook: {}, db: true
  };
});
/* 统一全池：原有 15 + 数据库 40 */
const ALL_TALENTS = TALENTS.concat(TALENT_EXTRA);
/* 图鉴去重视图：基础池与扩展池存在同名天赋（天生丽质 / 铁胃 各两条），
   抽卡池保留全部条目（概率口径不变），但图鉴按名字只展示一次，
   否则玩家会看到两条一模一样的图标、分母也虚高。 */
const TAL_IDS_OF_NAME = (() => {
  const m = {};
  ALL_TALENTS.forEach(t => { (m[t.n] = m[t.n] || []).push(t.id); });
  return m;
})();
const TAL_UNIQ = (() => {
  const seen = {}, out = [];
  ALL_TALENTS.forEach(t => { if(seen[t.n]) return; seen[t.n] = 1; out.push(t); });
  return out;
})();
/* 某个天赋（按名字）是否已解锁：同名任一 id 命中即算 */
const talUnlockedIn = (dexArr, t) => (TAL_IDS_OF_NAME[t.n] || [t.id]).some(id => (dexArr || []).indexOf(id) >= 0);
/* 外部（导入 / AI 加入）天赋的归一缓存：id -> 与内置池同构的对象。
   数据管理页存的是 {name, rarity, effects}，抽卡与渲染走的是 {n, r, init}，
   两套字段必须在这里收口，否则「外部天赋永远抽不中，一旦抽中就崩」。 */
const TAL_EXT_CACHE = {};
let talExtWarmed = 0;
/* 外部条目归一：字段名对齐内置池，并补齐 good / bad 文案（渲染层要显示） */
function dbTalentNorm(t){
  const init = t.init || t.effects || {};
  const r = Math.max(0, Math.min(3, Number(t.rarity === undefined ? t.r : t.rarity) || 0));
  const good = t.good || Object.keys(init).map(k => (k === 'AGE' ? '寿命' : an(k)) +
    (Number(init[k]) > 0 ? '+' : '') + init[k]).join('、');
  return {id: t.id, n: t.name || t.n || String(t.id), r: r,
          good: good || '（导入天赋）', bad: t.bad || '代价说不太清楚，总之有',
          init: init, hook: t.hook || {}, origin: t.origin || 'ext', db: true};
}
/* 重建外部天赋缓存。外部库随时可能被导入 / AI 写入，故抽卡前强制刷一次。 */
function refreshTalExt(){
  Object.keys(TAL_EXT_CACHE).forEach(k => { delete TAL_EXT_CACHE[k]; });
  const list = (typeof dbxList === 'function') ? (dbxList('tal') || []) : [];
  list.forEach(t => {
    if(!t || !t.id || ALL_TALENTS.some(x => x.id === t.id)) return;
    TAL_EXT_CACHE[t.id] = dbTalentNorm(t);
  });
  talExtWarmed = 1;
}
/* 天赋 id -> 条目。内置池优先，其次外部缓存；都没有返回 null。
   调用方必须自行兜底 —— 旧存档 / 已被删除的导入天赋都会走到这一步。 */
const talById = id => {
  const t = ALL_TALENTS.find(x => x.id === id);
  if(t) return t;
  if(!talExtWarmed) refreshTalExt();
  return TAL_EXT_CACHE[id] || null;
};
/* 天赋名安全取值：id 不在池中时退回 id 本身，绝不因取 .n 而中断整局 */
const talName = id => { const t = talById(id); return (t && t.n) || String(id); };
const TALENT_BY_NAME = {};
ALL_TALENTS.forEach(t => { TALENT_BY_NAME[t.n] = t; });

function rollTalents(n){
  /* v0.1.4: 抽卡池从 ALL_TALENTS 扩展到也包含外部（导入/AI）天赋。
     外部条目先归一再入池，否则 filter(t => t.r === rar) 永远筛不到，
     且一旦候选不足兜底抽中，渲染层的 t.r / t.n 全是 undefined。 */
  refreshTalExt();
  const pool = ALL_TALENTS.slice().concat(Object.keys(TAL_EXT_CACHE).map(k => TAL_EXT_CACHE[k]));
  const out = [];
  // 稀有度权重：白 50%、蓝 30%、紫 16%、橙 4%
  const wpick = () => {
    const r = Math.random();
    const rar = r < 0.5 ? 0 : r < 0.8 ? 1 : r < 0.96 ? 2 : 3;
    let cand = pool.filter(t => t.r === rar);
    if(!cand.length) cand = pool;
    const t = pick(cand);
    pool.splice(pool.indexOf(t), 1);
    return t.id;
  };
  while(out.length < n && pool.length) out.push(wpick());
  return out;
}

/* ========== 属性分配 ========== */
let alloc = {diff:'d1', pts:{}, spent:0, pool:36};

/* ========== 天赋钩子合并 ========== */
function hooks(){
  const h = {};
  if(!S) return h;
  // 乘积类钩子：多个天赋同时生效时相乘；其余数值钩子相加
  const MUL = {grow:1, sickRisk:1, growSoc:1, growInt:1};
  S.talents.forEach(id => {
    const t = talById(id);
    if(!t || !t.hook) return;
    Object.keys(t.hook).forEach(k => {
      const v = t.hook[k];
      if(typeof v === 'boolean') h[k] = h[k] || v;
      else if(typeof v === 'number'){
        if(MUL[k]) h[k] = (h[k] === undefined ? 1 : h[k]) * v;
        else h[k] = (h[k] || 0) + v;
      }
    });
  });
  return h;
}
function hookNum(k, def){
  let v = def === undefined ? 0 : def;
  if(!S) return v;
  S.talents.forEach(id => {
    const t = talById(id);
    if(t && t.hook && typeof t.hook[k] === 'number'){
      v = (k === 'grow' || k === 'sickRisk' || k === 'growSoc' || k === 'growInt') ? v * t.hook[k] : v + t.hook[k];
    }
  });
  return v;
}
const hookHas = k => !!(S && S.talents.some(id => { const t = talById(id); return t && t.hook && t.hook[k]; }));

/* ========== 被动与判定 ========== */
function passivesOf(attr){
  const out = [];
  /* 退役键（EQ / WIL / MH）的被动通过 main 折到有效主键上判定，
     否则 attr['EQ'] 恒为 undefined，这几条永远躺在列表里不生效。 */
  PASSIVES.forEach(p => { if((attr[p.main || p.k] || 0) >= p.at) out.push(p); });
  return out;
}
/* 判定取值：兼容 7 个主类 / 35 个隐藏子项 / 已退役的 EQ·WIL·MH 三种键。
   主类 → 直接取 S.attr；子项 → 其主类值 + 该子项的 Δ；退役键 → 先按 LEGACY_SUB 折到子项再算。
   旧实现直接读 S.attr['EQ']，而 S.attr 里早已没有这三个键，判定分恒为 0 —— 玩家情商再高也白搭。 */
function attrVal(k){
  if(!S) return 0;
  const u = String(k || '').toUpperCase();
  if(S.attr && (u in S.attr)) return Number(S.attr[u]) || 0;
  const sk = LEGACY_SUB[u] || u;
  if(!SUBN[sk]) return 0;
  /* SUB_OF 是权威表；后者是防御式兜底，只有它未初始化时才可能命中 */
  const main = (typeof SUB_OF === 'object' && SUB_OF[sk]) ? SUB_OF[sk] : '';
  const base = main ? (Number(S.attr[main]) || 0) : 0;
  return base + (Number((S.hid || {})[sk]) || 0);
}
function judgeBonus(a){
  let b = hookNum('judge', 0);
  const ps = passivesOf(S.attr);
  if(a === 'INT') ps.forEach(p => { if(p.n === '洞察') b += 1; });
  if(a === 'STR') ps.forEach(p => { if(p.n === '铜皮铁骨') b += 2; });
  if(a === 'LUK') ps.forEach(p => { if(p.n === '小福星') b += 1; });
  if(a === 'EQ') ps.forEach(p => { if(p.n === '万人迷' || p.n === '人情练达') b += 2; });
  if(a === 'SOC') ps.forEach(p => { if(p.n === '万人迷') b += 1; });
  if(hookHas('social') && (a === 'EQ' || a === 'SOC')) b += hookNum('social', 0);
  if(S && S.tags.indexOf('抑郁症') >= 0) b -= 1;
  if(S && S.tags.indexOf('投资亏损') >= 0) b -= 2;
  if(S && S.tags.indexOf('名校') >= 0 && a === 'INT') b += 2;
  if(hookHas('eqPen') && (a === 'EQ' || a === 'SOC')) b -= 1;
  return b;
}

/* ========== patch54：隐藏子项与需求向量 ========== */
/* 子项当前值 = 所属主属性值 + 该子项的个体增量 Δ */
function subVal(k){
  if(!S) return 0;
  const main = SUB_OF[k];
  if(!main) return Number((S.attr || {})[k]) || 0;
  const v = (Number(S.attr[main]) || 0) + (Number((S.hid || {})[k]) || 0);
  return clamp(v, SUB_VMIN, SUB_VMAX);
}
/* 需求向量匹配度：当前值与期望值的标准差 σ 越小，越容易被抽中（高斯核）。
   没有 req 的事件一律返回 1（中性匹配）—— 旧库全部走这条，行为一字不变。 */
/* 需求向量的匹配度：σ 越小越容易被抽中。
   注意两边都必须是 Δ 刻度 —— req 写的是「这一项偏离平均多少」，
   所以「我的属性」取 S.hid（个体增量），不能取 subVal（那是含主属性的绝对值，
   量纲差一个数量级，会让判定恒真或恒假）。 */
const REQ_BIAS = 0.28;
function reqMul(ev){
  const r = ev && ev.req;
  if(!r || !S) return 1;
  let sum = 0, n = 0;
  for(const k in r){
    const d = (Number((S.hid || {})[k]) || 0) - (Number(r[k]) || 0);
    sum += d * d; n++;
  }
  if(!n) return 1;
  const sig = Math.sqrt(sum / n);
  return clamp(1 / (1 + sig * REQ_BIAS), 0.08, 1);
}
/* 年内同属性边际递减：一年里同一项被加第 2 次只生效一半、第 3 次四分之一。
   这是「一年多次事件」下属性不爆表的关键 —— 事件变多了，但增长不是简单叠加。 */
function margMul(k){
  if(!S) return 1;
  if(!S.yearAttr) S.yearAttr = {};
  const c = S.yearAttr[k] || 0;
  return c === 0 ? 1 : (c === 1 ? 0.5 : 0.25);
}
/* 隐藏子项年度回归：Δ 累加会漂移，超过 ±4 时每年向 0 收 1 点，并硬钳 ±6。
   保留「这人天生偏某项」的识别度，又不至于几十年下来养出怪物。 */
function hidYearDecay(){
  if(!S || !S.hid) return;
  Object.keys(S.hid).forEach(k => {
    let v = Number(S.hid[k]) || 0;
    if(v >= 4) v -= 1; else if(v <= -4) v += 1;
    S.hid[k] = clamp(Math.round(v), -SUB_DCAP, SUB_DCAP);
  });
}
/* 事件携带的子项增量：只动自己的 Δ，不回流主属性 */
function applySubs(subs){
  if(!S || !subs) return [];
  if(!S.hid) S.hid = {};
  const out = [];
  Object.keys(subs).forEach(k => {
    if(!SUBN[k]) return;
    const v = Number(subs[k]) || 0;
    if(!v) return;
    let d = v * margMul(k) * yearScale();
    d = Math.round(d * 10) / 10;
    if(!d) return;
    S.hid[k] = clamp(Math.round((Number(S.hid[k]) || 0) + d), -SUB_DCAP, SUB_DCAP);
    S.yearAttr[k] = (S.yearAttr[k] || 0) + 1;
    out.push(SUBN[k] + (d > 0 ? '+' : '') + d);
  });
  return out;
}
/* 每年要发生几件事：在档位区间内以均值 μ 为中心窄带抽样，
   并对长期均值做回拉 —— 单年可以摸到 1 或 6，长期一定贴着 μ。 */
const FORT_LO = [0, 1, 2, 3, 4], FORT_HI = [0, 3, 4, 5, 6];
function yearEventCount(){
  const f = clamp(Math.round((S && S.fort) || 2), 1, 4);
  const lo = FORT_LO[f], hi = FORT_HI[f];
  const mu = (lo + hi) / 2;
  let v = mu + (Math.random() * 2 - 1);
  if(S && S.yearN > 0){
    const dev = (S.yearCnt / S.yearN) - mu;
    if(Math.abs(dev) > 0.8) v -= (dev > 0 ? 0.35 : -0.35);
  }
  const n = clamp(Math.round(v), lo, hi);
  if(S){ S.yearN = (S.yearN || 0) + 1; S.yearCnt = (S.yearCnt || 0) + n; }
  return n;
}

/* ===== 数值边界（ATTR_VMIN/ATTR_VMAX/SUB_VMIN/SUB_VMAX/AGE_MAX 已上移
   到 00-config.js「全局数值边界」统一管理）=====
   边界只兜底，不参与日常判定 —— 日常靠 softAttr 的收益衰减自然收敛。 */
/* ===== 年龄属性硬边界（需求：年龄 0~200）=====
   年龄是「时间属性」：每年由 tick 推进 1，事件里的 AGE 增减也照此调整。 */
/* ===== 寿命体系（需求：默认寿命 100，可增可减，越往上越难）=====
   LIFE_BASE：开局默认寿命上限（不显示给玩家，只决定「大概能活多久」）。
   LIFE_CAP ：寿命硬上限（与 AGE_MAX 对齐）。
   LIFE_EASY_UNTIL / LIFE_GAIN_EASY / LIFE_GAIN_HARD：
     阶梯延寿 —— 年龄 0~100 段每点体质 +3 年（容易），100 岁以后每点 +1 年（困难）。 */
const LIFE_BASE = 100;
const LIFE_CAP = 200;
const LIFE_EASY_UNTIL = 100;
const LIFE_GAIN_EASY = 3;
const LIFE_GAIN_HARD = 1;
/* 无敌模式的寿命锁定值：不再「无限生命」，而是把寿命锁定到年龄硬上限 ——
   开启后必定活到 200 岁（寿命不再成为死因），到 200 岁由年龄上限收尾。 */
const DEV_LIFE = AGE_MAX;
function lifeGainPerStr(age){
  return (Number(age) || 0) < LIFE_EASY_UNTIL ? LIFE_GAIN_EASY : LIFE_GAIN_HARD;
}
/* ===== 死亡系统（每年按年龄概率判定）=====
   需求：每年都有概率死亡，年龄越大概率越大；但不是只有高龄才会死，
   低龄同样留一条意外通道（小概率，不喧宾夺主）。
   年龄上限放宽到 200 后，曲线也必须跟着拉长：
     0~40 岁几乎不死（意外通道万分之 5 起），
     40 岁后按三次方缓慢抬升，把重心压在 80~160 岁这一段。 */
const DYING_AGE_BASE = 40;      // 从这个岁数起进入「显老」区间
function deathRateOf(age){
  const a = Math.max(0, Number(age) || 0);
  /* ① 意外通道：0~12 岁万分之 5，之后随年龄缓慢抬升（每岁 +0.004%）
        —— 低龄同样有一线意外，不喧宾夺主。 */
  let p = 0.0005 + Math.max(0, a - 12) * 0.00004;
  if(a > DYING_AGE_BASE){
    /* ② 显老通道：40 岁起按 (a-40)/28 的三次方抬升
          68 岁约 1.1%、96 岁约 6.8%、124 岁约 22%、152 岁约 52%、180 岁起封顶 */
    const k = (a - DYING_AGE_BASE) / 28;
    p += Math.pow(k, 3) * 0.008;
  }
  return clamp(p, 0.0005, 0.95);
}
/* 死亡理由池：按年龄区间挑，保证「说得通」。
   死亡理由之后不再有任何事件 —— 见 tick() 里的死亡分支。 */
const DEATH_WHY = [
  [0,  3,  ['一场急病来得太快，医生尽力了', '夜里发起了高热，再没醒过来', '一次意外，谁都没能拉住他']],
  [4,  12, ['一场急病带走了他', '意外来得毫无征兆', '身体一直不算结实，终究没扛过这个冬天']],
  [13, 18, ['一场重病把一切停在原地', '一次意外让故事没有了下一句', '身体早就透支，这一次没能缓过来']],
  [19, 30, ['长期熬着，身体先一步缴了械', '一场车祸结束了所有计划', '病查出来时已经晚了']],
  [31, 60, ['积劳成疾，身体终于不肯再撑', '一次体检查出了最坏的结果', '长年累月压着的那口气，断了']],
  [61, 95, ['年纪到了，身体各处在那个冬天一起停了工', '睡梦里走的，没有痛苦', '一场小病拖成了最后一程']],
  [96, 200,['活到这个岁数，身体像用旧了的器物，安静地散了架', '在睡梦里安然停下，走得很轻', '所有器官一起决定：可以了']]
];
function deathWhyOf(age){
  const a = Number(age) || 0;
  for(let i = 0; i < DEATH_WHY.length; i++){
    const r = DEATH_WHY[i];
    if(a >= r[0] && a <= r[1]) return r[2][Math.floor(Math.random() * r[2].length)];
  }
  return '身体再也撑不住了';
}
/* ===== 年度总量缩放 =====
   一年不只一件事之后，若每条都按全额结算，跨属性总增长会翻好几倍
   （margMul 只压得住「同一属性年内被加多次」，压不住「三条事件各加不同属性」）。
   这里按「当年事件数」做一次统一缩放：一年 1 件 ×1（与老版完全一致），
   三件 ×0.577，六件 ×0.408 —— 叙事更细，总量却不失控。
   注意：必须用「当年件数」 S.yearEvN（每岁开头由 tick 写入），
   不能用 S.yearN —— 那是累计已结算的年数，用它会让缩放逐年衰减到 0.3 以下。 */
function yearScale(){
  const n = (S && Number(S.yearEvN)) || 1;
  return 1 / Math.sqrt(n > 0 ? n : 1);
}
/* ===== 属性软上限 =====
   一年多事件之后，属性会顺着自己「擅长/不擅长」的方向越跑越远：
   实测老年智力均值被放大到 41（patch53 是 16）、体质被扣到 -38。
   这里不硬钳（硬钳会让界面数字突然不动，很怪），改成收益衰减：
     · 已到难度上限还想往上加 → 只算 35%
     · 已经跌破 0 还想继续扣 → 只算 35%
   于是属性自然收敛在 [0, cap] 附近，既保留差别又不会变成怪物。 */
function softAttr(k, v){
  if(!S || !v) return v;
  const cur = Number((S.attr || {})[k]) || 0;
  if(v > 0){
    /* 高于难度上限、或逼近硬顶（30）→ 收益只剩 35% */
    const d = DIFFS.find(x => x.id === S.diff);
    const cap = Math.min(d ? d.cap : ATTR_VMAX, ATTR_VMAX);
    if(cur >= cap || cur >= ATTR_VMAX - 2) return v * 0.35;
  }else if(v < 0 && (cur <= 0 || cur <= ATTR_VMIN + 2)){
    return v * 0.35;
  }
  return v;
}