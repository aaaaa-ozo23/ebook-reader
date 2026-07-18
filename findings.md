# 发现与决策

## 2026-07-19 大阶段 14.1：MOBI/AZW3 引擎与分发评估

- **已批准决策：** 正式离线支持采用 libmobi v0.12，作为 Tauri Windows x64 sidecar 随应用分发；Calibre、KindleUnpack、foliate-js 仅保留为决策对比，不进入正式实现。
- **范围：** 只开放 `.mobi`、`.azw3`；加密文件必须在 sidecar 前拒绝，应用不提供密码、密钥或 DRM 去除路径。
- **仓库基线：** 远端 `v0.2.0` tag 已发布，`main`/`origin/main` 为 `ed72614`；已从该提交创建并推送 `codex/v0.3.0-integration`，当前阶段分支为 `codex/stage14-mobi-azw3-evaluation`。
- **UI 工作流：** 现有 Stage 13 暖纸、深墨、青绿、琥珀系统是硬规格；14.3 先出四组状态板并审核，再编码和执行 Browser/截图 fidelity 对照。
- **用户文件边界：** `.codex/` 与 `AGENTS.md` 保持未跟踪，不纳入阶段提交。
- **上游现状（2026-07-19 核验）：** libmobi 官方仓库最新 release 仍为 v0.12（2024-06-17），README 明确覆盖 MOBI 与 KF8/AZW3、Windows MinGW/MSVC，并允许以 `--with-zlib=no` / `--with-libxml2=no` 使用内置 miniz/xmlwriter；许可证为 LGPL-3.0-or-later。
- **分发形态：** Tauri 2 官方 sidecar 通过 `bundle.externalBin` 和目标三元组命名嵌入；本项目只从 Rust 后端启动 sidecar，不向 WebView 暴露任意 shell capability。
- **来源校验：** 官方 release archive 为 2,653,654 bytes / SHA-256 `9A6FB2C5…BF7E7`；detached signature 通过，primary fingerprint `B1ED4008…1675C`、signing subkey `DCBC81C5…15322`。
- **可重复构建：** MinGW GCC 8.1.0、静态 libmobi、内置 miniz/xmlwriter、`encryption=no`；两次独立干净构建均得到 296,129 bytes / `438576B7…47CF1`。PE 为 x64，仅导入 KERNEL32/msvcrt；help 保留 `-e` EPUB 和默认 KF8、无 password/decrypt 参数。
- **体积门：** v0.2.0 baseline NSIS 7,373,692 → 7,485,002（+111,310）；MSI 9,461,760 → 9,601,024（+139,264）；installed footprint +296,129，均远低于 10 MiB/20 MiB 门槛。
- **14.1 结论：** go。可进入 14.2；仍不授权 DRM、其他 Kindle 扩展、直接 MOBI reader adapter 或 14.4。

## 2026-07-19 大阶段 14.2：隔离转换原型

- **阶段边界：** 原型只接收 source path、operation ID、staging root、取消 token 和 converter path；成功返回已验证 EPUB descriptor，失败/取消/超时清理 staging，不写数据库或正式 library。
- **上游 fixture：** libmobi v0.12 源码包自带 LGPL 测试样本，包括 `sample-ncx.mobi`（MOBI 8 hybrid / KF8 default / NCX）、`sample-multimedia.mobi`、Unicode 样本和 DRM 样本；将只复制必要的合成测试文件并保留来源/许可证说明，不引入商业电子书。
- **真实行为：** bundled `mobitool -e -o <dir> sample-ncx.mobi` 已生成单个 `sample-ncx.epub`，日志确认 title、language、MOBI 8 hybrid 与默认 KF8；输出可被后端安全验证后交给现有 EPUB adapter。
- **预检契约：** 现代 MOBI/KF8 使用 `BOOKMOBI`，旧 PalmDOC DRM v1 样本使用 `TEXtREAd`；预检接受两者仅为读取 record 0 的 big-endian encryption type，非 0 必须在启动 sidecar 前返回 `mobi-drm-unsupported`，不提供密码或解密回退。
- **Windows 参数边界：** canonical path 继续用于来源安全校验；MinGW sidecar 不接受 Windows `\\?\` verbatim 前缀，因此仅在 `Command` 参数构造处转换成等价普通 drive/UNC path，不经过 shell，也不降低 canonical containment 检查。
- **真实转换矩阵：** MOBI 8 hybrid 默认 KF8、改扩展名 `.azw3`、NCX/OPF 元数据、多媒体图片、临时注入的 UTF-8 中文正文均转换并通过 EPUB verifier；PalmDOC DRM v1 在 sidecar 前拒绝。
- **资源测量：** 三个上游合成样本耗时 53–181 ms，峰值 working set 3,194,880–5,885,952 bytes；bundled sidecar hash 保持 `438576B7…47CF1`。小样本不代表普遍性能，生产仍使用 120 秒 timeout 和阶段式进度。
- **14.2 结论：** go。服务不接收数据库/正式书库句柄，失败、取消、超时、converter 非零退出和验证失败均不留下 operation 目录；完整报告见 `docs/architecture/mobi-conversion-spike.md`。

## 需求

- 基于 `DEVELOPMENT.md` 制定更具体的分阶段开发计划。
- 计划需要覆盖大阶段、小阶段、每个小阶段的开发分支、工作内容和验收标准。
- 检查当前工作目录下依赖和工具是否正常。
- 若检查无问题，将规划文件和相关文档提交并推送到远程仓库。

## 研究发现

### 2026-06-30 大阶段 7 发布基线

- `main` 与 `origin/main` 一致；`codex/v0.1.0-mvp-integration` 内容与 main 相同，仅缺少 main 的合并提交。
- 根 package、desktop package、Cargo 和 Tauri 当前版本均为 `0.0.0`；旧 release EXE、MSI、NSIS 也为 0.0.0。
- 当前没有文件关联、single-instance 或 updater 实现；v0.1.0 采用 MSI/NSIS 覆盖安装升级，不加入应用内 updater。
- 本机没有 Windows 代码签名证书，首版按未签名包发布并提供 SHA-256 与 SmartScreen 提示。
- 用户数据已完整备份至 `D:\tl-temp\ebook-reader-stage7-backup-20260630-225613`：Roaming 6 文件 / 21,505,580 bytes，Local 362 文件 / 39,615,213 bytes；原应用数据目录已清空。
- 0.0.0 升级基线 MSI/NSIS 已保存到同一备份目录的 `upgrade-fixtures`，SHA-256 写入 `backup-manifest.json`。
- Image Gen 生成的正式图标源图经内置色键流程处理为 1254×1254 RGBA PNG；四角 alpha 为 0，有效主体 bbox 为 `(187, 192, 1066, 1039)`，暖橙书页与深灰书脊在透明背景下边缘完整。
- Tauri 图标生成后的 32×32 和 128×128 PNG 已视觉检查：书本轮廓、翻页负形和橙/深灰对比在小尺寸均清楚；不再使用默认 Tauri 图标。
- 当前 shell 中 Codex bundled pnpm 使用 Node 24.14.0，因此会提示项目 `>=26.1.0` engine warning；版本检查、Prettier 和 desktop production build 均实际通过，该 warning 不影响产物。
- 7.2 干净构建产出 EXE 15,773,696 bytes、NSIS 5,713,270 bytes、MSI 7,221,248 bytes，三者版本均为 0.1.0；MSI Manufacturer 为 `Ebook Reader Contributors`，UpgradeCode 为 `{8F58B45A-3CE9-5D50-9D17-C523C621A7C5}`。
- EXE 内嵌图标已提取到 `D:\tl-temp\ebook-reader-stage7-exe-icon.png` 并视觉检查通过。
- NSIS currentUser 安装到 `%LOCALAPPDATA%\Ebook Reader`，注册表版本/发布者正确；首次启动创建 schema 3 数据库且 books=0，静默卸载清除程序目录但不主动删除用户数据。
- MSI 默认静默安装首次返回 1603；显式传入 `ALLUSERS=2 MSIINSTALLPERUSER=1` 后日志确认 dual-mode per-user 且安装成功，启动 books=0、卸载和目录清理均通过。MSI 详细日志位于 `D:\tl-temp\ebook-reader-stage7-msi-install.log`。
- Tauri NSIS 为 `.epub`、`.txt`、`.pdf` 写入 HKCU `Software\Classes` ProgID 与 `shell\open\command`，三者都指向安装目录中的 `ebook-reader-desktop.exe "%1"`。
- NSIS 与 MSI 的 0.0.0 → 0.1.0 覆盖升级均保留 schema 3、4 本书、4 条进度、1 个 QA 书签、64 条标注（其中 9 条未删除）、2 项设置及全部 4 个书库副本；主题 JSON 和 328px 侧栏宽度也与基线一致。
- MSI 升级验证必须每次从只读原始备份重建 QA 数据；重用前一个原生 QA 的工作数据库会把后续交互写入误判为升级丢数据。
- v0.1.0 锁定依赖许可审计覆盖 285 个 pnpm 包与 487 个 Cargo workspace/传递包；补齐应用自身 MIT SPDX 后，两边均无 unknown 或缺失许可字段。
- pnpm 中 MPL-2.0 的 axe-core 和 CC-BY-4.0 的 caniuse-lite 仅属于开发/测试；运行时 epub.js 为 BSD-2-Clause、PDF.js 为 Apache-2.0，JSZip 选用 MIT 选项，未发现与 MIT 项目分发冲突。
- Stage 7 Build Web Apps Browser QA 在 `http://127.0.0.1:1420/` 验证空书架：1280×720 桌面和 375×760 窄屏均有完整首屏、无 framework overlay、无 console warning/error；List 切换后 `aria-pressed=true`。
- 375×760 下 body/document clientWidth 与 scrollWidth 均为 360px，无横向溢出；视觉截图保存于 `D:\tl-temp\ebook-reader-stage7-browser-desktop.png` 和 `D:\tl-temp\ebook-reader-stage7-browser-mobile-375x760.png`。
- `release/v0.1.0` 候选构建在清理旧 release EXE/bundle/NSIS/WiX 后成功；EXE 15,825,920 bytes、NSIS 5,730,928 bytes、MSI 7,237,632 bytes，三者时间均晚于候选提交。
- 候选 MSI 的 ProductVersion=0.1.0、Manufacturer=`Ebook Reader Contributors`、UpgradeCode=`{8F58B45A-3CE9-5D50-9D17-C523C621A7C5}`；候选 NSIS 安装/启动后 EXE 为 0.1.0、books=0、library 测试书文件=0。
- GitHub Release 已发布到 `https://github.com/aaaaa-ozo23/ebook-reader/releases/tag/v0.1.0`；为 Latest、非 draft、非 prerelease，标签指向 main 的 `9e27e93a6ec6552772eba10f86b731a84a627e85`。
- GitHub 会把 asset 文件名中的空格规范化为点号；最终下载名为 `Ebook.Reader_0.1.0_x64-setup.exe`、`Ebook.Reader_0.1.0_x64_en-US.msi` 与 `SHA256SUMS.txt`，发布说明和校验文件已同步。
- 最终 NSIS SHA-256 为 `8B3703F6831CC2F9B725FBAEC3395922BB526E154C0F72BC32BBEAC4D360EDCD`，MSI 为 `DB08502EFCDD30C4AA78EC96137777409AC2C57C9DCA61A48B2911D96AEE87BB`；GitHub 远程 `SHA256SUMS.txt` 与本地最终文件逐字匹配。
- 真实关联 QA：EPUB 经 Windows Shell 冷启动成功，数据库写入并更新 `last_opened_at`；运行中向安装 EXE 传入 TXT/PDF 后第二实例退出码 0、主实例始终只有 1 个，两种文件均导入并打开。
- 重复传入同一 TXT 后 books 计数保持 1，`last_opened_at` 从 `15:25:22.680Z` 更新到 `15:25:55.256Z`，证明 duplicate 路径直接打开已有记录。

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
- 阶段 5 启动确认：SQLite 初始迁移已包含 `bookmarks` 和 `annotations` 表；当前 Rust/Tauri 层尚未实现书签或标注 CRUD 命令，前端 `tauri/reader.ts` 也只有阅读进度/主题/source 相关 bridge。
- 阶段 5 启动确认：`packages/core` 已有 `Annotation`、`LocatorContext`、`TxtLocator`、`EpubLocator`、`PdfLocator`；缺少 `Bookmark` 类型，TXT locator 也缺少可表达选区终点的可选字段。
- 阶段 5 启动确认：EPUB adapter 已有 `onSelected`、`addHighlight`、`removeHighlight` 入口；PDF adapter 仍是 canvas-only，用户可见 PDF 选区/高亮前需要叠加 PDF.js `TextLayer`。
- 阶段 5.1 书签实现确认：现有 `bookmarks` 表字段足够承载 MVP 书签，`locator_json` 可保存 TXT/EPUB/PDF union locator，因此本阶段未新增 migration。
- 阶段 5.1 书签实现确认：书签创建复用 `normalize_locator_for_book`，该函数文案已从阅读进度专用改为通用 locator 校验；后续 annotations CRUD 可以复用同一校验入口。
- 阶段 5.1 书签 UI 确认：ReaderShell 侧栏已扩展为 tabs，但 `Notes` 和 `Search` 先显示空状态；后续 5.4/5.5 在同一侧栏 panel 内填充，不需要另起面板体系。
- 阶段 5.2 选区实现确认：TXT 选区 MVP 限定在同一个虚拟块内，使用块文本中的 selectedText 首次出现位置计算 `charOffset/endCharOffset`；跨块/跨章节 selection 当前返回 null。
- 阶段 5.2 选区实现确认：EPUB selection 菜单依赖 epub.js CFI range 和当前 `EpubPosition.locator.href`；`handleRelocated` 必须同步更新 position ref，否则 selected 事件紧跟 relocated 时无法生成 locator。
- 阶段 5.2 PDF text layer 确认：`pdfjs.TextLayer` 可直接从 display API 动态 import 使用；TextLayer 覆盖 canvas 后可产生 DOM selection，rect 通过 `PageViewport.convertToPdfPoint()` 转成 PDF 坐标系。
- 阶段 5.2 PDF selection 限制：当前仅接受同一个 `.reader-pdf-text-layer` 内的选区；跨页选择暂不显示菜单，符合阶段 5 MVP 的单页 PDF 高亮范围。
- 阶段 5.3 高亮实现确认：现有 `annotations` 表字段足够承载 MVP 高亮，`locator_json` 存 TXT/EPUB/PDF union locator，未新增 SQLite migration。
- 阶段 5.3 后端确认：annotations CRUD 复用 `normalize_locator_for_book`，能拒绝格式不匹配 locator；删除 annotation 使用 `deleted_at` 软删除，删除 book 仍通过外键级联移除关联记录。
- 阶段 5.3 TXT 高亮重放口径：仅重放当前虚拟块内与 `[charOffset, endCharOffset)` 相交的 highlight；跨块 selection 仍由 5.2 选择层拒绝，后续如需跨段高亮可拆多条 locator 或扩展范围模型。
- 阶段 5.3 EPUB 高亮重放口径：打开书籍后按 annotation CFI 调用 `rendition.annotations.highlight`，颜色由 annotation `color` 提供；删除/更新时用 CFI 集合差异移除旧高亮。
- 阶段 5.3 PDF 高亮重放口径：保存 PDF 坐标系 rect，重放时用当前缩放下 `PageViewport.convertToViewportRectangle()` 计算 overlay；扫描版 PDF 无 text layer 时不会产生新高亮。
- 阶段 5.3 UI 确认：selection menu 保留 `Highlight` 默认黄色按钮，并提供黄/绿/蓝/粉色 swatch；EPUB/PDF/TXT 共享创建入口，PDF 保留缩放控件不变。
- 阶段 5.4 Notes 面板确认：不新增 notes 表；`annotations.note` 直接承载用户想法，`type="note"` 表达从选区直接创建的想法记录，`type="highlight"` 也可通过同一面板追加 note。
- 阶段 5.4 Notes 跳转确认：列表跳转复用 ReaderShell 的 locator 跳转入口，因此 TXT 会同步保存阅读进度，EPUB/PDF 交给各自 adapter goTo；删除 annotation 后高亮重放会通过前端 state 立即消失。
- 阶段 5.5 搜索确认：统一 Search 面板由 ReaderShell 管理；TXT 搜索直接扫描已加载文档，EPUB/PDF 在 adapter 打开后注册 search provider，避免父组件持有格式内部 adapter。
- 阶段 5.5 搜索粒度：TXT 返回字符偏移 locator，EPUB 返回 CFI locator，PDF 返回页级 locator；三格式结果上限均为 100 条，PDF 不做页内定位或 OCR。
- 阶段 5.x polish 发现：TXT 跨段选区不能依赖 `selectedText` 在单个虚拟块内的 `indexOf`；应遍历当前已渲染 `.reader-virtual-row`，用 DOM Range 交集计算每段起止，再汇总为一个 `[charOffset, endCharOffset)` locator。
- 阶段 5.x polish 发现：高亮改色必须走 update/upsert 路径；TXT 可用字符范围 overlap，EPUB 优先 exact CFI 并用 `href + selectedText + context` 兜底，PDF 用同页 rect overlap，否则会产生重复 annotation。
- 阶段 5.x polish 发现：EPUB 高亮重放不能只用 CFI set；需要把 `cfi + color + note + updatedAt + type` 作为 signature，signature 变化时 remove 后重新 add，才能让改色立即反映。
- 阶段 5.x polish 发现：EPUB selection 菜单需要 iframe 内 Range rect 映射到主窗口坐标；只有依赖默认固定位置时，菜单会离选区过远。iframe 内 selection clear、Esc、跳页和外部点击都要关闭浮层。
- 阶段 5.x polish 设计确认：Note 编辑从侧栏迁移到正文浮层后，Focus 模式不会再因为新增/编辑 note 强制打开左侧侧栏；Notes 侧栏只负责浏览、跳转和删除。
- 阶段 5.x polish 可见性确认：note-only annotation 若没有底色必须有独立可见标记；TXT 用 dashed underline span，EPUB 用 `annotations.underline`，PDF 用 dashed rect overlay。
- 阶段 5.x polish 视觉 QA 发现：窄屏下固定宽度浮层不能只 clamp anchor 中心点，否则 `translateX(-50%)` 会让浮层左侧出屏；Note 浮层需要按实际宽度的一半做 X 轴 clamp。

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

