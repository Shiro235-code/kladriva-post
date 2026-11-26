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
- `supabase/schema.sql` : schéma de base (V1).
- `supabase/migrations/002_v2.sql` : réactions, réponses, mentions, abonnements, enregistrements, stories, notifications, séries et classement.
- `supabase/migrations/003_read_receipts.sql` : accusés de lecture en temps réel.
- `supabase/migrations/004_video_icons.sql` : vidéos dans les publications, icônes de groupe, limites du stockage (50 Mo).

Ces scripts sont **déjà appliqués** sur le projet Supabase `kladriva-post`. Pour une nouvelle base, exécute-les dans cet ordre dans Supabase › SQL Editor.

## Fonctionnalités
Fil « Pour toi » et « Abonnements », types de publication (avancée, victoire, je bloque, ressource, projet), jusqu'à 4 images ou une vidéo (50 Mo) par post, lecture automatique en muet,
6 réactions, commentaires avec réponses et j'aime, @mentions et #hashtags, partage et enregistrement, stories de 24 h, notifications en temps réel,
messagerie privée (en ligne, « écrit… », « Vu »), groupes avec icône et couleur, profils avec série de jours, badges et carte d'activité,
classement hebdomadaire et mensuel, recherche Ctrl + K, mode sombre, application installable (PWA).

## Structure
```
src/app/            pages : / (accueil), /auth, /feed, /explorer, /p/[id], /groups, /groups/[id], /messages, /notifications, /classement, /enregistres, /u/[username]
src/components/     AppShell, Providers (thème, toasts, activité), Feed, Composer, PostCard, Comments, Stories, CommandPalette, FollowButton, ui
src/lib/            client Supabase, types, utilitaires
supabase/schema.sql schéma complet de la base
```

## Sécurité
L'application parle directement à Supabase depuis le navigateur avec la clé publique `anon`.
Toutes les permissions sont appliquées côté base par les politiques RLS :
lecture publique du fil, écriture réservée à l'auteur, messages visibles uniquement par les membres de la conversation.
