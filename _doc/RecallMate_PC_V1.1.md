# 离线填空背诵工具（Windows PC 版）详细设计说明书

- 文档版本：V1.0
- 目标平台：Windows 10/11 x64
- 产品形态：离线桌面应用，安装后双击运行
- 首版范围：题库导入与管理、逐空填空练习、提示/答案/放弃/跳过、错题本、自动保存、备份恢复
- 后续方向：复用业务逻辑，通过 Capacitor 适配 Android；本文件不要求 Codex 实现 Android

## 1. 项目目标与设计原则

### 1.1 项目目标

开发一个轻量、离线、以键盘输入为核心的填空背诵软件。用户通过导入格式化的 Markdown 或纯文本文件建立题库，在练习页面逐题回忆答案。每道题可包含一个或多个填空，每个填空支持多个合法答案。

首版优先解决“快速、连续、低干扰地完成考前背诵”，而不是建设复杂的学习管理系统。

### 1.2 设计原则

1. **离线优先**：运行时不需要网络，不依赖远程 API。
2. **双击即用**：安装包内包含前端资源；无需手动启动 Web 服务、终端或本地服务器。
3. **交互优先**：输入焦点、回车判题、中文输入法、按住显示答案等行为必须可靠。
4. **数据可恢复**：题库、练习记录和当前进度自动保存，并提供 JSON 导入导出。
5. **简单可维护**：不使用数据库、不引入复杂状态管理和后端服务；题库以 JSON 文件保存。
6. **业务逻辑与平台隔离**：判题、提示、错题统计等纯逻辑不依赖 Electron API。
7. **明确状态**：练习过程由显式状态机驱动，避免按钮、输入框和统计逻辑互相矛盾。

### 1.3 非目标

首版不做云同步、账号体系、OCR/PDF/Word 自动识别、AI 判题、复杂间隔重复算法、排行榜、多用户系统和 Android 版本。代码结构为 Android 复用预留接口，但本次只交付 Windows。

## 2. 技术选型与工程架构

### 2.1 推荐技术栈

| 层次     | 技术             | 说明                           |
| -------- | ---------------- | ------------------------------ |
| 语言     | TypeScript       | UI 与业务逻辑统一              |
| UI       | React            | 页面和交互组件                 |
| 构建     | Vite             | 前端开发与生产构建             |
| 桌面容器 | Electron         | Windows 窗口、文件访问桥接     |
| 打包     | electron-builder | NSIS 安装包，可选 portable     |
| 样式     | CSS              | 首版不需要大型 UI 框架         |
| 单测     | Vitest           | 解析器、判题、状态机和统计逻辑 |

Electron 主进程创建窗口并加载打包后的本地 `dist/index.html`。生产版不得启动 Express、Flask 或其他本地 HTTP 服务；用户不需要打开终端。

### 2.2 进程职责

**Electron Main Process**

- 创建和管理主窗口。
- 使用 `app.getPath('userData')` 获取应用数据目录。
- 提供受限的文件读写、导入、导出能力。
- 处理应用退出、窗口关闭等生命周期。
- 不实现题目判题、提示或错题统计。

**Preload**

- 通过 `contextBridge` 暴露最小化 API。
- 不向渲染进程暴露完整 `fs`、`path`、`ipcRenderer`。
- 仅暴露明确方法，例如 `listBanks`、`readBank`、`writeBank`、`chooseImportFile`、`exportBank`、`importTextFile`。

**Renderer（React）**

- 展示页面并接收用户交互。
- 调用纯业务函数更新练习状态。
- 通过 Preload API 请求持久化。
- 不直接访问 Node.js 文件系统。

### 2.3 Electron 安全要求

BrowserWindow 至少设置：

```ts
webPreferences: {
  preload: PRELOAD_PATH,
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true
}
```

要求：

- 只加载应用内本地页面；禁止任意远程导航。
- 不向 Renderer 暴露 Node.js 通用能力。
- IPC 方法校验参数类型、题库 ID 和文件名；不能允许 Renderer 传任意绝对路径读写。
- 外部链接如未来出现，只允许通过系统浏览器打开，并校验协议。
- 不使用不必要的远程模块、外部脚本或网络服务。

### 2.4 初始化与环境

