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
- 阶段 2.3 已新增 `ReaderShell`，TXT 书籍从书架进入阅读页，EPUB/PDF 继续显示“后续阶段支持”的非阻塞提示。
- 阶段 2.3 浏览器 fallback 的 `openTxtBook` 只读取显式写入 `localStorage` 的测试 fixture；未注入 fixture 时仍报 Tauri runtime 需求，不假装能读真实本地文件。
- 阶段 2.4 已新增 `get_reader_theme`、`save_reader_theme`，复用 `app_settings` 表保存阅读主题 JSON。
- 阶段 2.4 阅读主题支持 light、sepia、green、dark、字体、字号、行高、段距和页边距，前端通过 CSS 自定义属性即时应用。
- 阶段 2.5 已新增 `get_reading_progress`、`save_reading_progress`，复用 `reading_progress` 表保存 TXT `chapterId + charOffset` locator。
- 阶段 2.5 阅读页打开 TXT 时并行加载文档、主题和进度；进度恢复优先用 `chapterId`，缺失时按 `charOffset` 找最近章节。
- 阶段 2.6 已接入 `@tanstack/react-virtual`，正文按章节标题和段落拆成虚拟块，Playwright 长 TXT fixture 验证 DOM 段落数量低于 80。
- 阶段 2.6 浏览器 e2e 使用显式 `localStorage` fallback 书库和 TXT 文档 fixture，真实文件导入仍由 Rust 测试覆盖。
- 阶段 2 最终 Browser QA：桌面 1280x800 与窄屏约 375x760 下书架首屏无旧空壳文案、无 console warning/error、无 Vite error overlay，视图切换可交互。
- 阶段 1/2 修复优化确认：“移除”只删除 SQLite 书架记录和 `app_data_dir()/library` 内应用副本，不删除原始导入文件。
- 阶段 1/2 修复优化确认：TXT 大文件先保持 `open_txt_book` 返回结构兼容，通过前端索引、滚动 idle 保存和 TOC 同步优化；只有验证仍不达标时再扩大到后端分页块接口。
- 阶段 1 修复已新增 `remove_book` Tauri 命令、`RemoveBookResult` 纯类型、右键/More 菜单和确认移除弹窗；Rust 测试确认删除书库副本、级联清理进度且保留原始文件。
- 阶段 2 修复未扩大后端分页接口：前端索引、滚动 idle 保存、instant programmatic scroll、active TOC 同步和 dark 主题变量化后，Playwright 长 TXT smoke 通过，未触发后端分页备选。
- Browser QA 对空书架首屏的 DOM/console/style metrics 通过：桌面和 375x760 窄屏无 Vite overlay、无 console warn/error，导入按钮 icon 垂直中心偏移为 0。
- Browser 插件截图接口本次对本地页 `Page.captureScreenshot` 超时；已使用 Playwright CLI 在 `D:\tl-temp\ebook-reader-stage2-shelf-desktop.png` 和 `D:\tl-temp\ebook-reader-stage2-shelf-narrow.png` 生成截图并人工查看。
- 阶段 3.1 已安装 `epubjs` 0.3.93 到 `@reader/desktop`；npm 包自带类型声明，未使用 `@types/epubjs`。
- 阶段 3.1 已新增桌面端 `EpubReaderAdapter`，通过动态 import 加载 `epubjs`，封装 open、close、TOC、goTo、currentLocator、setTheme、CFI selection capture 和 highlight/remove spike API。
- 阶段 3.1 已启用 Tauri v2 asset protocol，scope 限定为 `$APPDATA/library/**`；Rust `tauri` 依赖需要同步开启 `protocol-asset` feature，否则 `cargo test` 会在 build script 阶段失败。
- 阶段 3.1 前端 EPUB source 规则：Tauri runtime 下用 `convertFileSrc(book.libraryPath)`，浏览器/e2e fallback 只读取显式 localStorage fixture，不新增前端 fs 插件。
- 阶段 3.2 已将 `ReaderShell` 拆为通用阅读壳、TXT 内容层和 EPUB 内容层；EPUB 与 TXT 共享顶部栏、主题面板、目录侧栏和专注模式。
- 阶段 3.2 EPUB 从书架直接进入阅读器，PDF 仍保留后续阶段提示；EPUB 内容层提供固定渲染 host、上一页/下一页、目录跳转、加载态和错误态。
- 阶段 3.2 EPUB adapter 的 `relocated` 回调不能依赖 React state 里的 TOC 数组 identity，否则 adapter 打开后更新 TOC 会触发 open effect 重跑；当前使用 ref 读取最新 TOC。
- 阶段 3.3 EPUB 主题映射覆盖 iframe 内 `html`、`body`、正文容器、段落、链接、选区和高亮类；`html` 与 `body` 都设置背景，避免暗色主题 iframe 边缘露白。
- 阶段 3.3 EPUB 主题变化通过现有主题面板即时调用 adapter `setTheme`，不重开书籍；TXT 主题 CSS 变量行为保持原样。
- 阶段 3.4 Rust 后端 `ReaderProgress.locator` 已从 TXT 专用 struct 改为 `Locator` enum，当前支持 `txt` 和 `epub` 两种 kind；`reading_progress` SQLite 表保持不迁移。
- 阶段 3.4 `save_reading_progress` 会按书籍格式校验 locator：TXT 只接受 `txt`，EPUB 只接受 `epub`，PDF 继续返回后续阶段不支持。
- 阶段 3.4 EPUB 进度保存会规范化 `progress` 和 locator `progression` 到 `0..1`，并要求至少存在 href 或 cfi；打开时 adapter 已优先恢复 CFI，其次 href。
- 阶段 3.5 EPUB 高亮预研结论：epub.js `selected` 事件可以提供 `cfiRange`，`book.getRange(cfiRange)` 可用于提取选中文本和同一 DOM 上下文，`rendition.annotations.highlight/remove` 可按 CFI 添加和移除高亮。
- 阶段 3.5 EPUB 高亮限制：CFI 依赖书籍内容结构，导入副本变化或书籍重新打包可能导致旧 CFI 无法定位；上下文提取应作为辅助恢复信息，不能替代 CFI。
- 阶段 3.5 阶段 5 建议：标注保存 `locator.kind = "epub"`、`cfi`、`href`、`selectedText`、`contextBefore`、`contextAfter`、颜色和用户笔记；打开 EPUB 后按书籍标注列表重放 `annotations.highlight`，删除时调用 `annotations.remove(cfiRange, "highlight")`。
- 阶段 3 E2E 使用 Playwright 页面上下文生成无压缩最小 EPUB ZIP Blob，避免提交版权不明或二进制书籍样本；adapter 显式设置 `openAs: "epub"`，让 Blob URL 和 Tauri asset URL 都按 EPUB 归档打开。
- 阶段 3 视觉检查发现主题面板在桌面/窄屏可能覆盖 EPUB host；修正为桌面端为固定面板预留右侧空间，窄屏将面板放入文档流，最终截图确认不再重叠。
- 阶段 3.x EPUB 百分比一直为 `0%` 的根因是 adapter 未调用 `book.locations.generate(...)`；epub.js 在未生成 locations 时无法给 `currentLocation()` 提供全书 percentage/location index。
- 阶段 3.x EPUB 页码口径采用全书合成页码：`page = location index + 1`，`totalPages = book.locations.length()`；locations 生成前不显示假百分比，进度条禁用并保留上一页/下一页可用。
- 阶段 3.x 进度条拖动需要拆成预览和提交：拖动时只用 `book.locations.cfiFromPercentage()` 和 spine href 计算页码/目录预览；松手后才调用一次 `rendition.display(cfi)`，避免拖动过程中连续重排 EPUB iframe。
- 阶段 3.x 单页/双页视图通过 `rendition.spread("none" | "auto")` 实现；当 EPUB host 宽度小于约 860px 时保留用户双页偏好但实际渲染回退单页。
- 阶段 3.x 文字复制失败的直接原因是 `selected` 事件捕获后调用了 `removeAllRanges()` 清空 iframe 选区；移除该调用并在 EPUB iframe 主题 CSS 中设置 `user-select: text` 后，浏览器原生复制不再被 adapter 主动破坏。
- 阶段 3.x epub.js `rendition.resize()` 不能在 `display()` 完成前调用，否则可能出现 `Cannot read properties of undefined (reading 'resize')`；spread resize 需要等待 rendition manager 可用，初始位置报告也要等 currentLocation 存在。
- 阶段 3.x Focus 模式 EPUB 底部空白偏大的原因是隐藏顶部栏后仍沿用普通阅读视口的底部 padding 和控制条间距；本轮用 Focus 专属 padding、页面高度计算和更紧凑的 EPUB 控制条扩大正文高度。
- 阶段 3.x EPUB 倒数第二页点击 Next 无法进入最后一页的原因是 epub.js 原生 `rendition.next()` 在最后合成页边界可能 no-op；本轮只在倒数第二页及之后用 `book.locations.cfiFromLocation(totalPages - 1)` 补偿跳转，普通翻页仍保留原生路径。
- 阶段 4.1 已安装 `pdfjs-dist` 6.0.227 到 `@reader/desktop`，包许可证为 Apache-2.0，现代构建包含 `build/pdf.worker.mjs`、`cmaps/` 和 `standard_fonts/`。
- 阶段 4.1 PDF.js worker 使用 `pdfjs-dist/build/pdf.worker.mjs?url` 交给 Vite 构建；CMap 和 standard fonts 通过本地 Vite 插件在 dev 时从 `node_modules/pdfjs-dist` 服务，build 后复制到 `dist/pdfjs/`。
- 阶段 4.1 PDF source 规则与 EPUB 对齐：Tauri runtime 下用 `convertFileSrc(book.libraryPath)`，浏览器/e2e fallback 只读取显式 localStorage `reader:fallback:pdfSources`，不新增前端 fs 权限。
- 阶段 4.1 `PdfReaderAdapter` 放在 `apps/desktop/src/pdf`，PDF.js 依赖 DOM/canvas，不进入 `packages/core`；`packages/core` 仅扩展纯类型 `PdfLocator.zoomMode`。
- 阶段 4.2 已移除 PDF 打开拦截，PDF 书籍从书架进入 `ReaderShell`，通过 `PdfReaderContent` 渲染 canvas 页面。
- 阶段 4.2 PDF 控件沿用 EPUB 底部控制区风格，支持 `Previous`、`Next`、`Single`、`Double`、页码输入、缩放加减和 `Fit width`。
- 阶段 4.2 在 Vitest 中用 mock adapter 覆盖 PDF 打开、单/双页切换、页码跳转、缩放、适合宽度、进度恢复和保存链路。
- 阶段 4.3 PDF outline 解析支持命名 destination 和显式 destination 数组，页引用通过 `getPageIndex()` 转 1-based `PdfLocator.page`。
- 阶段 4.3 对没有 outline 或 outline 节点不可定位的 PDF 降级为 `Page 1...Page N` 页码目录，避免目录侧栏空置。
- 阶段 4.4 Rust 后端 `Locator` 已新增 `pdf`，`PdfLocator` 支持 `page`、`zoomMode`、`scale` 和 `rects`，继续复用 `reading_progress.locator_json`，不新增 migration。
- 阶段 4.4 PDF 进度保存会将 `page` 至少归一为 1、`scale` 限制到 `0.5..3.0`、非法 rect 过滤、非有限 progress 置空；PDF 书籍只接受 `pdf` locator。
- 阶段 4.5 PDF 标注预研结论：当前 PDF 阅读器只渲染 canvas，浏览器无法基于 canvas 文本做可靠选择；阶段 5 实现 PDF 标注前应先叠加 PDF.js `TextLayer`。
- 阶段 4.5 PDF 高亮 locator 建议保存 `page` + PDF 坐标系 rects + `selectedText/contextBefore/contextAfter`；重放时用 `PageViewport.convertToViewportRectangle()` 转回当前缩放下的 overlay 矩形。
- 阶段 4.5 PDF 风险：扫描版/图片型 PDF 没有文本层，旋转或裁剪页面需要坐标转换测试；跨页选择应拆成多页 rects，MVP 可先交付单页选择和跨页只读回放。
- 阶段 4 E2E PDF fixture 使用 Playwright 页面上下文运行时生成最小 PDF Blob，不提交二进制样本；测试覆盖 canvas 非空、页码跳转、双页、适合宽度和返回书架。
- 阶段 4 E2E 发现 PDF reader 卸载时 ResizeObserver 可能在 adapter close 后触发；修正为先清空 adapter ref 再 close，并对 resize callback 加错误保护。
- 阶段 3/4 体验统一调整确认：EPUB 页码输入继续使用阶段 3.x 的全书合成 locations 页码，不接入 EPUB 原生 page-list；输入页码通过 `(page - 1) / (totalPages - 1)` 换算为 `goToProgress`。
- 阶段 3/4 体验统一调整确认：PDF 进度条按页粒度工作，`progression` 使用 `Math.round(progression * (totalPages - 1)) + 1` 反推 1-based 页码；拖动只预览页码/目录，释放后才提交跳转。
- 阶段 3/4 体验统一调整确认：EPUB/PDF 页码输入都放入进度 meta 行，避免为 EPUB 额外增加一整行控件；PDF 缩放控件继续作为 PDF 专有紧凑行保留。
- 阶段 3/4 体验统一调整确认：非 Focus 模式底部空白主要来自 reader viewport 底部 padding、正文框与控件 gap、控件内部 padding 和 PDF stage 固定 min-height；本轮只压缩普通模式，Focus 专属规则保持既有行为。
- 阶段 3/4 视觉验证：Browser 插件可检查本地书架首屏并确认无 console warning/error，但其只读 evaluate 环境没有 `localStorage`，无法注入 EPUB/PDF fixture；阅读器视觉状态改用项目 Playwright 生成无版权 EPUB/PDF Blob。
- 阶段 3/4 视觉验证结果：EPUB/PDF 桌面和 375x760 视口均无正文/控制区重叠，frame-to-controls gap 为 8px，底部 gap 为 27-28px；PDF canvas 非空，EPUB iframe 存在且 slider/页码输入在 locations ready 后启用。

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
| 阶段 2.3 不引入前端路由库 | 当前只有书架和 TXT 阅读页两种状态，用本地 view state 足够，避免路由范围膨胀 |
| 阶段 2.4 主题设置存在 core/Rust 双默认值 | 将 `defaultReaderTheme` 和 Rust `default_reader_theme()` 对齐，书架字体单独固定为系统 sans |
| 阶段 2.5 进度保存不依赖页码 | 保存 `TxtLocator`，目录跳转和滚动保存 `chapterId` 与全局 `charOffset`，`progress` 仅作辅助比例 |
| 阶段 2.6 虚拟化必须有有界滚动容器 | `reader-shell`/`reader-main` 使用 `100vh`，`reader-viewport` 内部滚动；否则 TanStack Virtual 会把全部段落视为可见 |
| 书架移除删除应用副本但保留原始文件 | 用户原始文件不应被应用破坏；应用书库副本需要随书架记录移除，避免本地存储继续占用空间 |
| 书架更多操作同时支持右键和可见 More 按钮 | 右键满足桌面习惯，可见按钮保证键鼠和可发现性 |
| TXT 大文件本轮不新增分页命令 | 现有接口兼容性较高，前端虚拟索引和滚动保存节流已覆盖用户反馈的跳转、恢复、滚动和目录同步问题 |
| 程序化 TXT 跳转使用 instant scroll | 避免目录跳转和恢复进度时 smooth scroll 放大等待时间，并避免中途滚动事件覆盖保存位置 |
| EPUB adapter 放在 `apps/desktop/src/epub` | epub.js 依赖 DOM/WebView，不进入 `packages/core`，保持 core 纯类型 |
| EPUB 文件由 Tauri asset protocol 暴露给 WebView | 阶段 1 已把导入文件复制到 app data library，限制 asset scope 到该目录能避免给前端广泛 fs 权限 |
| EPUB 阅读 UI 复用阶段 2 阅读壳 | 顶部栏、目录、主题和专注模式保持一致，格式差异收敛到内容层和 adapter |
| EPUB 主题映射使用 adapter 内纯函数测试 | iframe CSS 注入不易在 jsdom 中完整渲染，先用纯映射测试锁定 CSS 输出，再用 App 测试锁定即时调用路径 |
| EPUB 进度复用 `reading_progress.locator_json` | 现有表已经存 JSON；用 `kind` tag 扩展 locator 可兼容旧 TXT 进度并避免阶段 3.4 迁移风险 |
| EPUB 高亮能力先停留在 adapter spike API | CFI selection/highlight 已有可用入口，但完整 CRUD 涉及统一标注表、颜色、列表和重放时机，留到阶段 5 更清晰 |
| EPUB E2E fixture 运行时生成 | 既满足无版权样本要求，也避免仓库里长期维护二进制 fixture；测试仍走真实 epub.js 渲染 |
| 主题面板打开时进入布局状态 | 通过 `reader-shell--theme-open` 控制桌面预留空间和移动端静态排布，避免浮层挡住 EPUB/TXT 内容 |
| EPUB 快速跳转使用 locations 预览模型 | 拖动期间不调用 `rendition.display`，只在释放后跳转一次，能让页码、百分比和目录即时跟随，同时避免 iframe 重排造成卡顿 |
| PDF.js 资源由 Vite 插件服务和复制 | worker 用 Vite URL import；CMap 和 standard fonts 需要稳定 URL，避免 Tauri/WebView 环境下依赖 node_modules 路径 |
| PDF adapter 放在 `apps/desktop/src/pdf` | PDF.js 依赖 DOM/canvas 和 worker，不进入纯 TypeScript core 包 |
| PDF 阅读 UI 复用 EPUB 控制条模型 | PDF 单页/双页、页码、缩放和适合宽度放在正文下方，目录侧栏与主题/专注模式继续由 ReaderShell 管理 |
| PDF 双页偏好与实际渲染分离 | 用户可保持 `Double` 偏好；窄屏或可用宽度不足时 adapter 返回 single rendered mode，窗口变宽后恢复双页 |
| PDF outline 解析失败不阻断打开 | outline 常含外部 URL 或不可解析 destination；节点不可定位时跳过或保留可定位子项，整本书最终仍可用页码目录 |
| PDF 进度继续走 JSON locator 扩展 | 现有 `reading_progress.locator_json` 已能承载格式区分，不需要为 page/scale/rects 新增 SQLite migration |
| PDF 标注阶段不在阶段 4 交付 CRUD | 稳定阅读优先；标注需要文本层、矩形坐标转换、跨页选择和统一 annotations 表协同，放到阶段 5 更可控 |

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
| Playwright 长文本测试首次发现 `.reader-virtual-row--paragraph` 数量为 240 | 修正阅读器布局高度约束后重跑 e2e 通过，段落 DOM 数量低于 80 |
| `pnpm.cmd --filter @reader/desktop add epubjs@^0.3.93` 首次返回 `ERR_PNPM_IGNORED_BUILDS` | 运行 `pnpm.cmd approve-builds core-js es5-ext` 后重跑 `pnpm.cmd install` 通过 |
| 启用 Tauri asset protocol 后 `cargo test` 提示 allowlist 与依赖 feature 不匹配 | 在 `apps/desktop/src-tauri/Cargo.toml` 为 `tauri` 添加 `protocol-asset` feature |
| 阶段 3.2 EPUB 内容层测试触发 `Maximum update depth exceeded` | `relocated` 回调用 ref 读取 TOC，避免 TOC state 更新改变回调 identity 并重复打开 EPUB |

## 资源

- `DEVELOPMENT.md`
- `README.md`
- `task_plan.md`
- Build Web Apps React best practices 摘要：关注按需加载、长列表/长文本渲染、减少重渲染、避免重依赖进入首屏包。

## 视觉/浏览器发现

- 阶段 1 Browser QA 使用 `http://127.0.0.1:1420/` 检查书架首屏：桌面和窄屏均显示左侧/顶部导航、导入按钮、空书架状态，无旧空壳文案、无 Vite overlay、无 console warning/error。
- 视图切换交互验证通过：点击 `List` 后 `List` 的 `aria-pressed` 为 `true`，`Grid` 为 `false`。
- 阶段 2 Browser QA 使用 `http://127.0.0.1:1420/` 检查书架首屏：1280x800 桌面布局左侧窄栏、导入按钮、空状态不重叠；约 375x760 窄屏顶部导航、导入按钮、空状态纵向排列正常。
- 阶段 2 Playwright seeded TXT smoke 验证阅读页可打开长 TXT fixture、主题切换可保存到 UI 状态、返回书架可用，虚拟化段落 DOM 数量低于 80。

---
*每执行2次查看/浏览器/搜索操作后更新此文件*
*防止视觉信息丢失*