## 2026-06-24 阶段 5.x 标注体验二次修复发现

| 发现 | 影响 | 处理 |
|------|------|------|
| Notes 侧栏仍按 `annotationHasNote` 过滤，导致高亮-only 不显示 | 用户无法从侧栏浏览纯高亮 | 改为复用 `isVisibleAnnotation`，显示 highlight-only、note-only、highlight+note 三类未删除记录 |
| TXT/PDF 渲染把所有可见 annotation 都绑定为 button | 点击普通高亮会误打开批注编辑 | 渲染时拆分底色和下划线，只有 note-bearing 范围绑定 click/keyboard |
| TXT 同范围多条 note 旧实现只能进入单条编辑 | 无法看到或新增更多同范围批注 | 新增 `Saved notes` 浮层，按 locator overlap/CFI/rect 匹配同范围 note 列表，并提供 `Add note` |
| EPUB `addHighlight` 仍绑定 click handler | 普通高亮在 EPUB 中也会误开批注 | 普通高亮只做视觉 replay，只有 `addUnderline` 绑定 note popover 入口 |
| EPUB selection 使用整段 `getBoundingClientRect()` | 多行或整段选择时菜单离选中文字偏远 | 改用首个有效 `Range.getClientRects()`，主窗口坐标映射后用 top anchor 贴近浮层 |
| 本轮未暴露 Browser 插件控制工具 | 视觉检查不能走 Browser 插件 | 使用常规 Playwright 启动 Vite，并生成桌面/375x760 截图验证 |
| `tauri:build` 首次因 release exe 被占用失败 | Windows 无法删除正在运行的 `ebook-reader-desktop.exe` | 结束该 release 进程后重跑打包成功 |

## 2026-06-29 EPUB 标注显示修复发现

| 发现 | 影响 | 待处理 |
|------|------|--------|
| EPUB 选区菜单在正文中部选择时仍固定靠近阅读区顶部 | iframe 内选区坐标映射使用了错误参考系或遗漏 iframe/内容容器偏移 | 核对 epub.js contents window、iframe rect 与主窗口坐标的组合方式，并以真实渲染坐标回归 |
| epub.js `annotations.underline` 当前显示为包围文字的虚线矩形 | EPUB 批注提示与 TXT 的单条虚线下划线不一致 | 调整 underline SVG 标注样式/属性，只保留底边虚线并维持点击命中区域 |
| `book.getRange(cfi)` 返回 spine 章节文档中的 Range，不是当前可见 rendition iframe 的 Range | Range rect 不能可靠表示屏幕坐标，菜单会被 clamp 到阅读区顶部 | 选区几何改用 `rendition.getRange(cfi)`；仅在提取文本/上下文时允许回退 `book.getRange(cfi)` |
| iframe 中的 `frameElement` 属于 iframe window realm | 用主窗口 `HTMLElement instanceof` 判断会失败并丢失 iframe 偏移 | 直接调用 `frameElement?.getBoundingClientRect()`，避免跨 realm 类型判断 |
| marks-pane 的 Underline 同时创建透明 `rect` 和底部 `line`，传给父 `g` 的 stroke 会被 rect 继承 | 虚线样式会把透明点击矩形四边也画出来 | 父 `g` 的 stroke-width 设为 0，CSS 只让 line 继承颜色并恢复 2px stroke |
| 桌面全页截图不易辨认细下划线，375x760 首屏正文位于折叠线下 | 全页截图不足以证明本次视觉细节 | 追加选区菜单与批注标记局部截图；自动断言继续检查菜单 4-10px 间距和 SVG rect/line computed style |
| EPUB Playwright 首次用 `document.querySelector("p")` 建立选区时选中了分页列中的屏外首段 | 菜单被视口 clamp 到左侧，批注局部截图落在侧栏，视觉证据无效 | 测试应先按 `getBoundingClientRect()` 找到与 iframe viewport 相交的段落，再建立 Range |
| 分页 EPUB 的 iframe 元素本身可能被横向平移，段落在 iframe viewport 内不等于在主窗口内可见 | 仅检查段落本地 rect 仍会选到主窗口屏外列 | Playwright 应用 `frameElement rect + paragraph rect` 判断主窗口可见性，并增加菜单中心 X 对齐断言 |
| 可见段落回归截图中菜单已水平居中且与选区保持约 6px 间距 | 原“固定在最上面”问题已消除 | 保留 E2E 的 X 中心误差 <=2px、Y 间距 4-10px 断言 |
| 下划线局部截图不再显示左右边框，但顶部疑似仍有一条虚线 | 需要排除多个 SVG line 或相邻容器边界 | 检查当前 annotation group 内全部 rect/line 数量、坐标和 computed style 后再定稿 |
| SVG 诊断确认该 annotation group 只有一个 line 和一个 rect，rect computed stroke 为 none，line 为 `rgb(243, 188, 85)` 且 dash 为 `3px, 3px` | 批注本身只绘制底部虚线，局部图顶部细线来自相邻视觉边界而非矩形标注 | E2E 改为检查所有 rect 无描边、所有 line 有可见虚线，最终视觉与 TXT 的下划线提示一致 |

---
*每执行2次查看/浏览器/搜索操作后更新此文件*
*防止视觉信息丢失*

## 2026-06-29 阶段 6 启动发现

| 发现 | 影响 | 决策 |
|------|------|------|
| `ReaderShell` 只有选区浮层的 Escape 监听，EPUB iframe 键盘事件不会冒泡到主文档 | 左右翻页、Ctrl+F 和 Focus/面板关闭无法形成统一规则 | 在阅读壳建立快捷键路由，并由 EPUB adapter 转发 iframe 键盘事件 |
| 当前移动阅读页把目录和整组工具栏堆在正文上方 | 375px 视口首屏几乎看不到正文，不适合长时间阅读 | 6.2 改为侧滑目录抽屉并压缩窄屏工具栏 |
| `Book.coverPath`/`books.cover_path` 已存在但导入始终写入空值 | 封面功能可复用现有路径字段，无需破坏性迁移 | 新增幂等状态表和封面保存命令，默认背景只作为共享静态资产 |
| 当前生产首屏入口为 309.13 kB / 93.63 kB gzip，阅读器代码静态进入入口 | 需要延迟加载整个 ReaderShell，而不只是 epubjs/pdfjs | 6.3 以入口 gzip 不高于约 80 kB 为目标 |
| React 19 lint 禁止 render 阶段写 ref，但 iframe 回调又必须保持稳定以避免 adapter 重开 | 直接把 UI 状态闭包进快捷键 callback 会让 EPUB effect 反复执行 | 用 effect 同步状态 ref，快捷键 callback 本身保持稳定 |
| `Document` 和 EPUB iframe target 不一定属于主窗口 realm，也不一定实现 `closest()` | `instanceof` 或可选链比较会误判输入目标 | 使用 tagName/isContentEditable 和显式函数存在性检查 |
| Browser 在 375×760 下测得 body scrollWidth 与 clientWidth 同为 360px，console 无 warning/error | 书架窄屏没有横向溢出，现有移动书架样式可继续复用 | 阅读器抽屉状态交由 seeded Playwright 验证 |
| 375×760 seeded TXT 截图显示目录为 323px 侧滑层，正文留在遮罩后且目录标题均单行 | 已消除旧版目录占据正文上方 42vh 的问题 | 保留关闭按钮、遮罩与 `Esc` 三种关闭路径 |
| ImageGen 默认封面原图为 1024×1536、2.89 MB PNG | 直接进入书架会抵消首屏性能优化 | 保留生成原图于 Codex 目录，项目内缩放为 720×1080、119 KB JPEG |
| React StrictMode 会执行一次 effect setup/cleanup 探测 | 只在初始化 ref 时设 true 会让异步封面 worker 的 state 更新被永久丢弃 | mounted effect 每次 setup 都显式设 true，cleanup 再设 false |
| PDF 首页封面可直接复用按需加载的 pdfjs-dist worker | 不必让完整 PDF 阅读器进入书架首屏 chunk | 封面模块只静态引用 worker URL，pdfjs 本体在 pending PDF 处理时动态 import |
| 阶段 6.6 首次在仓库根运行 Cargo 命令找不到 Cargo.toml | 前端验证已通过但 Rust 串联命令中断 | 后续统一在 `apps/desktop/src-tauri` 运行或传 `--manifest-path` |
| 只对 ReaderShell 使用 `React.lazy` 即可把入口 JS gzip 从 96.74 kB 降到 68.42 kB | 阅读壳自身约 29 kB gzip，是超过 80 kB 目标的主要来源 | 继续拆出阅读器 CSS，最终入口 68.46 kB、首屏 CSS 2.77 kB gzip |
| Vitest 的一次性 mock 在 lazy 组件尚未完成加载时可能未被消费 | 过早同步断言会使该 mock 留给下一测试，形成看似跨书籍的数据污染 | 所有 lazy reader 内容断言先等待实际内容/状态出现 |
| reader_cache 同时保存 source_hash 并在读取时 join books.file_hash | 不需要前端主动清理旧解析缓存即可安全失效 | 保存接口从 books 读取当前 hash，读取只返回 hash 匹配记录，删除由外键级联 |
| 书库加载失败原先只写全局 feedback，ShelfBody 仍按空数组显示空书架 | 数据库故障会被误导为“没有书” | 增加独立 libraryError 和 Retry 状态，错误优先于空状态渲染 |
| axe 检出 Import 按钮对比度 3.36:1，TXT/PDF 滚动容器不能键盘聚焦 | 不符合 WCAG 2.2 AA 主流程目标 | 深化按钮背景色，并为实际滚动容器增加 tabIndex=0 和可访问名称 |
| AxeBuilder 扫描 blob EPUB iframe 时 Playwright 可能因跨 frame target 超时 | 出版物正文来自导入文件，不属于应用 UI 可控内容 | 应用壳检查排除 `.reader-epub-host iframe`，保留 EPUB 导航、侧栏、工具栏和面板扫描 |
| 桌面数据根目录由 Tauri `app.path().app_data_dir()` 解析 | 不能在文档中把单一绝对路径写成所有机器都相同 | 记录 identifier 和各平台典型路径，并说明系统配置可能改变 base directory |
| 浏览器 fallback 把测试数据和 data URL 封面放在同一 origin 的 localStorage | 它不是打包桌面的持久化后端，但会影响浏览器 QA 重跑 | 隐私文档单独说明 fallback key 前缀和清理站点数据的方法 |
| Playwright 可用独立 DPR 2 project 复用同一响应式矩阵 | 无需把全部重阅读器 smoke 重跑两次也能覆盖高 DPI 布局 | `chromium-dpr2` 只执行 `responsive.spec.ts`，默认项目继续执行完整 smoke |
| 包脚本内再次调用 `pnpm` 时会按 PATH 重新解析 shim | 仅用绝对路径启动顶层 pnpm 仍可能让子脚本落到 Codex 内置版本 | 最终验收将 Node 26 和用户 npm 目录置于 PATH 最前，顶层与子脚本均使用 pnpm 11.1.2 |

