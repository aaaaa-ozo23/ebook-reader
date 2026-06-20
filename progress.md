# 进度日志

## 会话：2026-06-20

### 阶段 1/2 修复优化启动
- **状态：** in_progress
- **开始时间：** 2026-06-20
- 执行的操作：
  - 读取 `planning-with-files-zh`、Build Web Apps 前端测试调试、React 性能实践说明。
  - 读取 `task_plan.md`、`findings.md`、`progress.md`，确认阶段 1/2 基线已完成。
  - 检查 `main` 工作区干净且与 `origin/main` 对齐。
  - 将 `codex/v0.1.0-mvp-integration` 快进到当前 `main`。
  - 创建 `codex/stage1-book-actions-remove` 分支。
  - 启动 TXT 阅读器性能审查 subagent，获取 ReaderShell 索引、滚动 idle、TOC 同步和 dark 主题修复清单。

### 阶段 1.x：书架更多操作与移除
- **状态：** complete
- **开始时间：** 2026-06-20
- 执行的操作：
  - 在 `@reader/core` 新增 `RemoveBookResult` 类型。
  - 在 Rust 后端新增 `remove_book` / `remove_book_at`，删除 SQLite 书籍记录并删除应用书库副本，保留原始导入文件。
  - 注册 Tauri `remove_book(book_id)` 命令。
  - 在 `tauri/library.ts` 新增 `removeBook`，浏览器 fallback 同步删除 localStorage 书籍。
  - 书架卡片新增右键菜单和可见 More 按钮；菜单当前只提供 `Remove from shelf`。
  - 新增确认移除弹窗，明确原始导入文件不会被删除。
  - 将 `Import book` 加号改为 CSS 绘制的稳定 icon，修正字体基线偏移。
- 创建/修改的文件：
  - `apps/desktop/src-tauri/src/db.rs`
  - `apps/desktop/src-tauri/src/lib.rs`
  - `apps/desktop/src/App.css`
  - `apps/desktop/src/App.test.tsx`
  - `apps/desktop/src/App.tsx`
  - `apps/desktop/src/tauri/library.ts`
  - `packages/core/src/index.ts`
  - `task_plan.md`
  - `findings.md`
  - `progress.md`
- 验证：
  - `cargo fmt --manifest-path apps\desktop\src-tauri\Cargo.toml` 通过。
  - `cargo test --manifest-path apps\desktop\src-tauri\Cargo.toml` 通过，20 tests。
  - `pnpm.cmd --filter @reader/core build` 通过。
  - `pnpm.cmd --filter @reader/desktop test` 通过，13 tests。
  - `pnpm.cmd --filter @reader/desktop lint` 通过。
  - `pnpm.cmd --filter @reader/desktop build` 通过。

## 会话：2026-06-19

### 产品大阶段 2：TXT 阅读器优先打磨启动
- **状态：** in_progress
- **开始时间：** 2026-06-19
- 执行的操作：
  - 读取 `planning-with-files-zh` 技能说明、React 性能实践摘要、`task_plan.md`、`findings.md`、`progress.md`。
  - 检查 `main` 工作区干净且与 `origin/main` 对齐。
  - 将 `codex/v0.1.0-mvp-integration` 快进到当前 `main`。
  - 创建 `codex/stage2-txt-decoding` 分支。
  - 新增 Rust 依赖 `encoding_rs`、`chardetng`。
  - 在 `@reader/core` 新增 `TxtChapter`、`TxtDocument`、`ReaderProgress` 纯类型。
  - 实现并注册 Tauri 命令 `open_txt_book(book_id)`，仅允许 TXT，读取 `library_path` 后返回解码文本和基础统计。
  - 添加 UTF-8、GBK、GB18030、Big5、非法字节、非 TXT 拒绝的 Rust 测试。
- 创建/修改的文件：
  - `apps/desktop/src-tauri/Cargo.toml`
  - `apps/desktop/src-tauri/Cargo.lock`
  - `apps/desktop/src-tauri/src/db.rs`
  - `apps/desktop/src-tauri/src/lib.rs`
  - `packages/core/src/index.ts`
  - `task_plan.md`
  - `findings.md`
  - `progress.md`

### 阶段 2.1：TXT 解码与元数据
- **状态：** complete
- **开始时间：** 2026-06-19
- 验证：
  - `pnpm.cmd --filter @reader/core build` 通过。
  - `cargo fmt --manifest-path apps\desktop\src-tauri\Cargo.toml` 通过。
  - `cargo test --manifest-path apps\desktop\src-tauri\Cargo.toml` 通过，11 tests。

### 阶段 2.2：章节识别
- **状态：** complete
- **开始时间：** 2026-06-19
- 执行的操作：
  - 创建 `codex/stage2-txt-chapters` 分支。
  - 新增 Rust 依赖 `regex`。
  - 将 `open_txt_book` 的单章全文替换为后端章节识别结果。
  - 支持中文“第 x 章/回/节/卷/部/篇”和英文 `Chapter x` 章节标题。
  - 对章节标题前正文保留 `preface-0`，无章节文件回退为 `full-text`。
  - 修正阶段 2.1 编码测试中与章节识别冲突的旧 `full-text` 断言。
- 创建/修改的文件：
  - `apps/desktop/src-tauri/Cargo.toml`
  - `apps/desktop/src-tauri/Cargo.lock`
  - `apps/desktop/src-tauri/src/db.rs`
  - `task_plan.md`
  - `findings.md`
  - `progress.md`
- 验证：
  - `cargo fmt --manifest-path apps\desktop\src-tauri\Cargo.toml` 通过。
  - `cargo test --manifest-path apps\desktop\src-tauri\Cargo.toml` 通过，14 tests。

