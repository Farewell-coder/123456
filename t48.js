/* t48.js —— patch48 专项检测台（jsdom + 静态，不动真机）
   覆盖用户四条需求：
     1 加号「一直加、减不下来」→ 连加失控（bindStep 定时器 + addPoint 返回布尔）
     2 隐藏属性不在技能点（加点页）显示
     3 主界面「历史战绩」按钮 + 每局战绩落库 + 战绩页
     4 内容库第 6 类「墓志铭」+ 本地墓志铭按结局配 + AI 墓志铭入库
     5 所有展开项默认收起
   特色：需求1 用「模拟长按 600ms 后松手」的真实时序做回归 —— 这是真机上会踩的那条路径。 */
'use strict';
const fs = require('fs');
const { JSDOM } = require('/root/testenv/node_modules/jsdom');

const ROOT = '/root/appbuild/LifeRestart';
const P = ROOT + '/app/src/main/assets/index.html';
const HTML = require('./loadjs.js').loadFullHtml();
const JS = require('./loadjs.js').loadGameJs();

let pass = 0, fail = 0;
const BUGS = [];
function ok(c, m){ if(c){ pass++; console.log('  PASS  ' + m); } else { fail++; console.log('  FAIL  ' + m); BUGS.push(m); } }

/* ============ A. 静态：内容库第 6 类 + 主菜单按钮 ============ */
console.log('\n=== A. 静态结构 ===');
ok(HTML.indexOf("const DBX_KINDS = {ev:'事件', tal:'天赋', ach:'成就', end:'结局', tag:'标签', epitaph:'墓志铭'};") >= 0,
   'DBX_KINDS 已加 epitaph（墓志铭）');
ok(/function dbxDefault\(\)\{ return \{ev:\[\], tal:\[\], ach:\[\], end:\[\], tag:\[\], epitaph:\[\]\}; \}/.test(HTML),
   'dbxDefault 已含 epitaph');
