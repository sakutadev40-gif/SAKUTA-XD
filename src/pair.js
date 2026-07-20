
// =============================================
// FILE: src/pair.js
// DESCRIPTION: WhatsApp pairing and command handling
// =============================================

const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const { exec } = require('child_process');
const router = express.Router();
const pino = require('pino');
const cheerio = require('cheerio');
const { Octokit } = require('@octokit/rest');
const moment = require('moment-timezone');
const Jimp = require('jimp');
const crypto = require('crypto');
const axios = require('axios');
const FormData = require("form-data");
const os = require('os');
const ddownr = require('denethdev-ytmp3');
const yts = require('yt-search');

// =============================================
// DATABASE - MONGODB
// =============================================
const { MongoClient } = require('mongodb');
const { v4: uuidv4 } = require('uuid');

const mongoUri = process.env.MONGODB_URI || 'mongodb+srv://Podda:99999978666@cluster0.8acda54.mongodb.net/';
const client = new MongoClient(mongoUri);
let db;

async function initMongo() {
    if (!db) {
        await client.connect();
        db = client.db('diana_bot');
        await db.collection('sessions').createIndex({ number: 1 });
        console.log('✅ MongoDB Connected');
    }
    return db;
}

// =============================================
// IMPORTS
// =============================================
const { sms, downloadMediaMessage } = require("./msg");
const { emojis } = require('./autoreact');
const { initUserEnvIfMissing } = require('./settingsdb');
const { initEnvsettings, getSetting } = require('./settings');

const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    getContentType,
    makeCacheableSignalKeyStore,
    Browsers,
    jidNormalizedUser,
    downloadContentFromMessage,
    proto
} = require('@whiskeysockets/baileys');

// =============================================
// CONFIGURATION
// =============================================
const config = {
    AUTO_VIEW_STATUS: 'true',
    AUTO_LIKE_STATUS: 'true',
    AUTO_RECORDING: 'true',
    AUTO_LIKE_EMOJI: ['🥰', '💌', '💕', '💗', '🌹', '😇', '☺️', '😊', '😍', '❣️'],
    PREFIX: '.',
    MAX_RETRIES: 3,
    IMAGE_PATH: 'https://url.bmbxmd.workers.dev/OLDIYL.jpg',
    GROUP_INVITE_LINK: '',
    ADMIN_LIST_PATH: './src/admin.json',
    RCD_IMAGE_PATH: 'https://url.bmbxmd.workers.dev/OLDIYL.jpg',
    NEWSLETTER_JID: '120363336396621021@newsletter',
    NEWSLETTER_MESSAGE_ID: '428',
    OTP_EXPIRY: 300000,
    version: '2.0.0',
    OWNER_NUMBER: '18099065877',
    BOT_FOOTER: '🤖 DIANA MINI BOT 🤖',
    CHANNEL_LINK: 'https://whatsapp.com/channel/0029VajohKp5a2498c8Dbl2Y'
};

// =============================================
// CONSTANTS
// =============================================
const activeSockets = new Map();
const socketCreationTime = new Map();
const SESSION_BASE_PATH = './session';
const NUMBER_LIST_PATH = './src/numbers.json';

// =============================================
// UTILITY FUNCTIONS
// =============================================
function loadAdmins() {
    try {
        if (fs.existsSync(config.ADMIN_LIST_PATH)) {
            return JSON.parse(fs.readFileSync(config.ADMIN_LIST_PATH, 'utf8'));
        }
        return [];
    } catch (error) {
        console.error('Failed to load admin list:', error);
        return [];
    }
}

function formatMessage(title, content, footer) {
    return `*${title}*\n\n${content}\n\n> *${footer}*`;
}

function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

function getSriLankaTimestamp() {
    return moment().tz('Africa/Nairobi').format('YYYY-MM-DD HH:mm:ss');
}

function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// =============================================
// FAKE VCARD FOR QUOTING
// =============================================
const fakevCard = {
    key: {
        remoteJid: "status@broadcast",
        participant: "0@s.whatsapp.net",
        fromMe: false,
        id: "META_AI_FAKE_ID_001"
    },
    message: {
        contactMessage: {
            displayName: "DIANA TECH",
            vcard: `BEGIN:VCARD
VERSION:3.0
N:DIANA TECH;;;;
FN:DIANA TECH
ORG:DIANA MINI BOT
TEL;type=CELL;type=VOICE;waid=18099065877:+18099065877
END:VCARD`
        }
    }
};

