# PC 端本地电子书阅读器分阶段开发计划

## 目标
基于 `DEVELOPMENT.md` 的技术路线，按可验证、可合并、可回滚的小阶段推进 Windows-first 桌面 MVP，并为后续跨平台和移动端共享逻辑保留空间。

## 当前阶段
大阶段 13.9 v0.2 发布候选：repository complete。版本、文档、全量自动化门禁和本地 draft RC 产物已完成；原生 updater 安装 smoke、NSIS/MSI 安装矩阵与私钥离线备份仍需在隔离 Windows 验收环境人工关闭，未打 tag、未创建 GitHub Release。

## 分支策略

| 分支 | 用途 | 规则 |
|------|------|------|
| `main` | 稳定主线 | 只合入已验证的阶段成果、规划文档和发布修复 |
| `codex/v0.1.0-mvp-integration` | MVP 集成分支 | 每个小阶段完成后合入此分支，统一跑端到端验证 |
| `codex/v0.2.0-integration` | v0.2 集成分支 | 阶段 9 开始时从最新 `main` 创建；阶段 8 不提前创建 |
| `codex/v0.3.0-integration` | v0.3 集成分支 | v0.2 发布后按需创建，承载阶段 14 |
| `codex/v0.4.0-integration` | v0.4 集成分支 | 阶段 14 完成后按需创建，承载阶段 15 |
| `codex/v0.5.0-integration` | v0.5+ 集成分支 | 跨平台桌面稳定后按需创建，承载阶段 16–17+ |
| `codex/stageN-*` | 小阶段功能分支 | 从最新集成分支拉出，单一目标开发，完成后合回集成分支 |
| `release/v0.1.0` | 首版发布候选 | Windows 打包、安装、升级验证通过后从集成分支切出 |
| `release/v0.2.0` | v0.2 发布候选 | 阶段 13 全量验收通过后从 `codex/v0.2.0-integration` 切出 |

提交节奏：
- 每个小阶段至少包含实现、测试、文档/计划更新三类提交。
- 小阶段不能跨越过多目标；如果出现范围膨胀，继续拆分 `codex/stageN-*` 子分支。
- 涉及阅读器渲染、数据库 schema、Tauri 命令的阶段必须在合入集成分支前跑对应前端、Rust、端到端验证。

## 大阶段 0：项目骨架与工程基线

目标：建立 monorepo、Tauri 桌面端、共享类型包、基础数据库和质量门禁，让后续功能可以按模块增量开发。

| 小阶段 | 分支 | 工作内容 | 验收 |
|--------|------|----------|------|
| 0.1 工作区初始化 | `codex/stage0-workspace` | 创建 `package.json`、`pnpm-workspace.yaml`、`apps/desktop`、`packages/core`、`docs`、`fixtures`；统一包名如 `@reader/desktop`、`@reader/core` | `pnpm.cmd install` 成功；workspace filter 能定位桌面端和 core 包 |
| 0.2 Tauri 桌面空壳 | `codex/stage0-tauri-shell` | 用 Tauri 2 + React + TypeScript + Vite 初始化桌面端；整理脚本 `dev`、`build`、`tauri:dev`、`tauri:build` | `pnpm.cmd --filter @reader/desktop build` 成功；Tauri dev 窗口可启动 |
| 0.3 共享模型基线 | `codex/stage0-core-models` | 在 `packages/core` 定义 `Book`、`TocItem`、`ReaderTheme`、`Locator`、`Annotation`、`ReaderAdapter` 等基础类型 | core 包可被 desktop 引用；类型测试或 `tsc` 通过 |
| 0.4 Rust 与 SQLite 基线 | `codex/stage0-rust-sqlite` | 配置 `src-tauri` Rust 模块、`rusqlite` bundled、迁移目录、数据库打开与初始化逻辑 | `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml` 通过 |
| 0.5 质量门禁 | `codex/stage0-quality-gates` | 配置 ESLint、Prettier、Vitest、基础 Playwright 目录；写入 CI 候选命令文档 | `pnpm.cmd --filter @reader/desktop lint`、`test`、`build` 全部可运行 |

### 阶段 0 执行记录

| 小阶段 | 分支 | 状态 | 验证 |
|--------|------|------|------|
| 0.1 工作区初始化 | `codex/stage0-workspace` | complete | `pnpm.cmd install`；`pnpm.cmd --filter @reader/core build` |
| 0.2 Tauri 桌面空壳 | `codex/stage0-tauri-shell` | complete | `pnpm.cmd install`；`pnpm.cmd --filter @reader/desktop build`；`cargo test --manifest-path apps\desktop\src-tauri\Cargo.toml` |
| 0.3 共享模型基线 | `codex/stage0-core-models` | complete | `pnpm.cmd --filter @reader/core build`；`pnpm.cmd --filter @reader/desktop build`；`pnpm.cmd build` |
| 0.4 Rust 与 SQLite 基线 | `codex/stage0-rust-sqlite` | complete | `cargo fmt --manifest-path apps\desktop\src-tauri\Cargo.toml`；`cargo test --manifest-path apps\desktop\src-tauri\Cargo.toml` |
| 0.5 质量门禁 | `codex/stage0-quality-gates` | complete | `pnpm.cmd run format`；`pnpm.cmd --filter @reader/desktop lint`；`pnpm.cmd --filter @reader/desktop test`；`pnpm.cmd --filter @reader/desktop build` |

## 大阶段 1：本地书库与导入链路

目标：实现本地优先的数据闭环：选择文件、导入、去重、入库、展示、重启恢复。

| 小阶段 | 分支 | 工作内容 | 验收 |
|--------|------|----------|------|
| 1.1 数据 schema 和迁移 | `codex/stage1-db-schema` | 落地 `books`、`reading_progress`、`bookmarks`、`annotations`、`app_settings` schema；建立迁移执行和版本记录 | migration 测试通过；重复执行迁移幂等 |
| 1.2 文件导入命令 | `codex/stage1-import-command` | 实现 Tauri `import_book(path)`，校验扩展名、计算 hash、复制到应用数据目录、写入 `books` | Rust 单测覆盖 hash、重复导入、非法文件 |
| 1.3 书架 UI | `codex/stage1-bookshelf-ui` | 实现打开即书架：左侧窄栏、书籍网格/列表、空状态、最近阅读入口 | 组件测试覆盖空状态和列表渲染；无营销落地页 |
| 1.4 导入交互 | `codex/stage1-import-flow` | 接入 Tauri dialog/fs 插件；支持 EPUB/TXT/PDF 选择、导入反馈、重复文件提示 | Playwright 或 Tauri smoke 验证导入样本文件后书架出现记录 |
| 1.5 持久化恢复 | `codex/stage1-library-persistence` | 应用重启后从 SQLite 加载书库；记录 `last_opened_at` | 重启后书籍仍存在；最近阅读排序稳定 |

### 阶段 1 执行记录

| 小阶段 | 分支 | 状态 | 验证 |
|--------|------|------|------|
| 1.1 数据 schema 和迁移 | `codex/stage1-db-schema` | complete | `cargo fmt --manifest-path apps\desktop\src-tauri\Cargo.toml --check`；`cargo test --manifest-path apps\desktop\src-tauri\Cargo.toml`；`pnpm.cmd --filter @reader/core build` |
| 1.2 文件导入命令 | `codex/stage1-db-schema` | complete | `cargo test --manifest-path apps\desktop\src-tauri\Cargo.toml` 覆盖合法导入、重复导入、非法文件、持久化列表和最近打开排序 |
| 1.3 书架 UI | `codex/stage1-bookshelf-ui` | complete | `pnpm.cmd --filter @reader/desktop lint`；`pnpm.cmd --filter @reader/desktop test`；`pnpm.cmd --filter @reader/desktop build`；Browser QA |
| 1.4 导入交互 | `codex/stage1-bookshelf-ui` | complete | Vitest 覆盖取消、成功、重复、失败反馈；Playwright smoke 验证书架首屏 |
| 1.5 持久化恢复 | `codex/stage1-bookshelf-ui` | complete | `cargo test --manifest-path apps\desktop\src-tauri\Cargo.toml`；前端 mount 调用 `list_books` 并按最近阅读排序 |

### 阶段 1 最终验收记录

| 验收项 | 状态 |
|--------|------|
| `pnpm.cmd install` | passed |
| `pnpm.cmd --filter @reader/core build` | passed |
| `pnpm.cmd --filter @reader/desktop lint` | passed |
| `pnpm.cmd --filter @reader/desktop test` | passed，6 tests |
| `pnpm.cmd --filter @reader/desktop build` | passed |
| `cargo test --manifest-path apps\desktop\src-tauri\Cargo.toml` | passed，8 tests |
| `pnpm.cmd --filter @reader/desktop test:e2e` | passed，1 Chromium smoke |
| Browser QA | passed，桌面和窄屏书架首屏无 overlay、无 console warning/error |
| `pnpm.cmd --filter @reader/desktop tauri:build` | passed，生成 release exe、MSI、NSIS installer |

### 阶段 1/2 修复优化执行记录

| 小阶段 | 分支 | 状态 | 验证 |
|--------|------|------|------|
| 1.x 书架更多操作与移除 | `codex/stage1-book-actions-remove` | complete | `cargo fmt --manifest-path apps\desktop\src-tauri\Cargo.toml`；`cargo test --manifest-path apps\desktop\src-tauri\Cargo.toml`，20 tests；`pnpm.cmd --filter @reader/core build`；`pnpm.cmd --filter @reader/desktop test`，13 tests；`pnpm.cmd --filter @reader/desktop lint`；`pnpm.cmd --filter @reader/desktop build` |
| 2.x TXT 阅读器性能与主题修复 | `codex/stage2-txt-reader-polish` | complete | `pnpm.cmd --filter @reader/core build`；`pnpm.cmd --filter @reader/desktop test`，14 tests；`pnpm.cmd --filter @reader/desktop lint`；`pnpm.cmd --filter @reader/desktop build`；`cargo test --manifest-path apps\desktop\src-tauri\Cargo.toml`，20 tests；`pnpm.cmd --filter @reader/desktop test:e2e`，3 tests；Browser QA metrics；Playwright screenshots |