ok(/function builtinEpitaph\(\)\{/.test(HTML), 'builtinEpitaph() 已定义');
ok(/function epitaphFor\(ending, rank, tags, age\)\{/.test(HTML), 'epitaphFor() 已定义（按结局挑墓志铭）');
ok(HTML.indexOf("epitaph: {t:'墓志铭',") >= 0, 'DB_FIELDS 已加墓志铭字段说明');
ok(HTML.indexOf('<button data-t="epitaph">墓志铭</button>') >= 0, '数据管理页已有「墓志铭」分类按钮');
/* 主菜单按钮与顺序 */
ok(/<button class="mbtn" id="mRec">历史战绩<\/button>/.test(HTML), '主菜单有「历史战绩」按钮');
{
  const iMenu = HTML.indexOf('class="menu-list"');
  const seg = HTML.slice(iMenu, HTML.indexOf('</section>', iMenu));
  const o = ['mCont', 'mStart', 'mDex', 'mRec', 'mSet'].map(id => seg.indexOf('id="' + id + '"'));
  ok(o.every(v => v >= 0) && o[0] < o[1] && o[1] < o[2] && o[2] < o[3] && o[3] < o[4],
     '按钮顺序：继续 / 开始 / 图鉴 / 历史战绩 / 设置');
  ok(o[2] < o[3] && o[3] < o[4], '「历史战绩」在「图鉴 / 成就」与「设 置」中间 ✔');
}
/* 战绩页 */
ok(/<section class="screen" id="scRec">/.test(HTML), '战绩页 #scRec 已建');
ok(/REC:'#scRec'/.test(HTML), 'SCREENS 已注册 REC');
ok(/if\(s === 'REC'\) renderRec\(\);/.test(HTML), 'goState 会渲染战绩页');
ok(/const SAVE_REC = 'lr_records';/.test(HTML) && /const REC_MAX = 5;/.test(HTML),
   '战绩存储键 lr_records / 上限 5 条（v0.1.1 收紧，列表只留最近 5 局）');
ok(/function pushRec\(rec\)\{/.test(HTML), 'pushRec() 已定义');
ok(/#scRec \.rccard\{/.test(HTML), '战绩卡样式已补');
/* 需求2：加点页只用 ATTRS */
{
  const iRows = HTML.indexOf('function renderAttr()');
  const seg = HTML.slice(iRows, HTML.indexOf('function addPoint('));
  ok(seg.indexOf('HIDDEN') < 0, 'renderAttr 内已完全不出现 HIDDEN（加点页不再列隐藏属性）');
  ok(/ATTRS\.forEach\(a => \{\s*\n\s*const v = alloc\.pts\[a\.k\]/.test(seg),
     '加点行只遍历 ATTRS（基础六维）');
  /* 但数据层该保留的还得在 */
  const iSetDiff = HTML.indexOf('function setDiff(');
  const segSD = HTML.slice(iSetDiff, HTML.indexOf('function renderAttr()'));
  ok(segSD.indexOf('ATTRS.concat(HIDDEN).forEach(a => alloc.pts[a.k] = 0);') >= 0,
     'setDiff 仍照常初始化隐藏属性（数据层没被砍）');
  ok(HTML.indexOf('const ALLA = ATTRS.concat(HIDDEN);') >= 0, 'ALLA 常量未受影响');
}
/* 需求1：addPoint 返回布尔 + 模块级定时器 */
ok(/function addPoint\(k\)\{[\s\S]{0,600}?return true;/.test(HTML), 'addPoint 返回布尔值');
ok(/if\(v >= Math\.min\(cur\.cap, ATTR_VMAX\)\) return false;/.test(HTML), '到上限返回 false（上限＝min(难度上限, 主属性硬顶 30)）');
ok(/if\(!DEV_ON && alloc\.pool < c\) return false;/.test(HTML), '点数不够返回 false');
ok(/let stepHold = null, stepRep = null;/.test(HTML), '连加定时器改为模块级（不再随 DOM 重建丢失）');
ok(/function stopStep\(\)\{/.test(HTML), 'stopStep() 统一清定时器');
ok(/function renderAttr\(\)\{\s*\n\s*stopStep\(\);/.test(HTML), 'renderAttr 开头先掐连加循环');
/* 需求5：默认收起 */
ok(/v === undefined \? true : !!v/.test(HTML), 'foldApply 默认收起');
ok(HTML.indexOf('let dbFold = {0:1, 1:1, 2:1};') >= 0, '来源卡默认收起');
/* 结算接入 */
ok(/const epiPick = epitaphFor\(rk, rk0, S\.tags, Math\.round\(S\.age\)\);/.test(HTML),
   'openSummary 按本局结局挑墓志铭');
ok(/pushRec\(rec\);/.test(HTML), '结算时写入战绩');
ok(/o\.list\[recIdx\]\.epitaph = aiEpi;/.test(HTML), 'AI 墓志铭会回填进战绩快照');
ok(/it\.origin = 'ai'; dataPut\('epitaph', it\);/.test(HTML), 'AI 墓志铭以「AI 加入」入库');

(async () => {
  /* ============ B. jsdom 动态 ============ */
  console.log('\n=== B. 动态验证（jsdom） ===');
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
      /* 这里刻意「不压缩」长任务：需求1 要的就是真实 420ms / 110ms 时序。
         但仍把 >=5000ms 的压短，避免其它定时器拖慢测试。 */
      w.setTimeout = function(fn, ms){
        const a = Array.prototype.slice.call(arguments, 2);
        if(typeof ms === 'number' && ms >= 5000) ms = 60;
        return rawST.apply(null, [fn, ms].concat(a));
      };
    }
  });
  const w = dom.window;
  const NAP = ms => new Promise(r => setTimeout(r, ms));
  ok(errs.length === 0, '脚本无运行时错误（' + errs.slice(0, 2).join(' | ') + '）');

  /* ---- 需求2：加点页只列 6 行 ---- */
  w.eval("setDiff('d1'); goState('ATTR_ALLOC');");
  const rows = w.eval("document.querySelectorAll('#atRows .arow').length");
  ok(rows === 6, '加点页只渲染 6 行（基础六维，实测 ' + rows + '）');
  const nameTxt = w.eval("Array.prototype.map.call(document.querySelectorAll('#atRows .an'), e => e.textContent).join(',')");
  ok(nameTxt === '颜值,智力,体质,家境,幸运,快乐', '加点页属性名 = ' + nameTxt);
  ['情商', '意志力', '心理健康', '社会影响力'].forEach(nm => {
    ok(nameTxt.indexOf(nm) < 0, '加点页不含隐藏属性「' + nm + '」');
  });
  /* 该提示位已整段移除（恒为空串的死元素），断言改为「不存在或为空」——语义不变 */
  ok(w.eval("(function(){ var e = $('#atBase'); return !e || e.textContent === ''; })()") === true,
     '剩余点数右侧不再点名隐藏属性的基础值（实测「' + w.eval("(function(){ var e = $('#atBase'); return e ? e.textContent : '(元素已移除)'; })()") + '」）');
  const passTxt = w.eval("$('#atPass').textContent");
  ['人情练达', '铁石心肠', '心宽体胖'].forEach(nm => {
    ok(passTxt.indexOf(nm) < 0, '被动区不含隐藏属性被动「' + nm + '」');
  });
  /* 数据层没被砍掉：隐藏属性仍照常初始化 */
  ok(w.eval("alloc.pts.EQ") === 5 && w.eval("alloc.pts.WIL") === 5 && w.eval("alloc.pts.MH") === 10,
     '隐藏属性出生基础值仍在数据层（EQ5 / WIL5 / MH10）—— 只是不显示');

  /* ---- 需求1：长按连加不会失控 ---- */
  console.log('  -- 需求1：连加时序回归 --');
  w.eval("setDiff('d1'); goState('ATTR_ALLOC');");
  const cap = w.eval("DIFFS.find(x => x.id === alloc.diff).cap");
  /* 模拟真实长按：touchstart → 持续 700ms（超过 420 触发阈值）→ touchend */
  w.eval(`(function(){
    var b = document.querySelector('#atRows .astep:not(.minus)');
    b.dispatchEvent(new MouseEvent('mousedown', {bubbles:true}));
  })()`);
  await NAP(700);
  w.eval(`(function(){
    var b = document.querySelector('#atRows .astep:not(.minus)');
    b.dispatchEvent(new MouseEvent('mouseup', {bubbles:true}));
  })()`);
  const afterHold = w.eval("alloc.pts.CHR || 0");
  ok(afterHold > 1, '长按 700ms 确实连加了（CHR = ' + afterHold + '）');
  /* 关键：松手后再等 800ms，点数不该继续涨 */
  await NAP(800);
  const afterRelease = w.eval("alloc.pts.CHR || 0");
  ok(afterRelease === afterHold, '松手后不再继续加（' + afterHold + ' → ' + afterRelease + '）✔ 这就是原来的 bug');
  /* 点数池没被扣成负数 */
  ok(w.eval('alloc.pool') >= 0, '点数池没有被扣成负数（pool = ' + w.eval('alloc.pool') + '）');
  /* 到上限必须自己停 */
  w.eval("alloc.pool = 9999; for(let i=0;i<200;i++) addPoint('INT');");
  ok(w.eval("alloc.pts.INT") === cap, '强行连加 200 次也封顶在 ' + cap + '（实测 ' + w.eval('alloc.pts.INT') + '）');
  ok(w.eval("addPoint('INT')") === false, '已达上限时 addPoint 返回 false（连加据此停手）');
  /* 点减号能真的减下来（原来「减不下来」） */
  const before = w.eval("alloc.pts.INT");
  w.eval("undoPoint('INT')");
  ok(w.eval("alloc.pts.INT") === before - 1, '在满值时点「−」能减下来（' + before + ' → ' + w.eval('alloc.pts.INT') + '）✔');
  ok(w.eval("undoPoint('INT')") === true, 'undoPoint 成功时返回 true');
  /* 把点数用光后，连加必须自动停 */
  w.eval("setDiff('d1'); goState('ATTR_ALLOC');");
  w.eval(`(function(){
    var b = document.querySelectorAll('#atRows .astep:not(.minus)')[1];
    b.dispatchEvent(new MouseEvent('mousedown', {bubbles:true}));
  })()`);
  await NAP(2500);                       // 远超 420 + 多点 110，点数早该耗尽
  w.eval(`(function(){
    var b = document.querySelectorAll('#atRows .astep:not(.minus)')[1];
    b.dispatchEvent(new MouseEvent('mouseup', {bubbles:true}));
  })()`);
  await NAP(400);
  const spentNow = w.eval('alloc.pool');
  const ptsNow = w.eval("alloc.pts.INT || 0");
  ok(spentNow >= 0, '点数耗尽后 pool 仍 ≥ 0（' + spentNow + '）');
  ok(ptsNow > 0, '点数已成功花出去（INT = ' + ptsNow + '，pool = ' + spentNow + '）');
  await NAP(600);
  ok(w.eval("(alloc.pts.INT || 0)") === ptsNow, '点数用尽后连加自动停了，不再空转（仍是 ' + ptsNow + '）✔');

  /* ---- 需求3：战绩落库 + 战绩页 ---- */
  console.log('  -- 需求3：历史战绩 --');
  let r0 = w.eval("getRecs().list.length");
  ok(r0 === 0, '初始没有战绩（' + r0 + ' 条）');
  w.eval("goState('REC')");
  ok(w.eval("$('#scRec').classList.contains('on')"), '战绩页可打开');
  ok(/还没有打完过任何一局/.test(w.eval("$('#rcList').innerHTML")), '空战绩有引导文案');
  /* 手动推两条，验证渲染与上限 */
  w.eval(`pushRec({at: Date.now(), age: 88, sc: 200, rank: 'SSS', ending: '长寿老人', tags: ['已婚','恩爱'], epitaph: '他活得很久。'})`);
  w.eval(`pushRec({at: Date.now(), age: 30, sc: 40, rank: 'D', ending: '早衰', tags: [], epitaph: '走得太早。'})`);
  ok(w.eval("getRecs().list.length") === 2, '战绩已落库 2 条');
  w.eval("renderRec()");
  const rcHtml = w.eval("$('#rcList').innerHTML");
  ok(rcHtml.indexOf('长寿老人') >= 0 && rcHtml.indexOf('早衰') >= 0, '战绩页渲染出结局称号');
  ok(rcHtml.indexOf('享年 88 岁') >= 0 && rcHtml.indexOf('享年 30 岁') >= 0, '战绩页渲染出享年');
  ok(rcHtml.indexOf('他活得很久。') >= 0, '战绩页渲染出墓志铭（含 AI 版）');
  ok(rcHtml.indexOf('已婚') >= 0 && rcHtml.indexOf('恩爱') >= 0, '战绩页渲染出人生标签');
  ok(w.eval("$('#rcSub').textContent") === '共 2 场', '副标题显示场次');
  /* 上限 5 */
  w.eval("for(let i=0;i<30;i++) pushRec({at: Date.now(), age: i, sc: i, rank: 'B', ending: '', tags: [], epitaph: ''});");
  ok(w.eval("getRecs().list.length") === 5, '超出上限只保留最近 5 条');
  /* 与继续按钮不冲突 */
  w.eval("localStorage.removeItem('lr_hist_0.1.1'); goState('MAIN_MENU');");
  ok(w.eval("$('#mCont').classList.contains('hide')") === true, '无存档时「继续游戏」隐藏');
  ok(w.eval("$('#mRec').classList.contains('hide')") === false, '无存档时「历史战绩」照常显示（不冲突）✔');
  w.eval("newLife([], {EQ:5,WIL:5,MH:10}, 'd1'); S.age=20; running=false; saveHist(); goState('MAIN_MENU');");
  ok(w.eval("$('#mCont').classList.contains('hide')") === false, '有存档时「继续游戏」显示');
  ok(w.eval("$('#mRec').classList.contains('hide')") === false, '有存档时「历史战绩」仍显示');
  w.eval("$('#mRec').onclick()");
  ok(w.eval("$('#scRec').classList.contains('on')"), '点「历史战绩」能进入战绩页');

  /* ---- 需求4：墓志铭库 ---- */
  console.log('  -- 需求4：墓志铭库 --');
  const epAll = JSON.parse(w.eval("JSON.stringify(dataOf('epitaph'))"));
  ok(epAll.length === 25, '本地内置墓志铭 25 条（17 专属结局 + 7 评级 + 1 通用，实测 ' + epAll.length + '）');
  ok(epAll.every(x => x.__src === 0), '内置墓志铭全为「本地」来源（只读、不进备份）');
  ok(epAll.every(x => x.text && x.text.length >= 10), '每条都有正文（最短 ' + Math.min.apply(null, epAll.map(x => x.text.length)) + ' 字）');
  /* 17 条专属结局全覆盖 */
  const ENDS = JSON.parse(w.eval("JSON.stringify(DB_ENDINGS.map(e => e.n))"));
  const epTags = epAll.map(x => x.tag);
  const missEnd = ENDS.filter(n => epTags.indexOf(n) < 0);
  ok(missEnd.length === 0, '17 条专属结局全都配了墓志铭' + (missEnd.length ? '（缺 ' + missEnd.join(',') + '）' : ''));
  /* 7 档评级全覆盖 */
  ['SSS', 'S', 'A', 'B', 'C', 'D', 'E'].forEach(r => {
    ok(epTags.indexOf(r) >= 0, '评级 ' + r + ' 已配墓志铭');
  });
  ok(epTags.indexOf('通用') >= 0, '有一条「通用」兜底墓志铭');
  /* epitaphFor 匹配：专属结局优先 */
  for(let t = 0; t < 6; t++){
    const got = w.eval("(function(){var e = epitaphFor('天妒英才', 'D', [], 30); return e ? e.tag : '';})()");
    ok(got === '天妒英才', '按结局「天妒英才」精确匹配（第 ' + (t + 1) + ' 次 · 得到 ' + got + '）');
  }
  {
    const got = w.eval("(function(){var e = epitaphFor('', 'SSS', [], 100); return e ? e.tag : '';})()");
    ok(got === 'SSS', '无专属结局时退到评级匹配（得到 ' + got + '）');
  }
  {
    let bad = '';
    for(let i = 0; i < 20; i++){
      const got = w.eval("(function(){var e = epitaphFor('不存在的结局', '不存在的评级', [], 50); return e ? e.tag : '';})()");
      if(got !== '通用'){ bad = got; break; }
    }
    ok(!bad, '什么都不匹配时稳定退到「通用」兜底（连测 20 次）' + (bad ? '（有一次得到 ' + bad + '）' : ''));
  }
  /* 自定义/AI 条目优先级更高 */
  w.eval("(function(){ var d = dbxGet(); d.epitaph = []; dbxSet(); })()");
  w.eval(`dataPut('epitaph', dbNorm('epitaph', {text:'这是我为天妒英才写的专属墓志铭文案，用来验证优先级。', tag:'天妒英才', origin:'ai'}))`);
  {
    const got = w.eval("(function(){var e = epitaphFor('天妒英才', 'D', [], 30); return (e.__src === 2 && e.text.indexOf('验证优先级') >= 0) ? 'AI' : ('其他:' + (e ? e.tag : 'null'));})()");
    ok(got === 'AI', '「AI 加入」的墓志铭优先于本地内置被抽中 ✔（得到 ' + got + '）');
  }
  ok(w.eval("dataOf('epitaph').length") === 26, '入库后墓志铭总数 25 → 26');
  /* 六类可读 */
  ok(w.eval("Object.keys(DBX_KINDS).length") === 6, '内容库共 6 类');
  ok(w.eval("dataOf('epitaph').filter(x => x.__src === 2).length") === 1, '其中「AI 加入」1 条');
  /* 导入归一化 */
  ok(w.eval("(function(){var v = dbNorm('epitaph', {text:'导入测试用的一句墓志铭正文。', tag:'A'}); return v && v.text === '导入测试用的一句墓志铭正文。' && v.tag === 'A';})()"),
     'dbNorm(epitaph) 能归一化导入条目');
  ok(w.eval("dbNorm('epitaph', {tag:'A'})") === null, '墓志铭缺正文时拒绝导入');
  /* 数据管理页能切到墓志铭分类 */
  w.eval("openDbPage('epitaph'); dbRender();");
  ok(/墓志铭/.test(w.eval("$('#dbCnt').textContent")), '数据管理页能切到墓志铭分类（' + w.eval("$('#dbCnt').textContent") + '）');

  /* ---- 需求5：默认收起 ---- */
  console.log('  -- 需求5：折叠默认收起 --');
  w.eval("localStorage.removeItem('lr_fold'); openSet();");
  const setCards = w.eval("document.querySelectorAll('#modal .card[data-ck]').length");
  const setFolded = w.eval("[].filter.call(document.querySelectorAll('#modal .card[data-ck]'), c => c.classList.contains('fold')).length");
  ok(setCards >= 4 && setFolded === setCards, '设置面板 ' + setFolded + '/' + setCards + ' 张卡默认全收起');
  w.eval("document.querySelectorAll('#modal .card[data-ck]')[0].querySelector('.chead').dispatchEvent(new MouseEvent('click',{bubbles:true}))");
  ok(w.eval("!document.querySelectorAll('#modal .card[data-ck]')[0].classList.contains('fold')"), '手动点开第一张卡（可展开）');
  w.eval("closeSet(); localStorage.removeItem('lr_fold'); openDbPage('ev');");
  w.eval("document.querySelectorAll('#dbPage .card[data-ck]').forEach(c => c.classList.remove('fold')); localStorage.removeItem('lr_fold'); closeDbPage(); openDbPage('ev');");
  const dbFolded = w.eval("[].filter.call(document.querySelectorAll('#dbPage .card[data-ck]'), c => c.classList.contains('fold')).length");
  ok(dbFolded === 3, '数据管理页 3 张卡默认全收起（实测 ' + dbFolded + '）');
  /* 来源卡：默认只列「外部 / AI」两张（本地条目已隐藏）。
     必须切到有数据的 ev 分类 —— 墓志铭分类里外部/AI 都为空会走空态分支，卡片数为 0。 */
  w.eval("dbKind = 'ev'; dbRender();");
  w.eval("dbImportItems([{ id:'t48a', stage:'童年', text:'T48 导入测试事件，巷口的那棵老槐树。', effects:{}, age:[4,12], weight:5 }], true);");
  w.eval("dbRender();");
  const dbSub = w.eval("[].filter.call(document.querySelectorAll('#dbList .dbcard'), c => c.classList.contains('fold')).length");
  const dbSubN = w.eval("document.querySelectorAll('#dbList .dbcard').length");
  ok(dbSubN === 2 && dbSub === 2, '数据管理页来源卡只有导入/AI 两张且全收起（实测 ' + dbSub + '/' + dbSubN + '）');
  /* 本地卡已整类移除：任何情况下都不会冒出第三张来源卡 */
  const dbSrc0 = w.eval("document.querySelectorAll('#dbList .dbcard[data-src=\"0\"]').length");
  ok(dbSrc0 === 0, '本地来源卡不出现（实测 ' + dbSrc0 + '）');

  /* ---- UI 不冲突 ---- */
  console.log('  -- UI 冲突自检 --');
  {
    const idsAll = (HTML.match(/id="[A-Za-z0-9_]+"/g) || []);
    const dup = idsAll.filter((x, i) => idsAll.indexOf(x) !== i);
    /* 静态模板里的 dlgIIn/dlgIOk/dlgICancel 只在弹窗时才写进容器，静态重复属预期 */
    const TPL = ['dlgIIn', 'dlgIOk', 'dlgICancel'];
    const badDup = dup.filter(x => TPL.indexOf(x.replace(/^id="|"$/g, '')) < 0);
    ok(badDup.length === 0, '全页 id 无重复（模板 id 除外）' + (badDup.length ? '（' + [...new Set(badDup)].join(',') + '）' : ''));
    const live = w.eval("(function(){var a=[].map.call(document.querySelectorAll('[id]'), e=>e.id);var d=a.filter((x,i)=>a.indexOf(x)!==i);return JSON.stringify(d);})()");
    ok(live === '[]', '运行时 DOM 无重复 id（' + live + '）');
  }
  ok(errs.length === 0, '全程无运行时错误（' + errs.length + '）');

  /* ---------- 汇总 ---------- */
  console.log('\n----------------------------------------');
  console.log('t48 结果：' + pass + ' PASS / ' + fail + ' FAIL');
  if(fail){ console.log('失败项：'); BUGS.forEach(b => console.log('  - ' + b)); }
  w.close();
  process.exit(fail ? 1 : 0);
})();