## 2026-06-30 阶段 6.x 封面与目录拖拽修复发现

| 发现 | 影响 | 决策 |
|------|------|------|
| list 默认封面书名使用固定四行截断，且格式徽标占用同一封面空间 | 长中文/英文标题无法完整读取 | 保持 82×123px 封面不变，为默认封面增加独立悬停/键盘聚焦浮层 |
| 目录宽度目前由侧栏内部 range 控件调节 | 与 Codex 的边缘拖拽模型不一致，并额外占用侧栏高度 | 删除 range，在目录右边缘提供全高可拖拽 separator；移动抽屉继续隐藏 |
| 前端和 Rust 都把宽度吸附到 8px | 鼠标无法按连续像素调节 | 改为 240–480px 整数钳制；键盘仍以 8px 调整，旧存储值无需迁移 |
| Browser 在本轮只读页面上下文中无法注入本地书籍 fixture | 空书架可验证壳层与视图切换，但封面悬停和阅读器拖拽需要 seeded 状态 | Browser 先完成页面身份、DOM、console、桌面/375px 截图和 List 交互；目标数据态由项目 Playwright 验证 |
| Browser 375×760 下 body client/scroll width 均为 360px | 新增封面浮层结构未造成空书架横向溢出 | 保留项目 Playwright 对有书列表和移动抽屉的布局断言 |
| 首次有书截图中浮层虽为不透明背景，但所在 grid item 层级低于后续书籍信息列 | 浮层完整标题和卡片正文标题发生视觉叠字 | list 悬停时提升封面容器 stacking context，再复查截图；封面和行高保持不变 |
| 桌面目录截图显示 401px 边缘分隔条位于侧栏/正文交界，三线手柄垂直居中；375px 抽屉截图不显示分隔条 | 新交互外观与 Codex 参考逻辑一致，移动端未回归 | 保留拖拽、键盘、持久化和隐藏断言 |
| 浮层层级修正后截图仍在约 0.47 opacity 的淡入中间帧看到正文透出 | 整体 opacity 动画会让不透明背景同步半透明，真实悬停时存在短暂闪叠 | 浮层立即切换为完全不透明，只保留 4px 位移动画 |
| 浮层完全不透明后，正文超长 `h2` 仍会从 360px 浮层右侧继续显示 | 用户会看到同一标题的重复尾部 | 仅在默认封面悬停期间隐藏相邻正文 `h2`；离开即恢复，不影响卡片布局和操作按钮 |
| 最终封面截图中 82×123px 默认封面保持不变，浮层三行完整显示中英文长标题且无重复文字 | list 模式的书名可读性问题已解决 | 截图保存在 `D:\tl-temp\ebook-reader-stage6-cover-popover.png` |
| 最终目录截图中桌面宽度为 401px、移动抽屉为 323px 且无分隔条 | 连续像素拖拽、宽度持久化和移动端抽屉规则均符合计划 | 截图保存在 `D:\tl-temp\ebook-reader-stage6-resizer-desktop.png` 与 `D:\tl-temp\ebook-reader-stage6-resizer-mobile.png` |
| 全局阅读快捷键监听原先不检查子控件是否已 `preventDefault` | separator 的 ArrowLeft/Right 可能同时调整宽度和翻页 | 全局控制器先检查 `defaultPrevented`，并用 Vitest 断言键盘调宽不会触发 TXT `scrollBy` |

## 2026-07-02 大阶段 8：v0.2 路线图研究

### 本地架构发现

| 发现 | 影响 | 规划决策 |
|------|------|----------|
| EPUB 当前每 1500 字符生成 locations，并把 progression 映射为显示页码 | 当前 `Page x / y` 不是出版物自带页码 | 有 page-list 时显示原始出版物标签；缺失时明确显示 `Location x / y` |
| epub.js 0.3.93 能解析 page-list，但实现会 `parseInt` 标签，href-only 条目也不能完全依赖 `pageFromCfi` | 罗马数字和非 CFI 边界可能丢失 | adapter 层保留原始导航标签并建立 href/fragment/CFI 边界表 |
| TXT 已用 TanStack Virtual 和 `charOffset` 保存进度 | 可增加分页而不改变持久定位 | 分页结果只作为布局缓存，主题或 viewport 改变后按 charOffset 重新定位 |
| `PdfViewMode` 已包含 `continuous`，但 `resolveRenderedMode` 只返回 single/double | 类型预留未形成连续页面渲染 | 继续使用当前 PDF.js display layer，用 TanStack Virtual 管理可见 Canvas/文本/标注层 |
| `PdfLocator` 使用 JSON 保存 page/scale/zoomMode | 能向后兼容扩展页内位置 | 增加可选 `pageOffsetRatio`，旧 locator 默认页首，无 schema migration |
| `app_settings` 已支持 JSON 键值设置 | 阅读模式和动效不需要新表 | 保存版本化 `ReaderExperiencePreferences`，前后端使用同一默认值和归一规则 |
| `ReaderShell.tsx` 已超过 5500 行且包含三种阅读器与多个浮层 | 新模式继续叠加会扩大回归面 | 阶段 9 先提取 token、控制层和格式组件，保持行为逐步拆分，不一次性重写 |

### 外部规范与依赖发现

| 来源 | 发现 | 规划影响 |
|------|------|----------|
| W3C EPUB 3.3 page-list | page-list 表示静态页面边界，但在 EPUB 导航文档中是可选项 | 不能承诺每本 EPUB 都有自带页码，必须保留 Location 回退 |
| epub.js render methods | 支持 paginated、scrolled 和 continuous manager；continuous 会预载更多 section 且性能成本更高 | v0.2 保持 EPUB paginated，不同时增加 EPUB 连续滚动 |
| StPageFlip | MIT、无依赖，支持 HTML 与 Canvas 展示层 | 只作为真实翻页候选；必须通过 iframe/Canvas、性能、a11y 和稳定性门槛后才能加入依赖 |
| PDF.js | 官方提供 display layer 和完整 Viewer | 现有应用已在 display layer 上实现自定义标注和 UI，不整体替换 Viewer，避免大规模回归 |

参考：

- https://www.w3.org/TR/epub-33/#sec-nav-pagelist
- https://github.com/futurepress/epub.js/#render-methods
- https://github.com/Nodlik/StPageFlip
- https://github.com/mozilla/pdf.js

### 产品范围评估

- v0.2 must-have：三格式离散分页动画、EPUB page-list/Location、EPUB 图片查看器、TXT 分页、PDF 连续滚动、备份/恢复。
- v0.2 should-have：应用内更新、元数据/封面编辑、文件夹/拖放批量导入。
- v0.2 could-have：自定义字体、全书库全文索引、阅读历史和统计。
- v0.3+：TTS、词典/翻译、云同步、移动端、MOBI/AZW3；跨平台只做前置评估，不进入 v0.2 核心关键路径。

### 已锁定默认值

- EPUB：`paginated + slide`。
- TXT：`scroll + slide`；slide 只在切换到 paginated 后生效。
- PDF：`single + slide`；continuous 模式运行时 transition 为 none。
- reduced motion：运行时禁用动画，不修改用户保存的选择。
- UI：保留现有信息架构和炭黑/琥珀/青绿/纸张色，采用概念审批、token、逐模块迁移。

## 2026-07-06 阶段 9–17+ 详细拆分决策

| 决策 | 原因 | 执行规则 |
|------|------|----------|
| 每个小阶段使用固定单目标分支 | 功能跨度包含共享类型、渲染、数据、UI、平台和发布，混合分支难以回滚 | 分支名写死在 `task_plan.md` 和 `docs/v0.2-roadmap.md`，实施时不得随意合并小阶段 |
| 每个大阶段最后设置 acceptance 分支 | 需要在功能分支之外统一补齐跨模块回归、文档和视觉证据 | acceptance 通过后才允许集成分支合入 main，并将集成分支快进到新 main |
| 阶段 9–13 固定为 v0.2 | 用户要求的阅读增强、备份和发布收口形成一个可发布闭环 | 使用 `codex/v0.2.0-integration`；阶段 13.9 才创建 `release/v0.2.0` |
| 阶段 14 固定为 v0.3 候选 | MOBI 转换、字体、全文索引和统计不是 v0.2 必需项 | v0.2 发布后创建 `codex/v0.3.0-integration`；MOBI 必须先过 go/no-go |
| 阶段 15 固定为 v0.4 跨平台桌面线 | macOS/Linux 的权限、WebView 和签名/打包需要独立验证周期 | 使用 `codex/v0.4.0-integration`，Windows 回归作为硬门禁 |
| 阶段 16–17+ 固定为 v0.5+ | 移动 adapter、TTS、翻译和同步会引入新的平台/隐私/安全边界 | 使用 `codex/v0.5.0-integration`；远程翻译和同步默认关闭，未完成安全/删除能力不得发布 |
| UI 概念审批是 9.3 硬 gate | 设计 token 和后续视觉实现必须有唯一视觉规格 | 9.3 用户批准前，9.4 及任何产品 UI 改动不得开始 |
| 发布动作继续需要明确授权 | 规划可以创建 release candidate，但公开 Release、商店提交或证书购买属于外部状态变更 | 13.9 只在用户明确授权后执行最终发布 |

详细拆分数量：阶段 9/10/11/12 各 7 个小阶段，阶段 13 为 9 个，阶段 14 为 7 个，阶段 15/16/17+ 各 6 个；共 62 个固定分支。阶段 9/10/11/12/14/16/17 设置显式 acceptance 分支，阶段 13 由 release-candidate、阶段 15 由 cross-platform-ci 完成收口。

## 2026-07-06 大阶段 9 实施基线