### 阶段 2.3：阅读页布局
- **状态：** complete
- **开始时间：** 2026-06-19
- 执行的操作：
  - 创建 `codex/stage2-reader-shell` 分支。
  - 新增 `apps/desktop/src/tauri/reader.ts`，封装 `openTxtBook` Tauri 命令和显式测试 fixture fallback。
  - 新增 `ReaderShell`，包含返回书架、目录侧栏、顶部栏、专注模式和居中 TXT 正文视口。
  - 修改书架 `Continue`：TXT 进入阅读页，EPUB/PDF 显示后续阶段提示。
  - 扩展 Vitest 覆盖 TXT 打开、返回书架、非 TXT fallback 和 TXT 打开错误。
- 创建/修改的文件：
  - `apps/desktop/src/App.tsx`
  - `apps/desktop/src/App.css`
  - `apps/desktop/src/App.test.tsx`
  - `apps/desktop/src/components/ReaderShell.tsx`
  - `apps/desktop/src/tauri/reader.ts`
  - `task_plan.md`
  - `findings.md`
  - `progress.md`
- 验证：
  - `pnpm.cmd --filter @reader/desktop lint` 通过。
  - `pnpm.cmd --filter @reader/desktop test` 通过，9 tests。
  - `pnpm.cmd --filter @reader/desktop build` 通过。

### 阶段 2.4：主题设置
- **状态：** complete
- **开始时间：** 2026-06-19
- 执行的操作：
  - 创建 `codex/stage2-reader-theme` 分支。
  - 在 Rust 后端新增 `ReaderTheme` 类型、`get_reader_theme` 和 `save_reader_theme` Tauri 命令，复用 `app_settings` 保存主题 JSON。
  - 将 `@reader/core` 的 `defaultReaderTheme` 与 Rust 默认主题对齐，书架继续使用固定系统 sans 字体。
  - 在 `tauri/reader.ts` 新增 `getReaderTheme`、`saveReaderTheme`，浏览器 fallback 使用显式 localStorage 测试状态。
  - 在 `ReaderShell` 添加主题面板，支持 light/sepia/green/dark、字体、字号、行高、段距、页边距即时生效并保存。
  - 扩展 Vitest 覆盖主题切换即时应用和保存。
- 创建/修改的文件：
  - `apps/desktop/src-tauri/src/db.rs`
  - `apps/desktop/src-tauri/src/lib.rs`
  - `apps/desktop/src/App.tsx`
  - `apps/desktop/src/App.css`
  - `apps/desktop/src/App.test.tsx`
  - `apps/desktop/src/components/ReaderShell.tsx`
  - `apps/desktop/src/tauri/reader.ts`
  - `packages/core/src/index.ts`
  - `task_plan.md`
  - `findings.md`
  - `progress.md`
- 验证：
  - `cargo fmt --manifest-path apps\desktop\src-tauri\Cargo.toml` 通过。
  - `cargo test --manifest-path apps\desktop\src-tauri\Cargo.toml` 通过，16 tests。
  - `pnpm.cmd --filter @reader/core build` 通过。
  - `pnpm.cmd --filter @reader/desktop lint` 通过。
  - `pnpm.cmd --filter @reader/desktop test` 通过，10 tests。
  - `pnpm.cmd --filter @reader/desktop build` 通过。

### 阶段 2.5：进度定位
- **状态：** complete
- **开始时间：** 2026-06-19
- 执行的操作：
  - 创建 `codex/stage2-txt-progress` 分支。
  - 在 Rust 后端新增 `TxtLocator`、`ReaderProgress`、`get_reading_progress`、`save_reading_progress`，复用 `reading_progress` 表。
  - 后端校验 progress locator `kind = "txt"`，并确保仅 TXT 书籍可保存 TXT 进度。
  - 在 `tauri/reader.ts` 新增进度读取/保存 wrapper 和浏览器测试 fallback。
  - 阅读页打开时并行加载 TXT 文档、主题和进度；恢复时优先 `chapterId`，否则使用 `charOffset`。
  - 目录跳转和滚动会产生 `TxtLocator`，保存操作做 450ms 节流。
  - 扩展 Vitest 覆盖进度恢复和目录跳转保存。
- 创建/修改的文件：
  - `apps/desktop/src-tauri/src/db.rs`
  - `apps/desktop/src-tauri/src/lib.rs`
  - `apps/desktop/src/App.test.tsx`
  - `apps/desktop/src/components/ReaderShell.tsx`
  - `apps/desktop/src/tauri/reader.ts`
  - `task_plan.md`
  - `findings.md`
  - `progress.md`
- 验证：
  - `cargo fmt --manifest-path apps\desktop\src-tauri\Cargo.toml` 通过。
  - `cargo test --manifest-path apps\desktop\src-tauri\Cargo.toml` 通过，18 tests。
  - `pnpm.cmd --filter @reader/core build` 通过。
  - `pnpm.cmd --filter @reader/desktop lint` 通过。
  - `pnpm.cmd --filter @reader/desktop test` 通过，11 tests。
  - `pnpm.cmd --filter @reader/desktop build` 通过。

### 阶段 2.6：长文本性能
- **状态：** complete
- **开始时间：** 2026-06-19
- 执行的操作：
  - 创建 `codex/stage2-txt-virtualization` 分支。
  - 安装 `@tanstack/react-virtual`。
  - 将阅读正文从章节/段落全量 DOM 改为标题块和段落块虚拟渲染。
  - 目录跳转和进度恢复改为通过 virtualizer 滚动到对应虚拟块。
  - 在无布局测量环境下增加估算虚拟项 fallback，保证 Vitest/jsdom 稳定渲染首屏块。
  - 为浏览器 fallback 书库新增显式 localStorage fixture，使 Playwright 可打开 seeded TXT 阅读页。
  - 扩展 Playwright smoke：打开 240 段长 TXT fixture，验证阅读页、主题切换、返回书架和 DOM 段落数量受控。
