# 阶段 9 视觉忠实度与验收账本

验收日期：2026-07-07。批准概念提供视觉方向，产品能力、文案和行为以本目录 `README.md` 的校正规则为准。

## 五点对照

| 维度 | 结果 | 证据与偏差 |
|------|------|------------|
| 布局 | passed | 1280px 书架保留紧凑左 rail、开放 workspace、右上视图/导入操作；阅读器保持现有单侧栏，不复制概念图中的书架 rail。640px/375px 由抽屉和底部面板接管。 |
| 色彩 | passed | chrome 使用 charcoal/teal/amber，正文使用 paper/light/sepia/green/dark 独立主题；错误/删除继续使用 brick red。未把图片作为 UI 背景。 |
| 排版 | passed | 应用 chrome 保持当前英文信息架构与 system sans，阅读正文继续由 `ReaderTheme` 控制 serif/sans、字号、行高、段距和页边距；未加入概念误生成的 Letter spacing。 |
| 控件 | passed | Button、IconButton、SegmentedControl、Toolbar、Modal/Sheet、SliderField 覆盖默认、hover、focus、disabled；375px 采样按钮均为 44px，Escape 关闭设置后焦点返回 `Open settings`。 |
| 动效/响应式 | passed | 仅 `none/slide/page-curl`；slide 220ms、page-curl 500ms，reduced motion 运行时跳过。1280×800、640×640、375×760 均无横向溢出，375px sheet 底边为 760px。 |

## 概念校正结果

- 不实现 MOBI/AZW3、EPUB scrolled、Auto、Fade、Letter spacing、Reset defaults。
- 图片查看器仍属于阶段 10；阶段 9 只锁定 Modal/Sheet、焦点和覆盖阅读器的契约。
- 移动端不实现概念中的系统状态栏、设备边框和底部系统手势条。
- 当前产品英文信息架构不因概念图的示例书名、作者、进度或装饰文案而改变。
- 阶段 9 不重写书架/阅读器布局；设计系统 fixture 用于批准 token、状态和动效，不冒充最终三格式阅读器。

## 自动化与 Browser 证据

- Browser/IAB：1280×800、640×640、375×760；四主题矩阵、键盘 Escape、焦点恢复、desktop modal、mobile sheet、44px 触控目标和无横向溢出通过，console 无 warning/error。
- Playwright：12/12，通过 TXT、EPUB、PDF、DPR 2、三档响应式、reduced motion、30 次快速输入和 axe；serious/critical 均为 0。
- `view_image`：已对照四张批准概念与最终书架/fixture 截图；本地证据为 `D:\tl-temp\ebook-reader-stage9-shelf-1280.png`、`ebook-reader-stage9-fixture-1280.png`、`ebook-reader-stage9-fixture-640.png`、`ebook-reader-stage9-fixture-375.png`。

## 包体与加载边界

| 产物 | gzip | 结论 |
|------|------|------|
| 书架入口 JS | 66.85 kB | 低于 68.45 kB 绝对门槛；封面生成器在队列启动时异步加载 |
| ReaderShell JS | 29.79 kB | 继续由 `React.lazy` 异步加载 |
| ReaderShell CSS | 5.48 kB | 只随 ReaderShell 异步 chunk 加载 |
| bookCovers JS | 1.25 kB | 从书架入口拆出；EPUB/PDF runtime 仍保持独立动态 chunk |

同一当前工具链隔离重建阶段 8 得到 69.08 kB gzip，旧文档 68.45–68.46 kB 属构建工具链观测差异；当前实现同时低于旧绝对值和当前重建值。

## page-curl 最终决策

`page-flip@2.0.7` 为 MIT、零运行时依赖、ESM 43.8 kB，但未通过实时 iframe/Canvas/标注 DOM 隔离和确定性事务 gate。v0.2 不保留该依赖，使用项目内 CSS 3D/WAAPI 隔离快照展示层；实时文本、epub.js iframe、PDF Canvas/文本/标注层不被包裹或接管。
