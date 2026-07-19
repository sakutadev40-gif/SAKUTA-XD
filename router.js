const config = require('../config');
const { COMMAND_INDEX } = require('./registry');

function getMessageText(msg) {
  const m = msg.message;
  if (!m) return '';
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    ''
  ).trim();
}

async function handleMessage(sock, msg) {
  const from = msg.key.remoteJid;
  const isGroup = from.endsWith('@g.us');
  const sender = isGroup ? msg.key.participant : from;

  const text = getMessageText(msg);
  if (!text.startsWith(config.PREFIX)) return;

  const withoutPrefix = text.slice(config.PREFIX.length).trim();
  const [rawCommand, ...args] = withoutPrefix.split(/\s+/);
  const commandName = rawCommand.toLowerCase();

  const command = COMMAND_INDEX.get(commandName);
  if (!command) return; // commande inconnue -> on ignore silencieusement

  const context = { from, sender, isGroup };

  try {
    await command.execute(sock, msg, args, context);
  } catch (err) {
    console.error(`Erreur dans la commande "${commandName}":`, err);
    await sock.sendMessage(from, {
      text: `❌ Une erreur est survenue en exécutant .${commandName}.`,
    });
  }
}

module.exports = { handleMessage };