- 创建/修改的文件：
  - `apps/desktop/package.json`
  - `pnpm-lock.yaml`
  - `apps/desktop/src/App.css`
  - `apps/desktop/src/components/ReaderShell.tsx`
  - `apps/desktop/src/tauri/library.ts`
  - `apps/desktop/tests/smoke.spec.ts`
  - `task_plan.md`
  - `findings.md`
  - `progress.md`
- 验证：
  - `pnpm.cmd install` 通过。
  - `pnpm.cmd --filter @reader/core build` 通过。
  - `pnpm.cmd --filter @reader/desktop lint` 通过。
  - `pnpm.cmd --filter @reader/desktop test` 通过，11 tests。
  - `pnpm.cmd --filter @reader/desktop build` 通过。
  - `cargo test --manifest-path apps\desktop\src-tauri\Cargo.toml` 通过，18 tests。
  - `pnpm.cmd --filter @reader/desktop test:e2e` 首次发现未约束滚动容器导致 240 段全量渲染；修正 `reader-shell`/`reader-main` 高度后重跑通过，2 tests。

### 阶段 2：最终验收
- **状态：** complete
- **开始时间：** 2026-06-19
- 执行的操作：
  - 在 `codex/v0.1.0-mvp-integration` 上运行阶段 2 全量验收。
  - 运行 `pnpm.cmd install`。
  - 运行 `pnpm.cmd --filter @reader/core build`。
  - 运行 `pnpm.cmd --filter @reader/desktop lint`。
  - 运行 `pnpm.cmd --filter @reader/desktop test`。
  - 运行 `pnpm.cmd --filter @reader/desktop build`。
  - 运行 `cargo test --manifest-path apps\desktop\src-tauri\Cargo.toml`。
  - 运行 `pnpm.cmd --filter @reader/desktop test:e2e`。
  - 使用 Browser 插件检查 `http://127.0.0.1:1420/`：桌面 1280x800 和窄屏约 375x760 书架首屏可见、无旧空壳文案、无 console warning/error、无 Vite error overlay，视图切换可交互。
  - 运行 `pnpm.cmd --filter @reader/desktop tauri:build`，生成 release exe、MSI、NSIS installer。
- 验证：
  - `pnpm.cmd install` 通过。
  - `pnpm.cmd --filter @reader/core build` 通过。
  - `pnpm.cmd --filter @reader/desktop lint` 通过。
  - `pnpm.cmd --filter @reader/desktop test` 通过，11 tests。
  - `pnpm.cmd --filter @reader/desktop build` 通过。
  - `cargo test --manifest-path apps\desktop\src-tauri\Cargo.toml` 通过，18 tests。
  - `pnpm.cmd --filter @reader/desktop test:e2e` 通过，2 Chromium smoke tests。
  - Browser QA 通过。
  - `pnpm.cmd --filter @reader/desktop tauri:build` 通过，生成 `ebook-reader-desktop.exe`、MSI 和 NSIS setup。

### 产品大阶段 1：本地书库与导入链路启动
- **状态：** complete
- **开始时间：** 2026-06-19
- 执行的操作：
  - 读取当前 `task_plan.md`、`findings.md`、`progress.md`，确认阶段 0 已完成，下一步为产品大阶段 1。
  - 检查 `main` 工作区干净且与 `origin/main` 对齐。
  - 将 `codex/v0.1.0-mvp-integration` 快进到当前 `main`。
  - 创建 `codex/stage1-db-schema` 分支准备实施后端 schema/import 基线。
  - 启动后端 worker subagent，负责 Rust/SQLite/Tauri 命令和 core import 类型。
  - 后端 worker 完成迁移 v2、库目录、`list_books`、`import_book`、`mark_book_opened` 和 `ImportBookResult` 类型。
  - 复查并运行后端验证：`cargo fmt --manifest-path apps\desktop\src-tauri\Cargo.toml --check`、`cargo test --manifest-path apps\desktop\src-tauri\Cargo.toml`、`pnpm.cmd --filter @reader/core build`。
  - 将 `codex/stage1-db-schema` 合并回 `codex/v0.1.0-mvp-integration`。
  - 创建 `codex/stage1-bookshelf-ui` 分支。
  - 启动前端 worker subagent，负责 Tauri dialog 接入、typed wrapper、书架 UI、组件测试和 Playwright smoke。
  - 前端 worker 完成 `@tauri-apps/plugin-dialog` / `tauri-plugin-dialog` 接入、`src/tauri/library.ts`、书架首屏 UI 和测试更新。
  - 复查并运行前端/后端验证：`pnpm.cmd install`、`cargo fmt --manifest-path apps\desktop\src-tauri\Cargo.toml --check`、`cargo test --manifest-path apps\desktop\src-tauri\Cargo.toml`、`pnpm.cmd --filter @reader/desktop lint`、`pnpm.cmd --filter @reader/desktop test`、`pnpm.cmd --filter @reader/desktop build`、`pnpm.cmd --filter @reader/desktop test:e2e`。
  - 使用 Browser 插件检查 `http://127.0.0.1:1420/`：书架首屏可见、无旧空壳文案、无 Vite overlay、无 console warning/error，桌面和窄屏截图无明显重叠。
  - 将 `codex/stage1-bookshelf-ui` 合并回 `codex/v0.1.0-mvp-integration`。
  - 在集成分支运行阶段 1 全量验收：`pnpm.cmd install`、`pnpm.cmd --filter @reader/core build`、`pnpm.cmd --filter @reader/desktop lint`、`pnpm.cmd --filter @reader/desktop test`、`pnpm.cmd --filter @reader/desktop build`、`cargo test --manifest-path apps\desktop\src-tauri\Cargo.toml`、`pnpm.cmd --filter @reader/desktop test:e2e`。
  - 运行 `pnpm.cmd --filter @reader/desktop tauri:build`，生成 release exe、MSI、NSIS installer。
