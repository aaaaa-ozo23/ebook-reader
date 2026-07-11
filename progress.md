# 进度日志

## 2026-06-21 大阶段 5：书签、高亮、想法与检索

### 状态
- **当前状态：** in_progress
- **当前分支：** `codex/stage5-search-basic`

### 执行的操作
- 读取 `task_plan.md`、`progress.md`、`findings.md` 并运行 session catchup；确认上一轮只有大阶段 5 计划与本轮启动上下文未同步。
- 确认 `main` 工作区干净并与 `origin/main` 对齐。
- 执行 `git fetch origin --prune`。
- 将 `codex/v0.1.0-mvp-integration` 从 `main` 快进到 `db8fde9`。
- 创建 `codex/stage5-bookmarks`，开始阶段 5.1。
- 更新 `task_plan.md` 当前阶段和阶段 5 执行记录。

### 待执行
- 实现书签 core 类型、Rust CRUD、Tauri bridge、浏览器 fallback、ReaderShell 书签 UI 与三格式跳转。
- 完成 5.1 针对性 Rust/Vitest 验证后合回 `codex/v0.1.0-mvp-integration`。

### 阶段 5.1：书签能力
- **状态：** complete
- **分支：** `codex/stage5-bookmarks`
- 执行的操作：
  - 在 `@reader/core` 新增 `Bookmark` 类型，并给 `TxtLocator` 增加可选 `endCharOffset`。
  - 在 Rust `db.rs` 新增 `Bookmark` struct、`list_bookmarks`、`create_bookmark`、`delete_bookmark` 以及 `_at` 测试入口。
  - 复用现有 `bookmarks` 表，不新增 SQLite migration；创建书签前按书籍格式校验 locator。
  - 在 Tauri `lib.rs` 注册书签 CRUD 命令。
  - 在 `tauri/reader.ts` 新增书签 bridge 和浏览器 localStorage fallback。
  - 扩展 `ReaderShell`：顶部 `Bookmark` 按钮、侧栏 `Contents / Bookmarks / Notes / Search` tabs、书签列表、删除和跳转。
  - 将 TXT 跳转请求升级为 locator 级跳转，书签可回到保存的字符偏移附近；EPUB/PDF 内容层回传当前 locator 供书签保存。
  - 增加 Vitest 覆盖 TXT 书签创建和跳转。
- 创建/修改的文件：
  - `packages/core/src/index.ts`
  - `apps/desktop/src-tauri/src/db.rs`
  - `apps/desktop/src-tauri/src/lib.rs`
  - `apps/desktop/src/tauri/reader.ts`
  - `apps/desktop/src/components/ReaderShell.tsx`
  - `apps/desktop/src/App.css`
  - `apps/desktop/src/App.test.tsx`
  - `task_plan.md`
  - `findings.md`
  - `progress.md`
- 验证：
  - `pnpm.cmd --filter @reader/core build` 通过。
  - `cargo test --manifest-path apps\desktop\src-tauri\Cargo.toml` 通过，24 tests。
  - `pnpm.cmd --filter @reader/desktop test -- App.test.tsx` 通过，32 tests。
  - `pnpm.cmd --filter @reader/desktop lint` 通过。
  - `pnpm.cmd --filter @reader/desktop build` 通过。
- 遇到的问题：
  - 首次 lint 发现书签加载 effect 中同步 reset state 触发 `react-hooks/set-state-in-effect`；改为带 `bookId` 的派生状态，避免跨书籍复用旧书签/locator。
  - 新增书签跳转测试中删除按钮 aria-label 与跳转按钮同名匹配；为跳转按钮增加 `Go to bookmark ...` aria-label 后解决。

### 阶段 5.2：选中菜单
- **状态：** complete
- **分支：** `codex/stage5-selection-menu`
- 执行的操作：
  - 新增统一 `ReaderSelectionSnapshot` 和 `SelectionMenu`，提供 `Highlight`、`Note`、`Copy` 三个动作入口。
  - TXT 阅读器在单个虚拟块内捕获 DOM Selection，映射为 `TxtLocator.charOffset/endCharOffset`，并保存 selectedText/context。
  - EPUB 阅读器接入既有 `EpubReaderAdapter.onSelected`，将 CFI range 转换为 EPUB selection snapshot。
  - PDF adapter 新增 `renderTextLayer` 和 `viewportRectsToPdfRects`，PDF 页面 canvas 上叠加 PDF.js TextLayer。
  - PDF 阅读器对单页 text layer 内选区生成 `PdfLocator.page/rects/scale/zoomMode`，跨页选区暂不生成菜单。
  - 扩展 Vitest 覆盖 EPUB selection menu 显示；更新 PDF adapter mock 支持 text layer。
- 创建/修改的文件：
  - `apps/desktop/src/components/ReaderShell.tsx`
  - `apps/desktop/src/pdf/PdfReaderAdapter.ts`
  - `apps/desktop/src/App.css`
  - `apps/desktop/src/App.test.tsx`
  - `task_plan.md`
  - `findings.md`
  - `progress.md`
- 验证：
  - `pnpm.cmd --filter @reader/desktop test -- App.test.tsx PdfReaderAdapter.test.ts` 通过，33 tests。
  - `pnpm.cmd --filter @reader/desktop lint` 通过。
  - `pnpm.cmd --filter @reader/desktop build` 通过。
- 遇到的问题：
  - 首次 selection menu 测试触发 `onSelected` 紧跟 `onRelocated` 时，EPUB position ref 仍为空；在 `handleRelocated` 中同步更新 ref 后解决。
  - 首次 build 发现 TS 不接受对 `Node` 调用 `closest`；改为显式把 selection node 转成 `Element` 或其 parent `Element`。

### 阶段 5.3：高亮保存
- **状态：** complete
- **分支：** `codex/stage5-highlights`
- 执行的操作：
  - 在 Rust `db.rs` 新增 `AnnotationKind`、`Annotation`、annotations CRUD `_at` 入口和 app 入口。
  - 在 Tauri `lib.rs` 注册 `list_annotations`、`create_annotation`、`update_annotation`、`delete_annotation` 命令。
  - 在 `tauri/reader.ts` 新增 annotations bridge 和浏览器 localStorage fallback；fallback 按 `deletedAt` 过滤软删除记录。
  - 将 selection menu 的 `Highlight` 接到 `createAnnotation(type="highlight")`，默认黄色，并增加绿/蓝/粉色 swatch。
  - TXT 阅读器按 `TxtLocator.charOffset/endCharOffset` 在虚拟块内重放 `<mark>` 高亮。
  - EPUB 阅读器按 CFI 调用 `adapter.addHighlight(cfi, color)` 重放高亮。
  - PDF adapter 新增 `pdfRectsToViewportRects()`，PDF 阅读器用保存的页内 rect 渲染 overlay 高亮。
  - 扩展 Vitest 覆盖高亮创建、TXT 重放、EPUB adapter 重放和 PDF overlay 重放。
- 创建/修改的文件：
  - `apps/desktop/src-tauri/src/db.rs`
  - `apps/desktop/src-tauri/src/lib.rs`
  - `apps/desktop/src/tauri/reader.ts`
  - `apps/desktop/src/components/ReaderShell.tsx`
  - `apps/desktop/src/epub/EpubReaderAdapter.ts`
  - `apps/desktop/src/pdf/PdfReaderAdapter.ts`
  - `apps/desktop/src/App.css`
  - `apps/desktop/src/App.test.tsx`
  - `task_plan.md`
  - `findings.md`
  - `progress.md`
- 验证：
  - `cargo fmt --manifest-path apps\desktop\src-tauri\Cargo.toml` 通过。
  - `pnpm.cmd --filter @reader/core build` 通过。
  - `cargo test --manifest-path apps\desktop\src-tauri\Cargo.toml` 通过，27 tests。
  - `pnpm.cmd --filter @reader/desktop test -- App.test.tsx PdfReaderAdapter.test.ts` 通过，36 tests。
  - `pnpm.cmd --filter @reader/desktop lint` 通过。
  - `pnpm.cmd --filter @reader/desktop build` 通过。
- 遇到的问题：
  - 首次高亮创建测试断言多写了可选 `note` 参数；实际调用省略该参数，已修正测试。
  - 首次 lint 报 PDF annotations effect 同步调用会 setState 的渲染回调；改为 `requestAnimationFrame` 调度重算 overlay 后通过。

### 阶段 5.4：想法/笔记
- **状态：** complete
- **分支：** `codex/stage5-notes`
- 执行的操作：
  - 将 `SelectionMenu` 的 `Note` 动作接入 `createAnnotation(type="note")`，创建后自动打开侧栏 `Notes` tab。
  - 将侧栏 `Notes` 从占位空状态扩展为当前书 annotations 列表，展示摘录、颜色、更新时间和 note 文本框。
  - 支持对高亮或 note 记录追加/编辑 note，保存时调用 `updateAnnotation`。
  - 支持删除 annotation，删除后从本地列表移除；后端软删除逻辑沿用 5.3。
  - 支持从 Notes 列表跳回 TXT/EPUB/PDF 原文 locator。
  - 增加 Notes 面板样式，复用现有侧栏风格。
  - 扩展 Vitest 覆盖从 EPUB selection 创建 note、TXT Notes 面板编辑/跳转/删除。
- 创建/修改的文件：
  - `apps/desktop/src/components/ReaderShell.tsx`
  - `apps/desktop/src/App.css`
  - `apps/desktop/src/App.test.tsx`
  - `task_plan.md`
  - `findings.md`
  - `progress.md`
- 验证：
  - `pnpm.cmd --filter @reader/desktop test -- App.test.tsx PdfReaderAdapter.test.ts` 通过，38 tests。
  - `pnpm.cmd --filter @reader/desktop lint` 通过。
  - `pnpm.cmd --filter @reader/desktop build` 通过。
- 遇到的问题：
  - Notes item 初版曾考虑用 effect 同步 textarea draft；为避免 `react-hooks/set-state-in-effect` 类问题，改为本地 draft 初始化后由用户输入和保存结果自然保持一致。

### 阶段 5.5：搜索基础
- **状态：** complete
- **分支：** `codex/stage5-search-basic`
- 执行的操作：
  - 将侧栏 `Search` tab 从占位状态扩展为统一搜索表单、结果列表、空结果和错误状态。
  - TXT 搜索在已加载 `TxtDocument` 中按章节扫描全文，生成 `TxtLocator.charOffset/endCharOffset` 和上下文 excerpt。
  - EPUB adapter 实现 `search(query)`，遍历 epub.js spine section 的 `find()` 结果，返回 CFI locator。
  - PDF adapter 实现 `search(query)`，逐页读取 `getTextContent()`，返回页级 `PdfLocator.page` 结果。
  - EPUB/PDF 内容层在 adapter 打开后向 ReaderShell 注册搜索 provider，卸载时注销。
  - 搜索结果点击复用现有 locator 跳转链路，TXT 跳转会同步保存阅读进度。
  - 扩展 Vitest 覆盖 TXT/EPUB/PDF 搜索提交和结果跳转。
- 创建/修改的文件：
  - `apps/desktop/src/components/ReaderShell.tsx`
  - `apps/desktop/src/epub/EpubReaderAdapter.ts`
  - `apps/desktop/src/pdf/PdfReaderAdapter.ts`
  - `apps/desktop/src/App.css`
  - `apps/desktop/src/App.test.tsx`
  - `task_plan.md`
  - `findings.md`
  - `progress.md`
- 验证：
  - `pnpm.cmd --filter @reader/desktop test -- App.test.tsx PdfReaderAdapter.test.ts` 通过，41 tests。
  - `pnpm.cmd --filter @reader/desktop lint` 通过。
  - `pnpm.cmd --filter @reader/desktop build` 通过。
- 遇到的问题：
  - 首次 desktop build 发现 EPUB/PDF search mock 的空数组返回被 TypeScript 推断为 `never[]`；为 mock 增加显式 Promise 返回类型后通过。

### 阶段 5 最终验收
- **状态：** complete
- **分支：** `codex/v0.1.0-mvp-integration`
- 验证：
  - `pnpm.cmd install` 通过，workspace already up to date。
  - `pnpm.cmd --filter @reader/core build` 通过。
  - `pnpm.cmd --filter @reader/desktop lint` 通过。
  - `pnpm.cmd --filter @reader/desktop test` 通过，41 tests。
  - `pnpm.cmd --filter @reader/desktop build` 通过。
  - `cargo test --manifest-path apps\desktop\src-tauri\Cargo.toml` 通过，27 tests。
  - `pnpm.cmd --filter @reader/desktop test:e2e` 通过，5 Chromium smoke tests。
  - Playwright 视觉检查通过：`D:\tl-temp\ebook-reader-stage5-notes-search-desktop.png`、`D:\tl-temp\ebook-reader-stage5-notes-search-mobile-375x760.png`；桌面 viewport 高度 829.7，375x760 viewport 高度 619.9，Notes/Search 可见，无 console warning/error。
  - `pnpm.cmd --filter @reader/desktop tauri:build` 通过，生成 release exe、MSI、NSIS installer。
- 遇到的问题：
  - 临时视觉脚本首次从仓库根运行 Node 无法解析 workspace 内 `@playwright/test`；改在 `apps/desktop` 工作目录执行后继续。
  - 第二次视觉脚本因中文 stdin 编码和多结果 strict locator 失败；改用 ASCII fixture 并选择首个结果后通过。
  - 首次 `tauri:build` 因旧 `ebook-reader-desktop.exe` 进程 PID 16968 锁定 release 产物失败；结束该产物进程后重跑通过。

## 2026-06-21 大阶段 3/4：阅读体验统一调整

### 状态
- **当前状态：** complete
- **分支：** `codex/stage3-4-reader-ui-unification`

### 执行的操作
- 从 `main` 快进 `codex/v0.1.0-mvp-integration`，创建 `codex/stage3-4-reader-ui-unification`。
- 为 EPUB 阅读器增加页码输入，沿用当前 synthetic locations 页码，输入提交时换算为 `goToProgress`。
- 为 PDF adapter 增加 `previewProgress`、`goToProgress` 和 `progressToPdfPage`，PDF slider 可按页预览并在释放后跳转。
- 在 PDF 阅读器底部增加与 EPUB 同风格的进度条，并把 EPUB/PDF 页码输入统一放入进度 meta 行。
- 压缩非 Focus 模式 reader viewport 底部 padding、阅读框与控制条 gap、控制条内部 padding，并移除桌面 EPUB/PDF 主阅读区不必要的固定 min-height。
- 扩展 Vitest 和 Playwright smoke 覆盖 EPUB 页码输入、PDF slider 预览/提交。
- 更新 `task_plan.md` 和 `findings.md` 记录本轮阶段 3/4 体验统一调整。

