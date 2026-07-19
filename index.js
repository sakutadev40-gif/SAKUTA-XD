const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const path = require('path');
const fs = require('fs');

const { handleMessage } = require('./commands/router');
const config = require('./config');

const logger = pino({ level: 'silent' }); // mets 'info' pour voir les logs Baileys

// Crée le dossier temp s'il n'existe pas (utilisé par les téléchargements)
const tempDir = path.join(__dirname, config.TEMP_DIR);
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState(
    path.join(__dirname, 'auth_info')
  );
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger,
    printQRInTerminal: true,
    browser: [config.BOT_NAME, 'Chrome', '1.0.0'],
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === 'close') {
      const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      console.log('❌ Connexion fermée. Reconnexion :', shouldReconnect);

      if (shouldReconnect) {
        startBot();
      } else {
        console.log('🔒 Déconnecté (logout). Supprime auth_info/ et rescanne le QR.');
      }
    } else if (connection === 'open') {
      console.log(`✅ ${config.BOT_NAME} connecté à WhatsApp !`);
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    try {
      await handleMessage(sock, msg);
    } catch (err) {
      console.error('Erreur handleMessage:', err);
    }
  });

  return sock;
}

startBot().catch((err) => {
  console.error('Erreur au démarrage du bot:', err);
});
