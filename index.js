// =============================================
// FILE: index.js
// DESCRIPTION: Main server entry point for DIANA MINI BOT
// PLATFORMS: Vercel, Railway, Render, Heroku
// =============================================

const express = require('express');
const path = require('path');
const bodyParser = require("body-parser");
const fs = require('fs-extra');
require('dotenv').config();

// =============================================
// CONFIGURATION
// =============================================
const app = express();
const PORT = process.env.PORT || 8000;
const __path = process.cwd();

// =============================================
// ROUTES
// =============================================
const pairRouter = require('./src/pair');

// =============================================
// MIDDLEWARE
// =============================================
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// =============================================
// ROUTE HANDLERS
// =============================================
app.use('/code', pairRouter);

app.get('/pair', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'pair.html'));
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'healthy',
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

// =============================================
// ERROR HANDLING
// =============================================
process.on('uncaughtException', (err) => {
    console.error('❌ Uncaught Exception:', err.message);
});

process.on('unhandledRejection', (err) => {
    console.error('❌ Unhandled Rejection:', err.message);
});

// =============================================
// START SERVER
// =============================================
const server = app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════╗
║                                               ║
║   🔥 DIANA MINI BOT - SERVER STARTED 🔥      ║
║                                               ║
║   🚀 PORT: ${PORT}                              ║
║   🌐 URL: http://localhost:${PORT}             ║
║   📦 STATUS: Running                          ║
║                                               ║
╚═══════════════════════════════════════════════╝
    `);
});

module.exports = app;
