param(
  [string]$InstallRoot = (Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..\..')) '.tools\syft')
)

$ErrorActionPreference = 'Stop'
$env:SYFT_CHECK_FOR_APP_UPDATE = 'false'
$env:XDG_CACHE_HOME = Join-Path $InstallRoot 'cache'
$version = '1.44.0'
$checksumsSha256 = 'FA24CE6CAFE6EDBDBA166414CE79DE8142FBC217F8167E418DFB09E5AEDFBF4E'
$assetName = "syft_${version}_windows_amd64.zip"
$releaseBase = "https://github.com/anchore/syft/releases/download/v$version"
$versionRoot = Join-Path $InstallRoot $version
$syft = Join-Path $versionRoot 'syft.exe'

if (Test-Path -LiteralPath $syft) {
  $reported = (& $syft version -o json | ConvertFrom-Json).version
  if ($reported -eq $version) {
    Write-Output $syft
    exit 0
  }
}

New-Item -ItemType Directory -Force -Path $versionRoot | Out-Null
$checksums = Join-Path $versionRoot "syft_${version}_checksums.txt"
$archive = Join-Path $versionRoot $assetName

Invoke-WebRequest -UseBasicParsing "$releaseBase/syft_${version}_checksums.txt" -OutFile $checksums
$actualChecksumsHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $checksums).Hash
if ($actualChecksumsHash -ne $checksumsSha256) {
  throw "Syft checksum manifest verification failed: expected $checksumsSha256, got $actualChecksumsHash"
}

$checksumLine = Get-Content -LiteralPath $checksums | Where-Object { $_ -match [regex]::Escape($assetName) }
if ($checksumLine.Count -ne 1) {
  throw "Could not find one checksum for $assetName"
}
$expectedArchiveHash = ($checksumLine -split '\s+')[0].ToUpperInvariant()
Invoke-WebRequest -UseBasicParsing "$releaseBase/$assetName" -OutFile $archive
$actualArchiveHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $archive).Hash
if ($actualArchiveHash -ne $expectedArchiveHash) {
  throw "Syft archive verification failed: expected $expectedArchiveHash, got $actualArchiveHash"
}

Expand-Archive -LiteralPath $archive -DestinationPath $versionRoot -Force
$reported = (& $syft version -o json | ConvertFrom-Json).version
if ($reported -ne $version) {
  throw "Expected Syft $version, got $reported"
}
Write-Output $syft
