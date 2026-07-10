# 阶段 10 EPUB 增强 fidelity ledger

验收日期：2026-07-10。批准概念用于确定阅读器、设置面板与图片查看器的视觉方向；产品能力和文案继续以 `docs/design/v0.2/README.md` 的校正规则及阶段 10 实施计划为准。

## 交付范围

| 能力 | 结果 | 证据 |
|------|------|------|
| 出版物 page-list | passed | EPUB3 navigation、EPUB2 NCX、数字/罗马数字/原始非空标签、href/fragment/package CFI、spine + CFI 排序与 `epub_page_list_v1` 缓存 |
| Location 回退 | passed | 首个有效边界之前、无 page-list、完全损坏 page-list、缓存版本/结构损坏均只显示 `Location current / total`，不伪造 Page |
| 图片资源桥接 | passed | HTML `img`、SVG `image`、click/Enter/Space、装饰/隐藏/损坏过滤、listener 与运行时属性清理；无 fetch/createObjectURL |
| 图片查看器 | passed | Fit、100%、100%–500%、滚轮/pinch、拖动、Space+拖动、双击、Reset、Esc/Close、焦点恢复与 375×760 全屏布局 |
| 四种翻页模式 | passed | UI `None/Realistic/Cover/Smooth` 分别兼容 `none/page-curl/cover/slide`；新 EPUB 默认 None，旧偏好不覆盖 |
| Smooth / Cover | passed | 280ms 全宽双页同步位移与 320ms target 覆盖纸缝；single/double spread 作为一个事务；每次成功导航一次 progress commit |
| Realistic | passed | 650ms 斜向纸背、印刷线纹、二维压缩/斜切、动态阴影与 target reveal；快照/资源/WAAPI 失败无动画完成导航 |
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
- Chromium 对移动、裁切或 3D 变换中的 snapshot iframe 会在部分边缘角度产生越界黑色合成面。最终 current/target iframe 只使用布局宽度或已验证的 Smooth 位移；Realistic 的纸背仅由无内容 CSS sheet 以二维压缩/斜切、线纹和阴影表达。九张 25%/50%/75% 关键帧均无黑屏。
- `view_image` 已复核 `D:\tl-temp\ebook-reader-stage10x-{slide,cover,page-curl}-{25,50,75}.png` 与桌面/移动 transition settings 截图；四卡保持 charcoal/teal/amber/paper 体系。
- 快照分页定位修复保留 live rendition iframe 的舞台相对矩形，并在固定 viewport snapshot 内偏移净化文档正文：Smooth/Cover/Realistic 的内容由实际 current/target 分页决定，不再从章节首列重新排版。九张新关键帧均显示 Location 2 段落页；正常播放与应用内浏览器无黑面，CDP 强制暂停 full-page capture 偶发的舞台外黑色已作为截图合成限制记录；只读净化和交互隔离不变。
- Browser/IAB 在 1280×800 与 375×760 完成截图，640×640 完成 DOM/宽度/console；三档均 `scrollWidth <= clientWidth`、无 framework overlay、console warning/error 为空。640 截图的 CDP 捕获超时，由项目 Playwright 视觉证据补充。

## 无障碍与降级

- axe 4.12 legacy frame mode检查主文档与同源 EPUB iframe，serious/critical 为 0；验收期间发现并修复 rendition iframe 缺少 accessible name，现使用章节 title 或 `EPUB publication content` 回退。
- 动画层 `aria-hidden=true`、`pointer-events:none`，结束、取消、捕获失败和 WAAPI 不可用时都会销毁。
- reduced motion 下 None/Smooth/Cover/Realistic 均直接执行真实导航，不捕获快照，不覆盖保存偏好；图片缩放/平移功能保持可用。
- 图片查看器使用 focus trap；关闭后优先恢复 iframe 图片焦点，触发元素失效时回退 EPUB host。

## 性能、包体与边界

| 观测 | 结果 |
|------|------|
| 30 次快速输入 | 两档 viewport 都只 commit 2 次，无 >50ms long task |
| 书架入口 JS | 67.09 kB gzip；未加载 ReaderShell、epub.js 或 pdf.js runtime |
| ReaderShell JS | 40.03 kB gzip，继续由 `React.lazy` 异步加载 |
| ReaderShell CSS | 7.76 kB gzip，只随阅读器 chunk 加载 |
| 依赖/schema/版本 | 无新增依赖、无数据库迁移、版本保持 0.1.0；未发布 |

## 最终门禁

| Gate | 结果 |
|------|------|
| `pnpm.cmd check` | passed；core 6、desktop 113 tests，lint/format/build 全部通过 |
| Rust fmt/test | passed；36 tests |
| Playwright | passed；12/12，含 Chromium、DPR2、TXT/EPUB/PDF、responsive、axe、reduced motion |
| Browser/IAB | passed；页面 identity、非空、无 overlay、console clean、1280/375 截图与 1280/640/375 DOM 复核 |
| `tauri:build` | passed；生成 NSIS 与 MSI |
| `git diff --check` | passed |

阶段 10 不发布，不改版本；验收分支只在上述门禁全部通过后合回 `codex/v0.2.0-integration`，再由集成分支合入 `main` 并快进同步。
