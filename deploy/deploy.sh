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
# 9991, not 9990: this box is shared, and 9990 belongs to another project that
# has held it for months. A default that cannot actually be used turns the first
# redeploy anyone runs without the override into an abort.
API_PORT="${API_PORT:-4100}"
WEB_PORT="${WEB_PORT:-9991}"
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

# A busy port would give a process that dies on boot with a confusing error, so
# it is caught before anything is written. A port held by this deployment own
# processes is fine — that is what a redeploy looks like.
OWN_PIDS=" $(pm2 pid erp-astir-task-api 2>/dev/null || true) $(pm2 pid erp-astir-task-web 2>/dev/null || true) "

# The socket is not necessarily held by the pid PM2 reports. The API runs under
# tsx, which spawns a child, and that child is what binds the port — so a
# redeploy comparing only against `pm2 pid` calls its own API a stranger and
# refuses to proceed. Walk up from the holder instead.
#
# PPid comes from /proc/PID/status, not /proc/PID/stat: a process whose name
# contains spaces or parentheses — "PM2 v6.0.14: God Daemon" is one, and it is
# in this very chain — shifts every positional field in stat.
owned_by_us() {
  pid="$1"
  for _ in 1 2 3 4 5 6 7 8; do
    case "$OWN_PIDS" in *" $pid "*) return 0 ;; esac
    [ -r "/proc/${pid}/status" ] || return 1
    pid="$(awk '/^PPid:/ { print $2 }' "/proc/${pid}/status")"
    [ -n "$pid" ] && [ "$pid" != 0 ] && [ "$pid" != 1 ] || return 1
  done
  return 1
}

for port in "$API_PORT" "$WEB_PORT"; do
  # An unmatched grep exits 1, and under pipefail that would kill the script
  # before it ever reported anything.
  holder="$(ss -lntp 2>/dev/null | grep ":${port} " | grep -o "pid=[0-9]*" | head -1 | cut -d= -f2 || true)"
  if [ -n "$holder" ]; then
    if owned_by_us "$holder"; then
      echo "порт ${port} держит наш процесс ${holder} — это перевыкладка"
    else
      fail "порт ${port} занят чужим процессом ${holder} ($(cat /proc/${holder}/comm 2>/dev/null || echo '?'))"
    fi
  fi
done

# Source comes from git when available, from an uploaded tarball otherwise.
REPO="${REPO:-https://github.com/turgunov01/erp.astir-task.uz.git}"
USE_GIT=0
if [ -z "${FORCE_TARBALL:-}" ] && command -v git >/dev/null; then USE_GIT=1; fi
if [ "$USE_GIT" = 0 ] && [ ! -f "$TARBALL" ]; then
  fail "нет ни git, ни архива ${TARBALL}"
fi

# ---------------------------------------------------------------- source

say "Распаковка в ${APP_DIR}"
mkdir -p "$APP_DIR"
# The previous release is kept until the new one is running.
if [ -d "${APP_DIR}/current" ]; then
  rm -rf "${APP_DIR}/previous"
  mv "${APP_DIR}/current" "${APP_DIR}/previous"
fi
if [ "$USE_GIT" = 1 ]; then
  git clone --depth 1 "$REPO" "${APP_DIR}/current"
else
  mkdir -p "${APP_DIR}/current"
  tar -xzf "$TARBALL" -C "${APP_DIR}/current"
fi
cd "${APP_DIR}/current"

# ---------------------------------------------------------------- secrets

say "Конфигурация"
ENV_FILE="${APP_DIR}/env.production"

# Before certbot runs the site is plain HTTP, and a Secure cookie would never
# reach the browser — login would fail with nothing on screen to explain it.
# The scheme is therefore taken from the certificate and re-applied on every
# deploy, so the switch after certbot needs no manual edit.
if [ -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]; then
  SCHEME=https; COOKIE_SECURE=true
else
  SCHEME=http;  COOKIE_SECURE=false
fi
echo "схема: ${SCHEME}, Secure-cookie: ${COOKIE_SECURE}"

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

APP_URL=${SCHEME}://${DOMAIN}
API_URL=${SCHEME}://${DOMAIN}/api
COOKIE_SECURE=${COOKIE_SECURE}

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