### 阶段 1/2 修复优化最终验收记录

| 验收项 | 状态 |
|--------|------|
| `pnpm.cmd install` | passed |
| `pnpm.cmd --filter @reader/core build` | passed |
| `pnpm.cmd --filter @reader/desktop lint` | passed |
| `pnpm.cmd --filter @reader/desktop test` | passed，14 tests |
| `pnpm.cmd --filter @reader/desktop build` | passed |
| `cargo test --manifest-path apps\desktop\src-tauri\Cargo.toml` | passed，20 tests |
| `pnpm.cmd --filter @reader/desktop test:e2e` | passed，3 Chromium smoke tests |
| Browser QA | passed，桌面和 375x760 窄屏 DOM/console/style metrics 通过；Browser 截图超时后用 Playwright CLI 生成截图 |
| `pnpm.cmd --filter @reader/desktop tauri:build` | passed，生成 release exe、MSI、NSIS installer |

## 大阶段 2：TXT 阅读器优先打磨

目标：先把中文网文阅读体验做扎实，形成主题、定位、进度保存和阅读页布局基线。

| 小阶段 | 分支 | 工作内容 | 验收 |
|--------|------|----------|------|
| 2.1 TXT 解码与元数据 | `codex/stage2-txt-decoding` | 用 Rust 或前端适配层识别 UTF-8、GBK、GB18030、Big5；抽取标题候选和基础统计 | 编码样本测试通过；乱码样本有错误提示 |
| 2.2 章节识别 | `codex/stage2-txt-chapters` | 支持“第 x 章/回/节”、`Chapter x` 等规则；生成 `TocItem[]` | 多种章节样本单测通过；无章节文件能回退为全文 |
| 2.3 阅读页布局 | `codex/stage2-reader-shell` | 实现 `ReaderShell`、`ReaderViewport`、可隐藏顶部栏/侧边栏；正文居中且行宽受控 | 桌面宽屏和窄窗口下正文不铺满、不重叠 |
| 2.4 主题设置 | `codex/stage2-reader-theme` | 字体、字号、行高、段距、页边距、背景、夜间模式即时生效；设置持久化 | 设置变更即时反映，重启恢复 |
| 2.5 进度定位 | `codex/stage2-txt-progress` | 实现 `TxtLocator`，按 `chapterId` 和 `charOffset` 保存/恢复 | 关闭重开能回到接近原位置；定位不依赖临时页码 |
| 2.6 长文本性能 | `codex/stage2-txt-virtualization` | 对长 TXT 做分段或虚拟化渲染；避免一次性渲染超大 DOM | 大样本打开、滚动、翻页不卡顿；无明显内存暴涨 |

### 阶段 2 执行记录

| 小阶段 | 分支 | 状态 | 验证 |
|--------|------|------|------|
| 2.1 TXT 解码与元数据 | `codex/stage2-txt-decoding` | complete | `pnpm.cmd --filter @reader/core build`；`cargo fmt --manifest-path apps\desktop\src-tauri\Cargo.toml`；`cargo test --manifest-path apps\desktop\src-tauri\Cargo.toml`，11 tests |
| 2.2 章节识别 | `codex/stage2-txt-chapters` | complete | `cargo fmt --manifest-path apps\desktop\src-tauri\Cargo.toml`；`cargo test --manifest-path apps\desktop\src-tauri\Cargo.toml`，14 tests |
| 2.3 阅读页布局 | `codex/stage2-reader-shell` | complete | `pnpm.cmd --filter @reader/desktop lint`；`pnpm.cmd --filter @reader/desktop test`，9 tests；`pnpm.cmd --filter @reader/desktop build` |
| 2.4 主题设置 | `codex/stage2-reader-theme` | complete | `cargo test --manifest-path apps\desktop\src-tauri\Cargo.toml`，16 tests；`pnpm.cmd --filter @reader/core build`；`pnpm.cmd --filter @reader/desktop lint`；`pnpm.cmd --filter @reader/desktop test`，10 tests；`pnpm.cmd --filter @reader/desktop build` |
| 2.5 进度定位 | `codex/stage2-txt-progress` | complete | `cargo test --manifest-path apps\desktop\src-tauri\Cargo.toml`，18 tests；`pnpm.cmd --filter @reader/core build`；`pnpm.cmd --filter @reader/desktop lint`；`pnpm.cmd --filter @reader/desktop test`，11 tests；`pnpm.cmd --filter @reader/desktop build` |
| 2.6 长文本性能 | `codex/stage2-txt-virtualization` | complete | `pnpm.cmd install`；`pnpm.cmd --filter @reader/core build`；`pnpm.cmd --filter @reader/desktop lint`；`pnpm.cmd --filter @reader/desktop test`，11 tests；`pnpm.cmd --filter @reader/desktop build`；`cargo test --manifest-path apps\desktop\src-tauri\Cargo.toml`，18 tests；`pnpm.cmd --filter @reader/desktop test:e2e`，2 tests |

### 阶段 2 最终验收记录

| 验收项 | 状态 |
|--------|------|
| `pnpm.cmd install` | passed |
| `pnpm.cmd --filter @reader/core build` | passed |
| `pnpm.cmd --filter @reader/desktop lint` | passed |
| `pnpm.cmd --filter @reader/desktop test` | passed，11 tests |
| `pnpm.cmd --filter @reader/desktop build` | passed |
| `cargo test --manifest-path apps\desktop\src-tauri\Cargo.toml` | passed，18 tests |
| `pnpm.cmd --filter @reader/desktop test:e2e` | passed，2 Chromium smoke tests |
| Browser QA | passed，桌面 1280x800 和窄屏约 375x760 书架首屏无旧空壳文案、无 console warning/error、无 Vite error overlay，视图切换可交互 |
| `pnpm.cmd --filter @reader/desktop tauri:build` | passed，生成 release exe、MSI、NSIS installer |

## 大阶段 3：EPUB 阅读器

目标：集成成熟 EPUB 渲染生态，并复用阶段 2 的阅读壳、主题、目录和进度模型。

| 小阶段 | 分支 | 工作内容 | 验收 |
|--------|------|----------|------|
| 3.1 EPUB 适配器 | `codex/stage3-epub-adapter` | 集成 `epubjs`，封装 `EpubReaderAdapter`，实现 open/close/toc/goTo/currentLocator | 可打开公版 EPUB；目录可读取 |
| 3.2 EPUB 阅读 UI | `codex/stage3-epub-reader-ui` | 将 EPUB 渲染接入 `ReaderViewport`，支持章节跳转和布局适配 | 从书架打开 EPUB，目录跳转成功 |
| 3.3 EPUB 主题映射 | `codex/stage3-epub-theme` | 把 `ReaderTheme` 映射到 epub.js 样式；保持 TXT/EPUB 设置体验一致 | 字号、行高、背景、夜间模式对 EPUB 生效 |
| 3.4 EPUB 进度恢复 | `codex/stage3-epub-progress` | 实现 `EpubLocator`，保存 href、CFI、progression | 重启后恢复到章节内位置 |
| 3.5 EPUB 高亮预研 | `codex/stage3-epub-highlight-spike` | 验证 CFI 高亮定位、选中文本和上下文保存策略 | 形成可实现结论并更新 `findings.md` |

### 阶段 3 执行记录

| 小阶段 | 分支 | 状态 | 验证 |
|--------|------|------|------|
| 3.1 EPUB 适配器 | `codex/stage3-epub-adapter` | complete | `pnpm.cmd --filter @reader/core build`；`pnpm.cmd --filter @reader/desktop lint`；`pnpm.cmd --filter @reader/desktop build`；`cargo test --manifest-path apps\desktop\src-tauri\Cargo.toml`，20 tests |
| 3.2 EPUB 阅读 UI | `codex/stage3-epub-reader-ui` | complete | `pnpm.cmd --filter @reader/desktop test`，15 tests；`pnpm.cmd --filter @reader/desktop lint`；`pnpm.cmd --filter @reader/desktop build` |
| 3.3 EPUB 主题映射 | `codex/stage3-epub-theme` | complete | `pnpm.cmd --filter @reader/desktop test`，17 tests；`pnpm.cmd --filter @reader/desktop lint`；`pnpm.cmd --filter @reader/desktop build` |
| 3.4 EPUB 进度恢复 | `codex/stage3-epub-progress` | complete | `cargo fmt --manifest-path apps\desktop\src-tauri\Cargo.toml`；`cargo test --manifest-path apps\desktop\src-tauri\Cargo.toml`，21 tests；`pnpm.cmd --filter @reader/desktop test`，18 tests；`pnpm.cmd --filter @reader/desktop lint`；`pnpm.cmd --filter @reader/desktop build` |
| 3.5 EPUB 高亮预研 | `codex/stage3-epub-highlight-spike` | complete | 结论、限制和阶段 5 建议已写入 `findings.md`；`pnpm.cmd --filter @reader/desktop test`，18 tests |
| 3.x EPUB 导航与进度优化 | `codex/stage3-epub-navigation-optimization` | complete | `pnpm.cmd install`；`pnpm.cmd --filter @reader/core build`；`pnpm.cmd --filter @reader/desktop lint`；`pnpm.cmd --filter @reader/desktop test -- --run`，22 tests；`pnpm.cmd --filter @reader/desktop build`；`cargo test --manifest-path apps\desktop\src-tauri\Cargo.toml`，21 tests；`pnpm.cmd --filter @reader/desktop test:e2e`，4 tests；Playwright 视觉截图；`pnpm.cmd --filter @reader/desktop tauri:build` |
| 3.x EPUB Focus 与最后页修复 | `codex/stage3-epub-focus-last-page-fix` | complete | `pnpm.cmd install`；`pnpm.cmd --filter @reader/core build`；`pnpm.cmd --filter @reader/desktop lint`；`pnpm.cmd --filter @reader/desktop test`，23 tests；`pnpm.cmd --filter @reader/desktop build`；`cargo test --manifest-path apps\desktop\src-tauri\Cargo.toml`，21 tests；`pnpm.cmd --filter @reader/desktop test:e2e`，4 tests；Playwright Focus 视觉截图；`pnpm.cmd --filter @reader/desktop tauri:build` |

