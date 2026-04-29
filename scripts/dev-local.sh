#\!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# dev-local.sh — Lance le dashboard en local avec la DB de prod
#
# Usage:  ./scripts/dev-local.sh
# Stop:   Ctrl+C (ferme le tunnel SSH + le serveur Next.js)
# ═══════════════════════════════════════════════════════════════════

set -e

VPS_USER="ubuntu"
VPS_HOST="urbanhit-vps"    # Alias SSH (voir ~/.ssh/config)
LOCAL_PORT=5433          # Port local pour éviter conflit avec un PG local
REMOTE_CONTAINER="core-postgres"
REMOTE_PORT=5432

echo "══════════════════════════════════════════"
echo "  Dashboard Media — Dev Local"
echo "══════════════════════════════════════════"

# 1. Trouver l'IP du container PostgreSQL sur le VPS
echo ""
echo "→ Recherche du container PostgreSQL sur le VPS..."
PG_IP=$(ssh -o ConnectTimeout=5 ${VPS_HOST} \
  "docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}' ${REMOTE_CONTAINER} 2>/dev/null | awk '{print \$1}'" 2>/dev/null)

if [ -z "$PG_IP" ]; then
  echo "  ⚠ Container '${REMOTE_CONTAINER}' non trouvé, essai avec 'core_new-postgres-1'..."
  PG_IP=$(ssh -o ConnectTimeout=5 ${VPS_HOST} \
    "docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}' core_new-postgres-1 2>/dev/null | awk '{print \$1}'" 2>/dev/null)
fi

if [ -z "$PG_IP" ]; then
  echo "  ⚠ Essai avec 'postgres'..."
  PG_IP=$(ssh -o ConnectTimeout=5 ${VPS_HOST} \
    "docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}' postgres 2>/dev/null | awk '{print \$1}'" 2>/dev/null)
fi

if [ -z "$PG_IP" ]; then
  echo "  ✗ Impossible de trouver le container PostgreSQL."
  echo "  Vérifie avec: ssh ${VPS_HOST} 'docker ps | grep postgres'"
  exit 1
fi

echo "  ✓ PostgreSQL trouvé à ${PG_IP}:${REMOTE_PORT}"

# 2. Ouvrir le tunnel SSH
echo ""
echo "→ Ouverture du tunnel SSH (localhost:${LOCAL_PORT} → VPS:${PG_IP}:${REMOTE_PORT})..."
ssh -f -N -L ${LOCAL_PORT}:${PG_IP}:${REMOTE_PORT} ${VPS_HOST}
TUNNEL_PID=$(lsof -ti:${LOCAL_PORT} 2>/dev/null | head -1)
echo "  ✓ Tunnel SSH ouvert (PID: ${TUNNEL_PID})"

# Cleanup on exit
cleanup() {
  echo ""
  echo "→ Fermeture du tunnel SSH..."
  if [ -n "$TUNNEL_PID" ]; then
    kill $TUNNEL_PID 2>/dev/null && echo "  ✓ Tunnel fermé" || echo "  ✓ Tunnel déjà fermé"
  fi
}
trap cleanup EXIT

# 3. Vérifier la connexion DB
echo ""
echo "→ Test de connexion à la base..."
if command -v psql &>/dev/null; then
  psql "postgresql://dashboard_user:DH5-q8-Zp-K9t-2026@localhost:${LOCAL_PORT}/dashboard_media" -c "SELECT 1" >/dev/null 2>&1 \
    && echo "  ✓ Connexion DB OK" \
    || echo "  ⚠ psql échoué, mais le tunnel devrait fonctionner"
else
  echo "  (psql non installé, skip du test — la connexion devrait marcher)"
fi

# 4. Écrire le .env.local temporaire
echo ""
echo "→ Configuration .env.local pour le dev..."
ENV_FILE="$(dirname "$0")/../.env.local"

# Backup si existant
if [ -f "$ENV_FILE" ]; then
  cp "$ENV_FILE" "${ENV_FILE}.bak"
  echo "  ✓ Backup de .env.local existant → .env.local.bak"
fi

# Fetch secrets from VPS .env file
echo "  Récupération des secrets depuis le VPS..."
REMOTE_ENV=$(ssh "$VPS_HOST" "cat /home/ubuntu/dashboard-media/.env" 2>/dev/null || echo "")

get_env_val() {
  echo "$REMOTE_ENV" | grep "^$1=" | head -1 | cut -d= -f2-
}

cat > "$ENV_FILE" << ENV
# ═══ Dev Local (généré par dev-local.sh) ═══
# DB via tunnel SSH
DATABASE_URL=postgresql://dashboard_user:DH5-q8-Zp-K9t-2026@localhost:${LOCAL_PORT}/dashboard_media

# NextAuth
NEXTAUTH_SECRET=$(get_env_val NEXTAUTH_SECRET)
NEXTAUTH_URL=http://localhost:3000
AUTH_TRUST_HOST=true

# Automation
AUTOMATION_API_KEY=$(get_env_val AUTOMATION_API_KEY)

# Qonto OAuth
QONTO_CLIENT_ID=$(get_env_val QONTO_CLIENT_ID)
QONTO_CLIENT_SECRET=$(get_env_val QONTO_CLIENT_SECRET)
QONTO_REDIRECT_URI=http://localhost:3000/api/qonto/callback

# OpenAI
OPENAI_API_KEY=$(get_env_val OPENAI_API_KEY)

# SMTP OVH
SMTP_USER=$(get_env_val SMTP_USER)
SMTP_PASSWORD=$(get_env_val SMTP_PASSWORD)
ENV
echo "  ✓ .env.local écrit (DB via tunnel sur port ${LOCAL_PORT})"

# 5. Prisma generate
echo ""
echo "→ Prisma generate..."
npx prisma generate 2>&1 | tail -2

# 6. Lancer Next.js dev
echo ""
echo "══════════════════════════════════════════"
echo "  ✓ Tout est prêt\!"
echo "  → http://localhost:3000"
echo "  → DB connectée via tunnel SSH"
echo "  → Ctrl+C pour arrêter"
echo "══════════════════════════════════════════"
echo ""

npm run dev