### 已通过验证
- `pnpm.cmd install` 通过，lockfile already up to date。
- `pnpm.cmd --filter @reader/core build` 通过。
- `pnpm.cmd --filter @reader/desktop lint` 通过。
- `pnpm.cmd --filter @reader/desktop test -- App.test.tsx PdfReaderAdapter.test.ts` 通过，31 tests。
- `pnpm.cmd --filter @reader/desktop test` 通过，31 tests。
- `pnpm.cmd --filter @reader/desktop build` 通过。
- `cargo test --manifest-path apps\desktop\src-tauri\Cargo.toml` 通过，22 tests。
- `pnpm.cmd --filter @reader/desktop test:e2e` 通过，5 Chromium smoke tests，含新增 EPUB 页码输入和 PDF progress slider 路径。
- Browser 本地首屏检查通过：`http://127.0.0.1:1420/` 书架非空壳、无 console warning/error；Browser 无法注入 localStorage fixture，阅读器视觉使用 Playwright fallback。
- Playwright 视觉检查通过：`D:\tl-temp\ebook-reader-stage34-epub-desktop.png`、`D:\tl-temp\ebook-reader-stage34-epub-mobile-375x760.png`、`D:\tl-temp\ebook-reader-stage34-pdf-desktop.png`、`D:\tl-temp\ebook-reader-stage34-pdf-mobile-375x760.png`；EPUB/PDF 桌面和 375x760 均无正文/控制区重叠，底部 gap 27-28px，PDF canvas 非空。
- `pnpm.cmd --filter @reader/desktop tauri:build` 通过，生成 release exe、MSI、NSIS installer。

### 遇到的问题
- 首次针对性 Vitest 发现 PDF 双页模式下跳到第 2 页时状态文案是 `Pages 2-3 / 3`，原新增断言误写为单页 `Page 2 / 3`；已修正测试断言，代码行为符合双页规则。
- 首次临时 Playwright 视觉脚本使用裸 `playwright` 导入失败；桌面包直接依赖的是 `@playwright/test`，改用 `@playwright/test` 导出的 `chromium` 后通过。
- 首次 EPUB 视觉截图捕获过早，locations 尚未生成导致 slider/页码输入 disabled；改为等待两个控件 enabled 后重跑并覆盖截图。
- 首次 `pnpm.cmd --filter @reader/desktop tauri:build` 前端构建通过，但 release `ebook-reader-desktop.exe` 被旧运行进程 PID 4612 锁定；结束该生成产物进程后重跑通过。

## 2026-06-20 大阶段 4：PDF 阅读器

### 阶段 4.1：PDF.js 接入
- **状态：** complete
- **分支：** `codex/stage4-pdf-adapter`
- 执行的操作：
  - 从 `main` 快进 `codex/v0.1.0-mvp-integration`，创建 `codex/stage4-pdf-adapter`。
  - 安装 `pdfjs-dist@6.0.227` 到 `@reader/desktop`。
  - 新增 `PdfReaderAdapter`，通过动态 import 加载 PDF.js，配置 `GlobalWorkerOptions.workerSrc`，封装 open/close/goTo/currentLocator/page render/previous/next/zoom/fitWidth/viewMode。
  - 在 Vite 配置中新增本地 PDF.js 资源插件，dev 服务 `cmaps`、`standard_fonts`，build 复制资源和 worker 到 `dist/pdfjs/`。
  - 在 `tauri/reader.ts` 新增 `getPdfBookSource`，Tauri 使用 `convertFileSrc(book.libraryPath)`，浏览器 fallback 使用显式 localStorage source fixture。
  - 在 `@reader/core` 为 `PdfLocator` 增加 `zoomMode?: "fit-width" | "custom"`。
- 创建/修改的文件：
  - `apps/desktop/package.json`
  - `apps/desktop/src/pdf/PdfReaderAdapter.ts`
  - `apps/desktop/src/pdf/PdfReaderAdapter.test.ts`
  - `apps/desktop/src/tauri/reader.ts`
  - `apps/desktop/vite.config.ts`
  - `packages/core/src/index.ts`
  - `pnpm-lock.yaml`
  - `task_plan.md`
  - `findings.md`
  - `progress.md`
- 验证：
  - `pnpm.cmd --filter @reader/core build` 通过。
  - `pnpm.cmd --filter @reader/desktop test -- PdfReaderAdapter.test.ts` 通过，26 tests。
  - `pnpm.cmd --filter @reader/desktop lint` 通过。
  - `pnpm.cmd --filter @reader/desktop build` 通过，并确认 `dist/pdfjs/pdf.worker.mjs`、`dist/pdfjs/cmaps/*` 生成。

### 阶段 4.2：页面导航和缩放
- **状态：** complete
- **分支：** `codex/stage4-pdf-navigation`
- 执行的操作：
  - 从 `codex/v0.1.0-mvp-integration` 创建 `codex/stage4-pdf-navigation`。
  - 移除 `App.tsx` 中 PDF 打开拦截，PDF 书籍可进入阅读页。
  - 在 `ReaderShell` 新增 `PdfReaderContent`，接入 `PdfReaderAdapter`、PDF source、进度恢复、目录跳转和 canvas 渲染。
  - 增加 PDF 底部控制条：`Previous`、`Next`、`Single`、`Double`、页码输入、缩放加减和 `Fit width`。
  - 增加窄屏和专注模式 CSS，双页偏好在窄屏下实际回退单页但保留用户选择。
  - 扩展 App Vitest mock 和覆盖 PDF 打开、单/双页切换、页码跳转、缩放、适合宽度、进度恢复与保存。
- 创建/修改的文件：
  - `apps/desktop/src/App.css`
  - `apps/desktop/src/App.test.tsx`
  - `apps/desktop/src/App.tsx`
  - `apps/desktop/src/components/ReaderShell.tsx`
  - `task_plan.md`
  - `findings.md`
  - `progress.md`
- 验证：
  - `pnpm.cmd --filter @reader/desktop lint` 通过。
  - `pnpm.cmd --filter @reader/desktop test -- App.test.tsx PdfReaderAdapter.test.ts` 通过，28 tests。
  - `pnpm.cmd --filter @reader/desktop build` 通过。

### 阶段 4.3：PDF outline
- **状态：** complete
- **分支：** `codex/stage4-pdf-outline`
- 执行的操作：
  - 从 `codex/v0.1.0-mvp-integration` 创建 `codex/stage4-pdf-outline`。
  - 扩展 `PdfReaderAdapter.getToc()`，优先读取 PDF.js `getOutline()`。
  - 支持命名 destination 经 `getDestination()` 解析，页引用经 `getPageIndex()` 转换为 1-based `PdfLocator.page`。
  - 无 outline 或 outline 不可定位时，降级为 `Page 1...Page N` 页码目录。
  - 扩展 adapter Vitest 覆盖嵌套 outline、命名 destination、显式 destination 和页码 fallback。
- 创建/修改的文件：
  - `apps/desktop/src/pdf/PdfReaderAdapter.ts`
  - `apps/desktop/src/pdf/PdfReaderAdapter.test.ts`
  - `task_plan.md`
  - `findings.md`
  - `progress.md`
- 验证：
  - `pnpm.cmd --filter @reader/desktop test -- PdfReaderAdapter.test.ts` 通过，30 tests。
  - `pnpm.cmd --filter @reader/desktop lint` 通过。
  - `pnpm.cmd --filter @reader/desktop build` 通过。

### 阶段 4.4：PDF 进度恢复
- **状态：** complete
- **分支：** `codex/stage4-pdf-progress`
- 执行的操作：
  - 从 `codex/v0.1.0-mvp-integration` 创建 `codex/stage4-pdf-progress`。
  - 在 Rust `Locator` enum 新增 `Pdf(PdfLocator)`，补齐 `PdfLocator`、`PdfZoomMode` 和 `PdfRect` 的 serde 模型。
  - 放开 PDF 书籍保存进度，按格式拒绝 TXT/EPUB/PDF locator 混用。
  - 归一化 PDF `page >= 1`、`scale` 到 `0.5..3.0`、过滤非法 rect；非有限 `progress` 置空。
  - 将前端 `saveReadingProgress` Tauri invoke 返回类型改为通用 `ReaderProgress<Locator>`。
  - 新增 Rust 单测覆盖 PDF 进度持久化、格式不匹配拒绝和归一化。
- 创建/修改的文件：
  - `apps/desktop/src-tauri/src/db.rs`
  - `apps/desktop/src/tauri/reader.ts`
  - `task_plan.md`
  - `findings.md`
  - `progress.md`
- 验证：
  - `cargo fmt --manifest-path apps\desktop\src-tauri\Cargo.toml` 通过。
  - `pnpm.cmd --filter @reader/core build` 通过。
  - `pnpm.cmd --filter @reader/desktop build` 通过。
  - `cargo test --manifest-path apps\desktop\src-tauri\Cargo.toml` 通过，22 tests。
  - `pnpm.cmd --filter @reader/desktop lint` 通过。
  - `pnpm.cmd --filter @reader/desktop test -- App.test.tsx PdfReaderAdapter.test.ts` 通过，30 tests。

### 阶段 4.5：PDF 标注策略
- **状态：** complete
- **分支：** `codex/stage4-pdf-annotation-spike`
- 执行的操作：
  - 从 `codex/v0.1.0-mvp-integration` 创建 `codex/stage4-pdf-annotation-spike`。
  - 检查本地 PDF.js 类型，确认 `getTextContent()`、`TextLayer` 和 `PageViewport` 坐标转换接口可用于后续文本层和高亮 overlay。
  - 在 `findings.md` 记录 PDF 标注策略：阶段 4 不交付用户可见 CRUD；阶段 5 先补文本层，再做 PDF 坐标系 rect 保存和重放。
  - 记录风险：canvas-only 无法可靠选择文本、扫描版 PDF 无文本层、旋转/裁剪页面需要坐标测试、跨页选择需要拆分为多页 rects。
- 创建/修改的文件：
  - `findings.md`
  - `task_plan.md`
  - `progress.md`
- 验证：
  - 文档策略阶段，无用户可见代码变更；提交前执行 `git diff --check`。

### 阶段 4 验收测试补齐：PDF smoke
- **状态：** complete
- **分支：** `codex/stage4-pdf-e2e-smoke`
- 执行的操作：
  - 新增 Playwright PDF smoke，运行时生成最小 3 页 PDF Blob，不提交二进制 fixture。
  - 验证书架打开 PDF、PDF canvas 非空、页码跳转、`Double` 双页、`Fit width` 缩放和返回书架。
  - 修复 PDF reader 卸载/ResizeObserver 竞态：卸载时先清空 adapter ref 再 close，并保护 resize callback。
- 创建/修改的文件：
  - `apps/desktop/src/components/ReaderShell.tsx`
  - `apps/desktop/tests/smoke.spec.ts`
  - `findings.md`
  - `progress.md`
- 验证：
  - `pnpm.cmd --filter @reader/desktop lint` 通过。
  - `pnpm.cmd --filter @reader/desktop test:e2e` 通过，5 tests。

### 阶段 4 最终验收
- **状态：** complete
- **分支：** `codex/v0.1.0-mvp-integration`
- 验证：
  - `pnpm.cmd install` 通过，lockfile up to date。
  - `pnpm.cmd --filter @reader/core build` 通过。
  - `pnpm.cmd --filter @reader/desktop lint` 通过。
  - `pnpm.cmd --filter @reader/desktop test` 通过，30 tests。
  - `pnpm.cmd --filter @reader/desktop build` 通过。
  - `cargo test --manifest-path apps\desktop\src-tauri\Cargo.toml` 通过，22 tests。
  - `pnpm.cmd --filter @reader/desktop test:e2e` 通过，5 Chromium smoke tests。
  - Playwright 视觉检查通过：`D:\tl-temp\ebook-reader-stage4-pdf-desktop.png`、`D:\tl-temp\ebook-reader-stage4-pdf-mobile-375x760.png`；desktop 双页 `Pages 1-2 / 3`、mobile 375x760 回退单页 `Page 1 / 3`，canvas 像素非空，console 无 warning/error。
  - `pnpm.cmd --filter @reader/desktop tauri:build` 通过，生成 release exe、MSI、NSIS installer。
- 说明：
  - 本轮未使用 in-app Browser 工具；当前会话只暴露了 node_repl/Playwright 能力，因此视觉检查使用 Playwright fallback。

## 会话：2026-06-20

### 阶段 3.x：EPUB 导航与进度优化
- **状态：** complete
- **开始时间：** 2026-06-20
- 执行的操作：
  - 从最新 `main` 快进 `codex/v0.1.0-mvp-integration`，创建 `codex/stage3-epub-navigation-optimization`。
  - 扩展 `EpubReaderAdapter`：打开后后台生成 epub.js locations，新增 `EpubPosition`、`previewProgress`、`goToProgress`、`setSpreadMode` 和 resize fallback。
  - 将 EPUB 百分比和页码改为基于全书合成 locations：`page = location index + 1`、`totalPages = locations.length()`。
  - 将 EPUB 上一页、下一页、页码、百分比和单/双页切换移到正文下方。
  - 新增视频式横向进度条；拖动期间只预览 CFI、页码和 TOC active 状态，松手后调用一次跳转。
  - 移除 `captureSelection` 中清空选区的 `removeAllRanges()`，并在 EPUB iframe CSS 中允许 `user-select: text`。
  - 扩展 Vitest 覆盖底部控件、locations ready 后 slider 启用、拖动预览、松手跳转、单双页切换和页码百分比显示。
  - 扩展 Playwright EPUB smoke：运行时生成更长的无版权 EPUB fixture，验证进度条、双页按钮和 iframe 选中文本保留。
- 创建/修改的文件：
  - `apps/desktop/src/App.css`
  - `apps/desktop/src/App.test.tsx`
  - `apps/desktop/src/components/ReaderShell.tsx`
  - `apps/desktop/src/epub/EpubReaderAdapter.ts`
  - `apps/desktop/src/epub/EpubReaderAdapter.test.ts`
  - `apps/desktop/tests/smoke.spec.ts`
  - `task_plan.md`
  - `findings.md`
  - `progress.md`
- 最终验证：
  - `pnpm.cmd install` 通过。
  - `pnpm.cmd --filter @reader/core build` 通过。
  - `pnpm.cmd --filter @reader/desktop lint` 通过。
  - `pnpm.cmd --filter @reader/desktop test -- --run` 通过，22 tests。
  - `pnpm.cmd --filter @reader/desktop build` 通过。
  - `cargo test --manifest-path apps\desktop\src-tauri\Cargo.toml` 通过，21 tests。
  - `pnpm.cmd --filter @reader/desktop test:e2e` 通过，4 Chromium smoke tests。
  - Playwright 视觉检查通过，截图：`D:\tl-temp\ebook-reader-stage3-opt-epub-desktop.png`、`D:\tl-temp\ebook-reader-stage3-opt-epub-narrow.png`。
  - `pnpm.cmd --filter @reader/desktop tauri:build` 通过，生成 release exe、MSI、NSIS installer。
- 遇到的问题：
  - E2E 首次发现 `rendition.resize()` 在 `display()` 完成前调用会导致 `Cannot read properties of undefined (reading 'resize')`；已增加 manager-ready 保护。
  - E2E 随后发现 `display()` 前主动读取 `currentLocation()` 会触发 pageerror；已改为只有已有位置后才在 spread/resize 后重新报告当前位置。

### 产品大阶段 3：EPUB 阅读器启动
- **状态：** in_progress
- **开始时间：** 2026-06-20
- 执行的操作：
  - 读取 Build Web Apps React 性能实践、前端测试调试说明和现有 `task_plan.md` / `findings.md` / `progress.md`。
  - 检查 `main` 工作区干净且与 `origin/main` 对齐。
  - 设置本地 Git 身份为 `aaaaa-ozo23` / `aaaaa-ozo23@users.noreply.github.com`。
  - 将 `codex/v0.1.0-mvp-integration` 快进到当前 `main`。
  - 创建 `codex/stage3-epub-adapter` 分支。

