# 阶段 10 EPUB 图片查看器 fidelity ledger

## 范围

- 源概念：`docs/design/v0.2/epub-image-viewer-desktop.png`。
- 实现范围：真实 EPUB 阅读器内的图片查看器，不包含下载、分享、编辑、OCR 或图库。
- 验证视口：桌面 Chromium、375×760 Chromium、四主题与 reduced motion。

## 对齐点

| 维度 | 实现结果 |
|------|----------|
| 覆盖模型 | 查看器打开后使用暗色 backdrop 覆盖真实 EPUB 阅读器，背景不可交互 |
| 容器 | 单一深色 modal 容器包含标题、工具栏、图片舞台、缩放滑杆和帮助文字 |
| 工具栏 | 提供 Fit、100%、Zoom out、百分比、Zoom in、Reset、Close；Close 为独立按钮 |
| 缩放 | Fit 可低于 100%；手动缩放范围 100%–500%，25% 步进；Reset 回 Fit |
| 平移 | 缩放后支持拖动/Space+拖动，pan hint 仅作操作提示，不接管内容 |
| 焦点 | 打开后 focus trap，Esc/Close 后恢复 iframe 图片焦点，失效时回退 EPUB host |
| 响应式 | 375×760 下全屏紧凑布局，触控目标至少 44px，无横向溢出 |
| 动效 | reduced motion 下关闭视觉过渡，缩放和平移功能保持可用 |

## 有意偏差

- 概念图背景误用书架；实现按路线图要求覆盖真实 EPUB 阅读器。
- 测试 EPUB 使用生成的 SVG botanical fixture，不引入概念图中的版权不明植物插画。
- 375×760 下工具栏改为横向紧凑滚动/换行布局，以保证 Close、Reset 和滑杆都在 viewport 内。
- 100% 是原始像素比例，不等同于概念图中示例的 180% 当前缩放值。

## 本地视觉证据

- 桌面截图：`D:\tl-temp\ebook-reader-stage10-image-viewer-desktop.png`
- 375×760 截图：`D:\tl-temp\ebook-reader-stage10-image-viewer-mobile.png`

两张截图已在 Codex 中人工查看：桌面工具栏与底部滑杆完整，移动端 Close、Reset、500% 标记和 pan hint 均未越界。