### 阶段 3 最终验收记录

| 验收项 | 状态 |
|--------|------|
| `pnpm.cmd install` | passed |
| `pnpm.cmd --filter @reader/core build` | passed |
| `pnpm.cmd --filter @reader/desktop lint` | passed |
| `pnpm.cmd --filter @reader/desktop test` | passed，18 tests |
| `pnpm.cmd --filter @reader/desktop build` | passed |
| `cargo test --manifest-path apps\desktop\src-tauri\Cargo.toml` | passed，21 tests |
| `pnpm.cmd --filter @reader/desktop test:e2e` | passed，4 Chromium smoke tests，含自生成 EPUB fixture |
| Playwright 视觉检查 | passed，桌面和 375x760 窄屏 EPUB 阅读器无 console warning/error、无 Vite overlay、主题面板与 EPUB host 不重叠 |
| `pnpm.cmd --filter @reader/desktop tauri:build` | passed，生成 release exe、MSI、NSIS installer |

## 大阶段 4：PDF 阅读器

目标：以稳定阅读为优先，提供页码、缩放、目录和进度恢复；复杂标注能力可以渐进。

| 小阶段 | 分支 | 工作内容 | 验收 |
|--------|------|----------|------|
| 4.1 PDF.js 接入 | `codex/stage4-pdf-adapter` | 集成 `pdfjs-dist`，处理 worker 配置和本地文件加载 | 可打开公版 PDF；worker 加载无控制台错误 |
| 4.2 页面导航和缩放 | `codex/stage4-pdf-navigation` | 实现页码跳转、上一页/下一页、缩放、适合宽度 | 页码与缩放状态稳定 |
| 4.3 PDF outline | `codex/stage4-pdf-outline` | 解析 PDF outline 到 `TocItem[]`；无 outline 时降级为页码列表 | 有目录样本可跳转；无目录样本可使用 |
| 4.4 PDF 进度恢复 | `codex/stage4-pdf-progress` | 实现 `PdfLocator`，保存 page、scale、可选 rects | 重启恢复页码和缩放 |
| 4.5 PDF 标注策略 | `codex/stage4-pdf-annotation-spike` | 评估文本选择高亮与矩形区域高亮；决定 MVP 范围 | 更新 `findings.md`，避免阻塞首版 |

### 阶段 4 执行记录

| 小阶段 | 分支 | 状态 | 验证 |
|--------|------|------|------|
| 4.1 PDF.js 接入 | `codex/stage4-pdf-adapter` | complete | `pnpm.cmd --filter @reader/core build`；`pnpm.cmd --filter @reader/desktop test -- PdfReaderAdapter.test.ts`，26 tests；`pnpm.cmd --filter @reader/desktop lint`；`pnpm.cmd --filter @reader/desktop build`；确认 `dist/pdfjs/pdf.worker.mjs` 和 `dist/pdfjs/cmaps/*` 生成 |
| 4.2 页面导航和缩放 | `codex/stage4-pdf-navigation` | complete | `pnpm.cmd --filter @reader/desktop lint`；`pnpm.cmd --filter @reader/desktop test -- App.test.tsx PdfReaderAdapter.test.ts`，28 tests；`pnpm.cmd --filter @reader/desktop build` |
| 4.3 PDF outline | `codex/stage4-pdf-outline` | complete | `pnpm.cmd --filter @reader/desktop test -- PdfReaderAdapter.test.ts`，30 tests；`pnpm.cmd --filter @reader/desktop lint`；`pnpm.cmd --filter @reader/desktop build` |
| 4.4 PDF 进度恢复 | `codex/stage4-pdf-progress` | complete | `cargo fmt --manifest-path apps\desktop\src-tauri\Cargo.toml`；`pnpm.cmd --filter @reader/core build`；`pnpm.cmd --filter @reader/desktop build`；`cargo test --manifest-path apps\desktop\src-tauri\Cargo.toml`，22 tests；`pnpm.cmd --filter @reader/desktop lint`；`pnpm.cmd --filter @reader/desktop test -- App.test.tsx PdfReaderAdapter.test.ts`，30 tests |
| 4.5 PDF 标注策略 | `codex/stage4-pdf-annotation-spike` | complete | 更新 `findings.md` 记录文本层、PDF 坐标 rect、高亮重放、跨页选择和扫描版 PDF 风险 |

### 阶段 4 最终验收记录

| 验收项 | 状态 |
|--------|------|
| `pnpm.cmd install` | passed |
| `pnpm.cmd --filter @reader/core build` | passed |
| `pnpm.cmd --filter @reader/desktop lint` | passed |
| `pnpm.cmd --filter @reader/desktop test` | passed，30 tests |
| `pnpm.cmd --filter @reader/desktop build` | passed |
| `cargo test --manifest-path apps\desktop\src-tauri\Cargo.toml` | passed，22 tests |
| `pnpm.cmd --filter @reader/desktop test:e2e` | passed，5 Chromium smoke tests，含自生成 PDF Blob |
| Playwright 视觉检查 | passed，桌面双页和 375x760 窄屏 PDF 阅读器 canvas 非空、无 console warning/error、控件不重叠 |
| `pnpm.cmd --filter @reader/desktop tauri:build` | passed，生成 release exe、MSI、NSIS installer |

### 阶段 3/4 阅读体验统一调整执行记录

| 小阶段 | 分支 | 状态 | 验证 |
|--------|------|------|------|
| 3/4.x EPUB/PDF 控件统一与空间优化 | `codex/stage3-4-reader-ui-unification` | complete | `pnpm.cmd install`；`pnpm.cmd --filter @reader/core build`；`pnpm.cmd --filter @reader/desktop lint`；`pnpm.cmd --filter @reader/desktop test`，31 tests；`pnpm.cmd --filter @reader/desktop build`；`cargo test --manifest-path apps\desktop\src-tauri\Cargo.toml`，22 tests；`pnpm.cmd --filter @reader/desktop test:e2e`，5 tests；Playwright 视觉截图；`pnpm.cmd --filter @reader/desktop tauri:build` |

## 大阶段 5：书签、高亮、想法与检索

目标：统一 EPUB/TXT/PDF 的标注体验，让笔记可以被保存、浏览、跳回原文。

| 小阶段 | 分支 | 工作内容 | 验收 |
|--------|------|----------|------|
| 5.1 书签能力 | `codex/stage5-bookmarks` | 支持添加、删除、列表展示和跳转书签 | 三种格式至少有基础书签跳转 |
| 5.2 选中菜单 | `codex/stage5-selection-menu` | 实现选中文字后的高亮、复制、添加想法菜单；避免遮挡选择区域 | 选择文本后菜单位置稳定 |
| 5.3 高亮保存 | `codex/stage5-highlights` | 保存颜色、selectedText、locator、contextBefore/After | 重启后高亮和列表仍存在 |
| 5.4 想法/笔记 | `codex/stage5-notes` | 支持给高亮添加和编辑笔记；`NotesPanel` 列表按书籍过滤 | 笔记增删改查测试通过 |
| 5.5 搜索基础 | `codex/stage5-search-basic` | TXT/EPUB 支持书内搜索；PDF 搜索视复杂度择机进入 | 搜索结果可跳转，空结果有明确状态 |

### 阶段 5 执行记录

| 小阶段 | 分支 | 状态 | 验证 |
|--------|------|------|------|
| 5.1 书签能力 | `codex/stage5-bookmarks` | complete | `pnpm.cmd --filter @reader/core build`；`cargo test --manifest-path apps\desktop\src-tauri\Cargo.toml`，24 tests；`pnpm.cmd --filter @reader/desktop test -- App.test.tsx`，32 tests；`pnpm.cmd --filter @reader/desktop lint`；`pnpm.cmd --filter @reader/desktop build` |
| 5.2 选中菜单 | `codex/stage5-selection-menu` | complete | `pnpm.cmd --filter @reader/desktop test -- App.test.tsx PdfReaderAdapter.test.ts`，33 tests；`pnpm.cmd --filter @reader/desktop lint`；`pnpm.cmd --filter @reader/desktop build` |
| 5.3 高亮保存 | `codex/stage5-highlights` | complete | `cargo test --manifest-path apps\desktop\src-tauri\Cargo.toml`，27 tests；`pnpm.cmd --filter @reader/core build`；`pnpm.cmd --filter @reader/desktop test -- App.test.tsx PdfReaderAdapter.test.ts`，36 tests；`pnpm.cmd --filter @reader/desktop lint`；`pnpm.cmd --filter @reader/desktop build` |
| 5.4 想法/笔记 | `codex/stage5-notes` | complete | `pnpm.cmd --filter @reader/desktop test -- App.test.tsx PdfReaderAdapter.test.ts`，38 tests；`pnpm.cmd --filter @reader/desktop lint`；`pnpm.cmd --filter @reader/desktop build` |
| 5.5 搜索基础 | `codex/stage5-search-basic` | complete | `pnpm.cmd --filter @reader/desktop test -- App.test.tsx PdfReaderAdapter.test.ts`，41 tests；`pnpm.cmd --filter @reader/desktop lint`；`pnpm.cmd --filter @reader/desktop build` |
| 5.x 标注体验优化与 Bug 修复 | `codex/stage5-annotation-polish` | complete | `pnpm.cmd install`；`pnpm.cmd --filter @reader/core build`；`pnpm.cmd --filter @reader/desktop lint`；`pnpm.cmd --filter @reader/desktop test`，45 tests；`pnpm.cmd --filter @reader/desktop build`；`cargo test --manifest-path apps\desktop\src-tauri\Cargo.toml`，27 tests；`pnpm.cmd --filter @reader/desktop test:e2e`，5 tests；Playwright 视觉截图；`pnpm.cmd --filter @reader/desktop tauri:build` |

