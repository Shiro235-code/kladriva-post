# Contrats de messagerie attendus par le client

Cette intégration n'applique aucune migration Supabase.

## Réponses

- `messages.reply_to_id` et `group_messages.reply_to_id` doivent être lisibles par les membres autorisés de la conversation ou du groupe.
- Si le message original est supprimé, conserver la référence sur les réponses (par exemple avec une suppression logique ou une ligne tombstone) permet au client d'afficher « message supprimé ou inaccessible ».
- Une contrainte `ON DELETE SET NULL` efface cette information et ne permet plus au client de distinguer une réponse d'un message normal. À vérifier avant d'adopter cette règle de suppression.
- Les sélections client contraignent toujours les messages cités à leur `conversation_id` ou `group_id`; RLS reste l'autorité pour décider s'ils sont visibles.

## Accusés de lecture

- `conversation_members.last_read_at` est consulté pour l'autre participant d'une conversation privée et ne confirme la lecture qu'après mise à jour côté serveur.
- Les nombres « Lu par » en groupe sont calculés uniquement depuis les `group_members.last_read_at` que les politiques RLS rendent visibles au membre connecté. Si ces valeurs ne sont pas accessibles, le client n'affiche pas de nombre.
- L'état optimiste local est seulement « en cours d'envoi ». Après l'insertion réussie, l'état devient « enregistré sur le serveur »; un accusé « lu » requiert un `last_read_at` serveur qui dépasse l'heure du message.