// =============================================
// COMMAND HANDLER
// =============================================
async function setupCommandHandlers(socket, number) {
    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    const autoReact = getSetting('AUTO_REACT') || 'on';

    socket.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.remoteJid === 'status@broadcast' || msg.key.remoteJid === config.NEWSLETTER_JID) return;

        const type = getContentType(msg.message);
        if (!msg.message) return;
        msg.message = (getContentType(msg.message) === 'ephemeralMessage') ? msg.message.ephemeralMessage.message : msg.message;
        const m = sms(socket, msg);
        const body = (type === 'conversation') ? msg.message.conversation
            : msg.message?.extendedTextMessage?.contextInfo?.hasOwnProperty('quotedMessage')
                ? msg.message.extendedTextMessage.text
                : (type == 'interactiveResponseMessage')
                    ? msg.message.interactiveResponseMessage?.nativeFlowResponseMessage
                        && JSON.parse(msg.message.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson)?.id
                    : (type == 'templateButtonReplyMessage')
                        ? msg.message.templateButtonReplyMessage?.selectedId
                        : (type === 'extendedTextMessage')
                            ? msg.message.extendedTextMessage.text
                            : (type == 'imageMessage') && msg.message.imageMessage.caption
                                ? msg.message.imageMessage.caption
                                : (type == 'videoMessage') && msg.message.videoMessage.caption
                                    ? msg.message.videoMessage.caption
                                    : (type == 'buttonsResponseMessage')
                                        ? msg.message.buttonsResponseMessage?.selectedButtonId
                                        : (type == 'listResponseMessage')
                                            ? msg.message.listResponseMessage?.singleSelectReply?.selectedRowId
                                            : (type === 'viewOnceMessage')
                                                ? msg.message[type]?.message[getContentType(msg.message[type].message)]
                                                : (type === "viewOnceMessageV2")
                                                    ? (msg.message[type]?.message?.imageMessage?.caption || msg.message[type]?.message?.videoMessage?.caption || "")
                                                    : '';

        let sender = msg.key.remoteJid;
        const nowsender = msg.key.fromMe ? (socket.user.id.split(':')[0] + '@s.whatsapp.net' || socket.user.id) : (msg.key.participant || msg.key.remoteJid);
        const senderNumber = nowsender.split('@')[0];
        const developers = `${config.OWNER_NUMBER}`;
        const botNumber = socket.user.id.split(':')[0];
        const isbot = botNumber.includes(senderNumber);
        const isOwner = isbot ? isbot : developers.includes(senderNumber);
        var prefix = config.PREFIX;
        var isCmd = body.startsWith(prefix);
        const from = msg.key.remoteJid;
        const isGroup = from.endsWith("@g.us");
        const command = isCmd ? body.slice(prefix.length).trim().split(' ').shift().toLowerCase() : '';
        var args = body.trim().split(/ +/).slice(1);

        // Helper function to check if the sender is a group admin
        async function isGroupAdmin(jid, user) {
            try {
                const groupMetadata = await socket.groupMetadata(jid);
                const participant = groupMetadata.participants.find(p => p.id === user);
                return participant?.admin === 'admin' || participant?.admin === 'superadmin' || false;
            } catch (error) {
                console.error('Error checking group admin status:', error);
                return false;
            }
        }

        const isSenderGroupAdmin = isGroup ? await isGroupAdmin(from, nowsender) : false;

        // =============================================
        // COMMAND: .alive
        // =============================================
        if (command === 'alive') {
            try {
                const startTime = socketCreationTime.get(sanitizedNumber) || Date.now();
                const uptime = Math.floor((Date.now() - startTime) / 1000);
                const hours = Math.floor(uptime / 3600);
                const minutes = Math.floor((uptime % 3600) / 60);
                const seconds = Math.floor(uptime % 60);

                const usedMemory = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
                const totalMemory = Math.round(os.totalmem() / 1024 / 1024);

                const captionText = `
*╭━━━〔 🤖 DIANA MINI BOT 〕━━━⬣*
*┃ 👤 USER :* @${m.sender.split("@")[0]}
*┃ 👑 OWNER :* DIANA TECH
*┃ ⚡ VERSION :* ${config.version}
*┃ 🔖 PREFIX :* ${config.PREFIX}
*┃ ⏰ UPTIME :* ${hours}h ${minutes}m ${seconds}s
*┃ 💾 MEMORY :* ${usedMemory}MB / ${totalMemory}MB
*╰━━━━━━━━━━━━━━━━━━⬣*

> *Fast • Stable • Powerful WhatsApp Bot* 🚀`;

                await socket.sendMessage(from, {
                    image: { url: config.IMAGE_PATH },
                    caption: captionText,
                    contextInfo: {
                        mentionedJid: [m.sender],
                        forwardingScore: 999,
                        isForwarded: true,
                        forwardedNewsletterMessageInfo: {
                            newsletterJid: config.NEWSLETTER_JID,
                            newsletterName: "DIANA MINI BOT",
                            serverMessageId: -1
                        }
                    }
                }, { quoted: fakevCard });

            } catch (error) {
                console.error("Alive command error:", error);
                await socket.sendMessage(from, {
                    text: "❌ Failed to retrieve bot info."
                }, { quoted: fakevCard });
            }
        }

        // =============================================
        // COMMAND: .menu
        // =============================================
        else if (command === 'menu') {
            try {
                await socket.sendMessage(sender, {
                    react: { text: '🤖', key: msg.key }
                });

                const startTime = socketCreationTime.get(sanitizedNumber) || Date.now();
                const uptime = Math.floor((Date.now() - startTime) / 1000);
                const hours = Math.floor(uptime / 3600);
                const minutes = Math.floor((uptime % 3600) / 60);
                const seconds = Math.floor(uptime % 60);

                const menuText = `
╭─────────────────❍
│ 👤 USER      : @${m.sender.split("@")[0]}
│ ⚙️ PREFIX    : ${config.PREFIX}
│ ⏳ UPTIME    : ${hours}h ${minutes}m ${seconds}s
╰───────────────────❍

『 📜 BOT WHATSAPP MENU 』

*Select a category below:*
`;

                const menuMessage = {
                    image: { url: config.IMAGE_PATH },
                    caption: `*DIANA MINI BOT*\n${menuText}`,
                    contextInfo: {
                        forwardingScore: 1,
                        isForwarded: true,
                        forwardedNewsletterMessageInfo: {
                            newsletterJid: config.NEWSLETTER_JID,
                            newsletterName: "DIANA MINI BOT",
                            serverMessageId: -1
                        }
                    },
                    buttons: [
                        {
                            buttonId: `${config.PREFIX}downloadmenu`,
                            buttonText: { displayText: "📥 DOWNLOAD" },
                            type: 1
                        },
                        {
                            buttonId: `${config.PREFIX}groupmenu`,
                            buttonText: { displayText: "👥 GROUP" },
                            type: 1
                        },
                        {
                            buttonId: `${config.PREFIX}funmenu`,
                            buttonText: { displayText: "🎭 FUN" },
                            type: 1
                        },
                        {
                            buttonId: `${config.PREFIX}toolsmenu`,
                            buttonText: { displayText: "🛠️ TOOLS" },
                            type: 1
                        }
                    ]
                };

                await socket.sendMessage(from, menuMessage, { quoted: fakevCard });

            } catch (error) {
                console.error("Menu command error:", error);
                await socket.sendMessage(sender, {
                    text: "❌ Error loading menu"
                }, { quoted: fakevCard });
            }
        }

        // =============================================
        // COMMAND: .ping
        // =============================================
        else if (command === 'ping') {
            try {
                const startTime = Date.now();
                await socket.sendMessage(sender, { text: '🏓 Pinging...' }, { quoted: msg });
                const endTime = Date.now();
                const latency = endTime - startTime;

                let quality = latency < 100 ? '🟢 Excellent' : latency < 300 ? '🟡 Good' : latency < 600 ? '🟠 Fair' : '🔴 Poor';

                await socket.sendMessage(sender, {
                    text: `╭───────────────⭓\n│\n│ 🏓 *PING RESULTS*\n│\n│ ⚡ SPEED: ${latency}ms\n│ ${quality}\n│ 🕒 TIME: ${new Date().toLocaleString()}\n│\n╰───────────────⭓\n> DIANA TECH`
                }, { quoted: fakevCard });
            } catch (error) {
                console.error('Ping command error:', error);
                await socket.sendMessage(sender, {
                    text: "❌ Error calculating ping"
                }, { quoted: fakevCard });
            }
        }

        // =============================================
        // COMMAND: .owner
        // =============================================
        else if (command === 'owner') {
            const ownerNumber = '18099065877';
            const ownerName = 'DIANA TECH';
            const organization = 'DIANA MINI BOT';

            const vcard =
                'BEGIN:VCARD\n' +
                'VERSION:3.0\n' +
                `FN:${ownerName}\n` +
                `ORG:${organization};\n` +
                `TEL;type=CELL;type=VOICE;waid=${ownerNumber.replace('+', '')}:${ownerNumber}\n` +
                'END:VCARD';

            try {
                await socket.sendMessage(from, {
                    contacts: {
                        displayName: ownerName,
                        contacts: [{ vcard }]
                    }
                });

                await socket.sendMessage(from, {
                    text: `*👑 DEVELOPER 👑*\n\n💚 NAME: ${ownerName}\n💜 NUMBER: ${ownerNumber}\n\n> *👑 DIANA MINI WHATSAPP BOT 👑*`
                }, { quoted: fakevCard });

            } catch (err) {
                console.error('❌ Owner command error:', err.message);
                await socket.sendMessage(from, {
                    text: '❌ Error sending owner contact.'
                }, { quoted: fakevCard });
            }
        }

        // =============================================
        // COMMAND: .pair
        // =============================================
        else if (command === 'pair') {
            const q = body.replace(/^[.\/!]pair\s*/i, '').trim();
            if (!q) {
                return await socket.sendMessage(sender, {
                    text: '*Usage:* .pair +18099065877'
                }, { quoted: msg });
            }

            try {
                const url = `${process.env.BASE_URL || 'https://diana-mini-bot-free-production.up.railway.app'}/code?number=${encodeURIComponent(q)}`;
                const response = await fetch(url);
                const result = await response.json();

                if (!result || !result.code) {
                    return await socket.sendMessage(sender, {
                        text: '❌ Failed to retrieve pairing code.'
                    }, { quoted: msg });
                }

                await socket.sendMessage(sender, {
                    text: `> *DIANA MINI BOT PAIR COMPLETED* ✅\n\n*🔑 YOUR PAIRING CODE IS:* ${result.code}`
                }, { quoted: msg });

                await delay(2000);
                await socket.sendMessage(sender, {
                    text: `${result.code}`
                }, { quoted: fakevCard });

            } catch (err) {
                console.error("❌ Pair Command Error:", err);
                await socket.sendMessage(sender, {
                    text: '❌ Error generating pair code.'
                }, { quoted: fakevCard });
            }
        }

        // =============================================
        // COMMAND: .song / .play
        // =============================================
        else if (command === 'song' || command === 'play') {
            const q = body.replace(/^[.\/!](song|play)\s*/i, '').trim();
            if (!q) {
                return await socket.sendMessage(sender, {
                    text: '*Usage:* .song <song title or YouTube link>'
                }, { quoted: fakevCard });
            }

            try {
                await socket.sendMessage(sender, { react: { text: '🎵', key: msg.key } });

                const search = await yts(q);
                const videoInfo = search.videos[0];
                if (!videoInfo) {
                    return await socket.sendMessage(sender, {
                        text: '❌ No songs found!'
                    }, { quoted: fakevCard });
                }

                const formattedDuration = Math.floor(videoInfo.seconds / 60) + ':' + String(Math.floor(videoInfo.seconds % 60)).padStart(2, '0');
                const desc = `
╭─「 🎀 *MINI MUSIC* 🎀 」
├📝 TITLE: ${videoInfo.title}
├👤 ARTIST: ${videoInfo.author.name}
├⏱️ DURATION: ${formattedDuration}
├📅 UPLOADED: ${videoInfo.ago}
├👁️ VIEWS: ${videoInfo.views.toLocaleString()}
╰────────•••───────┈ ⊷
`;

                await socket.sendMessage(sender, {
                    image: { url: videoInfo.thumbnail },
                    caption: desc
                }, { quoted: fakevCard });

                const result = await ddownr.download(videoInfo.url, 'mp3');
                const downloadLink = result.downloadUrl;

                const response = await fetch(downloadLink);
                const audioBuffer = await response.arrayBuffer();

                await socket.sendMessage(sender, {
                    audio: Buffer.from(audioBuffer),
                    mimetype: "audio/mpeg",
                    fileName: `${videoInfo.title}.mp3`,
                    ptt: false
                }, { quoted: fakevCard });

            } catch (err) {
                console.error('Song command error:', err);
                await socket.sendMessage(sender, {
                    text: "❌ Failed to download song."
                }, { quoted: fakevCard });
            }
        }

        // =============================================
        // COMMAND: .tiktok
        // =============================================
        else if (command === 'tiktok') {
            const q = body.replace(/^[.\/!]tiktok\s*/i, '').trim();
            if (!q) {
                return await socket.sendMessage(sender, {
                    text: '*Usage:* .tiktok <TikTok URL>'
                }, { quoted: fakevCard });
            }

            try {
                await socket.sendMessage(sender, { react: { text: '⏳', key: msg.key } });

                const response = await axios.get(`https://api.nexoracle.com/downloader/tiktok-nowm?apikey=free_key@maher_apis&url=${encodeURIComponent(q)}`);
                const data = response.data.result;

                if (!data || !data.url) {
                    return await socket.sendMessage(sender, {
                        text: '❌ TikTok video not found.'
                    }, { quoted: fakevCard });
                }

                const caption = `
*╭─「 TIKTOK VIDEO 」*
*│*  📝 TITLE: ${data.title || 'No title'}
*│*  👤 AUTHOR: @${data.author?.username || 'Unknown'}
*│*  ❤️ LIKES: ${data.metrics?.digg_count?.toLocaleString() || 0}
*│*  💬 COMMENTS: ${data.metrics?.comment_count?.toLocaleString() || 0}
*╰─────────•••────────⊷*
`;

                await socket.sendMessage(sender, {
                    image: { url: data.thumbnail || config.IMAGE_PATH },
                    caption: caption
                }, { quoted: fakevCard });

                const videoResponse = await axios.get(data.url, { responseType: 'arraybuffer' });
                await socket.sendMessage(sender, {
                    video: Buffer.from(videoResponse.data),
                    mimetype: 'video/mp4',
                    caption: `🎥 Video by @${data.author?.username || 'Unknown'}`
                }, { quoted: fakevCard });

                await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

            } catch (error) {
                console.error('TikTok command error:', error);
                await socket.sendMessage(sender, {
                    text: '❌ Failed to download TikTok video.'
                }, { quoted: fakevCard });
            }
        }

        // =============================================
        // COMMAND: .repo
        // =============================================
        else if (command === 'repo') {
            try {
                await socket.sendMessage(sender, { react: { text: '🪄', key: msg.key } });

                const githubRepoURL = 'https://github.com/QUEEN-DIANA/QUEEN-LORA';
                const [, username, repo] = githubRepoURL.match(/github\.com\/([^/]+)\/([^/]+)/);
                const response = await fetch(`https://api.github.com/repos/${username}/${repo}`);
                const repoData = await response.json();

                const formattedInfo = `
*╭─────────────────⊷*
*┃* *NAME*   : ${repoData.name}
*┃* *STARS*    : ${repoData.stargazers_count}
*┃* *FORKS*    : ${repoData.forks_count}
*┃* *OWNER*   : DIANA TECH
*┃* *DESC* : ${repoData.description || 'N/A'}
*╰──────────────────⊷*
`;

                await socket.sendMessage(sender, {
                    image: { url: config.IMAGE_PATH },
                    caption: formattedInfo
                }, { quoted: fakevCard });

            } catch (error) {
                console.error("❌ Error in repo command:", error);
                await socket.sendMessage(sender, {
                    text: "⚠️ Failed to fetch repo info."
                }, { quoted: fakevCard });
            }
        }

        // =============================================
        // COMMAND: .ai
        // =============================================
        else if (command === 'ai') {
            const q = body.replace(/^[.\/!]ai\s*/i, '').trim();
            if (!q) {
                return await socket.sendMessage(sender, {
                    text: `*Usage:* ${config.PREFIX}ai <question>`
                }, { quoted: fakevCard });
            }

            try {
                await socket.sendMessage(sender, { react: { text: '🤖', key: msg.key } });

                const prompt = `You are DIANA MINI BOT, an AI assistant. Keep responses friendly and helpful. User: ${q}`;
                const response = await axios.get(`https://api.giftedtech.co.ke/api/ai/geminiaipro?apikey=gifted&q=${encodeURIComponent(prompt)}`);

                const aiResponse = response.data?.result || response.data?.response || 'Sorry, I could not process that.';

                await socket.sendMessage(sender, {
                    image: { url: config.IMAGE_PATH },
                    caption: `🤖 *AI RESPONSE:*\n\n${aiResponse}`
                }, { quoted: fakevCard });

            } catch (error) {
                console.error('AI command error:', error);
                await socket.sendMessage(sender, {
                    text: "❌ AI service temporarily unavailable."
                }, { quoted: fakevCard });
            }
        }

        // =============================================
        // COMMAND: .sticker
        // =============================================
        else if (command === 'sticker' || command === 's') {
            if (!msg.quoted) {
                return await socket.sendMessage(from, {
                    text: "*📛 Reply to an image or video to create a sticker.*"
                }, { quoted: fakevCard });
            }

            try {
                const mime = msg.quoted.mtype;
                if (mime === "imageMessage" || mime === "stickerMessage" || mime === "videoMessage") {
                    const media = await msg.quoted.download();
                    await socket.sendMessage(from, {
                        sticker: media
                    }, { quoted: msg });
                } else {
                    await socket.sendMessage(from, {
                        text: "❌ Please reply to an image or video."
                    }, { quoted: fakevCard });
                }
            } catch (e) {
                console.error("❌ Sticker error:", e);
                await socket.sendMessage(from, {
                    text: "❌ Failed to create sticker."
                }, { quoted: fakevCard });
            }
        }

        // =============================================
        // COMMAND: .tourl
        // =============================================
        else if (command === 'tourl' || command === 'url') {
            try {
                await socket.sendMessage(sender, { react: { text: '🖇', key: msg.key } });

                if (!msg.quoted) {
                    return await socket.sendMessage(from, {
                        text: "❌ Reply to an image, video, or audio file."
                    }, { quoted: fakevCard });
                }

                const quotedMsg = msg.quoted;
                const mimeType = (quotedMsg.msg || quotedMsg).mimetype || '';
                if (!mimeType) {
                    return await socket.sendMessage(from, {
                        text: "❌ Unsupported media type."
                    }, { quoted: fakevCard });
                }

                const mediaBuffer = await quotedMsg.download();
                const tempFilePath = path.join(os.tmpdir(), `catbox_upload_${Date.now()}`);
                fs.writeFileSync(tempFilePath, mediaBuffer);

                let extension = '';
                if (mimeType.includes('image/jpeg')) extension = '.jpg';
                else if (mimeType.includes('image/png')) extension = '.png';
                else if (mimeType.includes('video')) extension = '.mp4';
                else if (mimeType.includes('audio')) extension = '.mp3';
                else extension = '.bin';

                const fileName = `file${extension}`;
                const form = new FormData();
                form.append('fileToUpload', fs.createReadStream(tempFilePath), fileName);
                form.append('reqtype', 'fileupload');

                const response = await axios.post("https://catbox.moe/user/api.php", form, {
                    headers: form.getHeaders()
                });

                const mediaUrl = response.data;
                fs.unlinkSync(tempFilePath);

                await socket.sendMessage(from, {
                    text: `✅ *File uploaded successfully*\n\n📦 Size: ${formatBytes(mediaBuffer.length)}\n🌍 URL: ${mediaUrl}`
                }, { quoted: fakevCard });

            } catch (error) {
                console.error('Tourl error:', error);
                await socket.sendMessage(from, {
                    text: `❌ Failed to upload: ${error.message}`
                }, { quoted: fakevCard });
            }
        }

        // =============================================
        // COMMAND: .kickall
        // =============================================
        else if (command === 'kickall' || command === 'removeall') {
            if (!isGroup) {
                await socket.sendMessage(sender, {
                    text: '❌ This command can only be used in groups!'
                }, { quoted: fakevCard });
                return;
            }

            if (!isSenderGroupAdmin && !isOwner) {
                await socket.sendMessage(sender, {
                    text: '❌ Only group admins or bot owner can use this command!'
                }, { quoted: fakevCard });
                return;
            }

            try {
                const groupMetadata = await socket.groupMetadata(from);
                const botJid = socket.user?.id || socket.user?.jid;

                const membersToRemove = groupMetadata.participants
                    .filter(p => p.admin === null && p.id !== botJid)
                    .map(p => p.id);

                if (membersToRemove.length === 0) {
                    return await socket.sendMessage(sender, {
                        text: '❌ No members to remove (all are admins or bot).'
                    }, { quoted: fakevCard });
                }

                await socket.sendMessage(sender, {
                    text: `⚠️ Removing *${membersToRemove.length}* members...`
                }, { quoted: fakevCard });

                const batchSize = 50;
                for (let i = 0; i < membersToRemove.length; i += batchSize) {
                    const batch = membersToRemove.slice(i, i + batchSize);
                    await socket.groupParticipantsUpdate(from, batch, 'remove');
                    await delay(2000);
                }

                await socket.sendMessage(sender, {
                    text: `✅ Successfully removed *${membersToRemove.length}* members.`
                }, { quoted: fakevCard });

            } catch (error) {
                console.error('Kickall command error:', error);
                await socket.sendMessage(sender, {
                    text: `❌ Failed to remove members: ${error.message}`
                }, { quoted: fakevCard });
            }
        }

        // =============================================
        // COMMAND: .tagall
        // =============================================
        else if (command === 'tagall') {
            if (!isGroup) {
                await socket.sendMessage(sender, {
                    text: '❌ This command can only be used in groups!'
                }, { quoted: fakevCard });
                return;
            }

            if (!isSenderGroupAdmin && !isOwner) {
                await socket.sendMessage(sender, {
                    text: '❌ Only group admins or bot owner can tag all members!'
                }, { quoted: fakevCard });
                return;
            }

            try {
                const groupMetadata = await socket.groupMetadata(from);
                const participants = groupMetadata.participants.map(p => p.id);

                let message = args.join(' ') || '📢 *Attention everyone!*';
                let teks = `╭「 👥 TAGALL 」\n│ • Message: ${message}\n│ • Bot: DIANA MINI BOT\n`;

                for (let mem of participants) {
                    teks += `│ 🦄 @${mem.split('@')[0]}\n`;
                }

                await socket.sendMessage(from, {
                    text: teks,
                    mentions: participants
                }, { quoted: fakevCard });

            } catch (error) {
                console.error('Tagall command error:', error);
                await socket.sendMessage(sender, {
                    text: `❌ Failed to tag all members: ${error.message}`
                }, { quoted: fakevCard });
            }
        }

        // =============================================
        // COMMAND: .linkgc
        // =============================================
        else if (command === 'linkgc' || command === 'invite') {
            if (!isGroup) {
                await socket.sendMessage(sender, {
                    text: '❌ This command can only be used in groups!'
                }, { quoted: fakevCard });
                return;
            }

            if (!isSenderGroupAdmin && !isOwner) {
                await socket.sendMessage(sender, {
                    text: '❌ Only group admins or bot owner can get the group link!'
                }, { quoted: fakevCard });
                return;
            }

            try {
                const groupLink = await socket.groupInviteCode(from);
                const fullLink = `https://chat.whatsapp.com/${groupLink}`;

                await socket.sendMessage(sender, {
                    text: `🔗 *Group Link:*\n${fullLink}\n\n> Requested by @${m.sender.split('@')[0]}`,
                    mentions: [m.sender]
                }, { quoted: fakevCard });

            } catch (error) {
                console.error('GroupLink command error:', error);
                await socket.sendMessage(sender, {
                    text: `❌ Failed to get group link: ${error.message}`
                }, { quoted: fakevCard });
            }
        }

        // =============================================
        // COMMAND: .join
        // =============================================
        else if (command === 'join') {
            if (!isOwner) {
                await socket.sendMessage(sender, {
                    text: '❌ Only bot owner can use this command!'
                }, { quoted: fakevCard });
                return;
            }

            if (args.length === 0) {
                return await socket.sendMessage(sender, {
                    text: `📌 *Usage:* ${config.PREFIX}join <group-invite-link>`
                }, { quoted: fakevCard });
            }

            try {
                const inviteLink = args[0];
                const inviteCodeMatch = inviteLink.match(/chat\.whatsapp\.com\/([a-zA-Z0-9]+)/);
                if (!inviteCodeMatch) {
                    return await socket.sendMessage(sender, {
                        text: '❌ Invalid group invite link format!'
                    }, { quoted: fakevCard });
                }

                const inviteCode = inviteCodeMatch[1];
                const response = await socket.groupAcceptInvite(inviteCode);

                if (response?.gid) {
                    await socket.sendMessage(sender, {
                        text: `✅ Successfully joined group with ID: ${response.gid}!`
                    }, { quoted: fakevCard });
                } else {
                    throw new Error('No group ID in response');
                }

            } catch (error) {
                console.error('Join command error:', error);
                await socket.sendMessage(sender, {
                    text: `❌ Failed to join group: ${error.message}`
                }, { quoted: fakevCard });
            }
        }

        // =============================================
        // COMMAND: .vv (ViewOnce)
        // =============================================
        else if (command === 'vv' || command === 'readviewonce') {
            if (!msg.quoted) {
                return await socket.sendMessage(from, {
                    text: '❌ Reply to a ViewOnce Video, Image, or Audio.'
                }, { quoted: fakevCard });
            }

            try {
                const quotedMessage = msg.msg?.contextInfo?.quotedMessage;
                if (!quotedMessage) {
                    return await socket.sendMessage(from, {
                        text: '❌ No media found in the quoted message.'
                    }, { quoted: fakevCard });
                }

                if (quotedMessage.imageMessage) {
                    const imageCaption = quotedMessage.imageMessage.caption || '';
                    const imageUrl = await socket.downloadAndSaveMediaMessage(quotedMessage.imageMessage);
                    await socket.sendMessage(from, {
                        image: { url: imageUrl },
                        caption: imageCaption
                    }, { quoted: fakevCard });
                }

                if (quotedMessage.videoMessage) {
                    const videoCaption = quotedMessage.videoMessage.caption || '';
                    const videoUrl = await socket.downloadAndSaveMediaMessage(quotedMessage.videoMessage);
                    await socket.sendMessage(from, {
                        video: { url: videoUrl },
                        caption: videoCaption
                    }, { quoted: fakevCard });
                }

                if (quotedMessage.audioMessage) {
                    const audioUrl = await socket.downloadAndSaveMediaMessage(quotedMessage.audioMessage);
                    await socket.sendMessage(from, {
                        audio: { url: audioUrl },
                        mimetype: 'audio/mp4'
                    }, { quoted: fakevCard });
                }

            } catch (error) {
                console.error('vv Error:', error);
                await socket.sendMessage(from, {
                    text: '❌ An error occurred while processing your request.'
                }, { quoted: fakevCard });
            }
        }

        // =============================================
        // COMMAND: .getpp
        // =============================================
        else if (command === 'getpp' || command === 'pp') {
            try {
                let targetUser = sender;

                if (msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
                    targetUser = msg.message.extendedTextMessage.contextInfo.mentionedJid[0];
                } else if (msg.quoted) {
                    targetUser = msg.quoted.sender;
                }

                const ppUrl = await socket.profilePictureUrl(targetUser, 'image').catch(() => null);

                if (ppUrl) {
                    await socket.sendMessage(from, {
                        image: { url: ppUrl },
                        caption: `Profile picture of @${targetUser.split('@')[0]}`,
                        mentions: [targetUser]
                    }, { quoted: fakevCard });
                } else {
                    await socket.sendMessage(from, {
                        text: `@${targetUser.split('@')[0]} doesn't have a profile picture.`,
                        mentions: [targetUser]
                    }, { quoted: fakevCard });
                }

            } catch (error) {
                await socket.sendMessage(from, {
                    text: "Error fetching profile picture."
                }, { quoted: fakevCard });
            }
        }

        // =============================================
        // DEFAULT - Unknown Command
        // =============================================
        else if (isCmd && command) {
            await socket.sendMessage(sender, {
                text: `❌ Unknown command: *${command}*\n\nType *${config.PREFIX}menu* to see available commands.`
            }, { quoted: fakevCard });
        }

        // =============================================
        // AUTO-REACT
        // =============================================
        if (autoReact === 'on' && !isCmd) {
            try {
                const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
                await socket.sendMessage(sender, {
                    react: { text: randomEmoji, key: msg.key }
                });
            } catch (error) {
                // Silent fail for auto-react
            }
        }

    });
}