- `main` 与 `origin/main` 同步于 `64dc750`，工作区干净；`codex/v0.2.0-integration` 从该提交创建。
- 用户批准 UI 概念的视觉方向，同时明确以路线图契约校正 MOBI、EPUB scrolled、Fade、重复阅读器侧栏等生成偏差。
- 阶段 6.x 的最终基线为 68 Vitest、32 Rust tests、8 Playwright tests；书架入口约 68.46 kB gzip，ReaderShell 保持异步加载。
- `page-flip@2.0.7` 当前元数据为 MIT、零运行时依赖；是否保留仍须通过阶段 9.5 的稳定性、性能、iframe/Canvas 和可访问性门槛。
- 9.1 将 PDF view mode 的唯一公共类型源移到 `@reader/core`，adapter 仅重导出该类型；`ReaderAdapter` 本身未增加动画或布局职责。
- 9.1 desktop build 测得书架入口 69.08 kB gzip、ReaderShell 29.85 kB gzip；相较阶段 8 文档基线略高，阶段 9.6 必须通过模块边界和导入审计压回或解释工具链差异。
- `reader_experience` 采用 `{ version: 1, preferences }` 包装后可在不新增 schema 的情况下演进；读取未知版本时返回默认值且不写回，避免旧客户端破坏未来数据。
- Rust 端不能直接反序列化严格枚举来满足“非法字段逐项降级”，因此先读 `serde_json::Value`，再按格式/字段归一；Tauri 命令仍返回强类型偏好。
- 概念复查确认桌面书架的开放 workspace、紧凑 rail、纸色背景和 teal/amber 状态可直接形成 token；桌面阅读器图的重复书架 rail、Auto/Scrolled/Fade 和 Letter spacing 必须由校正表覆盖。
- 图片查看器的单容器工具栏、舞台和缩放轨道可作为后续模态规格，但背景误用了书架；实现时必须覆盖 EPUB 阅读器并恢复触发点焦点。
- 移动概念证明 375px 下抽屉和底部设置面板的信息密度可行；系统状态栏、设备底栏、Fade 和图标化 view 选项均不属于应用实现。
- 设计 fixture 在 Browser 1280×800 下保持两列开放布局，375×760 下所有采样按钮为 44px、document scrollWidth 等于 clientWidth；设置 sheet 底边精确贴合 760px viewport，焦点落在 Close。
- 将 fixture 通过 `import.meta.env.DEV && ?fixture=design-system` 动态加载可避免生产运行路径执行状态矩阵；书架入口仍只静态加载实际使用的 Button/SegmentedControl。
- `page-flip@2.0.7` 的 ESM 为 43.8 kB、MIT、无运行时依赖，但 portrait 模式明确克隆 HTML，Canvas 路径只接受 image URL，且翻页完成依赖 imperative 事件而非 Promise/取消协议；未通过实时 iframe/标注 DOM 隔离和确定性事务 gate。
- 自研控制器把捕获/展示失败视为可恢复，把真实导航失败视为不可提交；同步 30 次输入只执行首个和最终方向，避免无限队列并保持每次真实导航一次 commit。
- ReaderShell 入口可以保留 `components/ReaderShell.tsx` 公开 facade，同时把实现放入 `reader/`；Vite 仍把 ReaderShell CSS、EPUB adapter 和 PDF adapter 保留在异步 reader chunk，不会提前进入书架入口。
- 阶段 8 提交在当前 Node 26.1.0 / pnpm 11.1.2 / Vite 7.3.5 工具链隔离重建为 69.08 kB gzip，与文档旧观测 68.45–68.46 kB 有工具链差异；把仅在封面队列启动后需要的 `bookCovers` 改为动态导入后，当前书架入口降至 66.85 kB gzip，按绝对门槛也达标。
- 侧栏、选择/批注浮层、主题面板、导航注册器和三格式内容层可通过直接导入拆开而不增加 barrel；稳定回调和现有 memo 边界保留，ReaderShell 主实现由约 5500 行降为约 1300 行。
- Focus 快捷键回归测试暴露 `focusButtonRef` 实际挂在 Contents 按钮的旧缺陷；把 ref 移到 Focus 按钮并使用短延迟重试后，焦点恢复测试稳定通过。
- Browser/IAB 的受控 `evaluate` 上下文不暴露 localStorage，不能在 Browser 标签页注入三格式书籍；因此 Browser 用于三档视口、四主题、焦点、面板、console 和 `view_image` 视觉检查，三格式真实 reader 数据态由项目 Playwright 生成 TXT/EPUB/PDF fixture 并执行 axe，12/12 通过。
- 阶段 9 最终生产构建把书架入口压到 66.85 kB gzip；ReaderShell JS 29.79 kB、CSS 5.48 kB 均保持异步，封面生成器单独为 1.25 kB gzip chunk。
## 2026-07-07 大阶段 10：EPUB 增强

### 10.1 page-list 模型

- epub.js 0.3.93 的 `book.load(navPath, "xml")` 可以读取原始 EPUB3 navigation XHTML 或 EPUB2 NCX；这条路径保留 `i`、`xiv` 等标签，不使用 `book.pageList.pages` 的整数化结果。
- page-list href 需要同时尝试 navigation 相对路径、去前导斜杠路径和原 href，最终以 `book.spine.get(...)` 返回的 section href/index 为标准。
- href-only 边界表示 section 起点；fragment 边界通过 `section.load()` + `cfiFromElement()` 转成可比较 CFI；package CFI 直接由 spine 解析。解析阶段共享同一 section load Promise，结束统一 unload。
- 新缓存键固定为 `epub_page_list_v1`，内容为 `{ version: 1, boundaries }`；继续使用 `reader_cache` 的 source hash 自动失效，无 schema migration。
- 当前 CFI 早于首个有效边界、缓存损坏、目标外部/为空或 fragment 无法解析时，不伪造出版物页码，交给 10.2 显示 Location 回退。

### 10.2 页码与 Location UI

- EPUB generated locations 是每 1500 字符生成的布局无关进度索引，内部和 UI 均改用 `location/totalLocations`，避免测试和后续动画再次把它误称为出版物页码。
- 数字输入固定为 `Location`；page-list 标签可能是罗马数字或其他字符串，不提供误导性的数字 Page 跳转。
- 状态和滑杆 tooltip 优先显示 `Page <publicationPageLabel>`；当前 CFI 尚未越过首个 page-list 边界、无 page-list 或边界损坏时显示 `Location x / y`。
- href-only page-list 边界代表 section 起点，适合封面/章节第一页；fragment/CFI 边界只有在当前 CFI 到达后才生效。generated EPUB smoke 已验证这一差异。

### 10.3 图片资源桥接

- 图片桥接以 rendition `rendered` 后的 Document 为生命周期单位，用一次 click/keydown 事件代理覆盖 HTML `img` 与 SVG `image`；同一文档复用既有 WeakSet，章节/书籍销毁时统一移除 listener。
- 可查看图片只在运行时增加 `role=button`、`tabindex=0`、`aria-haspopup=dialog` 和 focus class；cleanup 精确恢复 EPUB 原属性，不修改源文件。
- 激活资源只读取 HTML `currentSrc`/`src` 或 SVG `href`，不调用 `fetch`、`URL.createObjectURL`、导出或远程解析；损坏图片在激活时用 `complete && naturalWidth <= 0` 安全忽略。
- 可访问名称按图片 aria-label/alt/title/figcaption、SVG aria-label/title 回退，最终兜底为 `EPUB image`；触发元素随资源一起传给 10.4 用于关闭后焦点恢复。

### 10.4 图片查看器

- 图片查看器复用共享 Modal/focus 规范，但关闭后不让 Modal 自行恢复主文档焦点；EPUB 内容层负责优先恢复 iframe 内触发图片，触发元素失效时回退 `.reader-epub-host`。
- Fit 是适应当前舞台的比例，可以低于 100%；100% 表示图片原始像素比例。手动缩放从 100% 到 500%，25% 步进，Reset 回到 Fit。
- 浏览器把 React `onWheel` 注册为 passive listener 时无法阻止页面滚动；查看器舞台改用原生 `wheel` listener `{ passive: false }` 处理 Ctrl/trackpad pinch 和滚轮缩放。
- 平移边界按舞台尺寸、图片原始尺寸和当前缩放计算；图片小于舞台时对应轴锁定为 0，大于舞台时限制在可见边界内。
- EPUB iframe 图片来自不同 JavaScript realm，不能依赖主窗口的 `instanceof HTMLImageElement`；桥接判断改为 `nodeType/localName/namespaceURI` 结构检查，避免真实 iframe 图片无法打开。
- 图片资源较早查询封面或 rendition 时需等待 `book.opened`，避免 epub.js 在资源替换路径上出现竞态；封面提取和 reader open 均在打开完成后继续。
- 375×760 使用全屏紧凑布局：标题、Close 和工具栏换行在顶部，控制目标保持至少 44px，底部滑杆与帮助文案不产生横向溢出。
- Browser/IAB 已按前端 QA 约定优先尝试，但本轮工具端在 `incrementalAriaSnapshot` 缺失处失败；真实三格式和三视口验证改由项目 Playwright、截图和 `view_image` 完成，并记录为工具限制而非产品缺陷。

### 10.5 平滑切换启动

- 当前 `PageTransitionController` 已具备首个 + 最终方向合并、捕获/展示失败可恢复、真实导航失败不 commit 的事务语义；10.5 应直接接入 EPUB，不在内容层复制队列。
- 当前 `PageTransitionLayer` 已提供 slide/page-curl 原型，但 `capturePageSnapshot` 只是普通 `cloneNode`；EPUB 接入前必须增加 iframe 文档的只读净化快照，移除 script、form、嵌套 frame 与交互状态。
- EPUB 的 pending progress 已由 relocated 事件进入 750ms 延迟写入；事务 commit 需要主动刷新这一 pending 值，并取消旧 timer，才能保证成功导航每次只写一次。
- 本轮检查命令曾引用不存在的 `ReaderFormatContents.test.tsx` 和 `components/ReaderThemePanel.tsx`；实际测试集中在 `App.test.tsx` / 各模块旁，主题面板位于 reader 模块，后续按 `rg --files` 结果定位。

### 10.5 平滑切换完成

- EPUB 按钮与 iframe ArrowLeft/ArrowRight 都通过 `PageTransitionController`；30 次快速输入仍只执行首个与最终方向，整个 single/double spread 只捕获一组 current/target 快照。
- 快照使用不含 `allow-scripts` 的 sandboxed iframe；源文档序列化前移除 script、form、iframe/frame/frameset、object/embed，清除 autofocus/contenteditable 并禁用表单控件。保留 `allow-same-origin` 只为复用当前 rendition 的 blob/样式资源，避免重新 fetch 或创建 blob。
- theme、resize、spread、目录/Location/slider 跳转会取消活动视觉动画并清空 pending 方向；adapter 使用最后一个 CFI/href 重新 display，保持重排后的阅读锚点。
- relocated 仍只更新一个 pending progress；controller commit 清除 750ms timer 并立即 flush，因而每次成功真实导航只保存一次。None/reduced-motion 直接导航，不捕获快照。
- 保存的 `page-curl` 在本阶段只映射为运行时 Slide，偏好对象不写回；Theme 面板只显示 None/Slide。10.6 将启用真实 Page curl。

### 10.6 真实翻页视觉检查

- 首张 230ms 中间态截图暴露 Chromium 对 3D transformed snapshot iframe 的合成边界黑屏：阅读页本身仍显示，但 host 之外被黑色合成面覆盖。动画层已增加 strict paint containment、clip-path 与不透明阅读背景，frame 恢复 overflow hidden；需重新截图确认合成面被限制在 EPUB host。
- 最终方案不再对 snapshot iframe 本身做 3D transform：iframe 只负责 current/target 只读内容并用 clip-path 揭示；独立的无交互 CSS sheet 承担 3D rotateY、背面和阴影。重拍确认 host 外黑屏完全消失，阅读 chrome、侧栏和进度控件保持稳定。
- Page curl 固定 500ms；snapshot/资源准备、Web Animations 任一不可用时 controller 已完成真实导航并直接 commit，不留下动画层。图片查看器、选择菜单、note editor/popover 打开时仅 page-curl 解析为 none，Slide 语义不被改变。

### 10.7 最终验收结论

- 阶段 10 fixture 已覆盖 EPUB3、EPUB2 NCX、无 page-list、完全损坏 page-list/cache、href/fragment/package CFI、HTML/SVG 图片、长章节与双页；无需新增二进制 fixture 或网络资源。
- axe 4.12 默认 frame aggregation 在 blob rendition 上不能创建聚合 page；legacy mode 可检查同源 EPUB iframe，但其脚本注入会被产品 sandbox 正确阻止并产生一条工具诊断。验收只在 axe 调用时间窗内过滤该精确诊断，其他 console 问题仍失败。
- Browser/IAB viewport override 后必须 reload 才能得到正确截图比例；reload 后 1280/640/375 截图和 DOM 无横向溢出，console clean。seeded EPUB 仍由项目 Playwright fixture 提供，避免 Browser 本地状态注入限制。
- 最终包体相较 10.4：书架入口只从 66.85 增至 67.09 kB gzip；所有 page-list、查看器和动画代码仍位于 39.33 kB gzip 的异步 ReaderShell chunk，未把 epub.js/PDF runtime 提前到书架。

## 2026-07-10 大阶段 10.x：EPUB 翻页动画视觉升级

- 现有偏好值只有 `none`、`slide`、`page-curl`；为避免迁移，`slide` 原值升级为 Smooth，`page-curl` 原值升级为 Realistic，仅新增 `cover`。
- 当前 EPUB 默认和非法值回退均为 `slide`。本轮需要让 EPUB 缺失/非法值回退 `none`，同时保持 TXT/PDF 默认 `slide`，因此 TypeScript 与 Rust 归一化必须改为按格式使用各自默认值。
- 现有 Slide 只移动 9% 并大幅淡出，Page curl 使用矩形裁切和纯色 3D sheet；参考图要求分别升级为全宽同步位移、目标页覆盖，以及斜向折角/纸背/移动阴影。
- Chromium 曾对 3D transformed snapshot iframe 产生黑色合成面；Realistic 必须继续让 current/target/折页文字快照保持二维裁切，仅让无内容 CSS 纸张装饰层承担 3D 变换。
- 本轮锁定自动动画，不增加页角拖动或手势进度控制；新 EPUB 默认 None，已有保存偏好不写回也不覆盖。
- 首轮真实 EPUB 50% 关键帧显示 Smooth 与 Realistic 均限制在阅读舞台内；Cover 对 target snapshot iframe 做二维全宽 transform 时仍触发 Chromium 舞台外黑色合成面。Cover 必须和 Realistic 一样保持 iframe 固定，改用 clip-path 展开，并让独立 CSS edge 承担移动纸缝/阴影。
- 进一步冻结 25%/75% 暴露 Realistic 的第三个折页文字 iframe 与 3D sheet 仍会触发边缘黑面。最终策略只保留 current/target 两个真实快照；折页使用印刷线纹、二维压缩/斜切、斜向轮廓和移动阴影表达纸背，不再让任何额外 iframe 或 3D 合成参与。
- 最终桌面/375px 设置截图确认四卡无裁切、无横向滚动且触控高度达标；同时发现暗色主题下既有 `.ui-button--ghost` 覆盖 theme mode 文字色，已提高 `.theme-mode-button.ui-button` 特异性恢复 panel text 对比。