### 阶段 3.1：EPUB 适配器
- **状态：** complete
- **开始时间：** 2026-06-20
- 执行的操作：
  - 安装 `epubjs@0.3.93` 到 `@reader/desktop`。
  - 新增 `EpubReaderAdapter`，通过动态 import 封装 epub.js open/close/TOC/goTo/currentLocator/theme/selection/highlight 能力。
  - 在 `tauri/reader.ts` 新增 `getEpubBookSource`，Tauri runtime 使用 `convertFileSrc(book.libraryPath)`，浏览器 fallback 使用显式 localStorage source fixture。
  - 启用 Tauri asset protocol，scope 限定为 `$APPDATA/library/**`，并为 Rust `tauri` 依赖开启 `protocol-asset` feature。
  - 更新 `pnpm-workspace.yaml` 的 allowBuilds，记录 `core-js`、`es5-ext` 和既有 `esbuild`。
- 创建/修改的文件：
  - `apps/desktop/package.json`
  - `apps/desktop/src-tauri/Cargo.toml`
  - `apps/desktop/src-tauri/Cargo.lock`
  - `apps/desktop/src-tauri/tauri.conf.json`
  - `apps/desktop/src/components/ReaderShell.tsx`
  - `apps/desktop/src/epub/EpubReaderAdapter.ts`
  - `apps/desktop/src/tauri/reader.ts`
  - `pnpm-lock.yaml`
  - `pnpm-workspace.yaml`
  - `task_plan.md`
  - `findings.md`
  - `progress.md`
- 验证：
  - `pnpm.cmd --filter @reader/core build` 通过。
  - `pnpm.cmd --filter @reader/desktop lint` 通过。
  - `pnpm.cmd --filter @reader/desktop build` 通过。
  - `cargo test --manifest-path apps\desktop\src-tauri\Cargo.toml` 通过，20 tests。

### 阶段 3.2：EPUB 阅读 UI
- **状态：** complete
- **开始时间：** 2026-06-20
- 执行的操作：
  - 将 `ReaderShell` 拆成通用阅读壳、TXT 内容层和 EPUB 内容层，保留主题面板、目录侧栏、顶部栏和专注模式。
  - 修改书架打开逻辑：TXT 和 EPUB 进入阅读器，PDF 保留后续阶段提示。
  - 新增 EPUB 内容层，提供固定 host、上一页/下一页、目录跳转、加载态和错误态。
  - 为 EPUB adapter 增加 `previous()` / `next()` 方法，供 UI 翻页按钮调用。
  - 修复 EPUB TOC state 更新导致 adapter 打开 effect 重复执行的问题。
- 创建/修改的文件：
  - `apps/desktop/src/App.css`
  - `apps/desktop/src/App.test.tsx`
  - `apps/desktop/src/App.tsx`
  - `apps/desktop/src/components/ReaderShell.tsx`
  - `apps/desktop/src/epub/EpubReaderAdapter.ts`
  - `task_plan.md`
  - `findings.md`
  - `progress.md`
- 验证：
  - `pnpm.cmd --filter @reader/desktop test` 通过，15 tests。
  - `pnpm.cmd --filter @reader/desktop lint` 通过。
  - `pnpm.cmd --filter @reader/desktop build` 通过。

### 阶段 3.3：EPUB 主题映射
- **状态：** complete
- **开始时间：** 2026-06-20
- 执行的操作：
  - 将 EPUB iframe 主题 CSS 映射扩展到 `html`、`body`、正文容器、段落、链接、选区和高亮类。
  - 将 `ReaderTheme` 的字体、字号、行高、段距、页边距、背景、文本色和暗色链接色映射到 epub.js themes。
  - 保持主题面板改动即时调用 EPUB adapter `setTheme`，不重开 EPUB。
  - 新增纯映射测试和 EPUB UI 主题变更测试。
- 创建/修改的文件：
  - `apps/desktop/src/App.test.tsx`
  - `apps/desktop/src/epub/EpubReaderAdapter.ts`
  - `apps/desktop/src/epub/EpubReaderAdapter.test.ts`
  - `task_plan.md`
  - `findings.md`
  - `progress.md`
- 验证：
  - `pnpm.cmd --filter @reader/desktop test` 通过，17 tests。
  - `pnpm.cmd --filter @reader/desktop lint` 通过。
  - `pnpm.cmd --filter @reader/desktop build` 通过。

### 阶段 3.4：EPUB 进度恢复
- **状态：** complete
- **开始时间：** 2026-06-20
- 执行的操作：
  - 将 Rust 后端 `ReaderProgress.locator` 从 `TxtLocator` 改为通用 `Locator` enum，支持 `txt` 和 `epub`。
  - 保持 `reading_progress` SQLite 表不迁移，继续存储 `locator_json`。
  - `save_reading_progress` 按书籍格式校验 locator kind：TXT 只接受 TXT locator，EPUB 只接受 EPUB locator，PDF 仍不支持。
  - EPUB locator 支持 `href`、`cfi`、`progression`，保存时规范化 `progression` 和 progress 到 `0..1`。
  - 前端测试覆盖 EPUB 打开时恢复 CFI locator，以及 relocated 后保存 EPUB locator。
- 创建/修改的文件：
  - `apps/desktop/src-tauri/src/db.rs`
  - `apps/desktop/src-tauri/src/lib.rs`
  - `apps/desktop/src/App.test.tsx`
  - `task_plan.md`
  - `findings.md`
  - `progress.md`
- 验证：
  - `cargo fmt --manifest-path apps\desktop\src-tauri\Cargo.toml` 通过。
  - `cargo test --manifest-path apps\desktop\src-tauri\Cargo.toml` 通过，21 tests。
  - `pnpm.cmd --filter @reader/desktop test` 通过，18 tests。
  - `pnpm.cmd --filter @reader/desktop lint` 通过。
  - `pnpm.cmd --filter @reader/desktop build` 通过。

### 阶段 3.5：EPUB 高亮预研
- **状态：** complete
- **开始时间：** 2026-06-20
- 执行的操作：
  - 复核 `EpubReaderAdapter` 中 `selected`、`book.getRange(cfiRange)`、`rendition.annotations.highlight/remove` 的接入点。
  - 未落地完整标注 CRUD，避免阶段 3 扩大到统一标注表和重放生命周期。
  - 在 `findings.md` 写入 CFI、选中文本、上下文、高亮重放限制和阶段 5 建议。
- 创建/修改的文件：
  - `task_plan.md`
  - `findings.md`
  - `progress.md`
- 验证：
  - `pnpm.cmd --filter @reader/desktop test` 通过，18 tests。

### 阶段 3：EPUB E2E smoke 补齐
- **状态：** complete
- **开始时间：** 2026-06-20
- 执行的操作：
  - 在 EPUB adapter 打开参数中显式设置 `openAs: "epub"`，让 Blob URL 和 Tauri asset URL 都按归档 EPUB 处理。
  - 在 Playwright smoke 中运行时生成无版权最小 EPUB ZIP Blob，不提交二进制书籍文件。
  - 覆盖从书架打开 EPUB、目录跳转、主题切换、返回书架，以及 console warning/error 收集。
- 创建/修改的文件：
  - `apps/desktop/src/epub/EpubReaderAdapter.ts`
  - `apps/desktop/tests/smoke.spec.ts`
  - `findings.md`
  - `progress.md`
- 验证：
  - `pnpm.cmd --filter @reader/desktop lint` 通过。
  - `pnpm.cmd --filter @reader/desktop test:e2e` 通过，4 Chromium smoke tests。
  - `pnpm.cmd --filter @reader/desktop test` 通过，18 tests。
  - `pnpm.cmd --filter @reader/desktop build` 通过。

### 阶段 3：EPUB 响应式视觉修复
- **状态：** complete
- **开始时间：** 2026-06-20
- 执行的操作：
  - Playwright 视觉检查发现主题面板打开时会覆盖 EPUB host。
  - 新增 `reader-shell--theme-open` 布局状态，桌面为固定主题面板预留右侧空间。
  - 窄屏下主题面板改为静态 grid 行，阅读视口排在主题面板之后，避免重叠和内容列变窄。
- 创建/修改的文件：
  - `apps/desktop/src/App.css`
  - `apps/desktop/src/components/ReaderShell.tsx`
  - `findings.md`
  - `progress.md`
- 验证：
  - `pnpm.cmd --filter @reader/desktop lint` 通过。
  - `pnpm.cmd --filter @reader/desktop test` 通过，18 tests。
  - `pnpm.cmd --filter @reader/desktop build` 通过。
  - `pnpm.cmd --filter @reader/desktop test:e2e` 通过，4 Chromium smoke tests。
  - Playwright 视觉截图：桌面和 375x760 窄屏 EPUB 阅读器无 Vite overlay、无 console warning/error，主题面板与 EPUB host 不重叠。

### 阶段 3：最终验收
- **状态：** complete
- **开始时间：** 2026-06-20
- 执行的操作：
  - 在 `codex/v0.1.0-mvp-integration` 上运行大阶段 3 全量验收。
  - 使用 Playwright 视觉检查生成桌面和 375x760 窄屏 EPUB 阅读器截图。
  - 运行 `pnpm.cmd --filter @reader/desktop tauri:build`，生成 release exe、MSI、NSIS installer。
- 验证：
  - `pnpm.cmd install` 通过。
  - `pnpm.cmd --filter @reader/core build` 通过。
  - `pnpm.cmd --filter @reader/desktop lint` 通过。
  - `pnpm.cmd --filter @reader/desktop test` 通过，18 tests。
  - `pnpm.cmd --filter @reader/desktop build` 通过。
  - `cargo test --manifest-path apps\desktop\src-tauri\Cargo.toml` 通过，21 tests。
  - `pnpm.cmd --filter @reader/desktop test:e2e` 通过，4 Chromium smoke tests。
  - Playwright 视觉检查通过：`D:\tl-temp\ebook-reader-stage3-epub-desktop-final.png`、`D:\tl-temp\ebook-reader-stage3-epub-narrow-final.png`。
  - `pnpm.cmd --filter @reader/desktop tauri:build` 通过。

### 阶段 1/2 修复优化启动
- **状态：** complete
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

### 阶段 2.x：TXT 阅读器性能与主题修复
- **状态：** complete
- **开始时间：** 2026-06-20
- 执行的操作：
  - 在 `ReaderShell` 中为虚拟块建立章节索引、全局 charOffset 索引和按章节分组的 charOffset 索引。
  - 进度恢复改为优先按 `charOffset` 定位到章节内接近段落；目录跳转改为使用章节索引。
  - 程序化恢复和目录跳转使用 instant scroll，并短暂抑制由程序化滚动触发的保存。
  - 滚动时只记录 pending progress，滚动 idle 后再保存，避免滚动过程中频繁 setState 和写数据库。
  - 使用 `requestAnimationFrame` 同步当前 active chapter，目录按钮增加 `aria-current="location"` 和 active 样式。
  - 移除 `.reader-viewport` 的 smooth scrolling。
  - 将阅读器 topbar、书名、章节名、meta、主题面板等颜色改为主题 CSS 变量，修复 dark 主题可读性。
  - 扩展 Playwright smoke：右键移除、长 TXT 多章节、目录跳转、dark 主题 heading 变量、滚动后 active TOC。
  - 使用 Browser 插件检查 `http://127.0.0.1:1420/` 桌面和 375x760 窄屏 DOM/console/style metrics。
  - Browser 截图命令超时后，使用 Playwright CLI 在仓库外生成并查看桌面/窄屏截图。
- 创建/修改的文件：
  - `apps/desktop/src/App.css`
  - `apps/desktop/src/App.test.tsx`
  - `apps/desktop/src/components/ReaderShell.tsx`
  - `apps/desktop/tests/smoke.spec.ts`
  - `task_plan.md`
  - `findings.md`
  - `progress.md`
- 验证：
  - `pnpm.cmd --filter @reader/core build` 通过。
  - `pnpm.cmd --filter @reader/desktop test` 通过，14 tests。
  - `pnpm.cmd --filter @reader/desktop lint` 通过。
  - `pnpm.cmd --filter @reader/desktop build` 通过。
  - `cargo test --manifest-path apps\desktop\src-tauri\Cargo.toml` 通过，20 tests。
  - `pnpm.cmd --filter @reader/desktop test:e2e` 通过，3 tests。
  - Browser QA metrics 通过：桌面和窄屏首屏存在书架 main、空状态、导入按钮，无 Vite overlay，无 console warning/error，导入 icon 垂直中心偏移为 0。
  - Playwright 截图：`D:\tl-temp\ebook-reader-stage2-shelf-desktop.png`、`D:\tl-temp\ebook-reader-stage2-shelf-narrow.png` 已人工查看。

### 阶段 1/2 修复优化最终验收
- **状态：** complete
- **开始时间：** 2026-06-20
- 执行的操作：
  - 将 `codex/stage1-book-actions-remove` 合并回 `codex/v0.1.0-mvp-integration`。
  - 将 `codex/stage2-txt-reader-polish` 合并回 `codex/v0.1.0-mvp-integration`。
  - 在集成分支运行阶段 1/2 修复优化全量验收。
  - 运行 `pnpm.cmd --filter @reader/desktop tauri:build`，生成 release exe、MSI、NSIS installer。
