param(
  [string]$ScratchRoot = '',
  [int]$TimeoutSeconds = 120
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
if (-not $ScratchRoot) {
  $ScratchRoot = Join-Path $repoRoot '.tools\libmobi-spike-measurement'
}
$scratchFull = [IO.Path]::GetFullPath($ScratchRoot)
if (-not $scratchFull.StartsWith($repoRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'ScratchRoot must remain inside the repository workspace.'
}
if (Test-Path -LiteralPath $scratchFull) {
  Remove-Item -LiteralPath $scratchFull -Recurse -Force
}
New-Item -ItemType Directory -Path $scratchFull -Force | Out-Null

$converter = Join-Path $repoRoot 'apps\desktop\src-tauri\binaries\mobitool-x86_64-pc-windows-msvc.exe'
$fixtureRoot = Join-Path $repoRoot 'apps\desktop\src-tauri\tests\fixtures\libmobi'
$fixtures = @(
  'sample-ncx.mobi',
  'sample-multimedia.mobi',
  'sample-unicode-uncompressed.mobi'
)

$results = foreach ($fixtureName in $fixtures) {
  $source = Join-Path $fixtureRoot $fixtureName
  $output = Join-Path $scratchFull ([IO.Path]::GetFileNameWithoutExtension($fixtureName))
  New-Item -ItemType Directory -Path $output -Force | Out-Null
  $stdout = Join-Path $output 'stdout.log'
  $stderr = Join-Path $output 'stderr.log'
  $stopwatch = [Diagnostics.Stopwatch]::StartNew()
  $startInfo = [Diagnostics.ProcessStartInfo]::new()
  $startInfo.FileName = $converter
  $startInfo.Arguments = '-e -o "{0}" "{1}"' -f $output, $source
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  $process = [Diagnostics.Process]::new()
  $process.StartInfo = $startInfo
  if (-not $process.Start()) {
    throw "Could not start mobitool for $fixtureName"
  }
  $peakWorkingSet = 0L
  while (-not $process.HasExited) {
    if ($stopwatch.Elapsed.TotalSeconds -ge $TimeoutSeconds) {
      $process.Kill()
      $process.WaitForExit()
      throw "Conversion timed out for $fixtureName"
    }
    $process.Refresh()
    $peakWorkingSet = [Math]::Max($peakWorkingSet, $process.PeakWorkingSet64)
    Start-Sleep -Milliseconds 10
  }
  $process.WaitForExit()
  $process.Refresh()
  $stopwatch.Stop()
  [IO.File]::WriteAllText($stdout, $process.StandardOutput.ReadToEnd())
  [IO.File]::WriteAllText($stderr, $process.StandardError.ReadToEnd())
  $exitCode = $process.ExitCode
  if ($exitCode -ne 0) {
    throw "mobitool failed for $fixtureName with exit code ${exitCode}: $(Get-Content -LiteralPath $stderr -Raw)"
  }
  $epubs = @(Get-ChildItem -LiteralPath $output -Filter '*.epub' -File)
  if ($epubs.Count -ne 1) {
    throw "Expected exactly one EPUB for $fixtureName, found $($epubs.Count)."
  }
  [ordered]@{
    fixture = $fixtureName
    sourceBytes = (Get-Item -LiteralPath $source).Length
    elapsedMs = $stopwatch.ElapsedMilliseconds
    peakWorkingSetBytes = $peakWorkingSet
    epubBytes = $epubs[0].Length
    epubSha256 = (Get-FileHash -LiteralPath $epubs[0].FullName -Algorithm SHA256).Hash
  }
}

[ordered]@{
  converterSha256 = (Get-FileHash -LiteralPath $converter -Algorithm SHA256).Hash
  timeoutSeconds = $TimeoutSeconds
  results = @($results)
} | ConvertTo-Json -Depth 4

Remove-Item -LiteralPath $scratchFull -Recurse -Force