### 10.x 最终验收结论

- 新 EPUB 默认 None；旧 `slide` 与 `page-curl` 原值分别获得 Smooth 与 Realistic 新视觉，`cover` 在 TypeScript/Rust v1 envelope 中可往返，无数据库迁移。
- 隔离动画层仍只使用净化 sandboxed current/target 快照；Realistic 最终避免第三 iframe 与 3D 合成，九个关键帧和完整 generated EPUB 流程均无黑面。
- 设置面板四卡具备 radio/roving focus 语义、44px 触控目标、静态 reduced-motion 预览和四主题样式；375px 无横向溢出。
- 最终包体为书架入口 67.10 kB gzip、ReaderShell 40.03 kB gzip、ReaderShell CSS 7.76 kB gzip，重动画代码继续位于异步 reader chunk。

## 2026-07-10 大阶段 10.x：翻页快照分页定位修复

- epub.js 的默认 paginated manager 会把整章排成横向多列，并通过外层 `.epub-container.scrollLeft` 改变 live iframe 相对阅读舞台的位置；iframe 自身宽度可以覆盖整章，而不只是一个 viewport。
- 原实现仅将净化后的 `srcdoc` 放入新的 100% iframe。新 iframe 因失去 live iframe 的宽度和负向 `left` 偏移，会从文档第一列重新排版，所以 Smooth、Cover、Realistic 共同显示章节第一页。
- 修复记录每个 live rendition iframe 相对 EPUB host 的 `left/top/width/height`，但 snapshot iframe 保持可视 viewport 大小；章节分页偏移改为净化文档 `body` 的只读布局偏移，避免对超宽或内部滚动 iframe 做 WAAPI 合成。
- 关闭设置面板后 epub.js 会短暂把 live iframe 设为 0×0 再 reframe。捕获器最多等待 6 个 animation frame；仍无有效布局时返回 null，让 controller 无动画完成真实导航，绝不再用隐藏 iframe 伪造章节首列。
- 新 snapshot iframe 的首个 `load` 可能属于初始 `about:blank`；净化文档现带内部就绪标记，只有标记后的真实 `srcdoc` load 才应用 `body` 偏移并启动动画，避免后退路径偶发清空定位。
- 捕获时排除既有 `.reader-transition-layer` 内 iframe，也忽略隐藏/舞台外预加载 view；无布局的 jsdom 环境仍保留 grid 回退以验证净化行为。
- generated EPUB 直接校验 snapshot `body.left` 与捕获分页偏移一致：三种模式前进时 target 位于 current 之后，Realistic 后退时 target 位于 current 之前，而不是只断言章节 DOM 存在。
- 九张 25%/50%/75% 关键帧确认 Location 2 显示段落页、Location 1 保持标题/图片页；Smooth/Cover 使用固定 iframe、布局揭示和 snapshot 内部正文位移，Realistic 延续固定 target 与 current 宽度揭示。正常播放与应用内浏览器无黑面；CDP 强制暂停后立即做 full-page capture 时，个别帧仍可能把阅读舞台外区域捕获成黑色，属于截图合成路径而非可见播放状态。

## 2026-07-11 大阶段 11：TXT 分页

- 现有 TXT 滚动路径由 TanStack Virtual 管理，持久 locator 已是 `chapterId + charOffset`；分页不需要新增数据库字段。
- `reader_cache` 已按书籍 source hash 自动失效，TXT 只需固定 `txt_pagination_v1` 键和布局签名，不应为每个 viewport 生成无界 key。
- 现有字符串切片和 DOM Range 使用 UTF-16 offset；分页切点必须保持 UTF-16 数值，同时只落在字素边界，避免拆开 emoji、组合字符和代理对。
- single/double 会改变单页可用宽度，因此 spread 渲染结果必须进入分页签名；double 的有限渲染窗口应按三个 spread 计，而不是强行限制为三个 DOM 页面。
- 缓存只需保存连续边界；命中后可用 block 全局 UTF-16 范围与页边界求交，确定性重建标题/段落切片，不必缓存 DOM 或重复测量。
- `splitChapterParagraphs` 旧实现用 `Array.from(line).length` 推进 offset，却用 JavaScript slice/Range 消费 offset；含 emoji 时两者不一致。阶段 11 已统一为 UTF-16 `line.length`，并补偿被 trim 的前导空白。
- TXT spread 与 EPUB 一致默认 Single；请求 Double 时以 860px 为可渲染阈值，窄窗只改变 rendered spread，不覆盖 requested spread 或持久偏好。
- 分页滑杆必须把 `onChange` 限定为内存预览，在 pointer/key/blur commit 时才更新 locator；用 committed page ref 去重可避免 pointerup 后 blur 再次保存，也让快速输入读取最新页而不是闭包旧 state。
- React state 导航后的目标 spread 快照必须至少等待一个 animation frame，确保 `data-window-state=current` 已指向目标页；controller 的 pending direction 继续提供“首个 + 最终方向”合并语义。
- 视觉动画取消不等于回滚真实导航；布局、跳转或 slider 介入时先清空 TXT pending commit 再 cancel，可防止旧动画完成后覆盖更新后的 locator。
- 375px 首轮真实截图暴露顶部 title/toolbar 同行挤压和底部 controls 竖排；移动端 topbar 改为两行、分页 controls 改为两列三行，并按 frame 实际高度测量后，正文和页码均无裁切。
- 全量 Playwright 首轮只有 EPUB 强制暂停快照未等 target iframe ready；单独场景通过。验收测试增加 current/target `data-reader-snapshot-ready=true` 等待后，全量并行 12/12 稳定通过。

## 2026-07-13 大阶段 11.8：TXT 分页修复与性能优化

- 用户实际 Tauri 截图显示 Double 请求已选中但正文仍为单列；现有 Playwright 只断言 `.reader-txt-page-window--double` 和挂载数量，没有断言两个当前页的矩形、可见性或相邻内容，因此旧门禁可以漏过该问题。
- TXT 用 `viewport.clientWidth` 推导 pageWidth，但实际页面位于带 padding/gap 的 frame；离屏测量节点也缺少 `.reader-txt-page` 的真实 padding，测量与渲染 box model 不一致。
- TXT 底栏目前是单行 flex，只显示按钮、Page 文本和原始 page-index range；没有 EPUB 的状态行、数字输入、百分比、拖动 tooltip 或 `--epub-progress-percent` 填充变量。
- TXT 动画在真实导航后等待一帧，再查询新的 `data-window-state=current`；目标页依赖 React commit 时序。相邻 spread 已经挂载，按确定的 `data-spread-start` 在导航前捕获更可靠，并能保留 Double 父布局。
- `reconstructTxtPages` 当前对每个 boundary 扫描全部 blocks，复杂度为 `O(pages × blocks)`；10,000 页书即使缓存命中也会产生高成本。分页器还在确认整段能否放下之前为每个普通段落生成全部 grapheme offsets，并在每次测量中重建整页 DOM。
- Browser/IAB 可用于基础页面 identity、console 和视觉检查，但隔离环境没有 seeded 书籍；真实 TXT Double、页码、动画与性能继续由项目 Playwright fixture 验证。
- 11.8 修复后 Double 阈值按 `2 × 320px + 18px` 真实页槽计算；默认桌面 seeded fixture 的两个当前页宽度均不低于 320px、左右不重叠且正文来自相邻页，375px 保留 requested Double 并明确提示 rendered Single。
- `reconstructTxtPages` 的 10,000 页合成用例现在在测试中要求低于 1 秒；页/块双游标将旧路径的理论 100,000,000 次页块配对降为线性遍历。短段不创建字素分段表，DOM measurer 只更新变化的末尾文本节点。
- 动画事务在 React 状态变化前按目标 `data-spread-start` 捕获相邻窗口；单元测试验证精确 Double target clone，Playwright 验证 Smooth 隔离层 target spread 与最终 current spread 完全一致。

## 2026-07-14 大阶段 11.9：TXT 分页持续阅读与渐进加载

- 用户截图中的分页正文只使用约半个阅读舞台，而底栏固定在窗口底部；代码把 frame 初始值设为 `588px`，尺寸监听 effect 仅执行一次。TXT 文档异步加载期间 frame 尚未挂载，effect 因而提前返回且不会在正文挂载后重试，分页一直使用兜底高度。这同时增加了页数、冷分页工作量和缓存布局偏差。
- 分页 anchor ref 只从组件首次 render 的 `initialProgress` 初始化；需要验证保存进度异步到达时是否重新应用，以及退出前最后可见 spread 是否稳定提交。
- 渐进分页当前通过 `hasPublishedPartialPages` 只接受第一个完整 spread，后续批次直到全部完成都不会更新 React 页面数组；因此 Next 在已算出更多页面时仍被旧数组边界禁用。
- 首轮检索命令引用不存在的 `apps/desktop/src/styles.css` 和 PowerShell 不支持的 glob，组合命令返回 exit 1；已改为按 `rg --files`/真实路径定位，不影响产品代码。
- 应用内 Browser 插件初始化失败并报告 `Cannot redefine property: process`，故障文档对象也未建立；本轮按技能回退规则使用项目 Playwright 完成真实 seeded 数据、DOM、console、axe 与截图验收。
- DPR2 移动截图发现正文右上角的计算胶囊遮挡章节标题；计算状态已并入底栏页数文本（`… / n+ · Calculating`），正文不再放置浮动提示。
- 最终实现只在真实 frame 已挂载并完成尺寸读取后启动分页；缓存命中不再等待 `document.fonts.ready`，会话 LRU 可直接恢复当前布局。冷分页每 4 页（Double 每 8 页）发布一次完整批次，已发布页可用 Previous/Next、页码输入和原有动画继续阅读。
- 渐进发布使用交互版本防止后台新批次把用户拉回旧 anchor；若用户尚未操作，则在已计算边界首次覆盖保存的 charOffset 时自动恢复。完整边界验证后才更新会话/磁盘缓存，取消任务不会写入部分结果。
- Playwright 实测同一会话从非首页回书架再进入低于 1 秒，恢复页范围覆盖保存的 UTF-16 charOffset；桌面当前页末段无溢出，底部剩余空间低于页高 20%。

## 2026-07-14 大阶段 12：PDF 连续模式

- 500 页 fixture 首轮失败并非 PDF 解析或虚拟化错误：页面已显示 `Page 1 / 500`，但测试依赖 fallback 偏好在 ReaderShell 挂载后的异步载入，Continue 点击可能早于偏好生效。验收应走用户可见的五项设置切换 Continuous，并单独通过离开/重入验证分页视图持久化，避免让预置 localStorage 时序代替真实交互。
- `getPdfVisiblePageNumbers` 的分支必须显式判断 Double，而不能用“非 Single”代替；否则 Continuous 在第 2 页以后会把相邻虚拟页误报成当前 spread，页 1 的封面特判会让普通 smoke 漏测。
- PDF frame 同时承载 Continuous 的纵向滚动和分页 surface；模式切换若不清理 `scrollTop`，分页 Canvas 即使有正确像素也会把页首裁出视口，形成“ready 但空白/错误区域”。分页页号或 rendered Single/Double 变化应在 layout 阶段滚到页首。
- ReaderShell 的阅读体验偏好在挂载后异步读取；高并发或慢存储下，用户可先操作设置，迟到读取随后回滚 UI。加载结果必须在该书会话尚未产生偏好修改时才应用，保存仍使用用户操作产生的完整 normalized preferences。
- PDF adapter 的构造与 `open()` 之间存在异步窗口：此时 prop 变化只会更新 requested-mode ref，因 adapterRef 未建立无法即时下发。open 成功后必须重放 ref 中最后请求，否则大 PDF/慢机器会丢失加载期间的 Continuous/Single/Double 切换。
- Browser/IAB runtime bootstrap 在本机继续以 `Cannot redefine property: process` 失败，且失败后没有 `agent.browsers` 或 browser binding；按技能要求读取 bootstrap troubleshooting 后不改用无关 browser backend。阶段 12 的真实 fixture、DPR2、三视口、截图、console 和 axe 证据全部由项目 Playwright 生成。

