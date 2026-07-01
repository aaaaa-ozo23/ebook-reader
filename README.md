# Ebook Reader

Ebook Reader 是一款本地优先的 Windows 电子书阅读器，支持 EPUB、TXT 和 PDF。书籍、阅读进度、书签、高亮、批注和设置均保存在本机。

## 下载与安装

v0.1.0 仅发布 Windows x64 版，支持 Windows 10/11。

- 推荐普通用户下载 `Ebook Reader_0.1.0_x64-setup.exe`（NSIS，当前用户安装）。
- 需要 MSI 部署时下载 `Ebook Reader_0.1.0_x64_en-US.msi`。
- 安装程序会在系统缺少 WebView2 时安静下载它，此情况需要网络连接。

本版尚未使用 Windows 代码签名，因此 Microsoft Defender SmartScreen 可能显示未知发布者警告。安装前请用发布页的 `SHA256SUMS.txt` 核对下载文件；确认来源后可在 SmartScreen 中选择“更多信息”→“仍要运行”。

```powershell
Get-FileHash '.\Ebook Reader_0.1.0_x64-setup.exe' -Algorithm SHA256
Get-FileHash '.\Ebook Reader_0.1.0_x64_en-US.msi' -Algorithm SHA256
```

## 升级

v0.1.0 使用手动覆盖安装，暂无应用内自动更新。关闭 Ebook Reader，下载新版安装包并直接运行；建议继续使用上一版相同的安装包类型。覆盖安装会保留书库、进度、书签、标注和设置，并拒绝降级安装。

升级前可备份整个 `%APPDATA%\com.ebookreader.desktop` 目录。

## 文件关联

安装后可用 Windows 直接打开 `.epub`、`.txt` 和 `.pdf` 文件。未导入的文件会被复制到应用书库并打开；已导入的文件会直接打开现有记录。

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
cargo test --manifest-path apps\desktop\src-tauri\Cargo.toml
```

发布流程见 [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md)，第三方许可声明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。本项目采用 [MIT License](LICENSE)。
