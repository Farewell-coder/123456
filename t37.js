/* t37.js —— 关于页 + 隐藏调试面板 + 诊断 zip 的端到端自检 */
'use strict';
const fs = require('fs');

let pass = 0, fail = 0;
function ok(c, m){ if(c){ pass++; console.log('  PASS  ' + m); } else { fail++; console.log('  FAIL  ' + m); } }

/* ---------- 极简 DOM 打桩（按选择器缓存元素，便于取回并触发事件） ---------- */
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
    setAttribute(k, v){ this['_at_' + k] = v; }, getAttribute(k){ return this['_at_' + k] === undefined ? null : this['_at_' + k]; },
    removeAttribute(){}, appendChild(c){ return c; }, removeChild(){}, insertBefore(){},
    addEventListener(){}, removeEventListener(){},
    querySelector(){ return null; }, querySelectorAll(){ return []; },
    closest(){ return null; }, focus(){}, blur(){}, click(){}, select(){}, remove(){},
    getBoundingClientRect(){ return { top:0, left:0, width:0, height:0 }; },
    scrollTo(){}, getContext(){ return null; }
  };
  Object.defineProperty(e, 'classList', { get(){ return e._cls; } });
  return e;
}
const ELS = {};
const el = sel => (ELS[sel] || (ELS[sel] = stubEl()));
/* 预建测试要用到的元素，保证与游戏代码取到的是同一个对象 */
['#cardAbout','#btnBackSet','#aboutPage','#abVer','#abBack','#dbgPage','#dbgBody','#dbgLog',
 '#dbgRefresh','#dbgCopy','#dbgZip','#dgFails','#dgQueue','#dgLocal','#dgLog','#dgClick','#dgState','#dgNow',
 '#dgDevRow','#dgDev','#dgDevActs','#dgEndLife','#dgAchAll','#dgAchClear','#dlg','#dlgA','#dlgT','#dlgD','#dlgI',
 '#dlgIOk','#dlgICancel','#dlgIIn','#atPool','#atSub','#atRows','#atPass','#diffRow','#toast']
  .forEach(s => el(s));
/* 还原 HTML 初始类：输入弹窗默认是隐藏的（hide） */
el('#dlgI').classList.add('hide');
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
  scrollTo(){}, scrollBy(){}, requestAnimationFrame: cb => setTimeout(cb, 0),
  innerWidth: 420, innerHeight: 900, devicePixelRatio: 1,
  getComputedStyle: () => ({ getPropertyValue: () => '' }),
  location: { href:'file:///index.html', reload(){} },
  setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {},
  alert(){}, confirm: () => true, prompt: () => ''
};
const store = {
  'lr_cfg_0.1.2': JSON.stringify({
    on:true, prefetch:true, theme:'auto', vol:0, spd:420, cdt:true, ai:50,
    active:'默认配置', provider:'http://x/v1',
    profiles:{ '默认配置': { base:'http://x/v1', model:'m', key:'sk-TESTKEY1234567890abcdef' } }
  })
};
const localStorage = {
  getItem: k => (store[k] === undefined ? null : store[k]),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; },
  clear: () => {},
  get length(){ return Object.keys(store).length; },
  key: i => Object.keys(store)[i]
};
const nav = { userAgent:'node-t37', language:'zh-CN' };

const js = require('./loadjs.js').loadGameJs();
const src = require('./loadjs.js').loadFullHtml();

