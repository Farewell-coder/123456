/* My Life, My Sim —— 纯前端中文人生模拟器
 * Copyright (C) 2026 aerree
 *
 * 本程序是自由软件：你可以依据自由软件基金会发布的 GNU 通用公共许可证
 * 第 3 版条款，重新发布和/或修改它。
 *
 * 本程序基于「希望它有用」而发布，但没有任何担保，甚至没有适销性
 * 或特定用途适用性的默示担保。详见 GNU 通用公共许可证。
 *
 * 你应已随本程序收到一份 GNU 通用公共许可证副本；若没有，
 * 请见 <https://www.gnu.org/licenses/>。
 *
 * SPDX-License-Identifier: GPL-3.0-only
 */
/* =========================================================
   [05-main.js] 渲染与交互层（拆分文件 6/6，最后加载）
   职责：数据管理子页 UI、DOM 渲染（renderX / openSummary 等）、
         自绘下拉/开关组件、goState 状态机（MAIN_MENU / TALENT_SELECTION /
         LIFE_PLAYING / GAME_OVER）、启动入口（末尾 goState('MAIN_MENU')）。
   依赖：00~04 全部（所有常量 / 数据 / 引擎 / 逻辑 / AI）
   注意：文件末尾的 goState('MAIN_MENU') 是「全部就绪后再启动」的安全锚点，
         务必保留在最后。
   ========================================================= */
let dbKind = 'ev';
/* v0.1.4：数据管理页的「模式筛选」——'earth' 地球online（当前唯一），
   'all' 表示不筛选（全部模式）。后续新增模式时向 MODES 里加一项即可。 */
let dbMode = 'earth';
const MODES = [
  {id:'earth', n:'地球online', cur:true}
];
let dbFold = {0:1, 1:1, 2:1};   // 数据管理：三张来源卡的折叠态（1=收起；默认全收起）
const DB_FIELDS = {
  ev:  {t:'事件',
        fmt:'{"text":"你出生了，护士说你哭得整层楼都听得见","stage":"幼年","age":[0,3],"aff":["IMMU","MOOD","FOCUS"],"sex":"通用","effects":{"STR":1},"subs":{"IMMU":2,"MOOD":1,"FOCUS":-1}}',
        req:'必填：text、stage；选填：age、aff、sex、effects、subs、id、weight、simple、tags、o、need',
        note:'字段按这个顺序理解：① text 内容；② stage + age 年龄段；③ aff 一到三个属性偏向（主词条 1 个，或主词条 1 个 + 副词条 2 个，共 1 或 3 个）；' +
             '④ sex 性别编号，只能填「男」「女」「通用」三个值（隐藏字段，只决定这条事谁可能遇上：怀孕/坐月子/婆婆/月经这类只有女性会经历填「女」，妻子/岳父/当丈夫这类只有男性会经历填「男」，其余一律「通用」）；' +
             '⑤ effects 与 subs 是增减数字 —— 主词条（aff 的第 1 个，属于 7 个主属性之一）写进 effects，副词条（aff 的第 2、3 个，属于 35 个隐藏子项）写进 subs，两类都必须给值。' +
             '主属性可用键：CHR颜值/INT智力/STR体质/MNY家境/LUK幸运/SPR快乐/SOC社交（边界 -15~30）；隐藏子项共 35 项、边界 -30~50，键名如 SKIN皮相/IMMU免疫力/LOGIC数理逻辑/POCKET零花钱/MOOD情绪稳定度/EMPATHY共情力。' +
             'sex 与 aff 相同：性别编号与属性数值（aff + effects + subs）完全一致时，这些条目视为同一款，抽取时随机取其一。' +
             'weight 1-20 越大越常抽到（默认 5）；simple 只写「什么时候触发」这一句说明，效果由 effects 自动生成；tags 写触发后附加的状态标签名数组，如 ["暴富"]。' +
             'req 是「什么样的人才会遇上它」，1 或 3 个子项代号与偏离值（-10~+10，0 表示平均水平），一般不手写，交给「同步偏向」自动判。' +
             '【分支事件】在 events 之上多写一个 o 数组，这条事就会变成「要玩家自己选」的交互事件；' +
             'o 里每一项是一个选项：k 是选项名，ok 是选中后的结果，选填 j 是判定门槛、no 是判定失败的结果。' +
             'ok / no 里写 t（结果文案）、e（属性增减，键同 events）、tag（获得的标签数组）、untag（摆脱的标签数组）。' +
             'j 写法 {"a":"INT","v":10} 表示用智力判定，值 ≥ 10 才算过；不写 j 就是无判定、直接承受结果。' +
             '另外可写 need 限定「什么样的人才会遇上这条分支」：{"tag":"社畜"} 需带该标签，{"not":"高管"} 需不带该标签，' +
             '{"attr":{"MNY":[-99,3]}} 限定某属性区间，{"once":1} 表示一局只出一次。' +
             '不带 need 的分支事件人人可遇。示例：' + '\n' +
             '{"text":"公司空降了比你年轻十岁的主管","stage":"中年","age":[35,58],"aff":["SOC"],"sex":"通用","effects":{"SOC":1},' +
             '"o":[{"k":"妥协","j":{"a":"INT","v":10},"ok":{"t":"你稳住团队，成了新主管离不开的人","e":{"SOC":1},"tag":["稳重"]},' +
             '"no":{"t":"你低了头，却只换来一句「再看看」","e":{"MH":-2}}},{"k":"硬刚","ok":{"t":"你摔门辞职，拉上老同事单干","e":{"MNY":-3}}}]}'},
  choice: {t:'交互事件',
        fmt:'{"text":"公司空降了比你年轻十岁的主管，你的位置岌岌可危","stage":"中年","age":[35,58],"aff":["SOC"],"sex":"通用","effects":{"SOC":1},"need":{"tag":"社畜"},"o":[{"k":"妥协","j":{"a":"INT","v":10},"ok":{"t":"你稳住团队接下烂摊子，成了新主管离不开的人","e":{"SOC":1},"tag":["稳重"]},"no":{"t":"你低了头，却只换来一句「再看看」","e":{"MH":-2}}},{"k":"硬刚","ok":{"t":"你摔门辞职，拉上老同事单干","e":{"MNY":-3}}}]}',
        req:'必填：text、stage、o；选填：age、aff、sex、effects、subs、need、id、weight、simple、tags',
        note:'交互事件＝「要玩家亲自选」的分支事件，比普通事件多一个 o 数组。o 里每项是一个选项：k 选项名，ok 选中后的结果，选填 j 判定门槛、no 判定不过的结果；ok/no 里写 t 结果文案、e 属性增减、tag 获得的标签、untag 摆脱的标签。j 写法 {"a":"INT","v":10}，不写 j 就是无判定。need 限定什么人能遇上：{"tag":"社畜"}/{"not":"高管"}/{"attr":{"MNY":[-99,3]}}/{"once":1}。它和普通事件存在同一份库里，用「交互」这一栏专门筛出来看。'},
  tal: {t:'天赋',
        fmt:'{"id":"t_user1","name":"天生丽质","rarity":0,"effects":{"CHR":3},"good":"从小就被大人夸长得好看","bad":"美貌也带来麻烦","hook":{}}',
        req:'必填：name；选填：id、rarity、effects、good、bad、hook',
        note:'rarity 稀有度：0 白 / 1 蓝 / 2 紫 / 3 橙；effects 为开局属性增减（键同事件）；good 是「利」、bad 是「弊」两段说明文字；hook 是特殊机制键值对，一般留空 {} 即可，如 {"sickRisk":1.3} 表示疾病概率 ×1.3。id 可省略，系统会自动生成。'},
  ach: {t:'成就',
        fmt:'{"id":"ach_user1","name":"初次重开","desc":"完成第一次人生","cond":{"runs":1},"effects":{"SPR":1},"simple":"通关次数 ≥ 1"}',
        req:'必填：name；选填：id、desc、cond、effects、simple',
        note:'cond 是达成条件（留空 {} 表示永远达成）。可用键：allMin（各属性 ≥，如 {"INT":15}）、anyMin（任一属性 ≥）、maxAll（各属性 ≤）、tags（需同时拥有这些标签，数组）、age:[起,止]、ending（指定结局称号）、runs（通关次数 ≥）、best（最长寿命 ≥）、tagCnt（集齐标签数 ≥）、talCnt（集齐天赋数 ≥）；effects 为达成后每局开局的属性加成（键同事件）。'},
  end: {t:'结局',
        fmt:'{"id":"end_user1","name":"人生赢家","desc":"爱情、事业、身体、钱，你居然都有","cond":{"allMin":{"INT":15,"MNY":15}},"rank":""}',
        req:'必填：name；选填：id、desc、cond、rank',
        note:'cond 与成就同款模板（留空 {} 表示命中一切人生）；命中后会优先展示该结局称号，覆盖默认的 S/A/B 评级。rank 可留空 ""。'},
  tag: {t:'标签',
        fmt:'{"id":"暴富","name":"暴富","desc":"家境极高，钱多到花不完","rarity":1}',
        req:'必填：name；选填：id、desc、rarity',
        note:'id 与 name 一般写成同一个词，就是游戏里【】中显示的状态名；写事件时在 tags 里引用的也是这个名字，务必与事件保持一致。desc 是图鉴里的说明；rarity：0 白 / 1 蓝 / 2 紫 / 3 橙。'},
  epitaph: {t:'墓志铭',
        fmt:'{"id":"ep_user1","text":"他把日子过成了一条安静的河，最后汇入大海。","tag":"长寿老人","desc":"给长寿老人结局用"}',
        req:'必填：text；选填：id、tag、desc、ending、ageMin、ageMax',
        note:'text 是墓志铭正文（结算页会整段显示，建议 30-140 字）。tag 写它适配的结局称号或评级，例如「富甲一方」「天妒英才」「SSS」「A」—— 结算时会优先挑与本局结局匹配的那条；写「通用」或不写则作为兜底。ending 是 tag 的同义字段（写哪个都行）。ageMin / ageMax 可选，限定适用的享年范围（不写则不限）。AI 在结算时写出的墓志铭会以「AI 加入」入库，可改可删、会进备份。'}
};
/* ===== 局外一次性查重：自建条目 vs 本地内置 ===== */
function dbDupCands(){
  const hits = [];
  Object.keys(DB_FIELDS).forEach(kind => {
    const all = dataOf(kind);
    const loc = all.filter(x => ((x.__src == null ? 0 : x.__src) === 0));
    const oth = all.filter(x => ((x.__src == null ? 0 : x.__src) !== 0));
    if(!loc.length || !oth.length) return;
    const locT = loc.map(x => ({id: x.id, t: String(dbMainText(kind, x) || '')})).filter(o => o.t);
    if(!locT.length) return;
    oth.forEach(y => {
      const ty = String(dbMainText(kind, y) || '');
      if(!ty) return;
      hits.push({kind: kind, id: y.id, text: ty, loc: locT});
    });
  });
  return hits;
}
/* 本地算法判重（AI 不可用时的降级方案，Q1-A：完全相同 / 包含 / 相似度 ≥ 75%） */
function dbDupLocal(h){
  const ny = normTxt(h.text);
  if(!ny) return null;
  for(let i = 0; i < h.loc.length; i++){
    const o = h.loc[i];
    const no = normTxt(o.t);
    if(!no) continue;
    if(no === ny) return o;
    if(no.length >= 6 && ny.length >= 6 && (no.indexOf(ny) >= 0 || ny.indexOf(no) >= 0)) return o;
    if(simRate(no, ny) >= 0.75) return o;
  }
  return null;
}
/* ===== patch54：需求向量 req =====
   一条事件带上 req:{子键:期望值} 就表示「什么样的人才会遇上它」：
   角色当前这项隐藏属性的值离期望值越近（标准差 σ 越小），越容易被抽中。
   缺省（没有 req）＝ 中性匹配，任何属性的人都会照常遇上 —— 旧数据不迁移，
   所以旧库行为一字不变。 */
/* 需求向量的刻度 = 子项的个体增量 Δ（不是绝对属性值）。
   绝对值会随年龄一路膨胀（老年智力能到 30+），而 Δ 一辈子待在 ±6 里；
   两者量纲对不上，判概率就会「年轻时永远不中、成年后一律命中」。
   Δ 口径：0 = 这一项就长在平均水平上；+4 = 明显偏强；-4 = 明显偏弱。 */
const REQ_MIN = -10, REQ_MAX = 10;
const REQ_HI = 4;        /* 「这项强的人才遇上」 */
const REQ_LO = -4;       /* 「这项弱的人才遇上」 */
const REQ_STRONG = 2;    /* 效果幅度达到这个数才算「明确方向」 */
const REQ_MID = 1;       /* 正向但看不出方向 → 中性略偏 */
const REQ_MID_LO = -1;   /* 负向但幅度太小 → 中性略偏 */
const REQ_HALF = 2;      /* 同一条事件占 3 个子项时，陪衬项的幅度（主项的一半） */
/* 把一条事件按本地规则补出需求向量：命中语义子项 + 看该主类的效果方向。
   正效果（≥2）→ 「这一项偏强的人才遇上」(+4)；
   负效果（≤-2）→ 「这一项偏弱的人才遇上」(-4)；
   没有方向线索 → 中性 (+1)，表示什么样的人都会遇上。
   值域是子项 Δ 的范围（-10~+10），不是属性绝对值。
   只要 aff 判得出来就一定给 req —— 内容库里不再有「无需求」的漏网条目。 */
function genReq(x, judge){
  if(!x) return null;
  const j = judge || affJudge(x);
  const sub = (j.aff && j.aff[0]) || '';
  if(!sub) return null;
  const main = SUB_OF[sub];
  if(!main) return null;
  const e = x.effects || {};
  let v = Number(e[main]);
  if(!isFinite(v) || !v){
    /* 主类没有直接效果时，看退役键（EQ / WIL / MH）的方向 —— 语义上仍属于这一主类 */
    const lk2 = Object.keys(e).filter(k => LEGACY_SUB[k] && Number(e[k]));
    if(lk2.length){
      lk2.sort((a, b) => Math.abs(Number(e[b]) || 0) - Math.abs(Number(e[a]) || 0));
      v = Number(e[lk2[0]]) || 0;
    }else{
      /* 一点方向线索都没有（比如「你出生了」这种纯叙述）：
         以前在这里直接放弃、不生成 req，结果全库一直挂着近百条「无需求」。
         现在只要 aff 判得出来就给中性值 —— 表示「什么样的人都会遇上它」，
         不再让这些条目游离在统计之外。 */
      v = 0;
    }
  }
  /* 方向判定（这里曾经写反过：幅度不足的正效果被当成了负向要求）：
       +2 及以上 → +4：「这一项强的人才遇上」
       -2 及以下 → -4：「这一项弱的人才遇上」
       +1        → +1：略偏强，但看不出明确方向
       -1        → -1：略偏弱，同上
     判定只用「有没有明确方向」，值大小本身不参与，避免极端数值放大偏差。 */
  const want = (v >= REQ_STRONG) ? REQ_HI
             : (v <= -REQ_STRONG ? REQ_LO
             : (v > 0 ? REQ_MID : (v < 0 ? REQ_MID_LO : REQ_MID)));
  const out = {};
  out[sub] = clamp(want, REQ_MIN, REQ_MAX);
  /* 事件「占 3 个隐藏属性」时，需求向量也带上另外两项：
     它们表示「顺带也看这两项」，给同向的半值（±2）——
     既有区分度，又不会抢主项（±4）的决定权。 */
  const affList = (j.aff || []).filter(k => SUBN[k]);
  if(affList.length >= 3){
    const side = want > 0 ? REQ_HALF : (want < 0 ? -REQ_HALF : REQ_MID);
    affList.slice(1, 3).forEach(k => { if(!out[k]) out[k] = clamp(side, REQ_MIN, REQ_MAX); });
  }
  return out;
}
/* 需求向量收敛：只留白名单子键，值钳进 1-40，最多 3 项 */
function sanReq(r){
  const out = {};
  if(!r) return null;
  if(!Array.isArray(r) && typeof r === 'object'){
    const keys = Object.keys(r).slice(0, 6);
    for(let i = 0; i < keys.length; i++){
      const k = String(keys[i]).toUpperCase().trim();
      const v = Number(r[keys[i]]);
      if(!SUBN[k] || !isFinite(v)) continue;
      out[k] = Math.round(clamp(v, REQ_MIN, REQ_MAX));
      if(Object.keys(out).length >= 3) break;
    }
    const ks = Object.keys(out);
    if(!ks.length) return null;
    /* 需求向量同样只允许 1 项或 3 项（需求 3）：给 2 项按 1 项算 */
    if(ks.length < 3){
      const one = {};
      one[ks[0]] = out[ks[0]];
      return one;
    }
    const three = {};
    ks.slice(0, 3).forEach(k => { three[k] = out[k]; });
    return three;
  }
  return null;
}
/* 子键 Δ 收敛：只留白名单子键，幅度 ±1..±3，最多 2 项 */
/* 单条事件最多动 3 点；Δ 的硬上限放宽到 ±20 —— 因为子项值要能撑到 [-30, 50]
   的边界（主属性占 ±15/30，差额只能由 Δ 补）。日常仍靠「|Δ|≥4 每年回归 1」收敛。
   （SUB_DMAX / SUB_DCAP 已上移到 00-config.js「全局数值边界」统一管理。） */
function sanSubs(d){
  const out = {};
  if(!d || typeof d !== 'object' || Array.isArray(d)) return null;
  Object.keys(d).slice(0, 8).forEach(k => {
    const u = String(k).toUpperCase().trim();
    const v = Number(d[k]);
    if(!SUBN[u] || !isFinite(v) || !v) return;
    out[u] = Math.round(clamp(v, -SUB_DMAX, SUB_DMAX));
  });
  return Object.keys(out).length ? out : null;
}
/* 给一条事件推断它偏向哪项能力：优先看效果键（有实际属性变化最可信），
   没有效果键才退到文案关键词。 */