- 验证：
  - `pnpm.cmd install` 通过。
  - `pnpm.cmd --filter @reader/core build` 通过。
  - `pnpm.cmd --filter @reader/desktop lint` 通过。
  - `pnpm.cmd --filter @reader/desktop test` 通过，14 tests。
  - `pnpm.cmd --filter @reader/desktop build` 通过。
  - `cargo test --manifest-path apps\desktop\src-tauri\Cargo.toml` 通过，20 tests。
  - `pnpm.cmd --filter @reader/desktop test:e2e` 通过，3 Chromium smoke tests。
  - Browser QA metrics 通过。
  - `pnpm.cmd --filter @reader/desktop tauri:build` 通过。

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
| 2026-06-30 | 阶段 7 首次备份 Local AppData 时 WebView2 `Cookies` 文件被占用 | 1 | 保留原数据不清理；定位并关闭仅属于 Ebook Reader 的 WebView2 进程，改用新的备份目录重新完整复制和核验 |
| 2026-06-30 | Image Gen 色键处理与 `tauri icon --help` 合并命令超时 | 1 | 分离检查透明 PNG 与 Tauri CLI 调用，若去背产物有效则不重复处理 |
| 2026-06-30 | NSIS 安装后 QA 脚本使用 `Get-ChildItem -File` 被当前 PowerShell 拒绝 | 1 | 安装已成功，改用 `Where-Object { -not $_.PSIsContainer }` 从当前安装状态继续，不重复安装 |
| 2026-06-30 | NSIS 注册表 `InstallLocation` 包含外层引号，脚本将 `"C:` 误判为驱动器 | 1 | 对 InstallLocation 与 UninstallString 显式 `Trim('"')` 后继续当前安装验证 |
| 2026-06-30 | MSI 0.1.0 使用默认静默参数安装返回 1603 | 1 | 生成详细 MSI 日志并尝试显式 per-user 属性，按日志根因修正配置或安装参数 |
| 2026-06-30 | 文件关联测试导致既有 TXT mock 污染及新增 viewport 断言错误 | 3 | 恢复下一 tick 初始化、等待新增用例消费异步 TXT mock，并将 aria-label 断言修正为实际的“书名 + content” |
| 2026-06-30 | 7.3 探索时读取了不存在的 `src/tauri/runtime.ts` | 1 | 现有 runtime 检测实际位于各 bridge 文件内；新增文件关联 bridge 沿用同一轻量检测模式 |
| 2026-06-30 | NSIS 0.0.0 → 0.1.0 自动化脚本中途无 stdout 以 -1 结束 | 1 | 保留当前安装和 QA 数据，先读取注册表、进程与 SQLite 摘要定位停止阶段，再从现状继续而非盲目重跑 |
| 2026-06-30 | 升级 QA 书签 INSERT 通过 PowerShell 参数传递时 JSON 引号被破坏 | 1 | 不改备份；改为将完整 SQL 通过标准输入交给 sqlite3，并在继续前核对 bookmarks=1 |
| 2026-07-01 | MSI 升级后快照脚本通过 PowerShell 标准输入发送 `.mode json` 时带入 BOM，SQLite 未执行查询 | 1 | 数据未写入；改用 `sqlite3 -json <db> <query>` 参数输出 JSON 后重新比对 |
| 2026-07-01 | MSI 首次对比误用了被后续 NSIS/文件关联 QA 改写的工作数据库 | 1 | 核对快照与 SQLite 文件时间，卸载并清空 QA 环境，从只读原始备份重新独立执行 MSI 升级 |
| 2026-07-01 | Node/pnpm 路径探测中递归搜索版本管理目录超时 | 1 | 已由 `where.exe`、`node --version` 和显式路径定位 Node 26.1.0；发布命令将 `%APPDATA%\npm` 与 `C:\Program Files\nodejs` 置于 PATH 最前 |
| 2026-07-01 | Browser QA 按测试技能示例调用 `tab.playwright.screenshot`，当前 Browser runtime 未提供该方法 | 1 | 交互状态已生效；按 Browser 完整 API 改用 `tab.screenshot({ fullPage: false })` 继续取证 |
| 2026-07-01 | 发布候选 MSI 元数据读取在 Windows Installer COM `OpenDatabase` 处报 `DISP_E_TYPEMISMATCH` | 1 | 产物已生成且未开始安装；将路径/模式显式转为 string/int 并用 BindingFlags 调用，必要时核对 WiX 生成源 |
| 2026-07-01 | 最终产物脚本读取 annotated tag 时，`^{commit}` 花括号参数被 PowerShell 异常编码，`git show` 又包含 tagger 文本 | 2 | 未读写产物；改用只输出提交时间的 `git log -1 --format=%cI v0.1.0` |
| 2026-07-01 | 最终 NSIS 安装后额外断言安装 EXE 与 `target/release` EXE 哈希相同，实际不同 | 1 | Tauri 依次向 NSIS/MSI payload 写入不同 bundle type 资源，最后留下的 release EXE 为 MSI patch 版；改验证安装来源、0.1.0 版本、时间与空数据状态 |
| 2026-07-01 | Chrome 在 GitHub Release 页中选中正确的多文件 chooser 后，扩展拒绝 `setFiles` 并返回 `Not allowed` | 2 | 保存已填写的 Release 草稿；需用户在 Chrome 扩展详情中开启 Codex 的“允许访问文件 URL”后继续上传 |
| 2026-07-01 | GitHub API 已核对附件，但 Windows PowerShell `Invoke-WebRequest` 下载远程 `SHA256SUMS.txt` 时触发空引用 | 1 | 发布状态未受影响；改用 `curl.exe -L` 只读下载文本并与本地最终文件比对 |

## 2026-06-30 大阶段 7：Windows 打包与 v0.1.0 首版发布

### 状态
- **当前状态：** complete
- **当前小阶段：** 7.5 发布清单与 GitHub Release

### 发布前保护
- 保存当前 0.0.0 MSI 与 NSIS 到 `D:\tl-temp\ebook-reader-stage7-backup-20260630-225613\upgrade-fixtures`。
- 关闭仅属于 Ebook Reader 的 release/WebView2 进程后，完整备份 Roaming 与 Local 应用数据。
- 核对 Roaming 6 文件 / 21,505,580 bytes，Local 362 文件 / 39,615,213 bytes，备份一致后清空原目录。
- 备份清单与旧安装包 SHA-256 位于 `D:\tl-temp\ebook-reader-stage7-backup-20260630-225613\backup-manifest.json`。

### 阶段 7.1：应用元信息与正式图标
- **状态：** complete
- **分支：** `codex/stage7-app-metadata`
- 将根 package、desktop package、Cargo 和 Tauri 版本统一为 `0.1.0`，新增 `pnpm.cmd run verify:release` 一致性门禁。
- 使用 Image Gen 内置模式生成暖橙开放书页/深灰书脊、无文字、绿色色键背景的正式源图；用技能自带脚本去背为 `icons/app-icon-v0.1.0.png`。
- Tauri CLI 已重建 ICO、ICNS、Windows Appx PNG、32/128/256 图标；移除本阶段额外生成且未使用的 Android/iOS 目录。
- 视觉验证：透明四角、主体覆盖范围、32×32 和 128×128 小尺寸辨识度通过。
- 验证：`pnpm.cmd run verify:release`、`pnpm.cmd run format`、`pnpm.cmd --filter @reader/desktop build` 通过。

### 阶段 7.2：Windows installer
- **状态：** complete
- **分支：** `codex/stage7-windows-installer`
- Tauri bundle 目标明确为 NSIS + MSI，publisher 为 `Ebook Reader Contributors`，禁止降级，NSIS 固定 currentUser，WebView2 采用静默 downloadBootstrapper。
- 清理限定在工作区 release EXE、bundle、NSIS/WiX 中间目录后执行完整 Tauri release build。
- 构建成功：`ebook-reader-desktop.exe`、`Ebook Reader_0.1.0_x64-setup.exe`、`Ebook Reader_0.1.0_x64_en-US.msi`。
- EXE/NSIS FileVersion 与 ProductVersion 均为 0.1.0；MSI ProductName、ProductVersion、Manufacturer、ProductCode、UpgradeCode 已通过 Windows Installer API 核对。
- NSIS 安装、启动空书架数据库（books=0）、静默卸载通过。
- MSI 使用 `ALLUSERS=2 MSIINSTALLPERUSER=1` 安装、启动空书架数据库（books=0）、静默卸载通过。
- 两种安装测试结束后均清理本轮 QA AppData；原用户数据备份未恢复。

### 阶段 7.3：文件关联
- **状态：** complete
- **分支：** `codex/stage7-file-associations`
- Tauri bundle 注册 EPUB、TXT、PDF ProgID、MIME、Viewer role 和 Windows 描述。
- Rust 新增 pending open queue 与 frontend-ready 握手；冷启动参数先入队，运行中第二实例聚焦主窗口并发送 `open-book-files`。
- 前端新增动态 event bridge；监听建立后加载书库，再取冷启动队列；路径去重后按序导入，首个成功项立即打开，duplicate 复用已有书籍，失败显示可恢复错误。
- React StrictMode 下沿用下一 tick 初始化与 cleanup 清理，避免重复订阅和重复书库加载。
- 自动验证：71 Vitest、34 Rust tests、desktop lint/build、format、release version gate 全部通过。
- 原生验证：NSIS 注册表三种关联存在；EPUB Shell 冷启动成功；TXT/PDF 运行中第二实例传递成功且主进程数保持 1；重复 TXT 不新增记录并更新最后打开时间。
- QA fixture 仅位于 `D:\tl-temp\ebook-reader-stage7-file-association-qa`，不会进入仓库或安装包。

### 阶段 7.4：升级验证
- **状态：** complete
- **分支：** `codex/stage7-upgrade-check`
- NSIS 0.0.0 → 0.1.0 覆盖安装通过；新版启动后 schema=3、books=4、progress=4、bookmarks=1、annotations=64、active annotations=9、settings=2，与升级前一致，4 个书库副本均存在。
- MSI 使用 `ALLUSERS=2 MSIINSTALLPERUSER=1` 完成 0.0.0 → 0.1.0 major upgrade；旧 ProductCode 移除，新 EXE FileVersion/ProductVersion 为 0.1.0。
- MSI 从原始备份独立重跑：安装后未启动时、启动新版后的数据快照均与旧版启动后基线完全相等，书库缺失文件为 0。
- QA 安装已卸载，Roaming/Local QA 数据已再次清空；仓库外原始备份保持不变。
- **下一步：** 合入集成分支后创建 `codex/stage7-release-checklist`，补齐 MIT、CHANGELOG、第三方许可、发布检查和 README。

### 阶段 7.5：发布清单
- **状态：** complete
- **分支：** `codex/stage7-release-checklist`
- 新增 MIT `LICENSE`，并为 root/desktop/core package 与 Cargo package 补齐 `MIT` SPDX 字段。
- 新增 `CHANGELOG.md`、`THIRD_PARTY_NOTICES.md`、`RELEASE_CHECKLIST.md`；README 已补充 NSIS/MSI 下载、SmartScreen、校验值、覆盖升级、卸载和 AppData 位置。
- pnpm 许可审计 285 包，无 unknown group；Cargo metadata 审计 487 包，补齐工作区包许可后 missing=0。
- `verify:release` 已扩展检查 MIT 字段、EPUB/TXT/PDF 关联、正式图标源图和发布文档，当前通过。
- 全量代码门禁使用 Node 26.1.0 / pnpm 11.1.2 通过：冻结安装、format、release verify、core build、desktop lint/build、71 Vitest、34 Rust tests、8 Playwright tests。
- Build Web Apps Browser QA 通过：页面身份为 Ebook Reader，空书架非空白、无 overlay/控制台告警，List/Grid 切换状态正确；1280×720 和 375×760 截图已保存到仓库外。
- 已合入 `codex/v0.1.0-mvp-integration` 并创建 `release/v0.1.0`；候选分支上的干净 Tauri build 生成最新 release EXE、NSIS 和 MSI。
- 候选原生检查通过：MSI ProductVersion=0.1.0 且 UpgradeCode 稳定；NSIS 安装的应用首启 books=0、library 书籍文件=0，当前本机保留空书架 v0.1.0。
- `main`、`release/v0.1.0`、`codex/v0.1.0-mvp-integration` 和注解标签 `v0.1.0` 已推送；标签目标为 main 提交 `9e27e93a6ec6552772eba10f86b731a84a627e85`。
- 最终标签后干净构建生成 EXE 15,825,920 bytes、NSIS 5,726,938 bytes、MSI 7,237,632 bytes，三者均为 0.1.0 且时间晚于标签提交。
- GitHub Release `Ebook Reader v0.1.0` 已以 Latest、非预发布状态发布：`https://github.com/aaaaa-ozo23/ebook-reader/releases/tag/v0.1.0`。
- GitHub API 确认 3 个 uploaded 附件：`Ebook.Reader_0.1.0_x64-setup.exe` 5,726,938 bytes、`Ebook.Reader_0.1.0_x64_en-US.msi` 7,237,632 bytes、`SHA256SUMS.txt` 198 bytes；远程校验文件与本地一致。
- 正式 NSIS v0.1.0 保持安装，书架 books=0、library 书籍文件=0；发布前用户数据备份仍位于 `D:\tl-temp\ebook-reader-stage7-backup-20260630-225613`。
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
| 2026-06-20 | 阶段 2.x Vitest 发现 jsdom 中 `scrollIntoView` 不存在，ReaderSidebar effect 抛错 | 1 | 对 `activeItemRef.current.scrollIntoView` 增加函数存在性检查 |
| 2026-06-20 | 阶段 2.x ESLint 报 `react-hooks/set-state-in-effect`，指向 active chapter 初始化 effect | 1 | 删除该 effect，改在 TXT 文档加载完成时设置初始 active chapter |
| 2026-06-20 | Browser 插件对本地页截图调用超时 | 1 | 继续使用 Browser DOM/console/style metrics，并用 Playwright CLI 在仓库外生成截图 |
| 2026-06-20 | PowerShell 不接受本次 `git add ... && git commit ...` 命令分隔符 | 1 | 改为分两条命令执行 |
| 2026-06-20 | 阶段 3.2 EPUB 内容层测试触发 `Maximum update depth exceeded` | 1 | 将 relocated 回调对 TOC 的读取改为 ref，避免 TOC state 更新导致 EPUB open effect 重复执行 |

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

## 2026-06-20 阶段 3.x EPUB Focus 与最后页修复

### 状态
- **当前状态：** complete
- **分支：** `codex/stage3-epub-focus-last-page-fix`

### 执行的操作
- 设置本地 Git 身份为 `aaaaa-ozo23 <aaaaa-ozo23@users.noreply.github.com>`。
- 从 `main` 同步 `codex/v0.1.0-mvp-integration`，并创建阶段修复分支。
- 阅读 EPUB adapter、ReaderShell、EPUB CSS 和 Playwright smoke，定位 Focus 底部留白和最后页 Next 边界。
- 调整 EPUB Focus 模式布局：缩小隐藏 chrome 后的视口底部 padding，扩大 EPUB 页面高度，并压缩底部控制条间距。
- 调整 EPUB adapter：在倒数第二页及之后点击 Next 时，使用已生成 locations 的最后一个 CFI 补偿跳转；普通翻页保留 epub.js 原生路径。
- 为 Next 最后一页边界补充单元测试和 Playwright smoke 步骤。

### 已通过验证
- `pnpm.cmd install`
- `pnpm.cmd --filter @reader/core build`
- `pnpm.cmd --filter @reader/desktop lint`
- `pnpm.cmd --filter @reader/desktop test -- EpubReaderAdapter.test.ts`
- `pnpm.cmd --filter @reader/desktop test`，23 tests
- `pnpm.cmd --filter @reader/desktop build`
- `cargo test --manifest-path apps\desktop\src-tauri\Cargo.toml`，21 tests
- `pnpm.cmd --filter @reader/desktop test:e2e`，4 tests
- Playwright Focus 视觉检查：`D:\tl-temp\ebook-reader-epub-focus-fix.png`，底部间距 18px，iframe 文本非空，无 console warning/error
- `pnpm.cmd --filter @reader/desktop tauri:build`

## 2026-06-23 阶段 5.x 标注体验优化与 Bug 修复

### 状态
- **当前状态：** complete
- **分支：** `codex/stage5-annotation-polish`

### 执行的操作
- 从最新 `main` 快进同步 `codex/v0.1.0-mvp-integration`，创建 `codex/stage5-annotation-polish`。
- 修复 TXT selection 捕获：支持跨多个已渲染虚拟段落，用 DOM Range 与 row 的交集计算全局 `charOffset/endCharOffset`，不再依赖 `indexOf(selectedText)`。
- 高亮颜色改为 upsert：TXT 用字符范围 overlap，EPUB 用 CFI 或文本上下文匹配，PDF 用同页 rect overlap；命中已有高亮时调用 `updateAnnotation` 改色。
- EPUB selection 增加 iframe range anchor rect，菜单按选区坐标定位；iframe selection clear、跳页、Esc 和外部点击都会关闭菜单/Note 浮层。
- Note 操作改为正文内浮层编辑：选区点击 `Note` 或点击已标注文字时在文字上方显示 textarea，保存时更新已有 note/highlight 或创建 note-only annotation。
- Notes 侧栏改为只读列表，只显示带 note 的记录，保留跳转和删除，不再提供 textarea/Save。
- Note-only 和带 note 的高亮增加可见虚线提示：TXT span、EPUB underline、PDF dashed rect overlay。