- 创建/修改的文件：
  - `apps/desktop/src-tauri/Cargo.toml`
  - `apps/desktop/src-tauri/Cargo.lock`
  - `apps/desktop/src-tauri/capabilities/default.json`
  - `apps/desktop/src-tauri/migrations/0002_unique_books_file_hash.sql`
  - `apps/desktop/src-tauri/src/db.rs`
  - `apps/desktop/src-tauri/src/lib.rs`
  - `apps/desktop/package.json`
  - `apps/desktop/src/App.css`
  - `apps/desktop/src/App.test.tsx`
  - `apps/desktop/src/App.tsx`
  - `apps/desktop/src/tauri/library.ts`
  - `apps/desktop/src/test/setup.ts`
  - `apps/desktop/tests/smoke.spec.ts`
  - `packages/core/src/index.ts`
  - `pnpm-lock.yaml`
  - `task_plan.md`
  - `findings.md`
  - `progress.md`

### 阶段 0.1：工作区初始化
- **状态：** complete
- **开始时间：** 2026-06-19
- 执行的操作：
  - 从 `main` 创建 `codex/v0.1.0-mvp-integration`。
  - 从集成分支创建 `codex/stage0-workspace`。
  - 创建根 workspace 配置、TypeScript 基础配置、`@reader/core` 最小包、`docs/`、`fixtures/`。
  - 使用 `pnpm.cmd add -Dw typescript` 安装 workspace 级 TypeScript。
  - 运行 `pnpm.cmd install`。
  - 运行 `pnpm.cmd --filter @reader/core build`。
- 创建/修改的文件：
  - `.editorconfig`
  - `.gitignore`
  - `package.json`
  - `pnpm-lock.yaml`
  - `pnpm-workspace.yaml`
  - `tsconfig.base.json`
  - `docs/.gitkeep`
  - `fixtures/.gitkeep`
  - `packages/core/package.json`
  - `packages/core/tsconfig.json`
  - `packages/core/src/index.ts`
  - `task_plan.md`
  - `findings.md`
  - `progress.md`

### 阶段 0.2：Tauri 桌面空壳
- **状态：** complete
- **开始时间：** 2026-06-19
- 执行的操作：
  - 从集成分支创建 `codex/stage0-tauri-shell`。
  - 使用 `pnpm.cmd create tauri-app apps/desktop --template react-ts --manager pnpm --identifier com.ebookreader.desktop --tauri-version 2 --yes` 生成桌面端。
  - 整理包名为 `@reader/desktop`，补充 `tauri:dev`、`tauri:build` 脚本。
  - 将 Tauri product name、window title 调整为 `Ebook Reader`，窗口默认 `1200x800`、最小 `900x640`。
  - 移除模板 greet 表单和 Vite/Tauri/React logo 示例，保留临时空壳页面。
  - 使用 `pnpm.cmd approve-builds esbuild` 处理 pnpm 11 build-script 审批。
  - 运行 `pnpm.cmd install`。
  - 运行 `pnpm.cmd --filter @reader/desktop build`。
  - 运行 `cargo test --manifest-path apps\desktop\src-tauri\Cargo.toml`。
- 创建/修改的文件：
  - `apps/desktop`
  - `pnpm-lock.yaml`
  - `pnpm-workspace.yaml`
  - `task_plan.md`
  - `findings.md`
  - `progress.md`

### 阶段 0.3：共享模型基线
- **状态：** complete
- **开始时间：** 2026-06-19
- 执行的操作：
  - 从集成分支创建 `codex/stage0-core-models`。
  - 在 `@reader/core` 定义书籍、目录、主题、定位、标注、搜索结果和 reader adapter 类型。
  - 添加 `defaultReaderTheme`。
  - 在 `@reader/desktop` 中通过 workspace dependency 引用 `@reader/core`。
  - 运行 `pnpm.cmd install`。
  - 串行运行 `pnpm.cmd --filter @reader/core build` 和 `pnpm.cmd --filter @reader/desktop build`。
  - 运行 `pnpm.cmd build` 验证 workspace 拓扑构建顺序。
- 创建/修改的文件：
  - `packages/core/src/index.ts`
  - `apps/desktop/package.json`
  - `apps/desktop/src/App.tsx`
  - `task_plan.md`
  - `findings.md`
  - `progress.md`

### 阶段 0.4：Rust 与 SQLite 基线
- **状态：** complete
- **开始时间：** 2026-06-19
- 执行的操作：
  - 从集成分支创建 `codex/stage0-rust-sqlite`。
  - 添加 Rust 依赖：`rusqlite` bundled、`anyhow`、`thiserror`、`tempfile` dev-dependency。
  - 新增 `0001_initial.sql` migration，创建 `schema_migrations`、`books`、`reading_progress`、`bookmarks`、`annotations`、`app_settings`。
  - 新增数据库初始化模块，在 Tauri app data dir 创建 `ebook-reader.sqlite3`。
  - 新增 `app_health` Tauri 命令，返回数据库路径和 schema version。
  - 新增 migration 建表和幂等执行单测。
  - 运行 `cargo fmt --manifest-path apps\desktop\src-tauri\Cargo.toml`。
  - 运行 `cargo test --manifest-path apps\desktop\src-tauri\Cargo.toml`。
