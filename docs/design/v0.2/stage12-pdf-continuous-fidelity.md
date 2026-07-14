# 阶段 12 PDF 连续模式 fidelity ledger

验收日期：2026-07-14。阶段 12 延续已批准的阅读器布局、四主题和 EPUB/TXT 控件体系，不生成新概念图；PDF 的 Continuous、Single/Double 与四种分页效果使用同一设置语义和底栏结构。

## 交付与一致性

| 检查点 | 结果 | 证据 |
|--------|------|------|
| 五项阅读方式 | passed | Theme 面板为 Continuous、None、Realistic、Cover、Smooth；Continuous 只在运行时禁用动画，保存的分页动画偏好不被覆盖 |
| Single/Double 持久化 | passed | v1 envelope 新增向后兼容 `paginatedViewMode`；默认 Single，旧 Double 可推导；离开阅读器再进入仍保留 requested Double |
| 连续 locator | passed | 视口中心线保存 `page + pageOffsetRatio + scale + zoomMode`；比例钳制，旧 locator 回退页首，最后一页底部精确为 100% |
| 虚拟化与尺寸 | passed | TanStack Virtual 单列、overscan 1；500 页只按需取得 metrics，远跳 250 页不预取整书 page proxy/Canvas |
| 统一跳转 | passed | 目录、搜索、页码、slider、书签、批注统一进入 locator 管线；rect > ratio > 页首，直接跳转不播放跨页动画 |
| 分页动画 | passed | None/Smooth 280ms/Cover 320ms/Realistic 650ms 与 EPUB/TXT 共用控制器；快照按 spread/page identity 逐 Canvas 复制像素，失败或 reduced motion 立即无动画导航 |
| UI 与无障碍 | passed | Page/Pages、百分比、0–1000 slider、页码输入、缩放/Fit width、Previous/Next 和 44px 移动控件一致；axe serious/critical 0 |

## 性能与生命周期

| 观测 | 结果 |
|------|------|
| 500 页 Continuous | 高成本 surface ≤6；Canvas backing pixels ≤12,000,000；第 250 页远跳和 100% 末页恢复通过 |
| 分页窗口 | Single ≤3 Canvas；Double ≤6 Canvas；邻接 spread 仅 Canvas，文本/标注只绑定 current spread |
| 释放 | 卸载页取消独立 RenderTask/TextLayer，清空文本和批注层，Canvas backing size 归零并拒绝旧 sequence 覆盖 |
| 压力 | 500 页 DPR1/DPR2 与 30 次快速输入通过；PerformanceObserver 未记录可归因的 >50ms long task |
| 错误隔离 | 单页错误局部 Retry；RenderingCancelledException 静默；文档关闭统一释放活动页面 |

## 视觉复核

- `D:\tl-temp\ebook-reader-stage12-pdf-continuous-desktop.png`：1280×800、DPR2，Continuous 第 250 页、展开目录、页码/百分比/缩放/slider 完整。
- `D:\tl-temp\ebook-reader-stage12-pdf-double-desktop.png`：1280×800、DPR2，收起目录后的 Double 正确显示第 10/11 页，未出现旧页、空白页或错误目标帧。
- `D:\tl-temp\ebook-reader-stage12-pdf-compact.png` 与 `D:\tl-temp\ebook-reader-stage12-pdf-500-mobile.png`：640×640、375×760，requested Double 保持、rendered Single 自动降级，无 body 横向溢出。
- light/green/dark/sepia 均在 500 页真实 PDF 的 Continuous 第 250 页重新渲染并通过 Canvas 非空像素检查；最终概念对照保持既有 charcoal/teal/amber/paper 体系。
- 首轮截图发现 Continuous 末页的 `scrollTop` 被分页 frame 继承，Canvas 虽正确却把页首裁出视口；分页 page/rendered mode 变化现于 layout 阶段归零页内滚动，复拍确认第 10/11 页准确可见。

## 最终门禁

| 门禁 | 结果 |
|------|------|
| `pnpm.cmd check` | passed；core 7、desktop 151，lint/format/build 全通过 |
| Rust | passed；fmt check、36 tests |
| Playwright | passed；15/15，含 500 页 DPR1/DPR2、TXT/EPUB/PDF 回归、responsive、reduced motion 与 axe |
| Browser/IAB | runtime bootstrap 返回 `Cannot redefine property: process`，未建立 browser binding；按技能故障流程记录，真实 PDF 交互与四档截图由项目 Playwright 完成 |
| `tauri:build` | passed；生成 0.1.0 NSIS 与 MSI，未改版本 |
| 包体 | 书架入口 67.20 kB gzip（≤70 kB）；ReaderShell 51.35 kB gzip；PDF runtime 127.30 kB gzip，继续异步加载 |

阶段 12 无新增依赖、无数据库 migration、无格式或版本变更、无 Release 发布。
