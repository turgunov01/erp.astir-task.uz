#!/usr/bin/env bash
#
# Deploy Aster ERP to erp.astir-task.uz.
#
# Runs on the server against an uploaded source tarball. Written to be
# repeatable: running it twice must land in the same place, because the second
# run is the one that happens under pressure.
#
# The box is shared with live services, so this only ever adds — a new
# directory, a new nginx vhost, two PM2 processes. It never edits another
# vhost and never restarts nginx, only reloads it after its own config passes.
set -euo pipefail

DOMAIN="erp.astir-task.uz"
APP_DIR="/var/www/${DOMAIN}"
TARBALL="/tmp/astir-erp.tar.gz"
API_PORT="${API_PORT:-4100}"
WEB_PORT="${WEB_PORT:-9990}"
DB_NAME="astir_erp_prod"
DB_USER="astir_erp"

say() { printf '\n\033[1;36m==> %s\033[0m\n' "$1"; }
fail() { printf '\n\033[1;31mОШИБКА: %s\033[0m\n' "$1" >&2; exit 1; }

# ---------------------------------------------------------------- pre-flight

say "Проверка окружения"
command -v node >/dev/null || fail "node не установлен"
command -v pm2  >/dev/null || fail "pm2 не установлен"
command -v psql >/dev/null || fail "psql не установлен"
command -v pnpm >/dev/null || npm install -g pnpm@9.15.0
echo "node $(node -v), pnpm $(pnpm -v)"

# A busy port would give a process that dies on boot with a confusing error,
# so it is caught before anything is written.
for port in "$API_PORT" "$WEB_PORT"; do
  if ss -lntp 2>/dev/null | grep -q ":${port} "; then
    fail "порт ${port} занят — задайте другой: API_PORT=... WEB_PORT=... bash deploy.sh"
  fi
done

[ -f "$TARBALL" ] || fail "архив ${TARBALL} не найден — сначала загрузите исходники"

# ---------------------------------------------------------------- source

say "Распаковка в ${APP_DIR}"
mkdir -p "$APP_DIR"
# The previous release is kept until the new one is running.
if [ -d "${APP_DIR}/current" ]; then
  rm -rf "${APP_DIR}/previous"
  mv "${APP_DIR}/current" "${APP_DIR}/previous"
fi
mkdir -p "${APP_DIR}/current"
tar -xzf "$TARBALL" -C "${APP_DIR}/current"
cd "${APP_DIR}/current"

# ---------------------------------------------------------------- secrets

say "Конфигурация"
ENV_FILE="${APP_DIR}/env.production"

if [ ! -f "$ENV_FILE" ]; then
  # Secrets are generated once and live outside the release directory, so a
  # redeploy never rotates them and they never travel in the tarball.
  DB_PASSWORD="$(openssl rand -hex 24)"

  say "Создание базы ${DB_NAME}"
  sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" \
    | grep -q 1 || sudo -u postgres psql -c \
    "CREATE ROLE ${DB_USER} LOGIN PASSWORD '${DB_PASSWORD}'"
  sudo -u postgres psql -c "ALTER ROLE ${DB_USER} WITH PASSWORD '${DB_PASSWORD}'"
  sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" \
    | grep -q 1 || sudo -u postgres createdb -O "${DB_USER}" "${DB_NAME}"

  cat > "$ENV_FILE" <<ENVEOF
NODE_ENV=production
PORT=${API_PORT}

DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@127.0.0.1:5432/${DB_NAME}?schema=public"

JWT_ACCESS_SECRET=$(openssl rand -hex 32)
JWT_REFRESH_SECRET=$(openssl rand -hex 32)
ACCESS_TOKEN_TTL=15m
REFRESH_TOKEN_TTL_DAYS=30

APP_URL=https://${DOMAIN}
API_URL=https://${DOMAIN}/api
COOKIE_SECURE=true

STORAGE_PROVIDER=local
STORAGE_PATH=${APP_DIR}/storage

# Почта для кодов подтверждения. Пока пусто — коды пишутся в лог PM2.
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=
ENVEOF
  chmod 600 "$ENV_FILE"
  echo "создан ${ENV_FILE}, секреты сгенерированы"
else
  echo "используется существующий ${ENV_FILE}"
fi

mkdir -p "${APP_DIR}/storage"
cp "$ENV_FILE" apps/api/.env

# ---------------------------------------------------------------- build

say "Установка зависимостей"
pnpm install --frozen-lockfile

say "Схема базы"
pnpm --filter @astir/api exec prisma generate
pnpm --filter @astir/api exec prisma migrate deploy

say "Сборка веб-приложения"
# NUXT_API_ORIGIN is read when routeRules are compiled, not at runtime, so the
# API port has to be known here — setting it only in PM2 would leave the built
# proxy pointing at the development default.
NUXT_API_ORIGIN="http://127.0.0.1:${API_PORT}" pnpm --filter @astir/web build

# ---------------------------------------------------------------- process

say "Запуск под PM2"
cp deploy/ecosystem.config.cjs "${APP_DIR}/ecosystem.config.cjs"
cd "$APP_DIR"
APP_DIR="$APP_DIR" API_PORT="$API_PORT" WEB_PORT="$WEB_PORT" \
  pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save

# ---------------------------------------------------------------- nginx

say "Настройка nginx"
VHOST="/etc/nginx/sites-available/${DOMAIN}.conf"
sed -e "s|__DOMAIN__|${DOMAIN}|g" -e "s|__WEB_PORT__|${WEB_PORT}|g" \
  "${APP_DIR}/current/deploy/nginx.conf.template" > "$VHOST"
ln -sfn "$VHOST" "/etc/nginx/sites-enabled/${DOMAIN}.conf"

# Reload only once the whole config parses: a broken file here would take down
# every other site on this machine.
nginx -t
systemctl reload nginx

say "Готово"
echo "Адрес:  http://${DOMAIN}"
echo "Логи:   pm2 logs erp-astir-task-api    pm2 logs erp-astir-task-web"
echo "HTTPS:  certbot --nginx -d ${DOMAIN}"
echo
pm2 list