- 创建/修改的文件：
  - `apps/desktop/src-tauri/Cargo.toml`
  - `apps/desktop/src-tauri/Cargo.lock`
  - `apps/desktop/src-tauri/migrations/0001_initial.sql`
  - `apps/desktop/src-tauri/src/db.rs`
  - `apps/desktop/src-tauri/src/lib.rs`
  - `task_plan.md`
  - `findings.md`
  - `progress.md`

### 阶段 0.5：质量门禁
- **状态：** complete
- **开始时间：** 2026-06-19
- 执行的操作：
  - 从集成分支创建 `codex/stage0-quality-gates`。
  - 安装 root lint/format 依赖：ESLint、TypeScript ESLint、Prettier、React hooks/refresh 插件。
  - 安装 desktop 测试依赖：Vitest、Testing Library、jsdom、Playwright Test、Node types。
  - 新增 ESLint flat config、Prettier 配置和 ignore。
  - 新增 Vitest config、Testing Library setup、`App.test.tsx`。
  - 新增 Playwright config 和 `tests/smoke.spec.ts`。
  - 新增 root `lint`、`format`、`test`、`check` 脚本和 desktop `lint`、`test`、`test:e2e` 脚本。
  - 运行 `pnpm.cmd run format:write` 后复查 `pnpm.cmd run format`。
  - 运行 `pnpm.cmd --filter @reader/desktop lint`。
  - 运行 `pnpm.cmd --filter @reader/desktop test`。
  - 运行 `pnpm.cmd --filter @reader/desktop build`。
- 创建/修改的文件：
  - `eslint.config.js`
  - `.prettierrc.json`
  - `.prettierignore`
  - `package.json`
  - `pnpm-lock.yaml`
  - `pnpm-workspace.yaml`
  - `apps/desktop/package.json`
  - `apps/desktop/vitest.config.ts`
  - `apps/desktop/playwright.config.ts`
  - `apps/desktop/src/App.test.tsx`
  - `apps/desktop/src/test/setup.ts`
  - `apps/desktop/tests/smoke.spec.ts`
  - `task_plan.md`
  - `findings.md`
  - `progress.md`

### 阶段 0：最终验收
- **状态：** complete
- **开始时间：** 2026-06-19
- 执行的操作：
  - 在 `codex/v0.1.0-mvp-integration` 上运行阶段 0 全量验收。
  - 运行 `pnpm.cmd install`。
  - 运行 `pnpm.cmd --filter @reader/core build`。
  - 运行 `pnpm.cmd --filter @reader/desktop lint`。
  - 运行 `pnpm.cmd --filter @reader/desktop test`。
  - 运行 `pnpm.cmd --filter @reader/desktop build`。
  - 运行 `cargo test --manifest-path apps\desktop\src-tauri\Cargo.toml`。
  - 运行 `pnpm.cmd --filter @reader/desktop tauri:build`，生成 release exe、MSI、NSIS installer。
  - 首次运行 `pnpm.cmd --filter @reader/desktop test:e2e` 时修正 Playwright webServer 参数，并安装 Playwright Chromium 缓存。
  - 重跑 `pnpm.cmd --filter @reader/desktop test:e2e` 通过。
  - 将 `codex/v0.1.0-mvp-integration` 合并回 `main`。
  - 推送 `main` 到 `origin/main`。
- 创建/修改的文件：
  - `.gitignore`
  - `.prettierignore`
  - `apps/desktop/playwright.config.ts`
  - `task_plan.md`
  - `findings.md`
  - `progress.md`

### 阶段 1：读取文档与建立规划
- **状态：** complete
- **开始时间：** 2026-06-19
- 执行的操作：
  - 读取 `planning-with-files-zh` 技能说明和模板。
  - 读取 Build Web Apps 的 React 性能实践摘要，用于约束后续 React/Tauri 前端计划。
  - 读取 `DEVELOPMENT.md` 和 `README.md`。
  - 检查当前仓库文件、分支、远程和近期提交。
  - 创建 `task_plan.md`、`findings.md`、`progress.md`。
- 创建/修改的文件：
  - `task_plan.md`
  - `findings.md`
  - `progress.md`

### 阶段 2：依赖与工具链检查
- **状态：** complete
- 执行的操作：
  - 检查 Git、Node.js、npm、pnpm、Rust、Cargo、rustup、Tauri CLI、SQLite CLI。
  - 确认当前仓库尚未脚手架化，暂不运行 workspace 构建命令。
  - 确认工具链对阶段 0 脚手架开发可用。
- 创建/修改的文件：
  - `findings.md`
  - `progress.md`

### 阶段 3：提交与推送
- **状态：** complete
- 执行的操作：
  - 提交前执行 `git diff --check`，未发现 whitespace 或冲突标记问题。
  - 扫描 `task_plan.md`、`findings.md`、`progress.md` 标题结构，文件完整。
  - 暂存 `DEVELOPMENT.md`、`task_plan.md`、`findings.md`、`progress.md`。
  - 创建提交 `docs: add ebook reader development plan`。
  - 推送到 `origin/main`。
- 创建/修改的文件：
  - `DEVELOPMENT.md`
  - `task_plan.md`
  - `findings.md`
  - `progress.md`

## 测试结果

