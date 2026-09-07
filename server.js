const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { TikTokLiveConnection, WebcastEvent } = require('tiktok-live-connector'); 
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname));
app.use(express.json());

// --- DATABASE SETUP ---
const dbDir = path.join(__dirname, 'database');
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir);
const db = new sqlite3.Database(path.join(dbDir, 'leaderboard.db'));

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        tiktok_id TEXT PRIMARY KEY, username TEXT, profile_pic TEXT,
        word500_score INTEGER DEFAULT 0, contexto_score INTEGER DEFAULT 0,
        wordsearch_score INTEGER DEFAULT 0, blossom_score INTEGER DEFAULT 0,
        memory_score INTEGER DEFAULT 0, games_won INTEGER DEFAULT 0
    )`);
});

app.post('/api/score', (req, res) => {
    const { uniqueId, username, profilePic, game, points } = req.body;
    let col = 'word500_score';
    if(game === 'contexto') col = 'contexto_score';
    if(game === 'wordsearch') col = 'wordsearch_score';
    if(game === 'blossom') col = 'blossom_score';
    if(game === 'memory') col = 'memory_score';

    db.run(`INSERT INTO users (tiktok_id, username, profile_pic, ${col}, games_won) VALUES (?, ?, ?, ?, 1) 
            ON CONFLICT(tiktok_id) DO UPDATE SET username = excluded.username, profile_pic = excluded.profile_pic, 
            ${col} = ${col} + excluded.${col}, games_won = games_won + 1`, 
    [uniqueId, username, profilePic, points], () => res.sendStatus(200));
});

app.get('/api/leaderboard', (req, res) => {
    db.all(`SELECT username, profile_pic, (word500_score + contexto_score + wordsearch_score + blossom_score + memory_score) as total_score 
            FROM users WHERE (word500_score + contexto_score + wordsearch_score + blossom_score + memory_score) > 0 ORDER BY total_score DESC LIMIT 10`, [], (err, rows) => res.json(rows || []));
});

app.post('/api/reset_scores', (req, res) => {
    db.run(`UPDATE users SET word500_score = 0, contexto_score = 0, wordsearch_score = 0, blossom_score = 0, memory_score = 0, games_won = 0`, [], () => {
        io.emit('leaderboard_reset'); res.sendStatus(200);
    });
});

// --- TIKTOK CONNECTION ---
let chatQueue = [];
setInterval(() => { if (chatQueue.length > 0) io.emit('chat', chatQueue.shift()); }, 100);

let tiktokLiveConnection = null;

io.on('connection', (socket) => {
    socket.on('connect_tiktok', (username) => {
        if(tiktokLiveConnection) tiktokLiveConnection.disconnect();
        tiktokLiveConnection = new TikTokLiveConnection(username, { processInitialData: false });
        tiktokLiveConnection.connect()
            .then(() => { io.emit('sys_status', 'LIVE'); })
            .catch(() => { io.emit('sys_status', 'DEMO'); });

        tiktokLiveConnection.on(WebcastEvent.CHAT, data => {
            const user = data.user || {};
            chatQueue.push({ uniqueId: user.uniqueId || 'unknown', username: user.nickname || 'Anonymous', profilePic: user.profilePictureUrl || `https://ui-avatars.com/api/?name=${user.nickname}&background=random`, comment: data.comment || '' });
        });
    });
});

app.get('/', (req, res) => {
    if (fs.existsSync(path.join(__dirname, 'public', 'index.html'))) res.sendFile(path.join(__dirname, 'public', 'index.html'));
    else res.send("Error: Missing index.html in public folder.");
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 ARCADE HUB RUNNING ON PORT ${PORT}`));
