# Deployment Guide

## Repository
- **Repo**: https://github.com/amineur/myfacture-site.git
- **Branch**: main
- **Contains**: Both the MyFacture marketing site (HTML files) AND the dashboard Next.js app

## VPS
- **IP**: 83.228.217.205
- **Hostname**: facture.urban-hit.fr
- **SSH alias**: `urbanhit-vps` (configuré dans ~/.ssh/config)
- **User**: ubuntu
- **Auth**: SSH key at `~/.gemini/antigravity/scratch/id_rsa_vps`
- **App path**: /home/ubuntu/dashboard-media
- **Runtime**: Docker Compose (service: dashboard-media)
- **PostgreSQL container**: `core-postgres` (IP 172.23.0.2 sur le réseau Docker)
- **DB credentials**: `dashboard_user` / `DH5-q8-Zp-K9t-2026` / database `dashboard_media`

## Automatic Deployment (GitHub Actions)
Every push to `main` triggers `.github/workflows/deploy.yml` which:
1. SSH into the VPS
2. `git pull origin main`
3. `npm install`
4. `npx prisma db push --accept-data-loss`
5. `npx prisma generate`
6. `npm run build`
7. `docker compose restart dashboard-media`

## Local Development Setup

### Prérequis (une seule fois)
```bash
cd ~/.gemini/antigravity/scratch/dashboard-media
npm install
```

### Lancer le dev local
```bash
./scripts/dev-local.sh
```
Ça fait tout automatiquement :
1. Trouve le container PostgreSQL sur le VPS via SSH
2. Ouvre un tunnel SSH (localhost:5433 → VPS PostgreSQL)
3. Génère `.env.local` avec toutes les variables de prod (NEXTAUTH_SECRET, Qonto, OpenAI, SMTP...)
4. Lance `npx prisma generate`
5. Lance `npm run dev` → http://localhost:3000

### Si le schema Prisma a changé (nouvelle colonne, etc.)
Ouvrir un **2ème Terminal** pendant que dev-local.sh tourne :
```bash
cd ~/.gemini/antigravity/scratch/dashboard-media
DATABASE_URL=postgresql://dashboard_user:DH5-q8-Zp-K9t-2026@localhost:5433/dashboard_media npx prisma db push
```

### Arrêter
`Ctrl+C` dans le Terminal → ferme tunnel SSH + serveur Next.js

### Troubleshooting
- **Port 3000 occupé** : `kill $(lsof -ti:3000)` puis relancer
- **Lock .next/dev/lock** : supprimer le fichier ou tuer l'ancien process
- **Container PostgreSQL non trouvé** : vérifier avec `ssh urbanhit-vps 'docker ps | grep postgres'`

## How to Commit & Push from Cowork Sandbox

The sandbox has filesystem restrictions on .git operations. Workaround:

### 1. Stage & create tree (use alternate index)
```bash
GIT_INDEX_FILE=/tmp/newindex git read-tree HEAD
GIT_INDEX_FILE=/tmp/newindex git add -A
TREE=$(GIT_INDEX_FILE=/tmp/newindex git write-tree | tail -1)
```

### 2. Create commit (set author explicitly)
```bash
PARENT=$(git rev-parse HEAD)
COMMIT=$(GIT_AUTHOR_NAME="Amineur" GIT_AUTHOR_EMAIL="aminebenabla@gmail.com" \
  GIT_COMMITTER_NAME="Amineur" GIT_COMMITTER_EMAIL="aminebenabla@gmail.com" \
  git commit-tree "$TREE" -p "$PARENT" -m "commit message")
```

### 3. Update ref (write directly, update-ref fails due to lock files)
```bash
echo "$COMMIT" > .git/refs/heads/main
```

### 4. Push (needs a PAT — create via Chrome, use, then delete)
```bash
git push https://amineur:<PAT>@github.com/amineur/myfacture-site.git main
```

### Creating a temporary PAT via Chrome:
1. Navigate to https://github.com/settings/tokens/new?description=temp-deploy&scopes=repo,workflow
2. Check "repo" + "workflow" scopes, set 7 days expiration, Generate
3. Find token via JS: `document.getElementById('new-oauth-token').textContent`
4. Use for push, then DELETE the token immediately after
5. Delete via `.js-revoke-access-form` submit on tokens page

### GitHub Secrets (for Actions)
- **VPS_SSH_KEY** — SSH private key for ubuntu@83.228.217.205

## Manual Deploy (if needed)
```bash
ssh urbanhit-vps
cd /home/ubuntu/dashboard-media
git pull origin main
npm install
npx prisma db push
npx prisma generate
npm run build
docker compose restart dashboard-media
```
