param(
  [string]$OutputPath,
  [switch]$Offline
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$workspace = Join-Path $repoRoot '.tools\libmobi-v0.12'
$archive = Join-Path $workspace 'libmobi-0.12.tar.gz'
$signature = Join-Path $workspace 'libmobi-0.12.tar.gz.asc'
$publicKey = Join-Path $workspace 'bfabiszewski.github.gpg'
$sourceUrl = 'https://github.com/bfabiszewski/libmobi/releases/download/v0.12/libmobi-0.12.tar.gz'
$signatureUrl = "$sourceUrl.asc"
$publicKeyUrl = 'https://github.com/bfabiszewski.gpg'
$sourceSha256 = '9A6FB2C56B916F8FA8B15E0C71008D908109508C944EA1D297881D4E277BF7E7'
$primaryFingerprint = 'B1ED40082AF2D620370827C6734EF933CD41675C'
$signingFingerprint = 'DCBC81C5A4AC9C873F6FEA7F5C7E8917C4315322'
$sourceDateEpoch = '1718607591'
$binarySha256 = '438576B701C7BD706213D1FD9E717D671403D02FB90AB1D1655342838DB47CF1'

if (-not $OutputPath) {
  $OutputPath = Join-Path $repoRoot 'apps\desktop\src-tauri\binaries\mobitool-x86_64-pc-windows-msvc.exe'
}

function Require-Command([string]$Name) {
  $command = Get-Command $Name -ErrorAction SilentlyContinue
  if (-not $command) {
    throw "Required build tool is missing: $Name"
  }
  return $command.Source
}

function Get-GitTool([string]$RelativePath) {
  $candidates = @(
    @(
      (Join-Path ${env:ProgramFiles} "Git\$RelativePath"),
      (Join-Path ${env:ProgramFiles(x86)} "Git\$RelativePath")
    ) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }
  )
  if ($candidates.Count -eq 0) {
    throw "Git for Windows tool is missing: $RelativePath"
  }
  return $candidates[0]
}

function Get-VerifiedDownload([string]$Uri, [string]$Destination) {
  if (Test-Path -LiteralPath $Destination) {
    return
  }
  if ($Offline) {
    throw "Offline build cache is missing: $Destination"
  }
  Invoke-WebRequest -UseBasicParsing -Headers @{ 'User-Agent' = 'ebook-reader-libmobi-build' } -Uri $Uri -OutFile $Destination
}

