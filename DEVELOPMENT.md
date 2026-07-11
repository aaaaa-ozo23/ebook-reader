# PC 端本地电子书阅读器开发文档

更新时间：2026-06-19
首版目标平台：Windows 11 x64
首版定位：本地优先的桌面电子书阅读器，优先实现稳定、舒适、可定制的阅读体验。

## 1. 项目目标

本项目计划开发一个开源 PC 端文档与电子书阅读器。首版以 Windows 为主，后续扩展到 macOS、Linux，并为移动端 React Native 客户端保留共享核心逻辑的空间。

首版只做本地能力，不做账号系统、云同步、AI 翻译、在线书城或推荐系统。

核心体验目标：

- 支持导入和阅读常见格式：EPUB、TXT、PDF；MOBI/AZW3 放到后续阶段。
- 阅读体验接近手机电子书 App 或起点中文网：沉浸、翻页顺滑、样式可调、章节导航清晰。
- 支持背景、字体、字号、行高、段距、页边距、夜间模式。
- 支持目录、阅读进度、书签、高亮、想法/笔记。
- 全部数据本地保存，默认不上传原书文件和阅读数据。

## 2. 已采纳技术路线

推荐路线：

```text
桌面端：Tauri 2 + React + TypeScript + Vite
本地后端：Rust
本地数据：SQLite
包管理器：pnpm
未来移动端：React Native / Expo + TypeScript
共享逻辑：TypeScript monorepo packages
```

选择原因：

- Tauri 2 适合轻量 Windows 桌面应用，前端可复用 Web 阅读渲染生态，后端可用 Rust 处理文件、数据库和系统能力。
- React + TypeScript 适合构建复杂阅读器 UI，并能和未来 React Native 共享模型、同步协议和业务逻辑。
- EPUB 和 PDF 已有成熟 Web 渲染生态，首版不应手写渲染器。
- SQLite 适合本地书库、进度、书签、高亮、笔记和用户设置。

备选不作为首选：

- Electron：跨平台渲染一致性更强，但包体和内存占用更大。
- Flutter：移动端和统一 UI 能力强，但 EPUB/PDF/Web 内容渲染会增加额外成本。
- Tauri Mobile：可以继续关注，但首个移动端更建议 React Native，以保证原生手势、文字选择、文件导入和系统集成体验。

## 3. 本机开发环境检查结果

当前工作目录：

```text
C:\Users\许涵予xhy\Documents\Codex\2026-06-11\pc-windows-macos-linux-epub-txt
```

环境快照：

| 项目 | 当前状态 | 结论 |
|---|---:|---|
| OS | Microsoft Windows 11 家庭版 中文版，10.0.26200，64 位 | 可用 |
| Node.js | v26.1.0 | 可用 |
| npm | 11.13.0 | 可用 |
| pnpm | 11.1.2 | 可用 |
| Git | 2.53.0.windows.1 | 可用 |
| Rust | rustc 1.95.0，host: x86_64-pc-windows-msvc | 可用 |
| Cargo | 1.95.0 | 可用 |
| rustup | stable-x86_64-pc-windows-msvc | 可用 |
| Visual Studio | Visual Studio Community 2026，18.6.11806.211 | 可用 |
| MSVC Tools | 14.51.36231 | 可用 |
| WebView2 Runtime | 149.0.4022.69 | 可用 |
| Tauri CLI | tauri-cli 2.11.3 | 已补齐 |
| SQLite CLI | 3.53.2 | 已补齐 |

已执行的补齐动作：

- 安装 Rust 侧 Tauri CLI：`cargo install tauri-cli --locked`
- 安装 SQLite 命令行工具：`winget install --id SQLite.SQLite --source winget --accept-package-agreements --accept-source-agreements --silent`

注意事项：

- 当前 PowerShell 执行策略会拦截 `npm.ps1`、`pnpm.ps1` 等脚本。后续命令统一使用 `npm.cmd`、`pnpm.cmd`。
- SQLite 已由 winget 写入用户 PATH，但当前 PowerShell 进程未刷新环境变量。重启终端后可直接使用 `sqlite3`；当前会话可用绝对路径：

```powershell
& "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\SQLite.SQLite_Microsoft.Winget.Source_8wekyb3d8bbwe\sqlite3.exe" --version
```

## 4. 建议仓库结构

建议从一开始采用 monorepo，但首期只实现桌面端：

