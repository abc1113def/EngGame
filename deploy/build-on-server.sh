#!/usr/bin/env bash
# Сборка прямо на сервере (1 ядро / 1 ГБ хватает: пик ≈ 300 МБ) и выкладка в папку сайта.
# Запуск из клона репозитория на сервере:
#   ./deploy/build-on-server.sh [/var/www/a320]
# Обновление игры:  git pull && ./deploy/build-on-server.sh
set -euo pipefail
DIR="${1:-/var/www/a320}"
cd "$(dirname "$0")/.."

if ! command -v node >/dev/null 2>&1; then
  echo "Нет Node.js. Установите версию 18 или новее (см. DEPLOY.md, вариант Б)." >&2
  exit 1
fi
MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$MAJOR" -lt 18 ]; then
  echo "Node.js $MAJOR слишком старый: нужна 18 или новее (см. DEPLOY.md, вариант Б)." >&2
  exit 1
fi

npm ci --no-audit --no-fund
npm run build

mkdir -p "$DIR"
if command -v rsync >/dev/null 2>&1; then
  rsync -a --delete dist/ "$DIR/"
else
  rm -rf "${DIR:?}"/*
  cp -r dist/. "$DIR/"
fi
chmod -R a+rX "$DIR"
echo "Готово: игра выложена в $DIR"