const exportTail = `
;return {
  get S(){ return S; }, set S(v){ S = v; },
  get CUR(){ return CUR; },
  get aiFails(){ return aiFails; }, set aiFails(v){ aiFails = v; },
  get queue(){ return queue; }, set queue(v){ queue = v; },
  get LOG_BUF(){ return LOG_BUF; },
  get AB_TAPS(){ return AB_TAPS; },
  get DBG_ON(){ return DBG_ON; },
  getCfg, setCfg, newLife, GAME_VER, diagSnapshot, diagText, zipStore, crc32, toU8,
  logLine, renderDbg, openDbg, closeDbg, openAbout, closeAbout,
  sysDark, dataOf, dbxGet, aiReady, lsDump, maskSecrets, scrubSecrets, dgSyncLocal,
  get AIPCT_BAK(){ return AIPCT_BAK; },
  DBG_PWD, get DEV_ON(){ return DEV_ON; }, devSet, syncDev, devKeepAlive, devAllAch, devClearAch,
  doAchAll, doClearAch,
  tick, die, alloc, renderAttr, addPoint, setDiff, getDex, setDex, refreshMenu, goState,
  get CUR(){ return CUR; }, renderPlayHead
};`;
const api = new Function('document','window','localStorage','navigator',
  'setTimeout','clearTimeout','setInterval','console',
  js + exportTail)(doc, win, localStorage, nav, setTimeout, clearTimeout, () => 0, console);

/* ---------- 1. 入口存在 ---------- */
console.log('=== 1. 设置面板底部「关于」入口 ===');
ok(!!ELS['#cardAbout'] && typeof ELS['#cardAbout'].onclick === 'function', '设置底部「关于」已独立成卡且已绑定（v0.1.2）');
ok(!!ELS['#btnBackSet'] && typeof ELS['#btnBackSet'].onclick === 'function', '保存 / 关闭已合并为单个「返回」按钮（v0.1.2）');
ok(src.indexOf('#btnSaveSet') < 0 && src.indexOf('#btnCloseSet') < 0 && src.indexOf('#btnAbout') < 0, '旧的保存 / 关闭 / 关于按钮已彻底移除');

/* ---------- 2. 关于页 ---------- */
console.log('\n=== 2. 关于页 ===');
ELS['#cardAbout'].onclick();
ok(ELS['#aboutPage'].classList.contains('on'), '点「关于本软件」打开了关于页');
ok(ELS['#abVer'].textContent === 'v' + api.GAME_VER, '关于页显示版本号 v' + api.GAME_VER + '（实际 ' + ELS['#abVer'].textContent + '）');
ok(/My Life, My Sim/.test(src), '关于正文有软件名');
ok(/纯前端、可离线运行/.test(src) && /抽天赋 → 分配属性/.test(src), '关于正文含玩法说明');
ok(/事件文案部分由 AI 生成，仅供娱乐/.test(src), '关于正文含免责声明');
ELS['#abBack'].onclick();
ok(!ELS['#aboutPage'].classList.contains('on'), '返回箭头能关掉关于页');

/* ---------- 3. 隐藏入口：连点 5 次、零提示 ---------- */
console.log('\n=== 3. 版本号连点 5 次（隐藏功能，不得有提示）===');
/* t37 原意：UI 不得出现「引导玩家连点版本号」的提示。
     注释（HTML 注释与 JS 行/块注释）不是 UI 文案；调试面板里的
     「连点计数已重置」「重置连点计数」属正当业务文案。
     因此先剥离注释，再只查「连点…版本号 / 版本号…连点 / 连点上面的」这类引导语。 */
