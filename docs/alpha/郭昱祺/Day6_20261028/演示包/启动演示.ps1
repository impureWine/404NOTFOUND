$ErrorActionPreference = 'Stop'
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$bundledNode = Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
if ($nodeCommand) { $nodePath = $nodeCommand.Source }
elseif (Test-Path -LiteralPath $bundledNode) { $nodePath = $bundledNode }
else { throw '未找到 Node.js。请使用已安装 Node.js 18+ 的电脑，或改用交付包中的备用截图。无需 npm install。' }
& $nodePath (Join-Path $PSScriptRoot 'serve.cjs')
exit $LASTEXITCODE
