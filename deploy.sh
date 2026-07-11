#!/usr/bin/env bash
# ============================================================
# Instagram DM Platform — server deploy skripti (Ubuntu)
#
# Ishlatish:
#   1. Loyihani serverga yuklang (git clone yoki scp)
#   2. cd instagram-dm-platform
#   3. sudo bash deploy.sh
#
# Skript nima qiladi:
#   - Docker bolmasa ornatadi va reboot da avtomatik yoqilishini sozlaydi
#   - .env bolmasa .env.example dan yaratadi, bosh sirlarni avtomatik generatsiya qiladi
#   - docker compose bilan postgres + backend + frontend ni build qilib kotaradi
#   - Backend health checkni kutadi
#   - ADMIN_EMAIL/ADMIN_PASSWORD berilgan bolsa admin yaratadi
#
# Konteynerlar "restart: unless-stopped" bilan ishlaydi —
# server qayta yonganda Docker va konteynerlar avtomatik kotariladi.
# ============================================================

set -euo pipefail
cd "$(dirname "$0")"

log()  { echo -e "\033[1;32m[deploy]\033[0m $*"; }
fail() { echo -e "\033[1;31m[xato]\033[0m $*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || fail "Skriptni root sifatida ishga tushiring: sudo bash deploy.sh"

# ---------- 1. Docker ----------
if ! command -v docker >/dev/null 2>&1; then
  log "Docker topilmadi — ornatilmoqda..."
  curl -fsSL https://get.docker.com | sh
fi

# Reboot da Docker avtomatik yoqiladi
systemctl enable --now docker >/dev/null 2>&1 || true

docker compose version >/dev/null 2>&1 || fail "docker compose plugin topilmadi. Ornatish: apt-get install -y docker-compose-plugin"
log "Docker tayyor: $(docker --version)"

# ---------- 2. .env ----------
if [ ! -f .env ]; then
  log ".env topilmadi — .env.example dan yaratilmoqda..."
  cp .env.example .env
fi

# Bosh qolgan sirlarni avtomatik toldirish
ensure_secret() {
  local key="$1" value="$2"
  if grep -qE "^${key}=\s*$" .env; then
    sed -i "s|^${key}=.*|${key}=${value}|" .env
    log "${key} avtomatik generatsiya qilindi"
  fi
}
ensure_secret "POSTGRES_PASSWORD"      "$(openssl rand -hex 24)"
ensure_secret "JWT_SECRET"             "$(openssl rand -hex 32)"
ensure_secret "TOKEN_ENCRYPTION_KEY"   "$(openssl rand -hex 32)"

# Majburiy URLlar tekshiruvi
require_var() {
  local key="$1"
  grep -qE "^${key}=.+" .env || fail "${key} .env faylida toldirilishi shart (masalan: nano .env)"
}
require_var "FRONTEND_URL"
require_var "NEXT_PUBLIC_API_URL"

# ---------- 3. Build va ishga tushirish ----------
log "Konteynerlar build qilinmoqda (birinchi safar bir necha daqiqa olishi mumkin)..."
docker compose up -d --build

# Host portlar (.env da berilmasa standart qiymatlar)
BACKEND_PORT=$(grep -E "^BACKEND_PORT=" .env | cut -d= -f2- || true)
BACKEND_PORT=${BACKEND_PORT:-4000}
FRONTEND_PORT=$(grep -E "^FRONTEND_PORT=" .env | cut -d= -f2- || true)
FRONTEND_PORT=${FRONTEND_PORT:-3000}

# ---------- 4. Health check ----------
log "Backend health check kutilmoqda..."
for i in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:${BACKEND_PORT}/api/health" >/dev/null 2>&1; then
    log "Backend ishlayapti ✓"
    break
  fi
  [ "$i" -eq 30 ] && { docker compose logs --tail=30 backend; fail "Backend 60 soniyada kotarilmadi. Loglarni tekshiring: docker compose logs backend"; }
  sleep 2
done

# ---------- 5. Admin yaratish (ixtiyoriy) ----------
ADMIN_EMAIL=$(grep -E "^ADMIN_EMAIL=" .env | cut -d= -f2- || true)
ADMIN_PASSWORD=$(grep -E "^ADMIN_PASSWORD=" .env | cut -d= -f2- || true)
if [ -n "${ADMIN_EMAIL}" ] && [ -n "${ADMIN_PASSWORD}" ]; then
  log "Admin yaratilmoqda: ${ADMIN_EMAIL}"
  docker compose exec -T backend node dist/scripts/createAdmin.js "${ADMIN_EMAIL}" "${ADMIN_PASSWORD}"
else
  log "ADMIN_EMAIL/ADMIN_PASSWORD .env da berilmagan — adminni qolda yarating:"
  log "  docker compose exec backend node dist/scripts/createAdmin.js admin@example.com Parol123"
fi

# ---------- Yakun ----------
echo
log "Deploy tugadi! ✓"
log "Frontend (local):  http://127.0.0.1:${FRONTEND_PORT}"
log "Backend (local):   http://127.0.0.1:${BACKEND_PORT}/api/health"
log "Webhook URL (Meta Dashboard uchun): \$BACKEND_DOMEN/api/webhooks/instagram"
log "Holat:  docker compose ps"
log "Loglar: docker compose logs -f backend"