Codex 开始开发前先检查 Node.js、npm、Git 是否可用，记录实际版本。使用 Vite + React + TypeScript，再集成 Electron 与 electron-builder。选择一种兼容、维护良好的集成方式，不要叠加多个重复构建系统。

## 3. 页面与功能设计

首版只有三个主要页面：题库首页、题库详情、背诵练习。

### 3.1 题库首页

每个题库展示：

- 题库名称、题目数量、错题数量。
- 最近练习时间；从未练习显示“尚未练习”。
- 操作：开始练习、继续练习、管理题目、错题本、更多。

页面操作：

- 导入题库（`.txt` / `.md`）。
- 搜索题库。
- 重命名题库。
- 删除题库（必须二次确认，并提示题目与记录会一起删除）。
- 首次使用显示空状态及格式示例。

“继续练习”在存在未完成 Session 时恢复原进度；否则按默认规则开始新练习。

### 3.2 题库详情

使用两个 Tab：**全部题目**、**错题本**。

全部题目列表显示题号、题干预览、填空数和错题标记。支持搜索题干/答案、新增、编辑、删除、从该题开始练习、从全部题目开始练习。

新增/编辑使用简单弹窗：

- 多行文本输入框，使用 `{{答案}}` 标记空位。
- 实时解析预览。
- 格式错误提示。
- 保存、取消。

错题本列表显示题干预览、答错次数、求助次数、最近困难时间、最近困难类型。支持搜索、按困难程度排序、按最近困难时间排序、重练单题、重练全部错题、移出错题本。

“移出错题本”不删除原题、不清除历史统计；以后再次发生错误或求助时可以重新加入。

### 3.3 背诵练习页面

推荐布局：

- 顶部：返回、题库名、练习模式、进度（如 `12 / 80`）。
- 中央：题目文本及内嵌填空输入框。
- 底部：答案、提示、放弃、跳过。
- 可选状态：当前空序号、总空数、是否用过帮助。

窗口默认尺寸约 1100×760，最小尺寸约 760×600。窗口缩小时内容不能被裁切。题干支持多行；长答案不得撑坏布局。

输入框状态：

| 状态          | 视觉表现                           |
| ------------- | ---------------------------------- |
| 待输入/待判定 | 中性底色或下划线                   |
| 当前聚焦      | 明显焦点边框                       |
| 正确          | 绿色边框或文字                     |
| 错误          | 红色边框或文字                     |
| 提示补全      | 能区分系统提示字符                 |
| 放弃补全      | 系统补写部分浅黄色高亮             |
| 按住答案      | 临时显示标准答案，不改变原输入状态 |

颜色不能作为唯一信息表达方式，可配合图标或文字；注意文字和背景对比度。

## 4. 题库文档格式与解析

### 4.1 支持格式与示例

首版支持 UTF-8 编码 `.txt` 和 `.md`，使用相同轻量语法，不解析复杂 Markdown 排版。

```md
# 生物学考前题库

光合作用的能量来源是{{光能}}，主要发生在{{叶绿体}}中。

---

水的化学式为{{H₂O|H2O}}。

---

细胞呼吸包括{{糖酵解}}、{{三羧酸循环}}和{{氧化磷酸化}}。
```

### 4.2 语法规则

| 语法              | 说明                               |
| ----------------- | ---------------------------------- |
| `# 题库名称`      | 可选；仅识别文件开头第一个一级标题 |
| `{{答案}}`        | 一个填空                           |
| `{{答案A|答案B}}` | 多个合法答案，第一项为标准答案     |
| `---`             | 独占一行时分隔题目                 |
| 普通换行          | 同一道题的换行，不自动分题         |
| 空行              | 不分题；题块首尾空白会被去掉       |

答案内部首版不支持 `|`、`{{`、`}}` 转义。题目必须至少包含一个填空；每个空至少有一个非空答案。

### 4.3 解析流程

1. 读取文本，去除 UTF-8 BOM。
2. 统一换行符为 `\n`。
3. 识别文件开头的 `# 标题`，作为题库名并移除该行。
4. 按独占一行的 `---` 切分题块。
5. 扫描每个题块中的 `{{...}}`。
6. 按 `|` 拆分合法答案并去除首尾空白。
7. 生成题目片段列表与答案数组。
8. 校验格式。
9. 返回导入预览，不直接写入正式题库。