const _stripCmt = (s) => {
  let out = '', i = 0, st = 0;
  while(i < s.length){
    const c = s[i], d = s[i+1];
    if(st === 0){
      if(s.substr(i,4) === '<!--'){ st = 3; i += 4; continue; }
      if(c === '/' && d === '/'){ st = 1; i += 2; continue; }
      if(c === '/' && d === '*'){ st = 2; i += 2; continue; }
      if(c === "'"){ st = 4; out += c; i++; continue; }
      if(c === '"'){ st = 5; out += c; i++; continue; }
      if(c === '`'){ st = 6; out += c; i++; continue; }
      out += c; i++; continue;
    }
    if(st === 1){ if(c === '\n'){ st = 0; out += c; } i++; continue; }
    if(st === 2){ if(c === '*' && d === '/'){ st = 0; i += 2; continue; } if(c === '\n') out += c; i++; continue; }
    if(st === 3){ if(s.substr(i,3) === '-->'){ st = 0; i += 3; continue; } if(c === '\n') out += c; i++; continue; }
    if(st === 4){ out += c; if(c === '\\'){ out += d; i += 2; continue; } if(c === "'") st = 0; i++; continue; }
    if(st === 5){ out += c; if(c === '\\'){ out += d; i += 2; continue; } if(c === '"') st = 0; i++; continue; }
    if(st === 6){ out += c; if(c === '\\'){ out += d; i += 2; continue; } if(c === '`') st = 0; i++; continue; }
    out += c; i++;
  }
  return out;
};
ok(!/连点[^]{0,8}版本号|版本号[^]{0,8}连点|连点上面的/.test(_stripCmt(src)),
   '源码里不含任何引导连点版本号的提示文案（注释除外）');
ELS['#abVer'].textContent = '';
const toastEl = doc.getElementById('toast');
toastEl.textContent = '';
for(let i = 0; i < 4; i++) ELS['#abVer'].onclick();
ok(!ELS['#dbgPage'].classList.contains('on'), '连点 4 次：不进入调试面板');
ok(toastEl.textContent === '', '连点 4 次：不弹任何提示（toast 为空）');
ELS['#abVer'].onclick();
ok(!ELS['#dbgPage'].classList.contains('on'), '连点第 5 次：先弹口令，不直接进面板');
ok(toastEl.textContent === '', '第 5 次点击也没有任何提示');
/* 输入口令进面板，供后面几节使用 */
doc.getElementById('dlgIIn').value = '5201314';
doc.getElementById('dlgIOk').onclick();
ok(ELS['#dbgPage'].classList.contains('on'), '口令正确后进入调试面板');

/* ---------- 4. 调试面板内容 ---------- */
console.log('\n=== 4. 调试面板内容 ===');
const body = ELS['#dbgBody'].innerHTML;
['游戏版本','AI 开关','AI 占比','模型','端点','连续失败','待用','事件库','当前人生','存储']
  .forEach(k => ok(body.indexOf(k) >= 0, '运行概览含「' + k + '」'));
ok(body.indexOf('v' + api.GAME_VER) >= 0, '概览里带版本号');
ok(body.indexOf('未开局') >= 0, '未开局时状态显示正确');
const logTxt = ELS['#dbgLog'].textContent;
ok(/初始化完成/.test(logTxt), '运行日志里有初始化记录');
ok(api.LOG_BUF.length > 0, '日志缓冲区有味条记录（' + api.LOG_BUF.length + ' 条）');

/* 日志会接住 JS 报错 */
api.logLine('ERR', '模拟一条错误');
ok(/模拟一条错误/.test(ELS['#dbgLog'].textContent), '手动写入的错误会实时显示在面板');

/* ---------- 5. 危险区 ---------- */
console.log('\n=== 5. 危险区 ===');
['#dgFails','#dgQueue','#dgLocal','#dgLog','#dgClick','#dgState']
  .forEach(id => ok(!!ELS[id] && typeof ELS[id].onclick === 'function', '危险区按钮已绑定：' + id));
api.aiFails = 5;
api.queue = [{ age: 3, t: 'x', src: 'AI' }];
ELS['#dgFails'].onclick();
ok(api.aiFails === 0, '「重置 AI 失败计数」把 aiFails 清零');
ELS['#dgQueue'].onclick();
ok(api.queue.length === 0, '「清空事件队列」把队列清空');
ELS['#dgLocal'].onclick();
ok(api.getCfg().ai === 0, '「强制走本地事件」把 AI 占比置 0');
api.logLine('SYS', '待清空');
ELS['#dgLog'].onclick();
ok(api.LOG_BUF.length === 0, '「清空运行日志」清掉了缓冲');
ok(ELS['#dbgLog'].textContent === '（空）', '清空后面板显示（空）');
ELS['#dgState'].onclick();
ok(api.LOG_BUF.length > 0 && /STATE/.test(api.LOG_BUF[api.LOG_BUF.length - 1]), '「打印当前状态」往日志里写了快照');

