# Mentions utilisateurs

## Architecture

La migration `007_user_mentions.sql` ajoute quatre relations explicites par UUID :

- `post_mentions`
- `comment_mentions`
- `dm_message_mentions`
- `group_message_mentions`

Chaque relation est supprimée en cascade avec son contenu. Les index permettent de retrouver rapidement les mentions d'un utilisateur.

## Recherche

La fonction RPC `search_mentions(query, limit, group_id, conversation_id)` :

- recherche sur le pseudo et le nom complet ;
- limite les suggestions à huit résultats ;
- exclut l'auteur actuel ;
- limite les suggestions de groupe aux membres ;
- limite les suggestions privées aux participants de la conversation ;
- exige une session authentifiée.

## Notifications

Les triggers SQL synchronisent les relations après insertion ou modification du texte :

- déduplication entre plusieurs occurrences ;
- maximum initial de dix utilisateurs distincts ;
- aucune auto-mention ;
- absence de notification répétée si une mention reste présente lors d'une modification ;
- notification liée à la publication, au commentaire ou au message concerné.

Les mentions dans les conversations de groupe sont limitées aux membres du groupe. Les mentions dans les conversations privées sont limitées aux participants.

## Déploiement

Appliquer uniquement après validation :

```sql
\i supabase/migrations/007_user_mentions.sql
```

Ne pas exécuter la migration automatiquement sur la base de production.