# Re-applied on every run, including deploys that reuse an existing env file.
sed -i "s|^APP_URL=.*|APP_URL=${SCHEME}://${DOMAIN}|" "$ENV_FILE"
sed -i "s|^API_URL=.*|API_URL=${SCHEME}://${DOMAIN}/api|" "$ENV_FILE"
sed -i "s|^COOKIE_SECURE=.*|COOKIE_SECURE=${COOKIE_SECURE}|" "$ENV_FILE"

mkdir -p "${APP_DIR}/storage"
cp "$ENV_FILE" apps/api/.env

# ---------------------------------------------------------------- build

say "Установка зависимостей"
pnpm install --frozen-lockfile

say "Схема базы"
pnpm --filter @astir/api exec prisma generate
pnpm --filter @astir/api exec prisma migrate deploy

# A migrated but empty database has no accounts, so the first deploy would
# otherwise finish with a working site nobody can log into.
USERS=$(sudo -u postgres psql -tAd "${DB_NAME}" -c "SELECT count(*) FROM users" 2>/dev/null || echo 0)
if [ "${USERS:-0}" = "0" ]; then
  say "База пуста — наполняю начальными данными"
  pnpm --filter @astir/api db:seed
else
  echo "в базе уже ${USERS} пользовател(ей) — наполнение пропущено"
fi

# The API is not compiled: its ESM output needs import specifiers TypeScript
# does not write, and tsx runs the sources directly instead.

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
SNIPPET="/etc/nginx/snippets/${DOMAIN}.proxy.conf"
TEMPLATES="${APP_DIR}/current/deploy"

render() { sed -e "s|__DOMAIN__|${DOMAIN}|g" -e "s|__WEB_PORT__|${WEB_PORT}|g" "$1"; }

install -d /etc/nginx/snippets

# Both files are replaced in place, so a config nginx rejects would otherwise
# leave a broken vhost on disk for whoever reloads next — including certbot's
# renewal timer, hours later, with no one watching. Keep the previous pair and
# put them back if the new one fails to parse.
STAMP="$(date +%Y%m%d-%H%M%S)"
VHOST_BACKUP=""; SNIPPET_BACKUP=""
[ -f "$VHOST" ]   && { VHOST_BACKUP="${VHOST}.bak-${STAMP}";     cp -a "$VHOST" "$VHOST_BACKUP"; }
[ -f "$SNIPPET" ] && { SNIPPET_BACKUP="${SNIPPET}.bak-${STAMP}"; cp -a "$SNIPPET" "$SNIPPET_BACKUP"; }

render "${TEMPLATES}/nginx.proxy.conf.template" > "$SNIPPET"

# The vhost is rewritten on every run, and certbot --nginx puts its TLS server
# block into that same file — so once a certificate exists the TLS vhost has to
# be generated here too. Regenerating the plain-HTTP one instead would drop the
# site back to port 80 while the app, seeing the certificate, kept issuing
# Secure cookies that never arrive: a login that fails with nothing on screen.
if [ "$SCHEME" = "https" ]; then
  render "${TEMPLATES}/nginx-tls.conf.template" > "$VHOST"
else
  render "${TEMPLATES}/nginx.conf.template" > "$VHOST"
fi
ln -sfn "$VHOST" "/etc/nginx/sites-enabled/${DOMAIN}.conf"

# Reload only once the whole config parses: a broken file here would take down
# every other site on this machine.
if ! nginx -t; then
  # On a first deploy there is nothing to restore, and leaving the rejected
  # files behind would break the next reload by anyone else — so they go.
  if [ -n "$VHOST_BACKUP" ]; then
    cp -a "$VHOST_BACKUP" "$VHOST"
  else
    rm -f "$VHOST" "/etc/nginx/sites-enabled/${DOMAIN}.conf"
  fi
  if [ -n "$SNIPPET_BACKUP" ]; then
    cp -a "$SNIPPET_BACKUP" "$SNIPPET"
  else
    rm -f "$SNIPPET"
  fi
  nginx -t >/dev/null 2>&1 || echo "внимание: nginx -t не проходит и без наших файлов" >&2
  fail "nginx отклонил конфигурацию — прежняя восстановлена, nginx не тронут"
fi
systemctl reload nginx

say "Готово"
echo "Адрес:  ${SCHEME}://${DOMAIN}"
echo "Логи:   pm2 logs erp-astir-task-api    pm2 logs erp-astir-task-web"
if [ "$SCHEME" = "http" ]; then
  echo "HTTPS:  certbot --nginx -d ${DOMAIN}, затем повторите деплой —"
  echo "        схема и Secure-cookie переключатся сами"
fi
echo
pm2 list