### 已通过验证
- `pnpm.cmd install`
- `pnpm.cmd --filter @reader/core build`
- `pnpm.cmd --filter @reader/desktop lint`
- `pnpm.cmd --filter @reader/desktop test`，45 tests
- `pnpm.cmd --filter @reader/desktop build`
- `cargo test --manifest-path apps\desktop\src-tauri\Cargo.toml`，27 tests
- `pnpm.cmd --filter @reader/desktop test:e2e`，5 tests
- Playwright 视觉检查：桌面 `D:\tl-temp\ebook-reader-stage5-annotation-desktop.png`，移动端 `D:\tl-temp\ebook-reader-stage5-annotation-mobile-375x760.png`，正文 Note 浮层可见且不裁切，Notes 侧栏无 textarea/Save，console 无 warning/error
- `pnpm.cmd --filter @reader/desktop tauri:build`

## 2026-06-24 阶段 5.x 标注体验二次修复

### 状态
- **当前状态：** complete
- **分支：** `codex/stage5-annotation-followup`

### 执行的操作
- 从 `main` 创建 `codex/stage5-annotation-followup`，按本轮计划继续修复 TXT/EPUB 标注交互。
- Notes 侧栏显示规则改为列出所有未删除且有高亮或有批注的 annotation；侧栏继续只负责跳转和删除。
- TXT/PDF 正文渲染拆分为视觉高亮和可点击下划线：普通高亮不再绑定点击，只有带 note 的范围显示虚线并可打开批注列表。
- 新增正文 `Saved notes` 浮层：点击下划线后显示同一/重叠范围内所有已保存批注，支持逐条进入编辑，也支持 `Add note` 新增同范围 note。
- 选区菜单 `Note` 行为改为始终创建新的 note 草稿，不覆盖已有高亮或已有 note；高亮改色仍沿用已有 upsert 逻辑。
- EPUB 普通高亮重放不再挂 click handler；note-bearing annotation 通过 underline 绑定批注列表入口。
- EPUB selection anchor 改用 iframe 内 `Range.getClientRects()` 的首个有效 rect，菜单以选区 top 为 anchor 并通过 CSS 贴近文字上方。

### 已通过验证
- `pnpm.cmd install`
- `pnpm.cmd --filter @reader/core build`
- `pnpm.cmd --filter @reader/desktop lint`
- `pnpm.cmd --filter @reader/desktop test -- --run apps/desktop/src/App.test.tsx`，48 tests
- `pnpm.cmd --filter @reader/desktop test`，48 tests
- `pnpm.cmd --filter @reader/desktop build`
- `cargo test --manifest-path apps\desktop\src-tauri\Cargo.toml`，27 tests
- `pnpm.cmd --filter @reader/desktop test:e2e`，5 tests
- Playwright 视觉检查：桌面 `D:\tl-temp\ebook-reader-stage5-followup-desktop.png`，移动端 `D:\tl-temp\ebook-reader-stage5-followup-mobile-375x760.png`；普通高亮点击不弹出，note-bearing 下划线打开多批注浮层，`Add note` 可进入新建编辑器，console 无 warning/error
- `pnpm.cmd --filter @reader/desktop tauri:build`

### 过程问题
- 首次 `tauri:build` 前端构建通过，但 Rust release exe 因 `ebook-reader-desktop.exe` 进程占用而无法删除；结束该 release 进程后重跑打包通过。

## 2026-06-29 阶段 5.x EPUB 标注显示修复

### 状态
- **当前状态：** complete
- **当前分支：** `codex/stage5-epub-annotation-render-fix`

### 执行的操作
- 将 EPUB 选区几何从 `book.getRange(cfi)` 改为优先读取当前可见 `rendition.getRange(cfi)`；章节 document Range 只作为文本与上下文回退。
- 移除跨 iframe realm 不可靠的 `frameElement instanceof HTMLElement` 判断，直接读取 iframe 主窗口 rect 并叠加选区 rect。
- 调整 epub.js/marks-pane underline：父标记 stroke width 设为 0 隐藏点击 rect 四边，CSS 仅让底部 line 继承批注颜色并显示 2px 虚线。
- 新增 adapter 单测，覆盖可见 rendition Range、iframe 偏移和 underline 样式参数。
- 扩展 EPUB Playwright smoke：选择主窗口可见段落，断言菜单 X 中心误差不超过 2px、Y 间距为 4-10px；保存 note 后断言所有 SVG rect 无描边、line 为可见虚线。
- 使用应用内 Browser 检查 `http://127.0.0.1:1420/` 页面身份、非空渲染和 console；因 Browser 只读环境不能注入 EPUB localStorage fixture，目标 EPUB 交互用项目 Playwright fixture 验证。

### 已通过验证
- `pnpm.cmd install`
- `pnpm.cmd --filter @reader/core build`
- `pnpm.cmd --filter @reader/desktop lint`
- `pnpm.cmd --filter @reader/desktop test`，50 tests
- `pnpm.cmd --filter @reader/desktop build`
- `cargo test --manifest-path apps\desktop\src-tauri\Cargo.toml`，27 tests
- `pnpm.cmd --filter @reader/desktop test:e2e`，5 tests
- 视觉检查：`D:\tl-temp\ebook-reader-epub-menu-fix-closeup.png`、`D:\tl-temp\ebook-reader-epub-underline-fix-closeup.png`
- `pnpm.cmd --filter @reader/desktop tauri:build`，生成 MSI 和 NSIS installer

### 过程问题
- 首次用相对路径 glob 搜索 pnpm 包源码时 PowerShell/Windows 路径不接受通配符；改为先定位 `.pnpm` 实际目录再用 `rg`。
- EPUB E2E 初版双击虽产生选区但未稳定触发 epub.js selection lifecycle；改为在 iframe 内建立真实 DOM Range。
- DOM Range 初版选中了分页横向列中的屏外首段；改为用 `frameElement rect + paragraph rect` 找主窗口可见段落，并增加 X/Y 像素断言。
- Codex 内置 pnpm 使用 Node 24，低于仓库 engine；最终验收改用用户级 `C:\Users\许涵予xhy\AppData\Roaming\npm\pnpm.CMD` 和系统 Node 26.1.0。desktop test 脚本内部再次调用裸 `pnpm` 时仍显示该环境 warning，但 50 tests 全部通过。
- 首次 `tauri:build` 因旧 release `ebook-reader-desktop.exe` PID 27020 锁定产物失败；仅结束该生成产物进程后重跑通过。

## 2026-06-29 大阶段 6：阅读体验完善与可访问性

### 状态
- **当前状态：** in_progress
- **集成分支：** `codex/v0.1.0-mvp-integration`
- **当前分支：** `codex/stage6-keyboard`

### 已执行
- 读取并恢复 `task_plan.md`、`findings.md`、`progress.md`，确认阶段 5 已完成且工作区干净。
- 将集成分支从 `cdee2ca` 快进到 `main` 的 `f04c7b9`。
- 确认阶段 6 产品决策：EPUB 内嵌封面 + PDF 首页缩略图、目录宽度全局持久化、窄屏侧滑抽屉。
- 使用现有构建记录首屏基线：入口 309.13 kB / 93.63 kB gzip。

### 阶段 6.1：快捷键和输入
- **状态：** complete
- **分支：** `codex/stage6-keyboard`
- **过程问题：** 首次 lint 拒绝在 render 中写入 `shortcutStateRef.current`；改为 effect 同步快捷键状态，保持事件处理函数稳定且符合 React 19 refs 规则。
- **过程问题：** 新增快捷键测试首次发现 `Document` target 没有 `closest()` 时被误判为可编辑；改为仅在 `closest` 存在时检查 `contenteditable`。
- **过程问题：** 对话框引入 React `KeyboardEvent` 类型后遮蔽了窗口原生类型，首次 build 在菜单 window listener 报类型不匹配；窗口监听显式改用 `globalThis.KeyboardEvent`。
- **实现：** 左右方向键统一驱动 TXT 视口翻页和 EPUB/PDF adapter；EPUB iframe keydown 转发到阅读壳。
- **实现：** `Ctrl+F` 打开 Search tab 并聚焦输入；`Esc` 依次关闭选区/批注浮层、主题、目录和 Focus 模式。
- **实现：** 输入、按钮、链接和 contenteditable 不触发翻页；菜单/移除对话框增加初始焦点、Escape、焦点回环和关闭后恢复。
- **实现：** 添加统一 `focus-visible` 与 `prefers-reduced-motion` 样式。
- **验证：** desktop lint 通过；Vitest 52 tests 通过；desktop build 通过。

### 阶段 6.2：布局响应式
- **状态：** complete
- **分支：** `codex/stage6-responsive-layout`
- **实现：** 新增共享 `ReaderLayoutPreferences`，前端和 Rust 将目录宽度归一到 240–480px、8px 步长，并通过 `app_settings` 持久化。
- **实现：** 目录宽度滑杆即时更新 CSS variable，250ms 防抖保存；窄屏隐藏滑杆并使用侧滑抽屉、遮罩和关闭按钮。
- **实现：** TOC 标题强制单行省略，保留完整 title/aria-label；深层缩进上限为 4 层。
- **实现：** Tauri 最小窗口宽度从 900px 调整为 640px。
- **验证：** Rust 28 tests、Vitest 53 tests、core build、desktop lint/build 已通过。
- **Browser QA：** 375×760 书架 body 无横向溢出，console 无 warning/error；阅读器状态将用 seeded Playwright 验证。
- **过程问题：** 首次 E2E 因工具栏文案统一为 `Contents`，PDF smoke 仍查找旧的 `Hide contents` 而超时；同步更新既有断言后重跑全套。
- **视觉检查：** `D:\tl-temp\ebook-reader-stage6-responsive-txt.png` 显示 375×760 下目录为 323px 侧滑层，正文不再被目录推到首屏下方，TOC 标题单行显示。
- **最终验证：** core build、desktop lint/build、Vitest 53 tests、Rust 28 tests、Playwright 5 tests 全部通过。

### 阶段 6.6：书架封面
- **状态：** complete
- **分支：** `codex/stage6-bookshelf-covers`
- **ImageGen：** 使用内置工具生成青绿/炭黑/琥珀纸张层叠风格、无文字的 2:3 默认封面背景。
- **资产：** 原图位于 Codex generated_images；项目资产优化为 `apps/desktop/src/assets/default-book-cover.jpg`（720×1080，119 KB）。
- **实现：** 新增 `BookCoverStatus`、`repaired` 导入状态和幂等迁移 `0003_reader_experience.sql`；旧 EPUB/PDF 默认为 pending，TXT 默认为 fallback。
- **实现：** EPUB 动态读取内嵌封面，PDF 动态渲染首页，统一通过 Canvas 输出 480×720 WebP；Rust 校验格式/签名/2 MiB 上限并原子保存到 `library/covers/`。
- **实现：** 书架使用串行后台队列处理新旧 pending 记录；真实封面失败和提取失败均回退共享背景，书名继续由 HTML/CSS 渲染；删除书籍同时删除封面缓存。
- **实现：** 同哈希文件的书库副本丢失时重新导入会修复副本并返回 `repaired`，打开前会检查书库副本存在。
- **过程问题：** React StrictMode 的 effect 探测清理曾把 mounted ref 永久留在 false，导致 PDF 封面已保存但书架 state 不刷新；effect setup 显式恢复 true 后真实 PDF 首页 E2E 通过。
- **过程问题：** 首次从仓库根目录直接运行 `cargo fmt/test` 找不到 Cargo.toml；改在 `apps/desktop/src-tauri` 执行。
- **验证：** core build、desktop lint/build、Vitest 60 tests、Rust 30 tests，以及默认封面长书名/PDF 首页缩略图 Playwright 均通过。

### 阶段 6.3：性能优化
- **状态：** complete
- **分支：** `codex/stage6-performance`
- **实现：** App 使用 `React.lazy`/`Suspense` 延迟加载完整 ReaderShell；阅读器专属 23.09 kB CSS 独立为异步 chunk，书架首屏 CSS 仅 9.03 kB。
- **实现：** 侧栏、TXT、EPUB、PDF 四个重组件使用 memo；拖动进度、渲染序列、标注重放和待保存位置继续用 ref 隔离高频临时状态。
- **实现：** 新增 `get_reader_cache`/`save_reader_cache`，缓存 `epub_locations_v1`、`epub_toc_v1`、`pdf_toc_v1`；SQLite 按当前书籍 file hash 判定命中，失配自动视为无缓存，删除书籍级联删除。
- **包体：** 书架入口从阶段 6 基线 93.63 kB gzip 降到 68.45 kB，下降 26.9%，低于 80 kB 目标；ReaderShell 为独立 29.25 kB gzip chunk。
- **过程问题：** 懒加载后旧组件测试在 ReaderShell 出现时就同步断言 TXT 内容，造成一次性 mock 未及时消费并级联污染后续用例；将内容断言改为异步等待后恢复稳定。
- **过程问题：** 快速连续关闭 Search 侧栏和 Focus 模式时，两个 requestAnimationFrame 焦点恢复任务会竞争；统一取消旧任务并只执行最后一次焦点恢复。
- **验证：** desktop lint/build、Vitest 62 tests、Rust 32 tests、Playwright 6 tests 通过；Playwright 明确断言书架不请求 ReaderShell/epubjs/pdfjs，TXT 打开不请求 EPUB/PDF 运行时。

### 阶段 6.4：错误和空状态
- **状态：** complete
- **分支：** `codex/stage6-error-states`
- **实现：** 书库加载错误使用独立 alert 状态和 Retry，不再与空书架混淆；空书架新增直接选择书籍入口。
- **实现：** 导入失败提供重新选择，取消导入保持中性 status；打开书库副本失败提供“Choose file to repair”，并复用 6.6 的 repaired 导入链路。
- **实现：** TXT、EPUB、PDF 解析错误均提供原地 Retry 和 Back to shelf；加载状态统一使用 `role=status`/`aria-live=polite`。
- **实现：** 批注创建/更新显示 Saving 状态；失败时草稿和编辑器保持不变，错误直接显示在表单内，可再次 Save。
- **可访问性：** 接入 `@axe-core/playwright`，书架及 TXT/EPUB/PDF 阅读壳无 serious/critical；EPUB 出版物 blob iframe 因内容由书籍提供而从应用壳扫描中排除。
- **过程问题：** axe 首次发现 Import 按钮白字/橙色对比度仅 3.36:1，改为更深橙红色；TXT 视口和 PDF 页面框架补充键盘焦点后消除 scrollable-region-focusable。
- **验证：** desktop lint/build、Vitest 65 tests、Playwright 6 tests 通过；错误重试、草稿保留及 axe 均有自动化覆盖。

### 阶段 6.5：隐私和数据位置文档
- **状态：** complete
- **分支：** `codex/stage6-privacy-docs`
- **实现：** 新增 `docs/privacy-and-data.md` 并从 README 链接。
- **内容：** 说明 SQLite、书库副本、封面缓存、reader cache 和浏览器 fallback 的位置、内容与删除方式。
- **内容：** 明确无遥测、分析、云同步、自动上传、用户账户或持久化应用日志；移除书籍不会删除原始导入文件。
- **验证：** 文档路径、应用 identifier、Rust 实际文件名及 localStorage key 前缀均与实现核对。