```text
.
├─ apps/
│  └─ desktop/                  # Tauri 2 + React + Vite Windows 桌面端
│     ├─ src/                    # React UI
│     ├─ src-tauri/              # Rust 后端、Tauri 配置、数据库命令
│     └─ tests/                  # 桌面端 UI/集成测试
├─ packages/
│  ├─ core/                      # 书籍、章节、定位、设置等共享模型
│  ├─ reader-engine/             # EPUB/TXT/PDF 适配层接口
│  ├─ annotations/               # 高亮、笔记、书签共享逻辑
│  └─ db-schema/                 # SQLite schema 与迁移说明
├─ docs/                         # 项目文档
├─ fixtures/                     # 测试用 EPUB/TXT/PDF 样本，避免提交版权材料
├─ package.json
├─ pnpm-workspace.yaml
└─ README.md
```

首期不要过度拆包。`packages/core` 和 `apps/desktop` 足够启动；等高亮、同步、格式引擎变复杂后再拆出更多包。

## 5. 初始脚手架建议

建议在正式建仓时执行：

```powershell
mkdir apps
cd apps
pnpm.cmd create tauri-app desktop --template react-ts
cd desktop
pnpm.cmd install
pnpm.cmd tauri dev
```

生成后再把根目录整理为 pnpm workspace：

```yaml
# pnpm-workspace.yaml
packages:
  - "apps/*"
  - "packages/*"
```

桌面端常用脚本建议：

```json
{
  "scripts": {
    "dev": "vite",
    "tauri:dev": "tauri dev",
    "build": "tsc && vite build",
    "tauri:build": "tauri build",
    "test": "vitest run",
    "lint": "eslint ."
  }
}
```

## 6. 核心依赖建议

前端依赖：

```powershell
pnpm.cmd add epubjs pdfjs-dist zustand
pnpm.cmd add @tauri-apps/api
pnpm.cmd add @tauri-apps/plugin-dialog @tauri-apps/plugin-fs @tauri-apps/plugin-opener
pnpm.cmd add -D vitest @testing-library/react @testing-library/user-event playwright
```

Rust 依赖建议：

```powershell
cd apps\desktop\src-tauri
cargo add serde serde_json thiserror anyhow uuid sha2
cargo add rusqlite --features bundled
cargo add encoding_rs chardetng
```

说明：

- `epubjs`：首版 EPUB 渲染。
- `pdfjs-dist`：PDF 渲染，不自行实现 PDF 解析。
- `zustand`：轻量 UI 状态管理，适合阅读器设置、面板状态、当前书籍状态。
- `rusqlite` + `bundled`：减少 Windows 上 SQLite 原生库缺失问题。
- `encoding_rs` / `chardetng`：处理 TXT 编码识别，尤其是中文旧文件。

## 7. 格式支持策略

### EPUB

首版用 `epubjs` 渲染，并封装为 `EpubReaderAdapter`。

必须支持：

- 目录解析
- 章节跳转
- 字体、字号、行高、背景主题
- 阅读进度恢复
- 高亮定位

定位建议：

```ts
type EpubLocator = {
  kind: "epub";
  href: string;
  cfi?: string;
  progression?: number;
  selectedText?: string;
  contextBefore?: string;
  contextAfter?: string;
};
```

### TXT

TXT 是中文网文阅读体验的关键，建议优先打磨。

必须支持：

- UTF-8、GBK、GB18030、Big5 等编码识别
- 按规则识别章节，例如“第 x 章”、“第 x 回”、“Chapter x”
- 长文本虚拟化渲染
- 类起点阅读布局：居中正文、舒适行宽、段落缩进、背景纸色、夜间模式

定位建议：

```ts
type TxtLocator = {
  kind: "txt";
  chapterId?: string;
  charOffset: number;
  selectedText?: string;
  contextBefore?: string;
  contextAfter?: string;
};
```

### PDF

PDF 首版以稳定阅读为主，不强求像 EPUB 一样完整重排。

必须支持：

- 页面缩放
- 页面导航
- 目录 outline
- 记住页码和缩放
- 文本高亮，能做则做矩形区域高亮

定位建议：

```ts
type PdfLocator = {
  kind: "pdf";
  page: number;
  rects?: Array<{ x: number; y: number; width: number; height: number }>;
  scale?: number;
  selectedText?: string;
};
```

### MOBI / AZW3

不进入 MVP。第二阶段再处理：