### 阶段 5 最终验收记录

| 验收项 | 状态 |
|--------|------|
| `pnpm.cmd install` | passed |
| `pnpm.cmd --filter @reader/core build` | passed |
| `pnpm.cmd --filter @reader/desktop lint` | passed |
| `pnpm.cmd --filter @reader/desktop test` | passed，41 tests |
| `pnpm.cmd --filter @reader/desktop build` | passed |
| `cargo test --manifest-path apps\desktop\src-tauri\Cargo.toml` | passed，27 tests |
| `pnpm.cmd --filter @reader/desktop test:e2e` | passed，5 Chromium smoke tests |
| Playwright 视觉检查 | passed，桌面和 375x760 TXT Notes/Search 阅读器无 console warning/error；截图见 `D:\tl-temp\ebook-reader-stage5-notes-search-desktop.png` 和 `D:\tl-temp\ebook-reader-stage5-notes-search-mobile-375x760.png` |
| `pnpm.cmd --filter @reader/desktop tauri:build` | passed，首次旧 release exe 被 PID 16968 锁定，结束进程后重跑通过并生成 MSI/NSIS |

## 大阶段 6：阅读体验完善与可访问性

目标：将 MVP 从“功能可用”推进到“长时间阅读舒适”，重点处理快捷键、响应式、状态细节和性能。

| 小阶段 | 分支 | 工作内容 | 验收 |
|--------|------|----------|------|
| 6.1 快捷键和输入 | `codex/stage6-keyboard` | 左右翻页、Esc 关闭面板、Ctrl+F 搜索、阅读页焦点管理 | 快捷键不会误触输入框 |
| 6.2 布局响应式 | `codex/stage6-responsive-layout` | 宽屏、窄窗口、高 DPI 下侧栏、正文、面板不重叠 | Playwright 截图检查关键视口 |
| 6.3 性能优化 | `codex/stage6-performance` | 按需加载 PDF/EPUB 重依赖；避免 React 级联重渲染；缓存解析结果 | 初始包体和阅读交互性能符合预期 |
| 6.4 错误和空状态 | `codex/stage6-error-states` | 导入失败、文件丢失、解析失败、数据库失败的用户可理解提示 | 常见失败路径有可恢复操作 |
| 6.5 隐私和数据位置文档 | `codex/stage6-privacy-docs` | 写明本地数据库、书库副本、日志位置；默认不上传数据 | README/docs 可说明数据存放和删除方式 |
| 6.6 书架封面 | `codex/stage6-bookshelf-covers` | EPUB 内嵌封面、PDF 首页缩略图；无封面时使用 ImageGen 默认背景和代码渲染书名 | 新旧书籍均显示稳定封面，失败不阻塞导入或阅读 |

### 阶段 6 执行记录

| 小阶段 | 分支 | 状态 | 验证 |
|--------|------|------|------|
| 6.1 快捷键和输入 | `codex/stage6-keyboard` | complete | `pnpm ... lint`；desktop test 52 tests；desktop build |
| 6.2 布局响应式 | `codex/stage6-responsive-layout` | complete | Rust 28 tests；Vitest 53 tests；Playwright 5 tests；Browser/视觉检查 |
| 6.3 性能优化 | `codex/stage6-performance` | complete | 首屏 JS 68.45 kB gzip；懒加载 CSS；Rust 32 tests；Vitest 62 tests；Playwright 6 tests |
| 6.4 错误和空状态 | `codex/stage6-error-states` | complete | Vitest 65 tests；Playwright 6 tests；axe 主流程无 serious/critical |
| 6.5 隐私和数据位置文档 | `codex/stage6-privacy-docs` | complete | README 链接；桌面/浏览器存储、删除、网络和日志行为已说明 |
| 6.6 书架封面 | `codex/stage6-bookshelf-covers` | complete | Rust 30 tests；Vitest 60 tests；PDF/default-cover Playwright；desktop lint/build |
| 6.x 封面与目录拖拽修复 | `codex/stage6-cover-resizer-fix` | complete | 默认封面完整标题浮层；侧栏边缘拖拽；整数像素持久化；68 Vitest、32 Rust、8 Playwright tests；Browser/视觉检查 |

### 阶段 6 最终验收记录

| 验收项 | 状态 |
|--------|------|
| 用户级 pnpm 11.1.2 `install --frozen-lockfile` | passed |
| `pnpm.cmd run format` | passed |
| `pnpm.cmd --filter @reader/core build` | passed |
| `pnpm.cmd --filter @reader/desktop lint` | passed |
| `pnpm.cmd --filter @reader/desktop test` | passed，65 tests |
| `pnpm.cmd --filter @reader/desktop build` | passed，首屏入口 68.65 kB gzip |
| `cargo fmt --check` | passed |
| `cargo test` | passed，32 tests |
| `pnpm.cmd --filter @reader/desktop test:e2e` | passed，8 tests；1280×800、900×640、640×640、375×760、DPR 2 |
| axe 主流程 | passed，书架及 TXT/EPUB/PDF 阅读壳无 serious/critical |
| 视觉检查 | passed，桌面和 375×760 书架无横向溢出、覆盖或裁切 |
| `pnpm.cmd --filter @reader/desktop tauri:build` | passed，生成 release exe、MSI、NSIS installer |

## 大阶段 7：Windows 打包与首版发布

目标：完成 Windows 安装包、文件关联、升级路径和发布检查。

| 小阶段 | 分支 | 工作内容 | 验收 |
|--------|------|----------|------|
| 7.1 应用元信息 | `codex/stage7-app-metadata` | 配置应用名称、图标、版本号、bundle identifier、窗口默认尺寸 | 构建产物显示正确名称和图标 |
| 7.2 Windows installer | `codex/stage7-windows-installer` | 配置 Tauri Windows 安装包；验证安装、卸载、重装 | `pnpm.cmd --filter @reader/desktop tauri:build` 成功 |
| 7.3 文件关联 | `codex/stage7-file-associations` | 配置 `.epub`、`.txt`、`.pdf` 文件关联和打开参数 | 双击关联文件能进入导入或打开流程 |
| 7.4 升级验证 | `codex/stage7-upgrade-check` | 验证旧版本数据库和书库在新版本中可继续使用 | 模拟升级后数据不丢失 |
| 7.5 发布清单 | `codex/stage7-release-checklist` | 创建发布 checklist、许可证核查、第三方依赖说明 | `release/v0.1.0` 可作为候选发布分支 |

### 阶段 7 执行记录

| 小阶段 | 分支 | 状态 | 验证 |
|--------|------|------|------|
| 7.1 应用元信息 | `codex/stage7-app-metadata` | complete | 0.1.0 四处版本一致；正式图标透明源图和 Windows 32/128px 检查通过；desktop build 通过 |
| 7.2 Windows installer | `codex/stage7-windows-installer` | complete | EXE、NSIS、MSI 0.1.0 干净构建；两种安装包安装/启动空库/卸载通过 |
| 7.3 文件关联 | `codex/stage7-file-associations` | complete | EPUB 冷启动、TXT/PDF 运行中打开、重复文件单实例与注册表命令验证通过 |
| 7.4 升级验证 | `codex/stage7-upgrade-check` | complete | NSIS/MSI 0.0.0 → 0.1.0 覆盖升级通过；书籍、书库副本、进度、书签、标注、主题和布局完整保留，schema 为 3 |
| 7.5 发布清单 | `codex/stage7-release-checklist` | complete | MIT/第三方审计、全量 QA、最终构建、SHA-256、分支/标签推送及 GitHub Latest Release 已完成 |

## 大阶段 8：v0.2 预留方向

目标：在不修改功能代码的前提下锁定 v0.2 架构、范围、默认值、依赖门槛、实施顺序和验收标准，避免 v0.1 架构封死。

| 小阶段 | 分支 | 工作内容 | 验收 |
|--------|------|----------|------|
| 8.1 架构基线 | `codex/stage8-v0.2-roadmap` | 审计 locator、reader adapter、设置持久化、EPUB/TXT/PDF 渲染和 ReaderShell 边界 | 明确兼容点和必须先补齐的共享接口 |
| 8.2 阅读体验规格 | `codex/stage8-v0.2-roadmap` | 规划三格式翻页动画、EPUB 自带页码和图片查看器、TXT 分页、PDF 无缝滚动 | 每项都有默认值、降级、风险和验收矩阵 |
| 8.3 UI 与质量规格 | `codex/stage8-v0.2-roadmap` | 规划渐进 UI 统一、概念审批、设计 token、可访问性和性能门槛 | 不改变核心信息架构，不进行一次性重写 |
| 8.4 数据与平台方向 | `codex/stage8-v0.2-roadmap` | 规划备份恢复、更新/签名、MOBI/AZW3、跨平台和移动共享核心 | 区分 v0.2 must/should/could 与 v0.3+ |
| 8.5 路线图收口 | `codex/stage8-v0.2-roadmap` | 新增 `docs/v0.2-roadmap.md` 并同步 DEVELOPMENT、findings、progress | 文档验证通过，diff 不含代码/依赖/schema/版本/CHANGELOG |

### 阶段 8 执行记录

| 小阶段 | 状态 | 验证 |
|--------|------|------|
| 8.1 架构基线 | complete | 已核对共享 locator、`app_settings`、epub.js locations/page-list、TXT 虚拟化、PDF continuous 预留和 ReaderShell 组件边界 |
| 8.2 阅读体验规格 | complete | 已写入接口、默认值、动画状态机、格式策略、兼容和失败降级 |
| 8.3 UI 与质量规格 | complete | 已锁定渐进统一、四组概念审批、token、响应式、a11y 和性能矩阵 |
| 8.4 数据与平台方向 | complete | 已划分 v0.2 与 v0.3+，保留 Windows-first 和纯 TS core 边界 |
| 8.5 路线图收口 | complete | Prettier、`git diff --check`、9 项读者问题和变更范围审计通过；仅修改 5 个约定文档文件 |

详细决策与后续实施验收见 `docs/v0.2-roadmap.md`。