| 测试 | 输入 | 预期结果 | 实际结果 | 状态 |
|------|------|---------|---------|------|
| 仓库文件扫描 | `rg --files` | 识别当前可跟踪项目文件 | `README.md`、`DEVELOPMENT.md` | 通过 |
| Git 状态 | `git status --short --branch` | 当前分支和远程状态可用 | `main...origin/main`，`DEVELOPMENT.md` 未跟踪 | 通过 |
| Git 版本 | `git --version` | Git 可用 | `2.53.0.windows.1` | 通过 |
| Node.js 版本 | `node --version` | Node 可用 | `v26.1.0` | 通过 |
| npm 版本 | `npm.cmd --version` | npm 可用 | `11.13.0` | 通过 |
| pnpm 版本 | `pnpm.cmd --version` | pnpm 可用 | `11.1.2` | 通过 |
| Rust 版本 | `rustc -Vv` | Rust MSVC toolchain 可用 | `rustc 1.95.0`，`host: x86_64-pc-windows-msvc` | 通过 |
| Cargo 版本 | `cargo --version` | Cargo 可用 | `1.95.0` | 通过 |
| rustup toolchain | `rustup show active-toolchain` | 默认 stable MSVC toolchain | `stable-x86_64-pc-windows-msvc` | 通过 |
| Tauri CLI | `cargo tauri --version` | Tauri CLI 可用 | `tauri-cli 2.11.3` | 通过 |
| SQLite CLI | `sqlite3 --version` 或 winget 安装路径 | SQLite CLI 可用 | `3.53.2` | 通过 |
| 项目依赖文件 | 检查 `package.json`、`pnpm-workspace.yaml`、`apps/desktop/package.json`、`apps/desktop/src-tauri/Cargo.toml` | 识别当前是否可运行项目级命令 | 均不存在，符合尚未脚手架化状态 | 通过 |
| 提交前 whitespace 检查 | `git diff --check` | 无 whitespace 错误或冲突标记 | 无输出 | 通过 |
| 规划文件结构检查 | `Select-String '^#|^## '` | 三个规划文件标题结构完整 | 标题结构完整 | 通过 |
| 暂存区 whitespace 检查 | `git diff --cached --check` | 无 whitespace 错误或冲突标记 | 首次发现 `DEVELOPMENT.md` 两处尾随空格，修复后复查无输出 | 通过 |
| 阶段 0.1 install | `pnpm.cmd install` | workspace 安装成功 | lockfile up to date，安装成功 | 通过 |
| 阶段 0.1 core build | `pnpm.cmd --filter @reader/core build` | core 包 TypeScript 构建成功 | `tsc -p tsconfig.json` 成功 | 通过 |
| 阶段 0.2 install | `pnpm.cmd install` | workspace 安装成功 | 首次被 pnpm build-script 审批拦截；批准 `esbuild` 后安装成功 | 通过 |
| 阶段 0.2 desktop build | `pnpm.cmd --filter @reader/desktop build` | 桌面前端构建成功 | Vite production build 成功 | 通过 |
| 阶段 0.2 Rust compile | `cargo test --manifest-path apps\desktop\src-tauri\Cargo.toml` | Tauri Rust 空壳可编译 | 0 tests，编译通过 | 通过 |
| 阶段 0.3 core build | `pnpm.cmd --filter @reader/core build` | core 类型构建成功 | `tsc -p tsconfig.json` 成功 | 通过 |
| 阶段 0.3 desktop build | `pnpm.cmd --filter @reader/desktop build` | desktop 可引用 core 构建产物 | 串行构建成功 | 通过 |
| 阶段 0.3 root build | `pnpm.cmd build` | workspace 拓扑顺序构建成功 | core 先构建，desktop 后构建 | 通过 |
| 阶段 0.4 Rust fmt | `cargo fmt --manifest-path apps\desktop\src-tauri\Cargo.toml` | Rust 代码格式化成功 | 无错误 | 通过 |
| 阶段 0.4 Rust test | `cargo test --manifest-path apps\desktop\src-tauri\Cargo.toml` | migration 和 Tauri Rust 代码通过测试 | 2 passed，0 failed | 通过 |
| 阶段 0.5 format | `pnpm.cmd run format` | 代码和配置格式通过 | 更新 ignore 并格式化后通过 | 通过 |
| 阶段 0.5 desktop lint | `pnpm.cmd --filter @reader/desktop lint` | ESLint 通过 | 无错误 | 通过 |
| 阶段 0.5 desktop test | `pnpm.cmd --filter @reader/desktop test` | Vitest 通过 | 1 passed，0 failed | 通过 |
| 阶段 0.5 desktop build | `pnpm.cmd --filter @reader/desktop build` | desktop 构建通过 | Vite production build 成功 | 通过 |
| 阶段 0 最终 install | `pnpm.cmd install` | workspace 安装状态稳定 | Already up to date | 通过 |
| 阶段 0 最终 core build | `pnpm.cmd --filter @reader/core build` | core 构建通过 | `tsc -p tsconfig.json` 成功 | 通过 |
| 阶段 0 最终 desktop lint | `pnpm.cmd --filter @reader/desktop lint` | ESLint 通过 | 无错误 | 通过 |
| 阶段 0 最终 desktop test | `pnpm.cmd --filter @reader/desktop test` | Vitest 通过 | 1 passed，0 failed | 通过 |
| 阶段 0 最终 desktop build | `pnpm.cmd --filter @reader/desktop build` | Vite production build 通过 | 构建成功 | 通过 |
| 阶段 0 最终 Rust test | `cargo test --manifest-path apps\desktop\src-tauri\Cargo.toml` | Rust 测试通过 | 2 passed，0 failed | 通过 |
| 阶段 0 最终 Tauri build | `pnpm.cmd --filter @reader/desktop tauri:build` | release build 和 Windows bundle 通过 | 生成 release exe、MSI、NSIS installer | 通过 |
| 阶段 0 Playwright smoke | `pnpm.cmd --filter @reader/desktop test:e2e` | 浏览器 smoke 通过 | 1 passed，0 failed | 通过 |
| 阶段 0 push | `git push origin main` | 远程 main 更新成功 | `44afcc3..59ff259  main -> main` | 通过 |
| 阶段 1 install | `pnpm.cmd install` | workspace 安装状态稳定 | Already up to date | 通过 |
| 阶段 1 core build | `pnpm.cmd --filter @reader/core build` | core 类型构建成功 | `tsc -p tsconfig.json` 成功 | 通过 |
| 阶段 1 desktop lint | `pnpm.cmd --filter @reader/desktop lint` | ESLint 通过 | 无错误 | 通过 |
| 阶段 1 desktop test | `pnpm.cmd --filter @reader/desktop test` | 书架和导入交互组件测试通过 | 6 passed，0 failed | 通过 |
| 阶段 1 desktop build | `pnpm.cmd --filter @reader/desktop build` | Vite production build 通过 | 构建成功 | 通过 |
| 阶段 1 Rust test | `cargo test --manifest-path apps\desktop\src-tauri\Cargo.toml` | 迁移、导入、去重、恢复、最近打开测试通过 | 8 passed，0 failed | 通过 |
| 阶段 1 Playwright smoke | `pnpm.cmd --filter @reader/desktop test:e2e` | 书架首屏 smoke 通过 | 1 passed，0 failed | 通过 |
| 阶段 1 Browser QA | Browser 插件访问 `http://127.0.0.1:1420/` | 书架首屏非空、无 overlay、无 console warning/error、视图切换可交互 | desktop 与窄屏检查通过 | 通过 |
| 阶段 1 Tauri build | `pnpm.cmd --filter @reader/desktop tauri:build` | release build 和 Windows bundle 通过 | 生成 release exe、MSI、NSIS installer | 通过 |
| 阶段 2.1 core build | `pnpm.cmd --filter @reader/core build` | core 类型构建成功 | `tsc -p tsconfig.json` 成功 | 通过 |
| 阶段 2.1 Rust test | `cargo test --manifest-path apps\desktop\src-tauri\Cargo.toml` | TXT 解码、非法字节、非 TXT 拒绝和既有书库测试通过 | 11 passed，0 failed | 通过 |
| 阶段 2.2 Rust test | `cargo test --manifest-path apps\desktop\src-tauri\Cargo.toml` | 中文/英文章节识别、无章节回退和既有解码导入测试通过 | 14 passed，0 failed | 通过 |
| 阶段 2.3 desktop lint | `pnpm.cmd --filter @reader/desktop lint` | ESLint 通过 | 无错误 | 通过 |
| 阶段 2.3 desktop test | `pnpm.cmd --filter @reader/desktop test` | 书架、导入、阅读壳组件测试通过 | 9 passed，0 failed | 通过 |
| 阶段 2.3 desktop build | `pnpm.cmd --filter @reader/desktop build` | Vite production build 通过 | 构建成功 | 通过 |
| 阶段 2.4 Rust test | `cargo test --manifest-path apps\desktop\src-tauri\Cargo.toml` | 主题默认值、持久化和既有后端测试通过 | 16 passed，0 failed | 通过 |
| 阶段 2.4 core build | `pnpm.cmd --filter @reader/core build` | core 类型构建成功 | `tsc -p tsconfig.json` 成功 | 通过 |
| 阶段 2.4 desktop lint | `pnpm.cmd --filter @reader/desktop lint` | ESLint 通过 | 无错误 | 通过 |
| 阶段 2.4 desktop test | `pnpm.cmd --filter @reader/desktop test` | 主题面板和既有前端测试通过 | 10 passed，0 failed | 通过 |
| 阶段 2.4 desktop build | `pnpm.cmd --filter @reader/desktop build` | Vite production build 通过 | 构建成功 | 通过 |
| 阶段 2.5 Rust test | `cargo test --manifest-path apps\desktop\src-tauri\Cargo.toml` | 进度保存/恢复、非 TXT 拒绝和既有后端测试通过 | 18 passed，0 failed | 通过 |
| 阶段 2.5 core build | `pnpm.cmd --filter @reader/core build` | core 类型构建成功 | `tsc -p tsconfig.json` 成功 | 通过 |
| 阶段 2.5 desktop lint | `pnpm.cmd --filter @reader/desktop lint` | ESLint 通过 | 无错误 | 通过 |
| 阶段 2.5 desktop test | `pnpm.cmd --filter @reader/desktop test` | 进度恢复、目录跳转保存和既有前端测试通过 | 11 passed，0 failed | 通过 |
| 阶段 2.5 desktop build | `pnpm.cmd --filter @reader/desktop build` | Vite production build 通过 | 构建成功 | 通过 |
| 阶段 2.6 install | `pnpm.cmd install` | 新增 `@tanstack/react-virtual` 后 lockfile 稳定 | Already up to date | 通过 |
| 阶段 2.6 core build | `pnpm.cmd --filter @reader/core build` | core 类型构建成功 | `tsc -p tsconfig.json` 成功 | 通过 |
| 阶段 2.6 desktop lint | `pnpm.cmd --filter @reader/desktop lint` | ESLint 通过 | 无错误 | 通过 |
| 阶段 2.6 desktop test | `pnpm.cmd --filter @reader/desktop test` | 虚拟化阅读页和既有前端测试通过 | 11 passed，0 failed | 通过 |
| 阶段 2.6 desktop build | `pnpm.cmd --filter @reader/desktop build` | Vite production build 通过 | 构建成功 | 通过 |
| 阶段 2.6 Rust test | `cargo test --manifest-path apps\desktop\src-tauri\Cargo.toml` | 后端测试无回归 | 18 passed，0 failed | 通过 |
| 阶段 2.6 Playwright smoke | `pnpm.cmd --filter @reader/desktop test:e2e` | 空书架和 seeded 长 TXT 阅读页 smoke 通过 | 2 passed，0 failed | 通过 |
| 阶段 2 final install | `pnpm.cmd install` | workspace 安装状态稳定 | Already up to date | 通过 |
| 阶段 2 final core build | `pnpm.cmd --filter @reader/core build` | core 类型构建成功 | `tsc -p tsconfig.json` 成功 | 通过 |
| 阶段 2 final desktop lint | `pnpm.cmd --filter @reader/desktop lint` | ESLint 通过 | 无错误 | 通过 |
| 阶段 2 final desktop test | `pnpm.cmd --filter @reader/desktop test` | 前端测试通过 | 11 passed，0 failed | 通过 |
| 阶段 2 final desktop build | `pnpm.cmd --filter @reader/desktop build` | Vite production build 通过 | 构建成功 | 通过 |
| 阶段 2 final Rust test | `cargo test --manifest-path apps\desktop\src-tauri\Cargo.toml` | 后端测试通过 | 18 passed，0 failed | 通过 |
| 阶段 2 final Playwright smoke | `pnpm.cmd --filter @reader/desktop test:e2e` | 空书架和 seeded 长 TXT 阅读页 smoke 通过 | 2 passed，0 failed | 通过 |
| 阶段 2 final Browser QA | Browser 插件访问 `http://127.0.0.1:1420/` | 桌面/窄屏书架首屏正常、无 console warning/error、视图切换可交互 | 检查通过 | 通过 |
| 阶段 2 final Tauri build | `pnpm.cmd --filter @reader/desktop tauri:build` | release build 和 Windows bundle 通过 | 生成 release exe、MSI、NSIS installer | 通过 |

