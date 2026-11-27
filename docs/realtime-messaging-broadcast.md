# Besoins backend — saisie en cours

Le client utilise les sujets Realtime privés suivants pour les événements `typing` :

- `dm-typing:<conversation_id>` pour une conversation privée.
- `group-typing:<group_id>` pour une discussion de groupe.

Les canaux sont ouverts avec `config.private: true`. Le navigateur ne bascule jamais sur un sujet public si l’autorisation échoue. Le client vérifie également l’appartenance à la conversation ou au groupe avant de rejoindre le sujet.

## Autorisations Realtime nécessaires

Vérifier les politiques RLS de `realtime.messages` pour les utilisateurs authentifiés :

- `SELECT` sur l’extension `broadcast` seulement si `auth.uid()` est membre du groupe ou participant de la conversation identifiée par le sujet `realtime.topic()`.
- `INSERT` sur l’extension `broadcast` avec la même vérification d’appartenance, pour autoriser l’envoi des événements de saisie.
- Rejeter les sujets mal formés, les utilisateurs anonymes et les non-membres.

Les politiques doivent vérifier `group_members` pour le sujet de groupe et `conversation_members` pour le sujet privé. La règle ne doit pas être une autorisation générale sur tous les sujets. Aucun changement de politique ou migration n’est appliqué par ce commit.

Si ces politiques ne sont pas présentes, l’indicateur de saisie affiche son état indisponible et l’envoi des messages, Postgres Changes existants et les autres fonctions de messagerie restent indépendants de Broadcast.

La documentation Supabase indique que les canaux doivent être privés et que l’écoute (`SELECT`) ainsi que l’envoi (`INSERT`) Broadcast sont autorisés par les politiques RLS de `realtime.messages` : [Realtime Authorization](https://supabase.com/docs/guides/realtime/authorization).