### 阶段 8 最终验收

| 验收项 | 状态 |
|--------|------|
| `pnpm.cmd run format` | passed，Node 26.1.0 / pnpm 11.1.2 |
| `git diff --check` | passed |
| 无上下文读者问题检查 | passed，9/9 个关键问题可直接回答 |
| 文档一致性检查 | passed，默认值、阶段顺序、Location 回退、pageOffsetRatio 和 v0.3+ 边界一致 |
| 变更范围审计 | passed，仅 `task_plan.md`、`DEVELOPMENT.md`、`findings.md`、`progress.md`、`docs/v0.2-roadmap.md` |
| 禁止项审计 | passed，无代码、依赖、lockfile、schema、版本、README 或 CHANGELOG 变更 |

## 大阶段 9：阅读体验基础与设计系统

目标：建立 v0.2 集成分支，落地阅读模式、动效和能力接口，审批 UI 概念并在无行为回归前提下开始拆分 ReaderShell。

前置：从最新 `main` 创建 `codex/v0.2.0-integration`；以下分支均从该集成分支最新提交创建并按顺序合回。

| 小阶段 | 分支 | 工作内容 | 验收 |
|--------|------|----------|------|
| 9.1 阅读体验契约 | `codex/stage9-reader-experience-contracts` | 在 core 定义 `PageTransitionMode`、格式视图模式、`ReaderCapabilities`、`ReaderExperiencePreferences`、默认值及可选 `PdfLocator.pageOffsetRatio` | core 类型测试覆盖默认值、联合类型和旧 locator 兼容；core/desktop build 通过 |
| 9.2 设置持久化 | `codex/stage9-reader-experience-settings` | 在 Rust、Tauri bridge 和浏览器 fallback 中读写版本化阅读体验设置；通过 `app_settings` 保存并归一非法值 | 无 schema migration；Rust/TS 测试覆盖默认、保存、恢复、未知字段和降级 |
| 9.3 UI 概念审批 | `codex/stage9-ui-concepts` | 生成书架、阅读器、图片查看器、375px 窄屏四组完整概念，记录可见文案、状态、图标和响应式规则 | 用户明确批准概念；源图和设计说明进入 `docs/design/v0.2/`；批准前不修改产品 UI |
| 9.4 设计 token 与基础组件 | `codex/stage9-design-tokens` | 提取颜色、排版、间距、层级、动效 token，统一按钮、分段控件、工具栏、模态框、滑杆和 focus 样式 | Story/fixture 状态覆盖 hover/focus/disabled/dark/reduced-motion；现有流程无视觉破坏 |
| 9.5 翻页控制器原型 | `codex/stage9-page-transition-spike` | 实现一次导航事务、单槽待处理输入、slide；比较自研 CSS 3D 与 page-flip，按既定门槛决定 page-curl 方案 | 30 次连续导航无丢页/重复提交；性能、iframe/Canvas、a11y、reduced-motion 门槛有记录和自动化覆盖 |
| 9.6 ReaderShell 模块拆分 | `codex/stage9-reader-shell-modules` | 按壳层、侧栏、浮层、格式阅读器、设置、导航控制器拆分，保持公开行为和懒加载边界 | 现有 68 个 Vitest 和 8 个 Playwright 基线不回归；入口包体不超过阶段 8 基线 |
| 9.7 阶段 9 验收 | `codex/stage9-acceptance` | 补齐跨模块测试、文档和集成分支验收，记录最终 page-curl 依赖决策 | 全局门禁、Browser 桌面/窄屏、axe 和 Tauri build 通过；合入 `main` 后将集成分支快进到最新 `main` |

### 阶段 9 实施状态

| 小阶段 | 状态 | 验证摘要 |
|--------|------|----------|
| 9.1 阅读体验契约 | complete | core 5 tests、core build、desktop lint/build、format 与 diff check 通过 |
| 9.2 设置持久化 | complete | browser fallback 74 Vitest、Rust 36 tests、desktop lint/build、format 与 diff check 通过；无 migration |
| 9.3 UI 概念审批 | complete | 四组源图与设计规格已归档；用户批准“视觉方向并按契约校正” |
| 9.4 设计 token 与基础组件 | complete | 78 Vitest、10 Playwright、lint/build/format 通过；Browser 1280×800/375×760 无溢出或 console issue |
| 9.5 翻页控制器原型 | complete | 85 Vitest、12 Playwright、Browser slide/page-curl；30 输入单槽与 >50ms long-task gate 通过；page-flip no-go |
| 9.6 ReaderShell 模块拆分 | complete | 85 Vitest、core 5 tests、lint/build/format 通过；书架入口 66.85 kB gzip，ReaderShell/CSS 保持异步 chunk |
| 9.7 阶段 9 验收 | complete | 5 core + 85 desktop + 36 Rust + 12 Playwright；Browser 三档、axe、Tauri NSIS/MSI build、包体和 fidelity ledger 通过 |

## 大阶段 10：EPUB 增强

目标：实现出版物 page-list 与 Location 回退、图片查看器，以及 EPUB single/double 的平滑和真实翻页。

前置：大阶段 9 complete；所有分支从最新 `codex/v0.2.0-integration` 创建。

| 小阶段 | 分支 | 工作内容 | 验收 |
|--------|------|----------|------|
| 10.1 page-list 模型 | `codex/stage10-epub-page-list` | 解析导航文档原始 page-list 标签，将 href/fragment/CFI 映射为有序出版物页面边界并缓存 | 数字、罗马数字、href-only、CFI、空和损坏 fixture 通过；不依赖 epub.js `parseInt` 结果作为最终标签 |
| 10.2 页码与 Location UI | `codex/stage10-epub-page-labels` | 扩展 EPUB position/display label；有 page-list 显示 `Page <label>`，否则显示 `Location x / y` | 拖动、目录跳转、重启恢复和 single/double 下标签正确；估算位置不再称为 Page |
| 10.3 图片资源桥接 | `codex/stage10-epub-image-bridge` | 在 rendition iframe 注册/清理事件代理，解析 `img`、SVG `image` 和键盘激活，复用已加载资源 | 不主动请求新外部 URL；章节切换不泄漏 listener/blob；装饰性/损坏图片安全忽略 |
| 10.4 图片查看器 | `codex/stage10-epub-image-viewer` | 实现模态查看、适应窗口、100%–500% 缩放、滚轮/触控、拖动、重置、Esc 和焦点恢复 | 键鼠触控和 reduced-motion 路径通过；背景不可交互；桌面/375px 无裁切 |
| 10.5 EPUB 平滑切换 | `codex/stage10-epub-slide-transition` | 将统一 transition controller 接入 EPUB single/double，处理 resize、主题、目录跳转和浮层互斥 | slide/none、快速输入、首末页、双页 spread 和进度单次提交测试通过 |
| 10.6 EPUB 真实翻页 | `codex/stage10-epub-page-curl` | 按阶段 9 决策实现隔离展示层 page-curl，不接管实时 iframe/选择/标注 DOM | 选择、高亮、批注、键盘和图片查看器无回归；不可捕获资源自动无动画降级 |
| 10.7 阶段 10 验收 | `codex/stage10-epub-acceptance` | 汇总 EPUB fixtures、性能、视觉、a11y、文档和完整回归 | core/lint/Vitest/Rust/Playwright/Browser/axe/Tauri build 通过；合入 main 并同步集成分支 |
| 10.x 翻页动画视觉升级 | `codex/stage10-transition-polish` | 保留旧偏好值并提供 None/Realistic/Cover/Smooth；重做设置卡与 EPUB 隔离快照动画 | 四值归一、single/double、快速输入、reduced-motion、三视口/四主题、完整门禁通过 |
| 10.x 快照分页定位修复 | `codex/stage10-transition-snapshot-fix` | 捕获 rendition iframe 的真实分页矩形与滚动位置，让 Smooth/Cover/Realistic 使用实际 current/target 页 | 前进目标偏移小于当前、后退目标偏移大于当前；定向 Vitest、generated EPUB Playwright 与完整门禁通过 |

### 阶段 10 实施状态

| 小阶段 | 状态 | 验证摘要 |
|--------|------|----------|
| 10.1 page-list 模型 | complete | EPUB3/EPUB2 原始标签、href/fragment/CFI 边界、`epub_page_list_v1` 缓存；90 Vitest、lint/build/format 通过 |
| 10.2 页码与 Location UI | complete | 出版物 `Page <label>` 与生成 `Location x / y` 分离；90 Vitest、lint/build/format、generated EPUB Playwright 通过 |
| 10.3 图片资源桥接 | complete | HTML `img` / SVG `image` 事件代理、语义装饰、已加载 URL 复用和完整清理；96 Vitest、lint/build/format 通过 |
| 10.4 图片查看器 | complete | 专用 Modal 查看器、Fit/100%/100%–500% 缩放、滚轮/pinch/拖动、Esc/Close 和 iframe 焦点恢复；101 Vitest、12 Playwright、Rust 36 tests、Tauri build、中期门禁通过 |
| 10.5 EPUB 平滑切换 | complete | None/Slide、single/double、iframe 快照净化、布局取消/CFI 恢复、快速输入合并和单次进度提交通过 |
| 10.6 EPUB 真实翻页 | complete | 500ms CSS 3D/WAAPI fold、背面/阴影/目标页揭示、浮层互斥和捕获/资源/WAAPI 失败无动画降级通过 |
| 10.7 阶段 10 验收 | complete | fixtures、性能、视觉、a11y、包体和三格式回归通过；最终门禁通过，新增 stage 10 fidelity ledger |
| 10.x 翻页动画视觉升级 | complete | None/Realistic/Cover/Smooth、旧偏好兼容、四卡设置、九张关键帧、core 6、desktop 113、Rust 36、Playwright 12/12 与 Tauri build 通过 |
| 10.x 快照分页定位修复 | complete | 固定 viewport 快照＋文档布局偏移、0×0 reflow 等待与无动画降级；core 6、desktop 117、Rust 36、Playwright 12/12、九张关键帧和 Tauri build 通过 |