- 优先考虑“导入时转换为 EPUB”的路线。
- 转换器如果依赖 Calibre、MuPDF 或其他外部工具，要单独评估许可证、体积、分发方式和用户体验。
- 不建议首版为了 MOBI 拖慢 EPUB/TXT/PDF 的基础体验。

## 8. 阅读器模块设计

建议定义统一接口，让不同格式各自实现：

```ts
export interface ReaderAdapter<TLocator> {
  open(bookId: string): Promise<void>;
  close(): Promise<void>;
  getToc(): Promise<TocItem[]>;
  goTo(locator: TLocator): Promise<void>;
  getCurrentLocator(): Promise<TLocator>;
  setTheme(theme: ReaderTheme): Promise<void>;
  search?(query: string): Promise<SearchHit[]>;
}
```

前端主要模块：

```text
BookShelf       # 书架、导入、最近阅读
ReaderShell     # 阅读主布局，控制顶部栏/侧边栏/设置面板
TocPanel        # 目录
ReaderViewport  # EPUB/TXT/PDF 渲染区域
ThemePanel      # 字体、字号、行高、背景、夜间模式
AnnotationMenu  # 选中文字后的高亮、备注、复制
NotesPanel      # 高亮和想法列表
```

Rust 后端主要命令：

```text
import_book(path)              # 导入书籍，计算 hash，写入数据库
list_books()                   # 书架列表
get_book_file(book_id)         # 返回可供前端读取的安全路径或资源句柄
save_progress(book_id, locator)
save_bookmark(book_id, locator)
save_annotation(book_id, annotation)
list_annotations(book_id)
update_reader_settings(settings)
```

## 9. SQLite 数据模型草案

首版建议使用迁移文件管理 schema。

