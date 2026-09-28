# My Life, My Sim

一款**纯前端、可离线运行**的中文人生模拟器。抽天赋 → 分配属性 → 一年一年地过 → 死亡时结算评级，附一段墓志铭。

Android 端由 WebView 壳承载，游戏本体是一套零依赖的原生 JavaScript 单页应用。

---

## 玩法

1. **抽天赋** —— 从 59 个天赋中抽取开局词条，稀有度分白 / 蓝 / 紫 / 橙
2. **分配属性** —— 基础 6 项：颜值 / 智力 / 体质 / 家境 / 幸运 / 快乐
3. **逐年推进** —— 从 0 岁到寿终，每年一次事件
4. **结算** —— 死亡时按属性组合判定结局（17 个专属结局 + 综合评分），附一段墓志铭

隐藏属性 4 项：情商 / 意志力 / 心理健康 / 社会影响力。归零会触发特殊走向。

---

## 特性

- **可离线**：自带 154 条事件库，关掉 AI 也能完整走完一生
- **可联网**：接入任意 OpenAI 兼容接口，由模型现场生成年度事件、墓志铭与对话
- **本地存档**：所有数据只留在这台设备上，不上传任何服务器
- **图鉴系统**：跨周目累积已见事件、天赋、结局
- **内容库**：支持导入 / 导出自定义事件、天赋、成就、结局，并可标记来源（本地 / 外部 / AI 加入）
- **深浅色主题**：跟随系统暗色模式开关
- **因果链**：属性与状态标签会影响后续事件的走向，而不是纯随机抽卡

---

## AI 配置

游戏**不内置任何 API Key**。在「设置 → AI」里填入你自己的 OpenAI 兼容端点与密钥即可：

| 项 | 说明 |
|---|---|
| API 提供商 | 内置 DeepSeek / Moonshot / OpenAI / 硅基流动 / 阿里云百炼 / 智谱 / OpenRouter 等预设，也可自定义 |
| API Key | 仅保存在本机，不会外传 |
| 模型 | 可拉取端点下的模型列表后选择 |
| AI 占比 | 0–100%，控制 AI 生成事件与本地事件库的比例 |

> 端点与密钥都由你自己提供，作者不提供、不代管、不收集任何凭据。

---

## 项目结构

```
app/src/main/
├── assets/                 游戏本体（WebView 加载的网页）
│   ├── index.html          页面骨架
│   ├── css/style.css       主题变量 + 全部样式（light / dark 两套）
│   └── js/
│       ├── 00-config.js    全局常量、世界书、版本号
│       ├── 01-data.js      内置数据（天赋 / 事件 / 结局 / 成就）
│       ├── 02-core.js      状态、存档、工具函数
│       ├── 03-logic.js     人生推进核心逻辑
│       ├── 04-ai.js        AI 请求、事件生成、队列
│       └── 05-main.js      界面渲染与事件绑定
├── java/com/life/restart/
│   ├── MainActivity.java   WebView 壳 + 原生桥接（深色模式 / 目录选择）
│   └── FloatService.java   悬浮球
└── res/                    图标、主题、字符串

hn_events.min.json          事件库数据源
```

---

## 构建
需要 Android SDK 与 JDK 17：
```bash
./gradlew assembleRelease
```

签名配置从工程外的 `keystore.properties` 读取（见 `app/build.gradle`），该文件不入库。
最低支持 Android 8.0（API 26），目标 API 34。

---
## 下载与更新
- 发布包：见 [Releases](https://github.com/Farewell-coder/My-Life-My-Sim/releases)
- 更新日志：[CHANGELOG.md](CHANGELOG.md)
- 发版流程（含签名配置）：[.github/RELEASE_SETUP.md](.github/RELEASE_SETUP.md)

---

## 关于

- **作者**：aerree
- **反馈群**：864339949
- **版本**：v0.0.1

---

## 说明

事件文案部分由 AI 生成，仅供娱乐。