/* 统计整库的属性偏向分布 */
function affStat(){
  /* 只统计「导入 / AI 加入」两类：本地数据整类不对外暴露（需求变更），
     体检卡上的数字自然也不该把本地条目算进来。 */
  const list = dataOf('ev').filter(x => (((x && x.__src) == null ? 0 : x.__src) !== 0));
  const by = {};
  AFF_KEYS.forEach(k => { by[k] = 0; });
  let none = 0, tagged = 0, noReq = 0;
  list.forEach(x => {
    if(!sanReq(x && x.req)) noReq++;
    const a = sanAff(x && x.aff);
    if(!a.length){ none++; return; }
    tagged++;
    a.forEach(k => { if(by[k] != null) by[k]++; });
  });
  return {by:by, none:none, tagged:tagged, noReq:noReq, total:list.length};
}
function affTagOf(x){
  if(dbKind !== 'ev') return '';
  const a = sanAff(x && x.aff);
  if(!a.length) return '';
  return '<span class="afftag">' + a.map(k => esc(an(k))).join('/') + '</span>';
}
/* 档位-事件数分布校验（需求 10 连带项）
   机遇值 1~4 档每年要发生 FORT_LO/FORT_HI 那么多件事，可是事件池是「按年龄区间」取的：
   某个阶段本身年数少、库里条目也少时，一年要挤好几条就必然重样。
   这里按每档的区间下限（踩线口径）逐阶段算「库里有多少条 / 至少要多少条」，
   挑出最吃紧的那个阶段报出来，红了就说明该阶段的库还得再扩。 */
function tkFortStat(){
  const list = dataOf('ev');
  const chips = [1, 2, 3, 4].map(f => {
    const lo = FORT_LO[f], hi = FORT_HI[f];
    let worst = null;
    STAGES.forEach(st => {
      const r = STAGE_RANGE[st];
      if(!r) return;
      const yn = r[1] - r[0] + 1;
      const pool = list.filter(x => x && x.stage === st).length;
      const need = yn * lo;
      const ratio = need ? pool / need : 99;
      if(!worst || ratio < worst.ratio) worst = {st: st, pool: pool, need: need, ratio: ratio};
    });
    const w = worst || {st:'—', pool:0, need:0};
    const cls = w.pool < w.need ? ' warn' : '';
    return '<span class="tkchip' + cls + '" title="' + f + ' 档每年 ' + lo + '~' + hi +
      ' 件（长期均值 ' + ((lo + hi) / 2) + '）；最吃紧的是' + w.st + '：库里 ' + w.pool +
      ' 条，按每年 ' + lo + ' 条算至少要 ' + w.need + ' 条">' +
      f + '档<b>' + lo + '-' + hi + '</b></span>';
  }).join('');
  return '<div class="tkempty" style="margin-top:8px">档位-事件数校验（机遇值决定每年几件事，这里看各阶段库存够不够）</div>' +
    '<div class="tkgrid" style="margin-top:6px">' + chips + '</div>';
}
/* 文本体检卡顶部的分布条 */
function renderTkStat(){
  const el = $('#tkStat'); if(!el) return;
  const st = affStat();
  /* 主类口径：一个主类的「个数」= 直接写主类的条目 + 写它名下 5 个隐藏子项的条目。
     这样 7 个主类的数字加起来就正好是「已分类条目数」，玩家一眼看得到总和。 */
  const subOfMain = {};
  SUBDEF.forEach(g => { subOfMain[g[0]] = g[2].map(sb => sb[0]); });
  const sumOf = mk => (st.by[mk] || 0) +
    (subOfMain[mk] || []).reduce((a, sk) => a + (st.by[sk] || 0), 0);
  const mx = Math.max.apply(null, AFF_MAIN.map(sumOf).concat([1]));
  let h = AFF_MAIN.map(k => {
    const v = sumOf(k);
    const w = Math.max(3, Math.round(v / mx * 34));
    const cls = v === 0 ? '' : (v >= 8 ? ' hot' : '');
    return '<span class="tkchip' + cls + '" title="偏向' + esc(an(k)) + '的条目数（含其名下隐藏子项）">' +
      esc(an(k)) + '<b>' + v + '</b><i class="tkb" style="width:' + w + 'px"></i></span>';
  }).join('');
  /* 汇总行：把「总和」摆出来 */
  h += '<span class="tkchip" title="已分类条目总数（等于上面 7 个主类之和）">合计<b>' + st.tagged + '</b></span>';
  h += '<span class="tkchip' + (st.none ? ' warn' : '') + '" title="尚未分类（缺 aff）的条目数">未标注<b>' + st.none + '</b></span>';
  h += '<span class="tkchip' + (st.noReq ? ' warn' : '') + '" title="还没有需求向量 req 的条目数（缺省＝中性匹配，任何属性都会遇上）">无需求<b>' + st.noReq + '</b></span>';
  /* 35 个隐藏子项：每一项显示它自己的个数，折叠收起免得撑满屏 */
  const subAll = SUBS.map(x => ({k:x.k, n:x.n, v:st.by[x.k] || 0, m:SUBN[x.main] || x.main}));
  const subHit = subAll.filter(x => x.v > 0).sort((a, b) => b.v - a.v);
  let h2 = '<details class="tkfold"><summary>隐藏子项（' + subHit.length + ' / ' + subAll.length +
    ' 项有数据）</summary><div class="tkfoldin">' +
    (subHit.length
      ? subHit.map(x => '<span class="tksub">' + esc(x.n) + '<b>' + x.v + '</b></span>').join('')
      : '<span class="tkempty">还没有子项数据</span>') +
    '</div></details>';
  el.innerHTML = h + h2 + tkFortStat() +
    '<div class="tkempty">你的条目共 ' + st.total + ' 条 · 已分类 ' + st.tagged + ' 条（导入 + AI 加入）</div>';
}
/* ===== 同步偏向 =====
   只动「外部 / AI 加入」，本地数据永不修改。
   「未分类」的判定：没有 aff，或者还没算出 req（需求向量）。
   流程：本地规则先跑一遍 → 置信度不够的凑成一批交给 AI 复核 → AI 不可用就用本地结果。
   AI 输出契约：{"list":[{"i":0,"aff":["SKIN"],"req":{"SKIN":14}}]} */
let affSyncBusy = false;
/* 本地规则能给出高置信（≥0.75）就直接用，剩下的是「含糊的」交给 AI 看 */
const AFF_CONF_OK = 0.75;
function affNeedList(){
  const list = dataOf('ev').filter(x => (x.__src == null ? 0 : x.__src) !== 0);
  const need = [];
  list.forEach(x => {
    const hasAff = sanAff(x.aff).length > 0;
    const hasReq = !!sanReq(x.req);
    /* 需求 27：性别编号也是这一套判定的一部分 —— 没写 sex 的条目同样要补 */
    const hasSex = !!sanSex(x.sex);
    if(hasAff && hasReq && hasSex) return;
    const j = affJudge(x);
    need.push({it: x, judge: j, hasAff: hasAff, hasReq: hasReq,
      unsure: (!hasAff && j.conf < AFF_CONF_OK) || !hasAff});
  });
  return need;
}
/* 让 AI 复核一批含糊条目：返回 {id: {aff:[], req:{}}}；任何异常都返回 null 交给本地兜底 */
async function aiAffJudge(batch){
  const lines = batch.map((b, i) => (i + 1) + '. 「' + String(b.it.text || '').replace(/\s+/g, ' ') + '」' +
    (b.it.effects && Object.keys(b.it.effects).length ? '（数值变化：' + JSON.stringify(b.it.effects) + '）' : ''));
  const subs = SUBS.map(x => x.k + '=' + x.n + '(' + x.main + ')').join('、');
  const sys = '你是一个事件分类器。给你若干条人生事件文案，你要判断每条事件「讲的是主角哪一项具体能力」、' +
    '「这条事只可能发生在男性还是女性身上」，并估算「什么样的人才会遇上它」。' +
    '严格只输出 JSON，不要解释、不要代码块标记。';
  const user =
    '【可选子项】' + subs + '\n' +
    '【任务】对每条事件输出两项：\n' +
    '1. aff：这条事件讲的是哪几项子项（只填子项代号，如 SKIN / IMMU / LOGIC）。' +
    '只允许给 1 个或 3 个：这条事只说到一个侧面就给 1 个；说到同一维度的 3 个侧面就给 3 个，按贴切程度排序。' +
    '不确定就给最接近的那 1 个，不要编造。\n' +
    '2. sex：这条事只可能发生在哪个性别身上。只能填「男」「女」「通用」三者之一：' +
    '明确写了怀孕 / 坐月子 / 婆婆 / 月经这类只有女性会经历的事 → 填「女」；' +
    '明确写了妻子 / 岳父 / 当丈夫这类只有男性会经历的事 → 填「男」；' +
    '其余绝大多数（读书、生病、搬家、工作……任何人都可能遇上）一律填「通用」。' +
    '拿不准就填「通用」，不要为求稳妥乱填男 / 女。\n' +
    '3. req：什么样的人才会遇上它。只允许给 1 个或 3 个子项代号与期望分值。' +
    '分值不是绝对属性值，而是「这一项的个体偏离量」：0 = 就长在平均水平上，+4 = 明显偏强，-4 = 明显偏弱，' +
    '取值范围 -10 ~ +10。所以「这项强的人才遇上」写 +4，「这项弱的人才遇上」写 -4，' +
    '看不出方向写 +1；确实与属性无关就留空 {}。\n' +
    '【待分类】\n' + lines.join('\n') + '\n' +
    '【输出格式】{"list":[{"i":1,"aff":["SKIN"],"sex":"通用","req":{"SKIN":14}}]}（i 用上面给的序号）';
  const raw = await callAI([{role:'system', content:sys}, {role:'user', content:user}], 1400, true);
  const o = extractJSON(raw);
  const arr = (o && (o.list || o.items || o.arr)) || null;
  if(!arr || !arr.length) return null;
  const out = {};
  arr.forEach(r => {
    const n = Number(r.i);
    if(!isFinite(n) || n < 1 || n > batch.length) return;
    const a = sanAff(r.aff);
    const q = sanReq(r.req);
    const s = sanSex(r.sex);
    if(!a.length && !q && !s) return;
    out[batch[n - 1].it.id] = {aff: a, sex: s, req: q};
  });
  return Object.keys(out).length ? out : null;
}
/* 写出分类结果：aff / sex / req 都只覆盖需要补的字段 */
function affWrite(it, aff, req, sex){
  const o = JSON.parse(JSON.stringify(it));
  delete o.__src;
  const a = sanAff(aff);
  if(a.length) o.aff = a;
  /* 需求 27：性别编号一并落库（隐藏字段，只用于抽取过滤） */
  const s = sanSex(sex);
  if(s) o.sex = s;
  const q = sanReq(req);
  if(q) o.req = q;
  const v = dbNorm('ev', o);
  if(!v) return false;
  v.id = it.id;
  dataPut('ev', v);
  return true;
}
async function dbAffFill(){
  if(affSyncBusy) return;
  const need = affNeedList();
  if(!need.length){
    toast('你自己的条目都已分类完毕');
    return;
  }
  const aiOk = aiReady();
  dialog('同步 ' + need.length + ' 条事件的偏向',
    '会对还没分类的「导入 / AI 加入」条目做三件事：\n' +
    '① 判定它讲的是哪一项具体能力（隐藏子项，界面不显示）；\n' +
    '② 判定它的性别编号 —— 男 / 女 / 通用（隐藏，只决定这条事谁可能遇上）；\n' +
    '③ 估算它要求角色具备多少分才会发生（需求向量，决定「什么样的人会遇上」）。\n' +
    (aiOk ? '先用规则跑一遍，拿不准的再交给 AI 复核。'
          : '当前未启用 AI，将只用规则处理（可在设置里配置模型后再来，准确率更高）。') +
    '\n只处理导入与 AI 加入的条目。',
    [
      {t:'开始同步', pri:true, fn:() => { runAffSync(need, aiOk); }},
      {t:'取消', plain:true}
    ]);
}
async function runAffSync(need, aiOk){
  affSyncBusy = true;
  let done = 0, viaAI = 0, skip = 0;
  try{
    /* 第一遍：本地规则直接落地 */
    const rest = [];
    need.forEach(b => {
      const a = sanAff(b.it.aff);
      const j = b.judge;
      if(!a.length && j.conf >= AFF_CONF_OK && j.aff.length){
        const q = sanReq(b.it.req) || genReq(b.it, j);
        /* 需求 27：性别跟着一起补 —— 显式写过的保留，没写的用本地词表结果 */
        const sx = sanSex(b.it.sex) || sexJudge(b.it);
        if(affWrite(b.it, j.aff, q, sx)) done++; else skip++;
      }else{
        rest.push(b);
      }
    });
    dbRender();
    /* 第二遍：剩下的交给 AI 分批复核 */
    if(aiOk && rest.length){
      const BATCH = 20;
      const batches = [];
      for(let i = 0; i < rest.length; i += BATCH) batches.push(rest.slice(i, i + BATCH));
      for(let bi = 0; bi < batches.length; bi++){
        const batch = batches[bi];
        let res = null;
        try{ res = await aiAffJudge(batch); }catch(e){ res = null; }
        batch.forEach(b => {
          const a0 = sanAff(b.it.aff);
          const q0 = sanReq(b.it.req);
          const r = res && res[b.it.id];
          let aff = (r && r.aff && r.aff.length) ? r.aff : (a0.length ? a0 : (b.judge.aff || []));
          let req = (r && r.req) ? r.req : (q0 || genReq(b.it, b.judge));
          /* 需求 27：AI 给了性别就用它的，没给/给空则回落本地词表 */
          const s0 = sanSex(b.it.sex);
          const sx = (r && r.sex) ? r.sex : (s0 || sexJudge(b.it));
          if(r) viaAI++;
          if(!aff.length && !req && !sx){ skip++; return; }
          if(affWrite(b.it, aff, req)) done++; else skip++;
        });
        setStatus('同步偏向… ' + Math.min((bi + 1) * 20, rest.length) + '/' + rest.length);
      }
    }else if(rest.length){
      /* 没有 AI：剩下的一律用本地结果（判不出就只写 req，都没有就跳过） */
      rest.forEach(b => {
        const a0 = sanAff(b.it.aff);
        const q0 = sanReq(b.it.req);
        const aff = a0.length ? a0 : (b.judge.aff || []);
        const req = q0 || genReq(b.it, b.judge);
        if(!aff.length && !req){ skip++; return; }
        if(affWrite(b.it, aff, req)) done++; else skip++;
      });
    }
    dbRender();
    setStatus('');
    toast('同步完成：已分类 ' + done + ' 条' + (viaAI ? '（其中 ' + viaAI + ' 条经 AI 复核）' : '') +
      (skip ? '，另有 ' + skip + ' 条信息不足被跳过' : ''));
  }catch(e){
    toast('同步中断：' + (e && e.message ? e.message : e));
  }finally{
    affSyncBusy = false;
  }
}
let dbDupBusy = false;
async function dbDedupScan(){
  if(dbDupBusy) return;
  const cands = dbDupCands();
  if(!cands.length){ toast('没有需要检测的条目'); return; }
  dbDupBusy = true;
  toast('正在检测重复…');
  const found = [];
  const useAI = aiReady();
  const byKind = {};
  cands.forEach(h => { (byKind[h.kind] = byKind[h.kind] || []).push(h); });
  for(const kind of Object.keys(byKind)){
    const hs = byKind[kind];
    if(useAI){
      const all = dataOf(kind);
      const seenL = {}, uniq = [];
      all.filter(x => ((x.__src == null ? 0 : x.__src) === 0)).forEach(x => {
        const t = String(dbMainText(kind, x) || '').trim();
        if(!t) return;
        const k = normTxt(t);
        if(!k || seenL[k]) return;
        seenL[k] = 1; uniq.push(t);
      });
      if(!uniq.length) continue;
      const sys = '你是文本查重助手。判断「待检」中的条目是否与「已有」中的条目表达同一件事（换词、换场景、简写都算重复）。严格只输出 JSON，不要解释。';
      const user =
        '【已有条目】\n' + uniq.map((t, i) => (i + 1) + '. ' + t).join('\n') + '\n\n' +
        '【待检条目】\n' + hs.map((h, i) => (i + 1) + '. ' + h.text).join('\n') + '\n\n' +
        '只输出 {"dup":[{"i":待检编号,"j":已有编号}]}；把重复的逐对列出，没有重复就输出 {"dup":[]}。';
      try{
        const raw = await callAI([{role:'system',content:sys},{role:'user',content:user}], 900, true);
        const o = extractJSON(raw);
        const arr = (o && Array.isArray(o.dup)) ? o.dup : [];
        arr.forEach(d => {
          const i = Number(d && d.i) - 1, j = Number(d && d.j) - 1;
          if(i >= 0 && i < hs.length && j >= 0 && j < uniq.length){
            found.push({kind: kind, id: hs[i].id, label: hs[i].text, with: uniq[j]});
          }
        });
      }catch(e){
        /* AI 这条路失败 → 该类退回本地算法，保证按钮始终可用 */
        hs.forEach(h => { const m = dbDupLocal(h); if(m) found.push({kind: kind, id: h.id, label: h.text, with: m.t}); });
      }
    }else{
      hs.forEach(h => { const m = dbDupLocal(h); if(m) found.push({kind: kind, id: h.id, label: h.text, with: m.t}); });
    }
  }
  dbDupBusy = false;
  const seen = {}, list = [];
  found.forEach(f => { const k = f.kind + '|' + f.id; if(!seen[k]){ seen[k] = 1; list.push(f); } });
  if(!list.length){ toast('检测完成：未发现重复的条目'); return; }
  const head = list.slice(0, 5).map(f =>
    '【' + (DB_FIELDS[f.kind] ? DB_FIELDS[f.kind].t : f.kind) + '】' + f.label).join('　');
  dialog('发现 ' + list.length + ' 条疑似重复',
    head + (list.length > 5 ? '　…等共 ' + list.length + ' 条' : '') +
    '　—— 确认后将删除以上条目。',
    [
      {t:'确认删除', pri:true, fn:() => {
        let n = 0;
        list.forEach(f => { if(dataDel(f.kind, f.id)) n++; });
        dbRender();
        toast('已清除 ' + n + ' 条重复条目');
      }},
      {t:'取消', plain:true}
    ]);
}

