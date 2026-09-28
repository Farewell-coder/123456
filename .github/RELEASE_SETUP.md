# 发布与 CI 说明

本工程的 GitHub Actions 流水线：

| 文件 | 触发 | 产物 |
|---|---|---|
| `.github/workflows/build-dev.yml` | push 到 `main`、手动触发 | debug APK，作为 artifact 上传，不发 Release |
| `.github/workflows/build-release.yml` | push tag `v*`、手动触发（需填 tag） | 签名 release APK + GitHub Release |

CI 统一使用仓库里的 Gradle Wrapper（Gradle 8.7）：`./gradlew`，不要依赖 runner 上的 `gradle` 命令。

---

## 1. 需要配置的 Secrets

在 GitHub 仓库页面 **Settings → Secrets and variables → Actions → New repository secret** 添加以下 4 个（名称必须完全一致）：

| Secret | 含义 |
|---|---|
| `KEYSTORE_BASE64` | 签名 keystore（`.jks`）文件的 base64 编码内容 |
| `KEYSTORE_PASSWORD` | keystore 的 store password |
| `KEY_ALIAS` | 签名条目的别名（可用 `keytool -list` 查看） |
| `KEY_PASSWORD` | 该别名对应的 key password |

也可以用 `gh` CLI 一次性设置（`<` 后面是本地文件，不会出现在命令行历史里）：

```bash
gh secret set KEYSTORE_BASE64   < keystore.b64
gh secret set KEYSTORE_PASSWORD
gh secret set KEY_ALIAS
gh secret set KEY_PASSWORD
```

`KEYSTORE_BASE64` 以外的三个 secret 直接粘贴明文值即可。四个 secret 缺任何一个，release 流水线会在「Decode keystore」这一步直接失败并给出提示，不会产出未签名的包。

---

## 2. 把 keystore 转成 base64

假设 keystore 放在工程同级的 `keys/` 目录（即 `keys/liferestart-release.jks`）：

```bash
# Linux（-w0 表示不换行）
base64 -w0 keys/liferestart-release.jks > keystore.b64

# macOS（系统 base64 没有 -w 选项）
base64 -i keys/liferestart-release.jks -o keystore.b64
```

自检解码是否与原文件一致，然后删掉临时文件：

```bash
base64 -d keystore.b64 | cmp - keys/liferestart-release.jks && echo "base64 校验通过"
rm -f keystore.b64
```

`keystore.b64` 里就是签名私钥，等同于密码，**不要提交到仓库、不要贴到聊天/issue 里**；上传成 secret 之后本地临时文件应立即删除。

CI 中的处理方式：

1. `KEYSTORE_BASE64` 解码到 runner 工作目录的 `release.jks`（在仓库目录内，但 `*.jks` 已被 `.gitignore` 忽略）；
2. 在工程**同级**目录写 `keys/keystore.properties`（因为 `app/build.gradle` 读的是 `rootProject.file('../keys/keystore.properties')`），其中 `storeFile` 写 `release.jks` 的绝对路径；
3. 用 `keytool -list` 验证 keystore 能打开、别名存在，之后才编译。

---

## 3. 打 tag 触发发布

```bash
# 1. 确认工作区干净、要发布的提交已推送
git status
git push origin main

# 2. 打 tag（版本号决定 versionName / versionCode，见第 4 节）
git tag v0.0.2

# 3. 推送 tag，触发 build-release.yml
git push origin v0.0.2
```

流水线跑完后，Release 页面会出现 `v0.0.2`，附件名为：

```
My-Life-My-Sim-v0.0.2-release.apk
```

Release 正文由 GitHub 自动生成（`generate_release_notes: true`）。tag 名里含 `alpha` / `beta` / `rc` 时会被标记为 pre-release。

### 手动触发

**Actions → Build Release APK → Run workflow**，在 `tag` 输入框里填 `v0.0.2`。

- 手动触发时 `tag` 必填，留空会直接报错；
- 如果该 tag 还不存在，Release 会把 tag 创建在**本次运行所用的 commit** 上。所以正常流程还是推荐先在本地打 tag 再推送。

---

## 4. 版本号如何同步

CI 不会改动仓库里的 `app/build.gradle`，只在 runner 的工作区里用 tag 名就地改写，然后编译：

| tag | versionName | versionCode |
|---|---|---|
| `v0.0.1` | `0.0.1` | `1` |
| `v0.0.2` | `0.0.2` | `2` |
| `v0.1.0` | `0.1.0` | `100` |
| `v1.2.3` | `1.2.3` | `10203` |

- `versionName` = tag 去掉前缀 `v`（后缀保留，如 `v0.1.0-beta` → `0.1.0-beta`）；
- `versionCode` = `major * 10000 + minor * 100 + patch`，与仓库里既有的 `versionName 0.0.1` / `versionCode 1` 约定一致；
- tag 必须匹配 `^v<major>.<minor>.<patch>`（可带 `-beta`、`+build` 之类后缀），否则流水线在「Resolve version from tag」步骤报错退出；
- 因此每发一个新版本都要保证 `versionCode` 递增，同一 tag 不要重复发布。

仓库里 `app/build.gradle` 的 `versionCode` / `versionName` 保持当前值即可，本地构建时用它自己的值。

---

## 5. 本地构建（与 CI 对齐）

签名口令不进版本库，`app/build.gradle` 从**工程同级**的 `keys/keystore.properties` 读取：

```
storeFile=/absolute/path/to/keys/liferestart-release.jks
storePassword=<store password>
keyAlias=<key alias>
keyPassword=<key password>
```

`storeFile` 用绝对路径最省心（`file(...)` 的解析基准是 `app/` 目录）。`keys/`、`*.jks`、`keystore.properties` 都已写进 `.gitignore`，不会被提交。

查看别名：

```bash
keytool -list -keystore keys/liferestart-release.jks
```

构建：

```bash
./gradlew assembleRelease   # 产物：app/build/outputs/apk/release/app-release.apk
./gradlew assembleDebug     # 产物：app/build/outputs/apk/debug/app-debug.apk
```

没有 `keys/keystore.properties` 时 `app/build.gradle` 不会配置签名，`assembleRelease` 会产出未签名的包，CI 里这种情况会被「Verify APK signature」步骤拦下。

---

## 6. 安全约定

- 口令、token 一律走 GitHub Secrets，任何文件里都不写明文；
- 不提交 `keys/`、`*.jks`、`keystore.properties`、`local.properties`、`gradle.properties`；
- 不把开发机的绝对路径写进仓库文件（CI 用 `$GITHUB_WORKSPACE` 之类的环境变量）；
- **keystore 一定要另行备份**：Android 应用的升级包必须用同一份签名，keystore 丢了就只能换包名重新发布。

---

## 7. 升级 Gradle Wrapper

```bash
gradle wrapper --gradle-version 8.7
```

会更新 `gradlew`、`gradlew.bat`、`gradle/wrapper/gradle-wrapper.jar`、`gradle/wrapper/gradle-wrapper.properties` 四个文件，需要一并提交。升级后确认 `app/build.gradle` 里 AGP 版本（当前 8.5.2）与 Gradle 版本兼容。
