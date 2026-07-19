const fs = require('fs');
const {
  searchYoutube,
  downloadYoutubeAudio,
  downloadYoutubeVideo,
  downloadTiktok,
  cleanup,
} = require('../../lib/downloader');

function isYoutubeUrl(str) {
  return /(?:youtube\.com|youtu\.be)/.test(str);
}

function isTiktokUrl(str) {
  return /tiktok\.com/.test(str);
}

module.exports = [
  {
    name: 'play',
    aliases: ['ytmp3', 'song'],
    description: 'Télécharge l\'audio d\'une chanson YouTube (.play nom de la chanson)',
    execute: async (sock, msg, args, { from }) => {
      const query = args.join(' ');
      if (!query) {
        return sock.sendMessage(from, { text: '⚠️ Donne un nom de chanson ou un lien. Ex: .play Alan Walker Faded' });
      }

      await sock.sendMessage(from, { text: '🔎 Recherche en cours...' });

      let url = query;
      let title = query;

      if (!isYoutubeUrl(query)) {
        const video = await searchYoutube(query);
        if (!video) {
          return sock.sendMessage(from, { text: '❌ Aucun résultat trouvé.' });
        }
        url = video.url;
        title = video.title;
      }

      await sock.sendMessage(from, { text: `⬇️ Téléchargement de *${title}*...` });

      let filePath;
      try {
        filePath = await downloadYoutubeAudio(url);
        await sock.sendMessage(from, {
          audio: fs.readFileSync(filePath),
          mimetype: 'audio/mp4',
          ptt: false,
          fileName: `${title}.mp3`,
        });
      } catch (err) {
        console.error('Erreur .play:', err);
        await sock.sendMessage(from, { text: '❌ Échec du téléchargement. La vidéo est peut-être trop longue ou protégée.' });
      } finally {
        if (filePath) cleanup(filePath);
      }
    },
  },

  {
    name: 'video',
    aliases: ['ytmp4', 'ytv'],
    description: 'Télécharge une vidéo YouTube (.video nom ou lien)',
    execute: async (sock, msg, args, { from }) => {
      const query = args.join(' ');
      if (!query) {
        return sock.sendMessage(from, { text: '⚠️ Donne un nom de vidéo ou un lien. Ex: .video tuto Baileys' });
      }

      await sock.sendMessage(from, { text: '🔎 Recherche en cours...' });

      let url = query;
      let title = query;

      if (!isYoutubeUrl(query)) {
        const video = await searchYoutube(query);
        if (!video) {
          return sock.sendMessage(from, { text: '❌ Aucun résultat trouvé.' });
        }
        url = video.url;
        title = video.title;
      }

      await sock.sendMessage(from, { text: `⬇️ Téléchargement de *${title}*... (peut prendre du temps selon la taille)` });

      let filePath;
      try {
        filePath = await downloadYoutubeVideo(url);
        await sock.sendMessage(from, {
          video: fs.readFileSync(filePath),
          caption: `🎬 ${title}`,
          fileName: `${title}.mp4`,
        });
      } catch (err) {
        console.error('Erreur .video:', err);
        await sock.sendMessage(from, { text: '❌ Échec du téléchargement. Vidéo trop lourde ou indisponible.' });
      } finally {
        if (filePath) cleanup(filePath);
      }
    },
  },

  {
    name: 'yts',
    aliases: ['ytsearch'],
    description: 'Recherche des vidéos YouTube sans les télécharger',
    execute: async (sock, msg, args, { from }) => {
      const query = args.join(' ');
      if (!query) {
        return sock.sendMessage(from, { text: '⚠️ Donne des mots-clés. Ex: .yts musique lofi' });
      }
      const { videos } = await require('yt-search')(query);
      if (!videos || videos.length === 0) {
        return sock.sendMessage(from, { text: '❌ Aucun résultat.' });
      }
      const top5 = videos.slice(0, 5);
      let text = `*🔎 Résultats pour "${query}"*\n\n`;
      top5.forEach((v, i) => {
        text += `${i + 1}. ${v.title}\n⏱️ ${v.timestamp} — ${v.url}\n\n`;
      });
      await sock.sendMessage(from, { text });
    },
  },

  {
    name: 'tiktok',
    aliases: ['tt', 'ttdl'],
    description: 'Télécharge une vidéo TikTok sans filigrane (.tiktok lien)',
    execute: async (sock, msg, args, { from }) => {
      const url = args[0];
      if (!url || !isTiktokUrl(url)) {
        return sock.sendMessage(from, { text: '⚠️ Donne un lien TikTok valide. Ex: .tiktok https://vt.tiktok.com/xxxxx' });
      }

      await sock.sendMessage(from, { text: '⬇️ Téléchargement de la vidéo TikTok...' });

      let filePath;
      try {
        const result = await downloadTiktok(url);
        filePath = result.filePath;
        await sock.sendMessage(from, {
          video: fs.readFileSync(filePath),
          caption: `🎵 ${result.meta?.description || 'Vidéo TikTok'}`,
        });
      } catch (err) {
        console.error('Erreur .tiktok:', err);
        await sock.sendMessage(from, { text: `❌ Échec du téléchargement : ${err.message}` });
      } finally {
        if (filePath) cleanup(filePath);
      }
    },
  },
];
