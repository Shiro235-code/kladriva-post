# Notifications de messagerie

Les notifications `message` et `group_message` sont lues depuis la table `notifications` existante ; le frontend n'en crée aucune. Le flux Realtime est filtré par `user_id` et respecte les politiques Supabase existantes. Les états `read` restent persistés dans Postgres, afin que le compteur et les notifications lues se mettent à jour sur les autres appareils.

Le son est désactivé par défaut et peut être activé depuis la page Notifications. Cette préférence est locale à l'appareil. Les bannières n'affichent pas le contenu privé du message et sont supprimées lorsque la conversation correspondante est déjà ouverte au premier plan.

`public/sw.js` est enregistré pour préparer le traitement futur des événements Push et leur clic. Aucun abonnement `PushManager`, endpoint d'envoi, clé VAPID ou livraison push n'est configuré ici ; les notifications Web Push ne sont donc pas activées.
