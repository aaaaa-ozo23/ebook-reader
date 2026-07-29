# Ebook Reader

Ebook Reader 是一款本地优先的跨平台电子书阅读器，支持 EPUB、TXT、PDF、MOBI 和 AZW3。书籍、阅读进度、书签、高亮、批注、搜索索引和设置均保存在本机。

## 下载与安装

v0.4.0 当前是跨平台 RC，不是公开 GitHub Release。签名凭据和原生安装验收全部通过后，短期 Actions artifact 将包含下列资产：

| 平台 | 包 | 更新方式 |
|------|----|----------|
| Windows 10/11 x64 | `Ebook.Reader_0.4.0_x64-setup.exe`、`Ebook.Reader_0.4.0_x64_en-US.msi` | NSIS 应用内更新；MSI 手动 |
| macOS 12+ Intel/Apple Silicon | `Ebook.Reader_0.4.0_universal.dmg` | 应用内更新 |
| Ubuntu 22.04/24.04、Debian 12 x64 | `Ebook.Reader_0.4.0_amd64.AppImage`、`Ebook.Reader_0.4.0_amd64.deb` | AppImage 应用内更新；deb 手动 |

Windows 安装程序会在系统缺少 WebView2 时下载它。macOS DMG 必须通过 Developer ID 签名、公证和 stapling；缺少任一证明的构建不会成为 RC。所有平台都应先用同一 artifact 集中的 `SHA256SUMS.txt` 核对下载文件。

```powershell
Get-FileHash '.\Ebook.Reader_0.4.0_x64-setup.exe' -Algorithm SHA256
Get-FileHash '.\Ebook.Reader_0.4.0_x64_en-US.msi' -Algorithm SHA256
```

## 升级

NSIS、macOS 和 AppImage 用户可在 **Settings → Updates** 检查、下载、验签并确认安装；MSI 和 deb 用户关闭应用后手动安装新版。请始终沿用原分发轨道，避免 NSIS/MSI 或 AppImage/deb 混装。

升级前建议在 **Settings → Data & Backup** 导出 `.erbackup`；默认包含核心数据和封面，不包含原书。详细升级、回滚和数据兼容边界见 [升级与回滚](docs/upgrade-and-rollback.md)。

## 备份与恢复

`.erbackup` v2 可移植书籍元数据、派生阅读文件、自定义字体、阅读历史与偏好、进度、书签、批注和删除墓碑，可选封面与原书。备份不加密，可能包含私人批注或受版权保护的书籍，请安全保存。恢复会先做 checksum、大小、版本和 ZIP 安全预检，再由用户确认合并。详见 [备份与恢复](docs/backup-and-restore.md)。

v0.4.0 支持将静态 TTF/OTF 作为应用内字体用于 TXT/EPUB，不安装到操作系统，PDF 保持文档内嵌字体。格式、许可责任、回退与备份边界见 [应用内自定义字体](docs/custom-fonts.md)。

v0.4.0 也提供完全本地的全书库检索和阅读统计：Windows/Linux 使用 `Ctrl+Shift+F` 与 `Ctrl+F`，macOS 使用 `Command+Shift+F` 与 `Command+F`。Insights 只统计前台、聚焦且近期有交互的有效阅读时间。索引可重建且不进入备份，多语言匹配与无文本 PDF 边界见 [本地搜索](docs/library-search.md)。

## 文件关联

安装后可从 Explorer、Finder 或 Linux 桌面直接打开 `.epub`、`.txt`、`.pdf`、`.mobi` 和 `.azw3`。无 DRM 的 MOBI/AZW3 会在本机离线转换为内部 EPUB 后阅读；应用不会尝试移除 DRM。未导入的文件会被复制到应用书库并打开，已导入的文件会直接打开现有记录。

## 卸载与数据

卸载 NSIS/MSI、移除 macOS app 或卸载 deb 都默认保留用户数据，以便重装或升级。需要完全重置时，先退出应用，再定位 Tauri 为 `com.ebookreader.desktop` 解析的平台应用数据目录；不要把生产数据目录用于开发或验收。

删除前请先备份需要保留的进度和批注。应用不会删除导入时选择的原始文件。详见 [隐私与本地数据](docs/privacy-and-data.md)。

## 开发

```powershell
pnpm.cmd install --frozen-lockfile
pnpm.cmd build
pnpm.cmd --filter @reader/desktop test
pnpm.cmd --filter @reader/desktop tauri:dev
cargo test --manifest-path apps\desktop\src-tauri\Cargo.toml
```

`tauri:dev` 使用独立的 `com.ebookreader.desktop.dev` 标识和数据目录，不会读取或修改正式安装版 profile。不要绕过脚本直接运行裸 `tauri dev`。

v0.4 RC 门禁见 [RELEASE_CHECKLIST_V0.4.md](RELEASE_CHECKLIST_V0.4.md)，平台支持见 [桌面平台支持](docs/platform-support.md)，第三方许可声明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。本项目采用 [MIT License](LICENSE)。