/* 「交互」是 ev 的一个筛选视图：存储、导入、导出、删除都落回 ev */
function dbStoreKind(){ return dbKind === 'choice' ? 'ev' : dbKind; }
function dbFmtText(k){
  const f = DB_FIELDS[k] || DB_FIELDS[dbStoreKind()];
  return '【' + f.t + '】导入格式\n' +
    '· 一条就写一个 JSON；多条用 [ ] 包成数组，或一行一条。\n' +
    '· 字段：' + f.req + '\n' +
    '· 示例：' + f.fmt;
}
function dbLabelOf(x){
  if(dbKind === 'epitaph'){
    const t = x.tag || x.ending || '通用';
    return '【' + t + '】' + (x.text || '').slice(0, 40) + ((x.text || '').length > 40 ? '…' : '');
  }
  return dbKind === 'ev' ? (x.stage + ' · ' + ((Array.isArray(x.o) && x.o.length) ? '【交互】' : '') + x.text)
    : dbKind === 'tal' ? ((RARE[x.rarity] || '') + ' ' + x.name + '　' + (x.good || ''))
    : dbKind === 'ach' ? (x.name + '　' + (x.desc || ''))
    : dbKind === 'end' ? (x.name + '　' + (x.desc || ''))
    : ('【' + x.name + '】　' + (x.desc || ''));
}
/* 单条详情：展示这条的完整内容（文字 + 全部配置字段） */
function dbDetailOf(x){
  const o = Object.assign({}, x);
  delete o.__src;                       // 内部标记，不给人看
  const srcName = (x.__src === 2) ? 'AI 加入' : '导入';
  return '[' + srcName + ']\n' + JSON.stringify(o, null, 2);
}
function dbRender(){
  let list = dbKind === 'choice'
    ? dataOf('ev').filter(x => x && Array.isArray(x.o) && x.o.length)
    : dataOf(dbKind);
  /* v0.1.4：按模式筛选 —— 后续模式的数据与地球online 不共用，
     因此这里只显示属于当前选中模式的条目（mode 缺省视为 earth）。 */
  if(dbMode && dbMode !== 'all'){
    list = list.filter(x => ((x && x.mode) || 'earth') === dbMode);
  }
  /* 只列这两类。下标必须与 __src 对齐（1 = 导入，2 = AI 加入），
     所以第 0 位仍然占着，但永远不会被渲染出来。 */
  const srcInfo = [
    {n:'', d:''},
    {n:'导入',   d:'你手动新增或导入的条目，可编辑、可删除、会进备份'},
    {n:'AI 加入', d:'结算时自动收进库的 AI 文案，可编辑、可删除、会进备份'}
  ];
  const groups = [0, 1, 2].map(s => list.filter(x => ((x.__src == null) ? 0 : x.__src) === s));
  /* 需求：本地数据整类不出现 —— 这里只有「导入」与「AI 加入」两类。
     计数也只报这两类的合计：不出现本地字眼，也不出现含本地的总数，
     别人看这个页面看不出库里还另有来源。 */
  const shown = [1, 2];
  const cap = DB_FIELDS[dbKind] ? DB_FIELDS[dbKind].t : '其他';
  const mine = groups[1].length + groups[2].length;
  $('#dbCnt').textContent = cap + ' · 共 ' + mine + ' 条（导入 ' +
    groups[1].length + ' · AI 加入 ' + groups[2].length + '）';
  $('#dbFmt').textContent = dbFmtText(dbKind);
  document.querySelectorAll('#dbSeg button').forEach(b => b.classList.toggle('on', b.dataset.t === dbKind));
  $('#dbOut').classList.add('hide');
  /* 两类都空时给引导，否则页面一片空白会让人以为库坏了 */
  if(!shown.some(s => groups[s].length)){
    $('#dbList').innerHTML = '<div class="dbempty">你的库里还没有条目。' +
      '上面粘 JSON 点「添加」或「导入」即可。</div>';
    renderTkStat();
    return;
  }
  // 两类来源各成一张可折叠的主题卡
  $('#dbList').innerHTML = shown.map(s => {
    const g = groups[s];
    const folded = dbFold[s] ? ' fold' : '';
    const head = '<div class="card dbcard' + folded + '" data-src="' + s + '">' +
      '<div class="chead tap"><span class="dtag src' + s + '">' + srcInfo[s].n + '</span>' +
      '<span class="dbn">' + g.length + ' 条</span>' +
      '<span class="arw">▾</span></div>' +
      '<div class="hint dbsub">' + srcInfo[s].d + '</div>' +
      '<div class="cbody">' + (g.length
        ? g.map(x => '<div class="dbrow" data-row="' + esc(x.id) + '">' +
            affTagOf(x) +
            '<span class="dt">' + esc(dbLabelOf(x)) + '</span>' +
            '<span class="darw">▾</span>' +
            (s === 0 ? '' : '<span class="dact" data-del="' + esc(x.id) + '">删除</span>') +
          '</div>' +
          '<div class="dbdet hide"><pre class="dbpre">' + esc(dbDetailOf(x)) + '</pre></div>'
        ).join('')
        : '<div class="dbempty">暂无条目</div>') + '</div></div>';
    return head;
  }).join('');
  renderTkStat();      // 文本体检卡的属性偏向分布
}
function dbParseInput(raw){
  const s = String(raw || '').trim();
  if(!s) return null;
  try{
    const j = JSON.parse(s);
    if(Array.isArray(j)) return j;
    return [j];
  }catch(e){}
  const out = [];
  const lines = s.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  for(const ln of lines){
    try{ out.push(JSON.parse(ln)); }catch(e){ return null; }
  }
  return out.length ? out : null;
}
/* 一个选项的归一：无 ok 视为无效项直接丢弃 */
function sanChoice(o){
  if(!o || typeof o !== 'object') return null;
  const k = String(o.k == null ? '' : o.k).trim().slice(0, 12);
  if(!k) return null;
  const r = {k: k};
  const fix = r2 => {
    if(!r2 || typeof r2 !== 'object') return null;
    const t = String(r2.t == null ? '' : r2.t).trim();
    if(!t) return null;
    const out = {t: t.slice(0, 120)};
    const e = cleanEff(r2.e || r2.effects);
    if(Object.keys(e).length) out.e = e;
    const tg = Array.isArray(r2.tag) ? r2.tag.filter(x => x != null).map(x => String(x).slice(0, 12)).slice(0, 3) : [];
    if(tg.length) out.tag = tg;
    const ut = Array.isArray(r2.untag) ? r2.untag.filter(x => x != null).map(x => String(x).slice(0, 12)).slice(0, 3) : [];
    if(ut.length) out.untag = ut;
    return out;
  };
  const ok = fix(o.ok);
  if(!ok) return null;
  r.ok = ok;
  const no = fix(o.no);
  if(no) r.no = no;
  if(o.j && typeof o.j === 'object'){
    const a = String(o.j.a == null ? '' : o.j.a).toUpperCase();
    if(SUBN[a] || (typeof ATTRS !== 'undefined' && ATTRS.some(x => x.k === a))){
      r.j = {a: a, v: Number(o.j.v) || 0};
    }
  }
  return r;
}
function dbNorm(kind, o){
  if(!o || typeof o !== 'object') return null;
  const it = JSON.parse(JSON.stringify(o));
  if(!it.id) it.id = kind + '_u' + Date.now() + Math.floor(Math.random() * 1000);
  if(kind === 'ev'){
    if(!it.stage || !it.text) return null;
    if(!Array.isArray(it.age)) it.age = STAGE_RANGE[it.stage] ? STAGE_RANGE[it.stage].slice() : [0, 3];
    it.weight = Number(it.weight) || 5;
    it.effects = it.effects || {};
    it.simple = it.simple || '';
    it.tags = it.tags || [];
    it.aff = sanAff(it.aff);          // patch54：属性偏向（主键或隐藏子键，可留空）
    /* 需求 27：性别编号（男 / 女 / 通用），隐藏字段，只用于抽取过滤。
       「每个事件都得有这个标签」—— 所以这里是必落：显式写的先认，
       没写的用词表推，实在推不出给「通用」（人人可遇）。 */
    it.sex = sanSex(it.sex) || sexJudge(it);
    /* patch54 新增三字段，全部可选 —— 不写就是旧行为，旧数据零迁移 */
    const rq = sanReq(it.req); if(rq) it.req = rq; else delete it.req;
    const sb = sanSubs(it.subs); if(sb) it.subs = sb; else delete it.subs;
    if(isFinite(Number(it.peak))) it.peak = Math.round(Number(it.peak)); else delete it.peak;
    if(it.once) it.once = 1; else delete it.once;
    /* 分支事件的选项归一：k 必填，ok 必填，j / no / tag / untag 选填。
       归一后写回 it.o，数据管理页里能直接看到，导入导出也不丢结构。 */
    if(Array.isArray(it.o)){
      it.o = it.o.map(sanChoice).filter(Boolean);
      if(!it.o.length) delete it.o;
    }
  }else if(kind === 'tal'){
    if(!it.name) return null;
    it.rarity = Number(it.rarity) || 0;
    it.effects = it.effects || {};
    it.hook = it.hook || {};
  }else if(kind === 'ach' || kind === 'end'){
    if(!it.name) return null;
    it.cond = it.cond || {};
    if(kind === 'ach') it.effects = it.effects || {};
  }else if(kind === 'epitaph'){
    /* 墓志铭：正文必填；tag/ending 用来适配结局，两者写哪个都行 */
    if(!it.text) return null;
    it.text = String(it.text);
    it.tag = it.tag || '';
    it.ending = it.ending || '';
    it.desc = it.desc || '';
    const a1 = Number(it.ageMin), a2 = Number(it.ageMax);
    if(isFinite(a1)) it.ageMin = a1; else delete it.ageMin;
    if(isFinite(a2)) it.ageMax = a2; else delete it.ageMax;
  }else{
    if(!it.name) return null;
  }
  return it;
}
function dbImportItems(items, silent){
  let ok = 0, bad = 0;
  const kk = dbStoreKind();
  (items || []).forEach(o => {
    const it = dbNorm(kk, o);
    if(!it){ bad++; return; }
    /* 交互分类里新增的条目必须真的带选项，否则它不会出现在这一栏 */
    if(dbKind === 'choice' && !(Array.isArray(it.o) && it.o.length)){ bad++; return; }
    if(!it.origin) it.origin = 'ext';   // 手动新增 / 导入 => 来源 = 外部
    dataPut(kk, it); ok++;
  });
  dbRender();
  if(!silent) toast('导入完成：成功 ' + ok + ' 条' + (bad ? '，忽略 ' + bad + ' 条（字段不合法）' : ''));
  return ok;
}
function dbExportText(){
  // 只导出「外部 + AI 加入」（本地内置数据由程序自带，不进文件）
  const items = dataOf(dbStoreKind())
    .filter(x => (x.__src || 0) !== 0)
    .filter(x => dbKind !== 'choice' || (Array.isArray(x.o) && x.o.length))
    .map(x => { const o = Object.assign({}, x); delete o.__src; return o; });
  return JSON.stringify({kind:'life-restart-data', ver: GAME_VER, type: dbKind, count: items.length,
    src: 'My Life, My Sim ' + GAME_VER, items: items}, null, 2);
}
function dbExportFile(){
  const str = dbExportText();
  const name = 'MyLifeMySim_' + DB_FIELDS[dbKind].t + '_' + GAME_VER + '.json';
  const r = androidSave(name, str);
  if(r.ok){
    toast('已导出到：' + r.path + (r.why === 'fallback'
      ? '（所选目录写入失败，已回退到「下载」）' : ''));
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([str], {type:'application/json'}));
  a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  toast('已导出：' + name + (r.why ? '；原生写入失败：' + r.why : ''));
}
function openDbPage(kind){
  if(kind) dbKind = kind;
  dbRender();
  $('#dbInput').value = '';
  $('#dbPage').classList.add('on');
  /* 数据管理页三张卡也用 lr_fold 记住折叠态，每次打开时回放 */
  foldApply();
}
const closeDbPage = () => exitLayer($('#dbPage'));
function bindDbUI(){
  $('#btnData').onclick = () => openDbPage();
  $('#dbBack').onclick = closeDbPage;
  $('#dbExp').onclick = dbExportFile;
  /* 「显示本地条目」开关已移除：本地数据整类不出现（需求变更） */
  document.querySelectorAll('#dbSeg button').forEach(b => {
    b.onclick = () => { dbKind = b.dataset.t; dbRender(); };
  });
  /* v0.1.4：模式筛选器交互 —— 点开向下展开，选中某模式后按该模式过滤数据 */
  (function bindModeFilter(){
    const bar = $('#dbModeBar'), btn = $('#dbModeBtn'), drop = $('#dbModeDrop');
    const tx = $('#dbModeTx');
    if(!bar || !btn || !drop) return;
    const renderOpts = () => {
      drop.innerHTML = MODES.map(m =>
        '<button class="mfopt' + (dbMode === m.id ? ' sel' : '') + '" data-m="' + m.id + '">' +
        esc(m.n) + (m.cur ? '<small>当前</small>' : '') + '</button>'
      ).join('') +
      '<button class="mfopt" data-m="all"' + (dbMode === 'all' ? ' sel' : '') + '>全部模式<small>不筛选</small></button>' +
      '<button class="mfopt" disabled>更多模式即将开放</button>';
    };
    const syncTx = () => {
      const m = MODES.find(x => x.id === dbMode);
      tx.textContent = dbMode === 'all' ? '全部模式' : (m ? m.n : '地球online');
    };
    btn.onclick = e => { e.stopPropagation(); renderOpts(); bar.classList.toggle('on'); };
    drop.onclick = e => {
      const o = e.target.closest('.mfopt[data-m]');
      if(!o) return;
      dbMode = o.dataset.m;
      bar.classList.remove('on');
      syncTx(); dbRender();
    };
    document.addEventListener('click', e => {
      if(!e.target.closest('#dbModeBar')) bar.classList.remove('on');
    });
    renderOpts(); syncTx();
  })();
  $('#dbList').onclick = e => {
    // 先看是不是点了来源卡的折叠头
    const hd = e.target.closest('.dbcard > .chead');
    if(hd){
      const card = hd.parentElement;
      const s = Number(card.dataset.src) || 0;
      card.classList.toggle('fold');
      dbFold[s] = card.classList.contains('fold') ? 1 : 0;
      return;
    }
    // 点条目本身 → 展开/收起该条的完整内容
    const rw = e.target.closest('.dbrow');
    if(rw && !e.target.closest('[data-del]')){
      const det = rw.nextElementSibling;
      if(det && det.classList.contains('dbdet')){
        det.classList.toggle('hide');
        rw.classList.toggle('on');
      }
      return;
    }
    const el = e.target.closest('[data-del]');
    if(!el) return;
    const id = el.getAttribute('data-del');
    if(isLocalOnly(dbStoreKind(), id)){ toast('该条目不可删除'); return; }
    dialog('删除条目', '将从当前内容库中移除该条目（可随时清空数据重新开始）。', [
      {t:'确认删除', pri:true, fn:() => {
        if(!dataDel(dbStoreKind(), id)){ toast('该条目不可删除'); return; }
        dbRender(); toast('已删除');
      }},
      {t:'取消', plain:true}
    ]);
  };
  $('#dbAdd').onclick = () => {
    const items = dbParseInput($('#dbInput').value);
    if(!items){ toast('格式错误：不是合法的 JSON'); return; }
    const ok = dbImportItems(items);
    if(ok) $('#dbInput').value = '';
  };
  $('#dbImp').onclick = () => {
    const items = dbParseInput($('#dbInput').value);
    if(!items){ toast('格式错误：不是合法的 JSON'); return; }
    dbImportItems(items);
    $('#dbInput').value = '';
  };
  $('#dbCopy').onclick = () => {
    const out = $('#dbOut');
    out.textContent = dbExportText();
    out.classList.remove('hide');
  };
  $('#dbFile').onclick = dbExportFile;
  /* 分步入口（与卡头「开始体检」并存，想单独跑某一步时用） */
  $('#dbDedup').onclick = dbDedupScan;
  const bAff = $('#dbAffFill'); if(bAff) bAff.onclick = dbAffFill;
  /* 文本体检：卡头一个「开始体检」跑完两件事（查重 → 补写属性偏向）。
     查重会先弹确认框逐条处理，所以这里 await 完再接着补写。 */
  const tkRun = $('#dbTkRun');
  if(tkRun) tkRun.onclick = async () => {
    await dbDedupScan();
    dbAffFill();
  };
  /* 数据管理页的卡片折叠：与设置页同一套 foldToggle（卡头内若点到按钮则不折叠） */
  document.querySelectorAll('#dbPage .card[data-ck] > .chead').forEach(h => {
    h.onclick = e => {
      if(e.target.closest('button')) return;
      foldToggle(h.closest('.card[data-ck]'));
    };
  });
}
function rankOf(sc){
  if(sc >= 190) return ['SSS','传奇人生，后世会为你立传'];
  if(sc >= 150) return ['S','人生赢家，你活成了别人羡慕的样子'];
  if(sc >= 115) return ['A','体面地过完了一生，得失都有'];
  if(sc >= 80)  return ['B','普通但不平庸，你尽力了'];
  if(sc >= 50)  return ['C','起落参半，勉强算是活明白了'];
  if(sc >= 25)  return ['D','辛苦了一辈子，好在熬过来了'];
  return ['E','这一生太短，也太难了'];
}
/* 就地总结卡：死亡后先把这一生的关键信息铺在日志下面，
   用户看完点「立即总结这一生」才进结算页。 */
/* 需求 10 连带项：结算改按「一年一组事」看
   以前一年只有一件事，日志条数就等于年数；现在一年 2~6 件，
   再只报「共经历 N 件事」就看不出「活了多少年、每年几件」。
   这里统一算一份生涯口径，死亡小结卡与结算页共用。 */
function lifeSpanStat(){
  const logs = (S && S.logs) || [];
  const years = Math.max(1, Math.round((S && S.age) || 0) + 1);
  const byStage = {};
  STAGES.forEach(st => { byStage[st] = 0; });
  logs.forEach(l => {
    const st = stageOf(Math.round(l.age));
    if(byStage[st] != null) byStage[st]++;
  });
  const evs = logs.length;
  return { years: years, evs: evs, perYear: Math.round(evs / years * 10) / 10, byStage: byStage };
}
/* 结算页与战绩回看共用的一段 HTML：属性行。
   条形基准 20 为满格（超出截断），涨跌相对「开局基线」。
   两处取值来源不同（实时 S.attr / 历史快照 r.attr），所以值由调用方算好传进来。 */
