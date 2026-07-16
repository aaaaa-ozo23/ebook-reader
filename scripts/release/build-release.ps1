param(
  [string]$Version = '0.2.0',
  [string]$OutputDirectory = "release-artifacts/v$Version-rc",
  [switch]$SkipQualityGates,
  [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'
function Write-Utf8NoBom([string]$Path, [string]$Content) {
  $encoding = New-Object System.Text.UTF8Encoding($false)
  [IO.File]::WriteAllText($Path, $Content, $encoding)
}
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$output = [IO.Path]::GetFullPath((Join-Path $root $OutputDirectory))
$allowedRoot = [IO.Path]::GetFullPath((Join-Path $root 'release-artifacts'))
if (-not $output.StartsWith($allowedRoot, [StringComparison]::OrdinalIgnoreCase)) {
  throw "Output must stay under $allowedRoot"
}

if (Test-Path -LiteralPath $output) {
  Remove-Item -LiteralPath $output -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $output | Out-Null

Push-Location $root
try {
  if (-not $SkipQualityGates) {
    & pnpm.cmd check
    if ($LASTEXITCODE -ne 0) { throw 'pnpm check failed' }
    & cargo fmt --manifest-path apps\desktop\src-tauri\Cargo.toml --check
    if ($LASTEXITCODE -ne 0) { throw 'cargo fmt failed' }
    & cargo test --locked --manifest-path apps\desktop\src-tauri\Cargo.toml
    if ($LASTEXITCODE -ne 0) { throw 'cargo test failed' }
  }

  & node scripts\release\audit-licenses.mjs (Join-Path $OutputDirectory 'license-audit.json')
  if ($LASTEXITCODE -ne 0) { throw 'license audit failed' }
  & node scripts\release\verify-release-security.mjs
  if ($LASTEXITCODE -ne 0) { throw 'pre-build security verification failed' }

  $syftOutput = & powershell -ExecutionPolicy Bypass -File scripts\release\install-syft.ps1
  if ($LASTEXITCODE -ne 0) { throw 'Syft installation failed' }
  $syft = $syftOutput | Select-Object -Last 1
  $env:SYFT_CHECK_FOR_APP_UPDATE = 'false'
  $env:XDG_CACHE_HOME = Join-Path $root '.tools\syft-cache'
  $syftVersion = (& $syft version -o json | ConvertFrom-Json).version
  if ($syftVersion -ne '1.44.0') { throw "Expected Syft 1.44.0, got $syftVersion" }

  if (-not $SkipBuild) {
    & pnpm.cmd tauri:build:nsis
    if ($LASTEXITCODE -ne 0) { throw 'NSIS updater build failed' }
    & pnpm.cmd tauri:build:msi
    if ($LASTEXITCODE -ne 0) { throw 'MSI manual-track build failed' }
  }

  $bundleRoot = Join-Path $root 'apps\desktop\src-tauri\target\release\bundle'
  $sourceNsis = Get-ChildItem (Join-Path $bundleRoot 'nsis') -Filter '*-setup.exe' |
    Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
  $sourceMsi = Get-ChildItem (Join-Path $bundleRoot 'msi') -Filter '*.msi' |
    Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
  if ($null -eq $sourceNsis -or $null -eq $sourceMsi) { throw 'Expected NSIS and MSI artifacts' }
  $sourceSignature = Get-Item -LiteralPath ($sourceNsis.FullName + '.sig')

  $nsisName = "Ebook.Reader_${Version}_x64-setup.exe"
  $msiName = "Ebook.Reader_${Version}_x64_en-US.msi"
  $signatureName = "$nsisName.sig"
  Copy-Item -LiteralPath $sourceNsis.FullName -Destination (Join-Path $output $nsisName)
  Copy-Item -LiteralPath $sourceMsi.FullName -Destination (Join-Path $output $msiName)
  Copy-Item -LiteralPath $sourceSignature.FullName -Destination (Join-Path $output $signatureName)

  $latest = [ordered]@{
    version = $Version
    notes = 'Ebook Reader v0.2 release candidate'
    pub_date = (Get-Date).ToUniversalTime().ToString('o')
    platforms = [ordered]@{
      'windows-x86_64' = [ordered]@{
        signature = (Get-Content -Raw (Join-Path $output $signatureName)).Trim()
        url = "https://github.com/aaaaa-ozo23/ebook-reader/releases/download/v$Version/$nsisName"
      }
    }
  }
  Write-Utf8NoBom (Join-Path $output 'latest.json') ($latest | ConvertTo-Json -Depth 6)

  $sourceSbom = Join-Path $output 'sbom-source.cdx.json'
  & $syft "dir:$root" --exclude './.git' --exclude './node_modules' --exclude './.tools' --exclude './release-artifacts' -o "cyclonedx-json=$sourceSbom"
  if ($LASTEXITCODE -ne 0) { throw 'source SBOM generation failed' }

  $artifactStaging = Join-Path $output '.artifact-sbom-input'
  New-Item -ItemType Directory -Force -Path $artifactStaging | Out-Null
  Copy-Item (Join-Path $output $nsisName) $artifactStaging
  Copy-Item (Join-Path $output $msiName) $artifactStaging
  $artifactSbom = Join-Path $output 'sbom-windows-artifacts.cdx.json'
  & $syft "dir:$artifactStaging" -o "cyclonedx-json=$artifactSbom"
  if ($LASTEXITCODE -ne 0) { throw 'artifact SBOM generation failed' }
  Remove-Item -LiteralPath $artifactStaging -Recurse -Force

  $authenticode = @($nsisName, $msiName) | ForEach-Object {
    $path = Join-Path $output $_
    $signature = Get-AuthenticodeSignature -LiteralPath $path
    [ordered]@{
      file = $_
      status = $signature.Status.ToString()
      statusMessage = $signature.StatusMessage
      signer = if ($signature.SignerCertificate) { $signature.SignerCertificate.Subject } else { $null }
    }
  }
  Write-Utf8NoBom (Join-Path $output 'authenticode-status.json') ($authenticode | ConvertTo-Json -Depth 4)

  $manifestEntries = Get-ChildItem -LiteralPath $output -File | Sort-Object Name | ForEach-Object {
    [ordered]@{
      name = $_.Name
      bytes = $_.Length
      sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName).Hash
    }
  }
  $artifactManifest = [ordered]@{
    version = $Version
    generatedAt = (Get-Date).ToUniversalTime().ToString('o')
    syftVersion = $syftVersion
    updaterPublicKeyFingerprint = (Get-Content apps\desktop\src-tauri\updater\FINGERPRINT.sha256).Split(' ')[0]
    artifacts = $manifestEntries
  } | ConvertTo-Json -Depth 6
  Write-Utf8NoBom (Join-Path $output 'artifact-manifest.json') $artifactManifest

  $authenticodeSummary = if ($authenticode | Where-Object { $_.status -eq 'Valid' }) {
    'At least one artifact has a valid Authenticode signature.'
  } else {
    'UNSIGNED Authenticode downgrade: no Code Signing certificate was available; SmartScreen may warn.'
  }
  $acceptanceReport = @(
    '# v0.2.0 RC acceptance report'
    ''
    "- Generated: $((Get-Date).ToUniversalTime().ToString('o'))"
    '- Updater signature: required and generated for NSIS.'
    "- Authenticode: $authenticodeSummary"
    '- GitHub release: not created; artifacts remain local/workflow-draft only.'
    '- Installer data checks require the manual installation matrix in RELEASE_CHECKLIST.md.'
  ) -join [Environment]::NewLine
  Write-Utf8NoBom (Join-Path $output 'acceptance-report.md') $acceptanceReport

  Get-ChildItem -LiteralPath $output -File | Sort-Object Name | ForEach-Object {
    '{0}  {1}' -f (Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName).Hash.ToLowerInvariant(), $_.Name
  } | Set-Content -Encoding ascii (Join-Path $output 'SHA256SUMS.txt')

  & node scripts\release\verify-release-security.mjs $OutputDirectory
  if ($LASTEXITCODE -ne 0) { throw 'post-build security verification failed' }
  & git diff --check
  if ($LASTEXITCODE -ne 0) { throw 'git diff check failed' }
  Write-Output "Release candidate artifacts: $output"
} finally {
  Pop-Location
}
