#!/usr/bin/env bash
#
# Read-only diagnosis of the Aster ERP deployment. Changes nothing: no file is
# written, no process is restarted, nginx is never reloaded. Safe to run while
# the site is down and safe to run while it is fine.
#
# Run as root — the nginx and PM2 logs are not world-readable.
#
# Every value it needs comes from the same place deploy.sh takes it from, so the
# two cannot drift into disagreeing about which port or process to look at.
#
#   ./diagnose.sh                 # this deployment
#   API_PORT=4101 ./diagnose.sh   # same overrides deploy.sh accepts
#
# Deliberately not `set -e`: a diagnosis that stops at the first missing file is
# useless precisely when something is missing.
set -uo pipefail

DOMAIN="${DOMAIN:-erp.astir-task.uz}"
APP_DIR="/var/www/${DOMAIN}"
# Must match deploy.sh, and for the same reason: 9990 belongs to another
# project on this box. Probing it reports that stranger as healthy.
API_PORT="${API_PORT:-4100}"
WEB_PORT="${WEB_PORT:-9991}"
API_PROC="erp-astir-task-api"
WEB_PROC="erp-astir-task-web"
VHOST="/etc/nginx/sites-available/${DOMAIN}.conf"
SNIPPET="/etc/nginx/snippets/${DOMAIN}.proxy.conf"
TEMPLATES="${APP_DIR}/current/deploy"

hr()   { printf '\n\033[1;36m===== %s =====\033[0m\n' "$1"; }
ok()   { printf '  \033[1;32m✓\033[0m %s\n' "$1"; }
bad()  { printf '  \033[1;31m✗\033[0m %s\n' "$1"; }
warn() { printf '  \033[1;33m!\033[0m %s\n' "$1"; }

[ "$(id -u)" = 0 ] || warn "не root — часть логов будет недоступна"

# ------------------------------------------------------------------ processes

hr "PM2"
pm2 list 2>/dev/null || bad "pm2 не отвечает"

