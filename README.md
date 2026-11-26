# Kladriva Post

Le réseau social des apprenants Kladriva : fil d'avancées, likes, commentaires en temps réel, groupes et messagerie privée.

## Stack
- **Next.js 15** (App Router, TypeScript, Tailwind CSS 4)
- **Supabase** : Auth (e-mail), Postgres + Row Level Security, Realtime, Storage (bucket `media`)
- **Vercel** : hébergement, déploiement automatique à chaque push sur `main`

## Démarrer en local
```bash
cp .env.example .env.local   # renseigner l'URL et la clé anon Supabase
npm install
npm run dev
```

## Base de données
Tout le schéma (tables, règles de sécurité, temps réel, stockage) est dans `supabase/schema.sql`.
À exécuter une fois dans Supabase › SQL Editor.

## Structure
```
src/app/            pages : / (accueil), /auth, /feed, /groups, /groups/[id], /messages, /u/[username]
src/components/     AppShell, Feed, Composer, PostCard, AuthProvider, ui
src/lib/            client Supabase, types, utilitaires
supabase/schema.sql schéma complet de la base
```

## Sécurité
L'application parle directement à Supabase depuis le navigateur avec la clé publique `anon`.
Toutes les permissions sont appliquées côté base par les politiques RLS :
lecture publique du fil, écriture réservée à l'auteur, messages visibles uniquement par les membres de la conversation.
