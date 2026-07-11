# Ebook Reader v0.2 UI 概念规格

## 审批状态

- 审批日期：2026-07-06
- 审批结论：视觉方向批准，功能和文案按 `docs/v0.2-roadmap.md` 校正。
- 优先级：本文件的校正清单和路线图契约高于概念图中的生成偏差。
- 阶段边界：阶段 9 建立 token、基础组件和模块边界；阶段 10–13 再逐步完成图片查看、格式模式和视觉收口。

## 概念资产

| 资产 | 目标视口 | 用途 |
|------|----------|------|
| `bookshelf-desktop.png` | 1280×800 | 有书书架、grid/list、导入和书籍操作 |
| `reader-desktop.png` | 1280×800 | 三格式共用阅读 chrome、侧栏、设置和底部导航 |
| `epub-image-viewer-desktop.png` | 1280×800 | EPUB 图片模态查看和 100%–500% 缩放 |
| `responsive-mobile-board.png` | 375×760 | 移动书架、阅读器抽屉和设置底部面板 |

概念图中的书名和封面只用于设计演示，不作为应用内置内容或发布资产。

## 设计方向

### 容器和布局

- 书架保留当前窄炭黑导航 rail、开放式 workspace、Grid/List 和 Import book；不增加营销页或额外导航。
- 桌面阅读器只保留一个阅读侧栏，侧栏内包含 Back to shelf、Contents、Bookmarks、Notes、Search；不复制书架 rail。
- 正文使用开放式纸张表面，不套多层卡片；工具 chrome 保持紧凑，正文继续使用用户主题变量。
- 设置在桌面为右侧面板，在 375px 为底部面板；打开时必须保留可辨认的阅读位置并管理焦点。
- 图片查看器覆盖真实阅读器，背景不可交互；工具栏、图片舞台和缩放轨道属于一个模态容器。

### 颜色与表面

| 角色 | 基准值 | 规则 |
|------|--------|------|
| Chrome charcoal | `#243438` / `#263238` | rail、侧栏、深色模态工具栏 |
| Accent amber | `#f3bc55` | 3px focus、当前项和少量强调 |
| Action teal | `#2f5d62` | 主操作、选中分段、进度 |
| Paper | `#f5f2ea` / `#f7f1e3` | 书架背景和 sepia 正文 |
| Ink | `#25211d` | 正文和高优先级文本 |
| Border | `#d5ccb9` / `#ded7c8` | 低对比边界，不制造嵌套卡片 |

白色表面保持真实白色；纸色只用于已指定的背景/阅读主题，不把所有表面统一暖化。阴影只用于弹出菜单、抽屉和模态层。

### 排版

- UI chrome：Inter / Segoe UI / system sans，控件文字显式定义为 12–16px、600–800 weight。
- 阅读正文：继续由 `ReaderTheme.fontFamily/fontSize/lineHeight/paragraphSpacing/pageMargin` 控制。
- 标题和正文层级保持现有英文信息架构；不增加 eyebrow、badge、统计卡或装饰文案。
- 控件不得依赖浏览器默认字号、行高或字重。

### 圆角、边框和阴影

- 小控件 6px、普通控件/菜单 8px、主要浮层 12px；不使用巨型圆角容器。
- 默认边框 1px；focus-visible 为 3px amber、2px offset。
- 阴影分为菜单、抽屉和模态三档；静态书架卡片只使用低强度边界/阴影。

### 动效

- 快速控件反馈：120–160ms。
- slide 阅读过渡：180–240ms。
- page-curl 展示层：420–560ms。
- 抽屉/模态：180–240ms。
- `prefers-reduced-motion: reduce` 时运行时过渡为 `none`，但不覆盖保存偏好。

## 允许的可见文案

### 书架

`LOCAL LIBRARY`、`Ebook Reader`、`Shelf`、`Recent`、`Grid`、`List`、`Import book`、书籍数量、排序状态、书名、作者、`EPUB`、`TXT`、`PDF`、阅读进度、`Open`、`Remove from shelf`。

### 阅读器

