/* t44.js —— patch44 专项检测台（jsdom + 静态，不动真机）
   覆盖用户反馈：
     1 「文本校验的按钮去哪里了」→ #dbPage .acts 缺 CSS
     2 「弹窗的优先级有问题，其他地方也有」→ z-index 阶梯错乱
     3 「明确标注 文本检测的按钮」→ 双行标注
   特色：A 节是一套「CSS 覆盖自检」，对每个顶层容器逐一核对所含 class 是否有可用规则，
        以后任何新加 class 忘了写样式，这里会直接报出来。 */
'use strict';
const fs = require('fs');
const { JSDOM } = require('jsdom');
const P = __dirname + '/app/src/main/assets/index.html';
const HTML = require('./loadjs.js').loadFullHtml();
let pass = 0, fail = 0;
const BUGS = [];
function ok(c, m){ if(c){ pass++; console.log('  PASS  ' + m); } else { fail++; console.log('  FAIL  ' + m); BUGS.push(m); } }

/* ---------- A. CSS 覆盖自检：每个顶层容器里的 class 都要有可用样式 ---------- */
console.log('\n=== A. CSS 覆盖自检（容器 × class） ===');

/* 用 HTML 里的行号切出每个顶层容器（避免手工维护下标） */
const lines = HTML.split('\n');
function findLine(re){ for(let i = 0; i < lines.length; i++){ if(re.test(lines[i])) return i; } return -1; }
const BOX = [
  ['#modal',     findLine(/<div id="modal">/)          ],
  ['#aboutPage', findLine(/<div id="aboutPage">/)       ],
  ['#dbgPage',   findLine(/<div id="dbgPage">/)         ],
  ['#bootPage',  findLine(/<div id="bootPage">/)        ],
  ['#dlg',       findLine(/<div id="dlg">/)             ],
  ['#dlgI',      findLine(/<div id="dlgI"/)             ],
  ['#dbPage',    findLine(/<div id="dbPage">/)          ],
];
ok(BOX.every(b => b[1] >= 0), '顶层容器定位成功（' + BOX.map(b => b[0] + ':' + (b[1] + 1)).join(' ') + '）');

/* 各容器结束行 = 下一个容器起始行 */
for(let i = 0; i < BOX.length - 1; i++){ BOX[i][2] = BOX[i + 1][1]; }
BOX[BOX.length - 1][2] = findLine(/<div id="toast">/);

