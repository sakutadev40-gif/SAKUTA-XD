const fs = require('fs');
const path = require('path');
const axios = require('axios');
const ytdl = require('@distube/ytdl-core');
const yts = require('yt-search');
const Tiktok = require('@tobyg74/tiktok-api-dl');
const config = require('../config');

function tempFile(ext) {
  const name = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
  return path.join(process.cwd(), config.TEMP_DIR, name);
}

function cleanup(filePath) {
  fs.promises.unlink(filePath).catch(() => {});
}

/** Recherche YouTube par mots-clés, retourne la 1re vidéo trouvée */
async function searchYoutube(query) {
  const { videos } = await yts(query);
  if (!videos || videos.length === 0) return null;
  return videos[0]; // { title, url, duration, thumbnail, timestamp, views, ... }
}

/** Télécharge l'audio d'une vidéo YouTube en mp3 (via stream, pas de conversion — on prend le format audio direct) */
async function downloadYoutubeAudio(url) {
  const filePath = tempFile('mp3');
  return new Promise((resolve, reject) => {
    const stream = ytdl(url, { filter: 'audioonly', quality: 'highestaudio' });
    const writeStream = fs.createWriteStream(filePath);
    stream.pipe(writeStream);
    stream.on('error', reject);
    writeStream.on('error', reject);
    writeStream.on('finish', () => resolve(filePath));
  });
}

/** Télécharge une vidéo YouTube (qualité raisonnable pour rester sous les limites WhatsApp) */
async function downloadYoutubeVideo(url) {
  const filePath = tempFile('mp4');
  return new Promise((resolve, reject) => {
    const stream = ytdl(url, {
      filter: (format) => format.container === 'mp4' && format.hasAudio && format.hasVideo,
      quality: 'highest',
    });
    const writeStream = fs.createWriteStream(filePath);
    stream.pipe(writeStream);
    stream.on('error', reject);
    writeStream.on('error', reject);
    writeStream.on('finish', () => resolve(filePath));
  });
}

/** Télécharge une vidéo TikTok (sans watermark si possible) */
async function downloadTiktok(url) {
  const result = await Tiktok.Downloader(url, { version: 'v3' });

  if (result.status !== 'success' || !result.result) {
    throw new Error(result.message || 'Impossible de récupérer la vidéo TikTok.');
  }

  // Selon la version de l'API, le lien vidéo peut être dans différents champs
  const videoUrl =
    result.result.video?.[0] ||
    result.result.video ||
    result.result.videoHD ||
    result.result?.videoSD;

  if (!videoUrl) {
    throw new Error('Aucun lien vidéo trouvé dans la réponse TikTok.');
  }

  const response = await axios.get(videoUrl, { responseType: 'arraybuffer' });
  const filePath = tempFile('mp4');
  await fs.promises.writeFile(filePath, response.data);

  return { filePath, meta: result.result };
}

module.exports = {
  searchYoutube,
  downloadYoutubeAudio,
  downloadYoutubeVideo,
  downloadTiktok,
  cleanup,
};