- `PdfViewMode` 和 `PdfLocator.pageOffsetRatio` 已存在，但当前 PDF UI 打开时强制 Single，`resolveRenderedMode` 也把 Continuous 降级为 Single，因此类型预留尚未形成真实连续阅读。
- PDF 当前只维护一个全局 Canvas `RenderTask`；连续虚拟列表会并发渲染多个页面，必须改为按挂载页面独立取消 Canvas 与 `TextLayer`，卸载时清空 backing store。
- 当前 PDF Single/Double 只挂载当前一到两页，无法在动画前可靠取得准确目标页；阶段 12 将使用 previous/current/next 三 spread Canvas 窗口，并按 `data-spread-start` 捕获像素快照。
- 普通 `cloneNode()` 不复制 Canvas 像素；PDF 动画必须显式 `drawImage` 到隔离 Canvas，且只能在准确目标 spread 已就绪时播放，否则无动画导航。
- `ReaderExperiencePreferences.pdf` 目前只保存 `viewMode + transition`；为满足 Continuous 返回后跨重启恢复 Single/Double，需要增加向后兼容的 `paginatedViewMode`，继续使用 v1 JSON envelope而不迁移数据库。
- 12.1 首轮 TypeScript 门禁发现 `normalizePdfLocator` 作为运行时函数被误放入 `import type`；Vitest 表现为 `ReferenceError`，tsc 提供 TS1361。修正为值导入即可，不需要改变 locator 设计。
- v1 偏好兼容不能只给新增字段固定默认值：旧记录若已保存 PDF `viewMode=double`，归一化时应先用旧 viewMode 推导 `paginatedViewMode=double`，避免升级后丢失用户的分页选择。
- Continuous 的百分比不能复用 `(page-1)/(total-1)`；按 `(page-1+pageOffsetRatio)/totalPages` 才能让页内位置连续，并把最后一页底部精确映射到 100%。
- TanStack Virtual 的 PDF 估算只需要默认纸张比例和已访问页的轻量 metrics；目标页挂载后 `measureElement` 修正总高度，因此无需为 500 页先调用 `getPage()`。
- Continuous Fit width 必须由每页原始宽度单独求有效 scale；把当前页的 fit scale 套到不同尺寸页面会让页面宽度和虚拟行高度同时漂移。
- 12.2 首轮 lint 阻止在 render 中读取 `adapterRef.current`，也阻止 effect 同步镜像 `viewMode` 到 state；渲染改用 adapter state 和父级 viewMode prop，ref 仅保留给异步命令，避免虚拟列表拿到不可追踪的旧实例。
- 每页 render sequence 必须先取消旧任务再分配新 identity；若新 identity 分配后复用会递增 sequence 的通用 cancel，刚创建的正常任务会在完成时被误判为 stale。
- 页面尺寸缓存可以贯穿文档会话，但 `PDFPageProxy` 只应保留到 surface release；否则用户滚过 500 页后会把 500 个 page proxy 都留在 adapter 内。关闭文档还需用 document identity 拒绝迟到的 `getPage()` promise。
- Double 若只按 `currentPage + 1` 组合，会让直接跳到奇数页后的 spread 与 Previous/Next 产生不同配对；统一为封面 1、随后偶数起始 spread 才能让进度、动画 identity 和窄窗恢复共享同一规则。
- Continuous 中虚拟行高度包含页间 gap，但 locator 比例只能除以真实页面内容高度；否则滚到页尾会把 gap 计入比例，缩放恢复后锚点产生可见漂移。
- PDF slider 若在 commit 时再次走独立 progression API，就会绕开 rect/ratio/page-top 的统一优先级和后续动画抑制；应把 preview 生成的完整 locator 交给同一个 `goToPdfLocator`。
- 批注 rect 跳转不能只在 adapter 中修改 page：连续目标页尚未挂载。可靠顺序是 locator 导航、虚拟目标页挂载、按该页实际 scale 转换 rect、再把首个 rect 放到 frame 上部并由 surface 重放高亮。
- PDF Canvas 的 DOM clone 会保留 width/height 属性却不保留像素；动画快照必须逐个校验源/目标 `data-page-number`，设置 backing size 后 `drawImage(sourceCanvas, 0, 0)`，任何失败都应回退无动画。
- 邻接 spread 晋升 current 时若把 `isVisible/renderTextLayer` 放在同一个 Canvas effect 依赖中，effect cleanup 会先把已预渲染目标 Canvas 归零。Canvas 生命周期与当前页 TextLayer 生命周期必须分离，晋升只增加交互层。

## 2026-07-14 大阶段 12.8：阅读模式修复

- PDF 分页控制器在导航前同步调用 `capturePdfSpreadSnapshot`；Double 的目标 spread 需要两张 Canvas 同时 `data-render-ready=true`，任一邻接页仍在异步渲染时就返回 `null`，控制器按既定安全策略无动画提交，因此用户看到 Smooth/Cover/Realistic 全部等同 None。修复应等待准确目标 spread 在有限时间内 ready，而不能放宽 identity/像素校验或捕获占位页。
- TXT 阅读体验偏好目前只有 `viewMode + transition`，`TxtPaginatedReaderContent` 的 `requestedSpreadMode` 每次挂载固定初始化为 `single`。Continuous 会卸载分页组件，因此返回分页必然丢失 Double；需要在现有 v1 envelope 中增加向后兼容的 `paginatedViewMode`，并由底栏 Single/Double 操作持久化。
- Double 的 current spread 也可能在直接页码跳转后短暂未 ready；current/target 应共用同一个可取消的 600ms 准确快照等待。current 捕获失败后不再准备 target，立即执行真实导航，避免 Canvas 不可用或渲染失败时产生两段无意义等待。
- 500 页动画验收必须分别断言 current Canvas 页号 10/11 与 target 12/13；Continuous 的 long-task 观察窗口在切入分页前结束，避免把验收代码自身的多 Canvas `getImageData` 取样成本误算为连续滚动性能回归。

## 2026-07-14 大阶段 12.9：PDF Double 动画视觉修复

- 应用内 Browser 可正常打开 `http://127.0.0.1:1420/`，页面身份、首屏和 console 均正常；但隔离的应用内会话没有 seeded PDF，目标 Double 动画必须使用仓库运行时生成的 500 页 fixture 进行中间帧检测。
- PDF transition layer 虽有 `z-index: 2`，但 `.reader-pdf-frame` 没有 `reader-transition-host` 类；更关键的是现有 E2E 只断言 layer mode 与快照 Canvas 页号，从未暂停到中间时刻检查 current frame width/transform、target 可见比例或装饰层几何，因此“层存在但看起来是 None”可以通过全部旧门禁。
- 新增 50% 时间点诊断后成功复现视觉问题：Smooth current 仅剩 5.39% 宽度、Cover 7.15%、Realistic 10.91%；截图几乎已经完全显示 target 12–13，只剩极窄边缘或轻微渐变。三种共享 easing 都高度前置，主要运动在动画开头极短时间内完成，因此 layer/WAAPI 虽存在，肉眼效果接近 None。
- 修复方向应保留共享动画种类、持续时间和 current/target identity，只把三种共享 timing curve 改为中点对称的缓入缓出；这样 PDF/TXT/EPUB 仍复用同一实现，并让 50% 时 current 可见比例落在可辨认范围。新 E2E 需永久断言中间帧几何，不能只检查装饰层 opacity。
- 修复后中间帧截图出现明确视觉差异：Smooth 左侧仍为 page 10、右侧已揭示 page 12；Cover 在两半之间显示移动阴影边缘；Realistic 显示带背面纹理、阴影和倾斜变形的卷页片。此前截图在同一时刻几乎只剩 page 12–13。暂停 WAAPI 后的 Chromium full-page 合成仍会把阅读舞台外区域捕获成黑块，这是既有截图暂停路径现象，实际动画层内部内容与几何正常，门禁不依赖黑块区域。
- 修复后的自动化不只检查动画层存在：current 快照固定为 page 10–11、target 固定为 page 12–13，50% 时 current 宽度必须处于 15%–85%，Smooth target 必须有 transform，Cover edge 与 Realistic sheet 必须同时具备可见 opacity 和非空 transform；结束后仍落到准确 target spread。

## 2026-07-15 大阶段 12.10：PDF Double 冷启动动画修复

- 用户报告的“等待一段时间后恢复”与安全回退路径吻合：Double 动画事务会先等待 current spread，再等待 target spread；任一准确双 Canvas 快照在固定 600ms 内未 ready 就返回 null，控制器随后只执行真实导航，视觉表现就是 None。
- 现有 500 页验收在进入动画循环前已经完成 Continuous 滚动、远跳、主题重绘并显式等待 page 10/11 与 12/13 ready，因此只覆盖热机邻接 Canvas，无法证明首次打开 PDF 后的首个相邻 spread 能在快照期限内完成。
- `capturePdfSpreadSnapshot()` 的单一 `null` 还混合了两类状态：未挂载/未 ready 属于可等待的 pending，而 Canvas identity、backing store、2D context、像素复制或页面渲染错误属于不可恢复的 failed。冷启动修复必须区分两者，否则单纯延长超时会让真实快照失败也卡住导航。
- 修复后等待仍受 AbortSignal 和 10 秒 watchdog 约束；模式/主题/缩放/resize/卸载会取消事务，明确页面错误或 Canvas 快照失败立即走原有无动画真实导航。只有仍可能成功的 pending 才等待，因此不会用预建整书 Canvas 或错误页换取动画。
- 500 页真实冷开验收现在从已保存的 Double + Smooth 启动，在 Double DOM 首次可见后不等待 current/target ready 就立即 Next；Chromium/DPR2 均捕获准确 page 1 → page 2–3，视觉中间帧同时显示旧页与目标页。Smooth/Cover/Realistic 共用同一 snapshot 等待管线，后续热机循环继续分别验证三种 mode、几何与准确目标 Canvas。
- React 层无需增加“等待 ready”的额外 state/effect 或整书预热：现有 `PageTransitionController` 已提供串行请求、最终方向合并和 AbortSignal。把 pending/failed 判定留在快照边界即可减少重渲染，并保持 PDF runtime 懒加载与有限 3 spread/6 Canvas 窗口。

## 2026-07-15 大阶段 13.1/13.2：UI 概念设计输入

- 四张用户参考图共同锁定一种“编辑感本地书房”方向：真白/暖白内容背景、深墨蓝导航、低饱和青绿主强调、克制赤陶色导入动作、琥珀色焦点环、纤细边框与很浅的环境阴影。
- 桌面书架强调宽松留白、封面主导、Grid/List 切换、排序和导入；不应继续把每项堆成过度厚重的卡片。移动书架保留三列封面优先布局，标题/作者/进度构成稳定纵向节奏。
- 桌面阅读器采用“窄全局栏 + 上下文侧栏 + 阅读舞台 + 按需设置面板”；移动阅读器把目录/书签/批注/搜索合并进左侧 sheet，把阅读设置放进底部 sheet，保持正文优先。
- EPUB 图片查看器使用深色聚焦层、可见缩放百分比、缩放/重置/关闭和鼠标滚轮/触控板/拖拽提示；其结构应同时覆盖窄屏底部工具栏。
- 动效只服务空间连续性、状态反馈和防止突变：按钮 pointer-down 立即 0.97 缩放；popover 从触发器 origin-aware 进入；移动 drawer 使用可中断 spring、速度交接与 rubber-banding；高频键盘动作不加进出动画；reduced-motion 使用短 crossfade。
- 四张图仅是风格/结构参考，不是逐像素实现规格；后续概念必须补齐当前应用真实存在的 TXT、EPUB、PDF 三格式差异、空/错/加载状态、选择菜单、搜索结果、书签/批注、PDF 缩放与连续/分页控制等界面。
- 首轮 12 张概念的结构 QA 表明，直接把四张参考图同时用于所有画板会放大参考图的已知生成偏差：书架 List/响应式画板混入 Contents/Bookmarks/Notes/Search，TXT/PDF/图片查看器/640 阅读器重复出现书架 rail，EPUB 设置重新出现 Reset defaults，移动设置重新出现 Fade。
- 这些偏差不是可接受的创意自由：本目录既有校正规则已经固定“阅读器只保留一个侧栏”、书架 rail 只含 Shelf/Recent、EPUB/TXT 不含 Fade、不新增 Reset defaults。后续迭代改用已通过的 `01-bookshelf-grid-desktop.png` 和 `05-epub-reader-desktop.png` 作为结构锚点，减少错误结构从原始参考重复迁移。
- 首轮通过方向：书架 Grid 的封面主导布局、selected + origin-aware menu、系统状态 2x2、编辑感配色与克制阴影成立；阅读器四区层级、TXT 双页排版、PDF 页面材质、选择/笔记浮层以及图片查看器的深色聚焦层可继续沿用。
- v2 纠偏结果：书架活动 rail 只保留 Shelf/Recent；桌面和响应式阅读器统一为单侧栏/单抽屉；设置只暴露当前格式能力；图片查看器覆盖真实 EPUB reader；移动设置只保留 None/Realistic/Cover/Smooth，不再出现 Fade/Slide/Reset defaults。
- 静态主屏不足以审核交互感觉，因此把动效作为独立分镜：popover 0→80→160ms origin-aware，drawer 0→140→260ms interruptible spring，Grid/List 0→100→200ms layout animation，page 0→140→280ms direction-aware；reduced motion 用 160ms crossfade。
- 控件状态板把按钮逻辑锁定为 default/hover/pressed/focus/disabled/loading，并明确 pointer-down 0.97 press feedback、3px amber focus、首个 tooltip 延迟/相邻 tooltip 立即，以及普通菜单到破坏性确认的两级路径。

## 2026-07-16 大阶段 13.1/13.2：批准与实施规格锁定