## 大阶段 11：TXT 分页

目标：在保留连续滚动的同时增加基于 charOffset 的分页、缓存、模式切换和分页动画。

前置：大阶段 10 complete；所有分支从最新 `codex/v0.2.0-integration` 创建。

| 小阶段 | 分支 | 工作内容 | 验收 |
|--------|------|----------|------|
| 11.1 分页测量引擎 | `codex/stage11-txt-paginator-measurement` | 对标题/段落离屏测量，长段落用 Range/二分法按可见高度切分，输出 charOffset 页边界 | 中英混排、超长段落、空段、不同字体/行高/边距 fixture 的边界连续且不丢字/重复 |
| 11.2 分页缓存 | `codex/stage11-txt-pagination-cache` | 按 file hash、viewport、DPI、主题指纹缓存页边界并处理失效 | 任一输入变化即失效；命中/失配/损坏缓存测试通过；缓存不成为持久 locator |
| 11.3 三页渲染窗口 | `codex/stage11-txt-page-window` | 只挂载前页、当前页、后页并预取相邻边界；复用标注切片 | 大型 TXT 不生成整书 DOM；翻页无空白闪烁；标注范围跨页显示正确 |
| 11.4 阅读模式切换 | `codex/stage11-txt-reading-modes` | 增加 scroll/paginated 控件和偏好恢复，切换前后用 chapterId + charOffset 锚定 | 默认仍为 scroll；模式切换、重启、主题/窗口变化回到相同文本附近 |
| 11.5 定位与跳转整合 | `codex/stage11-txt-locator-integrations` | 统一目录、搜索、书签、批注和进度滑杆到分页器 charOffset 路径 | 所有入口能定位正确页/滚动位置；数据库不保存临时页号 |
| 11.6 TXT 分页动画 | `codex/stage11-txt-page-transitions` | 在 paginated 接入 none/slide/cover/page-curl；scroll 保持自然滚动 | 快速输入、选择文本、批注浮层、首末页、reduced-motion 和进度单次提交通过 |
| 11.7 阶段 11 验收 | `codex/stage11-txt-acceptance` | 执行长文本性能、视觉、a11y、定位和三格式回归 | 既有 TXT 滚动性能不回退；全局门禁和 Tauri build 通过；合入 main 并同步集成分支 |
| 11.8 TXT 分页修复与性能优化 | `codex/stage11-txt-pagination-polish` | 修复真实 Double 页槽、EPUB 同款页码/百分比/滑杆、精确目标 spread 快照，并优化缓存重建、字素切分和 DOM 测量 | DPR1/DPR2 下两页真实可见；页码/滑杆/动画目标一致；大型 TXT 冷分页明显加速、缓存/会话切换低于 1 秒；全量门禁通过 |

### 阶段 11 执行记录

| 小阶段 | 状态 | 验证 |
|--------|------|------|
| 11.1 分页测量引擎 | complete | UTF-16/字素安全的可取消分页核心和 DOM 测量器完成；desktop 121 tests、lint 通过 |
| 11.2 分页缓存 | complete | `txt_pagination_v1` 版本 envelope、布局签名、边界校验和确定性切片重建完成；desktop 123 tests、lint 通过 |
| 11.3 三窗口渲染 | complete | memoized 前/当前/后三 spread 窗口完成；Single 最多 3 页、Double 最多 6 页，非当前窗口不可交互；desktop 126 tests、lint 通过 |
| 11.4 阅读模式切换 | complete | Continuous/None/Realistic/Cover/Smooth 五选一、缓存分页接入、Single/Double 窄窗降级和 UTF-16 block offset 完成；core 6、desktop 128、lint/build 通过 |
| 11.5 定位与跳转 | complete | TOC/search/bookmark/annotation/jumpRequest 统一 charOffset 二分；分页滑杆预览、spread 对齐与单次进度提交完成；core 6、desktop 128、lint/build 通过 |
| 11.6 分页动画 | complete | 复用事务控制器和隔离层完成 None/Smooth/Cover/Realistic；按钮、键盘、边缘点击、快速输入、reduced-motion、浮层阻断和单次 commit 接入；desktop 129、lint/build 通过 |
| 11.7 阶段验收 | complete | core 6、desktop 129、Rust 36、Playwright 12/12、Browser/IAB、桌面/375px `view_image`、包体与 Tauri build 全部通过 |
| 11.8 分页修复与性能优化 | complete | frame 实测 Double、共享 EPUB/TXT 两层底栏、精确目标 spread 快照、线性缓存重建、延迟字素切分、增量 DOM 测量、渐进发布和两布局 LRU 完成；core 6、desktop 135、Rust 36、Playwright 13/13（含 seeded DPR2 TXT）、Browser/IAB、Tauri build 全部通过 |

### 阶段 11 最终验收

| 验收项 | 状态 |
|--------|------|
| UTF-16/字素安全分页、缓存、三窗口、locator | passed |
| Continuous + None/Realistic/Cover/Smooth | passed |
| Single/Double、窄窗降级、按钮/键盘/边缘翻页 | passed |
| `pnpm.cmd check` | passed，core 6、desktop 135 |
| Rust fmt/test | passed，36 tests |
| Playwright | passed，13/13 |
| Browser/IAB 与视觉复核 | passed，console clean、桌面/375px 无溢出 |
| `pnpm.cmd --filter @reader/desktop tauri:build` | passed，NSIS/MSI |
| 包体 | passed，书架入口 67.10 kB gzip，ReaderShell 46.67 kB gzip |

## 大阶段 12：PDF 连续模式

目标：完成虚拟化无缝滚动、页内位置恢复、跳转整合，以及 PDF single/double 的分页动画。

前置：大阶段 11 complete；所有分支从最新 `codex/v0.2.0-integration` 创建。

| 小阶段 | 分支 | 工作内容 | 验收 |
|--------|------|----------|------|
| 12.1 连续模式与 locator | `codex/stage12-pdf-continuous-locator` | 让 adapter 真正支持 continuous，读写并归一 `pageOffsetRatio`，保持旧 locator 页首回退 | 旧/新 locator、非法比例、single/double/continuous 切换和重启恢复测试通过 |
| 12.2 虚拟页面列表 | `codex/stage12-pdf-virtual-pages` | 用 TanStack Virtual 根据 PDF 原始尺寸建立页面列表，只挂载可见页和前后 overscan | 500 页 fixture 不创建整书 Canvas/文本层；页面高度估算和滚动范围正确 |
| 12.3 渲染任务生命周期 | `codex/stage12-pdf-render-lifecycle` | render task 改为按页管理，离开窗口取消任务并释放大 Canvas，文本/标注层同生命周期 | 快速滚动/缩放无陈旧页面覆盖、竞态或持续内存增长；错误页可重试 |
| 12.4 当前页与滚动锚定 | `codex/stage12-pdf-scroll-anchoring` | 以 viewport 中心确定当前页；缩放、fit-width、resize 后按 pageOffsetRatio 恢复 | 当前页/进度稳定；不同尺寸和 DPR 下锚点误差在验收阈值内 |
| 12.5 导航与标注整合 | `codex/stage12-pdf-navigation-integrations` | 目录、搜索、页码输入、书签、批注跳转滚动到目标页/rect，保留单页文本选择限制 | 所有跳转在 continuous 正确；高亮重放和选择菜单只绑定可见层；无跨页选择承诺 |
| 12.6 PDF 分页动画 | `codex/stage12-pdf-page-transitions` | single/double 接入 none/slide/page-curl；continuous 强制自然滚动 | Canvas 展示层结束后文本/标注恢复；双页奇偶、末页、快速输入和降级测试通过 |
| 12.7 阶段 12 验收 | `codex/stage12-pdf-acceptance` | 完成 500 页性能、内存、视觉、a11y 和三模式回归 | 全局门禁、Browser/Playwright/axe/Tauri build 通过；合入 main 并同步集成分支 |

阶段 12 已于 2026-07-14 完成。500 页 fixture 的高成本 surface ≤6、分页 Canvas ≤3/6、DPR1/DPR2 和四主题通过；Browser/IAB bootstrap 环境故障已记录并由项目 Playwright 三档截图与真实交互补齐。验收账本见 `docs/design/v0.2/stage12-pdf-continuous-fidelity.md`。

| 12.8 阅读模式修复 | `codex/stage12-reader-mode-fixes` | 修复 PDF Double 动画快照/事务降级；TXT 记住上次 paginated Single/Double | Double 的 Smooth/Cover/Realistic 有准确 current/target 展示层；TXT Continuous 往返与重启均恢复上次分页视图 |
| 12.9 PDF Double 动画视觉修复 | `codex/stage12-pdf-double-animation-visual-fix` | 复现展示层存在但视觉静止的问题；按中间帧几何与像素验证 Double 三种动画 | complete；50% 帧与 None 明显不同，current/target 页号及最终落页准确 |
| 12.10 PDF Double 冷启动动画修复 | `codex/stage12-pdf-double-cold-start-transitions` | 覆盖首次进入 App、首次打开 PDF 后立即翻页；消除首批 spread 未就绪导致的无动画回退 | complete；冷开立即翻页有准确 current/target 与可见中间帧，三种热机动画及失败回退不回归 |

## 大阶段 13：产品收口与数据安全

目标：完成渐进 UI 统一、备份/恢复、更新发布轨道、元数据/封面编辑、批量导入和 v0.2 发布候选。

前置：大阶段 12 complete；所有分支从最新 `codex/v0.2.0-integration` 创建。