function attrRowHTML(a, v, b){
  const d = isFinite(b) ? Math.round((v - b) * 10) / 10 : 0;
  const w = Math.max(3, Math.min(100, v / 20 * 100));
  const ds = d > 0 ? '<span class="od up">+' + d + '</span>'
    : (d < 0 ? '<span class="od dn">' + d + '</span>' : '<span class="od"></span>');
  return '<div class="ovrow"><span class="on1">' + a.n + '</span>' +
    '<span class="obar"><i style="width:' + w + '%"></i></span>' +
    '<span class="ov">' + v + '</span>' + ds + '</div>';
}
/* 结算页与战绩回看共用：属性面板（基础六维 + 隐藏项分组） */
function renderAttrPanel(el, attr, attr0){
  if(!el) return;
  const a0 = attr0 || {}, src = attr || {};
  const rowOf = a => attrRowHTML(a, Math.round((Number(src[a.k]) || 0) * 10) / 10, Number(a0[a.k]));
  el.innerHTML =
    '<div class="ovg">基础属性</div>' + ATTRS.map(rowOf).join('') +
    '<div class="ovg">隐藏属性</div>' + HIDDEN.filter(a => !a.legacy).map(rowOf).join('');
}
/* 结算页与战绩回看共用：「这一年几件事」按阶段网格 */
function renderYearGrid(el, years, evs, byStage){
  if(!el) return;
  const perY = Math.round(evs / Math.max(1, years) * 10) / 10;
  el.innerHTML =
    '<div class="ovg">这一年几件事（共 ' + years + ' 年 · ' + evs + ' 件 · 年均 ' + perY + ' 件）</div>' +
    '<div class="yrgrid">' + STAGES.map(st => {
      const n = Math.round((byStage || {})[st] || 0);
      const rg = STAGE_RANGE[st] || [0, 0];
      const yn = Math.max(1, rg[1] - rg[0] + 1);
      return '<div class="yrcell"><span>' + st + '</span><b>' + n + '</b>' +
        '<i> ' + yn + ' 年 · 年均 ' + (Math.round(n / yn * 10) / 10) + ' 件</i></div>';
    }).join('') + '</div>';
}
/* 离开「死亡待结算」状态：新开一局 / 读档时把结算残留清干净 */
function resetEndUI(){
  const dc = $('#deathCard');
  if(dc){ dc.classList.add('hide'); dc.innerHTML = '' }
  const eb = $('#endbar'); if(eb) eb.classList.add('hide');
  const pb = $('#playbar'); if(pb) pb.classList.remove('hide');
}
function renderDeathCard(){
  const sc = scoreOf();
  const [rk0] = rankOf(sc);
  const dbEnd = dbEndingOf();
  const rk = dbEnd ? dbEnd.n : rk0;
  const a = S.attr;
  /* ALLA = 6 主属性 + 4 隐藏项，后三项 EQ / WIL / MH 已退役（S.attr 里没有这三个键，
     排序恒取 0）—— 死亡卡片只该显示玩家真正拥有的属性，故按主键过滤掉退役项。 */
  const top = ALLA.filter(x => !x.legacy).slice()
    .sort((x, y) => (a[y.k] || 0) - (a[x.k] || 0)).slice(0, 6);
  const el = $('#deathCard');
  /* 同一份统计一次算好，避免在拼串里反复调用（每次都要遍历 logs） */
  const ls = lifeSpanStat();
  el.innerHTML =
    '<div class="dcT">' + Math.round(S.age) + ' 岁，你的一生在这里停下了</div>' +
    '<div class="dcS">' + stageOf(S.age) + ' · ' + era.n + '｜共走过 ' + ls.years + ' 年、经历 ' + ls.evs + ' 件事（年均 ' + ls.perYear + ' 件）' +
    '｜留下 ' + S.tags.length + ' 个标签</div>' +
    '<div class="dcR">' + esc(rk) + '</div>' +
    '<div class="dcD">综合评分 ' + sc + '（' + rk0 + ' 档' + (dbEnd ? '，命中专属结局' : '') + '）</div>' +
    '<div class="dcGrid">' + top.map(x =>
      '<div>' + x.n + '<b>' + Math.round(a[x.k] || 0) + '</b></div>').join('') + '</div>' +
    '<div class="dcHint">这一生已经写完了。<br>点下面的「立即总结这一生」查看完整结算与墓志铭。</div>';
  el.classList.remove('hide');
}
/* 用户点「立即总结」后：先算分、铺好结算页，再切过去 */
async function openSummary(){
  if(!S) return;
  /* 只有「已死、且还没结算过」的这一局才能结算：
     ① 死亡卡片停留期间若重开，S 已换成新局，此刻结算会把新局判死；
     ② 重复点「立即总结」会重复 dataPut 同一批 AI 结局 / 天赋，必须只走一次。 */
  if(!S.dead || S.summarized) return;
  S.summarized = true;
  running = false; gen++; setRunUI();
  const sc = scoreOf();
  const [rk0, desc0] = rankOf(sc);
  const dbEnd = dbEndingOf();
  S.ending = dbEnd ? dbEnd.n : rk0;
  let rk = dbEnd ? dbEnd.n : rk0;
  let desc = dbEnd ? dbEnd.d : desc0;
  const newAch = checkAch();   // 死亡结算这一刻统一检测成就
  /* v0.0.2：本局没命中任何已有专属结局时，让 AI 按这一局真实面貌新写一个。
     生成频率同样受 AI 占比滑条控制（0% 时不生成）；失败静默，退回评级称号。 */
  if(!dbEnd && aiReady() && aiRatioT() > 0){
    const pr0 = attrProfile();
    const aiEndNew = await aiGenEnding(
      '享年 ' + Math.round(S.age) + ' 岁｜' + ((era && era.n) || '') + '｜' + stageOf(S.age) + '离世\n' +
      '最终属性：' + ALLA.filter(x => !x.legacy).map(x => x.n + ' ' + Math.round(S.attr[x.k] || 0)).join('、') + '\n' +
      '主导属性：' + pr0.dom + '｜状态标签：' + ((S.tags || []).length ? S.tags.join('、') : '无') + '\n' +
      '综合评分：' + sc);
    if(aiEndNew && aiEndNew.n){
      rk = aiEndNew.n; desc = aiEndNew.d; S.ending = aiEndNew.n;
      /* 入库：cond 绑本局的享年与主导属性，保证下一局只有相似的人生才会命中它，
         不会把内置结局全盖掉。 */
      try{
        const domKey = (ATTRS.find(x => x.n === pr0.dom) || {}).k;
        const cnd = {age: [Math.max(0, Math.round(S.age) - 5), Math.round(S.age) + 5]};
        if(domKey){ cnd.allMin = {}; cnd.allMin[domKey] = Math.max(0, Math.round(S.attr[domKey] || 0) - 3); }
        const it = dbNorm('end', {name: aiEndNew.n, desc: aiEndNew.d, cond: cnd, rank: ''});
        if(it){ it.origin = 'ai'; dataPut('end', it); }
      }catch(e){}
    }
  }
  /* v0.1.4: 结算时自动把本局的 AI 结局/天赋入库（标 origin='ai'）。
     这里直接用上面那份 dbEnd（同一函数、无副作用），不再重复求值、也不再遮蔽同名变量。 */
  if(S && S.ending && aiReady()){
    if(dbEnd && dbEnd.origin === 'ai'){ dataPut('end', dbEnd); }
    const talPool = (S.talents || []).map(id => talById(id)).filter(t => t && t.origin === 'ai');
    talPool.forEach(t => { dataPut('tal', t); });
  }
  $('#ovRank').textContent = rk;
  $('#ovRankDesc').textContent = desc + '（综合评分 ' + sc + ' · ' + rk0 + ' 档）';
  /* openSummary 里同一份统计只算一次 */
  const ls0 = lifeSpanStat();
  $('#ovSub').textContent = '享年 ' + Math.round(S.age) + ' 岁 · ' + era.n + ' · ' + stageOf(S.age) + '离世' +
    ' · 共走过 ' + ls0.years + ' 年、经历 ' + ls0.evs + ' 件事（年均 ' + ls0.perYear + ' 件）';
  /* 属性面板：基础六维 / 隐藏四项分组，带条形与「相对开局」的涨跌 */
  renderAttrPanel($('#ovStats'), S.attr, S.attr0);
  /* 深渊值：被拒绝的世界线总数 + 来源拆解 */
  const ab = S.abyss || {};
  renderAbyss($('#ovAbyss'), ab, abyssTotal());
  /* 需求 10 连带项：一年一组事 —— 按阶段列出「活了多少年 / 发生多少件」，
     让玩家一眼看出这一年几件事的节奏，而不是只有一行总数。 */
  const ls = lifeSpanStat();
  renderYearGrid($('#ovYears'), ls.years, ls.evs, ls.byStage);
  $('#ovTags').innerHTML = S.tags.length ? S.tags.map(t => '<span class="chip">' + esc(t) + '</span>').join('')
    : '<span class="chip">无标签</span>';
  /* 墓志铭底稿：先按本局结局从「墓志铭」库里挑一条本地/AI 的文案，
     挑不到再退回原来的本地拼串 —— 这样没配 AI 的玩家也有墓志铭可看。 */
  const epiPick = epitaphFor(rk, rk0, S.tags, Math.round(S.age));
  let text = epiPick && epiPick.text
    ? epiPick.text
    : ('综合评分 ' + sc + '。' + S.talents.map(i => '【' + talName(i) + '】').join('') +
       '的一生就这样结束了。' + (S.tags.length ? '他留下过' + S.tags.join('、') + '的痕迹。' : ''));
  $('#ovText').textContent = text;
  /* 战绩快照：这一局专属、不可变。先落一版本地墓志铭，AI 写完后覆盖成 AI 版。 */
  const rec = {
    at: Date.now(), age: Math.round(S.age), sc: sc, rank: rk0, ending: rk,
    tags: (S.tags || []).slice(), epitaph: text,
    attr: Object.assign({}, S.attr),
    /* 回看用：把日志、开局基线、深渊值也留一份，才能在历史战绩里重放整张结算页 */
    attr0: Object.assign({}, S.attr0 || {}),
    logs: (S.logs || []).map(l => ({age: l.age, text: l.text, kind: l.kind, delta: l.delta, src: l.src})),
    years: lifeSpanStat().years,
    abyss: Object.assign({}, S.abyss || {})
  };
  const recIdx = pushRec(rec);   // 由 pushRec 回传索引，避免硬编码
  renderAiDbRow();     // 显示「本局待入库 N 条」，并把一键入库按钮复位
  /* v0.1.3 A：正常结算恢复底部两个按钮（回看态会临时收成单个「返回」） */
  { const m = $('#ovMenu'); if(m) m.textContent = '返回主界面';
    const a = $('#ovAgain'); if(a) a.classList.remove('hide'); }
  goState('GAME_OVER');
  if(newAch.length) toast('达成成就：' + newAch.join('、'));
  if(aiReady()){
    $('#ovText').textContent = text + '\n\n（AI 正在撰写墓志铭…）';
    try{
      const raw = await callAI([
        {role:'system', content:'你是一位中文悼词作家，文风克制、有文学感，只输出墓志铭正文，不要任何解释。'},
        {role:'user', content:'为下面这个人生写一段 80-140 字的墓志铭。\n' + ctxBrief() +
          '\n享年 ' + Math.round(S.age) + ' 岁，综合评分 ' + sc + '。'}
      ], 500, true);
      if(raw && raw.trim()){
        const aiEpi = raw.trim();
        $('#ovText').textContent = aiEpi + '\n\n—— 综合评分 ' + sc;
        /* ① 回填进这一局的战绩快照（历史战绩里看到的就是最终墓志铭） */
        const o = getRecs();
        if(o.list[recIdx]){ o.list[recIdx].epitaph = aiEpi; o.list[recIdx].epiAI = true; setRecs(o); }
        if(REC_VIEW != null) openRecView(REC_VIEW);   // 正在回看这一局：同步刷新
        /* ② 顺手存进「墓志铭」内容库（AI 加入），文本带上结局 tag，方便下次被同结局的局抽到 */
        try{
          const it = dbNorm('epitaph', {
            text: aiEpi, tag: rk, ending: rk, desc: 'AI 为「' + rk + '」写的墓志铭，享年 ' + Math.round(S.age) + ' 岁'
          });
          if(it){ it.origin = 'ai'; dataPut('epitaph', it); }
        }catch(e){}
      }
    }catch(e){ /* 保留本地文案 */ }
  }
}
async function die(my, why){
  if(!S || S.dead) return;
  /* 竞态守卫：my 是调用方持有的「哪一局」快照。若这期间玩家已重开 / 读档 / 离开，
     gen 早就往前走了，这条迟到的死亡回调必须作废 —— 否则会把刚出生的一局判死。
     兼容旧签名单参写法 die(why)：首参不是数字时一律视为死因，不参与局次比对。 */
  if(typeof my !== 'number'){ if(why === undefined) why = my; my = undefined; }
  if(my !== undefined && my !== gen) return;
  running = false; gen++; setRunUI();
  S.dead = true;
  /* 需求：死亡必须有理由，理由不一定是最后那条事件，且理由之后不再有事件。
     这里在宣告结束之前，先落一条「死因」日志 —— 它就是最后一条，后面只有小结。 */
  S.deathWhy = String(why || '').trim() || deathWhyOf(S.age);
  if(S.logs && S.logs.length){
    /* 死因附着在最后一条事件上（不另起一行事件），读起来是「那件事之后，他走了」 */
    const last = S.logs[S.logs.length - 1];
    last.why = S.deathWhy;
  }
  /* 需求 5：先把队列里「已生成、还没轮到用」的 AI 事件收割进 S.aiMade，
     再清队列 —— 下面的 scrollClean() 会把 queue 清空，顺序反了就会一条都捞不到。 */
  harvestAiQueue();
  scrollClean();
  const sc = scoreOf();
  const [rk0] = rankOf(sc);
  const dbEnd = dbEndingOf();
  const rk = dbEnd ? dbEnd.n : rk0;
  // 记一次通关 + 解锁图鉴（这些即时生效，不影响是否马上看结算）
  const dex = getDex(); dex.runs = (dex.runs || 0) + 1; setDex(dex);
  learn(S.talents, S.tags);
  if(Math.round(S.age) > (dex.best || 0)){ dex.best = Math.round(S.age); setDex(dex); }
  lsDel(SAVE_HIST);
  // ① 在日志末尾就地总结，播放条换成「立即总结这一生」
  /* 需求：死因是「最后一条」，写在结束语之前；它之后不再有任何事件。 */
  pushLog(Math.round(S.age), S.deathWhy, 'bad', '');
  pushLog(Math.round(S.age), '这一生结束了。' + (dbEnd ? '「' + rk + '」' : '综合评分 ' + sc + '，' + rk + ' 档') +
    '—— 往下看这份小结，准备好后再进结算。', 'sys', '');
  renderDeathCard();
  $('#playbar').classList.add('hide');
  $('#endbar').classList.remove('hide');
  setStatus('已结束 · 看完小结点「立即总结这一生」');
  renderPlayHead();
  scrollLogToEnd();
  /* 需求 5：这一局已经生成、但还没来得及被用到的 AI 事件（队列里剩余的），
     连同已经用过的，一起交给结算页的「AI 文案入库」开关处理。
     反正算力已经花过了，勾了入库就一并收进内容库，没勾就整批丢弃。 */
  // ② 不再自动弹结算页，等用户点按钮（openSummary）
}
/* 把队列里剩余的 AI 事件并入 S.aiMade（已用过的在 tick 里已经进过了） */
function harvestAiQueue(){
  if(!S) return 0;
  if(!Array.isArray(S.aiMade)) S.aiMade = [];
  const have = {};
  S.aiMade.forEach(z => { have[z.t] = 1; });
  let k = 0;
  (queue || []).forEach(q => {
    if(!q || q.src !== 'AI' || !q.t) return;
    if(have[q.t]) return;
    have[q.t] = 1;
    S.aiMade.push({t: q.t, age: Math.round(Number(q.age) || 0), e: q.e || {}, aff: q.aff || [], sex: q.sex || ''});
    k++;
  });
  return k;
}
function scrollClean(){ queue = []; }

/* ===== 需求 A：结算页「AI 文案入库」===== */
let AI_DB_DONE = false;   // v0.1.3 C：本局是否已经点过「一键入库」（点了就不再丢弃）
/* 本局用过的 AI 分支事件（tick 里已记进 S.aiMade，这里只负责去重展示） */
function aiMadeCount(){
  return (S && Array.isArray(S.aiMade)) ? S.aiMade.length : 0;
}
function renderAiDbRow(){
  if(REC_VIEW != null) return;   // 回看态：不碰入库行
  AI_DB_DONE = false;            // v0.1.3 C：新的一轮结算，重新允许一键入库
  const n = aiMadeCount();
  const el = $('#ovAiDbN');
  if(el) el.textContent = n ? ('本局有 ' + n + ' 条 AI 文案待入库') : '本局没有 AI 生成的文案';
  const row = $('#ovAiDbRow');
  if(row) row.classList.remove('off');
  const b = $('#ovAiDbBtn');
  if(b){ b.disabled = !n; b.textContent = '一键入库'; }
}
/* v0.1.3 C：一键入库 —— 点了才收进内容库，随即变「已入库」并禁用，防重复点击 */
function aiDbCollect(){
  if(REC_VIEW != null || AI_DB_DONE) return 0;
  const k = collectAiToDb();
  AI_DB_DONE = true;
  const b = $('#ovAiDbBtn');
  if(b){ b.disabled = true; b.textContent = '已入库'; }
  const el = $('#ovAiDbN');
  if(el) el.textContent = k ? ('已把本局 ' + k + ' 条 AI 文案收进内容库') : '本局没有可入库的 AI 文案';
  toast(k ? ('已收进内容库 ' + k + ' 条 AI 文案') : '本局没有可入库的 AI 文案');
  return k;
}
/* 离开结算页时统一收尾：没点「一键入库」就整批丢弃（并提示一次） */
function flushAiDb(){
  if(REC_VIEW != null) return;   // 回看态：不入库、不丢弃
  if(!S || AI_DB_DONE) return;   // 已经一键入库过就别再清
  const n = Array.isArray(S.aiMade) ? S.aiMade.length : 0;
  if(n){ S.aiMade = []; toast('已丢弃 ' + n + ' 条 AI 文案（未点「一键入库」）'); }
}