- 用户已明确批准全部 15 张活动画板；`docs/design/v0.2/stage13-concepts/README.md` 从评审候选升级为 13.1/13.2 的正式视觉实施契约。
- 13.1 的 01–04 原尺寸复核显示：桌面书架是深色结构 rail + 开放式书架 workspace，不是大卡片仪表盘；Grid 使用封面与信息并排的 3×2 密度，List 使用紧凑横向行并保持相同信息层级。
- 核心颜色锁定为 `#FCFBF8` workspace、`#1F3035` structural chrome、`#235F62` selected/progress、`#B94B35` import action、`#F2B84B` focus 与 `#DFE1DE` border；utility surface 保持真白，不能把全部界面泛化成暖纸色。
- 书架系统态必须是同一真实壳体内的 loading skeleton、empty、load error/retry、importing 与三种 import feedback；这些不是独立演示页，也不能用装饰 badge 代替明确状态反馈。
- 响应式契约是 900/640 保留 rail，375 移除 rail 并把 Grid/List 与导入压缩为 44px 触控控件；Grid/List 两种移动布局都不能出现 body 横向滚动。
- 概念中的书名、作者和封面只用于设计演示。产品实现必须继续渲染真实用户书库数据，并复刻容器、排版、进度、菜单与状态语法，不能内置演示书籍。
- 动效按共享 token 实施：press 100–140ms/0.97、popover 150–180ms origin-aware、Grid/List 180–220ms layout/crossfade；键盘触发即时、reduced-motion 只保留 120–180ms opacity/color feedback。

## 2026-07-16 大阶段 13.1：书架视觉收口

- 旧 `App.tsx` 同时承担数据协调与整套书架表现，难以让 Grid/List、系统态和响应式共享稳定结构；将纯书架拆为 `library/Bookshelf.tsx` 后，App 只保留导入/打开/移除/文件关联等编排，ReaderShell 仍在打开书籍后懒加载。
- 书架进度此前只存在于 reader runtime，主书架不能展示概念要求的真实百分比。新增只读汇总层按唯一 book id 读取持久化进度、最大六并发、单条失败隔离并把值钳制到 0–1；没有新增 schema 或复制进度来源。
- 首轮视觉截图揭示桌面 Grid 的 20 px 卡片 padding 把封面整体右推，List 又把格式标签变成独立中列；两者都破坏批准稿的信息分组。最终 Grid 封面贴列起点，List 把标题/作者/格式归为左组、进度归为右组。
- 1536 px 对图还揭示默认 2:3 封面比批准稿短约 22 px、进度轨道过宽。最终桌面封面为约 172×280、轨道限制为 174 px，保留真实封面自身 `object-fit: cover`，不会拉伸用户图像内容。
- 375 px Grid 按批准稿移除 rail 和可见 overflow 按钮，封面限制为 88 px；List 继续提供显式 overflow，Grid 仍保留右键上下文菜单，因此视觉简化没有删除操作能力。
- DPR2 首轮 axe 在卡片入场透明度尚未结束时把混合后的中间颜色误判为静态低对比；验收现显式完成入场动画后再测稳定状态。最终静态 375 px 颜色对比、44 px target、无横向溢出均通过。
- 真实 Browser 的旧 tab 保留过一次已修复 HMR 异常；换新 tab 后只有 Vite debug 与 React DevTools info，无 warning/error。隔离会话验证真实空态与 Grid/List、Shelf/Recent；六书视觉与操作状态由仓库 fixture 验证。

## 2026-07-16 大阶段 13.2：阅读器视觉收口

- 阅读器旧样式把 sidebar、topbar、各格式正文和设置控件混在同一视觉层。13.2 保留现有数据/locator/adapter 行为，只用后置 `ReaderStage13.css` 和语义化图标层重塑 chrome，避免触碰 EPUB/PDF 懒加载边界。
- 桌面默认侧栏从 292 调整为批准稿的 366 px；900 以下不再直接退化为覆盖式 drawer，521–899 保留 252 px 常驻侧栏，只有 520 以下使用白色抽屉与遮罩。375 抽屉仍保留关闭、焦点恢复和 Escape 路径。
- Reading settings 改为 356 px 桌面实边面板和移动端 bottom sheet；四主题只改变阅读舞台，设置面板自身保持中性白色，避免 Dark 主题让系统控件整体变黑。数值 range 继续保留可访问输入，同时视觉呈现为减号/当前值/加号 stepper。
- 1280 桌面打开设置后可用 topbar 宽度不足，初版出现书名与工具栏重叠；1400 以下打开设置时隐藏重复的居中书名，保留格式与四个操作，1600 批准布局仍显示完整三段 topbar。
- 通用 `.reader-page` 宽度首轮误限制 PDF 舞台为 690 px，导致 Double 按钮保持选中但实际降级为 Single；宽度约束已缩到 TXT virtual page，500 页 PDF 的 Double/Continuous/窄窗回退恢复通过。
- TXT 渐进分页测试曾把 `requestIdleCallback` 固定为每 60 ms 且 `timeRemaining=0`，375 重排需逐批等待而长期显示 Calculating；在完成渐进发布断言后恢复有预算的 idle callback，产品分页算法未被改成同步阻塞。
- 640 首轮截图显示格式、标题和四个工具挤在 388 px 主区并截断 Focus；紧凑档现只显示等宽四工具栏，书名/作者继续由常驻侧栏承担，正文与 body 均无横向溢出。
- 顶部 Shelf、侧栏 Back to shelf 和 Close contents 最初产生包含匹配歧义；最终可访问名称明确区分，设置关闭会把焦点恢复到 Theme，打开面板自动聚焦关闭按钮。

## 2026-07-16 大阶段 13.1/13.2：批准稿二次完成审计

- **审计结论：** 首轮 13.2 虽通过通用门禁，但未完整复刻 07/12/13/14/15：排版控件被简化、format page view 未进入设置、移动工具栏错误、手势只是 entrance animation、tooltip 时序和格式系统态缺少运行证据。
- **设置修正：** 四主题使用 `Aa`；字体显示 Lora；Size 保留步进器；Line/Spacing/Margin 改成三段图形控件；EPUB/TXT/PDF 的阅读模式、转场和 Single/Double 与真实偏好/adapter 状态双向联动，Continuous 下显示明确禁用原因。
- **移动交互：** 375 px topbar 固定为 Back/Contents/Theme/Bookmark/More，More 承载 Notes/Search/Focus；drawer 横向、sheet 纵向按 touch/pen 1:1 跟踪，越界按 0.18 阻尼，释放按位移/速度决定关闭或回弹，pointer capture 失败安全降级。

## 2026-07-16 大阶段 13.3：备份导出

- SQLite migration runner 原先每次启动都会重新执行全部 migration，只因 0001–0003 本身幂等而未暴露问题；0004 的 `ALTER TABLE` 要求先按 `schema_migrations` 跳过已应用版本。迁移现在真正按版本执行，并验证 bookmarks `updated_at` 只存在一列。
- `.erbackup` v1 使用 `manifest.json` + `data.json` + 可选 `covers/`/`books/`；manifest 为每个 payload 固定 path/size/SHA-256，但不自我签名。书籍与封面继续按 file hash 内容寻址。
- 可移植快照由显式 SQL 生成，不序列化 `Book` 运行时对象，因此绝对 `source_path`/`library_path`、reader cache 和 updater 时间从结构上无法进入数据文件；软删除 annotation 会保留 tombstone。
- 长任务使用 operation ID + `AtomicBool` 协作取消，Rust 命令放入 blocking worker，避免同步 invoke 阻塞取消请求；临时文件与目标文件同目录，成功才 rename，失败/取消删除残留且数据库只读。
- Settings 新页面继续使用批准的暖纸/深墨/青绿/琥珀系统；桌面 1280×720 首屏完整，375 为 fixed 全屏 sheet，44 px target、reduced-motion、焦点恢复与 axe serious/critical=0 均由专用 Playwright 覆盖。
- Browser 隔离运行没有 Tauri runtime，因此真实点击导出验证的是明确的桌面运行时错误恢复；文件对话框、原子写入、ZIP 往返和取消由 Rust/Vitest/原生桥测试承担，未用浏览器 fallback 伪造成功。

## 2026-07-16 大阶段 13.4：备份恢复

- ZIP 预检在读取 JSON 或解压前遍历原始 entry name，拒绝路径穿越、反斜杠/盘符、重复项、目录项、条目/总大小上限和压缩比异常；manifest payload 还必须通过声明大小与 SHA-256 双重校验。
- 文件与数据库采用两阶段恢复：内容先进入 app-data staging，只将校验后的新内容寻址文件移入书库，再开启 SQLite transaction；任何取消、合并或 commit 错误都会删除本轮新增文件。
- 书籍 ID 通过 `file_hash` 映射到已有本地 ID；UUID/key 记录只接受严格更新的 `updatedAt`，相同时间保留本地，annotation tombstone 与普通记录完全同规则。
- 无原书的恢复记录保留缺失的 managed path 和完整阅读数据，书架显示 `File needed`；导入同 hash 文件会命中既有 repair 路径，并经 Rust 测试证明 progress 与书签身份不丢失。
- Rust `zip` writer 本身拒绝生成重复文件名，因此重复条目门禁测试直接覆盖生产使用的 entry 注册器；外部 ZIP reader 仍会逐项调用同一门禁。

## 2026-07-16 大阶段 13.5：元数据与封面编辑

- `books` 继续保存自动提取值；`book_user_metadata` 只保存 title/author/cover 的独立覆盖值与时间，列表查询以 `COALESCE` 生成有效显示值。
- patch 使用 `unchanged`/`set`/`reset` 显式动作，空作者可以作为有意覆盖值，避免 `null` 同时表示“不改”和“恢复”。
- 前端 2:3 裁切输出 600×900 WebP；Rust 再次识别 PNG/JPEG/WebP、真实解码、限制 40M pixels，并重新编码为 `.user.webp`。
- reset 只删除用户封面；自动封面缺失时 EPUB/PDF 回到 pending 队列、TXT 回到 fallback。删除书籍清理自动/用户封面。
- `.erbackup` v1 的 PortableBook 增加向后兼容可选字段，restore 按每字段时间 newer-wins、tie-local。

## 2026-07-16 大阶段 13.6：文件夹与拖放导入

- 主 `Import book` 继续走既有单文件快捷入口；split menu 暴露 `Import files` 与 `Import folder`，避免把熟悉动作强制改成多选对话框。
- 单文件、文件关联、批量文件、文件夹和拖放最终都复用 `batch_import` Rust 服务与 `db::import_book_at`，duplicate/repair/managed-copy 规则只有一个来源。
- 递归扫描固定 depth 32 / items 10,000；canonical path 必须留在选择根，symlink 与 Windows reparse point 在进入目录前拒绝，支持格式只允许 EPUB/TXT/PDF。
- preview 逐项显示 valid/duplicate/unsupported/missing/error，并允许取消选择；提交按项隔离失败，取消只停止新任务，已开始的原子导入完成后保留或清理。
- Tauri drag/drop 只打开轻量模糊 overlay 和统一 preview，不会静默导入用户拖入内容。

## 2026-07-16 大阶段 13.7：应用内更新

- Tauri v2 updater 强制 minisign 验证且公钥必须内嵌内容、不能是路径；生产 endpoint 仅使用固定 GitHub HTTPS `latest.json`。
- Rust 将 `Update::download` 与取消 token 放入 `tokio::select!`，取消会 drop 网络 future 和内存 buffer；只有完整下载并验签后才保存可安装 bytes。
- Windows `install` 开始后应用由 installer 自动退出，因此 UI 把确认安装明确标成不可取消边界。
- NSIS build flavor 启用 updater artifact；MSI flavor 通过编译期轨道关闭所有 updater 命令，避免 MSI/NSIS 混装。
- 每日检查偏好写入 `app_settings` 并可随备份合并；最后检查时间只留在 machine-local storage，不进入 `.erbackup`。
- 私钥生成在用户级 Codex secrets 目录并经 ACL 验证只有当前 Windows 用户读写；仓库仅含公钥与 canonical fingerprint。

## 2026-07-16 大阶段 13.8：发布安全与签名

- Syft 固定为 v1.44.0；官方 checksum manifest 的 SHA-256 先以 release 页面记录值验证，Windows ZIP 再按已验证 manifest 中的条目校验，实际 binary version 为 1.44.0。
- Syft 默认会联网检查自身更新并尝试写用户 cache，沙箱下会引入 150 秒延迟；release 环境固定 `SYFT_CHECK_FOR_APP_UPDATE=false` 且把 cache 定向到忽略的 `.tools/`。
- source/lockfiles 与最终 NSIS/MSI artifact 分别输出 CycloneDX 1.6；smoke source scan 识别 1301 components。
- 冻结安装审计覆盖 291 个唯一 JS packages 与 529 个外部 Cargo packages，均有 license metadata 或 license file。
- Windows CurrentUser/LocalMachine 证书库均无 Code Signing certificate；RC 必须报告 Authenticode `NotSigned` 与 SmartScreen 警告，不能把 updater minisign 混称为系统签名。
- workflow 仅允许 `workflow_dispatch`、contents read 和短期 draft artifact upload，不包含 tag 或 GitHub Release 写入路径。

## 2026-07-16 大阶段 13.9：v0.2 发布候选