`Shelf`、`Back to shelf`、`Contents`、`Bookmarks`、`Notes`、`Search`、`Bookmark`、`Theme`、`Focus`、`Exit focus`、格式 reading、书名、章节/位置、`Previous`、`Next`、`Light`、`Sepia`、`Green`、`Dark`、`Font`、`Size`、`Line`、`Spacing`、`Margin`、`View`、`Page transition`、`Reading mode`、`Continuous`、`None`、`Realistic`、`Cover`、`Smooth`、`Single`、`Double`、`Page`、`Pages`。

### 图片查看器

图片替代文本/标题、`Zoom out`、缩放百分比、`Zoom in`、`Reset`、`Close`、`Drag to pan` 及键盘帮助。不得增加分享、下载或云端操作。

## 格式能力和概念校正

| 概念图偏差 | 实现规则 |
|------------|----------|
| 书架出现 `MOBI` | 替换为 EPUB/TXT/PDF；MOBI/AZW3 不进入 v0.2 |
| EPUB 设置出现 Auto/Scrolled/Paged | EPUB 仅 `paginated`；UI 只显示该格式能力允许的模式 |
| 动效出现 Fade | EPUB/TXT 分页仅 `none`、`slide`、`cover`、`page-curl` |
| 阅读设置出现 Letter spacing/Reset defaults | 阶段 9 不新增；保留现有 Font/Size/Line/Spacing/Margin |
| 桌面阅读器出现书架 rail + 阅读侧栏 | 只保留现有阅读侧栏，避免重复导航 |
| 图片查看器背景为书架 | 实现必须覆盖 EPUB 阅读器，并在关闭后恢复触发点焦点 |
| 移动图包含系统状态栏/设备底栏 | 不实现设备硬件/系统 chrome，只实现 375×760 应用内容 |
| 移动书架省略桌面 rail | 沿用当前响应式书架规则，不引入新的底部 tab 导航 |

## 组件和状态清单

- Button：primary、secondary、ghost、danger；default、hover、active、focus、disabled、loading。
- IconButton：统一 1.75px rounded outline 风格，至少 40px 桌面/44px 触控目标。
- SegmentedControl：单选、键盘方向键、选中、focus、disabled。
- Toolbar：紧凑标签、图标对齐、窄屏折叠；不使用纯文本箭头替代方向 SVG。
- Sidebar/Drawer：桌面 240–480px，可拖拽；761–899px 上限 40vw；≤760px 为最大 86vw 抽屉。
- Modal/Sheet：焦点陷阱、Escape、背景不可交互、关闭后恢复焦点；375px 设置使用底部面板。
- SliderField：标签、当前值、range、键盘；正文主题值继续使用现有范围。
- 状态：loading、empty、error/retry、success、saving；不把状态变成装饰 badge。

## 图标清单

- 书架：Shelf、Recent、grid、list、import、overflow。
- 阅读器：back、contents、bookmark、theme、focus、search、note、previous、next。
- 图片查看：image、zoom-out、zoom-in、reset、close、pan。
- 图标使用统一 viewBox、`currentColor`、圆角端点和光学尺寸；方向控制使用 SVG，不使用普通字符箭头。

## 响应式规则

- 1280×800：完整书架、可调阅读侧栏和桌面设置面板。
- 900×640：保留设置的桌面侧栏宽度。
- 761–899px：阅读侧栏宽度限制为 40vw。
- 640×640：阅读侧栏改抽屉，工具栏压缩，不允许覆盖主要正文。
- 375×760：抽屉最大 86vw；设置为底部面板；44px 触控目标；body 不出现水平滚动。

## 实现和验收约束

- 概念中的应用 UI 全部用 React/CSS/语义 HTML 实现，不能把截图作为产品 UI。
- 书架入口继续懒加载 ReaderShell；EPUB/PDF runtime 不进入首屏 chunk。
- 每个视觉阶段同时检查 light/dark/sepia/green、focus-visible 和 reduced motion。
- 最终使用 Browser/IAB 的 1280×800、640×640、375×760 截图与本目录概念图对照，并维护 fidelity ledger。

阶段 9 最终五点对照、Browser/Playwright 证据、page-curl 决策和包体数据见 [`fidelity-ledger.md`](./fidelity-ledger.md)。

阶段 11 TXT 分页、五项阅读方式、Single/Double、响应式修复和完整门禁见 [`stage11-txt-pagination-fidelity.md`](./stage11-txt-pagination-fidelity.md)。