function Convert-ToMsysPath([string]$Path) {
  $full = [System.IO.Path]::GetFullPath($Path).Replace('\', '/')
  if ($full -notmatch '^([A-Za-z]):/(.*)$') {
    throw "Cannot convert path to MSYS form: $Path"
  }
  return "/$($Matches[1].ToLowerInvariant())/$($Matches[2])"
}

New-Item -ItemType Directory -Force -Path $workspace | Out-Null
Get-VerifiedDownload $sourceUrl $archive
Get-VerifiedDownload $signatureUrl $signature
Get-VerifiedDownload $publicKeyUrl $publicKey

$actualSourceHash = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToUpperInvariant()
if ($actualSourceHash -ne $sourceSha256) {
  throw "libmobi source hash mismatch: expected $sourceSha256, got $actualSourceHash"
}

$gpg = Get-GitTool 'usr\bin\gpg.exe'
$bash = Get-GitTool 'bin\bash.exe'
$gcc = Require-Command 'gcc'
$make = Require-Command 'mingw32-make'
$tar = Require-Command 'tar'
$strip = Require-Command 'strip'

$gnupgHome = Join-Path $workspace "gnupg-$PID"
New-Item -ItemType Directory -Force -Path $gnupgHome | Out-Null
$oldGnupgHome = $env:GNUPGHOME
try {
  $env:GNUPGHOME = Convert-ToMsysPath $gnupgHome
  & $gpg --batch --import (Convert-ToMsysPath $publicKey) | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Could not import the pinned libmobi maintainer key.' }
  $fingerprints = (& $gpg --batch --with-colons --fingerprint | Select-String '^fpr:' | ForEach-Object { $_.Line.Split(':')[9] })
  if ($primaryFingerprint -notin $fingerprints -or $signingFingerprint -notin $fingerprints) {
    throw 'The downloaded libmobi maintainer key does not match the pinned fingerprints.'
  }
  & $gpg --batch --verify (Convert-ToMsysPath $signature) (Convert-ToMsysPath $archive)
  if ($LASTEXITCODE -ne 0) { throw 'libmobi detached signature verification failed.' }
} finally {
  $env:GNUPGHOME = $oldGnupgHome
}

$buildRoot = Join-Path $workspace "build-$PID"
New-Item -ItemType Directory -Force -Path $buildRoot | Out-Null
& $tar -xzf $archive -C $buildRoot
if ($LASTEXITCODE -ne 0) { throw 'Could not extract the verified libmobi source archive.' }

$sourceRoot = Join-Path $buildRoot 'libmobi-0.12'
$sourceMsys = Convert-ToMsysPath $sourceRoot
$compilerMsys = Convert-ToMsysPath (Split-Path $gcc)
$configureScript = @"
set -e
cd '$sourceMsys'
export PATH='$compilerMsys':`$PATH
export SOURCE_DATE_EPOCH='$sourceDateEpoch'
export CFLAGS='-O2 -DNDEBUG -ffile-prefix-map=$sourceMsys=/usr/src/libmobi-0.12'
export LDFLAGS='-static -static-libgcc -Wl,--no-insert-timestamp'
export ARFLAGS='crD'
short_shell=`$(cygpath -m -s /usr/bin/sh)
export SHELL="`$short_shell"
export CONFIG_SHELL="`$short_shell"
MAKE=mingw32-make CC=gcc AR=ar RANLIB=ranlib STRIP=strip ./configure \
  --host=x86_64-w64-mingw32 \
  --disable-dependency-tracking \
  --disable-shared \
  --enable-static \
  --enable-tools-static \
  --disable-encryption \
  --without-libxml2 \
  --without-zlib
"@
& $bash -lc $configureScript
if ($LASTEXITCODE -ne 0) { throw 'libmobi configure failed.' }

$buildScript = @"
set -e
cd '$sourceMsys'
export PATH='$compilerMsys':`$PATH
export SOURCE_DATE_EPOCH='$sourceDateEpoch'
export ARFLAGS='crD'
mingw32-make -j2
strip --strip-unneeded tools/mobitool.exe
"@
& $bash -lc $buildScript
if ($LASTEXITCODE -ne 0) { throw 'libmobi build failed.' }

$builtBinary = Join-Path $sourceRoot 'tools\mobitool.exe'
if (-not (Test-Path -LiteralPath $builtBinary)) {
  throw 'libmobi build completed without producing mobitool.exe.'
}
$builtHash = (Get-FileHash -LiteralPath $builtBinary -Algorithm SHA256).Hash.ToUpperInvariant()
if ($builtHash -ne $binarySha256) {
  throw "libmobi sidecar is not reproducible with the pinned toolchain: expected $binarySha256, got $builtHash"
}
New-Item -ItemType Directory -Force -Path (Split-Path $OutputPath) | Out-Null
Copy-Item -LiteralPath $builtBinary -Destination $OutputPath -Force

$output = Get-Item -LiteralPath $OutputPath
$outputHash = (Get-FileHash -LiteralPath $OutputPath -Algorithm SHA256).Hash.ToUpperInvariant()
[ordered]@{
  version = '0.12'
  sourceSha256 = $actualSourceHash
  binarySha256 = $binarySha256
  primaryFingerprint = $primaryFingerprint
  signingFingerprint = $signingFingerprint
  compiler = (& $gcc --version | Select-Object -First 1)
  make = $make
  output = $output.FullName
  outputBytes = $output.Length
  outputSha256 = $outputHash
} | ConvertTo-Json