### 4.4 导入校验

必须检查并尽可能指出题号和源文件行号：

- 左花括号没有右花括号，或反之。
- 空答案 `{{}}`。
- 多答案中有空项，如 `{{答案|}}`。
- 嵌套花括号。
- 没有填空的题块。
- 没有任何有效题目。

导入预览显示题库名、识别题数、填空总数、错误列表和前 3 道题预览。存在语法错误时禁止直接导入。

### 4.5 编辑题目

题目原文仍使用 `{{答案}}` 语法保存。编辑时实时预览。可提供“插入填空”辅助按钮，不要求富文本编辑器。


## 5. 判题规则

首版采用规范化后的精确匹配：

```ts
function normalizeAnswer(input: string): string {
  return input.trim();
}
```

输入与任一合法答案规范化后完全相同即正确。默认只去除首尾空白；不忽略大小写、内部空格、标点，不做同义词推断，不自动转换全角/半角，也不自动转换阿拉伯数字与中文数字。需要接受的变体由题库作者通过 `|` 显式列出。

输入过程中不自动标红/标绿；按 Enter 提交时判题。点击任意输入框可重新编辑。已判定答案一旦被修改，立即恢复 `unjudged`。每个空的状态为 `unjudged`、`correct`、`incorrect`。提示和放弃属于答案来源标记，不是判题状态。

## 6. 练习交互与状态机

### 6.1 数据类型建议

```ts
type BlankStatus = "unjudged" | "correct" | "incorrect";
type AttemptStatus = "active" | "completed" | "abandoned" | "skipped";
type CharSource = "user" | "hint" | "give_up";

interface BlankState {
  value: string;
  status: BlankStatus;
  charSources: CharSource[];
}

interface AttemptState {
  questionId: string;
  status: AttemptStatus;
  blanks: BlankState[];
  activeBlankIndex: number;
  hadWrongSubmission: boolean;
  usedHint: boolean;
  viewedAnswer: boolean;
  gaveUp: boolean;
  startedAt: string;
  endedAt?: string;
}
```

允许 Codex 根据实现调整结构，但必须保证输入状态、判题状态、求助记录相互独立。

### 6.2 进入题目与 Enter

进入题目时创建 Attempt，所有空初始化为空字符串和 `unjudged`，当前空索引为 0。页面渲染后自动聚焦第一个空。恢复未完成 Session 时，恢复输入内容、判题状态、当前空索引和题目队列。

Enter 处理必须兼容中文输入法：

- 输入法正在组合文字（`KeyboardEvent.isComposing === true`）时，不提交。
- 组合输入结束后，下一次独立 Enter 才提交。
- 防止同一次按键重复触发判题。
- 输入框内 Enter 不应触发表单刷新。

提交逻辑：

1. 判定当前聚焦空。
2. 正确则设为 `correct`；错误则设为 `incorrect` 并设置 `hadWrongSubmission=true`。
3. 从左到右寻找第一个非 `correct` 的空。
4. 若存在，聚焦该空；若不存在，Attempt 设为 `completed`，保留绿色反馈，不自动切题。
5. 完成态再次按 Enter 可进入下一题；按钮仍然可操作。

点击已判定空并修改后，该空恢复 `unjudged`；重新提交后再次寻找第一个未通过空。

### 6.3 答案按钮（按住显示）

- 鼠标/触摸按下：设置 `showingAnswer=true`，所有空临时显示第一项标准答案。
- 鼠标松开、指针离开按钮、触摸结束/取消、窗口失焦：恢复 `showingAnswer=false`。
- 显示答案只改变视觉层，不覆盖实际输入值、判题状态、字符来源和焦点。
- 按住答案时不允许输入；松开后恢复原输入状态。
- 本次 Attempt 记录 `viewedAnswer=true`，同一次 Attempt 只计一次求助。
- 必须覆盖拖出按钮再松开、快速点击、窗口失焦等情况，防止答案一直显示。

### 6.4 提示按钮

从左到右寻找第一个状态不是 `correct` 的空，包括错误、未判定和空白。对该空使用第一项标准答案：

