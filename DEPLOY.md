# Dashboard Media — Guide de Déploiement VPS

## Prérequis

- VPS avec Docker + Portainer installés
- PostgreSQL accessible sur le réseau Docker `core_net` (service `postgres`)
- Traefik configuré avec `proxy_net` et résolveur `letsencrypt`
- Réseaux Docker existants : `proxy_net` et `core_net`

Pour vérifier que les réseaux existent :
```bash
docker network ls | grep -E "proxy_net|core_net"
```

Si absents :
```bash
docker network create proxy_net
docker network create core_net
```

---

## Étape 1 — Initialiser la base de données PostgreSQL

Se connecter au conteneur PostgreSQL et exécuter `init.sql` :

```bash
# Depuis l'hôte VPS
docker exec -i postgres psql -U postgres < init.sql
```

> **Mot de passe** : choisir un mot de passe fort pour `dashboard_user`. Mettre à jour `init.sql` avant d'exécuter.

Vérifier que la DB est créée :
```bash
docker exec -i postgres psql -U postgres -c "\l" | grep dashboard_media
```

---

## Étape 2 — Configurer les variables d'environnement

Copier le fichier exemple et remplir les valeurs :

```bash
cp .env.example .env
nano .env
```

Variables obligatoires :

| Variable | Valeur |
|---|---|
| `DATABASE_URL` | `postgresql://dashboard_user:MOT_DE_PASSE@postgres:5432/dashboard_media` |
| `NEXTAUTH_SECRET` | Générer avec `openssl rand -base64 32` |
| `NEXTAUTH_URL` | `https://dashboard.urban-hit.fr` |
| `AUTOMATION_API_KEY` | Clé secrète pour le webhook email→facture |
| `QONTO_CLIENT_ID` | ID OAuth Qonto |
| `QONTO_CLIENT_SECRET` | Secret OAuth Qonto |
| `QONTO_REDIRECT_URI` | `https://dashboard.urban-hit.fr/api/qonto/callback` |
| `OPENAI_API_KEY` | Clé OpenAI pour l'assistant IA |
| `RESEND_API_KEY` | Clé Resend pour les emails |

Générer `NEXTAUTH_SECRET` :
```bash
openssl rand -base64 32
```

---

## Étape 3 — Builder et démarrer l'application

```bash
# Builder l'image et démarrer
docker compose up -d --build
```

Au premier démarrage, l'`entrypoint.sh` exécute automatiquement `prisma db push` pour créer toutes les tables.

Suivre les logs :
```bash
docker compose logs -f dashboard-media
```

Vérifier que le schéma a bien été appliqué :
```bash
docker exec dashboard-media node_modules/.bin/prisma db pull
```

---

## Étape 4 — Créer le premier utilisateur

Une fois l'app démarrée, créer un utilisateur via l'API :

```bash
curl -X POST https://dashboard.urban-hit.fr/api/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "votre@email.com",
    "password": "votre_mot_de_passe",
    "firstName": "Prénom",
    "lastName": "Nom"
  }'
```

Puis se connecter sur `https://dashboard.urban-hit.fr/login`.

---

## Vérification post-déploiement

```bash
# Vérifier que le conteneur tourne
docker ps | grep dashboard-media

# Vérifier les logs
docker compose logs dashboard-media --tail=50

# Tester l'accès HTTPS
curl -I https://dashboard.urban-hit.fr

# Vérifier la connexion DB depuis le conteneur
docker exec dashboard-media node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.companies.count().then(n => { console.log('companies:', n); process.exit(0); });
"
```

---

## Mise à jour de l'application

```bash
# Depuis le répertoire du projet sur le VPS
git pull  # ou copier les nouveaux fichiers

# Rebuilder et redémarrer
docker compose up -d --build

# En cas de changement de schéma Prisma
docker exec dashboard-media node_modules/.bin/prisma db push --skip-generate
```

---

## Dépannage

### Le conteneur ne démarre pas
```bash
docker compose logs dashboard-media
```

### Erreur de connexion à PostgreSQL
- Vérifier que le service `postgres` est sur le réseau `core_net`
- Vérifier le `DATABASE_URL` dans `.env`
- Tester : `docker exec dashboard-media nc -zv postgres 5432`

### Erreur `NEXTAUTH_URL`
- Doit correspondre exactement au domaine configuré dans Traefik
- En dev : `http://localhost:3000`

### Certificat SSL non généré
- Vérifier que le port 443 est ouvert sur le VPS
- Vérifier les logs Traefik : `docker logs traefik`

### Prisma db push échoue
```bash
# Exécuter manuellement
docker exec -it dashboard-media node_modules/.bin/prisma db push --skip-generate
```
