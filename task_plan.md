# PC 端本地电子书阅读器分阶段开发计划

## 目标
基于 `DEVELOPMENT.md` 的技术路线，按可验证、可合并、可回滚的小阶段推进 Windows-first 桌面 MVP，并为后续跨平台和移动端共享逻辑保留空间。

## 当前阶段
规划基线已建立；下一步进入阶段 0：项目骨架。

## 分支策略

| 分支 | 用途 | 规则 |
|------|------|------|
| `main` | 稳定主线 | 只合入已验证的阶段成果、规划文档和发布修复 |
| `codex/v0.1.0-mvp-integration` | MVP 集成分支 | 每个小阶段完成后合入此分支，统一跑端到端验证 |
| `codex/stageN-*` | 小阶段功能分支 | 从最新集成分支拉出，单一目标开发，完成后合回集成分支 |
| `release/v0.1.0` | 首版发布候选 | Windows 打包、安装、升级验证通过后从集成分支切出 |

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
| 0.3 共享模型基线 | `codex/stage0-core-models` | pending | 待执行 |
| 0.4 Rust 与 SQLite 基线 | `codex/stage0-rust-sqlite` | pending | 待执行 |
| 0.5 质量门禁 | `codex/stage0-quality-gates` | pending | 待执行 |

## 大阶段 1：本地书库与导入链路

目标：实现本地优先的数据闭环：选择文件、导入、去重、入库、展示、重启恢复。

| 小阶段 | 分支 | 工作内容 | 验收 |
|--------|------|----------|------|
| 1.1 数据 schema 和迁移 | `codex/stage1-db-schema` | 落地 `books`、`reading_progress`、`bookmarks`、`annotations`、`app_settings` schema；建立迁移执行和版本记录 | migration 测试通过；重复执行迁移幂等 |
| 1.2 文件导入命令 | `codex/stage1-import-command` | 实现 Tauri `import_book(path)`，校验扩展名、计算 hash、复制到应用数据目录、写入 `books` | Rust 单测覆盖 hash、重复导入、非法文件 |
| 1.3 书架 UI | `codex/stage1-bookshelf-ui` | 实现打开即书架：左侧窄栏、书籍网格/列表、空状态、最近阅读入口 | 组件测试覆盖空状态和列表渲染；无营销落地页 |
| 1.4 导入交互 | `codex/stage1-import-flow` | 接入 Tauri dialog/fs 插件；支持 EPUB/TXT/PDF 选择、导入反馈、重复文件提示 | Playwright 或 Tauri smoke 验证导入样本文件后书架出现记录 |
| 1.5 持久化恢复 | `codex/stage1-library-persistence` | 应用重启后从 SQLite 加载书库；记录 `last_opened_at` | 重启后书籍仍存在；最近阅读排序稳定 |

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

## 大阶段 3：EPUB 阅读器

目标：集成成熟 EPUB 渲染生态，并复用阶段 2 的阅读壳、主题、目录和进度模型。

| 小阶段 | 分支 | 工作内容 | 验收 |
|--------|------|----------|------|
| 3.1 EPUB 适配器 | `codex/stage3-epub-adapter` | 集成 `epubjs`，封装 `EpubReaderAdapter`，实现 open/close/toc/goTo/currentLocator | 可打开公版 EPUB；目录可读取 |
| 3.2 EPUB 阅读 UI | `codex/stage3-epub-reader-ui` | 将 EPUB 渲染接入 `ReaderViewport`，支持章节跳转和布局适配 | 从书架打开 EPUB，目录跳转成功 |
| 3.3 EPUB 主题映射 | `codex/stage3-epub-theme` | 把 `ReaderTheme` 映射到 epub.js 样式；保持 TXT/EPUB 设置体验一致 | 字号、行高、背景、夜间模式对 EPUB 生效 |
| 3.4 EPUB 进度恢复 | `codex/stage3-epub-progress` | 实现 `EpubLocator`，保存 href、CFI、progression | 重启后恢复到章节内位置 |
| 3.5 EPUB 高亮预研 | `codex/stage3-epub-highlight-spike` | 验证 CFI 高亮定位、选中文本和上下文保存策略 | 形成可实现结论并更新 `findings.md` |

## 大阶段 4：PDF 阅读器

目标：以稳定阅读为优先，提供页码、缩放、目录和进度恢复；复杂标注能力可以渐进。

| 小阶段 | 分支 | 工作内容 | 验收 |
|--------|------|----------|------|
| 4.1 PDF.js 接入 | `codex/stage4-pdf-adapter` | 集成 `pdfjs-dist`，处理 worker 配置和本地文件加载 | 可打开公版 PDF；worker 加载无控制台错误 |
| 4.2 页面导航和缩放 | `codex/stage4-pdf-navigation` | 实现页码跳转、上一页/下一页、缩放、适合宽度 | 页码与缩放状态稳定 |
| 4.3 PDF outline | `codex/stage4-pdf-outline` | 解析 PDF outline 到 `TocItem[]`；无 outline 时降级为页码列表 | 有目录样本可跳转；无目录样本可使用 |
| 4.4 PDF 进度恢复 | `codex/stage4-pdf-progress` | 实现 `PdfLocator`，保存 page、scale、可选 rects | 重启恢复页码和缩放 |
| 4.5 PDF 标注策略 | `codex/stage4-pdf-annotation-spike` | 评估文本选择高亮与矩形区域高亮；决定 MVP 范围 | 更新 `findings.md`，避免阻塞首版 |