- root/core/desktop/Cargo/Tauri/release verifier 统一到 0.2.0；Cargo.lock 只更新 workspace root crate 版本。
- Tauri CLI 只消费 `TAURI_SIGNING_PRIVATE_KEY`；本机路径包装必须在内存读取后注入该变量，并使用 `--ci` 与显式空密码避免非交互签名等待。
- Syft cache 会被通用 ESLint 扫描，发布缓存与 draft artifacts 必须同时进入 Git/Prettier/ESLint 的工具输出边界，保证 release 脚本可重复运行。
- 500 页 PDF 性能用例不应在复用 TXT/EPUB 浏览器进程的基础项目重复执行；独立 DPR2 项目保留严格 50ms 门槛，连续页 metrics 更新按 animation frame 合并，最终全量 26/26。
- SBOM 必须显式提供稳定 source name/version；Authenticode 状态消息需要归一化，防止把构建机绝对路径写入可分发 artifact。
- 当前机器没有安全的隔离安装用户/VM、受信本地 updater HTTPS 测试证书或用户指定的离线密钥备份介质；这些 native/manual 项不能用当前工作区自动化结果替代。
- **侧栏/状态：** Bookmark 增加图标、时间、跳转/删除；Notes 保留真实颜色/摘录/时间并提供 Jump/Delete；Search 增加图标、clear、loading/empty/results；EPUB/TXT/PDF opening 使用各自 skeleton 与真实 indeterminate copy，错误与 PDF per-page retry 保留恢复路径。
- **性能发现：** React tooltip warm state 会令重型 reader 根重渲染，已改为局部 DOM class。PDF 主题使用透明 ink Canvas + mounted surface 背景更新，并 memoize 连续/分页树；测试的 Canvas ink 检查缩小到 128×128，避免测试自身制造 long task，产品 50ms 门槛未放宽。
- **验证：** desktop lint/build、Playwright 21/21；运行态原图复核 desktop settings、375 drawer/sheet、bookmark/notes/search，并确认无横向溢出和 axe serious/critical 问题。最终全量计数以 `progress.md` 为准。
## 2026-07-18 大阶段 13 UI fidelity 与 EPUB 批注修复（进行中）

- **目标证据 01–04：** 批准稿要求侧栏 Contents/Bookmarks/Notes/Search 共用同一信息层级：紧凑图标 tab、细青绿 active underline、无额外大标题；Bookmarks/Notes 每项为图标/色块 + 标题 + page/location + 时间，并把 Jump/Delete 收敛为右下图标；Search 使用单行输入、整宽 Search 按钮、按 location 分隔的紧凑结果和明确 loading/empty state。
- **阅读器设置目标：** desktop settings 固定为轻量分段面板；Theme 为四个等宽色块，Font 为原生感单行下拉，Size 为减号/百分比/加号，Line height/Spacing/Margin 为三段 icon segmented control；page transition 与 Single/Double 只在相应分页格式出现，Reset defaults 位于底部而非挤压核心控制。
- **选区/书签目标：** 选区工具条必须锚定选择范围、顺序为 Highlight/四色/Note/Copy，不能遮挡正文或漂移；页内已有 bookmark 必须显示在对应内容右侧的琥珀描边书签标记，并与顶部 Bookmark 状态同步。
- **分页控制目标：** EPUB/TXT 底部以 Previous、当前 chapter/pages、Next 组成主胶囊，Single/Double 为旁置的独立双段控件；PDF 则把 Continuous/Double、缩放、page 输入、Next 和进度合并为一条底栏，不混用两套结构。
- **现状证据 06–08：** 当前 Notes 把 Jump/Delete 放成高权重大按钮，缺失引用摘录与 page/location；长中文书名和条目字号/换行破坏密度。Search 结果字号过大、横向分栏断裂、滚动条侵入内容。Reading settings 在窄面板里把 transition 做成大卡片网格，导致面板极长，Single/Double 灰显且语义不清；均与批准稿存在材料差异。
- **实现原则：** 保持暖纸/深墨/青绿/琥珀 token 与 44px target；高频 tab/分页不做入场动画，popover 仅 150–200ms origin-aware scale/fade，drawer/sheet 可中断，reduced-motion 禁用位移和缩放。
- **现状证据 09–11：** Font 使用系统原生展开样式，Windows 下灰色高亮与无圆角列表直接穿透设计系统；TXT/PDF 底栏信息重复、层级分裂且 Single/Double 被塞进主导航胶囊；同一选区的 `Saved notes` 浮层固定高度不足，中文多条 note 文本被裁切且没有内部垂直滚动。
- **批准稿 12：** 深墨侧栏目标密度已明确：无冗余大标题，bookmark/note/search item 使用 16px 主文、14px 次文、单一行分隔；动作仅保留 20px 线性图标并靠右，empty state 在列表余量内居中；Search 不把命中片段强制拆成两栏。
- **EPUB 缺陷假设：** `EpubReaderAdapter` 在内容文档装载时同步 annotations，但点击页内目标读取的 note 集合可能被闭包捕获为旧数组；新增 note 后 React 状态已更新，iframe 内事件/标记却未即时重绑，退出重进才重建 adapter，因此应检查 annotation sync effect 与 iframe click handler 的闭包更新，而不是仅强制刷新页面。

### 完成结论

- **根因确认：** 假设成立。epub.js iframe 内容事件只在 document attach 时注册，原 handler 闭包长期读取首次注册时的 annotations；新增第二条及后续 note 后 SVG underline 仍可点击，但返回旧 note 集合。修复以 latest callback ref 解耦事件注册生命周期，并以 `id + locator + note + color + updatedAt + deletedAt` 复合签名驱动标记同步；相同 CFI 的 note 先分组再绘制一个可命中的 underline。
- **失败优先证据：** Playwright 在同一选区连续创建到 8 条 note，每次保存后立即点击当前页 underline 并断言刚新增文本可见；旧实现无需退出重进的第一次断言即失败，修复后完整通过。
- **长列表结论：** `Saved notes` 浮层和 Notes 侧栏都改为 viewport-bounded 内部 scroll container；中文长文本使用 `overflow-wrap:anywhere` 且不再 line-clamp。自动化同时证明 `scrollHeight > clientHeight`，派发 mouse wheel 后 `scrollTop` 真实增加。
- **视觉对照：** Notes/Search 从大按钮和横向分栏收敛为批准稿的单列密集层级；font dropdown 使用受控圆角 listbox；移动 settings 打开后从 Theme 起始且 Reset 位于控制组尾部；pagination 主胶囊与 Single/Double 不再混成一组。完整差异表见 `docs/design/v0.2/stage13-ui-fidelity-followup.md`。
- **Browser 能力边界：** 隔离 Browser 成功验证真实 Vite 页面身份、空书架 DOM 与布局；浏览器环境无法完成 Tauri 原生文件选择（返回 Import canceled），因此三格式、批注和滚轮状态由项目 Playwright 生成 fixture 验证，没有伪造原生导入成功。
- **最终门禁：** `pnpm.cmd check`、Playwright 26/26、Cargo fmt、Rust 51/51、`git diff --check` 全部通过；没有新增 schema、依赖、格式或版本变更。

## 2026-07-18 Page view 设置入口统一

- **重复入口：** TXT 与 EPUB 通过共享 `PaginatedReaderControls` 在阅读舞台渲染 Single/Double；PDF 在自己的 navigation row 中另渲染同名 toggle。三者同时已由 `ReaderThemePanel` 的 Page view radiogroup 控制，因此舞台入口属于重复 UI。
- **状态所有权：** `ReaderShell` 已持有 EPUB spread state 与 TXT/PDF persisted reader experience preferences。Settings 的 change handler 会更新父状态，EPUB effect、TXT layout signature 与 PDF `viewMode` effect 都会把新值同步到各自 adapter/分页器，不需要在阅读舞台保留第二套 handler 或本地状态。
- **Browser 运行态：** 隔离 Browser 在 `127.0.0.1:1420` 验证页面标题、真实空书架、Grid→List pressed 状态、1280 px 无横向溢出、framework overlay=false、console warn/error=0。隔离书库为 0 books，无法进入分页 reader，三格式目标状态继续由生成 fixture 的仓库 Playwright 验证。
- **过程错误：** 一次 PowerShell `rg` 搜索把正则中的 `|` 误解释为管道并退出；后续改为单引号/简化 pattern，未影响代码或验证结果。
- **测试迁移错误：** 首轮三格式 Playwright 中 TXT 仍保留旧的 `TXT page view` 舞台 group 断言而失败，EPUB/PDF 已通过；该断言已改为 Settings 的 `Page view` radiogroup，并显式验证面板关闭后舞台 Single/Double 数量为 0。
- **移动测试状态：** 首轮全量 Playwright 25/26；500 页 PDF 到 375 px 时目录抽屉仍打开，拦截测试助手对 Theme 的点击。设置助手现先检测并通过 `Close contents` 关闭可见抽屉，再进入 Reading Settings；这是测试路径状态修正，不是产品交互绕过。
- **同名关闭入口：** 移动目录同时渲染 backdrop 与面板内两个 `Close contents` 按钮，不能用按钮数量判断是否打开；backdrop 位于 sidebar 下层也不适合作为此状态下的点击目标。最终助手只在 sidebar 的 computed `position` 为 `fixed` 时点击面板内关闭按钮并等待隐藏，避免误关 desktop/640 px 常驻侧栏。
- **构建环境：** Tauri 首次双目标构建已生成 release EXE 与 NSIS，但 WiX `light.exe` 的 ICE01–ICE09 因受限环境无法访问正在运行的 Windows Installer Service 而失败；同一 MSI 命令在允许服务访问的环境执行后成功，说明不是应用代码、WXS 或依赖编译错误。
- **完成结论：** TXT/EPUB/PDF 阅读舞台均不再渲染 Single/Double，唯一入口为 Theme / Reading Settings 的 Page view；Settings 的既有父状态和 adapter 同步仍负责布局切换与持久化。176 Vitest、26 Playwright、51 Rust tests、Cargo fmt、NSIS/MSI 构建通过。

## 2026-07-18 v0.2 正式发布

- **产物新鲜度：** `release-artifacts/v0.2.0-rc/` 最后生成于 2026-07-17，早于 2026-07-18 的 UI/Page view 收口提交，必须整体重建，不能直接上传。
- **浏览器状态：** 内置侧边浏览器已有仓库主页标签 `https://github.com/aaaaa-ozo23/ebook-reader`，正式发布仍需在产物验收后确认登录态并创建 Release。
- **隔离能力：** 当前系统没有 `WindowsSandbox.exe`；干净状态验证必须使用独立安装目录和重定向的 `APPDATA`/`LOCALAPPDATA`，不能清空或覆盖真实用户目录。
- **密钥检查：** updater 私钥路径存在；受限环境读取 ACL 返回 unauthorized，后续只在允许的系统上下文验证 ACL/用于签名，绝不输出密钥内容。维护者已于 2026-07-19 明确确认完成独立离线备份，门禁已解除且不记录介质位置。
- **GitHub 权限：** 内置侧边浏览器仓库页显示已登录头像、通知与创建入口，当前账号可见仓库管理 UI；默认 `main` 仍停留在 v0.1 文档，正式 v0.2 publication source 必须在发布后同步回主线。
- **真实数据隔离：** 机器上仍有旧 `%LOCALAPPDATA%\Ebook Reader` 程序目录和真实 `%APPDATA%\com.ebookreader.desktop` 数据库。Windows `SHGetKnownFolderPath` 不接受仅重定向 `APPDATA/LOCALAPPDATA` 作为可靠隔离，首次尝试未在测试根创建数据库；后续没有清空或替换真实数据。
- **隔离替代证据：** 最终 NSIS 实际安装的 EXE 为 0.2.0；NSIS `installer.nsi` 只有主 EXE `File` 指令，MSI administrative image 也只有 0.2.0 主 EXE。再以仓库既有独立 identifier `com.ebookreader.desktop.updater-test` 启动同源 0.2.0 release binary，所有用户内容表与 managed book files 均为 0。因此发布包不携带测试数据库/书籍，fresh identifier 初始化为空。
- **诊断错误：** 尝试同时重定向 `USERPROFILE` 与 AppData 启动时 Windows 返回 access denied；该方法未继续重试，改用仓库既有独立 identifier，避免修改 Known Folder 注册表或真实用户目录。
- **Playwright 清理：** publication 最终套件 26 个项目全部显示通过点；与既有记录一致，Playwright 完成后 Windows Vite 子进程未释放输出句柄导致外层超时。此清理问题不改变 26/26 断言结果，未生成失败上下文。
- **Release 草稿：** 内置侧边浏览器已将正式说明与 11 个最终产物保存到 GitHub draft；页面确认 `Latest` 被选中且提示 tag 将在发布时从 `release/v0.2.0` 创建。维护者确认离线备份后，正式 tag 与 Publish 已获既定计划门禁授权。
- **公开页面：** Release 已公开为 Latest，URL 为 `https://github.com/aaaaa-ozo23/ebook-reader/releases/tag/v0.2.0`；页面显示 tag `v0.2.0`、commit `b67b2a4`、无 draft 提示。GitHub 资产计数 13 包含 11 个上传资产及自动生成的两份 Source code archive。
- **远程完整性：** GitHub Release API 的 11 个资产全部为 uploaded；服务端 `sha256:` digest 与 size 逐项匹配本地最终产物。`releases/latest/download/latest.json` 可公开访问，内容与本地 feed 相同，version 为 0.2.0、Windows URL 指向 v0.2.0 NSIS、签名字段为完整 424 字节文本。