1. 计算当前输入与标准答案的最长公共前缀。
2. 保留公共前缀，删除其后的错误尾部。
3. 在正确前缀后补入标准答案的下一个 Unicode 字符。
4. 将补入字符来源标记为 `hint`，焦点停在该空末尾。
5. 设置 `usedHint=true`。
6. 下次点击继续当前空；当前空补完整后才处理下一个空。

示例：标准答案“实事求是”，空白→“实”→“实事”→“实事求”；若输入“实事求似”，点击后变为“实事求是”。

提示后仍可人工编辑；用户修改字符时来源标记同步调整。按 Unicode code point 处理字符（例如使用 `Array.from`），避免截断代理对字符。若所有空均正确，提示按钮禁用或无操作。

### 6.5 放弃按钮

- 已正确的空保持用户答案。
- 其他空补成第一项标准答案。
- 对系统新补入或替换的部分标记 `give_up`，浅黄色高亮。
- Attempt 设为 `abandoned`，记录 `gaveUp=true` 和结束时间。
- 本题不再允许修改；点击“下一题”进入下一题。
- 本次作答计入求助记录；此前发生过错误时，答错次数也计一次。
- 系统补入的答案不能误标为用户独立答对。

### 6.6 跳过、完成与下一题

- 未发生错误、未使用帮助而跳过：只记跳过，不加入错题本。
- 已答错或使用提示/答案后跳过：保留相关记录，按 Attempt 规则计入错题本。
- 跳过不自动补答案；Attempt 设为 `skipped`，记录结束时间并进入下一题。
- 所有空均正确：Attempt 设为 `completed`，保留绿色反馈，底部“跳过”改为“下一题”。
- 完成态点击下一题或按 Enter 进入队列下一题。
- 队列结束显示总结：练习题数、独立完成数、答错题数、求助题数、跳过题数、本轮错题数。
- 总结页提供“重练本轮错题”和“返回题库”。

### 6.7 快捷键

首版仅要求 Enter：提交当前空；完成态可进入下一题。Space 不绑定显示答案，避免与输入行为冲突。Esc 可选用于退出练习并保存，需明确提示。所有操作必须有可点击按钮。

## 7. 错题本与统计口径

### 7.1 Attempt 定义

一次 Attempt 从进入一道题开始，到完成、放弃或跳过结束。同一次 Attempt 内反复提交错误答案，只记一次答错事件，避免重复按回车放大错次。

### 7.2 加入错题本条件

满足任意一项就加入：

- 至少提交过一次错误答案。
- 使用过提示。
- 按住查看过答案。
- 点击过放弃。

单纯跳过且没有错误/帮助，不加入错题本。

### 7.3 累计统计字段

每道题维护：

- `wrongAttemptCount`：发生过错误提交的 Attempt 数。
- `helpAttemptCount`：使用提示、看答案或放弃的 Attempt 数。
- `independentCorrectCount`：无错误、无帮助且全部空独立答对的次数。
- `attemptCount`：总 Attempt 数。
- `lastAttemptAt`：最近练习时间。
- `lastDifficultyAt`：最近一次错误或求助时间。
- `inWrongBook`：是否在错题本。

一次 Attempt 中多个空错误，答错次数最多增加 1；多次提示或看答案，求助次数最多增加 1。

### 7.4 错题本排序与独立答对

默认排序：`wrongAttemptCount` 降序、`helpAttemptCount` 降序、`lastDifficultyAt` 降序。

“移出错题本”只设置 `inWrongBook=false`，保留历史计数。以后新的困难 Attempt 可重新加入。

只有当一个 Attempt 的所有空均由用户输入并正确判定，且没有错误提交、提示、查看答案或放弃时，才增加 `independentCorrectCount`。曾经输入错误后再改正确，也不属于独立答对。

## 8. 练习队列

首版支持全部题目顺序练习、全部题目随机练习（可选）、错题本练习、单题练习、本轮错题重练。

开始练习时生成固定 `questionIds` 队列并保存在 Session 中。练习中途错题排序变化不能重排当前队列，避免题目跳动或重复。随机模式只在开始时打乱一次。本轮错题重练队列由本轮困难题目 ID 去重生成。


## 9. 数据结构与文件存储

### 9.1 存储目录

Windows 使用 Electron `app.getPath('userData')`，建议结构：