## 大阶段 5：书签、高亮、想法与检索

目标：统一 EPUB/TXT/PDF 的标注体验，让笔记可以被保存、浏览、跳回原文。

| 小阶段 | 分支 | 工作内容 | 验收 |
|--------|------|----------|------|
| 5.1 书签能力 | `codex/stage5-bookmarks` | 支持添加、删除、列表展示和跳转书签 | 三种格式至少有基础书签跳转 |
| 5.2 选中菜单 | `codex/stage5-selection-menu` | 实现选中文字后的高亮、复制、添加想法菜单；避免遮挡选择区域 | 选择文本后菜单位置稳定 |
| 5.3 高亮保存 | `codex/stage5-highlights` | 保存颜色、selectedText、locator、contextBefore/After | 重启后高亮和列表仍存在 |
| 5.4 想法/笔记 | `codex/stage5-notes` | 支持给高亮添加和编辑笔记；`NotesPanel` 列表按书籍过滤 | 笔记增删改查测试通过 |
| 5.5 搜索基础 | `codex/stage5-search-basic` | TXT/EPUB 支持书内搜索；PDF 搜索视复杂度择机进入 | 搜索结果可跳转，空结果有明确状态 |

## 大阶段 6：阅读体验完善与可访问性

目标：将 MVP 从“功能可用”推进到“长时间阅读舒适”，重点处理快捷键、响应式、状态细节和性能。

| 小阶段 | 分支 | 工作内容 | 验收 |
|--------|------|----------|------|
| 6.1 快捷键和输入 | `codex/stage6-keyboard` | 左右翻页、Esc 关闭面板、Ctrl+F 搜索、阅读页焦点管理 | 快捷键不会误触输入框 |
| 6.2 布局响应式 | `codex/stage6-responsive-layout` | 宽屏、窄窗口、高 DPI 下侧栏、正文、面板不重叠 | Playwright 截图检查关键视口 |
| 6.3 性能优化 | `codex/stage6-performance` | 按需加载 PDF/EPUB 重依赖；避免 React 级联重渲染；缓存解析结果 | 初始包体和阅读交互性能符合预期 |
| 6.4 错误和空状态 | `codex/stage6-error-states` | 导入失败、文件丢失、解析失败、数据库失败的用户可理解提示 | 常见失败路径有可恢复操作 |
| 6.5 隐私和数据位置文档 | `codex/stage6-privacy-docs` | 写明本地数据库、书库副本、日志位置；默认不上传数据 | README/docs 可说明数据存放和删除方式 |

## 大阶段 7：Windows 打包与首版发布

目标：完成 Windows 安装包、文件关联、升级路径和发布检查。

| 小阶段 | 分支 | 工作内容 | 验收 |
|--------|------|----------|------|
| 7.1 应用元信息 | `codex/stage7-app-metadata` | 配置应用名称、图标、版本号、bundle identifier、窗口默认尺寸 | 构建产物显示正确名称和图标 |
| 7.2 Windows installer | `codex/stage7-windows-installer` | 配置 Tauri Windows 安装包；验证安装、卸载、重装 | `pnpm.cmd --filter @reader/desktop tauri:build` 成功 |
| 7.3 文件关联 | `codex/stage7-file-associations` | 配置 `.epub`、`.txt`、`.pdf` 文件关联和打开参数 | 双击关联文件能进入导入或打开流程 |
| 7.4 升级验证 | `codex/stage7-upgrade-check` | 验证旧版本数据库和书库在新版本中可继续使用 | 模拟升级后数据不丢失 |
| 7.5 发布清单 | `codex/stage7-release-checklist` | 创建发布 checklist、许可证核查、第三方依赖说明 | `release/v0.1.0` 可作为候选发布分支 |

## 大阶段 8：v0.2 预留方向

目标：不阻塞 MVP，但提前明确后续方向，避免首版架构封死。

| 小阶段 | 分支 | 工作内容 | 验收 |
|--------|------|----------|------|
| 8.1 MOBI/AZW3 方案评估 | `codex/stage8-mobi-azw3-research` | 评估导入时转换为 EPUB、外部工具许可、体积和分发方式 | 形成方案文档，不进入 v0.1 默认功能 |
| 8.2 跨平台适配 | `codex/stage8-cross-platform-prep` | 梳理 macOS/Linux 路径、文件权限、打包差异 | 不影响 Windows MVP |
| 8.3 移动端共享核心 | `codex/stage8-mobile-shared-core` | 评估 `packages/core` 与未来 React Native/Expo 的边界 | 共享类型不依赖 Tauri 或 DOM |
| 8.4 数据导出 | `codex/stage8-export-data` | 设计书签、笔记、进度导出格式 | 为未来同步前置，不做云服务 |

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
2. TXT 解码和章节识别放在 Rust 后端还是 TypeScript reader-engine，需要在阶段 2.1 前确定。
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

## 遇到的错误

| 错误 | 尝试次数 | 解决方案 |
|------|---------|---------|
| 暂无 | 0 | 暂无 |

## 备注

- 任何外部资料、依赖许可、渲染器行为发现应写入 `findings.md`，不要直接塞入本计划。
- 每完成一个小阶段，应更新本文件对应状态或在阶段表旁追加完成记录。
- 如果后续从 `main` 创建 `codex/v0.1.0-mvp-integration`，应先确认 `main` 已包含本计划和 `DEVELOPMENT.md`。
