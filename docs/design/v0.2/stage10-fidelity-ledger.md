# 阶段 10 EPUB 增强 fidelity ledger

验收日期：2026-07-10。批准概念用于确定阅读器、设置面板与图片查看器的视觉方向；产品能力和文案继续以 `docs/design/v0.2/README.md` 的校正规则及阶段 10 实施计划为准。

## 交付范围

| 能力 | 结果 | 证据 |
|------|------|------|
| 出版物 page-list | passed | EPUB3 navigation、EPUB2 NCX、数字/罗马数字/原始非空标签、href/fragment/package CFI、spine + CFI 排序与 `epub_page_list_v1` 缓存 |
| Location 回退 | passed | 首个有效边界之前、无 page-list、完全损坏 page-list、缓存版本/结构损坏均只显示 `Location current / total`，不伪造 Page |
| 图片资源桥接 | passed | HTML `img`、SVG `image`、click/Enter/Space、装饰/隐藏/损坏过滤、listener 与运行时属性清理；无 fetch/createObjectURL |
| 图片查看器 | passed | Fit、100%、100%–500%、滚轮/pinch、拖动、Space+拖动、双击、Reset、Esc/Close、焦点恢复与 375×760 全屏布局 |
| Slide | passed | None/Slide 偏好持久化；single/double spread 作为一个事务；30 次输入只执行首个和最终方向；每次成功导航一次 progress commit |
| Page curl | passed | 500ms CSS 3D/WAAPI sheet、背面、动态阴影和 target reveal；实时 rendition DOM 不进入动画层；快照/资源/WAAPI 失败无动画完成导航 |
| 互斥与重排 | passed | 图片查看器、选择菜单、note editor/popover 禁用 page-curl；theme/resize/spread/非相邻跳转取消动画并以当前 CFI/href 恢复 |

## Fixture 矩阵

| Fixture | 覆盖位置 | 结论 |
|---------|----------|------|
| EPUB3 page-list | `EpubPageList.test.ts` | 原始 `i` / `1` 标签、外部/空条目逐项丢弃 |
| EPUB2 NCX | `EpubPageList.test.ts` | `xiv` / `15` 原始标签保留 |
| 无 page-list | `EpubPageList.test.ts` | 返回空边界并使用 Location |
| 完全损坏 page-list/cache | `EpubPageList.test.ts` | 空标签/target、外部 target、未知 cache version 与非法结构回退 |
| href/fragment/package CFI | `EpubPageList.test.ts` | section 起点、element→CFI、package CFI、spine/CFI 顺序 |
| HTML/SVG 图片 | `EpubImageBridge.test.ts` | iframe-owned HTML image 与 SVG image 激活、清理和资源复用 |
| 长章节/双页 | `tests/smoke.spec.ts` generated EPUB | 两章各 80 段、Location 生成、single/double、末位置与 page-curl 往返 |

## 视觉与交互对照

- 阅读 chrome 保留 charcoal/teal/amber/paper 体系，Page transition 放入现有 Theme 面板；未加入概念误生成的 Fade、EPUB scrolled、Auto 或 Letter spacing。
- 图片查看器继续覆盖真实 EPUB 阅读器，不使用书架背景，不加入下载、分享、编辑、OCR 或图库。
- 初版直接 3D 旋转 snapshot iframe 在 Chromium 截图中产生越界黑色合成面。最终实现让 sandboxed iframe 只承担只读 current/target 内容及 clip reveal，独立无交互 CSS sheet 承担 3D fold/back/shadow；复查截图无黑屏且动画仅覆盖阅读舞台。
- `view_image` 已对照批准阅读器概念与 `D:\tl-temp\ebook-reader-stage10-page-curl.png`，并复核图片查看器桌面/移动截图。
- Browser/IAB 在 1280×800、640×640、375×760 复核书架首屏；每次 viewport override 后 reload，DOM `scrollWidth <= clientWidth`，无 framework overlay，console warning/error 为空。真实 seeded EPUB 由 Playwright 验证。

## 无障碍与降级

- axe 4.12 legacy frame mode检查主文档与同源 EPUB iframe，serious/critical 为 0；验收期间发现并修复 rendition iframe 缺少 accessible name，现使用章节 title 或 `EPUB publication content` 回退。
- 动画层 `aria-hidden=true`、`pointer-events:none`，结束、取消、捕获失败和 WAAPI 不可用时都会销毁。
- reduced motion 下 None/Slide/Page curl 均直接执行真实导航，不捕获快照，不覆盖保存偏好；图片缩放/平移功能保持可用。
- 图片查看器使用 focus trap；关闭后优先恢复 iframe 图片焦点，触发元素失效时回退 EPUB host。

## 性能、包体与边界

| 观测 | 结果 |
|------|------|
| 30 次快速输入 | 两档 viewport 都只 commit 2 次，无 >50ms long task |
| 书架入口 JS | 67.09 kB gzip；未加载 ReaderShell、epub.js 或 pdf.js runtime |
| ReaderShell JS | 39.33 kB gzip，继续由 `React.lazy` 异步加载 |
| ReaderShell CSS | 6.88 kB gzip，只随阅读器 chunk 加载 |
| 依赖/schema/版本 | 无新增依赖、无数据库迁移、版本保持 0.1.0；未发布 |

## 最终门禁

| Gate | 结果 |
|------|------|
| `pnpm.cmd check` | passed；core 5、desktop 110 tests，lint/format/build 全部通过 |
| Rust fmt/test | passed；36 tests |
| Playwright | passed；12/12，含 Chromium、DPR2、TXT/EPUB/PDF、responsive、axe、reduced motion |
| Browser/IAB | passed；页面 identity、非空、无 overlay、console clean、1280/640/375 DOM 与截图复核 |
| `tauri:build` | passed；生成 NSIS 与 MSI |
| `git diff --check` | passed |

阶段 10 不发布，不改版本；验收分支只在上述门禁全部通过后合回 `codex/v0.2.0-integration`，再由集成分支合入 `main` 并快进同步。
