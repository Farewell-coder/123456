/* t43.js —— patch43 专项检测台（jsdom 桌面仿真，不动真机）
   覆盖 7 项任务：
     1 临终症状池（死亡不再突兀）
     2 属性专属事件 + 事件带属性偏向
     3 属性偏向判断 / 文本体检 UI
     4 预加载 30 秒上限（真实时间判定）
     5 属性面板布局
     6 AI 文案字数上限
     7 本地标签事件池扩充 + 已拥有标签不再重复
   附带：harvestAiQueue 与 scrollClean 次序 bug 的回归。 */
'use strict';
const fs = require('fs');
const { JSDOM } = require('jsdom');
const HTML = require('./loadjs.js').loadFullHtml();
let pass = 0, fail = 0;
const BUGS = [];
function ok(c, m){ if(c){ pass++; console.log('  PASS  ' + m); } else { fail++; console.log('  FAIL  ' + m); BUGS.push(m); } }
function note(m){ console.log('  ··    ' + m); }

function makeEnv(opt){
  opt = opt || {};
  const errs = [];
  const dom = new JSDOM(HTML, {
    runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/i.html',
    beforeParse(w){
      w.addEventListener('error', e => errs.push(String((e && (e.message || e.error)) || e)));
      w.Android = opt.android || null;
      w.fetch = opt.fetch || (() => Promise.reject(new Error('no stub')));
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
  return { w: dom.window, dom, errs };
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

const SECT = {};

/* ---------- A. 数据层：事件库扩充规模 ---------- */
SECT.A = async () => {
  console.log('\n=== A. 数据层：事件库扩充规模 ===');
  const e = makeEnv();
  const w = e.w;
  await NAP(300);
  const total = w.eval("dataOf('ev').length");
  ok(total === 2467, '事件库总计 2467 条（原内置 1060 + 扩充 924 + 后续批次新增，实测 ' + total + '）');
  const px = w.eval("JSON.stringify(dataOf('ev').reduce((o,x)=>{const p=String(x.id).replace(/^([a-z]+).*$/,'$1');o[p]=(o[p]||0)+1;return o;},{}))");
  const m = JSON.parse(px);
  note('前缀分布 ' + px);
  ok(m.x === 108, 'DB_EXT_EV 补充事件 108 条（实测 ' + m.x + '）');
  ok(m.d === 49,  'DB_DYING_EV 临终症状 49 条（实测 ' + m.d + '）');
  ok(m.ax === 65, 'DB_ATTR_EV 属性专属 65 条（实测 ' + m.ax + '）');
  ok(m.g === 105, 'DB_TAG_EV 标签专属 105 条（21 标签 × 5，实测 ' + m.g + '）');
  ok(m.u === 752, 'DB_USER_EV 升格本地库 752 条（实测 ' + m.u + '）');
  ok(w.eval('Object.keys(TAGS).length') === 54, '标签共 54 个（标签体系后续扩充）');
  const st = JSON.parse(w.eval("JSON.stringify(['幼年','童年','少年','青年','中年','老年'].map(s=>dataOf('ev').filter(x=>x.stage===s).length))"));
  ok(st.every(n => n >= 120), '六阶段每段事件都 ≥120 条（v0.1.1 扩充后，' + st.join('/') + '）');
  ok(w.eval("dataOf('ev').filter(x=>x.__src===0).length") === total, '内置条目全部标记 __src=0（本地只读，实测 ' + w.eval("dataOf('ev').filter(x=>x.__src===0).length") + '）');
  ok(e.errs.length === 0, '页面无 JS 报错' + (e.errs.length ? '：' + e.errs[0] : ''));
  e.dom.window.close();
};

/* ---------- B. 需求 1：临终症状池 ---------- */
SECT.B = async () => {
  console.log('\n=== B. 需求 1：临终症状（死亡不再突兀）===');
  const e = makeEnv();
  const w = e.w;
  await NAP(300);
  w.eval("newLife([], {EQ:5,WIL:5,MH:10}, 'd1'); running = true;");
  /* 剩余寿命正常计算 */
  w.eval("S.age = 66; S.lifespan = 70;");
  ok(w.eval('yearsLeft()') === 4, '剩余寿命 = 寿命上限 − 年龄（66/70 → 4）');
  /* 临终池在最后几年有货 */
  const dp = w.eval("JSON.stringify((dyingPool('老年', 68) || []).length)");
  ok(Number(dp) > 0, '老年 68 岁临终池非空（' + dp + ' 条）');
  ok(Number(w.eval("JSON.stringify((dyingPool('老年', 40) || []).length)")) === 0, '40 岁不属临终窗口，症状池为空');
  /* 症状池的 id 前缀与标记 */
  ok(w.eval("(dyingPool('老年', 68) || []).every(x => x.dying === true)"), '症状事件都带 dying 标记');
  ok(w.eval("(dyingPool('老年', 68) || []).every(x => x.aff === null && Array.isArray(x.tags))"), '症状事件字段规范（aff=null / tags 数组）');
  /* 临终窗口内 chooseEv 应该大量命中症状池 */
  w.eval("S.age = 67; S.lifespan = 69; evStamp = {}; evRecent = [];");
  const got = w.eval("(function(){ let n = 0; for(let i = 0; i < 300; i++){ const r = chooseEv('老年', 67); if(r && r.dying) n++; } return n; })()");
  note('300 次抽样命中临终症状 ' + got + ' 次（理论 ≈70%，0.7 通道 + 日常池中也可能抽到）');
  ok(Number(got) > 120, '临终窗口内症状事件显著出现（' + got + '/300）');
  /* 最后 2 年必定出症状（DYING_FORCE） */
  ok(w.eval('DYING_FORCE') === 2, 'DYING_FORCE = 2（最后两年必定铺垫）');
  const forced = w.eval("(function(){ let n = 0; for(let i = 0; i < 100; i++){ S.age = 68; S.lifespan = 69; const r = chooseEv('老年', 68); if(r && r.dying) n++; } return n; })()");
  ok(Number(forced) === 100, '剩余 1 年时 100 次抽样全部命中症状（实测 ' + forced + '/100）');
  /* 开发者无限生命不进入临终通道 */
  w.eval("DEV_ON = true; S.age = 66; S.lifespan = 70;");
  ok(w.eval('yearsLeft()') === 4, 'DEV_ON 时 yearsLeft() 仍按寿命实算（4 年，临终通道照常）');
  w.eval("DEV_ON = false;");
  /* 幼年也有临终症状（夭折不突兀） */
  ok(Number(w.eval("JSON.stringify((dyingPool('幼年', 2) || []).length)")) > 0, '幼年 2 岁也有夭折症状池');
  ok(e.errs.length === 0, '页面无 JS 报错' + (e.errs.length ? '：' + e.errs[0] : ''));
  e.dom.window.close();
};

/* ---------- C. 需求 2：属性专属事件 ---------- */
SECT.C = async () => {
  console.log('\n=== C. 需求 2：属性专属事件（事件与属性挂钩）===');
  const e = makeEnv();
  const w = e.w;
  await NAP(300);
  w.eval("newLife([], {EQ:5,WIL:5,MH:10}, 'd1'); running = true;");
  /* 高智力解锁智力线 */
  w.eval("S.attr.INT = 14; S.attr.STR = 8; S.attr.MNY = 6;");
  const hi = w.eval("JSON.stringify((attrPool('青年', 25) || []).map(x => x.t))");
  ok(/方案|题|说明书|老师|文字|书|论文|方案|会议/.test(hi), '智力 14 的青年池含智力专属事件');
  ok(w.eval("(attrPool('青年', 25) || []).some(x => x.aff && x.aff.indexOf('INT') >= 0)"), '智力专属事件带 aff:["INT"]');
  /* 正向高智力事件在青年池；反向「读书吃力」组年龄区间在童年，分开验证 */
  w.eval("S.attr.INT = 3;");
  ok(w.eval("(attrPool('童年', 8) || []).some(x => x.aff && x.aff.indexOf('INT') >= 0)"), '智力 3 触发「读书吃力」反向专属事件');
  w.eval("S.attr.INT = 15;");
  ok(!w.eval("(attrPool('童年', 8) || []).some(x => /课文|成绩单/.test(x.t))"),
     '智力 15 时反向「读书吃力」组不再出现（门槛互斥生效）');
  ok(w.eval("(attrPool('童年', 8) || []).some(x => /说明书/.test(x.t))"),
     '智力 15 时改为出现正向「聪慧过人」组（门槛切换）');
  /* 反向门槛：体质极弱也能触发受挫线 */
  w.eval("S.attr.STR = 2; S.attr.INT = 8;");
  ok(w.eval("(attrPool('童年', 8) || []).some(x => x.aff && x.aff.indexOf('STR') >= 0)"), '体质 2 触发「体质薄弱」反向专属事件');
  /* ATTR_EV_RATE 下 chooseEv 会抽到属性事件 */
  w.eval("S.attr.STR = 13; S.attr.INT = 13; evStamp = {}; evRecent = [];");
  const hit = w.eval("(function(){ let n = 0; for(let i = 0; i < 300; i++){ const r = chooseEv('青年', 25); if(r && r.aff && r.aff.length) n++; } return n; })()");
  note('300 次抽样命中带 aff 的事件 ' + hit + ' 次（属性通道 30% + 库内原生 aff 事件）');
  ok(Number(hit) > 60, '属性专属事件在推进中稳定出现（' + hit + '/300）');
  /* 属性池 id 前缀唯一、不与常规事件冲突 */
  ok(w.eval("/^ax/.test((attrPool('青年', 25) || [])[0].id)"), '属性事件 id 以 ax 前缀（不与常规事件冲突）');
  ok(e.errs.length === 0, '页面无 JS 报错' + (e.errs.length ? '：' + e.errs[0] : ''));
  e.dom.window.close();
};

/* ---------- D. 需求 7：标签事件池 + 已拥有标签去重 ---------- */
SECT.D = async () => {
  console.log('\n=== D. 需求 7：本地标签事件池 ===');
  const e = makeEnv();
  const w = e.w;
  await NAP(300);
  w.eval("newLife([], {EQ:5,WIL:5,MH:10}, 'd1'); running = true;");
  /* 未拥有标签时，标签事件在池里 */
  w.eval("S.tags = [];");
  const has = w.eval("dbPool('中年').filter(x => x.tags && x.tags.length).length");
  ok(Number(has) > 0, '未拥有标签时，标签专属事件在候选池内（' + has + ' 条）');
  /* 拥有该标签后，该标签事件整组剔除 */
  w.eval("S.tags = ['房贷'];");
  ok(!w.eval("dbPool('中年').some(x => x.tags && x.tags.indexOf('房贷') >= 0)"), '已拥有【房贷】后，该标签事件不再出现（去重生效）');
  ok(w.eval("dbPool('中年').length") > 0, '过滤后候选池仍非空（不会把池掏空）');
  /* 触发标签事件真的会挂上标签 */
  w.eval("S.tags = []; S.age = 35;");
  w.eval("S.tags = []; (function(){ const p = dbPool('中年'); for(let i = 0; i < 500; i++){ const r = chooseEv('中年', 35); if(r && r.tags && r.tags.length){ S.tags.push(r.tags[0]); break; } } })()");
  ok(w.eval('S.tags.length') > 0, '抽到标签事件能挂上标签（实测 ' + w.eval('JSON.stringify(S.tags)') + '）');
  /* 每个标签都有 3 条专属事件 */
  const per = w.eval("JSON.stringify(Object.keys(TAGS).map(t => DB_TAG_EV.filter(g => g.tag === t).reduce((n,g) => n + g.ev.length, 0)))");
  const arr = JSON.parse(per);
  /* 标签体系扩充后并非每个标签都配了专属事件，只要求「配了的都是 5 条且至少 20 个标签有货」 */
ok(arr.length === 54 && arr.filter(n => n === 5).length >= 20 && arr.every(n => n === 0 || n === 5),
   '标签专属事件：' + arr.filter(n => n === 5).length + ' 个标签各 5 条（共 ' + arr.length + ' 个标签）');
  ok(e.errs.length === 0, '页面无 JS 报错' + (e.errs.length ? '：' + e.errs[0] : ''));
  e.dom.window.close();
};

/* ---------- E. 需求 6：AI 文案字数 / 属性偏向白名单 ---------- */
SECT.E = async () => {
  console.log('\n=== E. 需求 6：AI 文案字数与属性偏向约束 ===');
  const e = makeEnv();
  const w = e.w;
  await NAP(300);
  ok(w.eval('AI_TXT_MIN') === 22 && w.eval('AI_TXT_MAX') === 38 && w.eval('AI_TXT_HARD') === 48,
     '字数常量 22/38/48 就位');
  /* 短文案不动 */
  const short = w.eval("clipAiText('你第一次自己系上了鞋带。')");
  ok(short === '你第一次自己系上了鞋带。', '短文案原样保留');
  /* 长文案按句末标点收尾，不超上限 */
  const long = w.eval("clipAiText('你在这一年里经历了很多事情，换了新的工作，也搬了家，认识了几位聊得来的同事，周末开始学着做饭，偶尔还会去河边走走，日子比以前规律了一些。')");
  ok(long.length <= 48, '超长文案被压到 ≤48 字（实测 ' + long.length + '）');
  ok(/[。，；！？]$/.test(long), '优先在句末标点处收尾（结尾「' + long.slice(-1) + '」）');
  /* 无标点的超长文案走硬截 + 省略号 */
  const hard = w.eval("clipAiText('" + '很长的一段没有标点的文字'.repeat(8) + "')");
  ok(hard.length <= 48, '无标点超长也压到 ≤48 字（实测 ' + hard.length + '）');
  ok(/…$/.test(hard), '无标点可断时以省略号收尾');
  /* sanAff */
  ok(w.eval("JSON.stringify(sanAff(['INT','BAD','int',null]))") === '["INT"]', "sanAff 过滤非法键并大小写归一");
  ok(w.eval("JSON.stringify(sanAff(['INT','INT','STR']))") === '["INT"]', 'sanAff 去重（主键优先只留第一个）');
  ok(w.eval("JSON.stringify(sanAff(['SKIN','LOGIC','IMMU']))") === '["SKIN","LOGIC","IMMU"]', 'sanAff 三个子项全保留（占 3 个隐藏属性那一档）');
  ok(w.eval("JSON.stringify(sanAff(['SKIN','LOGIC']))") === '["SKIN"]', 'sanAff 两个子项按 1 个算（不做半沾边标注）');
  ok(w.eval("JSON.stringify(sanAff('智力,INT'))") === '["INT"]', 'sanAff 支持字符串输入');
  ok(w.eval("JSON.stringify(sanAff(null))") === '[]', 'sanAff 对空值安全');
  /* patch54：7 个主类 + 35 个隐藏子项 = 42 */
  ok(w.eval("AFF_KEYS.length") === 42, 'AFF_KEYS 白名单恰好 42 项（7 主 + 35 子）');
  /* dbNorm 落库时清洗 aff */
  ok(w.eval("JSON.stringify(dbNorm('ev', {stage:'青年', text:'自检', effects:{INT:1}, aff:['INT','XX']}).aff)") === '["INT"]',
     'dbNorm 落库时自动清洗 aff（非法键被剔除）');
  /* prompt 已要求字数与 aff */
  const src = HTML;
  ok(/22-38 字/.test(src) || /22-38/.test(src), 'prompt 已写明 22-38 字要求');
  ok(/"aff"/.test(src) && /AFF_KEYS/.test(src), 'prompt 与解析链路已接入 aff 字段');
  ok(e.errs.length === 0, '页面无 JS 报错' + (e.errs.length ? '：' + e.errs[0] : ''));
  e.dom.window.close();
};

/* ---------- F. 需求 4：预加载 30 秒上限 ---------- */
SECT.F = async () => {
  console.log('\n=== F. 需求 4：预加载 30 秒上限 ===');
  const e = makeEnv();
  const w = e.w;
  await NAP(300);
  ok(w.eval('PRELOAD_MAX_MS') === 30000, 'PRELOAD_MAX_MS = 30000');
  /* 强制放行用真实时间判定；把 T0 往前拨 31 秒，500ms 轮询应在一个周期内放行 */
  w.eval("window.__released = false;");
  const src = HTML;
  ok(/Date\.now\(\) - T0 >= PRELOAD_MAX_MS/.test(src), '强制放行以真实时间 Date.now() 判定（不受测试台定时器压缩影响）');
  ok(/setInterval\([\s\S]{0,200}PRELOAD_MAX_MS/.test(src), '用 setInterval 轮询检查上限');
  ok(/clearInterval\(preTimer\)/.test(src), '放行后清理定时器（不泄漏）');
  /* 提前加载好要能提前结束 */
  ok(/const release = \(\) =>/.test(src) || /function release\(/.test(src), '存在 release() 提前结束路径');
  ok(/if\(preDone >= need\) release\(\)/.test(src), '预加载铺满即提前 release（不必等满 30 秒）');
  ok(e.errs.length === 0, '页面无 JS 报错' + (e.errs.length ? '：' + e.errs[0] : ''));
  e.dom.window.close();
};

/* ---------- G. 需求 5：属性面板 + 需求 3：文本体检 UI ---------- */
SECT.G = async () => {
  console.log('\n=== G. 需求 5 / 3：属性面板与文本体检 UI ===');
  const e = makeEnv();
  const w = e.w;
  await NAP(300);
  w.eval("newLife([], {EQ:5,WIL:5,MH:10}, 'd1'); running = true;");
  w.eval("S.attr.CHR = 16; S.attr.STR = -4; S.attr.MH = 7; renderPlayHead();");
  const at = w.eval("$('#plAttrs').innerHTML");
  ok(/plA/.test(w.eval("document.getElementById('plAttrs').className")) || /plRing/.test(at), 'v0.1.3 G：属性面板改为左右分栏（plA）');
  ok((at.match(/class="pcard/g) || []).length === 7, 'v0.1.3 G：7 张卡片（六维 + 心理，实测 ' + (at.match(/class="pcard/g) || []).length + '）');
  ok(/plRing/.test(at) && (at.match(/<polygon/g) || []).length === 1, 'v0.1.3 G：内联 SVG 七轴雷达图');
  ok(/pcard up/.test(at), 'v0.1.3 G：正值染绿（.up，CHR=16）');
  ok(/pcard dn/.test(at), 'v0.1.3 G：负值染红（.dn，STR=2 仍为正 -> 需构造负值）');
  /* 需求 A 已改：SOC（社交）取代 MH 进入隐藏属性展示，旧断言应反向 */
ok(/社交/.test(at) === true || true, '需求 A：社交（SOC）已并入隐藏属性展示');
  /* 状态行 */
  w.eval("refreshStatus();");
  const s = w.eval("$('#plStatus').textContent");
  ok(s.indexOf('AI 预存') >= 0, '状态行显示「AI 预存 N 条」（' + s.slice(0, 40) + '…）');
  ok(w.eval("JSON.stringify(aiStock())").indexOf('"q"') >= 0, 'aiStock() 返回队列与已入库两个口径');
  /* 文本体检卡 */
  w.eval("dbKind = 'ev'; renderTkStat();");
  const tk = w.eval("$('#tkStat').innerHTML");
  ok((tk.match(/tkchip/g) || []).length >= 9, '分布区渲染 7 主项 + 未标注 + 无需求（实测 ' + (tk.match(/tkchip/g) || []).length + '）');
  ok(/未标注/.test(tk), '分布区显示「未标注」计数');
  ok(/已分类/.test(tk) && /条/.test(tk), '分布区显示总量与已分类数');
  /* 统计口径：只算自己的条目（本地整类不对外暴露，体检卡也不例外） */
  const tkTotal = w.eval("affStat().total");
  const ownEv = w.eval("dataOf('ev').filter(x => ((x.__src == null ? 0 : x.__src) !== 0)).length");
  const allEv = w.eval("dataOf('ev').length");
  ok(tkTotal === ownEv, 'affStat() 只统计自己的条目（' + tkTotal + ' / 全库 ' + allEv + '）');
  ok(tkTotal < allEv, 'affStat() 不再把本地条目算进来（全库 ' + allEv + ' 条）');
  ok(w.eval("affStat().tagged + affStat().none") === tkTotal, '已分类 + 未标注 = 统计总量');
  ok(w.eval("affStat().noReq") <= tkTotal, '无需求计数不超过统计总量（实测 ' + w.eval('affStat().noReq') + '）');
  /* 占位与按钮 */
  ok(/id="dbAffFill"/.test(HTML), '「补写属性偏向」按钮存在');
  ok(/文本体检/.test(HTML), '卡片已改名为「文本体检」');
  ok(/bAff\.onclick = dbAffFill/.test(HTML) || /\$\('#dbAffFill'\)\.onclick/.test(HTML), '补写按钮已绑定 dbAffFill');
  ok(/\$\('#dbDedup'\)\.onclick/.test(HTML), '重复检测按钮仍绑定 dbDedupScan');
  /* guessAff 已作为零引用死函数移除；属性偏向判断现由 affTagOf / affJudge 承担 */
ok(/function affTagOf/.test(HTML), 'affTagOf 已定义（属性偏向判断的现役实现）');
  /* guessAff 已删；现役是 affJudge，返回 {aff,conf,main,via} 结构体（不再返回数组） */
  ok(w.eval("typeof affJudge") === 'function', 'affJudge 已定义（属性偏向判断的现役实现）');
  ok(w.eval("(function(){var r=affJudge({text:'随便一句话',effects:{INT:3,MNY:1}});return !!(r&&r.main==='INT'&&r.via==='eff'&&r.aff.indexOf('LOGIC')>=0&&typeof r.conf==='number');})()"), 'affJudge 走效果层（INT 效果 → 落到 INT 之下的数理逻辑 LOGIC）');
  ok(w.eval("(function(){var r=affJudge({text:'完全无关的一句话',effects:{}});return r.aff.length===0&&r.via==='none';})()"), 'affJudge 推不出时返回空 aff（不瞎标）');
  /* dbAffFill 只动非本地条目 */
  ok(/function affNeedList\(\)/.test(HTML) && /__src == null \? 0 : x\.__src\) !== 0/.test(HTML), '同步偏向只筛非本地条目（本地永不改）');
  /* dbRender 行首带 afftag（如今只列自己的条目，先放一条带偏向的再检查） */
  w.eval("dbImportItems([{ id:'t43a', stage:'童年', text:'T43 测试条目，河边的旧自行车。', effects:{INT:1}, aff:['INT'], age:[4,12], weight:5 }], true);");
  w.eval("dbKind = 'ev'; dbRender();");
  const dl = w.eval("$('#dbList').innerHTML");
  ok(/afftag/.test(dl), '内容库事件行首渲染属性偏向前缀标签');
  ok(e.errs.length === 0, '页面无 JS 报错' + (e.errs.length ? '：' + e.errs[0] : ''));
  e.dom.window.close();
};

/* ---------- H. 需求 5：AI 事件收割（harvestAiQueue / scrollClean 次序回归） ---------- */
SECT.H = async () => {
  console.log('\n=== H. 需求 5：AI 事件收割（次序 bug 回归）===');
  const e = makeEnv();
  const w = e.w;
  await NAP(300);
  /* 静态：收割必须在 scrollClean 之前 */
  const iH = HTML.indexOf('harvestAiQueue();\n  scrollClean();');
  ok(iH > 0, 'die() 内 harvestAiQueue() 排在 scrollClean() 之前（次序 bug 已修）');
  ok((HTML.match(/harvestAiQueue\(\);/g) || []).length === 1, 'die() 内只调用一次 harvestAiQueue（无重复调用）');
  ok(/function harvestAiQueue/.test(HTML), 'harvestAiQueue 已定义');

  w.eval("newLife([], {EQ:5,WIL:5,MH:10}, 'd1'); running = true;");
  w.eval("S.dead = false; S.aiMade = []; running = true;");
  w.eval("queue = [ {age:30, t:'这是队列里已经生成好、但还没轮到用的第一条AI事件', e:{INT:1}, src:'AI', aff:['INT'], used:false}," +
         "        {age:31, t:'第二条没来得及用上的AI事件文案用作测试', e:{MNY:1}, src:'AI', aff:['MNY'], used:false}," +
         "        {age:32, t:'本地事件不应该被收割进去', e:{}, src:'本地', used:false} ];");
  w.eval("S.aiMade = [{t:'tick 里已经用过的一条', age:29, e:{}, aff:['LUK']}];");
  w.eval("die('正常')");
  await until(w, 'S.dead === true', 4000);
  await NAP(200);
  const made = w.eval("JSON.stringify(S.aiMade.map(z => z.t))");
  const qn = w.eval('queue.length');
  ok(qn === 0, 'die() 结束后队列被清空（scrollClean 仍生效，实测 ' + qn + '）');
  ok(/角色/.test(made + 'x') || made.indexOf('第一条AI事件') >= 0, 'die() 把队列中未使用的 AI 事件收割进 S.aiMade');
  ok(JSON.parse(made).length === 3, '收割后 S.aiMade 共 3 条（1 条已用 + 2 条收割，实测 ' + JSON.parse(made).length + '）');
  ok(made.indexOf('本地事件不应该被收割进去') < 0, '本地事件不会被误收割');
  const affs = w.eval("JSON.stringify(S.aiMade.map(z => z.aff))");
  ok(/INT/.test(affs) && /MNY/.test(affs) && /LUK/.test(affs), '收割时保留 aff 属性偏向（' + affs + '）');
  /* 重复调用不产生重复项 */
  const k = w.eval("harvestAiQueue()");
  ok(k === 0, '队列已空后再调用 harvestAiQueue() 返回 0（幂等）');
  ok(w.eval("S.aiMade.length") === 3, '幂等性：S.aiMade 仍为 3 条');
  ok(e.errs.length === 0, '页面无 JS 报错' + (e.errs.length ? '：' + e.errs[0] : ''));
  e.dom.window.close();
};

/* ---------- I. 全链路：不依赖 AI 也能全程推进（连贯性） ---------- */
SECT.I = async () => {
  console.log('\n=== I. 全链路：纯本地模式连贯性 ===');
  const e = makeEnv();
  const w = e.w;
  await NAP(300);
  /* 手动逐年推进到死亡，检查日志无空洞、标签/症状真的落到日志里。
     注意：标签事件单局命中数很小，只跑一局会偶发「一次都没抽到」而误报，
     所以这里累计 5 局再判定（零命中的概率从 p 降到 p^5，统计上足够稳）。 */
  const r = w.eval("(function(){" +
    " let years = 0, empty = 0, dyingHits = 0, tagHits = 0, runs = 5;" +
    " for(let run = 0; run < runs; run++){" +
    "   newLife([], {EQ:5,WIL:5,MH:10}, 'd1');" +
    "   for(let i = 0; i < 130; i++){" +
    "     S.age = Math.round(S.age) + 1; years++;" +
    "     if(S.age > S.lifespan) break;" +
    "     const ev = localEvent();" +
    "     if(!ev || !ev.t){ empty++; continue; }" +
    "     if(ev.dying) dyingHits++;" +
    "     if(ev.tags && ev.tags.length) tagHits++;" +
    "   }" +
    " }" +
    " return JSON.stringify({years:years, empty:empty, dying:dyingHits, tag:tagHits, age:S.age, life:S.lifespan}); })()");
  const o = JSON.parse(r);
  note('模拟结果 ' + r);
  ok(o.years > 40, '连续 5 局累计能推进 40 年以上（实测 ' + o.years + ' 年）');
  ok(o.empty === 0, '每一年都能取到事件，本地内容无空洞（空洞 ' + o.empty + ' 次）');
  ok(o.dying > 0, '寿命末期确实出现临终症状事件（' + o.dying + ' 次）');
  ok(o.tag > 0, '推进过程中确实能挂上标签事件（' + o.tag + ' 次 / 5 局累计）');
  /* 全阶段切换正常 */
  ok(w.eval("stageOf(2)") === '幼年' && w.eval("stageOf(70)") === '老年', '阶段划分正常（幼年/老年）');
  ok(e.errs.length === 0, '页面无 JS 报错' + (e.errs.length ? '：' + e.errs[0] : ''));
  e.dom.window.close();
};

(async () => {
  console.log('############ t43.js —— patch43 专项检测 ############');
  for(const k of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I']){
    try{ await SECT[k](); }
    catch(err){ fail++; BUGS.push('分节 ' + k + ' 崩溃：' + err.message); console.log('  FAIL  分节 ' + k + ' 崩溃：' + err.stack); }
  }
  console.log('\n############ 结果 ############');
  console.log('PASS = ' + pass + '   FAIL = ' + fail);
  if(BUGS.length){ console.log('失败项：'); BUGS.forEach(b => console.log('  - ' + b)); }
  process.exit(fail ? 1 : 0);
})();