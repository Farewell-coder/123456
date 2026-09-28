/* t45.js —— patch45 / patch46 专项检测台（jsdom + 静态，不动真机）
   覆盖：
     A 主菜单改版（两段式标题 / 副标题 / 按钮文案与顺序 / 无档隐藏继续 / 删底部信息区）
     B 数据管理三张卡 → 设置页同款可折叠（含 lr_fold 持久化与回放）
     C 文本体检卡头「开始体检」主按钮（一键跑查重 + 补写，且点它不会误触折叠）
     D 版本号 0.1.2 / 软件名 My Life, My Sim 的全落点
   特色：C 节把「卡头按钮 vs 折叠」的冒泡冲突做成显式回归，以后改绑定不会悄悄退化。 */
'use strict';
const fs = require('fs');
const { JSDOM } = require('/root/testenv/node_modules/jsdom');

const ROOT = '/root/appbuild/LifeRestart';
const P = ROOT + '/app/src/main/assets/index.html';
const HTML = require('./loadjs.js').loadFullHtml();
const JS = require('./loadjs.js').loadGameJs();
const GRAD = fs.readFileSync(ROOT + '/app/build.gradle', 'utf8');
const JAVA = fs.readFileSync(ROOT + '/app/src/main/java/com/life/restart/MainActivity.java', 'utf8');
const XMLS = fs.readFileSync(ROOT + '/app/src/main/res/values/strings.xml', 'utf8');

let pass = 0, fail = 0;
const BUGS = [];
function ok(c, m){ if(c){ pass++; console.log('  PASS  ' + m); } else { fail++; console.log('  FAIL  ' + m); BUGS.push(m); } }

/* ============ A. 主菜单改版（静态） ============ */
console.log('\n=== A. 主菜单改版（静态） ===');
ok(HTML.indexOf('<div class="logo"><span class="lg1">My Life</span><span class="lg2">My Sim</span><span class="sub">My Life, My Simulation</span></div>') >= 0,
   '主标题两段式 + 英文副标题（HTML 结构）');
ok(HTML.indexOf('人生重开 · AI 版') < 0, '旧主标题「人生重开 · AI 版」已全部清除');
ok(HTML.indexOf('id="mVer"') < 0, '底部信息区元素 #mVer 已删除');
ok(HTML.indexOf('id="contTip"') < 0 && HTML.indexOf('class="mbtn tip"') < 0, '「暂无存档」小字提示已从按钮里删除');
ok(/<button class="mbtn hide" id="mCont">继续游戏<\/button>/.test(HTML), '「继续游戏」按钮（默认带 hide）');
ok(/<button class="mbtn pri" id="mStart">开始游戏<\/button>/.test(HTML), '「开始游戏」按钮（主色 pri）');
/* DOM 顺序固定，无档时靠隐藏实现「开始 → 图鉴 → 设置」 */
const iMenu = HTML.indexOf('class="menu-list"');
const segMenu = HTML.slice(iMenu, HTML.indexOf('</section>', iMenu));
const order = ['mCont', 'mStart', 'mDex', 'mSet'].map(id => segMenu.indexOf('id="' + id + '"'));
ok(order.every(v => v >= 0) && order[0] < order[1] && order[1] < order[2] && order[2] < order[3],
   '按钮 DOM 顺序：继续 / 开始 / 图鉴 / 设置');
/* CSS：渐变下移到两个词各自身上，否则拆段后文字会消失 */
ok(/\.logo \.lg1,\.logo \.lg2\{[^}]*background:var\(--grad2\)[^}]*background-clip:text/.test(HTML),
   '两段标题各自带渐变裁剪（拆段后文字不会消失）');
ok(/\.logo \.lg1\{margin:0 auto 0 0;text-align:left\}/.test(HTML), '第一段靠左');
ok(/\.logo \.lg2\{margin:0 -6px 0 auto;text-align:right\}/.test(HTML), '第二段右对齐（右下错落，负 margin 抵消末字空隙）');
ok(/\.logo \.sub\{[^}]*letter-spacing:2\.5px/.test(HTML), '副标题字距收到 2.5px（23 字符不折行）');
/* refreshMenu 不再是拼字符串，而是显隐控制 */
ok(/c\.classList\.toggle\('hide', !\(h && h\.S && !h\.S\.dead\)\)/.test(HTML),
   'refreshMenu 用显隐控制「继续游戏」（有档可见 / 无档隐藏）');
ok(/\$\('#mVer'\)/.test(JS) === false, 'JS 里已无 #mVer 引用（不会再空指针）');