/* ---------- 6. 诊断文本 + zip ---------- */
console.log('\n=== 6. 诊断导出 ===');
api.newLife([], { CHR:6, INT:9, STR:4, MNY:3, LUK:5, SPR:52, EQ:6, WIL:7, MH:11, SOC:2 }, 'normal');
const snap = api.diagSnapshot();
ok(snap.ver === api.GAME_VER, '快照带版本号');
ok(snap.life && snap.life.age === 0, '快照带当前人生（岁数）');
ok(snap.ai && snap.ai.model === 'm', '快照带 AI 配置（模型）');
ok(snap.store && snap.store['lr_cfg_0.1.2'] > 0, '快照带各存档键体积');
const txt = api.diagText();
ok(/诊断信息/.test(txt) && /运行日志/.test(txt), '诊断文本含概览与日志两段');
ok(txt.indexOf('sk-') < 0 && txt.indexOf('"key"') < 0, '诊断文本不含 API 密钥');

const files = [
  { name: '诊断信息.txt', data: txt },
  { name: '运行日志.txt', data: api.LOG_BUF.join('\n') },
  { name: '本地存储.txt', data: 'key=demo' }
];
const u8 = api.zipStore(files);
ok(u8[0] === 0x50 && u8[1] === 0x4b && u8[2] === 0x03 && u8[3] === 0x04, 'zip 以 PK\\x03\\x04 开头（本地文件头）');
const tail4 = u8.subarray(u8.length - 22, u8.length - 18);
ok(tail4[0] === 0x50 && tail4[1] === 0x4b && tail4[2] === 0x05 && tail4[3] === 0x06, 'zip 以 PK\\x05\\x06 结尾（中央目录结束）');
const nEnt = new DataView(u8.buffer, u8.byteOffset + u8.length - 22 + 10, 2).getUint16(0, true);
ok(nEnt === 3, '中央目录记录 3 个条目（实际 ' + nEnt + '）');
const crcExpect = api.crc32(api.toU8(files[0].data));
const crcGot = new DataView(u8.buffer, u8.byteOffset + 14, 4).getUint32(0, true);
ok(crcGot === crcExpect, '首个文件 CRC32 正确（0x' + crcGot.toString(16) + '）');
fs.writeFileSync('/tmp/t37.zip', Buffer.from(u8));
console.log('  （zip 已落盘 /tmp/t37.zip，' + u8.length + ' 字节）');

/* ---------- 7. 返回键优先级 ---------- */
console.log('\n=== 7. 返回键 ===');
ok(typeof win.__back === 'function', 'window.__back 已挂上');
ok(win.__back() === true, '调试面板打开时，返回键优先关它');
ok(!ELS['#dbgPage'].classList.contains('on'), '返回键确实关掉了调试面板');
ELS['#cardAbout'].onclick();
ok(win.__back() === true && !ELS['#aboutPage'].classList.contains('on'), '返回键也能关关于页');

/* ---------- 8. 诊断包绝不能带 API 密钥（patch38） ---------- */
console.log('\n=== 8. 诊断包密钥打码 ===');
const KEY = 'sk-TESTKEY1234567890abcdef';
ok(api.getCfg().profiles['默认配置'].key === KEY, '前置：配置里确实存着明文密钥');
ok(api.maskSecrets('lr_cfg_0.1.2', store['lr_cfg_0.1.2']).indexOf('sk-') < 0, 'maskSecrets 抹掉了配置里的密钥');
ok(api.maskSecrets('lr_cfg_0.1.2', store['lr_cfg_0.1.2']).indexOf('***') >= 0, '打码替换成了 ***');
ok(api.scrubSecrets('随便一段 sk-ABCDEFGH12345678 结尾').indexOf('sk-') < 0, 'scrubSecrets 能兜底抹掉任意形态的密钥');

