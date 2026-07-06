# 阶段 9.5 翻页控制器与 page-curl 决策

## 结论

v0.2 不引入 `page-flip`。保留 `page-curl` 公共偏好值，但展示层采用项目内 CSS 3D/WAAPI 实现；阶段 10–12 只把已渲染快照交给展示层，实时文本、epub.js iframe、PDF Canvas/文本/标注层不进入动画 DOM。

## 统一控制器

- 状态为 `idle` / `running`，一次只执行一个真实导航事务。
- 运行中只保留一个待处理方向，后输入覆盖前输入；30 次同步输入会执行首个方向和最终方向。
- 每次成功真实导航只提交一次进度；真实导航失败不提交。
- `none`、reduced motion、快照捕获失败、Web Animations 不可用或动画失败时直接显示真实目标页并提交。
- 动画层 `pointer-events: none`、`aria-hidden=true`，完成后立即移除，不接管选择、焦点和批注。

## 候选比较

本地从 npm registry 解包 `page-flip@2.0.7` 进行检查；没有把依赖写入 workspace。

| Gate | page-flip 2.0.7 | 项目内 CSS 3D/WAAPI |
|------|-----------------|----------------------|
| 许可/依赖 | MIT，零运行时依赖，pass | 项目代码，pass |
| 分发体积 | ESM 43.8 kB；9.2 MB tarball 主要来自演示 GIF | 当前实现进入开发 fixture chunk，实际格式接入时随 ReaderShell |
| HTML/Canvas | 支持 HTML 和 image URL；portrait 明确克隆 HTML 页面 | 仅克隆/捕获隔离快照，支持任意已渲染结果 |
| 实时 DOM 隔离 | HTML 模式会接管/克隆页面；不满足 iframe/可选择 DOM 硬约束 | 不移动实时 DOM，pass |
| Canvas 输入 | Canvas renderer 接受 image URL，需要额外序列化和生命周期 | 调用方可传克隆节点或未来 Canvas 快照，pass |
| 事务完成 | imperative `flipNext/flipPrev` + 事件，没有 Promise/取消协议 | Promise 完成，单槽输入和单次提交由控制器统一管理 |
| reduced motion | `flippingTime` 必须大于 0，只能在外部绕过 | 控制器直接跳过展示层，pass |
| 自动化稳定性 | 需要适配内部 orientation/state 事件，不能直接证明 | 纯控制器和展示层可独立测试，pass |

`page-flip` 未通过“不得接管或克隆实时 iframe/标注 DOM”和“事务完成可稳定自动化控制”两项硬 gate，因此不保留依赖。该结论不阻止后续重新评估新版本，但 v0.2 以项目内展示层为唯一实现路径。

## 时长和降级

- `slide`：220ms，允许范围 180–240ms。
- `page-curl`：500ms，允许范围 420–560ms。
- reduced motion：0ms 运行时效果，保存偏好不变。
- 捕获/动画失败：记录可恢复错误；真实导航继续，进度只提交一次。
- 真实导航失败：Promise 拒绝，状态恢复 `idle`，不提交进度。

## 验收证据

- Vitest：30 次快速输入、首/末待处理方向、捕获/动画失败、none/reduced-motion、真实导航失败、隔离层清理。
- Playwright：1280×800 和 640×640 各执行 30 次同步 Next；期望 2 次事务提交且没有可归因的 `>50ms` long task。
- Browser：开发 fixture 显示真实页面保持交互、动画层只在事务期间存在；375px 无横向溢出。