for proc in "$API_PROC" "$WEB_PROC"; do
  # restart_time climbing between two runs of this script is the signal that a
  # process is crash-looping rather than merely stopped.
  line="$(pm2 jlist 2>/dev/null \
    | node -e "
      let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{
        const p=(JSON.parse(d||'[]')).find(x=>x.name===process.argv[1]);
        if(!p){console.log('нет процесса');return}
        const e=p.pm2_env||{};
        const up=e.pm_uptime?Math.round((Date.now()-e.pm_uptime)/1000):0;
        console.log(\`\${e.status}, аптайм \${up}s, рестартов \${e.restart_time??0}, память \${Math.round((p.monit?.memory??0)/1048576)}MB\`);
      })" "$proc" 2>/dev/null)"
  case "$line" in
    online*) ok  "${proc}: ${line}" ;;
    *)       bad "${proc}: ${line:-неизвестно}" ;;
  esac
done

# ---------------------------------------------------------------------- ports

hr "Порты"
for port in "$API_PORT" "$WEB_PORT"; do
  holder="$(ss -lntp 2>/dev/null | grep ":${port} " | head -1)"
  if [ -n "$holder" ]; then
    ok "${port} слушает — ${holder##*users:}"
  else
    bad "${port} никто не слушает"
  fi
done

# --------------------------------------------------------------------- probes

# The three probes localise a failure that a single one cannot. nginx failing
# while the web port answers is an nginx problem; both failing while the API
# answers is Nuxt; the API reporting database "down" is Postgres, whatever the
# other two say.
hr "Ответы (снаружи внутрь)"

probe() { # url, label, extra curl args
  local url="$1" label="$2"; shift 2
  local out
  out="$(curl -sS -o /dev/null --max-time 10 -w '%{http_code} за %{time_total}s' "$@" "$url" 2>&1)"
  case "$out" in
    2*|3*) ok   "${label}: ${out}" ;;
    *)     bad  "${label}: ${out}" ;;
  esac
}

# --resolve keeps the request on this machine. Sent to the public address it
# leaves the box and comes back through NAT, which many hosts do not hairpin —
# the timeout that produces looks exactly like nginx being down when it is not.
if [ -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]; then
  probe "https://${DOMAIN}/" "через nginx (https, локально)" --resolve "${DOMAIN}:443:127.0.0.1"
else
  probe "http://${DOMAIN}/" "через nginx (http, локально)" --resolve "${DOMAIN}:80:127.0.0.1"
fi
probe "http://127.0.0.1:${WEB_PORT}/" "Nuxt напрямую (порт ${WEB_PORT})"

# The vhost naming a port nothing of ours listens on is its own outage, and a
# shared box makes it likely: the neighbouring project holds the port this
# deployment used to default to.
upstream_port="$(grep -oE "server 127.0.0.1:[0-9]+" "$VHOST" 2>/dev/null | grep -oE "[0-9]+$" | head -1)"
if [ -n "$upstream_port" ] && [ "$upstream_port" != "$WEB_PORT" ]; then
  bad "nginx проксирует на ${upstream_port}, а проверяли ${WEB_PORT} — запустите с WEB_PORT=${upstream_port}"
fi

api_health="$(curl -sS --max-time 10 "http://127.0.0.1:${API_PORT}/api/health" 2>&1)"
case "$api_health" in
  *'"database":"up"'*) ok  "API /api/health: ${api_health}" ;;
  *)                   bad "API /api/health: ${api_health}" ;;
esac

# ---------------------------------------------------------------------- nginx

hr "nginx"
nginx -v 2>&1
if nginx -t 2>/dev/null; then ok "конфигурация парсится"; else bad "nginx -t не проходит:"; nginx -t 2>&1 | sed 's/^/    /'; fi

for f in "$VHOST" "$SNIPPET"; do
  [ -f "$f" ] && ok "есть ${f}" || bad "нет ${f}"
done

# The outage this script was written for came back after a deploy overwrote the
# fix, so the deployed files are compared against the templates they came from.
# A difference here means the running site is not what the repository describes.
if [ -d "$TEMPLATES" ]; then
  render() { sed -e "s|__DOMAIN__|${DOMAIN}|g" -e "s|__WEB_PORT__|${WEB_PORT}|g" "$1"; }
  if [ -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]; then
    want_vhost="${TEMPLATES}/nginx-tls.conf.template"
  else
    want_vhost="${TEMPLATES}/nginx.conf.template"
  fi
  if diff -q <(render "$want_vhost") "$VHOST" >/dev/null 2>&1; then
    ok "vhost совпадает с $(basename "$want_vhost")"
  else
    bad "vhost разошёлся с $(basename "$want_vhost") — сайт не тот, что в репозитории:"
    diff <(render "$want_vhost") "$VHOST" 2>/dev/null | head -30 | sed 's/^/    /'
  fi
  if diff -q <(render "${TEMPLATES}/nginx.proxy.conf.template") "$SNIPPET" >/dev/null 2>&1; then
    ok "snippet совпадает с шаблоном"
  else
    bad "snippet разошёлся с шаблоном:"
    diff <(render "${TEMPLATES}/nginx.proxy.conf.template") "$SNIPPET" 2>/dev/null | head -30 | sed 's/^/    /'
  fi
else
  warn "нет ${TEMPLATES} — сверить конфиг с репозиторием нечем"
fi

# ------------------------------------------------------------------------ TLS

hr "Сертификат"
CERT="/etc/letsencrypt/live/${DOMAIN}/fullchain.pem"
if [ -f "$CERT" ]; then
  until_date="$(openssl x509 -enddate -noout -in "$CERT" 2>/dev/null | cut -d= -f2)"
  if openssl x509 -checkend $((14*24*3600)) -noout -in "$CERT" >/dev/null 2>&1; then
    ok "действует до ${until_date}"
  else
    bad "истекает в течение 14 дней (до ${until_date}) — проверьте таймер certbot"
  fi
else
  warn "сертификата нет, сайт на плайн-HTTP"
fi

# ----------------------------------------------------------------------- logs

# An unreadable log must say so out loud. Left to a pipeline the exit status
# comes from the last stage, the `|| echo` fallback never runs, and the section
# renders empty — which in a diagnosis reads exactly like "no errors here".
readable() {
  [ -r "$1" ] && return 0
  if [ -e "$1" ]; then echo "  (нет доступа к $1 — нужен root)"; else echo "  (нет файла $1)"; fi
  return 1
}

ACCESS="/var/log/nginx/${DOMAIN}.access.log"

hr "Коды ответов в access log (весь файл)"
# A histogram rather than a 502 count: the next outage will not be the last one.
if readable "$ACCESS"; then
  awk '$9 ~ /^[0-9][0-9][0-9]$/ { c[$9]++ } END { for (s in c) printf "  %s  %d\n", s, c[s] }' "$ACCESS" | sort
fi

hr "Последние ошибки 5xx"
if readable "$ACCESS"; then
  awk '$9 ~ /^5[0-9][0-9]$/' "$ACCESS" | tail -10
fi

hr "nginx error log — последние 30"
ERRLOG="/var/log/nginx/${DOMAIN}.error.log"
readable "$ERRLOG" && tail -n 30 "$ERRLOG"

for name in api web; do
  hr "${name}.error.log — последние 20"
  APPLOG="${APP_DIR}/logs/${name}.error.log"
  readable "$APPLOG" && tail -n 20 "$APPLOG"
done

# ----------------------------------------------------------------------- host

hr "Ресурсы"
free -h 2>/dev/null | head -2
df -h "$APP_DIR" 2>/dev/null | tail -1
uptime