| 小阶段 | 分支 | 工作内容 | 验收 |
|--------|------|----------|------|
| 13.1 书架视觉收口（complete） | `codex/stage13-bookshelf-polish` | 按已批准概念统一导航、grid/list、封面、空/错/加载状态和响应式细节 | 与概念逐点对比无未记录偏差；1536/1280/900/640/375/DPR2 通过 |
| 13.2 阅读器视觉收口（complete） | `codex/stage13-reader-polish` + `codex/stage13-fidelity-completion` | 统一三格式 chrome、侧栏、设置、进度、模态/浮层、图标和动效；按 15 张批准稿完成二次逐项审计与缺口收口 | 四主题、三格式、format-aware settings、focus/reduced-motion、真实手势、tooltips、系统态、窄屏抽屉和图片查看器视觉/a11y 通过 |
| 13.3 备份导出（complete） | `codex/stage13-backup-export` | 定义版本化备份 manifest/JSON，导出书库元数据、设置、进度、书签、标注；原书/封面为显式选项 | 可校验版本、checksum 和缺失文件；导出不修改数据库；大书库有进度/取消 |
| 13.4 备份恢复（complete） | `codex/stage13-backup-restore` | 校验备份后事务恢复；书籍按 file hash 去重，记录按 UUID 合并，冲突以 `updated_at` 新者为准 | 失败原子回滚；旧/重复/部分/损坏备份、无原书和跨路径恢复测试通过 |
| 13.5 元数据与封面编辑（complete） | `codex/stage13-book-metadata-editor` | 编辑标题/作者和用户封面；区分提取值与用户覆盖值，支持恢复自动封面 | 重启/升级保持覆盖；格式/尺寸校验、删除书籍和备份恢复一致 |
| 13.6 文件夹与拖放导入（complete） | `codex/stage13-batch-import` | 支持拖放文件/文件夹、递归扫描 EPUB/TXT/PDF、预览、去重、取消和逐项结果 | 大批量导入不阻塞 UI；非法/重复/丢失文件隔离；不跟随符号链接越界 |
| 13.7 应用内更新（complete） | `codex/stage13-app-updater` | 接入 Tauri updater、签名清单、检查/下载/安装状态和手动回退说明 | 无更新、下载失败、签名失败、取消、重启安装和数据库兼容路径通过 |
| 13.8 发布安全与签名（complete） | `codex/stage13-release-security` | 固化依赖/许可证/SBOM、installer checksum、代码签名和 SmartScreen 路径；无证书时记录非阻塞降级 | 有证书则验证签名链；无证书则保留警告文档，不伪造已签名状态 |
| 13.9 v0.2 发布候选（repository complete；native acceptance pending） | `codex/stage13-v0.2-release-candidate` | 更新版本/CHANGELOG/README/清单，执行升级、安装、卸载、文件关联和全量验收，创建 `release/v0.2.0` | 自动化与 draft artifacts 已通过；隔离 updater smoke、安装矩阵和离线密钥备份保持显式未完成，发布需用户明确授权后执行 |

### 阶段 13.1/13.2 设计评审前置记录

- 当前状态：implemented_and_verified；15 张活动画板已全部落实到 13.1/13.2，差异账本分别见书架与阅读器 fidelity 文档。
- 实施边界：先 `codex/stage13-bookshelf-polish`，完成并合入集成分支后再进入 `codex/stage13-reader-polish`；不得把两阶段压缩为一次大改。
- 审核门：13.1 对照 01–04 与 14–15，覆盖 Grid/List、删除确认、loading/empty/error/import feedback、1280/900/640/375/DPR2、focus/reduced-motion；13.2 对照 05–15，覆盖 EPUB/TXT/PDF、四主题、侧栏/抽屉、设置、浮层、图片查看器和动效。
- 停止边界：完成 13.1/13.2 产品实现与验收后停止，不开始 13.3 备份导出。

### 阶段 13.1/13.2 最终 fidelity completion

- 分支：`codex/stage13-fidelity-completion`，从已合入 13.1/13.2 的 `codex/v0.2.0-integration` 创建。
- 完成项：设置面板、格式页视图、移动工具栏、侧栏工具态、加载/错误态、tooltip 时序、drawer/sheet 手势与 PDF 主题性能逐项对齐批准稿。
- 验收：所有 15 张活动画板重新原尺寸审计；TXT/EPUB/PDF 运行态截图和 21 个 Playwright 项目通过；13.3 保持未开始。

## 大阶段 14：v0.3 格式与阅读能力扩展

目标：v0.2 发布后，在 `codex/v0.3.0-integration` 上评估 MOBI/AZW3，并按容量加入自定义字体、全书库检索和阅读统计。

| 小阶段 | 分支 | 工作内容 | 验收 |
|--------|------|----------|------|
| 14.1 MOBI/AZW3 决策 | `codex/stage14-mobi-azw3-evaluation` | 比较 Calibre/KindleUnpack/其他转换器的许可、体积、离线性、DRM 边界和分发方式 | 输出 go/no-go；DRM 文件明确拒绝；未过许可/体积门槛不进入实现 |
| 14.2 转换原型 | `codex/stage14-mobi-conversion-spike` | 在隔离临时目录将无 DRM 样本转换为 EPUB，验证元数据、目录、图片、编码和清理 | 转换失败不污染书库；进程取消/超时/残留清理通过；记录安装包增量 |
| 14.3 MOBI/AZW3 导入 | `codex/stage14-mobi-import` | 仅在 14.1/14.2 go 后接入导入、转换进度、去重和错误反馈，内部继续走 EPUB adapter | 原文件保留；转换产物可追踪/删除；书库、文件关联、备份和许可证清单通过 |
| 14.4 自定义字体 | `codex/stage14-custom-fonts` | 导入本地字体、校验许可提示/格式、管理启停并映射到 TXT/EPUB | 损坏字体不影响启动；卸载字体有回退；PDF 不承诺替换文档字体 |
| 14.5 全书库全文检索 | `codex/stage14-library-search-index` | 建立可失效本地索引、后台队列、搜索结果和跳转；不上传内容 | 导入/删除/修复触发增量索引；大书库搜索可取消；索引损坏可重建 |
| 14.6 阅读历史与统计 | `codex/stage14-reading-history` | 记录本地阅读会话、时长和完成度，提供按书/日期统计及清空开关 | 默认本地、可关闭/删除/导出；休眠和后台时间不计入有效阅读 |
| 14.7 阶段 14 验收 | `codex/stage14-acceptance` | 对实际启用的 v0.3 能力做兼容、隐私、性能、许可证和打包验收 | 未通过 gate 的能力不进入发布；完整门禁和升级测试通过 |

## 大阶段 15：v0.4 macOS/Linux 桌面扩展

目标：在 `codex/v0.4.0-integration` 上完成平台抽象、macOS/Linux 运行和可分发安装包。

| 小阶段 | 分支 | 工作内容 | 验收 |
|--------|------|----------|------|
| 15.1 平台抽象审计 | `codex/stage15-platform-abstraction` | 清理 Windows-only 路径/命令/文件关联假设，建立平台 capability 和目录/权限矩阵 | Windows 行为不回归；core 不引入 OS/DOM/Tauri 依赖 |
| 15.2 macOS 运行适配 | `codex/stage15-macos-runtime` | 适配 app data、sandbox/文件权限、窗口、菜单、快捷键、字体和 WebKit 行为 | Intel/Apple Silicon 支持策略明确；三格式阅读和数据恢复通过 |
| 15.3 macOS 打包发布 | `codex/stage15-macos-packaging` | 配置 universal/分架构 bundle、文件关联、签名、公证和升级 | 签名/公证 gate 通过才公开发布；安装、升级、卸载和双击打开验证 |
| 15.4 Linux 运行适配 | `codex/stage15-linux-runtime` | 适配 XDG 路径、WebKitGTK、文件选择、字体、桌面集成和发行版差异 | 选定最低支持发行版；三格式阅读、导入、备份恢复通过 |
| 15.5 Linux 打包发布 | `codex/stage15-linux-packaging` | 配置 AppImage/deb/rpm 中经评估的目标格式、MIME/desktop 文件和升级说明 | 每个发布格式有安装/卸载/文件关联验证；不承诺未测试发行版 |
| 15.6 跨平台 CI 与验收 | `codex/stage15-cross-platform-ci` | 建立 Windows/macOS/Linux 构建矩阵、平台 fixture、条件测试和发布清单 | 三平台核心测试、打包 smoke、路径/权限/升级矩阵通过 |

## 大阶段 16：v0.5 移动共享核心与客户端

目标：在 `codex/v0.5.0-integration` 上抽取平台无关逻辑并建立 React Native/Expo 移动基线，不复用 DOM renderer。

| 小阶段 | 分支 | 工作内容 | 验收 |
|--------|------|----------|------|
| 16.1 共享核心边界 | `codex/stage16-shared-core-boundary` | 抽取模型、locator、设置归一、导出协议和纯业务规则；建立禁止 DOM/Tauri/Node import 的门禁 | desktop 继续通过；core 可在 RN TypeScript 环境编译和测试 |
| 16.2 数据可移植协议 | `codex/stage16-portability-protocol` | 将阶段 13 备份模型演进为跨平台版本化协议，定义 capability、迁移和冲突元数据 | desktop/mobile 双向 fixture 兼容；未知字段保留；无云服务依赖 |
| 16.3 React Native/Expo 壳 | `codex/stage16-mobile-shell` | 建立导航、书架、设置、主题、错误状态和平台 capability 注入 | Android/iOS 开发构建启动；无营销首页；基础 a11y/深浅主题通过 |
| 16.4 移动存储与导入 | `codex/stage16-mobile-storage-import` | 接入文档选择、应用沙盒副本、SQLite/等价存储、去重、删除和备份导入 | 重启恢复、空间不足、权限拒绝、重复导入和删除清理通过 |
| 16.5 移动阅读器适配 | `codex/stage16-mobile-readers` | 为 EPUB/TXT/PDF 选择移动原生/WebView adapter，复用 locator/annotation 协议而非桌面 DOM | 手势、旋转、后台恢复、选择/标注和大文件性能达到移动验收线 |
| 16.6 移动端验收 | `codex/stage16-mobile-acceptance` | Android/iOS 设备矩阵、离线、功耗、内存、备份互通和隐私验收 | 关键流程真实设备通过；不支持的格式/能力明确降级 |

## 大阶段 17+：语音、词典、翻译与可选同步

目标：移动/桌面共享协议稳定后，再用可插拔服务扩展辅助阅读；默认继续本地优先、无账号、无上传。

