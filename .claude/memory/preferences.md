# Preferences

## Language & Communication
- Speaks French, prefers responses in French
- Wants Claude to be **fully autonomous** — don't ask unnecessary questions, just do it
- Prefers short, direct instructions — no over-explaining
- Uses "tu" (informal)

## Coding Style
- TypeScript / Next.js App Router
- Prisma ORM
- Tailwind CSS
- Mobile-first UI
- French labels in UI

## Workflow
- Wants everything saved in memory so future sessions pick up instantly
- Prefers Claude to handle Git/deploy autonomously (commit, push, deploy)
- Wants to preview changes on localhost before deploying to prod

## Quick Start — Dashboard Media
Pour travailler sur l'appli, Amineur doit juste lancer :
```bash
cd ~/.gemini/antigravity/scratch/dashboard-media
./scripts/dev-local.sh
```
→ Ouvre http://localhost:3000 connecté à la base de prod.

Pour déployer, il suffit de demander à Claude : "déploie" ou "push en prod".
Claude s'occupe du commit, push GitHub, et le déploiement est automatique via GitHub Actions.

## Ce qu'il faut demander à Claude
- **"Lance le dev local"** → Claude rappelle la commande `./scripts/dev-local.sh`
- **"Déploie"** ou **"Push en prod"** → Claude commit + push + déploiement auto
- **"Corrige [problème]"** → Claude modifie le code, teste, et déploie
- **"Ajoute [feature]"** → Claude code, commit, push, déploie
- **"Montre-moi l'état du deploy"** → Claude vérifie GitHub Actions