## 错误日志

| 时间戳 | 错误 | 尝试次数 | 解决方案 |
|--------|------|---------|---------|
| 2026-06-19 | `DEVELOPMENT.md` 第 3-4 行存在尾随空格 | 1 | 移除 Markdown 硬换行尾随空格，改为普通换行 |
| 2026-06-19 | `pnpm.cmd install` 返回 `ERR_PNPM_IGNORED_BUILDS`，拦截 `esbuild@0.27.7` build script | 1 | 使用 `pnpm.cmd approve-builds esbuild` 最小审批后重跑安装 |
| 2026-06-19 | `tsc -b` 要求 `tsconfig.node.json` 使用 `composite` 且不能 `noEmit`，会导致 Vite 配置副产物问题 | 1 | 改为 build script 分别运行 `tsc -p tsconfig.json`、`tsc -p tsconfig.node.json`、`vite build` |
| 2026-06-19 | 并行运行 core build 与 desktop build 时，desktop 读取旧的 `@reader/core` declaration | 1 | 改为串行验证，并确认 `pnpm.cmd build` 会按拓扑顺序执行 |
| 2026-06-19 | `pnpm.cmd --filter @reader/desktop test` 被 Vitest 扫描到 Playwright `tests/smoke.spec.ts` 导致失败 | 1 | 在 `vitest.config.ts` 中限定 include 为 `src/**/*.test.{ts,tsx}` |
| 2026-06-19 | `pnpm.cmd run format` 首次检查发现 Markdown、lockfile 和脚手架文件格式差异 | 1 | `.prettierignore` 忽略 Markdown 和 lockfile，对代码/配置执行 `format:write` 后复查通过 |
| 2026-06-19 | `pnpm.cmd --filter @reader/desktop test:e2e` 首次等待 webServer 超时 | 1 | 将 Playwright webServer 命令从 `pnpm.cmd dev -- --host 127.0.0.1` 改为 `pnpm.cmd dev --host 127.0.0.1` |
| 2026-06-19 | Playwright Chromium executable missing | 1 | 执行 `pnpm.cmd --filter @reader/desktop exec playwright install chromium` 安装浏览器缓存 |
| 2026-06-19 | `cargo fmt --check` 发现阶段 2.1 Rust 代码一处自动换行差异 | 1 | 运行 `cargo fmt --manifest-path apps\desktop\src-tauri\Cargo.toml` |
| 2026-06-19 | `chardetng` 1.0.0 的 API 需要 `Iso2022JpDetection` 和 `Utf8Detection` 枚举参数 | 1 | 按本地 crate 源码修正 `EncodingDetector::new` 和 `guess` 调用 |
| 2026-06-19 | 阶段 2.1 编码测试断言单章 `full-text`，阶段 2.2 识别章节后失败 | 1 | 改为断言章节文本拼接等于原始文本 |
| 2026-06-19 | 阶段 2.6 Playwright 长文本 smoke 首次发现虚拟列表渲染全部 240 段 | 1 | 约束 `reader-shell` 与 `reader-main` 为 `100vh`，让 `reader-viewport` 作为内部滚动容器 |

## 五问重启检查

| 问题 | 答案 |
|------|------|
| 我在哪里？ | 阶段 2 TXT 阅读器优先打磨已完成并通过全量验收 |
| 我要去哪里？ | 合回并推送 `main`，后续进入阶段 3 EPUB 阅读器 |
| 目标是什么？ | 基于 `DEVELOPMENT.md` 建立可执行、带分支策略的分阶段开发计划 |
| 我学到了什么？ | 见 `findings.md` |
| 我做了什么？ | 见上方记录 |

---
*每个阶段完成后或遇到错误时更新此文件*
