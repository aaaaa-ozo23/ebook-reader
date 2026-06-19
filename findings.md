# 发现与决策

## 需求

- 基于 `DEVELOPMENT.md` 制定更具体的分阶段开发计划。
- 计划需要覆盖大阶段、小阶段、每个小阶段的开发分支、工作内容和验收标准。
- 检查当前工作目录下依赖和工具是否正常。
- 若检查无问题，将规划文件和相关文档提交并推送到远程仓库。

## 研究发现

- 当前仓库是初始状态：已有 `README.md`，`DEVELOPMENT.md` 尚未跟踪，尚未创建 `package.json`、`pnpm-workspace.yaml`、`apps/desktop` 或 `packages/*`。
- 远程仓库为 `https://github.com/aaaaa-ozo23/ebook-reader.git`，当前分支是 `main`，与 `origin/main` 对齐。
- `DEVELOPMENT.md` 已确定首版路线：Tauri 2 + React + TypeScript + Vite、Rust 后端、SQLite、本地优先、pnpm workspace。
- `DEVELOPMENT.md` 明确 MVP 顺序：项目骨架、书架与导入、TXT、EPUB、PDF、书签/高亮/想法、Windows 打包。
- 首版不做账号系统、云同步、AI 翻译、在线书城、推荐系统，也不把 MOBI/AZW3 纳入 MVP。
- 当前规划阶段尚无应用源码，因此依赖检查应优先验证全局工具链，而不是运行尚不存在的 workspace 构建命令。
- 2026-06-19 当前工具链检查通过：Git `2.53.0.windows.1`、Node.js `v26.1.0`、npm `11.13.0`、pnpm `11.1.2`、Rust/Cargo `1.95.0`、Tauri CLI `2.11.3`、SQLite CLI `3.53.2` 均可用。
- 阶段 0.1 已建立 pnpm workspace、根 TypeScript 配置、`@reader/core` 最小包、`docs/` 和 `fixtures/`，并生成 `pnpm-lock.yaml`。
- 阶段 0.2 已生成 `@reader/desktop` Tauri 2 + React + TypeScript 空壳，应用显示名为 `Ebook Reader`，identifier 为 `com.ebookreader.desktop`，窗口默认 `1200x800`、最小 `900x640`。
- 阶段 0.3 已在 `@reader/core` 导出 `Book`、`BookFormat`、`TocItem`、`ReaderTheme`、`TxtLocator`、`EpubLocator`、`PdfLocator`、`Locator`、`Annotation`、`ReaderAdapter` 和 `defaultReaderTheme`。
- 阶段 0.4 已添加 SQLite 初始 migration、启动期数据库初始化和 `app_health` Tauri 命令；数据库文件名为 `ebook-reader.sqlite3`，位于 Tauri app data dir。
- 阶段 0.5 已添加 ESLint flat config、Prettier、Vitest + Testing Library、Playwright smoke 目录和 desktop 质量脚本。
- 阶段 0 最终验收通过：pnpm install、core build、desktop lint/test/build、Rust test、Tauri build、Playwright smoke 均成功。
- 阶段 1 后端基线已扩展到 schema version 2，新增 `books.file_hash` 唯一索引，用 SHA-256 作为去重键。
- 阶段 1 书库副本目录约定为 Tauri `app_data_dir()/library/<sha256>.<ext>`，SQLite 数据库仍为 `app_data_dir()/ebook-reader.sqlite3`。
- 阶段 1 后端已提供 `list_books`、`import_book`、`mark_book_opened` Tauri 命令；`import_book` 返回 `imported` 或 `duplicate`。
- 阶段 1 前端已从空壳切换到书架首屏，浏览器非 Tauri 环境下 `listBooks()` 返回空数组，便于 Playwright/Vite smoke 验证。
- 阶段 1 导入交互只使用 Tauri dialog 插件选择文件，未注册 fs 插件；真实文件复制、hash 和入库仍在 Rust 命令中完成。
- 阶段 2 架构决策：TXT 解码、编码检测、章节识别放在 Rust 后端；React 前端只消费已解码的 `TxtDocument`。
- 阶段 2.1 已新增 `encoding_rs` 和 `chardetng`，`open_txt_book` 仅允许 `format = "txt"`，从 `books.library_path` 读取应用书库副本。
- 阶段 2.1 `TxtDocument` 当前返回单章全文、编码名、字节数、字符数和行数；真实章节识别留给 2.2 替换。
- 阶段 2.2 已在 Rust 中实现章节识别，支持“第 1 章 / 第一章 / 第二回 / 第十节 / 第三卷”一类中文标题和 `Chapter 1` / `Chapter II` 英文标题。
- 阶段 2.2 若首个章节标题前存在正文，会保留为 `preface-0`、标题 `卷首`；若没有任何章节标题，仍返回 `full-text` 单章。

## 技术决策

