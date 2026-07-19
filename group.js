// Utilitaire : récupère le JID mentionné, celui en réponse (quoted), ou depuis un numéro passé en argument
function extractTargetJid(msg, args) {
  const mentioned =
    msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
  if (mentioned) return mentioned;

  const quotedParticipant =
    msg.message?.extendedTextMessage?.contextInfo?.participant;
  if (quotedParticipant) return quotedParticipant;

  if (args[0]) {
    const digits = args[0].replace(/[^0-9]/g, '');
    if (digits) return `${digits}@s.whatsapp.net`;
  }

  return null;
}

async function isSenderAdmin(sock, groupId, senderJid) {
  const metadata = await sock.groupMetadata(groupId);
  const participant = metadata.participants.find((p) => p.id === senderJid);
  return participant?.admin === 'admin' || participant?.admin === 'superadmin';
}

async function isBotAdmin(sock, groupId) {
  const metadata = await sock.groupMetadata(groupId);
  const botJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
  const participant = metadata.participants.find((p) =>
    p.id.startsWith(sock.user.id.split(':')[0])
  );
  return participant?.admin === 'admin' || participant?.admin === 'superadmin';
}

module.exports = [
  {
    name: 'kick',
    aliases: ['remove'],
    description: 'Exclut un membre (mention, réponse, ou numéro) — admin uniquement',
    execute: async (sock, msg, args, { from, sender, isGroup }) => {
      if (!isGroup) {
        return sock.sendMessage(from, { text: '❌ Commande utilisable seulement dans un groupe.' });
      }
      if (!(await isSenderAdmin(sock, from, sender))) {
        return sock.sendMessage(from, { text: '❌ Réservé aux admins du groupe.' });
      }
      if (!(await isBotAdmin(sock, from))) {
        return sock.sendMessage(from, { text: '❌ Je dois être admin pour faire ça.' });
      }

      const target = extractTargetJid(msg, args);
      if (!target) {
        return sock.sendMessage(from, {
          text: '⚠️ Mentionne, réponds au message de, ou donne le numéro de la personne à exclure.\nEx: .kick @personne',
        });
      }

      await sock.groupParticipantsUpdate(from, [target], 'remove');
      await sock.sendMessage(from, { text: '✅ Membre exclu.' });
    },
  },

  {
    name: 'add',
    aliases: [],
    description: 'Ajoute un membre par numéro — admin uniquement (.add 243xxxxxxxxx)',
    execute: async (sock, msg, args, { from, sender, isGroup }) => {
      if (!isGroup) {
        return sock.sendMessage(from, { text: '❌ Commande utilisable seulement dans un groupe.' });
      }
      if (!(await isSenderAdmin(sock, from, sender))) {
        return sock.sendMessage(from, { text: '❌ Réservé aux admins du groupe.' });
      }
      const number = args[0]?.replace(/[^0-9]/g, '');
      if (!number) {
        return sock.sendMessage(from, { text: '⚠️ Donne un numéro. Ex: .add 243812345678' });
      }
      await sock.groupParticipantsUpdate(from, [`${number}@s.whatsapp.net`], 'add');
      await sock.sendMessage(from, { text: '✅ Invitation envoyée.' });
    },
  },

  {
    name: 'promote',
    aliases: ['admin'],
    description: 'Promeut un membre admin — admin uniquement',
    execute: async (sock, msg, args, { from, sender, isGroup }) => {
      if (!isGroup) {
        return sock.sendMessage(from, { text: '❌ Commande utilisable seulement dans un groupe.' });
      }
      if (!(await isSenderAdmin(sock, from, sender))) {
        return sock.sendMessage(from, { text: '❌ Réservé aux admins du groupe.' });
      }
      const target = extractTargetJid(msg, args);
      if (!target) {
        return sock.sendMessage(from, { text: '⚠️ Mentionne ou réponds à la personne à promouvoir.' });
      }
      await sock.groupParticipantsUpdate(from, [target], 'promote');
      await sock.sendMessage(from, { text: '✅ Membre promu admin.' });
    },
  },

  {
    name: 'demote',
    aliases: [],
    description: 'Retire les droits admin d\'un membre — admin uniquement',
    execute: async (sock, msg, args, { from, sender, isGroup }) => {
      if (!isGroup) {
        return sock.sendMessage(from, { text: '❌ Commande utilisable seulement dans un groupe.' });
      }
      if (!(await isSenderAdmin(sock, from, sender))) {
        return sock.sendMessage(from, { text: '❌ Réservé aux admins du groupe.' });
      }
      const target = extractTargetJid(msg, args);
      if (!target) {
        return sock.sendMessage(from, { text: '⚠️ Mentionne ou réponds à la personne à rétrograder.' });
      }
      await sock.groupParticipantsUpdate(from, [target], 'demote');
      await sock.sendMessage(from, { text: '✅ Droits admin retirés.' });
    },
  },

  {
    name: 'tagall',
    aliases: ['everyone'],
    description: 'Mentionne tous les membres du groupe — admin uniquement',
    execute: async (sock, msg, args, { from, sender, isGroup }) => {
      if (!isGroup) {
        return sock.sendMessage(from, { text: '❌ Commande utilisable seulement dans un groupe.' });
      }
      if (!(await isSenderAdmin(sock, from, sender))) {
        return sock.sendMessage(from, { text: '❌ Réservé aux admins du groupe.' });
      }
      const metadata = await sock.groupMetadata(from);
      const participants = metadata.participants.map((p) => p.id);
      const text = args.length
        ? args.join(' ')
        : '📢 Attention à tous !';

      let mentionText = `${text}\n\n`;
      for (const p of participants) {
        mentionText += `@${p.split('@')[0]}\n`;
      }

      await sock.sendMessage(from, { text: mentionText, mentions: participants });
    },
  },

  {
    name: 'groupinfo',
    aliases: ['ginfo'],
    description: 'Affiche les infos du groupe',
    execute: async (sock, msg, args, { from, isGroup }) => {
      if (!isGroup) {
        return sock.sendMessage(from, { text: '❌ Commande utilisable seulement dans un groupe.' });
      }
      const metadata = await sock.groupMetadata(from);
      const text =
        `*📌 ${metadata.subject}*\n\n` +
        `👥 Membres : ${metadata.participants.length}\n` +
        `📝 Description : ${metadata.desc || 'Aucune'}\n` +
        `🆔 ID : ${metadata.id}`;
      await sock.sendMessage(from, { text });
    },
  },

  {
    name: 'setdesc',
    aliases: [],
    description: 'Change la description du groupe — admin uniquement (.setdesc texte)',
    execute: async (sock, msg, args, { from, sender, isGroup }) => {
      if (!isGroup) {
        return sock.sendMessage(from, { text: '❌ Commande utilisable seulement dans un groupe.' });
      }
      if (!(await isSenderAdmin(sock, from, sender))) {
        return sock.sendMessage(from, { text: '❌ Réservé aux admins du groupe.' });
      }
      const desc = args.join(' ');
      if (!desc) {
        return sock.sendMessage(from, { text: '⚠️ Donne le nouveau texte. Ex: .setdesc Bienvenue !' });
      }
      await sock.groupUpdateDescription(from, desc);
      await sock.sendMessage(from, { text: '✅ Description mise à jour.' });
    },
  },

  {
    name: 'close',
    aliases: ['lock'],
    description: 'Seuls les admins peuvent écrire — admin uniquement',
    execute: async (sock, msg, args, { from, sender, isGroup }) => {
      if (!isGroup) {
        return sock.sendMessage(from, { text: '❌ Commande utilisable seulement dans un groupe.' });
      }
      if (!(await isSenderAdmin(sock, from, sender))) {
        return sock.sendMessage(from, { text: '❌ Réservé aux admins du groupe.' });
      }
      await sock.groupSettingUpdate(from, 'announcement');
      await sock.sendMessage(from, { text: '🔒 Groupe fermé (admins seulement).' });
    },
  },

  {
    name: 'open',
    aliases: ['unlock'],
    description: 'Tout le monde peut écrire — admin uniquement',
    execute: async (sock, msg, args, { from, sender, isGroup }) => {
      if (!isGroup) {
        return sock.sendMessage(from, { text: '❌ Commande utilisable seulement dans un groupe.' });
      }
      if (!(await isSenderAdmin(sock, from, sender))) {
        return sock.sendMessage(from, { text: '❌ Réservé aux admins du groupe.' });
      }
      await sock.groupSettingUpdate(from, 'not_announcement');
      await sock.sendMessage(from, { text: '🔓 Groupe ouvert (tout le monde peut écrire).' });
    },
  },
];