/* ============ B. 三张卡可折叠（静态） ============ */
console.log('\n=== B. 数据管理三张卡可折叠（静态） ===');
const iDb = HTML.indexOf('<div id="dbPage">');
const segDb = HTML.slice(iDb, HTML.indexOf('<div id="toast">'));
['db-add', 'db-out', 'db-tk'].forEach(ck => {
  const seg = segDb.slice(segDb.indexOf('data-ck="' + ck + '"'));
  const head = seg.slice(0, 260);
  ok(head.indexOf('class="chead tap"') >= 0 && head.indexOf('class="arw">▾</span>') >= 0,
     '卡片 ' + ck + ' 卡头带 tap + ▾ 箭头');
});
ok((segDb.match(/class="cbody"/g) || []).length === 3, '三张卡各有一个 .cbody 内容包');
ok(/<button class="tkrun" id="dbTkRun">开始体检<\/button>/.test(HTML), '文本体检卡头有「开始体检」主按钮');
/* 作用域放宽到 #dbPage */
ok(/querySelectorAll\('#modal \.card\[data-ck\], #dbPage \.card\[data-ck\]'\)\.forEach/.test(HTML),
   'foldApply 作用域已含 #dbPage');
ok(/function openDbPage\(kind\)\{[\s\S]{0,320}?foldApply\(\);/.test(HTML),
   'openDbPage 里回放了折叠态（每次打开都按 lr_fold 还原）');
/* 折叠 CSS */
['#dbPage .card.fold .cbody{display:none}',
 '#dbPage .card.fold .arw{transform:rotate(-90deg)}',
 '#dbPage .card.fold .chead{margin-bottom:0}'].forEach(r => {
  ok(HTML.indexOf(r) >= 0, '折叠样式齐备：' + r.slice(0, 34) + '…');
});
ok(/#dbPage \.chead \.tkrun\{[^}]*margin-left:auto/.test(HTML), '卡头主按钮靠右（margin-left:auto）');
/* 关键：共用同一套 lr_fold，卡名不重名 */
ok(HTML.indexOf("const FOLD_KEY = 'lr_fold'") >= 0, '与设置页共用同一个 lr_fold 折叠态');
ok(/v === undefined \? true : !!v/.test(HTML), 'foldApply 默认收起（未记录过的卡一律折起）');
ok(HTML.indexOf('let dbFold = {0:1, 1:1, 2:1};') >= 0, '数据管理三张来源卡默认收起');

/* ============ C. jsdom 动态：折叠 / 持久化 / 误触 ============ */
console.log('\n=== C. 动态验证（jsdom） ===');
const errs = [];
const dom = new JSDOM(HTML, {
  runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/i.html',
  beforeParse(w){
    w.addEventListener('error', e => errs.push(String((e && (e.message || e.error)) || e)));
    w.Android = null;
    w.fetch = () => Promise.reject(new Error('no stub'));
    w.AudioContext = function(){
      return { createOscillator: () => ({ connect(){}, start(){}, stop(){}, frequency:{value:0}, type:'' }),
               createGain: () => ({ connect(){}, gain:{value:0} }),
               destination: {}, currentTime: 0, close(){} };
    };
    w.scrollTo = () => {};
    const rawST = w.setTimeout.bind(w);
    w.setTimeout = function(fn, ms){
      const a = Array.prototype.slice.call(arguments, 2);
      if(typeof ms === 'number' && ms >= 5000) ms = 60;
      return rawST.apply(null, [fn, ms].concat(a));
    };
  }
});
const w = dom.window;
ok(errs.length === 0, '脚本无运行时错误（' + errs.slice(0, 2).join(' | ') + '）');

const foldOf = ck => w.eval("$('#dbPage .card[data-ck=\"" + ck + "\"]').classList.contains('fold')");
const clickHead = ck => w.eval("(function(){var h=$('#dbPage .card[data-ck=\"" + ck + "\"] > .chead');"
  + "h.dispatchEvent(new MouseEvent('click',{bubbles:true}));})()");

w.eval("localStorage.removeItem('lr_fold');");
w.eval("openDbPage('ev');");
ok(w.eval("$('#dbPage').classList.contains('on')"), '数据管理页已打开');
ok(foldOf('db-add') && foldOf('db-out') && foldOf('db-tk'), '初始三张卡都是收起的（默认收起）');

clickHead('db-add');
ok(!foldOf('db-add'), '点卡头 → 「新增 / 导入」展开');
ok(foldOf('db-out') && foldOf('db-tk'), '另两张卡不受影响（折叠互相独立）');
ok(w.eval("JSON.parse(localStorage.getItem('lr_fold') || '{}')['db-add']") === 0,
   '展开态写入 lr_fold（db-add=0）');

clickHead('db-add');
ok(foldOf('db-add'), '再点一次 → 重新收起');
ok(w.eval("JSON.parse(localStorage.getItem('lr_fold') || '{}')['db-add']") === 1,
   '收起态同样被记住（db-add=1）');

/* 关键回归：卡头里的按钮不能被折叠逻辑吞掉 */
w.eval("window.__n1 = 0; window.__n2 = 0;"
  + "dbDedupScan = async function(){ window.__n1++; };"
  + "dbAffFill = function(){ window.__n2++; };");
w.eval("$('#dbTkRun').dispatchEvent(new MouseEvent('click', {bubbles:true}));");
ok(foldOf('db-tk'), '点「开始体检」主按钮 → 折叠状态不被改动（仍是收起）');
const waited = (async () => {
  for(let i = 0; i < 60 && (w.eval('window.__n1') !== 1 || w.eval('window.__n2') !== 1); i++){
    await new Promise(r => setTimeout(r, 30));
  }
})();
(async () => {
  await waited;
  ok(w.eval('window.__n1') === 1 && w.eval('window.__n2') === 1,
     '「开始体检」一键跑完两步（查重 ' + w.eval('window.__n1') + ' 次 / 补写 ' + w.eval('window.__n2') + ' 次）');

  clickHead('db-tk');
  ok(!foldOf('db-tk'), '点卡头空白处 → 「文本体检」正常展开');
  w.eval("closeDbPage();");
  ok(!w.eval("$('#dbPage').classList.contains('on')"), '数据管理页可关闭');
  w.eval("openDbPage('ev');");
  ok(!foldOf('db-tk'), '重新打开后折叠态被回放（db-tk 仍是展开的）');

  /* 与设置页共用 lr_fold：两边互不干扰 */
  w.eval("openSet();");
  ok(w.eval("$('#modal').classList.contains('on')"), '设置面板可打开');
  const setCards = w.eval("document.querySelectorAll('#modal .card[data-ck]').length");
  const setFolded = w.eval("[].filter.call(document.querySelectorAll('#modal .card[data-ck]'),"
    + "c => c.classList.contains('fold')).length");
  ok(setCards >= 3, '设置页折叠卡数量 ' + setCards);
  ok(setFolded === setCards, '设置页卡片也全部默认收起（' + setFolded + '/' + setCards + '）');
  w.eval("document.querySelectorAll('#dbPage .card[data-ck]').forEach(c => c.classList.remove('fold'));"
    + "localStorage.removeItem('lr_fold');");

  /* ============ D. 版本号 / 软件名 ============ */
  console.log('\n=== D. 版本号 0.1.2 / 软件名 My Life, My Sim ===');
  ok(/const GAME_VER = '0\.1\.2';/.test(HTML), 'index.html GAME_VER = 0.1.2');
  ok(/<div class="card aboutcard" id="cardAbout">/.test(HTML), '设置里「关于」已独立成卡（v0.1.2）');
  ok(/<b id="abVer">v0\.1\.2<\/b>/.test(HTML), '关于页版本号 v0.1.2');
  ok(/My Life, My Sim  v0\.1\.2/.test(HTML), 'JS 头部注释版本号 v0.1.2');
  ok(/versionCode 5\b/.test(GRAD) && /versionName "0\.1\.2"/.test(GRAD), 'build.gradle versionCode 5 / versionName 0.1.2');
  ok(JAVA.indexOf('index.html?v=0.1.2') >= 0, 'MainActivity 加载串 ?v=0.1.2');
  ok(/<string name="app_name">My Life, My Sim<\/string>/.test(XMLS), 'strings.xml 桌面图标名 My Life, My Sim');
  /* 软件名 11 处落点（index.html） */
  ok(/<title>My Life, My Sim<\/title>/.test(HTML), 'title 标签');
  ok(/<div class="chead"><span class="dot"><\/span>My Life, My Sim<\/div>/.test(HTML), '关于页标题');
  ok(/<div class="chead"><span class="dot"><\/span>My Life, My Sim<\/div>/.test(HTML), '关于页标题');
  ok(HTML.indexOf("'【世界名】My Life, My Sim'") >= 0, '世界书名');
  ok(HTML.indexOf("src: 'My Life, My Sim ' + GAME_VER") >= 0, '导出数据 src');
  ok(HTML.indexOf("const name = 'MyLifeMySim_' + DB_FIELDS[dbKind].t") >= 0, '导出数据文件名');
  ok(HTML.indexOf("const name = 'MyLifeMySim_存档_'") >= 0, '存档文件名');
  ok(HTML.indexOf("'My Life, My Sim  诊断信息") >= 0, '诊断信息抬头');
  ok(HTML.indexOf("const name = 'MyLifeMySim_诊断_'") >= 0, '诊断包名');
  ok(HTML.indexOf('人生重开') < 0, 'index.html 里「人生重开」已彻底清除');
  ok(JAVA.indexOf('"人生重开存档"') < 0 && JAVA.indexOf('"MyLifeMySim"') >= 0, 'MainActivity 兜底目录改名');
  /* 存档兼容：换版本号后旧档仍能读到 */
  const compat = w.eval("(function(){localStorage.clear();"
    + "localStorage.setItem('lr_hist_0.0.1', JSON.stringify({ver:'0.0.1',at:1,S:{age:42}}));"
    + "var h = histOf(); return h && h.S && h.S.age;})()");
  ok(compat === 42, '换到 0.1.2 后旧档 lr_hist_0.0.1 仍被 lsCompat 读到（不丢档）');
  ok(errs.length === 0, '全程无运行时错误（' + errs.length + '）');

  /* ---------- 汇总 ---------- */
  console.log('\n----------------------------------------');
  console.log('t45 结果：' + pass + ' PASS / ' + fail + ' FAIL');
  if(fail){ console.log('失败项：'); BUGS.forEach(b => console.log('  - ' + b)); }
  w.close();
  process.exit(fail ? 1 : 0);
})();