### 大阶段 6：最终验收
- **状态：** complete
- **集成分支：** `codex/v0.1.0-mvp-integration`
- **工具链：** 用户级 pnpm 11.1.2、Node 26.1.0；`install --frozen-lockfile` 通过。
- **前端：** format、core build、desktop lint、desktop build 通过；Vitest 65 tests 通过；最终首屏入口 68.65 kB gzip。
- **Rust：** `cargo fmt --check`、32 tests 通过；迁移重复执行、封面校验/删除、缓存失效/级联和副本修复均覆盖。
- **E2E：** 8 tests 通过，覆盖 1280×800、900×640、640×640、375×760 与 DPR 2；console 无 warning/error，axe 无 serious/critical。
- **视觉：** 已用 `view_image` 检查 `D:\tl-temp\ebook-reader-stage6-final-desktop.png` 与 `D:\tl-temp\ebook-reader-stage6-final-mobile.png`，布局清晰且无溢出/裁切。
- **打包：** Tauri release build 通过，生成 `ebook-reader-desktop.exe`、MSI 和 NSIS installer。
- **过程问题：** 新增 Playwright project 后首次 format check 发现 config 未格式化；运行仓库 Prettier 后重跑全套通过。

## 2026-06-30 阶段 6.x：书架封面与目录拖拽宽度修复

- **状态：** complete
- **分支：** `codex/stage6-cover-resizer-fix`
- **目标：** list 默认封面保持 82×123px 并可完整查看书名；目录宽度改为右边缘拖拽分隔条，保留响应式和持久化。
- **已执行：** 将 `codex/v0.1.0-mvp-integration` 快进到最新 `main`，从同一基线建立独立修复分支；确认工作区无用户未提交改动。
- **过程问题：** 首轮 Vitest 的键盘分隔条用例发现 `pointerdown` 的 `preventDefault` 会阻止自动聚焦；改为拖动开始时显式聚焦 separator。
- **Browser QA：** `http://127.0.0.1:1420/` 页面标题/DOM 正常、无框架错误覆盖、console 无 warning/error；List 按钮可切换到 pressed；375×760 下无横向溢出。Browser 无法在只读页面上下文注入书籍 fixture，目标封面和阅读器状态继续由 seeded Playwright 验证。
- **过程问题：** 首轮 Playwright 的新增 900px 断言误套用了 761–899px 的 40vw 规则；修正为 900px 验证完整设置宽度、899px 验证 40vw 上限。
- **视觉修正：** 首次目标截图发现封面浮层所在 grid item 低于右侧书籍信息，导致标题叠字；提升悬停封面容器层级后重新截图验证。
- **视觉修正：** 诊断确认二次截图处于 opacity 淡入中间帧，背景因此短暂透出正文；移除透明度动画，仅保留不影响可读性的位移动画。
- **视觉修正：** 浮层右侧仍可见正文超长标题尾部；悬停期间仅隐藏相邻正文 `h2`，消除重复文字且不触发布局变化。
- **实现：** 默认封面新增独立标题浮层；list 封面实际尺寸保持 82×123px，悬停显示完整中英文标题，真实封面不增加浮层。
- **实现：** 删除侧栏内部 range，新增全高 `role=separator` 边缘热区和三线手柄；指针按整数像素拖动，方向键每次 8px，Home/End 到 240/480px。
- **实现：** 前端与 Rust 宽度归一改为 240–480px 整数钳制，接口、设置键和数据库不变；250ms 防抖保存与刷新恢复继续生效。
- **响应式：** 900px 保留设置宽度；761–899px 限制为 40vw；640px 与 375px 使用抽屉并隐藏 separator。
- **最终验证：** format、core build、desktop lint/build、68 Vitest、32 Rust tests、8 Playwright tests 全部通过；Browser 页面身份/DOM/console/桌面与 375px 检查通过。
- **视觉证据：** `D:\tl-temp\ebook-reader-stage6-cover-popover.png`、`D:\tl-temp\ebook-reader-stage6-resizer-desktop.png`、`D:\tl-temp\ebook-reader-stage6-resizer-mobile.png` 已用 `view_image` 检查。
- **代码复查：** 修正全局阅读快捷键未尊重 `defaultPrevented` 的问题，避免 separator 方向键同时翻页；新增 TXT `scrollBy` 零调用断言。

## 2026-07-02 大阶段 8：v0.2 预留方向规划

### 状态

- **当前状态：** complete
- **分支：** `codex/stage8-v0.2-roadmap`
- **范围：** 只研究、评估和更新文档；不修改代码、依赖、schema、版本号、README 功能声明或 CHANGELOG。

### 已执行

- 读取并恢复 `task_plan.md`、`findings.md`、`progress.md`，运行 session catchup，确认无未同步上下文。
- 确认 `main` 与 `origin/main` 同步，工作区干净，v0.1.0 已发布。
- 从 `main` 创建单一文档分支 `codex/stage8-v0.2-roadmap`。
- 审计共享 locator、`app_settings`、EPUB locations/page-list、TXT 虚拟化、PDF continuous 预留和 ReaderShell 模块边界。
- 新增 `docs/v0.2-roadmap.md`，锁定接口、默认值、动画状态机、EPUB/TXT/PDF 方案、渐进 UI、后续阶段和验收矩阵。
- 更新 `task_plan.md`，把阶段 8 拆为五个文档子阶段，并新增阶段 9–14+ 的实施顺序。
- 更新 `DEVELOPMENT.md`，用 v0.2 技术方向替换已过期的“进入阶段 0”建议。
- 更新 `findings.md`，记录本地实现事实、外部规范/候选依赖和优先级评估。

### 最终验证

- 提交前首次 `git diff --cached --check` 发现新路线图元数据两行使用 Markdown 硬换行尾空格；提交未执行，已改为普通段落并重新验证。
- Node 26.1.0、pnpm 11.1.2 执行 `pnpm.cmd run format`：passed。
- `git diff --check`：passed。
- 无上下文读者问题检查：9/9 passed；EPUB 页码回退、默认模式、reduced motion、PDF 页内恢复、page-flip 门槛、TXT locator、阶段边界、UI 迁移和 v0.3+ 范围均能直接回答。
- 跨文档一致性检查：passed；`PageTransitionMode`、`pageOffsetRatio`、Location 回退、阶段 9–14+ 和分支名一致。
- 变更范围审计：passed；仅修改 `task_plan.md`、`DEVELOPMENT.md`、`findings.md`、`progress.md` 并新增 `docs/v0.2-roadmap.md`。
- 禁止项审计：passed；无代码、依赖、lockfile、schema、版本、README 或 CHANGELOG 变更。
- 大阶段 8 到此停止；不创建 `codex/v0.2.0-integration`，不开始阶段 9。

## 2026-07-06 阶段 9–17+ 详细开发计划

### 状态

- **当前状态：** complete
- **分支：** `codex/v0.2-detailed-roadmap`
- **范围：** 只扩充规划文档；不创建任何未来集成/功能分支，不实现阶段 9。

### 已执行

- 运行 session catchup，确认上次阶段 8 的未同步对话内容已由提交 `90bb547` 反映，当前 `main` 与 `origin/main` 同步且工作区干净。
- 从 `main` 创建纯文档分支 `codex/v0.2-detailed-roadmap`。
- 将 `task_plan.md` 的阶段 9–14+ 目标扩充为阶段 9–17+ 的完整小阶段表，固定每个分支、工作内容、前置依赖和验收条件。
- 在 `docs/v0.2-roadmap.md` 同步版本归属、分支清单、关键交付和 gate，并明确 `task_plan.md` 是执行状态唯一来源。
- 固定 v0.2/v0.3/v0.4/v0.5+ 集成分支和 `release/v0.2.0` 的创建时机；当前不创建这些分支。

### 最终验证

- 分支集合检查：`task_plan.md` 与 `docs/v0.2-roadmap.md` 各包含 62 个唯一阶段分支，差集为 0、重复名为 0。
- 阶段计数：9–12 各 7 个、13 为 9 个、14 为 7 个、15–17 各 6 个。
- 无上下文读者问题：12/12 passed，覆盖集成分支创建、共享契约、UI gate、EPUB/TXT/PDF、备份冲突、RC、MOBI、跨平台、移动 core 和远程默认行为。
- Node 26.1.0、pnpm 11.1.2 执行 `pnpm.cmd run format`：passed。
- `git diff --check`：passed。
- 变更范围：仅 `task_plan.md`、`docs/v0.2-roadmap.md`、`findings.md`、`progress.md`；无代码、依赖、schema、版本、README 或 CHANGELOG 变更。
- 未创建 `codex/v0.2.0-integration` 或任何阶段 9–17 功能分支；阶段 9 仍为未开始。

## 2026-07-06 大阶段 9：阅读体验基础与设计系统

### 启动

- **状态：** in_progress
- **集成分支：** `codex/v0.2.0-integration`
- 从最新 `main` / `origin/main` 的 `64dc750` 创建 v0.2 集成分支，确认工作区干净且分支祖先正确。
- 恢复 `task_plan.md`、`findings.md`、`progress.md` 和阶段 8 路线图上下文；按 9.1–9.7 固定分支顺序执行。
- UI 概念采用“视觉批准并校正”：保留炭黑、琥珀、青绿、纸张色和布局方向，功能与文案以 `docs/v0.2-roadmap.md` 为准。

### 9.1 阅读体验契约

- **状态：** complete
- **分支：** `codex/stage9-reader-experience-contracts`
- 在 `@reader/core` 新增三格式 view mode、`PageTransitionMode`、`ReaderCapabilities`、`ReaderExperiencePreferences`、默认偏好、能力矩阵、偏好/PDF locator 归一和有效动效解析。
- `PdfLocator` 新增可选 `pageOffsetRatio`；旧 locator 保持有效。TXT scroll、PDF continuous 和 reduced motion 的运行时有效动效为 `none`，保存偏好不被覆盖。
- PDF adapter 改为复用 core 的 `PdfViewMode`，未修改 `ReaderAdapter` 协议。
- 新增 core Vitest 配置入口和 5 tests；core test/build、desktop lint/build、format、diff check 通过。
- **过程问题：** 首次 `apply_patch` 因 PDF adapter import 上下文与预期不一致而未应用；读取文件头后拆分补丁成功。首次 format check 发现 4 个新改文件未格式化；定向运行 Prettier 后通过。
- **包体观测：** 本轮 desktop build 为书架入口 69.08 kB gzip、ReaderShell 29.85 kB gzip，作为 9.6 的实测比较点。

### 9.2 设置持久化

- **状态：** complete
- **分支：** `codex/stage9-reader-experience-settings`
- 新增 `get_reader_experience_preferences` / `save_reader_experience_preferences` Tauri 命令，以及同构 browser localStorage fallback。
- 使用现有 `app_settings` 的 `reader_experience` 键保存 `{ version: 1, preferences }`，未新增 migration、表或列。
- 缺失/非法字段逐项回退，未知字段忽略；未知版本和损坏 JSON 返回默认值，读取时不覆盖原始存储。
- Rust `PdfLocator` 同步增加 `pageOffsetRatio`，保存时过滤非有限值并钳制到 `0..1`；旧 locator 仍可反序列化。
- **验证：** desktop 74 Vitest、Rust 36 tests、desktop lint/build、format、cargo fmt check、diff check 通过。
- **过程问题：** 首轮 Rust 编译误用不存在的 `database_path()` helper，导致 2 个 E0425；改为仓库现有 `init_app_database()` 后重跑 36 tests 全部通过。

### 9.3 UI 概念审批

- **状态：** complete
- **分支：** `codex/stage9-ui-concepts`
- 将桌面书架、桌面阅读器、EPUB 图片查看器和 375px 移动状态板四张源图归档到 `docs/design/v0.2/`。
- 新增设计规格，固定可见文案、颜色/排版/token、容器模型、图标、组件状态、动效和 1280/900/640/375 响应式规则。
- 记录审批口径：保留视觉方向，以路线图校正 MOBI、Auto/Scrolled/Fade、Letter spacing、重复阅读器 rail、错误背景和设备系统 chrome。
- 使用 `view_image` 检查四张归档源图，确认文件完整且校正表覆盖可见生成偏差；本阶段未修改产品 UI。

### 9.4 设计 token 与基础组件

- **状态：** complete
- **分支：** `codex/stage9-design-tokens`
- 新增 chrome/正文分离的颜色、字体、间距、圆角、阴影、层级、focus 和 motion CSS token；reduced motion 将共享时长降为 `0.01ms`。
- 新增 Button、IconButton、SegmentedControl、Toolbar、Modal/移动 Sheet、SliderField；语义、键盘、Escape、焦点陷阱和焦点恢复均有测试。
- 用共享 Button/SegmentedControl 渐进迁移书架 Grid/List 和 Import book，保留原 class、文案和 aria-pressed 行为。
- 新增开发专用 `?fixture=design-system` 状态矩阵，覆盖 primary/secondary/ghost/danger、disabled、四主题、分段控件、slider、modal/sheet 和 reduced motion。
- **自动化：** 78 Vitest、10 Playwright、desktop lint/build、format、diff check 通过；fixture axe 无 serious/critical。
- **Browser QA：** 1280×800 与 375×760 渲染正常；移动按钮均为 44px，scrollWidth=clientWidth，sheet 底边贴合 viewport，Close 获得焦点，console 无 warning/error；现有空书架 List 切换保持正确。
- **过程问题：** 首次只读检查命令的 PowerShell 引号未闭合，未产生变更，改用单引号模式后成功。首轮 slider 测试依赖 jsdom 不触发的 range 键盘 change；改用 Testing Library `fireEvent.change` 后 78 tests 全部通过。
- **包体观测：** 生产书架入口 69.49 kB gzip、ReaderShell 29.85 kB gzip；9.6 继续优化入口并保持 ReaderShell 异步边界。

### 9.5 翻页控制器原型

- **状态：** complete
- **分支：** `codex/stage9-page-transition-spike`
- 新增 `idle/running` 事务控制器、单槽待处理方向、捕获/动画失败安全降级、真实导航失败不提交和每次成功导航单次 commit。
- 新增隔离快照展示层；slide 为 220ms，page-curl 为 500ms CSS 3D/WAAPI，层为 `aria-hidden`/`pointer-events:none` 且完成后移除，不移动实时 DOM。
- 在开发 fixture 增加可交互翻页原型；Browser 验证 slide 从 Chapter 1 到 2、page-curl 到 3，每次仅增加一次 commit，动画完成后活动层为 0。
- 仓库外解包并审计 `page-flip@2.0.7`；MIT/零依赖通过，但实时 DOM 隔离和确定性事务 gate 不通过，最终不加入 package/lockfile，决策记录于 `docs/design/v0.2/page-transition-spike.md`。
- **验证：** 85 Vitest、12 Playwright、desktop lint/build、format 通过；1280×800 和 640×640 各 30 次同步 Next 最终为 2 commits，未记录可归因的 `>50ms` long task。
- **过程问题：** 首轮 lint 发现 render 初始化控制器时闭包可能读取 ref；改为 effect 创建并由事件读取 ref。首轮类型检查修正 mock 返回值；首轮 E2E 在 fixture 动态加载完成前直接查询按钮导致 0 commits，增加按钮可见 gate 后通过。
- **回归观测：** 首次全量 Vitest 的既有 Focus 快捷键用例出现一次 rAF 焦点时序波动；该用例定向重跑通过，随后全量 85 tests 重跑通过，未修改生产快捷键行为。

