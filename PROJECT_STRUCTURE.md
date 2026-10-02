# 项目结构说明

> 这份文件是给「第一次打开这个项目」的人看的。
> 不用懂编程，看完就知道每个文件夹是干什么的。

---

## 一、先看这三个

| 文件夹 | 一句话说明 | 能不能删 |
|---|---|---|
| `app/` | **游戏本体**。打包成 APK 的东西全在这里 | 绝对不能 |
| `tests/` | **自动测试**。改完代码跑一遍，看有没有改坏 | 不能（但可以不管） |
| `dev/` | **开发辅助**。数据生成脚本、一次性小工具 | 可以不管 |

---

## 二、`app/` —— 游戏本体

```
app/src/main/
├── assets/              ← 游戏的所有代码（网页形式）
│   ├── index.html          页面骨架
│   ├── css/style.css       外观样式（颜色、布局）
│   └── js/                 逻辑代码，按顺序加载
│       ├── 00-config.js      第1步：配置与常量
│       ├── 01-data.js        第2步：静态数据（天赋、事件库）
│       ├── 02-core.js        第3步：核心引擎（数值计算）
│       ├── 03-logic.js       第4步：游戏逻辑（每年发生什么）
│       ├── 04-ai.js          第5步：结局与 AI 文案
│       └── 05-main.js        第6步：界面与交互
├── java/                ← Android 外壳代码
│   └── com/life/restart/
│       ├── MainActivity.java   主界面（装网页的容器）
│       └── FloatService.java   悬浮球功能
└── res/                 ← 图标、应用名、主题色
```

**为什么要拆成 6 个 js 文件？**
以前是一个巨大的 `index.html`（将近 1 万行），改一行要翻半天。
现在按「职责」拆开，每个文件只管一件事，找起来快。

**为什么加载顺序是 00 → 05？**
后面的文件要用前面的东西。顺序错了游戏就起不来。

---

## 三、`tests/` —— 自动测试

```
tests/
├── lib/            测试用的共享工具（不是测试本身）
│   ├── load-game.js     把 6 个 js 拼起来给测试用
│   └── fake-browser.js  假浏览器（不开真手机也能跑）
├── checks/         单元检查（快，几秒一个）
├── features/       功能专项（每个功能一批断言）
└── e2e/            端到端（真跑整个游戏，最慢也最真）
```

### 怎么跑

```sh
sh runall.sh                # 快速档，约 1 分钟（日常改完就跑这个）
MODE=full sh runall.sh      # 完整档，约 12 分钟（出包前跑）
sh runall_fast.sh           # 并行版，4 个同时跑，约 3 分钟
```

看最后一行：
- `FAIL=0` → 全过，可以放心
- `FAIL>0` → 有东西坏了，看上面哪一项是 `FAIL`

### 各文件是干什么的

**`tests/checks/`（快）**

| 文件名 | 检查什么 |
|---|---|
| `regression-skeleton.js` | 6 个源文件都在、语法都对、引用没断 |
| `xss-escape.js` | 用户输入会不会被当代码执行（安全） |
| `text-normalize.js` | 文本清洗函数是否正常 |
| `text-similarity.js` | 两段文字相似度算法是否正确 |
| `text-purify.js` | 脏数据能否净化成纯文本 |
| `dom-structure.js` | 网页标签有没有配对错 |
| `layout-fixed.js` | 属性栏固定、日志滚动是否正常 |
| `scroll-and-log.js` | 滚动同步与日志净化 |
| `ai-text-checkbox.js` | 结算页「AI 文案入库」勾选框 |
| `local-data-hidden.js` | 本地数据是否真的隐藏了 |
| `log-one-by-one.js` | 日志是不是一条一条出（不是挤一堆） |
| `ai-prefetch-count.js` | AI 预加载条数是否达标 |
| `event-integrity.js` | 事件库 id 唯一、性别分布正常 |
| `duplicate-scan.js` | 扫描重复条目 |
| `gender-system.js` | 性别体系（需求 27/28） |
| `new-database.js` | 调试页完整数据库三类来源 |
| `patch54-57.js` | 历史补丁收尾自检 |
| `v002-features.js` | v0.0.2 需求自检（开局不自动播放 / AI 交互事件入队 / 抉择节流与放大） |

