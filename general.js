const fs = require('fs');
const path = require('path');
const config = require('../../config');
const { CATEGORIES } = require('../registry');

module.exports = [
  {
    name: 'menu',
    aliases: ['start', 'aide'],
    description: 'Affiche le menu complet du bot (photo + audio + liste des commandes)',
    execute: async (sock, msg, args, { from }) => {
      // On importe CATEGORIES ici dedans (lazy) pour éviter une dépendance circulaire
      const { CATEGORIES: CATS } = require('../registry');

      let menuText = `╭───「 *${config.BOT_NAME}* 」\n`;
      menuText += `│ Préfixe : *${config.PREFIX}*\n`;
      menuText += `╰────────────\n\n`;

      for (const catName of Object.keys(CATS)) {
        menuText += `*${catName}*\n`;
        for (const cmd of CATS[catName]) {
          menuText += `  ${config.PREFIX}${cmd.name} — ${cmd.description}\n`;
        }
        menuText += `\n`;
      }

      menuText += `_Envoie une commande précédée de "${config.PREFIX}"_`;

      const imagePath = path.join(process.cwd(), config.MENU_IMAGE);
      const audioPath = path.join(process.cwd(), config.MENU_AUDIO);

      // 1. Photo + texte du menu en caption
      if (fs.existsSync(imagePath)) {
        await sock.sendMessage(from, {
          image: fs.readFileSync(imagePath),
          caption: menuText,
        });
      } else {
        await sock.sendMessage(from, { text: menuText });
      }

      // 2. Audio juste après
      await new Promise((r) => setTimeout(r, 600));
      if (fs.existsSync(audioPath)) {
        await sock.sendMessage(from, {
          audio: fs.readFileSync(audioPath),
          mimetype: 'audio/mp4',
          ptt: false,
        });
      }
    },
  },

  {
    name: 'ping',
    aliases: [],
    description: 'Teste si le bot répond',
    execute: async (sock, msg, args, { from }) => {
      const start = Date.now();
      const sent = await sock.sendMessage(from, { text: '🏓 Ping...' });
      const latency = Date.now() - start;
      await sock.sendMessage(from, { text: `🏓 Pong ! (${latency}ms)` });
    },
  },

  {
    name: 'runtime',
    aliases: ['uptime'],
    description: "Temps depuis le démarrage du bot",
    execute: async (sock, msg, args, { from }) => {
      const uptime = process.uptime();
      const h = Math.floor(uptime / 3600);
      const m = Math.floor((uptime % 3600) / 60);
      const s = Math.floor(uptime % 60);
      await sock.sendMessage(from, { text: `⏱️ En ligne depuis : ${h}h ${m}m ${s}s` });
    },
  },

  {
    name: 'owner',
    aliases: ['dev'],
    description: 'Contact du propriétaire du bot',
    execute: async (sock, msg, args, { from }) => {
      await sock.sendMessage(from, {
        contacts: {
          displayName: 'Owner',
          contacts: [
            {
              vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:Owner\nTEL;type=CELL;waid=${config.OWNER_NUMBER}:+${config.OWNER_NUMBER}\nEND:VCARD`,
            },
          ],
        },
      });
    },
  },
];