### 9.6 ReaderShell 模块拆分

- **状态：** complete
- **分支：** `codex/stage9-reader-shell-modules`
- 保留 `components/ReaderShell.tsx` 懒加载 facade 与公开 `ReaderShellProps`，实现迁至 `reader/ReaderShell.tsx`；ReaderShell CSS 只由异步实现导入。
- 提取 `ReaderSidebar`、选择/批注浮层、主题面板、UI 状态类型、标注展示规则和稳定导航注册 hook；TXT/EPUB/PDF 内容层及其 adapter/helper 迁入独立 `ReaderFormatContents` 模块，继续使用直接导入和原 memo 边界。
- 修正既有 Focus 焦点恢复 ref 错挂在 Contents 按钮的问题；关联快捷键测试定向通过，全量 desktop 85 tests 通过。
- 将封面生成器改为队列首次运行时动态导入，避免 EPUB/PDF 封面运行时进入初始书架 chunk；当前生产书架入口为 66.85 kB gzip，低于 68.45 kB 绝对门槛，ReaderShell 为 29.79 kB gzip 并保持独立异步 chunk。
- **验证：** format、lint、core 5 tests、desktop 85 tests、desktop build、`git diff --check` 通过。
- **过程问题：** 首轮关联测试暴露 Focus ref 旧缺陷并已修复。隔离重建阶段 8 时，临时 worktree 的 Windows junction 清理误删主 worktree `packages/core`；影响限定于已跟踪目录，立即从当前 HEAD 恢复并重应用单行 lint 修正，随后 core 5 tests 与全量门禁通过。该临时 worktree 已删除，后续不再使用 junction 复用依赖。
- **工具链观测：** 同一当前工具链重建阶段 8 得到 69.08 kB gzip，说明旧文档 68.45–68.46 kB 受构建版本影响；最终实现仍以 66.85 kB 满足更严格的绝对值。

### 9.7 阶段 9 验收

- **状态：** complete
- **分支：** `codex/stage9-acceptance`
- 新增 `docs/design/v0.2/fidelity-ledger.md`，记录布局、色彩、排版、控件、动效/响应式五点对照、概念校正、page-curl 最终决策和包体数据。
- **Browser/IAB：** 1280×800、640×640、375×760 通过；四主题存在，375px 采样按钮均为 44px，document 无横向溢出，mobile sheet 底边贴合 760px，Escape 后焦点恢复到 Open settings，console 无 warning/error。
- **视觉对照：** 使用 `view_image` 对照四张批准概念与最终书架/设计系统截图；保留 charcoal/teal/amber/paper、开放 workspace、紧凑控件和移动 sheet，按校正表排除 MOBI/Auto/Scrolled/Fade/Letter spacing/设备 chrome。
- **自动化：** frozen install、format、lint、core 5 tests/build、desktop 85 tests/build、Rust 36 tests、Cargo fmt check、12 Playwright 和 `git diff --check` 全部通过；Playwright 覆盖 TXT/EPUB/PDF、DPR 2、reduced motion、30 次快速输入和 axe serious/critical=0。
- **打包：** `tauri build` 首次通过，生成 NSIS `Ebook Reader_0.1.0_x64-setup.exe` 和 MSI `Ebook Reader_0.1.0_x64_en-US.msi`；本阶段不发布。
- **包体：** 书架入口 66.85 kB gzip；ReaderShell JS 29.79 kB、ReaderShell CSS 5.48 kB，继续异步；bookCovers 1.25 kB gzip 独立 chunk。
- **Browser 限制：** IAB 受控页面不暴露 localStorage，无法直接注入三格式 fixture；Browser 完成视觉/交互检查，真实三格式状态由仓库 Playwright fixture 验证并留下 12/12 结果。
- **合并与推送：** acceptance 以 `--no-ff` 合入 `codex/v0.2.0-integration`，集成分支再以 `--no-ff` 合入 `main`；随后集成分支快进到 `main` 合并提交。`main` 和 `codex/v0.2.0-integration` 均已推送到 origin；未执行 v0.2 发布或商店操作。
# 2026-07-07 大阶段 10：EPUB 增强

## 启动

- **状态：** in_progress
- **集成分支：** `codex/v0.2.0-integration`
- **本轮边界：** 顺序完成 10.1–10.4；通过中期完整门禁后停止，不创建 10.5、不合入 `main`、不改版本、不发布。
- 已确认 `main`、`codex/v0.2.0-integration` 与对应 origin 均位于 `1113bc6`；工作区仅有用户未跟踪的 `AGENTS.md`，执行期间保留且不提交。
- 已恢复 `task_plan.md`、`findings.md`、`progress.md`、阶段 9 设计规格与 page-curl 决策；图片查看器以已批准概念为视觉方向，以路线图校正规则为最高优先级。

### 10.1 page-list 模型

- **状态：** complete
- **分支：** `codex/stage10-epub-page-list`
- 目标：保留 EPUB3 navigation / EPUB2 NCX 原始 page-list 标签，解析 href/fragment/CFI 边界并复用 `reader_cache`。
- **过程问题：** 首轮定向 Vitest 90 tests 中 1 个新断言失败；测试要求 href-only 边界含显式 `cfi: undefined`，而实际模型有意省略可选字段。已改为断言字段不存在。当前终端 Node 24.14.0 / pnpm 11.7.0 与仓库声明的 Node 26.1.0 / pnpm 11.1.2 不一致，后续验证改用可定位的项目要求运行时。
- 第二轮 90 Vitest 与 lint 通过；build 暴露测试 helper 未补必填 `publicationPageLabel`，以及项目当前 ES target 不支持 `Array.prototype.toSorted`。已补默认值并改为复制数组后 `sort`，保持输入不可变。
- 新增 `EpubPageList` 模块，覆盖 EPUB3 navigation、EPUB2 NCX、相对 href、fragment、package CFI、spine/CFI 排序、当前位置标签查找和版本化缓存校验。
- `EpubReaderAdapter` 异步生成或恢复 page-list，并在位置/拖动预览结果中返回 `publicationPageLabel`；`ReaderFormatContents` 并行读取 locations、page-list 和 TOC 缓存。
- **验证：** 90 Vitest passed；desktop lint、build、root format passed。生产书架入口 66.85 kB gzip，ReaderShell 31.52 kB gzip，仍保持异步边界。

### 10.2 页码与 Location UI

- **状态：** complete
- **分支：** `codex/stage10-epub-page-labels`
- 将 EPUB 合成 `page/totalPages` 改名为 `location/totalLocations`，数字跳转统一为 Location；出版物 page-list 只负责 `Page <label>` 展示。
- **过程问题：** 首轮定向验证在 adapter 的 `locationToPosition(location)` 中把新数值变量也命名为 `location`，导致 esbuild/TypeScript 重复标识符；已将参数改为 `renditionLocation`，保持模型命名清晰。
- 首轮 generated EPUB Playwright 未找到 `Page i`：fixture 把首个 page-list 边界放在章节 `<h1>` fragment，而 epub.js 初始 CFI 位于该元素之前，按契约正确回退 Location。已将第一页改为 href-only section 起点，并保留第二页 fragment 覆盖。
- `EpubPosition` / `EpubProgressPreview` 已使用 `location/totalLocations`，位置输入和 aria-label 改为 Location；状态/tooltip 优先使用出版物标签，缺失时回退 Location。
- generated EPUB fixture 新增 page-list：href-only `i` 和 fragment `10`；Playwright 验证 `Page i`、Location 数字跳转、进度拖动、末位置和 single/double 原路径。
- **验证：** 90 Vitest、desktop lint/build、root format passed；generated EPUB Chromium smoke 1/1 passed。书架入口 66.85 kB gzip，ReaderShell 31.52 kB gzip。

### 10.3 图片资源桥接

- **状态：** complete
- **分支：** `codex/stage10-epub-image-bridge`
- 新增 `EpubImageBridge`，对 rendition iframe 的 HTML `img` / SVG `image` 注册单次事件代理，提供鼠标、Enter、Space 激活、可访问名称、自然尺寸和触发元素。
- adapter 将桥接 cleanup 合并进既有 content document 清理队列；主题规则新增 zoom-in 光标和 amber 3px focus-visible，不增加全局 listener 或新资源 URL。
- 单测覆盖 HTML/SVG、装饰性/空/损坏图片、修饰键点击、原属性恢复、listener 清理以及禁止 fetch/createObjectURL。
- **验证：** 96 Vitest、desktop lint/build、root format passed。书架入口 66.85 kB gzip，ReaderShell 32.56 kB gzip，仍为异步 reader chunk。

### 10.4 图片查看器

- **状态：** complete
- **分支：** `codex/stage10-epub-image-viewer`
- 新增专用 `EpubImageViewer` 和缩放/平移模型，提供 Fit、100%、Zoom out/in、Reset、Close、百分比滑杆和帮助文字。
- 查看器支持滚轮、触控板 pinch、双指缩放、指针捕获拖动、Space+拖动、键盘 `+/-/0/Escape` 和双击 Fit/100% 切换；背景阅读导航在查看器打开期间暂停。
- `ReaderFormatContents` 接入图片激活回调并在关闭后恢复 iframe 图片焦点；触发元素失效时回退 EPUB host。
- 共享 Modal 增加 header actions、描述、className/backdropClassName、closeLabel 和可关闭默认焦点恢复的选项；现有 Modal 语义保持不变。
- EPUB 图片桥接补充跨 iframe realm 判断和 CSS 隐藏过滤；封面提取与 EPUB reader open 等待 `book.opened` 以规避资源替换竞态。
- Playwright generated EPUB fixture 新增 SVG 图片，覆盖鼠标/键盘打开、缩放、拖动、Esc 焦点恢复、四主题、reduced motion 和 375×760 触控布局。
- **定向验证：** `pnpm.cmd --filter @reader/desktop test -- EpubImageViewer.test.tsx EpubImageBridge.test.ts App.test.tsx` passed，101 tests；`pnpm.cmd --filter @reader/desktop lint` passed；`pnpm.cmd --filter @reader/desktop build` passed；`READER_VISUAL_QA=1 pnpm.cmd --filter @reader/desktop exec playwright test tests/smoke.spec.ts --project=chromium --grep "opens a generated EPUB"` passed。
- **视觉证据：** 已用 `view_image` 检查 `D:\tl-temp\ebook-reader-stage10-image-viewer-desktop.png` 与 `D:\tl-temp\ebook-reader-stage10-image-viewer-mobile.png`；桌面工具栏、舞台、滑杆和关闭按钮完整，375×760 下 Close/Reset/500%/pan hint 均在 viewport 内。
- **中期门禁：** `git diff --check` passed；`pnpm.cmd check` passed，包含 Prettier、lint、core build/test、desktop build/test，desktop 101 tests；`cargo fmt --manifest-path apps\desktop\src-tauri\Cargo.toml --check` passed；`cargo test --manifest-path apps\desktop\src-tauri\Cargo.toml` passed，36 tests；`pnpm.cmd --filter @reader/desktop test:e2e` passed，12 Playwright tests；`pnpm.cmd --filter @reader/desktop tauri:build` passed，生成 NSIS 和 MSI。
- **Browser/IAB：** 已优先尝试 Browser/IAB，但工具端 `incrementalAriaSnapshot is not a function` 阻塞继续检查；本轮以项目 Playwright、生成截图和 `view_image` 完成三格式/三视口/视觉回归，并在最终交付中说明该工具限制。
- **包体观测：** 书架入口保持 66.85 kB gzip；ReaderShell JS 因 EPUB page-list、图片桥接和图片查看器增至 36.44 kB gzip，继续作为异步 reader chunk，不进入书架入口。
- **停止边界：** 10.4 完成后停止，不创建 10.5、不合并 `main`、不改版本、不发布。

## 2026-07-10 大阶段 10：10.5–10.7 续行

- **状态：** in_progress
- **当前阶段：** 10.5 EPUB 平滑切换
- **分支基线：** `codex/v0.2.0-integration` 与 origin 同步于 `df6aa7c`；`main`/origin 仍为 `1113bc6`；仅保留用户未跟踪 `AGENTS.md`。
- **执行边界：** 顺序完成 10.5、10.6、10.7；每个子阶段按实现、测试、文档提交后 `--no-ff` 合回并推送集成分支。10.7 最终门禁通过后才合入 `main`，随后快进同步集成分支；不改版本、不发布、不新增依赖/schema/格式。
- 已恢复外部 `PLAN (2).md`、三份跟踪文件、阶段 9 transition 原型与阶段 10 中期结果；已确认 10.5 复用既有 controller/layer 并接通 EPUB 真实导航。
- **过程问题：** 首轮代码定位命令包含两个不存在路径，组合检查以 exit 1 结束；未产生改动。已记录真实文件布局，后续使用 `rg --files` 和模块旁测试定位。
- **过程问题：** 10.5 首轮并行定向验证在 TypeScript 构建中因 `AbortSignal.aborted` 被控制流错误窄化为 `false | undefined` 而失败；测试/lint 输出被并行失败中断。已改用独立 helper 读取异步后的 signal 状态，并补充 controller `finally` 清理。
- **过程问题：** 第二轮定向验证暴露两类独立问题：`App.test.tsx` 的完整 Tauri mock 未补新增 experience exports，导致 41 个 ReaderShell 用例连锁卸载；同时 React refs lint 禁止在 render 期构造并写入 controller ref。已补默认偏好 mock，并把 controller 初始化移入 effect、事件回调只在交互期读取 ref。
- **过程问题：** 第三轮 lint/build 已通过，69 个定向测试仅 iframe 键盘导航的旧同步断言失败；事务控制器现在异步执行真实导航，测试改为等待 adapter `next()`，并补充偏好保存与快照净化覆盖。
- **过程问题：** 首轮 generated EPUB Playwright 的功能断言通过，但净化快照 iframe 使用空 sandbox，导致已加载 blob 资源被当作不可访问本地资源并产生 localStorage sandbox console 错误。快照仍移除全部脚本/表单/嵌套 frame；sandbox 改为仅 `allow-same-origin`（不含 `allow-scripts`），以复用当前 rendition 已加载资源并保持只读隔离。

### 10.5 EPUB 平滑切换

- **状态：** complete
- **分支：** `codex/stage10-epub-slide-transition`
- 已将 `ReaderExperiencePreferences.epub.transition` 接入生产 ReaderShell 与 Theme 面板；None/Slide 可持久化，已有 page-curl 值在 10.6 前仅运行时降级为 Slide且不覆盖保存值。
- EPUB previous/next 与 iframe 键盘导航共用事务 controller；快照为净化、sandboxed、只读 iframe，实时 rendition DOM 不进入动画层，动画层始终 `aria-hidden`/`pointer-events:none` 并在结束/取消后删除。
- resize、theme、spread 和非相邻跳转会取消视觉动画与 pending 方向；adapter 以当前 CFI/href 完成 reflow 恢复。成功导航由 commit 立即 flush pending progress。
- **定向验证：** 73 Vitest passed（controller/layer/adapter/App）；desktop lint passed；desktop build passed；generated EPUB Chromium Playwright 1/1 passed，覆盖 Slide 层出现/清理、None 无动画和 console clean。
- **包体观测：** 书架入口 67.08 kB gzip；ReaderShell 38.70 kB gzip，继续保持异步 reader chunk；未新增依赖。
- **合并与推送：** 实现 `553171f`、测试 `9125a1a`、文档 `11e9b9a` 已以 `--no-ff` 合回 `codex/v0.2.0-integration`（merge `aa86c62`）并推送。

