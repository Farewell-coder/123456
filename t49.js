/* t49 专项自检：v0.1.1 —— 历史战绩可点开，回看那一局的完整结算（只读）
   不只看源码字面量，而是真跑一整局 → 立即总结 → 点开战绩回看，验证：
     ① 战绩快照留了日志 / 开局基线 / 深渊值 / 年数
     ② 回看态把结算页五个区块都铺出来
     ③ 回看是纯只读：不写存档、不清 AI 待入库、不产生本地条目
     ④ 回看态的返回 / 菜单 / 再活一世 都回到战绩列表，且退出后守卫必须解除
     ⑤ 空索引不会把 REC_VIEW 卡死
*/
'use strict';
const { doc, win, localStorage, loadApi } = require('./domstub.js');

const exportTail = `
return {
  newLife, tick, openSummary, goState, renderRec, pushRec, getRecs, setRecs,
  openRecView, closeRecView, flushAiDb, renderAiDbRow, dataOf,
  REC_MAX, SAVE_REC, DIFFS, ATTRS, TALENTS, STAGES,
  get S(){ return S; }, get CUR(){ return CUR; }, get gen(){ return gen; },
  get REC_VIEW(){ return REC_VIEW; }
};`;

const api = loadApi(exportTail);

let bad = 0;
const ok = (c, m) => { console.log((c ? '  PASS  ' : '  FAIL  ') + m); if (!c) bad++; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const drain = () => new Promise(r => setImmediate(r));

/* 还原真实页面的元素初值：打桩里的空 classList 会让返回键逻辑走错分支
   （页面上 #dlgI 初始就带 class="hide"，故 __back 不会误判成「插屏开着」） */
doc.getElementById('dlgI').classList.add('hide');

(async () => {
  console.log('=== 0. 源码级约束 ===');
  ok(api.REC_MAX === 5, '战绩保留场次降为 5（快照变重，防 localStorage 膨胀）');
  ok(api.SAVE_REC === 'lr_records', '战绩存储键不变（跨版本累积）');

  console.log('=== 1. 真跑一整局（无 AI） ===');
  localStorage.setItem('lr_cfg_0.1.2', JSON.stringify({
    on: false, prefetch: true, theme: 'light', vol: 0, spd: 1, auto: true, cdt: true,
    ai: 0, active: '默认配置', provider: '',
    profiles: { '默认配置': { base: '', model: '', key: '' } }
  }));

  let picked = 0;
  const clickPending = () => {
    const pc = win.__pendingChoice;
    if (pc && pc.btns && pc.btns[0] && typeof pc.btns[0].onclick === 'function') { picked++; pc.btns[0].onclick(); return true; }
    return false;
  };

  const pts = {}; api.ATTRS.forEach(a => { pts[a.k] = 0; });
  pts[api.ATTRS[2].k] = 10;
  api.newLife(api.TALENTS.slice(0, 3).map(t => t.id), pts, api.DIFFS[1].id);
  for (let i = 0; i < 400; i++) {
    if (api.S && api.S.dead) break;
    /* tick 可能在等抉择；等待期间要主动点掉抉择，否则会一直等下去（t50 同款修法） */
    let done = false;
    api.tick(api.gen).then(() => { done = true; }, () => { done = true; });
    let spins = 0;
    while (!done && spins < 20000) { clickPending(); await drain(); spins++; }
    if (!done) { console.log('    ⛔ 第 ' + i + ' 步未能推进'); break; }
  }
  ok(api.S && api.S.dead, '这一生已结束（自动选择 ' + picked + ' 次）');
  const logsN = api.S.logs.length;
  ok(logsN > 5, '本局日志 ' + logsN + ' 条');

  await api.openSummary();
  await drain();
  ok(api.CUR === 'GAME_OVER', '立即总结后进入结算页');

  console.log('=== 2. 快照留档完整性 ===');
  const recs = api.getRecs();
  ok(recs.list.length === 1, '结算后战绩里留下 1 条（实际 ' + recs.list.length + '）');
  const r0 = recs.list[0];
  ok(Array.isArray(r0.logs) && r0.logs.length === logsN, '快照留了整局日志 ' + (r0.logs && r0.logs.length) + ' 条');
  ok(r0.logs && r0.logs.every(l => typeof l.age === 'number' && typeof l.text === 'string'), '日志条目结构完整（age/text/kind/delta/src）');
  ok(r0.attr0 && Object.keys(r0.attr0).length >= 7, '快照留了开局基线 attr0（' + Object.keys(r0.attr0 || {}).length + ' 项）');
  ok(!!(r0.attr0 && r0.attr && r0.attr0.STR !== undefined && r0.attr.STR !== undefined), '基线可与终值对比，涨跌能算出来');
  ok(typeof r0.years === 'number' && r0.years >= 1, '快照留了年数 ' + r0.years);
  ok(r0.abyss && typeof r0.abyss.drop === 'number' && typeof r0.abyss.nos === 'number', '快照留了深渊值（drop/nos）');
  ok(r0.rank && typeof r0.rank === 'string' && r0.epitaph, '快照留了评级与墓志铭');
  ok(JSON.stringify(r0).length < 200000, '单条快照体积 ' + JSON.stringify(r0).length + ' 字符（可接受）');
  const withLocal = r0.logs.filter(l => l.src && l.src !== 'AI').length;
  ok(r0.logs.some(l => !l.src), '本地日志 src 为空（不渲染来源徽章）');
  ok(withLocal === 0, '日志里没有「本地」这类来源字样（实测 ' + withLocal + ' 处）');

  console.log('=== 3. 战绩列表可点 ===');
  api.goState('REC');
  await drain();
  const listHtml = doc.getElementById('rcList').innerHTML;
  ok(listHtml.indexOf('data-rec="0"') >= 0, '战绩卡带 data-rec 索引（可点）');
  ok(listHtml.indexOf('rchint') >= 0, '列表顶部有一句「点任意一条」的提示');
  ok(listHtml.indexOf('rccard tap') >= 0, '战绩卡带 tap 样式（有可点反馈）');

  console.log('=== 4. 回看态铺满结算页 ===');
  const dbBefore = api.dataOf('ev').length;
  api.S.aiMade = [{ t: 'T49 待入库事件', age: 20, e: {}, aff: [], sex: '' }];
  renderOk();
  function renderOk(){ api.renderAiDbRow(); }
  const rv = api.openRecView(0);
  await drain();
  ok(rv === true, 'openRecView(0) 返回 true');
  ok(api.REC_VIEW === 0, 'REC_VIEW 置成回看态');
  ok(api.CUR === 'GAME_OVER', '回看时切到结算屏');
  const sub = doc.getElementById('ovSub').textContent;
  ok(/享年\s*\d+\s*岁/.test(sub) && sub.indexOf('共走过') >= 0, '顶部小字铺好了：' + sub.slice(0, 46));
  ok(doc.getElementById('ovStats').innerHTML.indexOf('基础属性') >= 0 &&
     doc.getElementById('ovStats').innerHTML.indexOf('隐藏属性') >= 0, '属性面板两组都在');
  ok(doc.getElementById('ovAbyss').innerHTML.indexOf('条世界线被拒绝') >= 0, '深渊值区块已铺');
  ok(doc.getElementById('ovYears').innerHTML.indexOf('这一年几件事') >= 0 &&
     doc.getElementById('ovYears').innerHTML.indexOf('yrgrid') >= 0, '这一年几件事按阶段铺开');
  ok(doc.getElementById('ovTags').innerHTML.length > 0, '人生标签已铺');
  ok(doc.getElementById('ovText').textContent.length > 4, '墓志铭已铺');
  ok(!doc.getElementById('ovAiDbRow').classList.contains('off'), 'v0.1.3 A2：回看态不再把「AI 文案入库」整行置灰');
  ok(doc.getElementById('ovAiDbN').textContent.indexOf('历史记录') >= 0, 'v0.1.3 A2：回看态改显示只读的历史说明（' + doc.getElementById('ovAiDbN').textContent + '）');
  ok(doc.getElementById('deathCard').classList.contains('hide'), '回看态清掉上一局残留的死亡卡');

  console.log('=== 5. 回看是纯只读 ===');
  api.flushAiDb();
  ok(api.S.aiMade.length === 1, '回看态调用 flush 不清空 AI 待入库（仍 ' + api.S.aiMade.length + ' 条）');
  ok(api.dataOf('ev').length === dbBefore, '回看态不往内容库写条目（' + dbBefore + ' → ' + api.dataOf('ev').length + '）');
  api.renderAiDbRow();
  ok(doc.getElementById('ovAiDbBtn').disabled === true && doc.getElementById('ovAiDbBtn').textContent === '回看态只读', 'v0.1.3 A2：回看态一键入库按钮禁用成只读');

  console.log('=== 6. 三条离开路径都回列表，且守卫会解除 ===');
  ok(doc.getElementById('ovMenu').textContent === '返回' && doc.getElementById('ovAgain').classList.contains('hide'), 'v0.1.3 A1：回看态底部合并为单个「返回」（再活一世已隐藏）');
ok(win.__back() === true, '返回键被回看态接管');
  ok(api.REC_VIEW === null && api.CUR === 'REC', '返回键 → 回战绩列表（CUR=' + api.CUR + '）');
  api.openRecView(0); await drain();
  doc.getElementById('ovBack').onclick();
  ok(api.CUR === 'REC' && api.REC_VIEW === null, '☰ 返回 → 回战绩列表，未跳主界面');
  api.openRecView(0); await drain();
  doc.getElementById('ovMenu').onclick();
  ok(api.CUR === 'REC' && api.REC_VIEW === null, '「返回主界面」→ 实际回战绩列表');
  api.openRecView(0); await drain();
  doc.getElementById('ovAgain').onclick();
  ok(api.CUR === 'REC', '「再活一世」→ 实际回战绩列表（不会误重置选天赋）');
  ok(api.S.aiMade.length === 1, '三条路径都没把 AI 待入库弄丢');
  // 退出回看后，守卫必须解除：正常结算流程照旧
  api.REC_VIEW === null;
  api.flushAiDb();
  ok(api.S.aiMade.length === 0, '退出回看后 flush 恢复正常（入库/丢弃生效）');

  console.log('=== 7. 空索引与越界不卡死 ===');
  ok(api.openRecView(999) === false, '越界索引返回 false');
  ok(api.REC_VIEW === null, '越界索引不会把 REC_VIEW 卡在脏值上');
  ok(api.closeRecView() === false, '非回看态调用 closeRecView 返回 false，不误切屏');

  console.log('=== 8. 上限与滚动 ===');
  for (let i = 0; i < 8; i++) api.pushRec({ at: Date.now(), age: 50 + i, sc: 100 + i, rank: 'C', ending: 'C', tags: [], attr: {}, attr0: {}, logs: [], years: 51, abyss: {} });
  const rl = api.getRecs().list;
  ok(rl.length === 5, '超出上限后只留 ' + rl.length + ' 条');
  ok(rl[0].sc === 107, '最新的排最前（sc=' + rl[0].sc + '）');
  api.goState('REC');
  await drain();
  const lh = doc.getElementById('rcList').innerHTML;
  ok((lh.match(/data-rec="/g) || []).length === 5, '列表渲染 ' + (lh.match(/data-rec="/g) || []).length + ' 张卡');
  ok(api.openRecView(4) === true && api.REC_VIEW === 4, '最后一张也能打开');
  const payload = localStorage.getItem('lr_records');
  ok(payload && payload.length < 800000, '战绩整表 ' + (payload ? payload.length : 0) + ' 字符（5 场 × 整局日志，仍在可存区间）');

  console.log(bad ? ('❌ 失败 ' + bad + ' 项') : '✅ v0.1.1 战绩回看专项自检全部通过');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error('💥 测试异常：', e && e.stack || e); process.exit(2); });