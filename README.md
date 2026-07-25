# Ebook Reader

Ebook Reader 是一款本地优先的 Windows 电子书阅读器，支持 EPUB、TXT、PDF、MOBI 和 AZW3。书籍、阅读进度、书签、高亮、批注、搜索索引和设置均保存在本机。

## 下载与安装

v0.3.0 正式版仅发布 Windows x64，支持 Windows 10/11。请从 GitHub Releases 下载并按下方 SHA-256 方式核对产物。

- 推荐普通用户使用 `Ebook.Reader_0.3.0_x64-setup.exe`（NSIS，当前用户安装、支持应用内更新）。
- 需要 MSI 部署时使用 `Ebook.Reader_0.3.0_x64_en-US.msi`（仅手动覆盖升级）。
- 安装程序会在系统缺少 WebView2 时安静下载它，此情况需要网络连接。

本版尚未使用 Windows 代码签名，因此 Microsoft Defender SmartScreen 可能显示未知发布者警告。安装前请用发布页的 `SHA256SUMS.txt` 核对下载文件；确认来源后可在 SmartScreen 中选择“更多信息”→“仍要运行”。

```powershell
Get-FileHash '.\Ebook.Reader_0.3.0_x64-setup.exe' -Algorithm SHA256
Get-FileHash '.\Ebook.Reader_0.3.0_x64_en-US.msi' -Algorithm SHA256
```

## 升级

NSIS 用户可在 **Settings → Updates** 手动检查、下载并确认安装，也可仅开启每日检查；应用不会自动下载或安装。MSI 用户关闭应用后运行新版 MSI 覆盖升级。请始终沿用原安装包类型，避免 NSIS/MSI 混装产生重复卸载项。

升级前建议在 **Settings → Data & Backup** 导出 `.erbackup`；默认包含核心数据和封面，不包含原书。详细升级、回滚和数据兼容边界见 [升级与回滚](docs/upgrade-and-rollback.md)。

## 备份与恢复

`.erbackup` v2 可移植书籍元数据、派生阅读文件、自定义字体、阅读历史与偏好、进度、书签、批注和删除墓碑，可选封面与原书。备份不加密，可能包含私人批注或受版权保护的书籍，请安全保存。恢复会先做 checksum、大小、版本和 ZIP 安全预检，再由用户确认合并。详见 [备份与恢复](docs/backup-and-restore.md)。

v0.3.0 支持将静态 TTF/OTF 作为应用内字体用于 TXT/EPUB，不安装到 Windows，PDF 保持文档内嵌字体。格式、许可责任、回退与备份边界见 [应用内自定义字体](docs/custom-fonts.md)。

v0.3.0 也提供完全本地的全书库检索和阅读统计：`Ctrl+Shift+F` 搜索标题、作者和正文，`Ctrl+F` 继续搜索当前书籍；Insights 只统计前台、聚焦且近期有交互的有效阅读时间。索引可重建且不进入备份，多语言匹配与无文本 PDF 边界见 [本地搜索](docs/library-search.md)。

## 文件关联

安装后可用 Windows 直接打开 `.epub`、`.txt`、`.pdf`、`.mobi` 和 `.azw3` 文件。无 DRM 的 MOBI/AZW3 会在本机离线转换为内部 EPUB 后阅读；应用不会尝试移除 DRM。未导入的文件会被复制到应用书库并打开，已导入的文件会直接打开现有记录。

## 卸载与数据

在 Windows “设置→应用→已安装的应用”中卸载 `Ebook Reader`。卸载程序默认保留用户数据，以便重装或升级。需要完全重置时，先退出应用，再删除：

- `%APPDATA%\com.ebookreader.desktop`：SQLite 数据库、应用管理的书籍副本和封面。
- `%LOCALAPPDATA%\com.ebookreader.desktop`：Windows WebView 本地运行数据。

删除前请先备份需要保留的进度和批注。应用不会删除导入时选择的原始文件。详见 [隐私与本地数据](docs/privacy-and-data.md)。

## 开发

```powershell
pnpm.cmd install --frozen-lockfile
pnpm.cmd build
pnpm.cmd --filter @reader/desktop test
pnpm.cmd --filter @reader/desktop tauri:dev
cargo test --manifest-path apps\desktop\src-tauri\Cargo.toml
```

`tauri:dev` 使用独立的 `com.ebookreader.desktop.dev` 数据目录，不会读取或修改正式安装版的
`%APPDATA%\com.ebookreader.desktop`。不要绕过脚本直接运行裸 `tauri dev`。

发布流程见 [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md)，第三方许可声明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。本项目采用 [MIT License](LICENSE)。
