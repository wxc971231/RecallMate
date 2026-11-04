<p align="center">
  <img src="_doc/assets/recallmate-header.svg" alt="RecallMate · 离线练习工具" width="100%" />
</p>

<p align="center">
  <a href="#快速开始"><img src="_doc/assets/badge-windows.svg" alt="Windows 0.2.9 · 文件夹便携版" height="28" /></a>
  <a href="_doc/RecallMate_Android.md"><img src="_doc/assets/badge-android.svg" alt="Android 0.2.1" height="28" /></a>
  <a href="#数据与备份"><img src="_doc/assets/badge-local.svg" alt="离线使用 · 本地存储" height="28" /></a>
</p>

<p align="center">
  支持填空、判断、单选、多选，固定格式导入、离线判题、按题库复习错题。<br />
  Windows 与 Android 共用四题型、解析与知识点；保持离线、本地保存。
</p>

<p align="center">
  <a href="https://github.com/wxc971231/RecallMate/releases">下载安装包</a> ·
  <a href="#快速开始">快速开始</a> ·
  <a href="#题库格式">题库格式</a> ·
  <a href="_doc/使用指南.md">使用指南</a> ·
  <a href="#开发构建">开发构建</a>
</p>

---

## 功能一览

| 功能 | 说明 |
| --- | --- |
| 导入题库 | JSON 四题型内容包、Markdown / TXT 填空题、粘贴文本、JSON 备份恢复；导入前预览并提示格式错误 |
| 填空练习 | 多个合法答案、部分正确字符高亮；严格模式默认按原文顺序，关闭后允许并列换序 |
| 提示与答案 | 按住查看、逐字提示、放弃补全、跳过；保留用户已答对的内容 |
| 客观题练习 | 判断、单选、多选；提交后锁定，分别标出漏选与错选，答后查看解析和知识点 |
| 复习与统计 | 顺序 / 随机 / 单题练习、错题本、本轮错题重练与独立完成统计 |
| 本地保存 | 自动保存题库和进度、恢复上次练习、JSON 内容导出与完整备份 |
| 界面调整 | 界面与练习字号独立调节；Windows 自定义快捷键；Android 键盘弹出时扩大题目区域 |

## 本次更新

本次版本为 **Windows 0.2.9 / Android 0.2.1**，两端均支持四种题型及混合题库内容包。

- **判断、单选、多选**：选择后提交，提交后锁定答案；多选分别显示漏选与错选，使用“不会／看答案”记为求助。
- **解析与知识点**：答后显示逐选项结论、对应选项原文、知识点引文和分析；解析与知识点默认展开，可独立收起。
- **题库管理**：按题型筛选题目及错题，支持内容包新建、追加去重，区分题库内容导出与完整备份。
- **界面与兼容**：练习页采用简洁工具栏，题库详情统一使用“新建练习”菜单；旧版题库迁移保留原 ID、统计及未完成作答规则。

## 快速开始