| 小阶段 | 分支 | 工作内容 | 验收 |
|--------|------|----------|------|
| 17.1 TTS | `codex/stage17-tts` | 抽象系统 TTS，支持段落/句子跟随、速度/声音、暂停恢复和后台策略 | Windows/macOS/Linux/移动按 capability 降级；高亮与 locator 同步；离线优先 |
| 17.2 本地词典 | `codex/stage17-dictionary` | 定义词典 provider，先支持离线词典包、选词查询、历史和数据清理 | 无词典时不阻塞阅读；索引可卸载；选词/键盘/触控流程通过 |
| 17.3 可选翻译 | `codex/stage17-translation` | 抽象本地/远程翻译 provider，显式展示发送文本范围和隐私开关 | 默认关闭远程；每次/每 provider 有同意与错误降级；不上传原书全文 |
| 17.4 同步协议 | `codex/stage17-sync-protocol` | 基于 UUID、updatedAt、deletedAt 定义版本化增量同步、冲突和加密 envelope | 模拟离线并发、删除、时钟偏差和未知字段；协议不绑定单一后端 |
| 17.5 可选同步服务 | `codex/stage17-sync-service` | 在用户明确启用后同步进度、书签、标注和设置；书文件默认不同步 | 端到端加密/认证/注销/导出/删除完成前不发布；本地模式完全独立可用 |
| 17.6 阶段 17+ 验收 | `codex/stage17-acceptance` | 隐私、安全、跨平台、离线和辅助功能验收 | 默认网络静默；远程功能均可关闭和清除；威胁模型与用户文档完成 |

### 阶段 9–17+ 详细计划验收

| 验收项 | 状态 |
|--------|------|
| 固定小阶段/分支总数 | passed，62 个 |
| 分支集合一致性 | passed，`task_plan.md` 与 `docs/v0.2-roadmap.md` 各 62 个，差集 0 |
| 分支唯一性 | passed，两份文档均无重复分支名 |
| 阶段计数 | passed，9–12 各 7，13 为 9，14 为 7，15–17 各 6 |
| 版本边界 | passed，9–13=v0.2、14=v0.3、15=v0.4、16–17+=v0.5+ |
| 无上下文读者问题 | passed，12/12 可直接回答 |
| 实施边界 | passed，未创建未来集成/功能分支，阶段 9 未开始 |

## 全局验收命令

在仓库脚手架完成后，阶段合入前优先使用以下命令：

```powershell
pnpm.cmd install
pnpm.cmd --filter @reader/core build
pnpm.cmd --filter @reader/desktop lint
pnpm.cmd --filter @reader/desktop test
pnpm.cmd --filter @reader/desktop build
cargo test --manifest-path apps\desktop\src-tauri\Cargo.toml
pnpm.cmd --filter @reader/desktop tauri:build
```

当前仓库尚未脚手架化时，工具链检查以 Node、pnpm、Rust、Cargo、Tauri CLI、SQLite CLI、Git 可用性为准。

## 关键问题

1. 首版许可证最终选择 MIT、Apache-2.0 还是双许可。
2. TXT 解码和章节识别放在 Rust 后端还是 TypeScript reader-engine，需要在阶段 2.1 前确定。已决定放在 Rust 后端。
3. PDF MVP 是否包含精确文本高亮，阶段 4.5 预研后再定。
4. 是否在 v0.1 发布前加入自动更新；默认不纳入 MVP。

## 已做决策

| 决策 | 理由 |
|------|------|
| Windows-first 桌面 MVP | 与 `DEVELOPMENT.md` 首版目标一致，先把本地阅读体验做稳 |
| 使用 Tauri 2 + React + TypeScript + Vite | 轻量桌面壳、成熟 Web 阅读生态、未来可复用 TypeScript 逻辑 |
| SQLite 本地持久化 | 适合书库、进度、书签、高亮、笔记和设置 |
| TXT 在 EPUB/PDF 之前打磨 | 中文网文体验是关键差异点，能尽早验证阅读壳和主题系统 |
| 每个小阶段独立分支 | 降低合并风险，便于回滚和逐阶段验证 |
| MVP 排除账号、云同步、AI 翻译、在线书城、推荐系统 | 避免首版范围膨胀，保持本地优先 |
| 阶段 2 TXT 解码、编码检测和章节识别放在 Rust 后端 | 后端已持有 `library_path` 和本地文件权限，前端不需要新增 fs 权限 |

## 遇到的错误

| 错误 | 尝试次数 | 解决方案 |
|------|---------|---------|
| `cargo fmt --check` 发现 `open_txt_book_at` 一处自动换行差异 | 1 | 运行 `cargo fmt --manifest-path apps\desktop\src-tauri\Cargo.toml` 后继续测试 |
| `chardetng` 1.0.0 的 `EncodingDetector::new` 和 `guess` 需要枚举参数 | 1 | 改用 `Iso2022JpDetection::Deny` 和 `Utf8Detection::Allow` |
| 阶段 2.1 解码测试仍断言 `full-text`，与 2.2 章节识别冲突 | 1 | 将该测试收窄为校验拼接后的解码文本，章节 ID 交给章节测试覆盖 |
| 阶段 2.6 首次 Playwright 长文本测试发现虚拟列表渲染全部 240 段 | 1 | 将 `reader-shell` 和 `reader-main` 约束为 `100vh`，让 `reader-viewport` 成为内部滚动容器 |
| 阶段 2.x Vitest 发现 jsdom 缺少 `scrollIntoView` | 1 | 对 active TOC 自动滚动增加运行时函数存在性检查 |
| 阶段 2.x ESLint `react-hooks/set-state-in-effect` 指出 active 章节初始化 effect | 1 | 改为在 TXT 文档加载完成时同步设置初始 active chapter |
| 阶段 2.x Browser 插件截图命令超时 | 1 | 保留 Browser DOM/console/style metrics，并用 Playwright CLI 在仓库外生成桌面和窄屏截图 |
| 阶段 3.1 `epubjs` 安装触发 pnpm build-script 审批 | 1 | 批准 `core-js` 和 `es5-ext`，并在 `pnpm-workspace.yaml` 记录 allowBuilds |
| 阶段 3.1 Tauri asset protocol 编译失败 | 1 | 为 Rust `tauri` 依赖开启 `protocol-asset` feature |
| 阶段 3.2 EPUB 内容层打开后触发 React maximum update depth | 1 | 将 EPUB TOC 读取改为 ref，避免 TOC 更新改变 relocated 回调 identity 后重复 open/close |
| 阶段 6.x 分隔条 `pointerdown` 阻止默认聚焦，键盘回归测试仍停留在 292px | 1 | 拖动开始时显式聚焦 separator，确保拖动后方向键继续可用 |
| 阶段 6.x E2E 在 900px 断言侧栏受 40vw 限制，但媒体区间实际到 899px | 1 | 分别断言 900px 保留设置宽度、899px 开始限制为 40vw |
| 阶段 6.x 首次封面浮层截图与右侧卡片标题发生叠字 | 1 | 悬停时提升封面 grid item 的 stacking context，确保不透明浮层覆盖正文列 |
| 阶段 8 首次 staged diff 检查发现路线图元数据行有 Markdown 尾空格 | 1 | 提交未执行；改为普通段落并重新运行 Prettier 与 `git diff --cached --check` |

## 备注

- 任何外部资料、依赖许可、渲染器行为发现应写入 `findings.md`，不要直接塞入本计划。
- 每完成一个小阶段，应更新本文件对应状态或在阶段表旁追加完成记录。
- 如果后续从 `main` 创建 `codex/v0.1.0-mvp-integration`，应先确认 `main` 已包含本计划和 `DEVELOPMENT.md`。
- 阶段 0 已完成并通过完整验收，后续阶段应从最新 `main` 或 `codex/v0.1.0-mvp-integration` 继续拉分支。

## 阶段 5.x 标注体验二次修复追加记录

| 小阶段 | 分支 | 工作内容 | 当前状态 |
|--------|------|----------|----------|
| 5.x 二次修复 | `codex/stage5-annotation-followup` | 恢复 Notes 侧栏显示高亮-only；正文点击仅 note-bearing 下划线可打开批注；同范围多条 note 通过浮层列表编辑/新增；EPUB 选区菜单贴近首个 client rect | 完成，全量验收通过 |

本轮保持 SQLite schema 和 core locator 类型不变；多条批注用多条 `annotations` 记录表达，高亮改色仍走已有 upsert 逻辑。

## 阶段 5.x EPUB 标注显示修复追加记录

| 小阶段 | 分支 | 工作内容 | 当前状态 |
|--------|------|----------|----------|
| 5.x EPUB 显示修复 | `codex/stage5-epub-annotation-render-fix` | 使用当前可见 rendition Range 计算选区主窗口坐标；把 epub.js note 标记从虚线矩形修正为与 TXT 一致的单条虚线下划线 | complete，全量验收通过 |

验收结果：`pnpm.cmd install`、core build、desktop lint/test/build、27 个 Rust 测试、5 个 Playwright smoke、桌面局部视觉检查和 `tauri:build` 均通过；Vitest 共 50 tests。首次 Tauri build 因旧 release 进程锁定 exe 失败，结束 PID 27020 后重跑通过。

## 阶段 11.9：TXT 分页持续阅读与渐进加载

| 小阶段 | 分支 | 工作内容 | 当前状态 |
|--------|------|----------|----------|
| 11.9 | `codex/stage11-txt-pagination-followup` | 使用真实挂载后的 page frame 尺寸提高正文利用率；恢复并持久化分页 charOffset；缓存快速恢复；分页计算中持续发布可翻阅页面 | 完成，全量验收通过 |

本轮保持 `TxtLocator`、数据库 schema、`txt_pagination_v1` envelope、阅读偏好和 EPUB/PDF 懒加载边界不变；不新增依赖、版本、格式或 Release。验收必须覆盖重新打开恢复进度、计算中 Next/Previous、Single/Double 正文利用率、缓存命中、三档视口和无横向溢出。
