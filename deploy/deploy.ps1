# Сборка на компьютере с Windows и копирование на сервер (нужны Node.js 18+ и встроенный OpenSSH).
# Запуск из папки проекта в PowerShell:
#   powershell -ExecutionPolicy Bypass -File deploy\deploy.ps1 user@IP_СЕРВЕРА
#   powershell -ExecutionPolicy Bypass -File deploy\deploy.ps1 user@IP_СЕРВЕРА /var/www/a320
param(
  [Parameter(Mandatory = $true)][string]$Target,
  [string]$Dir = "/var/www/a320"
)
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

npm ci --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw "npm ci завершился с ошибкой" }
npm run build
if ($LASTEXITCODE -ne 0) { throw "сборка завершилась с ошибкой" }

scp -r dist "${Target}:/tmp/a320-dist"
if ($LASTEXITCODE -ne 0) { throw "не удалось скопировать файлы (scp)" }
ssh $Target "mkdir -p '$Dir' && rm -rf '$Dir'/* && cp -r /tmp/a320-dist/. '$Dir'/ && rm -rf /tmp/a320-dist && chmod -R a+rX '$Dir'"
if ($LASTEXITCODE -ne 0) { throw "не удалось разложить файлы на сервере" }
Write-Host "Готово: файлы в ${Target}:$Dir"