```text
<AppData>/QuestionRecall/
  banks/
    <bank-id>.json
  sessions/
    <bank-id>.json
  backups/
    <bank-id>.json.bak
  app-settings.json
```

实际路径由 Electron 获取，不要硬编码用户目录。

### 9.2 题库 JSON

```ts
interface QuestionBank {
  schemaVersion: number;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  questions: Question[];
  stats: Record<string, QuestionStats>;
}

interface Question {
  id: string;
  sourceText: string; // 含 {{answer}} 的题目原文
  createdAt: string;
  updatedAt: string;
}

interface QuestionStats {
  wrongAttemptCount: number;
  helpAttemptCount: number;
  independentCorrectCount: number;
  attemptCount: number;
  lastAttemptAt?: string;
  lastDifficultyAt?: string;
  inWrongBook: boolean;
}
```

`Question` 保存原始题目文本；解析出的 fragments/answers 在运行时生成，不要求重复持久化。每题使用稳定 UUID。错题本通过 `stats[questionId].inWrongBook` 关联原题，不复制题目。

### 9.3 Session JSON

```ts
interface PracticeSession {
  schemaVersion: number;
  bankId: string;
  sessionId: string;
  mode: "all" | "wrong" | "single" | "round-wrong";
  questionIds: string[];
  currentIndex: number;
  currentAttempt?: AttemptState;
  roundWrongQuestionIds: string[];
  startedAt: string;
  updatedAt: string;
  isFinished: boolean;
}
```

当前 Attempt 保存每个空的输入值、判题状态、字符来源、焦点位置及本次错误/帮助标记。恢复时校验题目 ID 仍存在。

### 9.4 编辑题目与历史记录

- 重命名题库：保留 bank ID 和统计。
- 只修改题干普通文字，且空位数量和答案均不变：可保留统计；清除该题未完成草稿。
- 修改答案、空位数量或顺序：提示用户该题历史统计将重置；确认后重置该题统计和当前 Attempt。
- 删除题目：同时删除该题统计，并从所有 Session 队列清理该 ID。
- 再次导入文本文件：默认创建新题库，不尝试模糊匹配旧题。
- 导入应用 JSON：恢复题库及练习记录；如遇同 ID 冲突，要求选择覆盖或取消，不能静默覆盖。

### 9.5 自动保存与原子写入

保存触发：

- 判题、提示、放弃、跳过、切题后。
- 题库新增/编辑/删除后。
- 输入内容变化后采用 300–500ms debounce，避免每个按键都同步写磁盘。
- 应用退出前尝试保存，但不能只依赖退出事件。

写入策略：

1. 同一文件写入串行化，避免旧状态覆盖新状态。
2. 写入同目录临时文件。
3. 写入成功后替换正式文件。
4. 保留上一份有效文件为 `.bak`。
5. 读取时校验 JSON 和 schemaVersion；主文件损坏时尝试备份。
6. 主文件和备份都损坏时提示用户并保留原文件，不得直接覆盖。

### 9.6 JSON 导入导出

每个题库提供“导出题库及练习记录 JSON”和“从 JSON 恢复”。导出包含 schemaVersion。导入校验版本、必需字段、ID 唯一性和题目引用完整性。未来 schema 升级使用显式迁移函数，不得静默丢字段。

可选提供纯文本 `.md/.txt` 导出（仅题目，不含记录）。

## 10. 代码目录与模块边界

建议目录：

```text
question-recall/
  electron/
    main.ts
    preload.ts
    ipc/
      bankHandlers.ts
      fileHandlers.ts
  src/
    app/
      App.tsx
    pages/
      BankHomePage.tsx
      BankDetailPage.tsx
      PracticePage.tsx
    components/
      BankCard.tsx
      QuestionEditor.tsx
      QuestionRenderer.tsx
      BlankInput.tsx
      PracticeToolbar.tsx
      ImportPreview.tsx
      ConfirmDialog.tsx
    domain/
      types.ts
      parser/
        parseQuestionFile.ts
        validateQuestion.ts
      practice/
        answerMatcher.ts
        practiceReducer.ts
        hintEngine.ts
        attemptScoring.ts
        queueBuilder.ts
      wrongBook/
        wrongBook.ts
    services/
      bankService.ts
      sessionService.ts
      importExportService.ts
    hooks/
      usePracticeSession.ts
      useAutoSave.ts
    styles/
      global.css
  tests/
    parser/
    practice/
    wrongBook/
  package.json
  README.md
```