/* ===== 需求 B：可被提前唤醒的等待 ===== */
function waitWake(ms){
  return new Promise(res => {
    let done = false;
    const fin = () => {
      if(done) return;
      done = true; clearTimeout(tid);
      if(WAKE === fin) WAKE = null;
      res();
    };
    const tid = setTimeout(fin, ms);
    WAKE = fin;
  });
}
/* ========== 主界面 ========== */
function refreshMenu(){
  /* 「继续游戏」只在有存档时出现；没有就整块隐藏（隐藏后下面的按钮自动上移，
     于是按钮顺序天然满足：有档 继续→开始→图鉴→设置，无档 开始→图鉴→设置）。 */
  const h = histOf();
  const c = $('#mCont');
  if(c) c.classList.toggle('hide', !(h && h.S && !h.S.dead));
  /* 主菜单底部原有一块版本 / 通关 / 寿命信息，按需求整块移除，这里不再渲染。 */
}
/* ========== 历史战绩 ==========
   每打完一局，把「立即总结」那份结果整份存下来（享年 / 评分 / 结局 / 墓志铭 / 标签 / 属性）。
   跨版本累积、不带版本号，靠 lsCompat 前缀回退；只保留最近 REC_MAX 场。 */
const SAVE_REC = 'lr_records';
/* 战绩现在要能点开回看（连日志、开局基线、深渊值一起留档），
   条目更重，保留场次从 20 降到 5，免得 localStorage 越攒越胖。 */
const REC_MAX = 5;
function getRecs(){
  try{ const o = JSON.parse(lsCompat(SAVE_REC, 'lr_records_') || 'null'); return (o && Array.isArray(o.list)) ? o : {list: []}; }
  catch(e){ return {list: []}; }
}
function setRecs(o){ lsSet(SAVE_REC, JSON.stringify(o)); }
/* 追加一条战绩（最新的排最前；超出上限丢最旧）；返回本条在 list 中的索引，-1 表示未写入 */
function pushRec(rec){
  if(!rec) return -1;
  const o = getRecs();
  o.list = [rec].concat(o.list || []);
  if(o.list.length > REC_MAX) o.list.length = REC_MAX;
  setRecs(o);
  return 0;                    // 本条恒排在 list[0]
}
/* ===== 历史战绩：点开某一条 → 回看那一局的完整结算 =====
   纯只读：只把快照灌进结算页的视图，不重算分数、不写存档、不碰「AI 文案入库」。 */
let REC_VIEW = null;
function openRecView(i){
  REC_VIEW = null;               // 先清掉：任何提前返回都不会留下脏状态
  const d = getRecs();
  const r = (d.list || [])[i];
  if(!r) return false;
  const sc = Number(r.sc) || 0;
  const rk = r.ending || r.rank || '—';
  const rk0 = r.rank || rk;
  const age = (r.age == null ? 0 : Number(r.age));
  $('#ovRank').textContent = rk;
  $('#ovRankDesc').textContent = (r.ending && r.ending !== rk0)
    ? (rk + '（综合评分 ' + sc + ' · ' + rk0 + ' 档）')
    : ('综合评分 ' + sc + ' · ' + rk0 + ' 档');
  const logs = r.logs || [];
  /* 年数优先用当时留档的；没留档就按结算同款口径（年龄 + 1）现算 */
  const ry = Number(r.years);
  const years = isFinite(ry) && ry > 0 ? Math.max(1, ry) : Math.max(1, age + 1);
  const evs = logs.length;
  const perY = Math.round(evs / years * 10) / 10;
  $('#ovSub').textContent = '享年 ' + age + ' 岁 · ' + stageOf(age) + '离世' +
    ' · 共走过 ' + years + ' 年、经历 ' + evs + ' 件事（年均 ' + perY + ' 件）';
  renderAttrPanel($('#ovStats'), r.attr, r.attr0);
  const ab = r.abyss || {};
  renderAbyss($('#ovAbyss'), ab, abyssSum(ab));
  const byStage = {};
  STAGES.forEach(st => { byStage[st] = 0; });
  logs.forEach(l => { const st = stageOf(Math.round(l.age)); if(byStage[st] != null) byStage[st]++; });
  renderYearGrid($('#ovYears'), years, evs, byStage);
  $('#ovTags').innerHTML = (r.tags && r.tags.length)
    ? r.tags.map(t => '<span class="chip">' + esc(t) + '</span>').join('')
    : '<span class="chip">无标签</span>';
  $('#ovText').textContent = r.epitaph || '（这一局的墓志铭没有留下）';
  /* v0.1.3 A2：回看态不再隐藏「AI 文案入库」行 —— 保持只读呈现，不提供补收入口
     （回看态是纯只读，不写存档、不产内容库条目，这是既有契约） */
  const n1 = $('#ovAiDbN');
  if(n1) n1.textContent = aiMadeCount()
    ? ('历史记录 · 本局曾产出 ' + aiMadeCount() + ' 条 AI 文案（只读）')
    : '历史记录 · 本局没有 AI 生成的文案';
  const row = $('#ovAiDbRow'); if(row) row.classList.remove('off');
  const rBtn = $('#ovAiDbBtn');
  if(rBtn){ rBtn.disabled = true; rBtn.textContent = '回看态只读'; }
  /* v0.1.3 A1：回看态底部两个按钮本就都返回战绩列表，合并成单个整行「返回」 */
  const m2 = $('#ovMenu'); if(m2) m2.textContent = '返回';
  const a2 = $('#ovAgain'); if(a2) a2.classList.add('hide');
  goState('GAME_OVER');
  resetEndUI();      // 清掉上一局残留的死亡卡与「立即总结」按钮条（只动这两块，不碰日志）
  window.scrollTo(0, 0);
  REC_VIEW = i;      // 全部铺好、确认不会抛错之后，才置成回看态
  return true;
}
/* 回看态退出：回到历史战绩列表 */
function closeRecView(){
  if(REC_VIEW == null) return false;
  REC_VIEW = null;
  renderRec();
  goState('REC');
  return true;
}
function renderRec(){
  const d = getRecs();
  const list = d.list || [];
  const el = $('#rcList'); if(!el) return;
  $('#rcSub').textContent = list.length ? ('共 ' + list.length + ' 场') : '还没有记录';
  if(!list.length){
    el.innerHTML = '<div class="rcempty">还没有打完过任何一局。<br>打完一局、点「立即总结这一生」之后，这里会留下一条记录。</div>';
    return;
  }
  el.innerHTML = '<div class="rchint">点任意一条，回看那一局的完整结算。</div>' + list.map((r, ri) => {
    const rk = esc(r.rank || '—');
    const end = r.ending ? esc(r.ending) : '';
    /* ending 与 rank 相同时，卡片标题只写一次，不重复展示同一个名字 */
    const same = !!r.ending && r.ending !== r.rank;
    const chips = (r.tags || []).map(t => '<span class="rcchip">' + esc(t) + '</span>').join('');
    const d0 = r.at ? new Date(r.at) : null;
    const when = d0 ? (d0.getFullYear() + '-' + String(d0.getMonth() + 1).padStart(2, '0') + '-' +
      String(d0.getDate()).padStart(2, '0') + ' ' + String(d0.getHours()).padStart(2, '0') + ':' +
      String(d0.getMinutes()).padStart(2, '0')) : '';
    return '<div class="rccard tap" data-rec="' + ri + '">' +
      '<div class="rctop"><span class="rcrank">' + rk + '</span>' +
        '<span class="rcname">' + (same ? end : (end || rk)) + '</span>' +
        '<span class="rcage">享年 ' + (r.age == null ? '—' : r.age) + ' 岁</span></div>' +
      '<div class="rcmeta">' + (same ? ('评级 ' + rk + ' · ') : '') +
        '综合评分 ' + (r.sc == null ? '—' : r.sc) + (when ? ('　·　' + when) : '') + '</div>' +
      (chips ? ('<div class="rcchips">' + chips + '</div>') : '') +
      (r.epitaph ? ('<div class="rcepi">' + esc(r.epitaph) + '</div>') : '') +
    '</div>';
  }).join('');
}
function renderDex(){
  const d = getDex();
  const got = d.ach || [];
  const achs = dataOf('ach').map(a => ({n: a.name, s: a.simple || '', ok: got.indexOf(a.id) >= 0}));
  $('#dxAch').innerHTML = achs.map(a =>
    '<div class="dexitem"><span class="achdot' + (a.ok ? ' on' : '') + '"></span><span class="no">' + esc(a.n) +
    (a.s ? '　<span style="opacity:.7;font-size:11.5px">' + esc(a.s) + '</span>' : '') +
    '</span><span class="pill">' + (a.ok ? '已达成' : '未达成') + '</span></div>').join('');
  $('#dxSub').textContent = '已通关 ' + (d.runs || 0) + ' 次';
  /* 分母 / 列表都用去重视图：同名天赋只算一条，避免重复图标与虚高分母 */
  $('#dxTalCnt').textContent = TAL_UNIQ.filter(t => talUnlockedIn(d.tal, t)).length + '/' + TAL_UNIQ.length;
  $('#dxTal').innerHTML = TAL_UNIQ.map(t => {
    const got = talUnlockedIn(d.tal, t);
    return '<div class="dexitem"><span class="rare r' + t.r + '">' + RARE[t.r] + '</span>' +
      '<span class="no">' + (got ? esc(t.n) + '　' + esc(t.good) : '？？？') + '</span></div>';
  }).join('');
  const tn = tagNames();
  $('#dxTagCnt').textContent = (d.tag || []).length + '/' + tn.length;
  $('#dxTag').innerHTML = tn.map(t => {
    const got = (d.tag || []).indexOf(t) >= 0;
    return '<div class="dexitem"><span class="no">' + (got ? '【' + esc(t) + '】　' + esc(TAGS[t].d) : '未解锁') + '</span></div>';
  }).join('');
}

/* ========== 存档：导出 / 导入 ========== */
/* 统一走原生导出。返回 {ok, path, why}：
   why='fallback' 表示「已选过目录，但写入失败、静默落到了下载」——
   这正是以前让人以为「改路径没用」的现象，现在会明确提示出来。 */
