# Messages vocaux

Le client enregistre avec `MediaRecorder`, choisit un MIME réellement annoncé par le navigateur et affiche un signal mesuré depuis le microphone. Les messages sont limités à 10 Mo et cinq minutes.

## Stockage privé

- Tous les fichiers vont dans le bucket privé `voice-messages`, avec `upsert: false`.
- Chemins : `dm/{conversation_id}/{sender_id}/{message_id}.{extension}` ou `group/{group_id}/{sender_id}/{message_id}.{extension}`.
- Le message reçoit le même UUID généré avant le transfert, `audio_path` et la durée décodée du Blob. `image_url` reste `null`.
- L’écoute utilise `Storage.download()` authentifié; les URL publiques ne sont jamais créées. Les erreurs de jeton déclenchent un renouvellement de session puis une nouvelle tentative.
- Après un échec d’insertion, le client vérifie d’abord si le message existe avant de supprimer le fichier. Les nettoyages échoués sont mis en file locale pour une prochaine ouverture de messagerie.

## Autorisations attendues côté backend

Vérifier les politiques RLS du bucket privé afin que seuls les membres de la conversation ou du groupe puissent lire le fichier et que seul le `sender_id` correspondant au compte connecté puisse téléverser ou supprimer un fichier sous son chemin. Les règles d’accès aux tables doivent également autoriser l’auteur à lire et insérer le message dans sa conversation ou son groupe. Ce commit ne modifie ni Storage, ni les tables, ni les politiques.

Le lecteur charge les données audio à la demande. Sa forme d’onde est calculée à partir du fichier décodé; si le navigateur ne peut pas le décoder, l’interface le signale et n’affiche pas de forme d’onde inventée.
