# Mentions utilisateurs

## Architecture

La migration `007_user_mentions.sql` ajoute quatre relations explicites par UUID :

- `post_mentions`
- `comment_mentions`
- `dm_message_mentions`
- `group_message_mentions`

Chaque relation conserve le pseudo exact utilisé et son UUID. Le pseudo est unique par contenu ; une modification réactive la ligne existante au lieu de la rattacher au propriétaire actuel du pseudo. Si le profil est supprimé, l'UUID devient nul et le texte reste visible sans lien.

Les relations des contenus supprimés sont supprimées en cascade. Les messages supprimés logiquement conservent leur historique d'alias pour empêcher une nouvelle notification, mais désactivent les mentions, retirent leurs notifications et n'exposent plus leurs relations au rendu.

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
- pas de notification répétée après édition, retrait puis réintroduction de la même mention ;
- maximum de cinq notifications de mention par paire auteur/destinataire sur dix minutes ;
- notification liée à la publication, au commentaire ou au message concerné.

Les lectures des mentions suivent les autorisations du contenu : les publications/commentaires de groupe et leurs mentions sont réservés aux membres, les messages privés aux participants de la conversation, et les messages de groupe aux membres actifs. Les insertions de relations sont exclusivement effectuées par les triggers SQL, sans privilège d'écriture client.

Les fonctions de synchronisation et de résolution sont réservées au propriétaire SQL et aux triggers. Seule la RPC `search_mentions` est exposée aux utilisateurs authentifiés ; les helpers de membership historiques restent exécutables car les politiques RLS existantes les invoquent.

## Déploiement

Appliquer uniquement après validation :

```sql
\i supabase/migrations/007_user_mentions.sql
```

Ne pas exécuter la migration automatiquement sur la base de production.