```sql
CREATE TABLE books (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  author TEXT,
  format TEXT NOT NULL,
  source_path TEXT,
  library_path TEXT NOT NULL,
  file_hash TEXT NOT NULL,
  cover_path TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_opened_at TEXT
);

CREATE TABLE reading_progress (
  book_id TEXT PRIMARY KEY,
  locator_json TEXT NOT NULL,
  progress REAL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
);

CREATE TABLE bookmarks (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL,
  locator_json TEXT NOT NULL,
  label TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
);

CREATE TABLE annotations (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL,
  type TEXT NOT NULL,
  color TEXT,
  selected_text TEXT,
  note TEXT,
  locator_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
);

CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

后续移动端和云同步要预留：

- 所有核心数据使用 UUID。
- 记录 `created_at`、`updated_at`、可选 `deleted_at`。
- 高亮和笔记不要只存页面编号；必须存 locator、选中文本和上下文。

## 10. MVP 开发顺序

### 阶段 0：项目骨架

目标：

- 创建 Tauri + React + TypeScript 项目。
- 配置 pnpm workspace。
- 配置 ESLint、Prettier、Vitest。
- 配置 Rust 基础模块和 SQLite 连接。
- 完成空窗口启动、开发命令、构建命令。

验收：

```powershell
pnpm.cmd install
pnpm.cmd --filter @reader/desktop tauri:dev
cargo test --manifest-path apps\desktop\src-tauri\Cargo.toml
```

### 阶段 1：书架和导入

目标：

- 通过文件选择器导入 EPUB/TXT/PDF。
- 计算文件 hash。
- 复制到应用数据目录。
- 写入 `books` 表。
- 展示书架和最近阅读。

验收：

- 重启应用后书籍仍存在。
- 同一本文件重复导入能识别。

### 阶段 2：TXT 阅读器

目标：

- 完成 TXT 编码识别。
- 完成章节识别。
- 完成基础阅读主题。
- 完成阅读进度恢复。

原因：

TXT 最接近中文网文阅读体验，最适合先打磨“像手机阅读器”的核心感受。

### 阶段 3：EPUB 阅读器

目标：

- 集成 `epubjs`。
- 支持目录、章节跳转、主题设置、进度恢复。
- 验证高亮定位策略。

### 阶段 4：PDF 阅读器

目标：

- 集成 `pdfjs-dist`。
- 支持页码、缩放、目录和阅读进度。
- 首版高亮可先做页面级或文本选择级，不强求复杂编辑。

### 阶段 5：书签、高亮、想法

目标：

- 统一 EPUB/TXT/PDF 的 annotation UI。
- 支持高亮颜色。
- 支持给高亮添加想法。
- 支持笔记列表跳转回原文。

### 阶段 6：Windows 打包

目标：

- 配置应用图标、名称、版本号。
- 配置 Windows 安装包。
- 配置 `.epub`、`.txt`、`.pdf` 文件关联。
- 验证安装、卸载、升级。

验收：

```powershell
pnpm.cmd --filter @reader/desktop tauri:build
```

## 11. UI 与阅读体验原则

阅读器首页不要做营销落地页。打开应用后应直接进入书架。

首版界面建议：

- 左侧窄栏：书架、最近、笔记、设置。
- 主区：书籍网格或列表。
- 阅读页：正文居中，顶部栏和侧边栏可自动隐藏。
- 设置面板：字体、字号、行高、段距、边距、背景、翻页方式。

阅读体验要求：

- 默认正文宽度不要铺满全屏。
- 默认背景不要纯白刺眼，建议提供纸色、浅灰、深色、护眼色。
- 字号、行高、页边距调整要即时生效。
- 高亮菜单不能遮挡选中文本太久。
- 键盘支持左右翻页、Esc 退出面板、Ctrl+F 搜索。
- TXT/EPUB 的“页码”只能作为当前布局下的显示值，不能作为唯一持久定位。

## 12. 测试策略

前端测试：

- 组件测试：书架、设置面板、目录、高亮菜单。
- 状态测试：主题切换、进度保存、书签增删。
- Playwright：导入样本书、打开阅读器、调整主题、恢复进度。

Rust 测试：

- 文件 hash。
- 书籍导入。
- SQLite migration。
- TXT 编码识别和章节识别。
- locator 序列化/反序列化。

样本文件：

- 可以提交自制或公版小样本。
- 不要提交带版权的商业电子书。
- 大文件测试样本放到本地或 CI 外部下载，不直接进仓库。

## 13. 开源注意事项

首版建议许可证：

- 应用代码：MIT 或 Apache-2.0。
- 如果希望更强 copyleft，可选 GPL-3.0，但会影响后续商业兼容性。

依赖风险：

- PDF.js 和 epub.js 的许可证一般适合开源项目，但正式发布前需要逐项核查。
- MuPDF 是 AGPL/商业双许可，若用于 MOBI/PDF 转换或渲染，必须提前确认是否接受 AGPL 传染范围。
- Calibre 生态强，但体积和分发方式较重，不适合作为首版默认依赖。

隐私原则：

- 默认不上传书籍、进度、笔记。
- 本地数据库路径要写入文档。
- 后续若做同步，必须先做导出和删除能力。

## 14. v0.2 技术方向

v0.1.0 已完成 Windows 发布。v0.2 的完整范围、接口、风险、优先级和验收矩阵见 [`docs/v0.2-roadmap.md`](docs/v0.2-roadmap.md)。实施顺序固定为：

1. 阅读体验共享类型、设置持久化、动效控制层和渐进设计系统。
2. EPUB 出版物页码、位置回退、图片查看器和分页动画。
3. TXT 分页模式、布局缓存和分页动画。
4. PDF 虚拟化连续滚动、页内恢复和分页动画。
5. UI 收口、备份恢复、更新发布轨道及可选产品增强。

架构约束：

- `PageTransitionMode` 为 `none | slide | cover | page-curl`。EPUB 与 TXT 分页支持四种模式；PDF continuous 不使用翻页动画。
- TXT 默认 Continuous，并与 None/Realistic/Cover/Smooth 四种分页方式并列；分页可选 single/double。EPUB paginated、PDF single 保持各自默认值；reduced motion 在运行时强制无动画，但不覆盖保存设置。
- TXT 页边界继续由 `charOffset` 锚定；EPUB 自带页码来自可选 page-list，缺失时显示 Location；PDF continuous 用可选 `pageOffsetRatio` 恢复页内位置。
- 阅读体验设置继续使用 `app_settings` 的版本化 JSON，不为这些全局偏好新增表或列。
- UI 保留现有信息架构与品牌色，先审批完整概念和建立 token，再按模块拆分 ReaderShell，禁止一次性重写。
- v0.2 不同时启动 MOBI/AZW3、跨平台、移动端、TTS、词典/翻译或云同步实现。

## 15. 参考资料

- Tauri v2 Windows prerequisites: https://v2.tauri.app/start/prerequisites/
- Tauri v2 create project: https://v2.tauri.app/start/create-project/
- Tauri v2 Windows installer: https://v2.tauri.app/distribute/windows-installer/
- epub.js: https://github.com/futurepress/epub.js/
- PDF.js: https://mozilla.github.io/pdf.js/
- SQLite: https://www.sqlite.org/about.html