| 决策 | 理由 |
|------|------|
| 使用 `main` 作为稳定主线，规划后续开发使用 `codex/v0.1.0-mvp-integration` 与 `codex/stageN-*` 功能分支 | 当前仓库只有初始提交，先建立稳定文档基线，再按小阶段隔离开发 |
| 将 `task_plan.md` 作为后续执行计划入口 | 用户明确要求规划分阶段开发，且已点名文件规划技能 |
| 将工具链检查结果记录到 `progress.md` | 便于后续恢复上下文，避免重复排查本机环境 |
| 阶段 2 优先 TXT 阅读器 | TXT 对中文网文体验最关键，并能先验证阅读壳、主题和定位模型 |
| EPUB/PDF 使用成熟渲染库，不自研解析器 | 与 `DEVELOPMENT.md` 一致，降低首版复杂度和风险 |
| 前端规划纳入 React 性能约束：重依赖按需加载、避免级联重渲染、长文本虚拟化 | 阅读器会处理大文件和重渲染场景，需要从计划阶段预留性能边界 |
| 阶段 0.1 将 TypeScript 放在 root devDependency | 让 workspace 内共享包和桌面包复用同一编译器版本 |
| 阶段 0.2 的 desktop build 不使用 `tsc -b` | `tsc -b` 会要求 referenced project emit 并生成 Vite 配置副产物；改为分别执行 `tsc -p tsconfig.json`、`tsc -p tsconfig.node.json`、`vite build` |
| desktop 通过 workspace dependency 引用 `@reader/core` | `pnpm.cmd build` 会按依赖拓扑先构建 core，再构建 desktop；单独构建 desktop 前需先构建 core |
| SQLite 初始 migration 增加 `schema_migrations` 表 | 方便后续阶段管理 schema 版本，并能让 `app_health` 返回当前版本 |
| Prettier 忽略 Markdown 和 lockfile | 避免质量门禁重排已有计划文档、开发文档和大型锁文件，降低无关格式 churn |
| 阶段 1 用 SHA-256 内容哈希识别重复书籍，书籍 id 使用 UUID v4 | 内容哈希稳定表达“同一本文件”，UUID 让数据库主键不绑定去重策略 |
| 阶段 1 不引入 Tauri fs 插件 | 文件读写、复制和哈希都在 Rust 命令中完成，前端只需要 dialog 选择路径 |
| 阶段 1 书架 UI 暂不引入路由或阅读器页 | 当前目标是导入、展示和恢复闭环，阅读器页面留给后续 TXT/EPUB/PDF 阶段 |
| 阶段 2 TXT 文件读取不新增前端 fs 权限 | Rust 已有本地文件读取权限和书库副本路径，前端只调用 Tauri 命令 |
| 阶段 2.1 解码失败按用户可理解错误返回 | 二进制或明显不可解码内容返回“supported encodings are UTF-8, GBK, GB18030, and Big5” |
| 阶段 2.2 章节 ID 使用 `chapter-{index}-{startChar}` | 对同一文本稳定，前端可用于目录跳转和 `TxtLocator.chapterId` |

## 遇到的问题

| 问题 | 解决方案 |
|------|---------|
| 当前仓库尚未脚手架化，不能运行项目级 `pnpm --filter` 或 Tauri build | 已检查 Git、Node、npm、pnpm、Rust、Cargo、Tauri CLI、SQLite CLI 等基础工具；阶段 0 创建脚手架后再运行项目级命令 |
| PowerShell 可能优先解析 `.ps1` shim | 工具检查和后续命令统一使用 `npm.cmd`、`pnpm.cmd`、`corepack.cmd` |
| pnpm 11 拦截 `esbuild` postinstall | 使用 `pnpm.cmd approve-builds esbuild` 最小审批，并在 `pnpm-workspace.yaml` 持久化 `allowBuilds` |
| 并行执行 core build 和 desktop build 会导致 desktop 读取旧的 core declaration | 验证改为串行或使用根 `pnpm.cmd build` 的拓扑顺序 |
| Vitest 默认扫描 Playwright `tests/*.spec.ts` | 将 Vitest include 限定为 `src/**/*.test.{ts,tsx}`，Playwright 用独立 `test:e2e` 脚本 |
| Playwright webServer 命令不能使用 `pnpm.cmd dev -- --host` | 在 pnpm script 环境下会把 `--` 作为字面参数传给 Vite；改用 `pnpm.cmd dev --host 127.0.0.1` |
| 本机首次运行 Playwright 需要浏览器缓存 | 已执行 `pnpm.cmd --filter @reader/desktop exec playwright install chromium` 安装 Chromium/FFmpeg/Winldd 到用户缓存 |
| `cargo fmt --check` 首次检查阶段 2.1 代码有自动换行差异 | 已运行 `cargo fmt --manifest-path apps\desktop\src-tauri\Cargo.toml` 格式化 |
| `chardetng` 1.0.0 不接受旧式布尔参数 | 使用 `EncodingDetector::new(Iso2022JpDetection::Deny)` 和 `guess(None, Utf8Detection::Allow)` |
| 阶段 2.2 章节识别使编码测试样本从 `full-text` 变为 `chapter-*` | 已把编码测试改为校验所有章节文本拼接等于原文，章节 ID 由章节测试覆盖 |

## 资源

- `DEVELOPMENT.md`
- `README.md`
- `task_plan.md`
- Build Web Apps React best practices 摘要：关注按需加载、长列表/长文本渲染、减少重渲染、避免重依赖进入首屏包。

## 视觉/浏览器发现

- 阶段 1 Browser QA 使用 `http://127.0.0.1:1420/` 检查书架首屏：桌面和窄屏均显示左侧/顶部导航、导入按钮、空书架状态，无旧空壳文案、无 Vite overlay、无 console warning/error。
- 视图切换交互验证通过：点击 `List` 后 `List` 的 `aria-pressed` 为 `true`，`Grid` 为 `false`。

---
*每执行2次查看/浏览器/搜索操作后更新此文件*
*防止视觉信息丢失*
