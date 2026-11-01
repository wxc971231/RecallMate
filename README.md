<p align="center">
  <img src="_doc/assets/recallmate-header.svg" alt="RecallMate · 离线填空背诵工具" width="100%" />
</p>

<p align="center">
  <a href="#快速开始"><img src="_doc/assets/badge-windows.svg" alt="Windows 0.1.5 · 文件夹便携版" height="28" /></a>
  <a href="_doc/RecallMate_Android.md"><img src="_doc/assets/badge-android.svg" alt="Android 0.1.2" height="28" /></a>
  <a href="#数据与备份"><img src="_doc/assets/badge-local.svg" alt="离线使用 · 本地存储" height="28" /></a>
</p>

<p align="center">
  导入 Markdown / TXT 题库，逐空作答、即时判题、复习错题。<br />
  支持 Windows 与 Android，题库、统计和练习进度通过 JSON 备份互相迁移。
</p>

<p align="center">
  <a href="#快速开始">快速开始</a> ·
  <a href="#题库格式">题库格式</a> ·
  <a href="_doc/使用指南.md">使用指南</a> ·
  <a href="#开发构建">开发构建</a>
</p>

---

## 功能一览

| 功能 | 说明 |
| --- | --- |
| 导入题库 | UTF-8 Markdown / TXT、粘贴文本、JSON 恢复；导入前预览并提示格式错误 |
| 填空练习 | 多个合法答案、顿号与“和”连接的并列答案换序、部分正确字符高亮 |
| 提示与答案 | 按住查看、逐字提示、放弃补全、跳过；保留用户已答对的内容 |
| 复习与统计 | 顺序 / 随机 / 单题练习、错题本、本轮错题重练与独立完成统计 |
| 本地保存 | 自动保存题库和进度、恢复上次练习、JSON 备份与跨端迁移 |
| 界面调整 | 界面与练习字号独立调节；Windows 自定义快捷键；Android 键盘弹出时扩大题目区域 |

## 快速开始

| 平台 | 当前版本 | 使用方式 |
| --- | --- | --- |
| Windows x64 | **0.1.5** | 解压 `RecallMate-0.1.5-Portable.zip`，双击 `RecallMate.exe`；保留整个文件夹 |
| Android 7.0+ | **0.1.2** | 安装 `RecallMate-Android-0.1.2.apk`；相同签名的新版可覆盖升级 |

安装包由[构建流程](#开发构建)生成，保存在本机 `release/`，不纳入 Git。软件运行时无需 Node.js、服务器或网络连接。

1. 打开应用，选择 **体验示例题库**，导入 20 道示例题；也可导入[示例文件](examples/综合知识示例.md)或自己的题库。
2. 点击 **开始练习**，输入答案后点击 **确认答案**；Windows 默认也可按 Enter。
3. 修改标红内容，全部答对后进入下一题；退出后可继续上次练习。

Windows 日常使用时，建议把整个软件文件夹复制到独立位置。`release/` 是发布目录，重新构建会备份其中的旧数据并替换旧版本。

## 题库格式

使用 `{{答案}}` 标记填空，`|` 分隔可接受答案，独占一行的 `---` 分隔题目。

```md
# 生物学复习

光合作用的能量来源是{{光能}}，主要发生在{{叶绿体}}中。

---

水的化学式为{{H₂O|H2O}}。

---

三种颜色是{{红}}、{{绿}} 和 {{蓝}}。
```

并列答案在一个空内或多个空之间都支持换序，例如 `{{a、b、c 和 d}}` 可填写 `d 和 c、a、b`。其他大小写、标点和全半角严格匹配；有先后顺序的内容请避免写成无序并列组。完整规则见[使用指南](_doc/使用指南.md)。

## 操作与快捷键

| 操作 | Windows 默认快捷键 | 行为 |
| --- | --- | --- |
| 查看答案 | 按住 F1 | 临时显示答案，松开还原输入 |
| 提示 | F2 | 保留正确部分，补入一个字符 |
| 放弃 | Shift + F3 | 补全本题，标记系统补写内容 |
| 跳过 | F4 | 直接进入下一题 |
| 确认 / 下一题 | Enter | 判定当前空；本题完成后再按一次切题 |

Windows 在 **设置 → 答题快捷键** 中改键、停用或恢复默认，重复组合会提示冲突。输入法选词和弹窗期间暂停响应，长按不会连续触发。

Android 使用触摸按钮。键盘弹出时自动收起标题、退出导航、进度条和底部状态栏，题目区域可上下滚动；收起键盘恢复导航。提示和按住答案会保持键盘。

两端均可通过顶部 **字号** 分别调整界面和练习文字大小，设置自动保存。

## 数据与备份

| 平台 | 数据位置 | 导出备份 |
| --- | --- | --- |
| Windows | EXE 同级的 `data/`；可在设置中打开 | 题库“导出备份”，写入 `data/exports/` |
| Android | 应用私有目录 | 题库“导出备份”，在系统窗口选择保存位置 |

JSON 备份包含题目、统计与当前进度，可在两端通过导入恢复。Windows 移动软件前请先关闭并复制整个文件夹；Android 卸载或清除应用数据前，请先导出备份。

旧版本迁移、自动备份和损坏恢复见[使用指南](_doc/使用指南.md#数据备份与迁移)。

## 开发构建

技术栈：**React · TypeScript · Vite · Electron · Capacitor**。Node.js 使用 22+，已验证版本为 24.11.1；依赖版本由 `package-lock.json` 锁定。

```powershell
npm.cmd ci
npm.cmd run dev          # Windows 开发模式
npm.cmd run dist         # Windows 文件夹便携版 + ZIP
npm.cmd run android:open # 打开已有的 Android Studio 工程
npm.cmd run android:apk  # 构建签名 APK，需先配置安卓环境
```

| 文档 | 内容 |
| --- | --- |
| [使用指南](_doc/使用指南.md) | 判题规则、错题统计、字号、备份与数据迁移 |
| [开发与发布](_doc/开发与发布.md) | Windows 环境、构建命令、便携目录、测试与发布流程 |
| [Android 开发](_doc/RecallMate_Android.md) | SDK / JDK、Android Studio、模拟器、签名与 APK 构建 |
| [PC 产品设计](_doc/RecallMate_PC_V1.1.md) | 原始产品需求与设计说明 |

当前开发分支为 `feature/android`。项目暂未实现账号、云同步、OCR、AI 判题或自动更新。
