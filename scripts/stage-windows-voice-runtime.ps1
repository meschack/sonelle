$ErrorActionPreference = "Stop"

$vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
$visualStudio = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if ([string]::IsNullOrWhiteSpace($visualStudio)) {
  throw "Visual Studio with the x64 C++ tools was not found."
}

$requiredFiles = @("msvcp140.dll", "msvcp140_1.dll", "vcruntime140.dll", "vcruntime140_1.dll")
$redistRoot = Join-Path $visualStudio "VC\Redist\MSVC"
$crt = Get-ChildItem $redistRoot -Directory -Recurse -Filter "Microsoft.VC*.CRT" |
  Where-Object { $_.Parent.Name -eq "x64" } |
  Where-Object {
    $candidate = $_.FullName
    ($requiredFiles | ForEach-Object { Test-Path (Join-Path $candidate $_) }) -notcontains $false
  } |
  Sort-Object FullName -Descending |
  Select-Object -First 1
if ($null -eq $crt) {
  throw "A complete x64 Visual C++ runtime was not found beneath $redistRoot."
}

$destination = "apps\desktop\src-tauri\resources\windows-runtime"
New-Item -ItemType Directory -Force -Path $destination | Out-Null
foreach ($file in $requiredFiles) {
  Copy-Item (Join-Path $crt.FullName $file) $destination
}