从 [GitHub Releases](https://github.com/wxc971231/RecallMate/releases) 选择对应平台的安装包，版本以 Release 页面为准；以下为本次构建版本和文件名。

| 平台 | 本次版本 | 使用方式 |
| --- | --- | --- |
| Windows x64 | **0.2.9** | 解压 `RecallMate-0.2.9-Portable.zip`，双击 `RecallMate.exe`；保留整个文件夹 |
| Android 7.0+ | **0.2.1** | 安装 `RecallMate-Android-0.2.1.apk`；相同签名的新版可覆盖升级 |

软件运行时无需 Node.js、服务器或网络连接。自行构建时，安装包由[构建流程](#开发构建)生成，保存在本机 `release/`，不纳入 Git。

1. 打开应用，选择 **体验示例题库** 导入 20 道填空示例题；体验判断、单选、多选可从文件导入[四题型示例](examples/四题型示例.questionbank.json)。
2. 核对导入预览中的题型、题数与知识点；内容包可选择 **新建题库** 或追加到已有题库。
3. 点击 **开始练习**。填空题输入后点击 **确认答案**，修改标红内容直到完成；判断和选择题选好答案后点击 **提交答案**，查看反馈再进入下一题。Windows 默认也可按 Enter。
4. 退出后可继续上次练习，也可在 **新建练习** 菜单中开始顺序或随机练习。

Windows 日常使用时，建议把整个软件文件夹复制到独立位置。`release/` 是发布目录，重新构建会备份其中的旧数据并替换旧版本。

## 题库格式

Windows 与 Android 均支持 **JSON 题库内容包**，可在一个文件中混合填空、判断、单选、多选，并附解析与知识点。原有 Markdown / TXT 填空题仍可导入。

| 文件格式 | 支持内容 | 导入用途 |
| --- | --- | --- |
| `.questionbank.json` 题库内容包 | 四种题型、标准答案、解析、知识点 | 新建题库或追加题目，不含学习记录 |
| `.md` / `.txt` 填空文本 | 使用 `{{答案}}` 标记的填空题 | 新建填空题库，也可粘贴导入 |
| `.json` 完整备份 | 题目、知识点、统计、进度与当前作答 | 恢复原题库或跨端迁移 |

### JSON 题库内容包（推荐）

使用 UTF-8 标准 JSON，推荐以 `.questionbank.json` 命名。下面是可直接保存并导入的判断题示例：

```json
{
  "format": "recallmate.question-bank",
  "version": 1,
  "bank": { "id": "offline-demo", "name": "离线练习示例" },
  "knowledgePoints": [
    { "id": "kp-offline", "content": "本示例支持离线练习。" }
  ],
  "questions": [
    {
      "id": "tf-001",
      "type": "true_false",
      "stem": "本示例必须联网才能练习。",
      "answer": false,
      "knowledgeRefs": ["kp-offline"],
      "explanation": "知识点说明本示例支持离线练习，题干说必须联网，与之相反，因此判断错误。"
    }
  ]
}
```

四种题型在 `questions` 数组中分别填写：

| 题型 | `type` | 答案形式 |
| --- | --- | --- |
| 填空 | `cloze` | 在题干中使用 `{{答案}}`，可用 `|` 分隔备选答案 |
| 判断 | `true_false` | 布尔值 `true` / `false` |
| 单选 | `single_choice` | 一个选项 ID，如 `"B"` |
| 多选 | `multiple_choice` | 至少两个不重复的选项 ID，如 `["A", "C"]` |

单选和多选须提供 `options` 数组，每项包含 `id` 和 `text`，例如 `{"id":"A","text":"选项内容"}`；`answer` 引用选项 ID。判断题不填写 `options`，填空题不另填 `answer` 或 `options`。完整四题型结构见[可导入示例](examples/四题型示例.questionbank.json)和[内容包格式说明](_doc/题库内容包格式.md)。

每题使用唯一、稳定的 `id`。`explanation` 可填写解析，`knowledgeRefs` 引用本文件 `knowledgePoints` 中的知识点 ID；有引用时须在同一个包内提供正文。单个导入文件最大 20 MiB。

追加时，同 ID、同内容的题目跳过；题目或知识点同 ID 但内容不同则整批停止，避免覆盖已有学习记录。修订题目后若保留原 ID，请另建题库导入。追加的新题从下一轮练习开始加入。

题库内容包的格式标识是 `recallmate.question-bank`；完整备份使用 `recallmate.backup`。两者都是 JSON，请根据分享题目或恢复进度的用途选择对应文件。

可在外部工具中按固定格式制题，再导入本地练习。软件检查格式、答案类型与引用完整性；题目事实、标准答案及解析依据需在制题时核对。

### Markdown / TXT 填空题

使用 `{{答案}}` 标记填空，`|` 分隔可接受答案，独占一行的 `---` 分隔题目：

```md
# 生物学复习

光合作用的能量来源是{{光能}}，主要发生在{{叶绿体}}中。

---

水的化学式为{{H₂O|H2O}}。

---

三种颜色是{{红}}、{{绿}} 和 {{蓝}}。
```

Windows 与 Android 默认开启 **填空严格模式**：单个空内和多个并列空均按文档顺序填写，文档明确给出的 `|` 备选答案仍可使用。在 **设置 → 答题规则** 中关闭后，并列内容允许换序，例如 `{{a、b、c 和 d}}` 可填写 `d 和 c、a、b`。其他大小写、标点和全半角严格匹配。此规则同样适用于 JSON 内容包中的填空题，完整规则见[使用指南](_doc/使用指南.md)。

## 操作与快捷键

| 操作 | Windows 默认快捷键 | 行为 |
| --- | --- | --- |
| 查看答案 | 按住 F1 | 临时显示答案，松开还原输入 |
| 提示 | F2 | 保留正确部分，补入一个字符 |
| 放弃 | Shift + F3 | 补全本题，标记系统补写内容 |
| 跳过 | F4 | 直接进入下一题 |
| 确认 / 下一题 | Enter | 判定当前空；本题完成后再按一次切题 |

判断和选择题使用 Enter 提交／下一题，Shift + F3 查看答案并记求助，F4 跳过；F1 和 F2 只用于填空。多选必须与标准答案集合完全一致，顺序不限。

Windows 在 **设置 → 答题快捷键** 中改键、停用或恢复默认，重复组合会提示冲突。输入法选词和弹窗期间暂停响应，长按不会连续触发。

**设置 → 答题规则 → 填空严格模式** 默认开启并自动保存，切换从下一题或新练习起生效。当前题及旧版未完成的题目沿用原判题规则，避免改变已有结果。

Android 使用触摸按钮。键盘弹出时自动收起标题、退出导航、进度条和底部状态栏，题目区域可上下滚动；收起键盘恢复导航。提示和按住答案会保持键盘。

两端均可通过顶部 **字号** 分别调整界面和练习文字大小，设置自动保存。

## 数据与备份

| 平台 | 数据位置 | 导出备份 |
| --- | --- | --- |
| Windows | EXE 同级的 `data/`；可在设置中打开 | 题库“导出备份”，写入 `data/exports/` |
| Android | 应用私有目录 | 题库“导出备份”，在系统窗口选择保存位置 |

| 导出方式 | 包含内容 | 用途 |
| --- | --- | --- |
| 导出题库内容 | 题目、标准答案、解析与知识点，不含学习记录 | 分享题库、新建或追加题目 |
| 导出备份 | 题目、知识点、统计、进度与当前作答 | 跨端迁移和完整恢复 |

Windows 0.2.9 与 Android 0.2.1 可互相恢复 V2 备份、导入混合内容包，也可读取旧版 V1 备份；首次保存前在各自数据目录的 `migrations/` 保留 V1 原件。旧数据的 ID、统计和未完成作答规则保留；迁移归档失败时停止保存，不覆盖原数据。新版备份不能用于旧版应用。

Windows 移动软件前请先关闭并复制整个文件夹；Android 卸载或清除应用数据前，请先导出备份。

旧版本迁移、自动备份和损坏恢复见[使用指南](_doc/使用指南.md#数据备份与迁移)。

## 开发构建

技术栈：**React · TypeScript · Vite · Electron · Capacitor**。Node.js 使用 22+，已验证版本为 24.11.1；依赖版本由 `package-lock.json` 锁定。

```powershell
npm.cmd ci
npm.cmd run typecheck    # 类型检查
npm.cmd test             # 单元测试
npm.cmd run dev          # Windows 开发模式
npm.cmd run dist         # Windows 文件夹便携版 + ZIP
npm.cmd run android:open # 打开已有的 Android Studio 工程
npm.cmd run android:apk  # 构建签名 APK，需先配置安卓环境
```

构建完成后的发布文件：

| 平台 | 安装包 | 校验文件 |
| --- | --- | --- |
| Windows x64 | `release/RecallMate-0.2.9-Portable.zip` | `release/SHA256SUMS.txt` |
| Android | `release/android/RecallMate-Android-0.2.1.apk` | `release/android/SHA256SUMS.txt` |

发布到 GitHub Release 时上传 ZIP、APK 和校验文件；两个平台的校验文件同名，上传前分别命名为 `Windows-SHA256SUMS.txt` 和 `Android-SHA256SUMS.txt`。Windows 用户下载 ZIP 后须完整解压；Android 覆盖升级须沿用原签名密钥。个人题库、学习数据与签名密钥保存在本地，不纳入 Git 或公开发布包。详细验证和发布步骤见下方文档。

| 文档 | 内容 |
| --- | --- |
| [多题型扩展设计](_doc/RecallMate_多题型扩展设计_v2.0.md) | 四题型、知识点、本库错题及数据兼容设计；Windows / Android 均已支持 |
| [使用指南](_doc/使用指南.md) | 判题规则、错题统计、字号、备份与数据迁移 |
| [开发与发布](_doc/开发与发布.md) | Windows 环境、构建命令、便携目录、测试与发布流程 |
| [Android 开发](_doc/RecallMate_Android.md) | SDK / JDK、Android Studio、模拟器、签名与 APK 构建 |
| [PC 产品设计](_doc/RecallMate_PC_V1.1.md) | 原始产品需求与设计说明 |

多题型采用 **外部 ChatGPT 制题 → 固定格式导入 → 本地练习**，应用不规划内置 LLM 或模型账号、API 配置。具体范围见扩展设计文档。

项目暂未实现账号、云同步、OCR 或自动更新，不提供应用内 LLM 制题或 AI 判题。