const dump = api.lsDump();
ok(dump.indexOf(KEY) < 0, '★ 本地存储导出里查不到明文密钥（这次的漏洞点）');
ok(dump.indexOf('sk-') < 0, '本地存储导出里连 sk- 前缀都不出现');
ok(dump.indexOf('http://x/v1') >= 0, '非敏感信息（端点）仍保留，便于排查');
ok(dump.indexOf('***') >= 0, '密钥位置显示为已打码');

/* 直接验证 zip 三个文件的内容 */
const zipFiles = [
  { name: '诊断信息.txt', data: api.scrubSecrets(api.diagText()) },
  { name: '运行日志.txt', data: api.scrubSecrets(api.LOG_BUF.join('\n')) },
  { name: '本地存储.txt', data: api.scrubSecrets(dump) }
];
api.logLine('ERR', '测试日志里塞一个 sk-LEAKED9999999999');
zipFiles[1].data = api.scrubSecrets(api.LOG_BUF.join('\n'));
zipFiles.forEach(f => ok(f.data.indexOf('sk-') < 0, 'zip 内「' + f.name + '」不含 sk- 前缀'));
zipFiles.forEach(f => ok(f.data.indexOf(KEY) < 0, 'zip 内「' + f.name + '」不含真实密钥'));

/* ---------- 9. 危险区「强制走本地事件」可逆（patch38） ---------- */
console.log('\n=== 9. 危险区模式可恢复 ===');
/* 先把状态复位（第 5 节已点过一次「强制走本地事件」） */
if(ELS['#dgLocal'].textContent.indexOf('恢复') >= 0) ELS['#dgLocal'].onclick();
ok(api.AIPCT_BAK == null && ELS['#dgLocal'].textContent === '强制走本地事件', '前置：危险区处于未触发状态');
const c0 = api.getCfg(); c0.ai = 75; api.setCfg(c0);
api.dgSyncLocal();
ok(api.getCfg().ai === 75, '前置：AI 占比 75%');
ELS['#dgLocal'].onclick();
ok(api.getCfg().ai === 0, '点一次：AI 占比变成 0（走本地事件）');
ok(api.AIPCT_BAK === 75, '原值 75 已被记下');
ok(String(store['lr_dbg_aibak']) === '75', '原值已持久化（重开 App 也不会丢）');
ok(ELS['#dgLocal'].textContent.indexOf('恢复') >= 0, '按钮文案变成「恢复 AI 占比（75%）」');
ok(ELS['#dgNow'].textContent.indexOf('被危险区改成') >= 0, '状态行明确提示怎么恢复');
ELS['#dgLocal'].onclick();
ok(api.getCfg().ai === 75, '再点一次：AI 占比还原为 75%');
ok(api.AIPCT_BAK === null, '备份已清空');
ok(store['lr_dbg_aibak'] === undefined, '持久化的备份也清掉了');
ok(ELS['#dgLocal'].textContent === '强制走本地事件', '按钮文案复原');
ok(ELS['#dgNow'].textContent.indexOf('当前 AI 占比 75%') >= 0, '状态行回到正常显示');

/* ---------- 10. 调试面板进入口令（patch39） ---------- */
console.log('\n=== 10. 调试面板口令门 ===');
ELS['#dgPage'] = ELS['#dbgPage'];
ok(api.DBG_PWD === '5201314', '口令是 5201314');
ok(src.indexOf('5201314') >= 0, '源码里确实有这个口令');
ok(src.indexOf('这个入口是隐藏的，需要口令') >= 0, '口令框有说明文案');
ok(src.indexOf('连点上面的版本号') < 0, '关于页里没有任何连点提示');
ok(src.indexOf("toast('口令不对')") >= 0, '口令错误时给的是中性提示「口令不对」');