**`tests/features/`（中）**

| 文件名 | 检查什么 |
|---|---|
| `content-library.js` | 内容库/条件模板/成就/日志着色 |
| `v230-requirements.js` | v2.3.0 的 7 条需求 |
| `theme-and-config.js` | 页面主题不改系统 + 模型配置页 |
| `v232-bugfix.js` | v2.3.2 两个 bug 修复 |
| `data-detail-expand.js` | 数据管理每条可点开看全文 |
| `about-debug-panel.js` | 关于页 + 隐藏调试面板 + 诊断 zip |
| `worldbook-boot.js` | 世界书 + 开局读条 + 悬浮球桥接 |
| `prefetch-abyss.js` | 并发预加载 + 配比债务 + 深渊值 |
| `v220-features.js` | v2.2.0 全部功能 |
| `css-coverage.js` | 每个 class 是否都有样式（防漏写） |
| `menu-cards.js` | 主菜单改版 + 卡片折叠 |
| `v011-features.js` | v0.1.1 四条需求 |
| `history-review.js` | 历史战绩回看（只读） |
| `event-library.js` | 扩充事件库审核入库 |

**`tests/e2e/`（慢）**

| 文件名 | 检查什么 |
|---|---|
| `smoke-test.js` | 冒烟：整个游戏能不能跑起来 |
| `full-app-test.js` | 全功能检测台（内容库/存档/主题/调试面板） |
| `play-50-games.js` | 自动玩 50 局，统计死因/结局/属性越界 |

---

## 四、`dev/` —— 开发辅助

```
dev/
├── tools/          小工具（统计、扫描、清理）
│   ├── chk_fmt.py        检查格式
│   ├── scan_emoji.py     扫描 emoji（游戏正文不许用）
│   ├── strip_emoji.py    批量清除 emoji
│   ├── sim_sex.py        模拟性别抽取
│   ├── show_male.py      只显示男性事件
│   ├── stat_sex.py       统计性别分布
│   ├── stat_eff.py       统计效果字段
│   ├── stat_vocab.py     统计用词
│   └── sym_buttons.py    按钮符号一致性
├── data-pack/      数据打包
│   ├── hn_events.min.json   事件库源数据（游戏里那份的源头）
│   ├── check_req.py         检查 req 字段
│   ├── gen_builtin_ev.py    生成内置事件块
│   ├── gen_reinject.py      生成重注入数据
│   ├── ev_reinject.txt      重注入数据产物（由 gen_reinject.py 写出）
│   ├── reinject.py          把数据注入回游戏
│   ├── vcheck.py            校验计数
│   └── verify_v014.py       校验 v0.1.4
└── clean-residue.sh    清理历史残留脚本
```

**注意**：`dev/` 里的东西**游戏运行不需要**，只是开发时用。删掉游戏照样跑。

---

## 五、根目录

| 文件 | 说明 |
|---|---|
| `build.gradle` / `settings.gradle` | 编译配置 |
| `gradlew` | 编译命令（Linux/Mac） |
| `gradlew.bat` | 编译命令（Windows） |
| `runall.sh` | 跑测试（快速档） |
| `runall_fast.sh` | 跑测试（并行版） |
| `README.md` | 项目介绍 |
| `CHANGELOG.md` | 更新日志 |
| `LICENSE` | GPL-3.0 开源协议 |
| `package.json` | 测试依赖声明（jsdom） |
| `package-lock.json` | 测试依赖的锁定版本（`npm install` 生成） |
| `node_modules/` | 测试依赖本体（jsdom 等），删了重跑 `npm install` 即可 |
| `gradle.properties` | Gradle 参数（含 aapt2 覆盖路径，别乱改） |
| `local.properties` | 本机 SDK 路径（换电脑要重新生成） |
| `gradle/` | Gradle 自带的 wrapper |

---