// =============================================
// MAIN PAIRING FUNCTION
// =============================================
async function EmpirePair(number, res) {
    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    await initUserEnvIfMissing(sanitizedNumber);
    await initEnvsettings(sanitizedNumber);

    const sessionPath = path.join(SESSION_BASE_PATH, `session_${sanitizedNumber}`);

    // Try to restore session from MongoDB
    const restoredCreds = await restoreSession(sanitizedNumber);
    if (restoredCreds) {
        await fs.ensureDir(sessionPath);
        await fs.writeFile(path.join(sessionPath, 'creds.json'), JSON.stringify(restoredCreds, null, 2));
        console.log(`✅ Restored session for ${sanitizedNumber}`);
    }

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const logger = pino({ level: process.env.NODE_ENV === 'production' ? 'fatal' : 'debug' });

    try {
        const socket = makeWASocket({
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, logger),
            },
            printQRInTerminal: false,
            logger,
            browser: Browsers.macOS('Safari')
        });

        socketCreationTime.set(sanitizedNumber, Date.now());

        // Setup handlers
        setupCommandHandlers(socket, sanitizedNumber);
        setupAutoRestart(socket, sanitizedNumber);

        if (!socket.authState.creds.registered) {
            let retries = config.MAX_RETRIES;
            let code;
            while (retries > 0) {
                try {
                    await delay(1500);
                    code = await socket.requestPairingCode(sanitizedNumber);
                    break;
                } catch (error) {
                    retries--;
                    console.warn(`Failed to request pairing code: ${retries} attempts left`);
                    await delay(2000 * (config.MAX_RETRIES - retries));
                }
            }
            if (!res.headersSent) {
                res.send({ code });
            }
        } else {
            if (!res.headersSent) {
                res.send({ status: 'already_paired', message: 'Session restored and connecting' });
            }
        }

        socket.ev.on('creds.update', async () => {
            await saveCreds();
            const fileContent = await fs.readFile(path.join(sessionPath, 'creds.json'), 'utf8');
            const db = await initMongo();
            const collection = db.collection('sessions');
            await collection.updateOne(
                { number: sanitizedNumber },
                {
                    $set: {
                        number: sanitizedNumber,
                        creds: fileContent,
                        active: true,
                        updatedAt: new Date()
                    }
                },
                { upsert: true }
            );
            console.log(`✅ Saved creds for ${sanitizedNumber} in MongoDB`);
        });

        socket.ev.on('connection.update', async (update) => {
            const { connection } = update;
            if (connection === 'open') {
                console.log(`✅ Bot connected for ${sanitizedNumber}`);
                activeSockets.set(sanitizedNumber, socket);

                // Save number to list
                let numbers = [];
                if (fs.existsSync(NUMBER_LIST_PATH)) {
                    numbers = JSON.parse(fs.readFileSync(NUMBER_LIST_PATH, 'utf8'));
                }
                if (!numbers.includes(sanitizedNumber)) {
                    numbers.push(sanitizedNumber);
                    fs.writeFileSync(NUMBER_LIST_PATH, JSON.stringify(numbers, null, 2));
                }
            }
        });

    } catch (error) {
        console.error('Pairing error:', error);
        socketCreationTime.delete(sanitizedNumber);
        if (!res.headersSent) {
            res.status(503).send({ error: 'Service Unavailable' });
        }
    }
}

