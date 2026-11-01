# RecallMate Android 0.1.2

Android 版在 `feature/android` 分支开发，Windows 稳定基线为标签 `windows-v0.1.4`。共享 `src/domain/` 的解析、匹配、提示、统计和练习会话，不维护两份判题实现。

0.1.1 修复软键盘场景：题目与填空在独立区域内上下滚动，反馈和操作栏固定在其下方；点击提示及按住查看答案保留输入焦点和键盘，查看期间不接受答案编辑，松开后恢复光标。

0.1.2 优化键盘打开后的题目空间：依据原生键盘显示状态收起标题、退出导航、进度条及版本状态栏，保留系统安全边距、题号/填空数和答题按钮；关闭键盘恢复完整导航。取消常驻的确认操作提示，仅在判题后保留未完整、错误、完成和放弃反馈。长题仍在独立区域滚动，提示和按住答案继续保持键盘。

## 首版功能

- 竖屏手机布局：题库卡片、底部题库/错题导航、单独的练习操作区；手机和平板可随屏幕旋转。
- UTF-8 TXT、Markdown 和 RecallMate JSON 通过系统文件选择器导入，单文件最大 20 MiB；粘贴导入、预览与错误提示沿用桌面版。
- 题库和题目的新增、修改、搜索、重命名、删除、分页；顺序/随机/单题/从指定题开始、错题和本轮错题练习。
- 顿号及“和”的单空/跨空混合换序、一对一匹配、部分正确字符高亮、提示、按住查看答案、放弃与跳过。
- 独立的界面/练习字号，输入框随练习字号同步缩放，重启后保留。
- 原生私有目录 JSON 保存，使用 Android AtomicFile 与串行 I/O；上一份已验证快照单独备份，损坏时恢复备份并保留原文件。
- 输入停止 400ms 后保存；判题、切题立即保存；进入后台和通过返回键离开练习时主动刷写。突然断电或系统强制终止前未完成的写入不作持久化承诺。
- 返回键先关闭键盘、弹窗和菜单，再返回题库；主页返回时将应用放入后台。
- 通过系统保存窗口导出 JSON，Windows 和 Android 可互相恢复题库、统计与进度；不做自动云同步。

应用 ID 为 `com.recallmate.mobile`。测试包单独使用 `com.recallmate.mobile.dev`，测试不会清除正式包数据。

## 环境

- Node.js 22+、JDK 21、Android Studio 2025.2.1+。
- Android SDK Platform 36、Build-Tools 36.0.0、Platform-Tools 和 Command-line Tools。
- Capacitor core/android/cli 锁定 8.6.0；Gradle Wrapper 8.14.3、AGP 8.13.0。
- `JAVA_HOME` 指向 JDK 21，`ANDROID_HOME` 指向 SDK。Android Studio 自身继续使用内置 JBR。
- 最低系统 Android 7.0 / API 24，建议较新系统和更新后的 Android System WebView。实际兼容性需结合具体手机验证。

## 开发与打包

```powershell
npm.cmd ci
npm.cmd test
npm.cmd run build:android:web
npm.cmd run android:sync
npm.cmd run android:open
```

构建脚本会读取已保存的用户/系统环境变量，设置本次构建的 `JAVA_HOME`、SDK 路径和项目内 Gradle 缓存，并生成被 Git 忽略的 `android/local.properties` 与 `android/.gradle/config.properties`。Android Studio 的项目 Gradle JDK 应选相同的 JDK 21；不要用其内置 Java 25 运行本项目的 Gradle 8。

```powershell
# 调试 APK；与正式应用分开安装
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/build-android.ps1 -DebugBuild

# 签名发布 APK
npm.cmd run android:apk

# 使用本机 7890 代理（只影响本次构建）
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/build-android.ps1 -Proxy http://localhost:7890
```

`-Proxy` 仅用于 Gradle/Java 下载；npm 首次依赖下载若需要代理，可在 `npm ci` 后附加 `--proxy=http://localhost:7890`。Gradle 缓存默认在 `.cache/gradle`，已有 `GRADLE_USER_HOME` 时尊重原设置。

生成的正式发布项：

```text
release/android/
  RecallMate-Android-0.1.2.apk
  SHA256SUMS.txt
  使用说明.txt
```

正式包会使用本机生成的签名密钥，关闭 WebView 调试；调试包只供模拟器验证。发布 APK 可直接传入手机安装，无需在手机安装 Node 或开发工具。后续升级提高 `android/app/build.gradle` 中的 `versionCode`，使用相同密钥，覆盖安装可保留应用数据。

## 签名与数据备份

**保管好 `.local/android-signing/` 整个目录。** 它包含签名密钥和本地配置，不是可删除的构建缓存。请另做私有备份；密钥丢失后，无法以相同签名覆盖升级已有安装。

`.local/`、密钥、`local.properties`、Gradle 缓存、构建资源与个人数据均排除在 Git 之外。不要上传签名目录或其配置到 GitHub。

手机上的题库保存在应用私有目录，卸载或清除应用数据会删除它们。请先从题库导出 JSON；安卓的本地自动备份不能代替外部导出。APK 自身不携带个人题库，不需要广泛存储权限。

## 验证

```powershell
# 先启动一个专用模拟器，避免测试影响日常使用的设备
# 默认测试目标为 emulator-5580；也可指定另一专用模拟器
$env:RECALLMATE_ANDROID_SERIAL = 'emulator-5580'
npm.cmd run test:android

# 长题、真实上下滑动、提示/答案按钮的软键盘保持
npm.cmd run test:android:keyboard

# 对专用模拟器中的签名 APK 验证离线启动与覆盖安装
npm.cmd run test:android:release

# 同时保留 Windows 共享界面与领域逻辑回归
npm.cmd test
npm.cmd run test:desktop
```

安卓脚本使用真实 APK、原生文件桥、系统文件选择器和 WebView CDP；仅重置 `.dev` 测试应用的数据，拒绝物理设备序列号。截图、测试题库及结果保存在 `artifacts/android/`。发布前另验证正式 APK 的签名、安装及启动。

首版不包含商店上架、云端同步、账号、OCR、AI 判题、自动更新。不同厂商真机上的中文输入法、文件管理器和省电策略仍需人工体验反馈。