目录可按脚手架调整，但边界必须保持：

- `domain/` 不依赖 React 和 Electron。
- `services/` 协调业务数据读写，不直接操作 UI。
- Electron IPC 只负责平台文件能力。
- React 组件不直接操作文件系统。
- 核心规则必须有单元测试。

## 11. 关键函数接口建议

```ts
parseQuestionFile(text: string): ImportPreview
validateQuestion(sourceText: string): ValidationResult
normalizeAnswer(input: string): string
checkAnswer(input: string, acceptedAnswers: string[]): boolean
findFirstUnpassedBlank(blanks: BlankState[]): number
applyHint(blank: BlankState, standardAnswer: string): BlankState
applyGiveUp(attempt: AttemptState, question: ParsedQuestion): AttemptState
submitBlank(attempt: AttemptState, blankIndex: number, question: ParsedQuestion): AttemptState
finalizeAttempt(attempt: AttemptState): AttemptSummary
updateQuestionStats(stats: QuestionStats, summary: AttemptSummary): QuestionStats
buildPracticeQueue(questionIds: string[], mode: PracticeMode): string[]
```

推荐用纯函数和 reducer 实现状态转换。UI 不应在多个组件中重复编写判题和统计规则。

## 12. 异常与边界情况

必须覆盖：

1. 导入空文件、全是空行、编码含 BOM。
2. 文档有未闭合花括号、空答案、无填空题。
3. 题目有多个空、多个合法答案、跨行题干、长答案。
4. 用户在任意空之间点击并修改答案。
5. 正确答案修改后再次提交错误。
6. 中文输入法候选选择回车与提交回车的区别。
7. 按住答案时鼠标移出、窗口失焦、触摸事件取消。
8. 连续快速点击提示、放弃、跳过，不能重复结算同一 Attempt。
9. 应用在输入后、判题后、切题后异常退出。
10. 主 JSON 损坏、备份存在或备份也损坏。
11. 题目删除或修改时，Session 引用失效。
12. 空题库、错题本为空、队列只有一道题、队列已结束。
13. 窗口最小化、缩放和 DPI 缩放下布局仍可用。

## 13. 验收标准

### 13.1 功能验收

- [ ] 可导入 UTF-8 `.txt` 和 `.md`，预览题数、空数和格式错误。
- [ ] 支持一道题多个空、一个空多个合法答案、跨行题干。
- [ ] 题库可重命名、删除；题目可新增、编辑、删除。
- [ ] 进入题目自动聚焦第一个空。
- [ ] Enter 即时判题，正确绿色、错误红色，并聚焦下一个未通过空。
- [ ] 点击任意空可修改；修改后状态重置并可重新判题。
- [ ] 答案按钮按住显示，松开/移出/失焦后还原，不覆盖原输入。
- [ ] 提示从第一个未通过空开始，保留正确前缀并补一个字符。
- [ ] 放弃补全全部空，系统补写部分高亮。
- [ ] 跳过不自动补答案，且单纯跳过不进入错题本。
- [ ] 完成、放弃、跳过后能进入下一题；队列结束显示总结。
- [ ] 错题本可查、重练、移出；排序按约定统计。
- [ ] 同一次 Attempt 多次错误只累计一次错次。
- [ ] 自动保存练习进度，关闭重开能继续。
- [ ] JSON 导出后可在另一份安装中恢复题库和进度。

### 13.2 可靠性验收

- [ ] 中文输入法选词回车不会误提交；提交回车只触发一次。
- [ ] 连续快速操作不会对同一 Attempt 重复结算。
- [ ] 文件写入不会因并发保存导致状态回退。
- [ ] 主数据损坏时能尝试从备份恢复。
- [ ] 安装包断网启动可用。
- [ ] 双击应用即可运行，不要求用户启动任何本地服务或终端。

### 13.3 真实题库试测

至少用 20 道真实考试题测试，覆盖：

- 单空、多空。
- 中文、英文、数字、符号。
- 长答案和短答案。
- 多个合法答案。
- 跨行题干。
- 容易输错的专业术语。

