#!/bin/bash
# Deploy script for dashboard-media
# Removes stale lock, commits all changes, pushes to GitHub

set -e

cd "$(dirname "$0")"

echo "=== Nettoyage du lock Git ==="
rm -f .git/index.lock

echo "=== Ajout de tous les fichiers ==="
git add -A

echo "=== Statut ==="
git status --short | head -20
TOTAL=$(git status --short | wc -l)
echo "... $TOTAL fichiers au total"

echo ""
echo "=== Commit ==="
git commit -m "feat: ajout dashboard Next.js + intégration Les Indés Corporate

- App Next.js complète (dashboard financier)
- API sync Les Indés Corporate (PDF parsing, import auto)
- Page Importations IndésCorporate (UI sync + corrections)
- Schema Prisma avec metadata JSON sur invoices
- Scripts utilitaires (scan catégories, test parsing)"

echo ""
echo "=== Push vers GitHub ==="
git push origin main

echo ""
echo "=== Déploiement terminé avec succès ==="
