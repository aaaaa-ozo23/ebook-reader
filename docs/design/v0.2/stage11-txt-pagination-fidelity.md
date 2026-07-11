# 阶段 11 TXT 分页 fidelity ledger

验收日期：2026-07-11。阶段 11 延续已批准的阅读器 charcoal/teal/amber/paper 体系，不生成新概念图；TXT 控件、分页动画和 Single/Double 行为以已验收 EPUB 实现为一致性基准。

## 交付与对照

| 检查点 | 结果 | 证据 |
|--------|------|------|
| 五项并列阅读方式 | passed | Theme 面板显示 Continuous、None、Realistic、Cover、Smooth；radio/roving focus 和 v1 偏好往返通过 |
| charOffset 分页 | passed | UTF-16 `[start,end)`、字素安全二分、标题/空段/超长段、中英/emoji fixture 无丢字或重复 |
| 缓存与失效 | passed | `txt_pagination_v1` 只保存布局签名和连续边界；source hash、页槽、DPI、主题、spread 失配或损坏均重建 |
| 有限渲染 | passed | Single 最多前/当前/后 3 页；Double 最多 3 个 spread/6 页；邻接窗口不可交互 |
| 定位一致性 | passed | 目录、搜索、书签、批注、恢复与 slider 均先解析 charOffset；数据库未保存临时页号 |
| 四种动画 | passed | None/Smooth/Cover/Realistic 复用 EPUB 事务控制器和隔离层；按钮、键盘、边缘点击及单次 commit 通过 |
| 响应式 | passed | 桌面 Double、375×760 Double→Single、44px 控件、无横向溢出和 axe serious/critical 0 |

## 视觉复核

- 桌面 Double 保留单一阅读侧栏、开放正文表面、两页等宽间距和底部紧凑导航；没有增加卡片容器或新导航。
- 375px 首轮截图暴露顶栏横向挤压及底栏文案竖排；验收分支改为两行顶栏、两行分页按钮与独立页码/滑杆，并以真实 frame 高度重新分页。
- 修复后 `view_image` 复核正文无裁切，Single/Double、Previous/Next 均为至少 44px，页码和进度不换成逐字竖排。
- 实际 TXT 截图保存在 Playwright test output：`txt-paginated-double.png` 与 `txt-paginated-mobile-cover.png`；Browser/IAB 另完成页面 identity、空白/overlay、console、桌面和 375px 书架截图。
- 允许文案仅新增阶段 11 规格中的 Reading mode、Continuous、None、Realistic、Cover、Smooth、Single、Double 和 Page/Pages；未引入额外 badge、说明或产品主张。

## 性能与门禁

| 观测 | 结果 |
|------|------|
| 连续滚动 | 仍使用 TanStack Virtual；长 TXT 可见段落少于 80，不加载整书 DOM |
| 分页 DOM | Single ≤3 页；Double ≤6 页；测量分批让出主线程且可取消 |
| 书架入口 | 67.10 kB gzip，低于 70 kB；未提前加载 EPUB/PDF runtime |
| ReaderShell | 44.92 kB gzip，继续由 `React.lazy` 异步加载 |
| `pnpm.cmd check` | passed；core 6、desktop 129、lint/format/build 全部通过 |
| Rust fmt/test | passed；36 tests |
| Playwright | passed；12/12，含 TXT/EPUB/PDF、DPR2、30 次输入、响应式和 axe |
| Browser/IAB | passed；页面非空、无 framework overlay、console clean、桌面/375px 无横向溢出 |
| `tauri:build` | passed；生成 NSIS 与 MSI，版本仍为 0.1.0 |

阶段 11 无新增依赖、无 schema migration、无版本变更、无 Release 发布。