/* 连点 5 次 → 弹口令框，而不是直接进面板 */
ELS['#dbgPage'].classList.remove('on');
for(let i = 0; i < 5; i++) ELS['#abVer'].onclick();
ok(!ELS['#dbgPage'].classList.contains('on'), '连点 5 次：没有直接进面板（要先输口令）');
ok(!ELS['#dlgI'].classList.contains('hide'), '连点 5 次：弹出了口令输入框');

/* 输错 */
doc.getElementById('dlgIIn').value = '123456';
doc.getElementById('dlgIOk').onclick();
ok(!ELS['#dbgPage'].classList.contains('on'), '口令错误：进不去');
ok(ELS['#dlgI'].classList.contains('hide'), '口令错误：输入框已关闭');

/* 输对 */
for(let i = 0; i < 5; i++) ELS['#abVer'].onclick();
doc.getElementById('dlgIIn').value = '5201314';
doc.getElementById('dlgIOk').onclick();
ok(ELS['#dbgPage'].classList.contains('on'), '口令正确：进入调试面板');

/* 取消不进 */
ELS['#dbgPage'].classList.remove('on');
for(let i = 0; i < 5; i++) ELS['#abVer'].onclick();
doc.getElementById('dlgICancel').onclick();
ok(!ELS['#dbgPage'].classList.contains('on'), '点取消：不进入面板');

/* ---------- 11. 开发者模式（patch39） ---------- */
console.log('\n=== 11. 开发者模式 ===');
ok(!!ELS['#dgDevRow'] && typeof ELS['#dgDevRow'].onclick === 'function', '危险区有无敌模式开关行');
ok(api.DEV_ON === false, '默认关闭');
ok(ELS['#dgDevActs'].classList.contains('hide'), '关闭时专属按钮是隐藏的');

ELS['#dgDevRow'].onclick();
ok(api.DEV_ON === true, '点一下：开发者模式开启');
ok(store['lr_dev'] === '1', '开关已持久化');
ok(ELS['#dgDev'].classList.contains('on'), '开关显示为打开');
ok(!ELS['#dgDevActs'].classList.contains('hide'), '专属按钮显示出来');

/* 长寿无敌：寿命锁定 200 岁（不再无限生命） */
api.newLife([], { CHR:5,INT:5,STR:5,MNY:5,LUK:5,SPR:50,EQ:5,WIL:5,MH:10,SOC:0 }, 'd1');
api.S.lifespan = 30; api.S.age = 31;
api.devKeepAlive();
ok(api.S.lifespan === 200, '无敌模式下寿命被锁到 200 岁（精确等于 AGE_MAX）');
api.S.age = 99; api.devKeepAlive();
ok(api.S.lifespan === 200, '99 岁时寿命仍是 200（一次锁定，不再逐年顶）');
api.S.age = 150; api.devKeepAlive();
ok(api.S.lifespan === 200 && api.S.dead === false, '150 岁仍活着，寿命不再无限增长（锁死 200）');
api.devSet(false);
const lf = api.S.lifespan;
api.S.age = lf + 5;
api.devKeepAlive();
ok(api.S.lifespan === lf, '关闭无敌模式后不再锁寿命（恢复正常的终老机制）');
api.devSet(true);

/* 无限开局点数 */
api.goState('ATTR_ALLOC');
api.setDiff('d1');
api.alloc.pool = 0;
const v0 = api.alloc.pts.INT || 0;
api.addPoint('INT');
ok((api.alloc.pts.INT || 0) === v0 + 1, '点数耗尽时仍能加点（无限开局点数）');
ok(api.alloc.pool === 0, '而且不扣点数池');
api.renderAttr();
ok(ELS['#atPool'].textContent === '∞', '点数池显示为 ∞');
ok(ELS['#atSub'].textContent.indexOf('∞') >= 0, '顶栏标题也显示 ∞');
api.devSet(false);
api.alloc.pool = 0;
const v1 = api.alloc.pts.CHR || 0;
api.addPoint('CHR');
ok((api.alloc.pts.CHR || 0) === v1, '关闭后点数不足就加不了（恢复正常限制）');
api.devSet(true);