// =============================================
// RESTORE SESSION FROM MONGODB
// =============================================
async function restoreSession(number) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');
        const db = await initMongo();
        const collection = db.collection('sessions');
        const doc = await collection.findOne({ number: sanitizedNumber, active: true });
        if (!doc) return null;
        return JSON.parse(doc.creds);
    } catch (error) {
        console.error('Session restore failed:', error);
        return null;
    }
}

// =============================================
// SETUP AUTO RESTART
// =============================================
function setupAutoRestart(socket, number) {
    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    socket.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            if (statusCode === 401) {
                console.log(`Connection closed due to logout for ${number}`);
                activeSockets.delete(sanitizedNumber);
                socketCreationTime.delete(sanitizedNumber);
            } else {
                console.log(`Connection lost for ${number}, attempting to reconnect...`);
                activeSockets.delete(sanitizedNumber);
                socketCreationTime.delete(sanitizedNumber);
                const mockRes = { headersSent: false, send: () => {}, status: () => mockRes };
                await EmpirePair(number, mockRes);
            }
        }
    });
}

// =============================================
// ROUTES
// =============================================
router.get('/', async (req, res) => {
    const { number, force } = req.query;
    if (!number) {
        return res.status(400).send({ error: 'Number parameter is required' });
    }

    const forceRepair = force === 'true';
    const sanitizedNumber = number.replace(/[^0-9]/g, '');

    if (activeSockets.has(sanitizedNumber) && !forceRepair) {
        return res.status(200).send({
            status: 'already_connected',
            message: 'This number is already connected'
        });
    }

    if (forceRepair) {
        const sessionPath = path.join(SESSION_BASE_PATH, `session_${sanitizedNumber}`);
        if (fs.existsSync(sessionPath)) {
            await fs.remove(sessionPath);
        }
        const db = await initMongo();
        await db.collection('sessions').deleteOne({ number: sanitizedNumber });
        console.log(`🔄 Forced re-pair for ${sanitizedNumber}`);
    }

    await EmpirePair(number, res);
});

router.get('/active', (req, res) => {
    res.status(200).send({
        count: activeSockets.size,
        numbers: Array.from(activeSockets.keys())
    });
});

router.get('/ping', (req, res) => {
    res.status(200).send({
        status: 'active',
        message: 'BOT is running',
        activesession: activeSockets.size
    });
});

// =============================================
// INIT MONGO ON STARTUP
// =============================================
(async () => {
    try {
        await initMongo();
        console.log('✅ MongoDB initialized successfully');
    } catch (error) {
        console.error('❌ MongoDB initialization failed:', error);
    }
})();

// =============================================
// CLEANUP
// =============================================
process.on('exit', () => {
    activeSockets.forEach((socket, number) => {
        socket.ws.close();
        activeSockets.delete(number);
        socketCreationTime.delete(number);
    });
    client.close();
});

module.exports = router;
