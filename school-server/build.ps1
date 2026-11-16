# Builds dist\CAS-School-Server.zip: the folder sent to every school.
# Includes node.exe from this PC so the school needs nothing else installed.
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$out  = Join-Path $here 'dist\CAS-School-Server'
if (Test-Path (Join-Path $here 'dist')) { Remove-Item -Recurse -Force (Join-Path $here 'dist') }
New-Item -ItemType Directory -Force $out | Out-Null

Copy-Item (Get-Command node).Source (Join-Path $out 'node.exe')
foreach ($f in 'server.js', 'admin.html', 'README.txt') { Copy-Item (Join-Path $here $f) $out }
# Batch files and the README need Windows line endings.
foreach ($f in 'install.bat', 'uninstall.bat', 'run.bat', 'README.txt') {
  $text = [IO.File]::ReadAllText((Join-Path $here $f)) -replace "`r?`n", "`r`n"
  [IO.File]::WriteAllText((Join-Path $out $f), $text, [Text.UTF8Encoding]::new($false))
}
Compress-Archive -Path $out -DestinationPath (Join-Path $here 'dist\CAS-School-Server.zip')
Write-Output "Built $(Join-Path $here 'dist\CAS-School-Server.zip')"