function androidSave(name, str){
  const r = { ok:false, path:'', why:'' };
  if(!(window.Android && window.Android.saveFile)) return r;
  let p = '';
  try{ p = window.Android.saveFile(name, str) || ''; }
  catch(e){ r.why = '' + e; return r; }
  if(!p){
    try{ if(window.Android.getSaveError) r.why = window.Android.getSaveError() || ''; }catch(e){}
    return r;
  }
  r.ok = true; r.path = p;
  if(p.indexOf('下载/') === 0){
    try{ if(window.Android.getSaveDir && window.Android.getSaveDir()) r.why = 'fallback'; }catch(e){}
  }
  return r;
}
function exportSave(){
  const withKey = swxGet('expKey');
  const c = getCfg();
  const cfgOut = JSON.parse(JSON.stringify(c));
  Object.keys(cfgOut.profiles || {}).forEach(n => {
    const p = cfgOut.profiles[n];
    if(p && p.key && !withKey) p.key = '***';
  });
  const data = {
    kind:'life-restart-save', ver: GAME_VER, exportedAt: new Date().toISOString(),
    progress: S ? {
      attr: S.attr, tags: S.tags, talents: S.talents, age: Math.round(S.age),
      diff: S.diff, era: S.era, lifespan: S.lifespan, flags: S.flags, used: S.used,
      logs: S.logs.slice(-200)
    } : null,
    dex: getDex(),
    cfg: cfgOut,
    db: dbxGet(),
    content: {
      ev: dataOf('ev').length, tal: dataOf('tal').length, ach: dataOf('ach').length,
      end: dataOf('end').length, tag: dataOf('tag').length
    }
  };
  const str = JSON.stringify(data, null, 2);
  const blob = new Blob([str], {type:'application/json'});
  const d = new Date();
  const name = 'MyLifeMySim_存档_' + d.getFullYear() +
    String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') + '.json';
  const r = androidSave(name, str);
  if(r.ok){
    toast('已导出到：' + r.path + (r.why === 'fallback'
      ? '（所选目录写入失败，已回退到「下载」）' : ''));
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  toast('已导出：' + name + (withKey ? '（含密钥）' : '') +
    (r.why ? '；原生写入失败：' + r.why : ''));
}
function importSave(file){
  const rd = new FileReader();
  rd.onload = () => {
    let data;
    try{ data = JSON.parse(rd.result); }
    catch(e){ toast('文件格式错误：不是合法的 JSON'); return; }
    if(!data || data.kind !== 'life-restart-save'){
      toast('这不是本游戏的存档文件'); return;
    }
    const hasP = !!data.progress;
    if(String(data.ver || '').split('.')[0] !== GAME_VER.split('.')[0]){
      toast('版本不兼容（存档 v' + data.ver + '，当前 v' + GAME_VER + '）'); return;
    }
    const p = data.progress;
    if(hasP && (!p.attr || !Array.isArray(p.talents) || typeof p.age !== 'number')){
      toast('存档数据已损坏或被人为修改'); return;
    }
    /* 先把配置 / 内容库这类「无进度也能恢复」的部分落地 */
    if(data.cfg && data.cfg.profiles) setCfg(Object.assign(getCfg(), data.cfg));
    if(data.db) { DBX = data.db; dbxSet(); }
    if(!hasP){
      if(data.dex) setDex(Object.assign(getDex(), data.dex));   // 无进行中进度时也要恢复图鉴
      dialog('导入完成', '该文件不含进行中的人生进度，已恢复设置与内容数据。', [
        {t:'好的', pri:true, fn:() => { refreshMenu(); toast('已恢复设置与内容数据'); }}
      ]);
      return;
    }
    dialog('导入存档', '导入存档将覆盖当前人生进度，确定继续吗？', [
      {t:'确认导入', pri:true, fn:() => {
        /* 需求 4：导入字段一律做类型 + 范围校验，防手改存档刷属性 / 塞脏数据 */
        const num = (v, d) => (typeof v === 'number' && isFinite(v)) ? clamp(v, -9999, 9999) : d;
        const strArr = a => (Array.isArray(a) ? a : []).filter(x => typeof x === 'string' && x);
        const baseAttr = {CHR:0,INT:0,STR:0,MNY:0,LUK:0,SPR:0,EQ:5,WIL:5,MH:10,SOC:0};
        const attr = {};
        Object.keys(baseAttr).forEach(k => { attr[k] = num((p.attr || {})[k], baseAttr[k]); });
        const st = {
          ver: GAME_VER, age: num(p.age, 0), dead: false, diff: p.diff || 'd1',
          era: p.era || 'modern', talents: strArr(p.talents).slice(0, 8),
          /* 需求 27：性别是隐藏字段，导出时会带上；老存档没有就按通用处理 */
          sex: (p.sex === '男' || p.sex === '女') ? p.sex : '通用',
          tags: strArr(p.tags).slice(0, 40), logs: (Array.isArray(p.logs) ? p.logs : []).filter(l => l && typeof l.text === 'string').slice(-400),
          flags: (p.flags && typeof p.flags === 'object') ? p.flags : {}, used: strArr(p.used), revived: false,
          attr: attr,
          /* 以下字段此前在重建 S 时整体丢失（读档后子项 Δ / 机遇档 / 年度计数全部归零，
             相当于把「这一局是个什么样的人」抹平）。这里逐项接回来，缺省给安全值。 */
          hid: (p.hid && typeof p.hid === 'object') ? p.hid : {},
          fort: num(p.fort, 2),
          yearN: num(p.yearN, 0), yearCnt: num(p.yearCnt, 0), yearEvN: num(p.yearEvN, 1),
          yearAttr: (p.yearAttr && typeof p.yearAttr === 'object') ? p.yearAttr : {},
          queue: [], aiMade: Array.isArray(p.aiMade) ? p.aiMade : [],
          abyss: (p.abyss && typeof p.abyss === 'object') ? p.abyss : abyssNew(),
          outline: typeof p.outline === 'string' ? p.outline : '',
          lifespan: num(p.lifespan, LIFE_BASE)
        };
        S = st; era = ERAS.find(e => e.id === st.era) || ERAS[0];
        queue = [];
        lsSet(SAVE_HIST, JSON.stringify({ver: GAME_VER, at: Date.now(), S}));
        window.__pendingChoice = null;   // 读档：丢弃上一局可能残留的抉择态
        if(data.dex) setDex(Object.assign(getDex(), data.dex));
        $('#log').innerHTML = ''; clearYearCards(); lastYShown = -1;
        st.logs.forEach(l => pushLog(l.age, l.text, l.kind, l.delta, l.src));
        running = false; gen++; setRunUI();
        goState('MAIN_MENU');
        toast('导入成功，已回到主界面');
      }},
      {t:'取消', plain:true}
    ]);
  };
  rd.onerror = () => toast('文件读取失败');
  rd.readAsText(file);
}
function wipeAll(){
  dialog('清除本地数据', '将删除存档、图鉴、内容库与全部设置，且不可恢复。确定继续吗？', [
    {t:'确认清除', pri:true, fn:() => {
      lsDel(SAVE_HIST);
      lsDel(SAVE_DEX);
      lsDel(SAVE_REC);
      lsDel(SAVE_CFG);
      lsDel(DB_KEY);
      DBX = null;
      S = null; queue = [];
      applyTheme(); refreshMenu(); goState('MAIN_MENU');
      toast('已清除全部本地数据');
    }},
    {t:'取消', plain:true}
  ]);
}/* ========== 设置面板 ========== */
const PROVIDERS = [
  {v:'',                       n:'其他供应商（自定义）'},
  {v:'https://api.openai.com/v1',                                      n:'OpenAI'},
  {v:'https://api.deepseek.com/v1',                                    n:'DeepSeek 官方'},
  {v:'https://openrouter.ai/api/v1',                                   n:'OpenRouter'},
  {v:'https://dashscope.aliyuncs.com/compatible-mode/v1',              n:'阿里百炼'},
  {v:'https://open.bigmodel.cn/api/paas/v4',                           n:'智谱 GLM'},
  {v:'https://api.moonshot.cn/v1',                                     n:'Moonshot'},
  {v:'https://api.siliconflow.cn/v1',                                  n:'硅基流动'},
  {v:'https://vsllm.cc/v1',                                            n:'vsllm.cc'}
];
function renderProviderSel(){
  dselFill($('#cfgProvider'), PROVIDERS.map(p => ({v:p.v, n:p.n})), dselVal($('#cfgProvider')), null);
}
function renderProfiles(){
  const c = getCfg();
  dselFill($('#profSel'), Object.keys(c.profiles).map(n => ({v:n, n:n})), c.active, null);
}
function loadProfile(name){
  const c = getCfg();
  if(!c.profiles[name]) return;
  c.active = name; setCfg(c);
  const p = c.profiles[name];
  $('#cfgBase').value = p.base;
  $('#cfgModel').value = p.model;
  $('#cfgKey').value = p.key;
  dselSet($('#cfgProvider'), PROVIDERS.some(x => x.v === p.base) ? p.base : '', null);
  $('#cfgModelSel').classList.add('hide');
}
function saveProfile(){
  const c = getCfg();
  c.on = swxGet('cfgOn');
    c.vol = Number($('#cfgVol').value) || 0;
  c.spd = c.spd || 420;
  c.ai = clamp(Number($('#cfgAi').value) || 0, 0, 100);
  c.profiles[c.active] = {
    base: $('#cfgBase').value.trim(),
    model: $('#cfgModel').value.trim(),
    key: $('#cfgKey').value.trim()
  };
  setCfg(c);
  applyTheme();
}
function openSet(){
  try{ openSetInner(); }
  catch(e){
    /* 兜底：某项渲染失败也要让面板能打开，否则玩家会卡在打不开的设置里 */
    try{ $('#modal').classList.add('on'); }catch(_){}
    try{ toast('设置面板渲染异常，已跳过错项'); }catch(_){}
  }
}
function openSetInner(){
  const c = getCfg();
  renderProviderSel();
  renderProfiles();
  swxSet('cfgOn', !!c.on);
    swxSet('expKey', false);
  // cfgChoice 隐藏，强制开启
  $('#cfgVol').value = c.vol || 0;
  $('#volVal').textContent = (c.vol || 0) + '%';
  $('#cfgAi').value = (c.ai == null ? 50 : c.ai);
  $('#cfgAiV').textContent = (c.ai == null ? 50 : c.ai) + '%';
  // spdSeg 隐藏，保持默认
  document.querySelectorAll('#themeSeg button').forEach(b => {
    b.classList.toggle('on', b.dataset.th === (c.theme || 'auto'));
  });
  $('#testNote').textContent = '';
  $('#modelNote').textContent = 'Key 以明文保存在本机（导出时可选择打码），请勿在共享设备上使用，也勿导出含密钥的文件外发。';
  const p = curProf(c);
  $('#cfgBase').value = p.base;
  $('#cfgModel').value = p.model;
  $('#cfgKey').value = p.key;
  dselSet($('#cfgProvider'), PROVIDERS.some(x => x.v === p.base) ? p.base : '', null);
  $('#cfgModelSel').classList.add('hide');
  $('#modal').classList.add('on');
  foldApply();
}
const closeSet = () => exitLayer($('#modal'));

/* ========== 事件绑定 ========== */
function bindUI(){
  /* 主界面 */
  $('#mStart').onclick = () => { goState('MODE_SELECT'); };
  $('#mCont').onclick = () => {
    const h = histOf();
    if(!h || !h.S){ toast('暂无存档'); return; }
    S = h.S;
    era = ERAS.find(e => e.id === S.era) || ERAS[0];
    queue = [];
    running = false; gen++; setRunUI();
    resetEndUI();
    $('#log').innerHTML = ''; clearYearCards(); lastYShown = -1;
    S.logs.forEach(l => pushLog(l.age, l.text, l.kind, l.delta, l.src));
    renderPlayHead();
    $('#pbGo').textContent = '继续';
    setStatus('已读取存档，点「继续」推进');
    goState('LIFE_PLAYING');
  };
  $('#mDex').onclick = () => goState('DEX');
  $('#mRec').onclick = () => goState('REC');
  $('#mSet').onclick = openSet;

  /* 天赋页 */
  $('#talBack').onclick = () => goState('MAIN_MENU');
  $('#talSet').onclick = openSet;
  $('#talReroll').onclick = () => {
    rollTalentsSmart(6);
    renderTalents();
    toast('已重新抽取');
  };
  $('#talNext').onclick = () => {
    if((alloc.picked || []).length !== 3){ toast('请先选满 3 个天赋'); return; }
    setDiff(alloc.diff || 'd1');
    goState('ATTR_ALLOC');
  };

  /* 属性页 */
  $('#atBack').onclick = () => { alloc.mode = 'earth'; goState('TALENT_SELECTION'); };
  /* ====== 模式选择页 ====== */
  $('#modeBack').onclick = () => goState('MAIN_MENU');
  $('#modeEarth').onclick = () => { alloc.mode = 'earth'; rollTalentsSmart(6); renderTalents(); goState('TALENT_SELECTION'); };
  $('#atSet').onclick = openSet;
  $('#atReset').onclick = () => { setDiff(alloc.diff); toast('已重置加点'); };
  $('#btnUndo').onclick = () => undoPoint();
  $('#atStart').onclick = () => {
    if(alloc.pool > 0){
      dialog('还有属性点没用完', '还剩 ' + alloc.pool + ' 点没有分配，确定就这样开始吗？', [
        {t:'就这样开始', pri:true, fn:startLife},
        {t:'再想想', plain:true}
      ]);
      return;
    }
    startLife();
  };

  /* 推演页 */
  $('#plBack').onclick = () => leavePlaying();
  $('#pbBack2').onclick = () => leavePlaying();
  /* 死亡后的按钮条：主页退出、立即总结才进结算 */
  $('#ebBack').onclick = () => goState('MAIN_MENU');
  $('#ebSummary').onclick = () => openSummary();
  $('#plSet').onclick = openSet;
  $('#pbGo').onclick = toggleRun;
  $('#pbSpd').onclick = cycleSpeed;
  $('#pbAgain').onclick = () => restartConfirm();
  /* 需求 B：点日志区（对话框）立即推进 —— 暂停中先恢复，推进中则打断当前等待马上出下一年 */
  $('#playPage').onclick = () => {
    if(!S || S.dead || CUR !== 'LIFE_PLAYING') return;
    if(window.__pendingChoice) return;   // 有抉择在等：必须先点选项，不能靠点击跳过
    stepOnce();
  };

  /* 结局页 */
  /* 需求 A：三条离开路径都要先按勾选框结算「AI 文案入库」 */
  $('#ovBack').onclick = () => { if(REC_VIEW != null){ closeRecView(); return; } flushAiDb(); goState('MAIN_MENU'); };
  $('#ovSet').onclick = openSet;
  $('#ovMenu').onclick = () => { if(REC_VIEW != null){ closeRecView(); return; } flushAiDb(); goState('MAIN_MENU'); };
  $('#ovAgain').onclick = () => {
    if(REC_VIEW != null){ closeRecView(); return; }
    flushAiDb();
    rollTalentsSmart(6);
    renderTalents();
    goState('TALENT_SELECTION');
  };

  /* 图鉴 */
  $('#dxBack').onclick = () => goState('MAIN_MENU');
  $('#dxSet').onclick = openSet;
  $('#rcBack').onclick = () => goState('MAIN_MENU');
  /* 点战绩卡 → 回看那一局的完整结算 */
  $('#rcList').onclick = e => {
    const el = e.target.closest('[data-rec]');
    if(!el) return;
    openRecView(Number(el.getAttribute('data-rec')));
  };
  $('#rcSet').onclick = openSet;

  /* 设置弹窗 */
  $('#setBack').onclick = () => { saveProfile(); closeSet(); };
  /* 「返回」＝保存 + 关闭（原「保存 / 关闭」两个按钮语义重复且有坑：关闭不存） */
  const bbs = $('#btnBackSet');
  if(bbs) bbs.onclick = () => { saveProfile(); closeSet(); toast('设置已保存'); };
  const ca = $('#cardAbout');
  if(ca) ca.onclick = () => openAbout();

  /* 自定义开关 */
  ['cfgOn', 'expKey'].forEach(id => {
    const el = $('#' + id);
    if(el) el.onclick = () => el.classList.toggle('on');
  });
  /* v0.1.3 C：结算页「一键入库」按钮 */
  const abd = $('#ovAiDbBtn');
  if(abd) abd.onclick = () => aiDbCollect();
  $('#cfgAi').oninput = () => {
    $('#cfgAiV').textContent = (Number($('#cfgAi').value) || 0) + '%';
  };
  /* 设置卡折叠 */
  document.querySelectorAll('#modal .card[data-ck] > .chead, #modal .card[data-ck] > .top').forEach(h => {
    h.onclick = e => {
      if(e.target.closest('button')) return;
      foldToggle(h.closest('.card[data-ck]'));
    };
  });
  /* 自定义下拉：点击开合 + 选项选中（统一在 modal 内委托） */
  $('#modal').addEventListener('click', e => {
    const dv = e.target.closest('.dsel .dval');
    if(dv){
      const el = dv.closest('.dsel');
      const wasOn = el.classList.contains('on');
      document.querySelectorAll('.dsel.on').forEach(x => x.classList.remove('on'));
      el.classList.toggle('on', !wasOn);
      return;
    }
    const op = e.target.closest('.dopt');
    if(op){
      const el = op.closest('.dsel');
      el.classList.remove('on');
      dselSet(el, op.dataset.v, null);
      return;
    }
    if(!e.target.closest('.dsel')) document.querySelectorAll('.dsel.on').forEach(x => x.classList.remove('on'));
  });
  dselFill($('#profSel'), [], '', v => { saveProfile(); loadProfile(v); });
    /* v0.1.5：完整数据库 —— 调试页只留一个入口按钮，实际内容在独立页里 */
  const dbOpen = $('#dbgDbOpen');
  if(dbOpen) dbOpen.onclick = () => dbgDbOpen();
  const dbBack = $('#dbgDbBack');
  if(dbBack) dbBack.onclick = () => dbgDbClose();
  /* 卡头折叠 / 点单条弹内容，都用委托，渲染后可复用 */
  const dbList = $('#dbgDbList');
  if(dbList) dbList.onclick = e => {
    const hd = e.target.closest('.dsrcc > .chead');
    if(hd){ hd.parentElement.classList.toggle('fold'); return; }
    const rw = e.target.closest('.drow');
    if(!rw) return;
    const k = rw.dataset.k, id = rw.dataset.id;
    const hit = dbgDbAll(k).filter(x => String(x.id || '') === String(id))[0];
    if(hit) dbgDbShow(k, hit);
  };
  const dbOk = $('#dbgDlgOk');
  if(dbOk) dbOk.onclick = () => dbgDbCloseDlg();
  /* 点弹窗遮罩空白处也能关 */
  const dbDlg = $('#dbgDlg');
  if(dbDlg) dbDlg.onclick = e => { if(e.target === dbDlg) dbgDbCloseDlg(); };

$('#btnNewCfg').onclick = () => {
    saveProfile();
    const c = getCfg();
    const def = '配置' + (Object.keys(c.profiles).length + 1);
    askText('新建配置', def, '输入配置名称', v => {
      const nm = String(v == null ? '' : v).trim();
      if(!nm) return;                                  // 取消 / 空名，直接放弃
      const c2 = getCfg();
      if(c2.profiles[nm]){ toast('已存在同名配置'); return; }
      c2.profiles[nm] = {base:'', model:'', key:''};
      c2.active = nm;
      setCfg(c2);
      renderProfiles();
      $('#cfgBase').value = ''; $('#cfgModel').value = ''; $('#cfgKey').value = '';
      dselSet($('#cfgProvider'), '', null);   // 自定义下拉，不能再用 .value
      $('#cfgModelSel').classList.add('hide');
      $('#testNote').textContent = '';
    });
  };
  $('#btnRenCfg').onclick = () => {
    saveProfile();
    const c = getCfg();
    const cur = c.active;
    askText('重命名配置', cur, '输入新的配置名称', v => {
      const nm = String(v == null ? '' : v).trim();
      if(!nm || nm === cur) return;
      const c2 = getCfg();
      if(c2.profiles[nm]){ toast('已存在同名配置'); return; }
      const rebuilt = {};
      Object.keys(c2.profiles).forEach(k => { rebuilt[k === cur ? nm : k] = c2.profiles[k]; });
      c2.profiles = rebuilt;
      if(c2.active === cur) c2.active = nm;
      setCfg(c2);
      renderProfiles();
      toast('已重命名为「' + nm + '」');
    });
  };
  $('#btnDelCfg').onclick = () => {
    const c = getCfg();
    const names = Object.keys(c.profiles);
    const cur = c.active;
    if(names.length <= 1){ toast('至少要保留一套配置'); return; }
    dialog('删除配置', '将删除「' + cur + '」这套配置（端点、模型、密钥一并移除），确定吗？', [
      {t:'确认删除', pri:true, fn:() => {
        const c2 = getCfg();
        delete c2.profiles[cur];
        const left = Object.keys(c2.profiles);
        c2.active = left[0];
        setCfg(c2);
        loadProfile(c2.active);
        renderProfiles();
        toast('已删除配置「' + cur + '」');
      }},
      {t:'取消', plain:true}
    ]);
  };
  $('#cfgProvider')._cb = v => {
    // 「其他供应商」不清空用户自己填的地址
    if(v) $('#cfgBase').value = v;
  };
  $('#cfgVol').oninput = () => {
    $('#volVal').textContent = $('#cfgVol').value + '%';
  };
  document.querySelectorAll('#themeSeg button').forEach(b => {
    b.onclick = () => {
      document.querySelectorAll('#themeSeg button').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      const c = getCfg(); c.theme = b.dataset.th; setCfg(c);
      applyTheme();
      toast('外观已切换');
    };
  });
  $('#btnTest').onclick = async () => {
    const base = $('#cfgBase').value.trim(), key = $('#cfgKey').value.trim(), model = $('#cfgModel').value.trim();
    const note = $('#testNote');
    if(!base){ note.textContent = '先填 API 端点。'; return; }
    const insecure = /^http:\/\//i.test(base);
    note.textContent = insecure ? '注意：端点为 http 明文，密钥可能被同一网络嗅探，建议改用 https；测试中…' : '测试中…';
    try{
      const r = await fetch(endpointOf(base, '/models'), {headers: key ? {'Authorization':'Bearer ' + key} : {}});
      if(!r.ok) throw new Error('HTTP ' + r.status);
      const d = await r.json();
      const n = (d.data || d.models || []).length;
      note.textContent = (insecure ? '注意：明文 http；' : '') + '连接正常，可用模型 ' + n + ' 个。';
      if(n && !model) $('#btnFetch').click();
    }catch(e){
      note.textContent = (insecure ? '注意：明文 http；' : '') + '连接失败：' + e.message + (/Failed|fetch/i.test(e.message) ? '（可能是 CORS 拦截）' : '');
    }
  };
  $('#btnFetch').onclick = async () => {
    const base = $('#cfgBase').value.trim(), key = $('#cfgKey').value.trim();
    const note = $('#modelNote');
    if(!base){ note.textContent = '先填 API 端点。'; return; }
    note.textContent = '正在拉取…';
    try{
      const r = await fetch(endpointOf(base, '/models'), {headers: key ? {'Authorization':'Bearer ' + key} : {}});
      if(!r.ok) throw new Error('HTTP ' + r.status);
      const d = await r.json();
      const list = (d.data || d.models || []).map(m => m.id || m.name || m.model).filter(Boolean);
      if(!list.length) throw new Error('列表为空');
      list.sort((a, b) => String(a).localeCompare(String(b)));
      // #cfgModelSel 是自定义下拉（.dsel > button.dval + div.dpanel），
      // 必须走 dselFill，不能再用原生 select 的 innerHTML / option / sel.value 那一套：
      // 否则会把可点击的 dval 与面板容器 dpanel 一起清掉，变成「列出来了但点不动」。
      const sel = $('#cfgModelSel');
      const cur = $('#cfgModel').value.trim();
      const pick = (cur && list.indexOf(cur) >= 0) ? cur : list[0];
      dselFill(sel, list.map(id => ({v: id, n: id})), pick, v => {
        $('#cfgModel').value = v; saveProfile();
      });
      sel.classList.remove('hide');
      if(!cur){ $('#cfgModel').value = pick; saveProfile(); }
      note.textContent = '共 ' + list.length + ' 个模型，选一个即可（会立即保存）。';
    }catch(e){
      $('#cfgModelSel').classList.add('hide');
      note.textContent = '拉取失败（' + e.message + '）；可手动填模型名，例如 deepseek-v4-flash。';
    }
  };
  $('#btnDir').onclick = () => {
    if(window.Android && window.Android.pickSaveDir) window.Android.pickSaveDir();
    else toast('当前环境不支持选择目录（文件会存到「下载」）');
  };
  window.__onDirPicked = p => {
    const el = $('#dirNow'); if(el) el.textContent = p || '';
    toast('备份目录已设：' + (p || ''));
  };
  window.__onDirErr = () => toast('未选择目录，文件仍会存到「下载」');
  try{
    if(window.Android && window.Android.getSaveDir && $('#dirNow')){
      const d0 = window.Android.getSaveDir();
      if(d0) $('#dirNow').textContent = d0;
    }
  }catch(e){}
  $('#btnExport').onclick = exportSave;
  $('#btnImport').onclick = () => $('#fileIn').click();
  $('#fileIn').onchange = e => {
    const f = e.target.files && e.target.files[0];
    if(f) importSave(f);
    e.target.value = '';
  };
  $('#btnWipe').onclick = wipeAll;

  /* 返回键：优先关弹窗，其次暂停 */
  window.__back = function(){
    if(!$('#dlgI').classList.contains('hide')){ $('#dlgI').classList.add('hide'); return true; }
    if($('#dlg').classList.contains('on')){ closeDlg(); return true; }
    /* 二级覆盖层优先于设置弹窗（modal）：从设置点进去的子界面，返回键要先关子界面，
       否则 modal 仍处于 on 状态会抢先命中，导致「二级界面返回键不返回」。 */
    if($('#dbgDb').classList.contains('on')){ dbgDbClose(); return true; }
    if($('#dbgPage').classList.contains('on')){ closeDbg(); return true; }
    if($('#aboutPage').classList.contains('on')){ closeAbout(); return true; }
    if($('#dbPage').classList.contains('on')){ closeDbPage(); return true; }
    if($('#modal').classList.contains('on')){ saveProfile(); closeSet(); return true; }
    if(REC_VIEW != null){ closeRecView(); return true; }   // 回看态返回战绩列表
    // 抉择现在是内联日志条目，没有可关闭的浮层；等待期间不允许直接退回主界面
    if(window.__pendingChoice) return true;
    if(CUR === 'LIFE_PLAYING'){ leavePlaying(); return true; }
    if(CUR !== 'MAIN_MENU'){ goState('MAIN_MENU'); return true; }
    return false;
  };
}

/* ========== 二次确认 ========== */
function leavePlaying(){
  if(!S || S.dead){ window.__pendingChoice = null; goState('MAIN_MENU'); return; }
  const age = Math.round(S.age);
  dialog('返回主界面', '当前人生已经走到 ' + age + ' 岁，进度将自动保存。确定要离开吗？', [
    {t:'保存并返回', pri:true, fn:() => {
      running = false; gen++; setRunUI();
      window.__pendingChoice = null;
      saveHist(); toast('进度已保存');
      goState('MAIN_MENU');
    }},
    {t:'放弃保存并返回', fn:() => {
      running = false; gen++; setRunUI();
      window.__pendingChoice = null;
      lsDel(SAVE_HIST);
      toast('已放弃本次进度');
      goState('MAIN_MENU');
    }},
    {t:'取消', plain:true}
  ]);
}
function restartConfirm(){
  dialog('一键重开', '当前人生进度将丢失，确定要重开吗？（' + Math.round(S ? S.age : 0) + ' 岁）', [
    {t:'自动保存后重开', pri:true, fn:() => {
      running = false; gen++; setRunUI();
      saveHist();
      setTimeout(() => {
        rollTalentsSmart(6);
        renderTalents();
        goState('TALENT_SELECTION');
      }, 10);
    }},
    {t:'放弃保存并重开', fn:() => {
      running = false; gen++; setRunUI();
      lsDel(SAVE_HIST);
      setTimeout(() => {
        rollTalentsSmart(6);
        renderTalents();
        goState('TALENT_SELECTION');
      }, 10);
    }},
    {t:'取消', plain:true}
  ]);
}
function startLife(){
  /* 需求 C：启用 AI 时先读条（等大纲与事件池备好）再进游戏；未启用则直接开 */
  newLife(alloc.picked.slice(), alloc.pts, alloc.diff);
}

/* ========== 诊断 / 关于 / 调试 ==========
   关于页：软件说明 + 版本号；版本号连点 5 次进入调试面板。
   调试面板：运行概览、运行日志、导出诊断 zip、危险区。 */
const DIAG_LOG_MAX = 400;
let LOG_BUF = [];
let AB_TAPS = 0, AB_TAP_TS = 0, DBG_ON = false;
/* 危险区把 AI 占比临时改成 0 时，原值备份在这里（持久化，重启 App 也能恢复） */
const DG_AIBACK_KEY = 'lr_dbg_aibak';
/* 调试面板进入口令（隐藏入口，改这里即可换密码） */
const DBG_PWD = '5201314';
/* 无敌模式：持久化开关 */
const DEV_KEY = 'lr_dev';
let DEV_ON = (lsGet(DEV_KEY) === '1');
let AIPCT_BAK = null;
{ const b = parseInt(lsGet(DG_AIBACK_KEY), 10); if(isFinite(b)) AIPCT_BAK = b; }
function logLine(tag, msg){
  const t = new Date();
  const p2 = n => String(n).padStart(2, '0');
  LOG_BUF.push('[' + p2(t.getHours()) + ':' + p2(t.getMinutes()) + ':' + p2(t.getSeconds()) + '][' + tag + '] ' + msg);
  while(LOG_BUF.length > DIAG_LOG_MAX) LOG_BUF.shift();
  if(DBG_ON){ const el = $('#dbgLog'); if(el) el.textContent = LOG_BUF.length ? LOG_BUF.join('\n') : '（空）'; }
}
/* 把页面所有报错都收进日志缓冲（调试面板里能看到） */
(function(){
  window.addEventListener('error', e => {
    try{ logLine('ERR', String(e.message || '') + ' @' + String(e.filename || '') + ':' + String(e.lineno || 0)); }catch(x){}
  });
  window.addEventListener('unhandledrejection', e => {
    try{ const r = e.reason; logLine('REJ', String((r && (r.message || r)) || '').slice(0, 200)); }catch(x){}
  });
  const ce = console.error;
  console.error = function(){
    try{ logLine('ERR', Array.prototype.map.call(arguments, a => (a && a.message) ? a.message : String(a)).join(' ').slice(0, 200)); }catch(x){}
    try{ ce.apply(console, arguments); }catch(x){}
  };
})();
function fmtSize(n){
  if(n == null) return '—';
  if(n < 1024) return n + ' B';
  if(n < 1024 * 1024) return (n / 1024).toFixed(n < 10240 ? 1 : 0) + ' KB';
  return (n / 1048576).toFixed(2) + ' MB';
}
function lsKeys(){
  const a = [];
  try{ for(let i = 0; i < localStorage.length; i++) a.push(localStorage.key(i)); }catch(e){}
  return a;
}
function lsSize(k){
  const v = lsGet(k); return v == null ? null : v.length;
}
/* 运行快照：诊断面板与 zip 共用同一份数据 */
function diagSnapshot(){
  const o = { at: new Date().toISOString(), ver: GAME_VER, state: CUR };
  try{ o.shell = (window.Android && window.Android.shellVersion) ? window.Android.shellVersion() : -1; }catch(e){ o.shell = -2; }
  try{ o.ua = (navigator && navigator.userAgent) || ''; }catch(e){ o.ua = ''; }
  try{ o.screen = (window.innerWidth || 0) + 'x' + (window.innerHeight || 0) + ' dpr' + (window.devicePixelRatio || 1); }catch(e){ o.screen = ''; }
  try{ o.theme = document.documentElement.getAttribute('data-theme') || ''; }catch(e){ o.theme = ''; }
  try{ o.dark = sysDark(); }catch(e){ o.dark = null; }
  try{
    const c = getCfg(), p = curProf(c);
    o.ai = {
      on: !!c.on, prefetch: c.prefetch !== false, aiPct: (c.ai == null ? 50 : c.ai),
      profile: c.active || '', base: p.base || '', model: p.model || '', hasKey: !!p.key,
      ready: aiReady(), fails: aiFails, queue: queue.length,
      stat: aiStat.n + '/' + aiStat.ai, recent: aiRecent.slice(-6)
    };
  }catch(e){ o.ai = { err: String((e && e.message) || e) }; }
  try{
    o.lib = { 事件: dataOf('ev').length, 天赋: dataOf('tal').length, 成就: dataOf('ach').length,
      结局: dataOf('end').length, 标签: dataOf('tag').length };
  }catch(e){ o.lib = { err: String((e && e.message) || e) }; }
  try{
    const bx = dbxGet();
    o.libExt = { 事件: (bx.ev || []).length, 天赋: (bx.tal || []).length, 成就: (bx.ach || []).length,
      结局: (bx.end || []).length, 标签: (bx.tag || []).length };
  }catch(e){ o.libExt = { err: String((e && e.message) || e) }; }
  o.store = {};
  [SAVE_CFG, SAVE_HIST, SAVE_DEX, DB_KEY, FOLD_KEY].forEach(k => { if(k) o.store[k] = lsSize(k); });
  o.storeKeys = lsKeys();
  if(S){
    o.life = { age: Math.round(S.age), dead: !!S.dead, attr: S.attr, tags: S.tags,
      talents: (S.talents || []).map(x => (x && x.n) || x), logs: (S.logs || []).length,
      aiMade: (S.aiMade || []).length, hasOutline: !!S.outline };
  } else o.life = null;
  return o;
}
/* 最后一道保险：任何形如 sk-xxxxx 的长串都当密钥抹掉（诊断包可能会外发） */
function scrubSecrets(s){
  return String(s == null ? '' : s).replace(/\bsk-[A-Za-z0-9_\-]{10,}/g, '***（已打码）');
}
/* 导出前打码：配置类存档里的 API 密钥一律替换掉 */
function maskSecrets(k, v){
  if(v == null) return '';
  if(!/^lr_cfg_/.test(String(k))) return v;
  try{
    const o = JSON.parse(v);
    if(o && o.profiles){
      Object.keys(o.profiles).forEach(n => {
        const p = o.profiles[n];
        if(p && typeof p.key === 'string' && p.key) p.key = '***（已打码）';
      });
    }
    return JSON.stringify(o);
  }catch(e){ return scrubSecrets(v); }
}
/* 完整本地存储转文本（用于 zip，单键截断 20 万字符防爆；密钥一律打码） */
function lsDump(){
  const L = [];
  lsKeys().forEach(k => {
    const raw = lsGet(k) || '';
    const v = maskSecrets(k, raw);
    L.push('===== ' + k + '（原文 ' + raw.length + ' 字符）=====');
    L.push(v.length > 200000 ? v.slice(0, 200000) + '\n…（已截断）' : v);
    L.push('');
  });
  return L.length ? L.join('\n') : '（无）';
}
function diagText(){
  const o = diagSnapshot();
  return 'My Life, My Sim  诊断信息\n' + JSON.stringify(o, null, 2) +
    '\n\n========== 运行日志 ==========\n' + (LOG_BUF.length ? LOG_BUF.join('\n') : '（空）');
}
/* ---- 最小 ZIP 打包（store 模式，不引任何外部库） ---- */
const CRC_T = (function(){
  const t = new Uint32Array(256);
  for(let n = 0; n < 256; n++){
    let c = n;
    for(let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(u8){
  let c = 0xFFFFFFFF;
  for(let i = 0; i < u8.length; i++) c = CRC_T[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function toU8(s){
  if(window.TextEncoder) return new TextEncoder().encode(s);
  const e = unescape(encodeURIComponent(s)), a = new Uint8Array(e.length);
  for(let i = 0; i < e.length; i++) a[i] = e.charCodeAt(i);
  return a;
}
function zipStore(files){
  const body = [], cen = [];
  const now = new Date();
  const dosT = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xFFFF;
  const dosD = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xFFFF;
  let off = 0;
  files.forEach(f => {
    const nm = toU8(f.name), dt = toU8(String(f.data == null ? '' : f.data)), crc = crc32(dt);
    const lh = new Uint8Array(30 + nm.length), lv = new DataView(lh.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true); lv.setUint16(6, 0x0800, true); lv.setUint16(8, 0, true);
    lv.setUint16(10, dosT, true); lv.setUint16(12, dosD, true);
    lv.setUint32(14, crc, true); lv.setUint32(18, dt.length, true); lv.setUint32(22, dt.length, true);
    lv.setUint16(26, nm.length, true); lv.setUint16(28, 0, true);
    lh.set(nm, 30);
    body.push(lh, dt);
    const ch = new Uint8Array(46 + nm.length), cv = new DataView(ch.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true); cv.setUint16(12, dosT, true); cv.setUint16(14, dosD, true);
    cv.setUint32(16, crc, true); cv.setUint32(20, dt.length, true); cv.setUint32(24, dt.length, true);
    cv.setUint16(28, nm.length, true); cv.setUint32(42, off, true);
    ch.set(nm, 46);
    cen.push(ch);
    off += lh.length + dt.length;
  });
  let cdSize = 0; cen.forEach(c => { cdSize += c.length; });
  const eo = new Uint8Array(22), ev = new DataView(eo.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true);
  ev.setUint32(12, cdSize, true); ev.setUint32(16, off, true);
  const all = body.concat(cen, [eo]);
  let total = 0; all.forEach(a => { total += a.length; });
  const out = new Uint8Array(total);
  let p = 0; all.forEach(a => { out.set(a, p); p += a.length; });
  return out;
}
function u8b64(u8){
  let s = '';
  const CH = 0x8000;
  for(let i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
  return btoa(s);
}
function copyText(t){
  const fb = () => {
    try{
      const ta = document.createElement('textarea');
      ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      toast(ok ? '已复制到剪贴板' : '复制失败，请长按手动选择');
    }catch(e){ toast('复制失败'); }
  };
  try{
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(t).then(() => toast('已复制到剪贴板'), fb);
      return;
    }
  }catch(e){}
  fb();
}
function exportDiag(){
  const d = new Date();
  const p2 = n => String(n).padStart(2, '0');
  const stamp = d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()) + '_' + p2(d.getHours()) + p2(d.getMinutes());
  const name = 'MyLifeMySim_诊断_' + stamp + '.zip';
  const u8 = zipStore([
    {name: '诊断信息.txt', data: scrubSecrets(diagText())},
    {name: '运行日志.txt', data: scrubSecrets(LOG_BUF.length ? LOG_BUF.join('\n') : '（空）')},
    {name: '设备存储.txt', data: scrubSecrets(lsDump())}
  ]);
  let saved = '';
  if(window.Android && window.Android.saveBytes){
    try{ saved = window.Android.saveBytes(name, u8b64(u8)) || ''; }catch(e){ saved = ''; }
  }
  if(saved){ toast('诊断包已导出到：' + saved); return; }
  try{
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([u8], {type:'application/zip'}));
    a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
    toast('已导出：' + name);
  }catch(e){ toast('导出失败：' + e.message); }
}
/* ---- 关于页 / 调试页 ---- */
function openAbout(){
  const v = $('#abVer'); if(v) v.textContent = 'v' + GAME_VER;
  const a = $('#abAuthor'); if(a) a.textContent = ABOUT_AUTHOR;
  const q = $('#abQQ'); if(q) q.textContent = ABOUT_QQ;
  $('#aboutPage').classList.add('on');
}
const closeAbout = () => exitLayer($('#aboutPage'));
function openDbg(){
  DBG_ON = true;
  renderDbg();
  $('#dbgPage').classList.add('on');
  logLine('DBG', '打开调试面板');
}
const closeDbg = () => {
  DBG_ON = false;
  exitLayer($('#dbgPage'));
  /* 数据库独立页可能正开着，一并收掉（连同它的内容弹窗） */
  try{
    const p = document.getElementById('dbgDb'), d = document.getElementById('dbgDlg');
    if(p) p.classList.remove('on');
    if(d) d.classList.remove('on');
  }catch(e){}
};
/* ========== 无敌模式 ========== */
/* 长寿无敌：不再无限续命，只把寿命锁定到 200 岁（= AGE_MAX）。
   开启后「寿终」这条死因不再成立，必定活到 200；到 200 岁即由年龄上限收尾，
   不会没完没了地拖下去 —— 200 岁之后事件库本就没有内容，再拖既无意义也徒增空转。 */
function devKeepAlive(){
  if(DEV_ON && S && !S.dead && S.lifespan < DEV_LIFE) S.lifespan = DEV_LIFE;
  return S ? S.lifespan : 0;
}
function devSet(on){
  DEV_ON = !!on;
  lsSet(DEV_KEY, DEV_ON ? '1' : '0');
  logLine('DEV', '无敌模式 ' + (DEV_ON ? '已开启' : '已关闭'));
  syncDev();
  toast(DEV_ON ? '无敌模式已开启' : '无敌模式已关闭');
}
/* 开关状态、按钮显隐、加点页刷新 */
function syncDev(){
  const sw = $('#dgDev'); if(sw) sw.classList.toggle('on', DEV_ON);
  const acts = $('#dgDevActs'); if(acts) acts.classList.toggle('hide', !DEV_ON);
  if(CUR === 'ATTR_ALLOC'){ try{ renderAttr(); renderDiff(); }catch(e){} }
}
/* 立即结束当前这一局 */
function devEndLife(){
  if(!DEV_ON){ toast('请先开启无敌模式'); return; }
  if(!S || S.dead){ toast('当前没有进行中的一局'); return; }
  dialog('立即结束这一局？', '会按当前 ' + Math.round(S.age) + ' 岁的属性直接结算（无敌模式专用），确定吗？', [
    {t:'结束', pri:true, fn:() => {
      logLine('DEV', '手动结束一局（' + Math.round(S.age) + ' 岁）');
      die();
    }},
    {t:'取消', plain:true}
  ]);
}
/* 一键解锁全部成就（真正执行；返回本次新增个数） */
function doAchAll(){
  const d = getDex(); d.ach = d.ach || [];
  let n = 0;
  dataOf('ach').forEach(a => { if(d.ach.indexOf(a.id) < 0){ d.ach.push(a.id); n++; } });
  setDex(d);
  logLine('DEV', '一键全成就：新增 ' + n + ' 个（共 ' + d.ach.length + ' 个）');
  renderDbg(); refreshMenu(); if(CUR === 'DEX') renderDex();
  return n;
}
/* 清空成就 + 图鉴（按定案整体重置） */
function doClearAch(){
  setDex({});
  logLine('DEV', '清空成就 + 图鉴（含通关次数 / 天赋 / 标签 / 最长寿命）');
  renderDbg(); refreshMenu(); if(CUR === 'DEX') renderDex();
}
/* 一键解锁全部成就（危险区入口） */
function devAllAch(){
  if(!DEV_ON){ toast('请先开启无敌模式'); return; }
  dialog('一键解锁全部成就？', '会把成就表里的全部成就直接标记为已达成，并写进图鉴（其中带属性加成的成就，以后开局会照常生效）。', [
    {t:'全部解锁', pri:true, fn:() => {
      const n = doAchAll();
      toast(n ? ('已解锁 ' + n + ' 个成就') : '成就本来就已全解锁');
    }},
    {t:'取消', plain:true}
  ]);
}
/* 清空成就（危险区入口） */
function devClearAch(){
  if(!DEV_ON){ toast('请先开启无敌模式'); return; }
  dialog('清空全部生涯数据？',
    '会整体重置图鉴：成就、通关次数、天赋收集、标签收集、最长寿命全部清空，此操作不可恢复。',
    [
      {t:'全部清空', pri:true, fn:() => {
        doClearAch();
        toast('生涯数据已清空');
      }},
      {t:'取消', plain:true}
    ]);
}
/* 输入口令（复用浮层容器，提示语可自定义） */
function askPwd(title, hint, onOk){
  const box = $('#dlgI');
  box.innerHTML =
    '<div class="dc">' +
      '<h3>' + esc(title) + '</h3>' +
      '<p class="sub">' + esc(hint || '') + '</p>' +
      '<input type="text" id="dlgIIn" autocomplete="off" inputmode="numeric" placeholder="输入口令">' +
      '<div class="da">' +
        '<button class="a1" id="dlgIOk">确定</button>' +
        '<button class="a3" id="dlgICancel">取消</button>' +
      '</div>' +
    '</div>';
  box.classList.remove('hide');
  const inp = $('#dlgIIn');
  inp.value = '';
  setTimeout(() => { try{ inp.focus(); }catch(e){} }, 60);
  const done = v => { box.classList.add('hide'); if(onOk) onOk(v); };
  $('#dlgIOk').onclick = () => done(inp.value);
  $('#dlgICancel').onclick = () => done(null);
  inp.onkeydown = e => { if(e.key === 'Enter'){ e.preventDefault(); done(inp.value); } };
}
/* 校验口令后才进调试面板 */
function tryOpenDbg(){
  askPwd('进入调试面板', '这个入口是隐藏的，需要口令', v => {
    if(v == null) return;
    const s = String(v).trim();
    if(s === DBG_PWD){ openDbg(); }
    else if(s !== ''){ toast('口令不对'); }
  });
}
/* 同步危险区按钮文案与当前状态（被改过时要能一眼看出怎么恢复） */
function dgSyncLocal(){
  const c = (function(){ try{ return getCfg(); }catch(e){ return {}; } })();
  const cur = (c.ai == null ? 50 : c.ai);
  const btn = $('#dgLocal');
  if(btn) btn.textContent = (AIPCT_BAK != null) ? ('恢复 AI 占比（' + AIPCT_BAK + '%）') : '强制走本地事件';
  const now = $('#dgNow');
  if(now) now.textContent = '当前 AI 占比 ' + cur + '%' + (AIPCT_BAK != null
    ? '｜被危险区改成了 0%，点上面「恢复 AI 占比」即可还原' : '');
}
function renderDbg(){
  const o = diagSnapshot();
  const row = (k, v) => '<div class="dbgrow"><span class="k">' + esc(k) + '</span><span class="v">' +
    esc(v == null ? '—' : String(v)) + '</span></div>';
  const ai = o.ai || {}, lib = o.lib || {}, ext = o.libExt || {}, life = o.life || {};
  let h = '';
  h += row('游戏版本', 'v' + o.ver);
  h += row('壳版本', o.shell);
  h += row('界面状态', o.state);
  h += row('主题', o.theme + (o.dark == null ? '' : (o.dark ? '（系统深色）' : '（系统浅色）')));
  h += row('屏幕', o.screen);
  h += row('AI 开关', ai.on ? '开' : '关');
  h += row('AI 占比', ai.aiPct + '%');
  h += row('配置', ai.profile || '—');
  h += row('模型', ai.model || '—');
  h += row('端点', ai.base || '—');
  h += row('密钥', ai.hasKey ? '已填' : '未填');
  h += row('可用', ai.ready ? '是' : '否');
  h += row('连续失败', ai.fails);
  h += row('待用', ai.queue + ' 条');
  h += row('AI/总年', ai.stat || '—');
  h += row('无敌模式', DEV_ON ? '已开启（寿命锁 200 / 无限点数）' : '关闭');
  h += row('事件库', ext.事件 == null ? '—' : String(ext.事件));
  h += row('天赋', ext.天赋 == null ? '—' : String(ext.天赋));
  h += row('成就/结局', (ext.成就 == null ? '—' : ext.成就) + ' / ' + (ext.结局 == null ? '—' : ext.结局));
  h += row('标签', ext.标签 == null ? '—' : String(ext.标签));
  h += row('当前人生', o.life ? (life.age + ' 岁 · 日志 ' + life.logs + ' 条' + (life.dead ? ' · 已结束' : '')) : '未开局');
  if(o.life) h += row('属性', JSON.stringify(life.attr));
  h += row('存储', (o.storeKeys || []).map(k => k + ':' + fmtSize(o.store[k])).join('　') || '（空）');
  $('#dbgBody').innerHTML = h;
  const lg = $('#dbgLog');
  if(lg) lg.textContent = LOG_BUF.length ? LOG_BUF.join('\n') : '（空）';
  dgSyncLocal();
  syncDev();
}
/* ---- 绑定 ---- */
(function bindDiag(){
  const ab = $('#abBack'); if(ab) ab.onclick = closeAbout;
  /* 反馈群号：点一下即复制（走 copyText，原生 clipboard 失败时回退 execCommand） */
  const qq = $('#abQQ');
  if(qq) qq.onclick = () => copyText(ABOUT_QQ);
  const vv = $('#abVer');
  if(vv) vv.onclick = () => {
    const now = Date.now();
    if(now - AB_TAP_TS > 1600) AB_TAPS = 0;
    AB_TAP_TS = now;
    AB_TAPS++;
    if(AB_TAPS >= 5){ AB_TAPS = 0; tryOpenDbg(); return; }
  };
  const bk = $('#dbgBack'); if(bk) bk.onclick = closeDbg;
  const rf = $('#dbgRefresh'); if(rf) rf.onclick = () => { renderDbg(); toast('已刷新'); };
  const cp = $('#dbgCopy'); if(cp) cp.onclick = () => copyText(diagText());
  const zp = $('#dbgZip'); if(zp) zp.onclick = exportDiag;
  const f1 = $('#dgFails'); if(f1) f1.onclick = () => { aiFails = 0; logLine('DBG', '重置 AI 失败计数'); toast('AI 失败计数已清零'); renderDbg(); };
  const f2 = $('#dgQueue'); if(f2) f2.onclick = () => { const n = queue.length; queue = []; aiLastFrom = -1; logLine('DBG', '清空事件队列 ' + n + ' 条'); toast('已清空队列（' + n + ' 条）'); renderDbg(); };
  const f3 = $('#dgLocal'); if(f3) f3.onclick = () => {
    const c = getCfg();
    if(AIPCT_BAK == null){
      /* 第一次点：备份原值后置 0 */
      AIPCT_BAK = (c.ai == null ? 50 : c.ai);
      lsSet(DG_AIBACK_KEY, String(AIPCT_BAK));
      c.ai = 0; setCfg(c);
      logLine('DBG', 'AI 占比 ' + AIPCT_BAK + '% → 0%（走本地事件）');
      toast('已切到本地事件（原 ' + AIPCT_BAK + '% 已记下，可再点一次恢复）');
    }else{
      /* 再点：恢复原值 */
      c.ai = AIPCT_BAK; setCfg(c);
      logLine('DBG', 'AI 占比已恢复为 ' + AIPCT_BAK + '%');
      toast('已恢复 AI 占比 ' + AIPCT_BAK + '%');
      AIPCT_BAK = null;
      lsDel(DG_AIBACK_KEY);
    }
    dgSyncLocal();
    renderDbg();
  };
  const f4 = $('#dgLog'); if(f4) f4.onclick = () => { LOG_BUF = []; const lg = $('#dbgLog'); if(lg) lg.textContent = '（空）'; toast('运行日志已清空'); };
  const f5 = $('#dgClick'); if(f5) f5.onclick = () => { AB_TAPS = 0; toast('连点计数已重置'); };
  const f6 = $('#dgState'); if(f6) f6.onclick = () => {
    const o = diagSnapshot();
    logLine('STATE', JSON.stringify(o.life || { 无: '未开局' }));
    toast('当前状态已写进日志');
    renderDbg();
  };
  const fr = $('#dgFloatRow'); if(fr) fr.onclick = () => floatSet(!floatSync());
  floatSync();
  const dr = $('#dgDevRow'); if(dr) dr.onclick = () => devSet(!DEV_ON);
  const d1 = $('#dgEndLife'); if(d1) d1.onclick = devEndLife;
  const d2 = $('#dgAchAll'); if(d2) d2.onclick = devAllAch;
  const d3 = $('#dgAchClear'); if(d3) d3.onclick = devClearAch;
  dgSyncLocal();
  syncDev();
  logLine('SYS', '初始化完成 v' + GAME_VER);
})();

/* =========================================================
   开局读条（需求 C）：等 AI 准备好再进游戏
   —— 没启用 AI 时完全不出现
   ========================================================= */
let bootBusy = false;
function bootShow(tip, pct){
  const p = $('#bootPage'); if(!p) return;
  p.classList.add('on');
  bootBusy = true;
  const t = $('#bootTip'), b = $('#bootBar'), n = $('#bootPct');
  if(t && tip != null) t.textContent = tip;
  const v = Math.max(0, Math.min(100, Math.round(pct || 0)));
  if(b) b.style.width = v + '%';
  if(n) n.textContent = v + '%';
}
function bootHide(){
  const p = $('#bootPage'); if(!p) return;
  bootBusy = false;
  p.classList.remove('on');
}
/* 等 AI 就绪：返回 false 表示不必读条（未启用 AI） */
function bootNeeded(){
  try{ return !!(S && !S.dead && getCfg().ai && aiReady ? aiReady() : false); }catch(e){ return false; }
}
/* 带超时的等待 */
function bootWait(fn, ms){
  return new Promise(res => {
    let done = false;
    const t = setTimeout(() => { if(!done){ done = true; res('timeout'); } }, ms);
    Promise.resolve().then(fn).then(
      () => { if(!done){ done = true; clearTimeout(t); res('ok'); } },
      () => { if(!done){ done = true; clearTimeout(t); res('err'); } }
    );
  });
}
/* 真正跑一遍准备工作：先大纲，再事件池 */
/* 读条收尾：至少走满 520ms 再收起，然后交给主循环 */
function bootFinish(g, T0){
  const left = 520 - (Date.now() - (T0 || 0));
  const go = () => {
    bootHide();
    if(g !== gen || !running) return;   // 这一局已被放弃 / 已暂停，就别抢主循环
    if(S && !S.dead){
      refreshStatus();
      runLoop(g);
    }
  };
  if(left > 0) setTimeout(go, left); else go();
}

/* 整局预加载：按阶段切段 → 3 路并发生成 → 备到 80% 就放行进游戏，
   剩下的段在后台继续跑（这就是「进游戏后 AI 仍在多线程跑」）。 */
async function bootPrepare(g){
  const T0 = Date.now();
  try{
    bootShow('正在生成人生大纲…', 4);
    await bootWait(() => buildOutline(g), 9000);
    if(g !== gen) return;

    const to = Math.max(6, Math.round((S && S.lifespan) || LIFE_BASE));
    /* 预加载量放大：分片数按「每年条数 × AI 占比」折算，不再只按年数切 */
    const plan = planBootLoad(1, to);
    const tasks = planTasks(1, plan.to, plan.nReq);
    preTotal = tasks.length; preDone = 0; preTarget = plan.to;

    bootShow('正在预生成这一生…', 8);
    const need = Math.max(1, Math.floor(tasks.length * FILL_RATIO));
    let released = false;
    let preTimer = null;
    const release = () => {
      if(released) return;
      released = true;
      if(preTimer){ clearInterval(preTimer); preTimer = null; }
      bootShow('准备就绪', 100);
      bootFinish(g, T0);
    };
    /* 需求 4：预加载最多等 PRELOAD_MAX_MS（30 秒）。提前铺够 80% 就提前走；
       到点还没铺够就强制结束，用剩余队列 + 本地池兜底，不让玩家干等。
       注意这里用「真实时间」判定而不是单纯靠定时器触发 —— 这样在把定时器
       压缩过的桌面测试环境里也不会被误触发，行为与线上一致。 */
    preTimer = setInterval(() => {
      if(released){ clearInterval(preTimer); preTimer = null; return; }
      if(Date.now() - T0 >= PRELOAD_MAX_MS){ release(); }
    }, 500);
    /* 不 await：后台继续跑剩余段，读条到 80% 就放行 */
    runTasks(tasks, g, (t) => {
      preDone++;
      /* 与 prefetch 共用「已请求到哪一年」的游标：否则进游戏后 prefetch 会从
         S.age+1 重新请求已在途/已铺好的年份，回来的事件全被「同年龄撞车」
         闸门丢掉，既虚增深渊值又白烧 token。 */
      preHi = Math.max(preHi, t.from + t.n - 1);
      if(!released){
        const pct = 8 + Math.round(preDone / Math.max(1, tasks.length) * 88);
        bootShow('正在预生成这一生…', Math.min(96, pct));
        if(preDone >= need) release();
      }
    }).then(release, release);
  }catch(e){
    /* 失败也放行，本地池兜底 —— 绝不把玩家卡在读条里 */
    bootFinish(g, T0);
  }
}
/* 从「选完天赋、属性分配完」进入这一局：读条 → 整局预生成 → 进游戏 */
function enterLife(){
  const g = gen;
  if(!bootNeeded()){
    sleep(500).then(() => { if(g === gen && running && S && !S.dead) runLoop(g); });
    return;
  }
  bootPrepare(g);
}
/* =========================================================
   悬浮球（需求 A）：原生悬浮窗 ↔ 页面桥接
   —— 页面提供配置与 AI 调用；原生负责显示与交互
   ========================================================= */
function floatCfg(){
  const c = (function(){ try{ return getCfg(); }catch(e){ return {}; } })();
  /* 用游戏自己的取法（curProf 按 c.active 找当前配置），别自己拼字段名 */
  let p = {};
  try{ p = curProf(c) || {}; }
  catch(e){ p = (c.profiles && c.profiles[c.active]) || {}; }
  const base = p.base || c.base || '';
  const model = p.model || c.model || '';
  const key = p.key || c.key || '';
  let url = '';
  try{ url = endpointOf(base, '/chat/completions'); }catch(e){ url = base; }
  return { url: url, model: model, key: key, ok: !!(url && key && aiReady()) };
}
/* 悬浮窗开关 */
function floatSet(on){
  let ok = false;
  try{ ok = !!(window.Android && Android.floatToggle && Android.floatToggle(!!on)); }catch(e){ ok = false; }
  const sw = $('#dgFloat'); if(sw) sw.classList.toggle('on', ok);
  const tip = $('#dgFloatTip');
  if(tip){
    tip.textContent = ok
      ? '已开启（可拖动，点一下展开）'
      : (window.Android && Android.floatCanDraw && Android.floatCanDraw()
          ? '在任意界面快速打开调试与无敌模式'
          : '需要先允许「显示在其他应用上层」权限');
  }
  if(on && !ok){ toast('未能开启：请到系统设置里允许悬浮窗权限'); }
  return ok;
}
function floatSync(){
  let on = false;
  try{ on = !!(window.Android && Android.floatIsOn && Android.floatIsOn()); }catch(e){}
  const sw = $('#dgFloat'); if(sw) sw.classList.toggle('on', on);
  return on;
}
/* 原生调用入口：拿配置 */
window.__floatCfg = function(){ try{ return JSON.stringify(floatCfg()); }catch(e){ return '{}'; } };
/* 原生调用入口：代发一次 AI 请求（返回 JSON 字符串；异步结果走回调） */
window.__floatAsk = function(text, cbName){
  const done = (obj) => {
    try{ window[cbName] && window[cbName](JSON.stringify(obj)); }catch(e){}
  };
  (async () => {
    try{
      const cf = floatCfg();
      if(!cf.ok){ done({ok:false, msg:'还没有配置可用的 AI 接口，请先在游戏的「设置 → 模型配置」里填好。'}); return; }
      const raw = await callAI([
        {role:'system', content: WORLD_BOOK + '\n\n【本次任务】你是这款游戏的随身助手，用简洁平实的中文回答玩家的问题。'},
        {role:'user', content: String(text || '').slice(0, 800)}
      ], 700);
      done({ok:true, msg: String(raw || '（没有返回内容）')});
    }catch(e){
      done({ok:false, msg:'请求失败：' + ((e && e.message) || e)});
    }
  })();
  return true;
};
/* 原生调用入口：读一小段状态，供悬浮窗展示 */
window.__floatStat = function(){
  try{
    const a = S ? S.attr : {};
    return JSON.stringify({
      dev: DEV_ON, ver: GAME_VER,
      life: S ? (S.dead ? '已结束' : (Math.round(S.age) + ' 岁 · ' + stageOf(S.age))) : '未开局',
      attr: '颜' + (a.CHR||0) + ' 智' + (a.INT||0) + ' 体' + (a.STR||0) + ' 家' + (a.MNY||0) +
            ' 乐' + (a.SPR||0) + ' 幸' + (a.LUK||0)
    });
  }catch(e){ return '{}'; }
};
/* 原生调用入口：读当前无敌模式状态 */
Object.defineProperty(window, '__floatDevNow', { get(){ return !!DEV_ON; } });
/* 原生调用入口：切无敌模式 */
window.__floatDev = function(on){
  try{ devSet(!!on); return DEV_ON; }catch(e){ return false; }
};
/* 原生调用入口：无口令进入调试面板（悬浮球专用快捷入口） */
window.__floatOpenDbg = function(){
  try{ openDbg(); return true; }catch(e){ return false; }
};
/* v0.1.3 D：原生调用入口 —— 从悬浮窗按当前属性直接结算这一局（仍走二次确认） */
window.__floatEndLife = function(){
  try{
    if(!S || S.dead){ toast('当前没有进行中的一局'); return false; }
    const ag = Math.round(S.age);
    dialog('立即结束这一局？', '会按当前 ' + ag + ' 岁的属性直接结算，确定吗？', [
      {t:'结束', pri:true, fn:() => { logLine('DEV', '从悬浮窗结束一局（' + ag + ' 岁）'); die(); }},
      {t:'取消', plain:true}
    ]);
    return true;
  }catch(e){ return false; }
};

/* ========== 启动 ========== */
bindUI();
bindDbUI();
/* patch53 需求 1：启动时自净一次（只清「与内置库重复的外部/AI 副本」，本地数据不动） */
try{ const _purged = dbPurgeLocalDup(); if(_purged && typeof dbRender === 'function') dbRender(); }catch(e){}
applyTheme();
refreshMenu();
goState('MAIN_MENU');