### 10.6 EPUB 真实翻页

- **状态：** in_progress
- **分支：** `codex/stage10-epub-page-curl`
- 从已同步的 10.5 集成基线创建；目标为启用保存的 Page curl、500ms 3D 翻页背面/阴影/目标页揭示、浮层互斥和资源/WAAPI 失败无动画降级。
- **过程问题：** 10.6 首轮 lint 与 68 个定向测试通过，build 仅在新动画测试中因 `vi.fn` 被推断成零参数 tuple 而失败；已按原生 `HTMLElement.animate` 签名显式标注 mock，不涉及产品代码。
- **视觉问题：** `view_image` 检查 230ms page-curl 截图时发现 Chromium 3D iframe 合成面把 EPUB host 外区域渲染为黑色；已在动画层加入 paint containment/clip 与不透明背景，并限制 frame overflow，等待重拍确认。

- **状态：** complete
- 保存的 `page-curl` 现已直接生效，Theme 面板提供 None/Slide/Page curl；图片查看器、选择菜单、note editor/popover 打开时 page-curl 安全降级为无动画真实导航。
- page-curl 使用 500ms WAAPI：current/target sandboxed iframe 只做裁切/揭示，独立 CSS 3D sheet 提供正反面、动态阴影和目标页亮度恢复，避免 iframe 3D 合成黑屏。
- 快照/资源准备和 WAAPI 不可用时动画层及时销毁，真实导航与进度 commit 保持完成；reduced-motion 继续不捕获、不动画且不改保存偏好。
- **定向验证：** desktop 108 Vitest、lint、build passed；generated EPUB Chromium Playwright 普通与视觉 QA passed，覆盖 page-curl、往返、图片查看器互斥和 console clean。
- **Browser/IAB：** 当前 Browser 运行路径恢复可用；本地 `http://127.0.0.1:1420/` title=`Ebook Reader`、首屏非空、无 framework overlay、console warn/error 为空，截图确认书架视觉正常。受控 Browser 无 seeded EPUB 数据，真实 page-curl 由仓库 Playwright fixture 验证。
- **视觉对照：** `view_image` 对照批准阅读器概念与 `D:\tl-temp\ebook-reader-stage10-page-curl.png`；最终重拍无 host 外黑屏，保留现有 charcoal/teal/amber/paper chrome，动画仅覆盖阅读页舞台。
- **包体观测：** 书架入口 67.08 kB gzip；ReaderShell 39.26 kB gzip/CSS 6.88 kB gzip，继续保持异步边界；未新增依赖。
- **合并与推送：** 实现 `cdb2126`、测试 `2f177c5`、文档 `db2ee8a` 已以 `--no-ff` 合回 `codex/v0.2.0-integration`（merge `42c4846`）并推送。

### 10.7 阶段 10 验收

- **状态：** in_progress
- **分支：** `codex/stage10-epub-acceptance`
- 从已同步的 10.6 集成基线创建；补齐无 page-list/完全损坏 page-list fixture、reduced-motion page-curl 真导航无动画路径，并让 axe 检查可访问的 EPUB iframe 内容。
- **过程问题：** 启动检查命令把 Windows PowerShell 不支持的 `src\*.test.tsx` 路径 glob 传给 `rg`，导致组合命令 exit 1；分支创建和只读文件输出均已完成，未产生异常改动。后续只使用 `rg --files` 或目录级 glob。
- **过程问题：** 移除 axe 的 EPUB iframe 排除后，默认 4.12 frame 聚合会调用 `browserContext.newPage` 并在 blob rendition 上等待至 30s 超时。按 axe 官方提供的受限环境 fallback 改用 `setLegacyMode()`，保留同源可访问 iframe 检查且避免创建聚合空白页；需以 targeted Playwright 复验结果为准。
- **验收发现：** legacy axe 成功进入真实 EPUB 页面后报告 serious `frame-title`：epub.js 生成的 rendition iframe 没有 accessible name。adapter 的 `rendered` 生命周期现按章节文档 title 设置 `<iframe title="… content">`，无标题时回退 `EPUB publication content`，并补单测。
- **过程问题：** frame-title 修复后的 targeted Playwright 在 reduced-motion 复位后的 page-curl 尚未销毁时就构造通用 iframe locator，命中实时 rendition + 两个 snapshot frame 而 strict-mode 失败。产品动画按预期仍在运行；测试在继续图片交互前显式等待 `.reader-transition-layer` 清理。
- **axe 工具观测：** legacy mode 会向不允许脚本的 EPUB sandbox iframe 注入 axe，自身触发一条精确的 `about:srcdoc` blocked-script console error。验收 helper 仅在 axe 调用时间窗内移除这条已知工具诊断，其他 warning/error 继续作为产品失败；serious/critical 结果仍完整断言。
- **过程问题：** 将 axe 移到交互末尾后，page-curl fixture 仍偶发无动画：None 模式 Previous 已更新 Location，但新的 rendition document 尚未进入可捕获状态。验收在启用 Page curl 前等待带 title 的实时 iframe 章节 heading 可见；产品仍按契约在快照未就绪时完成无动画真实导航。

- **状态：** complete
- 新增 `docs/design/v0.2/stage10-fidelity-ledger.md`，汇总 10.1–10.7 能力、fixture、视觉、a11y、降级、性能、包体与最终门禁。
- **最终门禁：** `pnpm.cmd check` passed（core 5、desktop 110）；Cargo fmt check + Rust 36 tests passed；Playwright 12/12 passed；Browser/IAB 1280×800、640×640、375×760 与 console clean passed；`tauri:build` passed并生成 NSIS/MSI；`git diff --check` passed。
- **包体：** 书架入口 67.09 kB gzip；ReaderShell JS 39.33 kB、CSS 6.88 kB，继续异步；bookCovers 1.25 kB gzip。
- **边界：** 未新增依赖、schema、格式或版本；未执行发布。下一步仅按计划提交验收文档、合回集成分支、`--no-ff` 合入 `main` 并快进同步集成分支。
- **最终 Git 路由：** 10.7 以 `089e9be` `--no-ff` 合回并推送 `codex/v0.2.0-integration`；集成分支再以 `5cc9bc5` `--no-ff` 合入 `main`。本收口提交随后同时推送到 `main`，并由集成分支 fast-forward 同步，结束大阶段 10。

## 2026-07-10 大阶段 10.x：EPUB 翻页动画视觉升级

- **状态：** in_progress
- **分支：** `codex/stage10-transition-polish`
- **基线：** `codex/v0.2.0-integration`、`main` 及对应 origin 均为 `806e474`；工作区仅保留用户未跟踪 `AGENTS.md`。
- **执行边界：** 新增 Cover，升级 Realistic/Smooth，重构四模式设置卡；不新增依赖、数据库迁移、版本或发布操作，不接通 TXT/PDF 动画。
- **兼容决策：** UI `None/Realistic/Cover/Smooth` 分别持久化为 `none/page-curl/cover/slide`；新 EPUB 默认 None，旧保存值保持兼容。
- **实现进展：** core/Rust 已加入 `cover` 并按格式归一默认值；EPUB 设置面板已改为四张可键盘操作的动效卡；Smooth 使用 280ms 全宽双页位移，Cover 使用 320ms 目标页压入，Realistic 使用 650ms 斜向裁切、二维镜像折页文字、CSS 3D 纸背和移动阴影。
- **过程问题：** 第一轮定向 core 6、desktop 113、Rust 2 项通过；并行 lint/build 中 build 仅因两个新动画测试的 `vi.fn` 被推断为零参数 tuple 而无法读取第二个调用参数。已按原生 `HTMLElement.animate` 签名标注 mock，产品代码未受影响。
- **视觉问题：** 首轮 25%/50%/75% 截图中 Cover 的 translated target iframe 在 Chromium 产生舞台外黑色合成面；Realistic 的固定 iframe＋裁切方案无黑屏。Cover 改为固定 target、动画 clip-path，并用独立无内容 edge 层移动纸缝和阴影。
- **过程问题：** compositor 隔离改写后的 visual Playwright 首次没有捕获 Realistic 层；测试在点击 Previous 后立即断言动画层数量为 0，可能在异步事务创建层之前提前通过，后续模式切换与仍在运行的事务重叠。现改为先等待 Location 恢复起点，再断言动画层清理。
- **根因修复：** 等待 Location 后 Realistic 仍稳定降级，定位为关闭 Theme 面板后的 DOM 已更新，但 controller 的 transition/block refs 尚待普通 effect 同步。改为 `useLayoutEffect`，确保下一次按钮/键盘输入前 controller 读取到最新模式与互斥状态。
- **合成稳定方案：** 冻结关键帧确认额外折页 iframe 与 rotateY 在边缘角度仍会黑屏；Realistic 最终只保留 current/target 两个真实快照，使用布局宽度揭示和纯 CSS 印刷纸背、二维压缩/斜切及阴影，不再创建第三个 iframe 或 3D 合成层。
- **视觉验收：** 九张真实 EPUB 25%/50%/75% 关键帧最终均无黑面；桌面与 375×760 设置截图确认四卡为 2×2、触控高度 ≥44px、无横向溢出。Browser/IAB 的 1280 与 375 截图、页面 identity、交互和 console clean 通过；640×640 DOM/宽度/console 通过，但该档 screenshot CDP 捕获超时，已用项目 Playwright 视觉证据补充。
- **门禁问题：** 首轮 `pnpm.cmd check` 在 Prettier 检查发现 `ReaderShell.css` 的暗色主题特异性修复尚未机械格式化；lint 已通过。已仅格式化该文件后重跑完整 check。
- **门禁问题：** 首轮完整 Playwright 10/12 通过；两个 design-system DPR 项仍断言旧标签 `Slide`，而兼容值 `slide` 的新 UI 名称为 `Smooth`。产品行为与其余测试正常，已更新可访问名称断言后重跑。
- **状态：** complete
- **最终门禁：** `pnpm.cmd check` passed（core 6、desktop 113）；Cargo fmt check 与 Rust 36 tests passed；Playwright 12/12 passed；Browser/IAB 三视口 identity/DOM/console 通过；`tauri:build` passed并生成 NSIS/MSI；`git diff --check` passed。
- **包体：** 书架入口 67.10 kB gzip；ReaderShell JS 40.03 kB、CSS 7.76 kB，继续保持异步边界；未新增依赖、schema、格式或版本，未发布。

## 2026-07-10 大阶段 10.x：翻页快照分页定位修复

- **状态：** complete
- **分支：** `codex/stage10-transition-snapshot-fix`
- **基线：** `codex/v0.2.0-integration` 的 `3c14c9a`；保留用户未跟踪 `AGENTS.md`。
- **问题复现：** 三种动画都重新序列化当前章节文档，但未带入 epub.js 分页容器产生的 live iframe 横向偏移，动画帧因此固定显示章节第一页。
- **实现：** 快照记录 live iframe 相对 host 的矩形，使用固定 viewport iframe＋净化文档 `body` 布局偏移呈现真实分页；排除动画层、隐藏和舞台外 iframe。捕获遇到 epub.js 短暂 0×0 reflow 时最多等待 6 帧，超时则无动画导航。
- **加载竞态：** snapshot `srcdoc` 增加内部就绪标记，忽略新 iframe 初始 `about:blank` 的 load，只在净化文档真正加载后设置 `body.left/top` 并标记 ready。
- **合成修复：** 超宽负偏移、非零 iframe scroll、双 iframe transform 和过早冻结截图都可能触发 Chromium 黑面。最终 Smooth 以 current 宽度揭示＋target snapshot 内部正文位移形成接缝，Cover 以 current 匀速宽度揭示＋独立 edge 表达覆盖，Realistic 保持固定 target/current 宽度揭示；冻结后等待两帧再截图。
- **自动化：** `PageTransitionLayer.test.ts` 11/11 passed，覆盖章节内 `-800px` / `-400px`、隐藏预加载 view 与 0×0 reflow 恢复；generated EPUB Playwright 覆盖 Smooth/Cover/Realistic 前进目标和 Realistic 后退目标，并验证实际 `body.left` 已应用。
- **浏览器检查：** 应用内浏览器确认 `http://127.0.0.1:1420/` 标题、非空书架、无 framework overlay、console warning/error 为 0，Grid→List 交互 `aria-pressed=true`；精确 EPUB fixture 继续由仓库 Playwright 注入。
- **视觉验收：** `D:\tl-temp\ebook-reader-stage10x-{slide,cover,page-curl}-{25,50,75}.png` 九张均显示真实 Location 2 目标内容；正常播放与应用内浏览器无黑面。CDP 强制暂停后的 full-page capture 偶发把舞台外区域记录为黑色，已等待两帧提交并记录为截图路径限制；应用内浏览器页面 identity、非空、无 overlay、console clean 与 Grid→List 交互通过。
- **最终门禁：** `pnpm.cmd check` passed（core 6、desktop 117）；Cargo fmt check 与 Rust 36 tests passed；Playwright 12/12 passed；视觉 Playwright 1/1 passed；`tauri:build` passed并生成 NSIS/MSI；`git diff --check` passed。
- **包体：** 书架入口 67.09 kB gzip；ReaderShell JS 40.79 kB、CSS 7.79 kB，继续保持异步边界；未新增依赖、schema、格式或版本，未发布。
## 2026-07-11 大阶段 11 实施

- 已从最新 `codex/v0.2.0-integration` 的 `d763798` 创建 `codex/stage11-txt-paginator-measurement`，保留未跟踪 `AGENTS.md`。
- 已新增可取消、可分批让出主线程的 TXT 分页算法和真实 DOM 测量器；长段落使用字素边界二分，页模型保存 UTF-16 `[startCharOffset, endCharOffset)`。
- 已将路线图和 DEVELOPMENT 的旧三动画规格同步为 TXT 五项并列阅读方式、四动画与 single/double。
- 首次定向测试发现空段 fixture 的测量阈值预期错误；已调整 fixture 阈值，未改变产品算法。
- 11.1 门禁通过：desktop 13 files / 121 tests，`pnpm.cmd --filter @reader/desktop lint` 通过。
- 11.2 已完成固定 `txt_pagination_v1` envelope、布局签名归一、损坏/失配拒绝、连续边界验证、缓存切片重建和 charOffset 页二分；desktop 123 tests、lint 通过。
- 11.3 已完成 memoized TXT 三窗口组件；Single 挂载前/当前/后 3 页，Double 挂载 3 个 spread/最多 6 页，邻接窗口 `hidden` 且 `aria-hidden`，切片保留 selection/annotation 所需 charOffset 数据属性。
- 11.4 已接入真实 TXT 阅读器：设置面板提供 Continuous/None/Realistic/Cover/Smooth 五项 radio，四项分页方式启动 DOM 测量与缓存；分页舞台提供 Single/Double、窄窗降级、页码状态和主题/尺寸/spread 重分页。
- 11.4 门禁通过：core 6 tests、desktop 128 tests、desktop lint/build；书架入口 67.09 kB gzip，ReaderShell 44.22 kB gzip，EPUB/PDF runtime 仍未进入书架入口。