## 六、出 APK 的命令

```sh
/opt/gradle/gradle-8.7/bin/gradle assembleRelease --offline
```

产物在 `app/build/outputs/apk/release/app-release.apk`。

---

## 七、改名对照表（老名字 → 新名字）

如果你以前记的是老名字，看这张表：

| 老名字 | 新名字 | 为什么改 |
|---|---|---|
| `loadjs.js` | `tests/lib/load-game.js` | 「加载游戏」比「loadjs」清楚 |
| `domstub.js` | `tests/lib/fake-browser.js` | 它是假浏览器，不是「dom桩」 |
| `smoke.js` | `tests/e2e/smoke-test.js` | 加 -test 后缀一眼知道是测试 |
| `t42.js` | `tests/e2e/full-app-test.js` | t42 看不出是什么 |
| `t50runs.js` | `tests/e2e/play-50-games.js` | 直接说明「玩 50 局」 |
| `t43.js` | `tests/features/v220-features.js` | 对应 v2.2.0 功能 |
| `t44.js` | `tests/features/css-coverage.js` | CSS 覆盖率检查 |
| `t45.js` | `tests/features/menu-cards.js` | 主菜单与卡片 |
| `t48.js` | `tests/features/v011-features.js` | 对应 v0.1.1 需求 |
| `t49.js` | `tests/features/history-review.js` | 历史战绩回看 |
| `t50.js` | `tests/features/event-library.js` | 事件库审核 |
| `t37.js` | `tests/features/about-debug-panel.js` | 关于页与调试面板 |
| `t40.js` | `tests/features/worldbook-boot.js` | 世界书与开局读条 |
| `t41.js` | `tests/features/prefetch-abyss.js` | 预加载与深渊 |
| `chk30.js` | `tests/checks/xss-escape.js` | XSS 转义检查 |
| `chk31.js` | `tests/checks/text-normalize.js` | 文本规范化 |
| `chk32.js` | `tests/checks/text-similarity.js` | 文本相似度 |
| `chk34.js` | `tests/checks/dom-structure.js` | DOM 结构完整性 |
| `chk57.js` | `tests/checks/patch54-57.js` | 补丁收尾 |
| `chk58.js` | `tests/checks/gender-system.js` | 性别体系 |
| `chk59.js` | `tests/checks/local-data-hidden.js` | 本地数据隐藏 |
| `chk60.js` | `tests/checks/log-one-by-one.js` | 日志逐条显示 |
| `chk61.js` | `tests/checks/ai-prefetch-count.js` | AI 预加载条数 |
| `chk_new.js` | `tests/checks/new-database.js` | 新版数据库 |
| `chk_dup.js` | `tests/checks/duplicate-scan.js` | 重复扫描 |
| `v220.js` | `tests/features/content-library.js` | 内容库 |
| `v230.js` | `tests/features/v230-requirements.js` | v2.3.0 需求 |
| `v231.js` | `tests/features/theme-and-config.js` | 主题与配置 |
| `v232.js` | `tests/features/v232-bugfix.js` | v2.3.2 修复 |
| `v233.js` | `tests/features/data-detail-expand.js` | 数据详情展开 |
| `layout.js` | `tests/checks/layout-fixed.js` | 布局固定区 |
| `fix24.js` | `tests/checks/ai-text-checkbox.js` | AI 文案勾选框 |
| `fix20.js` | `tests/checks/scroll-and-log.js` | 滚动与日志 |
| `purge.js` | `tests/checks/text-purify.js` | 文本净化 |
| `rt24.js` | `tests/checks/regression-skeleton.js` | 回归骨架 |
| `verify_ev.js` | `tests/checks/event-integrity.js` | 事件完整性 |
| `datapack/` | `dev/data-pack/` | 归入开发辅助 |
| `tools/` | `dev/tools/` | 归入开发辅助 |
| `hn_events.min.json` | `dev/data-pack/hn_events.min.json` | 它是数据源，不是运行时文件 |
| `cleanup_residue.sh` | `dev/clean-residue.sh` | 归入开发辅助 |