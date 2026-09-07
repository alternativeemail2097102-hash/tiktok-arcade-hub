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

const dbDir = path.join(__dirname, 'database');
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir);
const db = new sqlite3.Database(path.join(dbDir, 'leaderboard.db'));

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        tiktok_id TEXT PRIMARY KEY, username TEXT, profile_pic TEXT,
        word500_score INTEGER DEFAULT 0, contexto_score INTEGER DEFAULT 0,
        wordsearch_score INTEGER DEFAULT 0, memory_score INTEGER DEFAULT 0,
        blossom_score INTEGER DEFAULT 0, games_won INTEGER DEFAULT 0
    )`);
});

app.post('/api/score', (req, res) => {
    const { uniqueId, username, profilePic, game, points } = req.body;
    const col = `${game}_score`;
    db.run(`INSERT INTO users (tiktok_id, username, profile_pic, ${col}, games_won) VALUES (?, ?, ?, ?, 1) 
            ON CONFLICT(tiktok_id) DO UPDATE SET username = excluded.username, profile_pic = excluded.profile_pic, 
            ${col} = ${col} + excluded.${col}, games_won = games_won + 1`, 
    [uniqueId, username, profilePic, points], () => res.sendStatus(200));
});

app.get('/api/leaderboard', (req, res) => {
    const game = req.query.game || 'total';
    let query = "";
    if (game === 'total') {
        query = `SELECT username, profile_pic, (word500_score + contexto_score + wordsearch_score + memory_score + blossom_score) as score FROM users WHERE score > 0 ORDER BY score DESC LIMIT 10`;
    } else {
        query = `SELECT username, profile_pic, ${game}_score as score FROM users WHERE ${game}_score > 0 ORDER BY score DESC LIMIT 10`;
    }
    db.all(query, [], (err, rows) => res.json(rows || []));
});

app.post('/api/reset_scores', (req, res) => {
    db.run(`UPDATE users SET word500_score=0, contexto_score=0, wordsearch_score=0, memory_score=0, blossom_score=0, games_won=0`, [], () => {
        io.emit('leaderboard_reset'); res.sendStatus(200);
    });
});

let tiktokLiveConnection = null;
io.on('connection', (socket) => {
    socket.on('connect_tiktok', (username) => {
        if(tiktokLiveConnection) tiktokLiveConnection.disconnect();
        tiktokLiveConnection = new TikTokLiveConnection(username, { processInitialData: false });
        tiktokLiveConnection.connect().then(() => io.emit('sys_status', 'LIVE')).catch(() => io.emit('sys_status', 'DEMO'));
        tiktokLiveConnection.on(WebcastEvent.CHAT, data => {
            io.emit('chat', { uniqueId: data.uniqueId, username: data.nickname, profilePic: data.profilePictureUrl, comment: data.comment });
        });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 ARCADE HUB RUNNING ON PORT ${PORT}`));
