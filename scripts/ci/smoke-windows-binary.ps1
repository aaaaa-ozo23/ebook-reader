param(
  [string]$Executable = 'apps\desktop\src-tauri\target\release\ebook-reader-desktop.exe'
)

$ErrorActionPreference = 'Stop'
$resolved = (Resolve-Path -LiteralPath $Executable).Path
$process = Start-Process -FilePath $resolved -PassThru -WindowStyle Hidden
try {
  Start-Sleep -Seconds 12
  $process.Refresh()
  if ($process.HasExited) {
    throw "Windows native startup smoke exited early with code $($process.ExitCode)."
  }
} finally {
  if (-not $process.HasExited) {
    Stop-Process -Id $process.Id -Force
    $process.WaitForExit()
  }
}

Write-Output 'Windows native startup smoke passed.'
