# 阶段 11 TXT 分页 fidelity ledger

验收日期：2026-07-13（含 11.8 收口）。阶段 11 延续已批准的阅读器 charcoal/teal/amber/paper 体系，不生成新概念图；TXT 控件、分页动画和 Single/Double 行为以已验收 EPUB 实现为一致性基准。

## 交付与对照

| 检查点 | 结果 | 证据 |
|--------|------|------|
| 五项并列阅读方式 | passed | Theme 面板显示 Continuous、None、Realistic、Cover、Smooth；radio/roving focus 和 v1 偏好往返通过 |
| charOffset 分页 | passed | UTF-16 `[start,end)`、字素安全二分、标题/空段/超长段、中英/emoji fixture 无丢字或重复 |
| 缓存与失效 | passed | `txt_pagination_v1` 只保存布局签名和连续边界；source hash、页槽、DPI、主题、spread 失配或损坏均重建 |
| 有限渲染 | passed | Single 最多前/当前/后 3 页；Double 最多 3 个 spread/6 页；邻接窗口不可交互 |
| 定位一致性 | passed | 目录、搜索、书签、批注、恢复与 0–1000 slider 均先解析 charOffset；页码输入只映射当前布局，数据库未保存临时页号 |
| 四种动画 | passed | None/Smooth/Cover/Realistic 复用 EPUB 事务控制器和隔离层；目标在状态更新前按精确 `data-spread-start` 捕获，按钮、键盘、边缘点击及单次 commit 通过 |
| 响应式 | passed | Double 用 `2 × 320px + 18px` 真实页槽阈值；桌面两页几何/相邻内容、375×760 Double→Single、44px 控件、无横向溢出和 axe serious/critical 0 |

## 视觉复核

- 桌面 Double 保留单一阅读侧栏、开放正文表面和两页等宽间距；底栏复用 EPUB 两层结构，包含 Previous/Next、章节、Page(s)、百分比、Single/Double、页码输入和完整进度轨。
- 375px 首轮截图暴露顶栏横向挤压及底栏文案竖排；验收分支改为两行顶栏、两行分页按钮与独立页码/滑杆，并以真实 frame 高度重新分页。
- 修复后 `view_image` 复核正文无裁切，Single/Double、Previous/Next 均为至少 44px，页码和进度不换成逐字竖排。
- 实际 TXT 截图保存在 Playwright test output：`txt-paginated-double.png` 与 `txt-paginated-mobile-cover.png`；Browser/IAB 另完成页面 identity、空白/overlay、console、桌面和 375px 书架截图。
- 允许文案仅新增阶段 11 规格中的 Reading mode、Continuous、None、Realistic、Cover、Smooth、Single、Double 和 Page/Pages；未引入额外 badge、说明或产品主张。

## 性能与门禁

| 观测 | 结果 |
|------|------|
| 连续滚动 | 仍使用 TanStack Virtual；长 TXT 可见段落少于 80，不加载整书 DOM |
| 分页 DOM | Single ≤3 页；Double ≤6 页；测量分批让出主线程且可取消；首个完整 spread 可渐进显示 |
| 缓存重建 | 页/块双游标 `O(pages + blocks)`；10,000 页合成重建测试要求 <1 秒，取代旧 `O(pages × blocks)` 扫描 |
| 冷分页 | 普通段落整段优先、溢出时才字素切分；测量 DOM 复用公共前缀/末尾文本；完整边界后才写磁盘 |
| 会话切换 | 最多两个布局的 LRU；Single/Double 往返优先内存命中，磁盘仍只保留最近布局 |
| 书架入口 | 67.10 kB gzip，低于 70 kB；未提前加载 EPUB/PDF runtime |
| ReaderShell | 46.67 kB gzip，继续由 `React.lazy` 异步加载 |
| `pnpm.cmd check` | passed；core 6、desktop 135、lint/format/build 全部通过 |
| Rust fmt/test | passed；36 tests |
| Playwright | passed；13/13，含 seeded TXT DPR1/DPR2、EPUB/PDF、30 次输入、640px/375px 响应式和 axe |
| Browser/IAB | passed；页面非空、无 framework overlay、console clean、桌面/375px 无横向溢出 |
| `tauri:build` | passed；生成 NSIS 与 MSI，版本仍为 0.1.0 |

阶段 11 无新增依赖、无 schema migration、无版本变更、无 Release 发布。
