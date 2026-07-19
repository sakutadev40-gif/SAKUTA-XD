# SAKUTA MD-BOT — Bot WhatsApp multi-commandes

Bot WhatsApp basé sur Baileys, préfixe `.`, avec menu par catégories,
commandes de gestion de groupe, et téléchargement YouTube/TikTok.

## 🚀 Installation

```bash
cd whatsapp-bot-md
npm install
```

## 📸🎵 Ajouter les médias du menu

- Photo : `media/images/menu.jpg`
- Audio : `media/audio/menu.mp3`

Renomme les fichiers exactement comme ci-dessus, ou change les chemins dans `config.js`.

## ▶️ Lancer le bot

```bash
npm start
```

Scanne le QR code affiché avec **WhatsApp > Appareils connectés > Connecter un appareil**.
La session est sauvegardée dans `auth_info/` (ne la partage jamais, ni ne la commit sur Git).

## ⚙️ Configuration

Tout se règle dans `config.js` :
- `PREFIX` — préfixe des commandes (`.` par défaut)
- `BOT_NAME` — nom affiché
- `OWNER_NUMBER` — ton numéro pour `.owner`

## 💬 Commandes

### 📋 Général
| Commande | Description |
|---|---|
| `.menu` | Menu complet (photo + audio + liste des commandes) |
| `.ping` | Teste la latence du bot |
| `.runtime` | Depuis quand le bot tourne |
| `.owner` | Contact du propriétaire |

### 👥 Groupe (admin uniquement sauf `.groupinfo`)
| Commande | Description |
|---|---|
| `.kick @membre` | Exclut un membre |
| `.add 243xxxxxxxxx` | Ajoute un membre |
| `.promote @membre` | Promeut admin |
| `.demote @membre` | Retire les droits admin |
| `.tagall [message]` | Mentionne tout le monde |
| `.groupinfo` | Infos du groupe |
| `.setdesc texte` | Change la description |
| `.close` | Ferme le groupe (admins seuls) |
| `.open` | Rouvre le groupe |

### ⬇️ Téléchargement
| Commande | Description |
|---|---|
| `.play nom de la chanson` | Télécharge l'audio depuis YouTube |
| `.video nom ou lien` | Télécharge une vidéo YouTube |
| `.yts mots-clés` | Recherche YouTube (sans télécharger) |
| `.tiktok lien` | Télécharge une vidéo TikTok sans filigrane |

## 📁 Structure du projet

```
whatsapp-bot-md/
├── index.js                       # Connexion Baileys + boucle des messages
├── config.js                      # Préfixe, nom du bot, chemins médias
├── commands/
│   ├── router.js                  # Parse le texte et exécute la commande
│   ├── registry.js                # Regroupe toutes les catégories (pour le .menu)
│   └── categories/
│       ├── general.js             # .menu, .ping, .runtime, .owner
│       ├── group.js               # .kick, .promote, .tagall, etc.
│       └── download.js            # .play, .video, .tiktok, .yts
├── lib/
│   └── downloader.js              # Logique YouTube/TikTok réutilisable
├── media/
│   ├── images/menu.jpg            # ← ta photo
│   └── audio/menu.mp3             # ← ton mp3
├── temp/                          # Fichiers téléchargés temporaires (auto-nettoyés)
├── auth_info/                     # Session WhatsApp (généré automatiquement)
└── package.json
```

## ➕ Ajouter une nouvelle commande

Ouvre le fichier de la catégorie concernée (`commands/categories/general.js`,
`group.js`, ou `download.js`) et ajoute un objet dans le tableau exporté :

```javascript
{
  name: 'macommande',
  aliases: ['mc'],              // optionnel
  description: 'Ce que ça fait', // apparaît automatiquement dans .menu
  execute: async (sock, msg, args, { from, sender, isGroup }) => {
    await sock.sendMessage(from, { text: 'Réponse ici' });
  },
},
```

Le `.menu` se met à jour tout seul, pas besoin de le toucher.

### Créer une nouvelle catégorie

1. Crée `commands/categories/maCategorie.js` avec le même format (tableau d'objets).
2. Dans `commands/registry.js`, importe-le et ajoute-le à `CATEGORIES` :

```javascript
const maCategorie = require('./categories/maCategorie');
const CATEGORIES = {
  // ...
  '🆕 Ma Catégorie': maCategorie,
};
```

## ⚠️ Notes importantes

- **Téléchargement** : `.play`/`.video` utilisent `@distube/ytdl-core`, qui peut casser
  si YouTube change son système anti-bot. Si ça échoue souvent, tiens la lib à jour :
  `npm update @distube/ytdl-core`.
- **TikTok** : `@tobyg74/tiktok-api-dl` dépend d'une API non-officielle qui peut aussi
  changer. Le code inclut une gestion d'erreur claire si le lien ne fonctionne pas.
- **Limites WhatsApp** : les vidéos volumineuses peuvent échouer à l'envoi. `.video`
  télécharge en qualité "highest" — si c'est trop lourd, adapte le filtre de qualité
  dans `lib/downloader.js`.
- **Sécurité groupe** : garde les commandes admin (`kick`, `promote`, etc.) réservées
  aux vrais admins — c'est déjà vérifié dans le code, ne retire pas ces checks.
- **`auth_info/`** est ta session WhatsApp connectée : quiconque y a accès contrôle
  ton compte. Ne la commit jamais, ne la partage jamais.
- N'utilise pas ce bot pour spammer ou automatiser des actions de masse non sollicitées
  (ajout en masse, kick en masse) — ça expose le numéro à un bannissement WhatsApp.