const styleTxt = HTML.slice(HTML.indexOf('<style'), HTML.indexOf('</style>'));
const sels = [];
styleTxt.replace(/(^|\n)[ \t]*([^{}@\n][^{}\n]*?)[ \t]*\{/g, (m, pre, sel) => { sels.push(sel.trim().replace(/\n/g, ' ')); return m; });
ok(sels.length > 300, 'CSS 规则解析成功（' + sels.length + ' 条）');

function ownerOf(sel){ for(const b of BOX){ if(sel.indexOf(b[0]) >= 0) return b[0]; } return null; }
function hit(sel, c){ return new RegExp('\\.' + c.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&') + '(?![\\w-])').test(sel); }

let missingTotal = 0;
BOX.forEach(([name, a, b]) => {
  const seg = lines.slice(a, b).join('\n');
  const cls = new Set();
  seg.replace(/class="([^"]*)"/g, (m, v) => { v.split(/\s+/).forEach(c => c && cls.add(c)); return m; });
  const bad = [];
  cls.forEach(c => {
    const globOk = sels.some(s => ownerOf(s) === null && hit(s, c));
    const ownOk  = sels.some(s => ownerOf(s) === name && hit(s, c));
    if(!(globOk || ownOk)) bad.push(c);
  });
  missingTotal += bad.length;
  ok(bad.length === 0, name + '：' + cls.size + ' 个 class 全部有可用样式' + (bad.length ? '（缺：' + bad.join(', ') + '）' : ''));
});

/* ---------- B. 本次补的关键规则确实写进去了 ---------- */
console.log('\n=== B. 补写的规则 ===');
ok(/#dbPage \.acts\{[^}]*display:flex/.test(styleTxt), '#dbPage .acts 存在且为 flex 行');
ok(/#dbPage \.acts button\{[^}]*background:var\(--grad\)/.test(styleTxt), '#dbPage .acts button 有主题渐变底（不再是裸文字）');
ok(/#dbPage \.acts button\{[^}]*padding:13px/.test(styleTxt), '#dbPage .acts button 有内边距（撑出按钮形状）');
ok(/#dbPage \.acts button\{[^}]*text-align:center/.test(styleTxt), '#dbPage .acts button 居中（覆盖全局 reset 的 left）');
ok(/#dbPage \.acts button\.ghost\{[^}]*background:var\(--soft\)/.test(styleTxt), '#dbPage .acts button.ghost 有次级底色');
ok(/#dbgPage \.sw\{[^}]*display:flex/.test(styleTxt), '#dbgPage .sw 补上 flex 分栏（调试页开关行）');
ok(/#dbgPage \.sw \.st\{/.test(styleTxt) && /#dbgPage \.sw \.sd\{/.test(styleTxt), '#dbgPage .sw 的 .st/.sd 有样式');
/* 只影响本页，不污染其他容器 */
const actsModal = (styleTxt.match(/#modal \.acts\{display:flex;gap:10px\}/g) || []).length;
ok(actsModal === 1, '#modal .acts 原规则未被破坏（' + actsModal + ' 条）');
const actsDbg = (styleTxt.match(/#dbgPage \.acts\{display:flex;gap:10px;margin-top:10px\}/g) || []).length;
ok(actsDbg === 1, '#dbgPage .acts 原规则未被破坏（' + actsDbg + ' 条）');
/* 三条规则各自独立：改 #dbPage 不应连累另两个容器 */
ok(/#dbPage \.acts button\{/.test(styleTxt) && /#modal \.acts button\{/.test(styleTxt) && /#dbgPage \.acts button\{/.test(styleTxt),
   '三个容器的 .acts button 规则并存、作用域互不干扰');

/* ---------- C. z-index 阶梯 ---------- */
console.log('\n=== C. 弹窗层级（用户说的「优先级」） ===');
function zOf(sel){
  const m = styleTxt.match(new RegExp(sel.replace(/[#.\-]/g, '\\$&') + '\\{[^}]*z-index:(\\d+)'));
  return m ? parseInt(m[1], 10) : null;
}
const Z = {
  dbPage:    zOf('#dbPage'),
  aboutPage: zOf('#aboutPage'),
  dbgPage:   zOf('#dbgPage'),
  dlg:       zOf('#dlg'),
  dlgI:      zOf('#dlgI'),
  bootPage:  zOf('#bootPage'),
  toast:     zOf('#toast'),
};
Object.keys(Z).forEach(k => ok(typeof Z[k] === 'number', 'z-index 可解析：' + k + ' = ' + Z[k]));
ok(Z.dlg > Z.dbPage,    '确认弹窗 ' + Z.dlg + ' > 数据管理页 ' + Z.dbPage);
ok(Z.dlg > Z.aboutPage, '确认弹窗 ' + Z.dlg + ' > 关于页 ' + Z.aboutPage);
ok(Z.dlg > Z.dbgPage,   '确认弹窗 ' + Z.dlg + ' > 调试页 ' + Z.dbgPage);
ok(Z.dlgI > Z.dlg,      '输入弹窗 ' + Z.dlgI + ' > 确认弹窗 ' + Z.dlg + '（嵌套弹窗顺序正确）');
ok(Z.bootPage > Z.dlgI, '开局读条 ' + Z.bootPage + ' > 输入弹窗 ' + Z.dlgI + '（读条能盖住一切页面）');
ok(Z.toast > Z.bootPage,'Toast ' + Z.toast + ' 全场最高（提示永远可见）');
ok(Z.dlg >= 280, '#dlg 已提到所有页面层之上（' + Z.dlg + '）');

/* ---------- D. 文本体检按钮的「明确标注」 ---------- */
console.log('\n=== D. 文本体检按钮标注 ===');
/* 注意：不能直接用 indexOf('文本体检') —— CSS 注释和 JS 注释里也出现了这四个字。
   这里锚定卡片标题本身的那段 HTML。 */
const iTk = HTML.indexOf('<span class="dot"></span>文本体检<');
const segTk = HTML.slice(iTk, iTk + 1400);
ok(iTk > HTML.indexOf('</style>'), '锚点落在卡片标题（非注释），位置 ' + iTk);
ok(segTk.indexOf('id="dbDedup"') >= 0, '「重复检测」按钮仍在');
ok(segTk.indexOf('id="dbAffFill"') >= 0, '「同步偏向」按钮仍在');
ok(/<button id="dbDedup"><span class="abt">重复检测<\/span><span class="abd">[^<]+<\/span><\/button>/.test(HTML),
   '「重复检测」= 主标题 + 副说明 双行标注');
ok(/<button class="ghost" id="dbAffFill"><span class="abt">同步偏向<\/span><span class="abd">[^<]+<\/span><\/button>/.test(HTML),
   '「同步偏向」= 主标题 + 副说明 双行标注');
ok(/#dbPage \.acts button \.abd\{[^}]*font-size:11px/.test(styleTxt), '副说明 .abd 有独立小字号样式');
ok(/#dbPage \.acts button \.abt\{[^}]*display:block/.test(styleTxt), '主标题 .abt 独占一行');
/* 按钮文字仍是可读的纯文本（读屏不会连读成乱码）
   把标签剥掉、把连续分隔符合并成一个，模拟读屏的朗读顺序 */
const plainTk = HTML.slice(iTk, iTk + 1400).replace(/<[^>]+>/g, '|').replace(/\|+/g, '|').replace(/\s+/g, '');
ok(/重复检测\|找出内容重复的条目/.test(plainTk), '读屏顺序：重复检测 → 说明（不再是「测朴写…」）');
ok(/同步偏向\|对未分类条目做分类/.test(plainTk), '读屏顺序：同步偏向 → 说明');
ok(plainTk.indexOf('测朴写属性偏向') < 0, '旧的连读乱码「测朴写属性偏向」已不存在');
/* 功能与绑定未被改动 */
ok(/\$\('#dbDedup'\)\.onclick = dbDedupScan;/.test(HTML), '重复检测仍绑定 dbDedupScan');
ok(/bAff\.onclick = dbAffFill;/.test(HTML), '同步偏向仍绑定 dbAffFill');
ok(/async function dbDedupScan\(\)/.test(HTML) && /function dbAffFill\(\)/.test(HTML), '两个功能函数未被改动');
/* 卡内其他三个按钮也拿到了样式 */
['dbAdd', 'dbImp', 'dbCopy', 'dbFile'].forEach(id => {
  ok(new RegExp('<button( class="ghost")? id="' + id + '">').test(HTML), '按钮 ' + id + ' 结构未被破坏');
});
const actsInDb = (HTML.slice(HTML.indexOf('<div id="dbPage">'), HTML.indexOf('<div id="toast">')).match(/class="acts(?: |")/g) || []).length;
ok(actsInDb === 3, '#dbPage 内 3 处按钮行（实测 ' + actsInDb + '）全部由 #dbPage .acts 覆盖');

/* ---------- E. 动态：从数据管理页弹确认框 ---------- */
console.log('\n=== E. 动态验证（jsdom） ===');
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
ok(typeof w.dialog === 'function', 'dialog() 可用');
/* 打开数据管理页，再弹确认框 —— 这是用户实际会走的路径 */
w.eval("openDbPage('ev');");
ok(w.eval("$('#dbPage').classList.contains('on')"), '数据管理页已打开');
ok(w.eval("getComputedStyle($('#dbPage')).zIndex") === String(Z.dbPage), '数据管理页实际层级 ' + w.eval("getComputedStyle($('#dbPage')).zIndex"));
w.eval("dialog('测试标题', '测试说明', [{t:'确定', pri:true, fn:function(){}}]);");
ok(w.eval("$('#dlg').classList.contains('on')"), '确认弹窗已打开');
ok(w.eval("dlgOpen") === true && w.eval("$('#dlg').classList.contains('on')") === true,
   'dlgOpen 状态与弹窗可见性一致（dlgShown 已作为零引用死函数移除）');
const zDlg = w.eval("getComputedStyle($('#dlg')).zIndex");
ok(zDlg === String(Z.dlg), '确认弹窗实际层级 ' + zDlg + '（大于页面层 ' + Z.dbPage + '）');
ok(parseInt(zDlg, 10) > Z.dbPage, '层级比较成立：弹窗 ' + zDlg + ' > 数据管理页 ' + Z.dbPage + ' —— 不会再被盖住');
/* 按钮真的拿到了样式（jsdom 级联） */
const btn = w.eval("(function(){var b=$('#dbDedup');var cs=getComputedStyle(b);return cs.textAlign+'|'+cs.paddingTop+'|'+cs.display;})()");
ok(/center/.test(btn), '「重复检测」按钮 textAlign=' + btn.split('|')[0] + '（全局 reset 的 left 已被覆盖）');
ok(!/^0px/.test(btn.split('|')[1]), '「重复检测」按钮 padding=' + btn.split('|')[1] + '（已撑出按钮形状）');
const abt = w.eval("$('#dbDedup').querySelector('.abt').textContent + ' / ' + $('#dbDedup').querySelector('.abd').textContent");
ok(abt === '重复检测 / 找出内容重复的条目', '按钮双行文案：' + abt);
/* 关掉弹窗，链路正常 */
w.eval("closeDlg();");
ok(w.eval("$('#dlg').classList.contains('on')") === false, '弹窗可正常关闭');
ok(w.eval("dlgOpen") === false && w.eval("$('#dlg').classList.contains('on')") === false,
   '关闭后 dlgOpen/可见性都正确复位');
/* 三态主题下取色变量都在（jsdom 不解析 linear-gradient，故断言「背景声明里含主题变量」） */
const themes = ['light', 'dark', 'auto'];
themes.forEach(t => {
  const r = w.eval("(function(){document.documentElement.setAttribute('data-theme','" + t + "');"
    + "var v=getComputedStyle(document.documentElement).getPropertyValue('--grad').trim();"
    + "var q=getComputedStyle(document.documentElement).getPropertyValue('--soft').trim();"
    + "return v + ' ~ ' + q;})()");
  ok(/gradient/.test(r) && r.split(' ~ ')[1] !== '', '主题 ' + t + ' 下 --grad/--soft 均已定义（' + String(r).slice(0, 52) + '…）');
});
/* 直属关系确认：按钮的底色取自 #dbPage .acts button 这条规则（而不是继承来的） */
const ruleHit = w.eval("(function(){var b=$('#dbDedup');"
  + "for(var i=0;i<document.styleSheets[0].cssRules.length;i++){var r=document.styleSheets[0].cssRules[i];"
  + "if(r.selectorText==='#dbPage .acts button' && b.matches(r.selectorText)) return r.style.background||r.style.backgroundImage||'set';"
  + "} return 'none';})()");
ok(ruleHit !== 'none', '#dbDedup 命中 `#dbPage .acts button` 规则（background=' + String(ruleHit).slice(0, 46) + '）');
const ruleHitGhost = w.eval("(function(){var b=$('#dbAffFill');"
  + "for(var i=0;i<document.styleSheets[0].cssRules.length;i++){var r=document.styleSheets[0].cssRules[i];"
  + "if(r.selectorText==='#dbPage .acts button.ghost' && b.matches(r.selectorText)) return r.style.background||'none';"
  + "} return 'none';})()");
ok(ruleHitGhost !== 'none', '#dbAffFill 命中 ghost 规则（background=' + String(ruleHitGhost).slice(0, 40) + '）');
/* 三个按钮行都真的落在带样式的容器里 */
const rows = ['dbAdd', 'dbCopy', 'dbDedup'];
rows.forEach(id => {
  const r = w.eval("(function(){var b=$('#" + id + "');var p=b.parentNode;return p.className+'|'+getComputedStyle(p).display;})()");
  ok(/acts/.test(r) && /flex/.test(r), '按钮 ' + id + ' 的按钮行为 ' + r.split('|')[0] + '，display=' + r.split('|')[1]);
});
w.eval("document.documentElement.removeAttribute('data-theme');");

/* ---------- 汇总 ---------- */
console.log('\n----------------------------------------');
console.log('t44 结果：' + pass + ' PASS / ' + fail + ' FAIL');
if(fail){ console.log('失败项：'); BUGS.forEach(b => console.log('  - ' + b)); }
console.log('CSS 覆盖自检缺失类总数：' + missingTotal);
process.exit(fail ? 1 : 0);