/* 随时结束一局 */
api.newLife([], { CHR:5,INT:5,STR:5,MNY:5,LUK:5,SPR:50,EQ:5,WIL:5,MH:10,SOC:0 }, 'd1');
api.S.age = 33;
ELS['#dgEndLife'].onclick();
ok(ELS['#dlg'].classList.contains('on'), '「立即结束这一局」弹出了二次确认');
ok(ELS['#dlgD'].textContent.indexOf('33') >= 0, '确认框写明了当前年龄（33 岁）');
api.die();
ok(api.S.dead === true, '确定后这一局确实结束了');

/* ---------- 12. 成就两项（patch39） ---------- */
console.log('\n=== 12. 成就：一键全解锁 / 清空 ===');
api.devSet(true);
api.setDex({});
const achTotal = api.dataOf('ach').length;
const n1 = api.doAchAll();
ok(n1 === achTotal, '一键全成就：解锁了全部 ' + achTotal + ' 个成就');
ok(api.getDex().ach.length === achTotal, '图鉴里记下了全部成就');
ok(api.doAchAll() === 0, '再点一次：没有重复解锁（返回 0）');
ok(api.dataOf('ach').length > 0, '成就有属性加成（achBonus 依赖它）');
/* 清空（含图鉴整体重置） */
api.setDex({ runs: 7, best: 88, tal: ['a'], tag: ['b'], ach: ['ach1'] });
api.doClearAch();
const dx = api.getDex();
ok(!dx.ach || dx.ach.length === 0, '清空后没有成就了');
ok(!dx.runs && !dx.best && !(dx.tal || []).length && !(dx.tag || []).length, '通关次数 / 最长寿命 / 天赋 / 标签一并清空（按你定的 B）');
/* 关闭开发者模式时不允许动成就 */
api.devSet(false);
api.setDex({});
ELS['#dlg'].classList.remove('on');   // 先清掉上一节残留的确认框
api.devAllAch();
ok((api.getDex().ach || []).length === 0, '开发者模式关闭时，「一键全成就」不会执行');
ok(!ELS['#dlg'].classList.contains('on'), '也不会弹确认框');
api.devSet(true);

/* ---------- 13. 概览显示 ---------- */
console.log('\n=== 13. 概览显示 ===');
api.renderDbg();
ok(ELS['#dbgBody'].innerHTML.indexOf('无敌模式') >= 0, 'v0.1.3 E：运行概览里改叫「无敌模式」一行');
ok(/const overLife = S\.age > S\.lifespan \|\| S\.age >= AGE_MAX;/.test(src), '年龄到 200 岁必然收尾（硬上限，不空转）');
ok(/const DEV_LIFE = AGE_MAX;/.test(src), '无敌模式寿命锁定常量 DEV_LIFE = AGE_MAX');
ok(!/if\(DEV_ON\) return 99;/.test(src), '无敌模式不再特判剩余寿命（临终通道照常生效）');
ok(ELS['#dbgBody'].innerHTML.indexOf('已开启') >= 0, '开启时显示「已开启」');
api.devSet(false);
api.renderDbg();
ok(ELS['#dbgBody'].innerHTML.indexOf('关闭') >= 0, '关闭时显示「关闭」');

console.log('\n' + (fail ? '❌ 失败 ' + fail + ' 项 / 共 ' + (pass + fail) : '✅ 全部通过（' + pass + ' 项）'));
process.exit(fail ? 1 : 0);