验收重点不是视觉效果，而是输入焦点、判题正确性、帮助行为、错题统计和数据恢复。

## 14. 开发阶段与建议顺序

建议 Codex 按以下阶段实施，每阶段运行测试并给出可验收结果：

**阶段 A：工程骨架**

- 初始化 React + TypeScript + Vite + Electron。
- 创建窗口、Preload、受限 IPC。
- 生产构建加载本地资源。
- 验收：Windows 桌面窗口双击可运行，开发模式与生产模式均正常。

**阶段 B：核心领域逻辑**

- 实现文档解析、格式校验、答案匹配、提示算法、Attempt 状态机和错题统计。
- 为纯函数编写单元测试。
- 验收：不依赖 UI 的测试覆盖核心规则。

**阶段 C：练习页面**

- 实现题干内嵌输入框、自动聚焦、Enter 判题、四个按钮。
- 专门处理 IME 组合输入。
- 验收：用人工测试矩阵验证键盘和按钮行为。

**阶段 D：题库管理**

- 导入预览、题库首页、全部题目、编辑/删除、错题本。
- 验收：完整题库 CRUD 和错题本流程。

**阶段 E：持久化与打包**

- JSON 文件存储、自动保存、备份恢复、导入导出。
- electron-builder 生成 Windows 安装包。
- 验收：安装包断网运行，退出重开恢复进度。

不要先花时间做动画、复杂主题、统计图表或通用插件系统。先确保完整背诵闭环可靠。

## 15. Codex 执行要求

1. 先检查仓库状态、开发环境和现有文件；如果目录非空，不得直接覆盖。
2. 先给出简短实施计划和依赖版本，再开始编码；不需要每个小步骤都等待用户确认。
3. 优先完成阶段 A、B、C，尽早形成可实际练习的 PC MVP。
4. 不得用 mock 数据或假按钮冒充已完成能力；暂未实现的功能应明确标注。
5. 核心状态逻辑写成纯函数并测试；UI 不得自行重复计算错题统计。
6. 每个阶段结束运行对应测试、TypeScript 检查和构建。
7. 遇到依赖安装失败时先诊断，不要无目的地反复更换技术栈。
8. 最终必须交付 Windows 安装包；如 portable 构建可行，也一并提供。
9. README 写清安装、运行、构建、数据目录、导入格式、备份恢复方法。
10. 最终报告列出已完成项、未完成项、测试结果、安装包路径和已知问题。

## 16. 本设计中的明确决策与待确认边界

### 已明确决策

- 首版只做 Windows PC，后续再做 Android。
- React + TypeScript + Vite + Electron，使用 electron-builder 打包。
- 生产版加载本地静态资源，不启动本地 Web 服务。
- 题库以 UTF-8 `.txt/.md` 导入，`{{答案}}` 表示空，`|` 分隔合法答案，独占行 `---` 分题。
- 题库及练习记录以 JSON 文件存储，不使用数据库。
- Enter 判题；正确绿、错误红；任意空可点击修改。
- 答案为按住显示、松开还原；提示逐字符补全；放弃补全并高亮；跳过不补答案。
- 同一次 Attempt 中的错次和求助次数分别最多计一次。
- 错题本移出不删除原题及历史统计。

### 实现时允许的细节选择

- 页面样式、图标、组件库。
- Electron 与 Vite 的具体集成脚手架。
- Session 文件内部字段的具体组织方式。
- 是否在首版加入随机练习和纯文本导出。

### 不允许擅自改变的关键规则

- 不得将“输入过程中”改成每键实时判错；必须以 Enter 作为提交判题时机。
- 不得让 IME 选词回车触发判题。
- 不得让“查看答案”覆盖或丢失原输入。
- 不得让提示直接一次性显示完整答案；每次只推进一个字符。
- 不得把单纯跳过记为错误。
- 不得按一次 Attempt 内的错误提交次数累计错次。
- 不得把提示或放弃补入的答案计为独立答对。
- 不得依赖用户手动启动本地服务。

---

**交付定义：** 一个可安装、离线运行的 Windows 桌面应用。用户导入格式化题库后，可以通过键盘连续完成填空背诵；四个核心按钮行为符合本说明；错题和练习进度可靠保存；可导出 JSON 备份并恢复。