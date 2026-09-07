const socket = io();

let activeGame = 'word500', difficulty = 'moderate', wordLength = 5, sysMode = 'preview'; 
let dictAll = {}, dictCommon = {}; 
let contextoData = [], contextoGuesses = [], bestContextoRank = 1000;
let wordSearchData = { grid: [], words: [], size: 0 };
let blossomData = { center: '', outers: [], found: [], targets: [] };
let memoryData = { cards: [], flipped: [], matched: 0, lock: false };
let playerColors = ["#ef4444", "#3b82f6", "#a855f7", "#f97316", "#ec4899", "#14b8a6", "#fde047"];
let colorIdx = 0, secretWord = "", preloadedDef = "", isGameOver = false, keyState = {}; 

const board = document.getElementById('game-board');
const vKeyboard = document.getElementById('virtual-keyboard');

const INST = {
    word500: { en: "<b>WORD500:</b> Guess the hidden word!<br>Type in chat.<br><br>The Host will mark keys manually to guide you.", id: "<b>WORD500:</b> Tebak kata tersembunyi!<br>Ketik di chat.", ms: "<b>WORD500:</b> Teka perkataan tersembunyi!<br>Taip di chat." },
    contexto: { en: "<b>CONTEXTO:</b> Guess the secret word. Rank #1 wins!", id: "<b>CONTEXTO:</b> Tebak kata rahasia. Peringkat #1 menang!", ms: "<b>CONTEXTO:</b> Teka perkataan rahsia. Kedudukan #1 menang!" },
    wordsearch: { en: "<b>WORD SEARCH:</b> Find the hidden words in the grid!", id: "<b>WORD SEARCH:</b> Temukan kata yang tersembunyi di kotak!", ms: "<b>WORD SEARCH:</b> Cari perkataan tersembunyi dalam grid!" },
    blossom: { en: "<b>BLOSSOM:</b> Make words using the 7 letters. You MUST use the center letter! Letters can be reused.", id: "<b>BLOSSOM:</b> Buat kata menggunakan 7 huruf. Harus menggunakan huruf tengah!", ms: "<b>BLOSSOM:</b> Bina perkataan guna 7 huruf. Mesti guna huruf tengah!" },
    memory: { en: "<b>MEMORY:</b> Match pairs! Type two numbers in chat (e.g. '3 7').", id: "<b>MEMORY:</b> Cocokkan pasangan! Ketik dua angka di chat (contoh '3 7').", ms: "<b>MEMORY:</b> Padankan pasangan! Taip dua nombor di chat (contoh '3 7')." }
};
function updateInstructions() { document.getElementById('instruction-text').innerHTML = INST[activeGame][document.getElementById('lang-selector').value]; }

// Draggable Instructions
const instWrap = document.getElementById('instruction-wrapper');
let isDragging = false, offX, offY;
instWrap.addEventListener('mousedown', e => { isDragging=true; offX=e.clientX-instWrap.offsetLeft; offY=e.clientY-instWrap.offsetTop; });
document.addEventListener('mousemove', e => { if(isDragging) { instWrap.style.left = (e.clientX-offX)+'px'; instWrap.style.top = (e.clientY-offY)+'px'; instWrap.style.bottom = 'auto'; } });
document.addEventListener('mouseup', () => isDragging=false);

// --- 📚 LOAD DICTIONARIES ---
async function loadDictionaries() {
    try {
        const rC = await fetch('https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english-no-swears.txt');
        (await rC.text()).split(/\r?\n/).forEach(w => { const c = w.trim().toUpperCase(); if(!dictCommon[c.length]) dictCommon[c.length]=[]; dictCommon[c.length].push(c); });
        const rA = await fetch('https://raw.githubusercontent.com/dwyl/english-words/master/words_alpha.txt');
        (await rA.text()).split(/\r?\n/).forEach(w => { const c = w.trim().toUpperCase(); if(!dictAll[c.length]) dictAll[c.length]=[]; dictAll[c.length].push(c); });
        startNewRound();
    } catch (err) { showToast("Error loading dictionaries."); }
}
loadDictionaries();

function prefetchDef(word) {
    preloadedDef = "Definition unavailable.";
    fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${word.toLowerCase()}`).then(res => res.json()).then(data => { preloadedDef = data[0].meanings[0].definitions[0].definition; }).catch(e=>{});
}

// --- ⌨️ KEYBOARD ---
function renderKeyboard() {
    if(activeGame !== 'word500') { vKeyboard.style.display = 'none'; return; }
    vKeyboard.style.display = 'flex';
    vKeyboard.innerHTML = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"].map(r => 
        `<div class="kbd-row">${r.split('').map(l => {
            let c = keyState[l] === 'green' ? 'bg-green' : keyState[l] === 'yellow' ? 'bg-yellow' : keyState[l] === 'red' ? 'bg-red' : keyState[l] === 'dark' ? 'bg-dark' : '';
            return `<div class="key-btn ${c}" onclick="cycleKeyColor('${l}')">${l}</div>`;
        }).join('')}</div>`
    ).join('');
}
window.cycleKeyColor = function(l) {
    let c = keyState[l];
    if(!c) keyState[l] = 'dark'; else if(c === 'dark') keyState[l] = 'yellow'; else if(c === 'yellow') keyState[l] = 'green'; else delete keyState[l];
    renderKeyboard();
}
function autoDarken(guess) { guess.split('').forEach(l => { if(!keyState[l]) keyState[l] = 'dark'; }); renderKeyboard(); }

// --- 🎮 ROUTERS ---
function startNewRound() {
    isGameOver = false; board.innerHTML = ""; keyState = {}; updateInstructions(); fetchLeaderboard();
    if(activeGame === 'word500') setupWord500(); 
    else if(activeGame === 'contexto') setupContexto(); 
    else if(activeGame === 'wordsearch') setupWordSearch();
    else if(activeGame === 'blossom') setupBlossom();
    else if(activeGame === 'memory') setupMemory();
}

function setupWord500() {
    document.getElementById('game-title').innerText = "WORD 500";
    document.getElementById('game-instructions').innerText = `CRACK THE ${wordLength}-LETTER CODE.`;
    // Filter out simple plurals for targets
    let list = (difficulty === 'easy' || difficulty === 'moderate') ? dictCommon[wordLength] : dictAll[wordLength];
    let validTargets = list.filter(w => !w.endsWith('S') && !w.endsWith('ED'));
    if(validTargets.length === 0) validTargets = list; // fallback
    secretWord = validTargets[Math.floor(Math.random() * validTargets.length)];
    prefetchDef(secretWord); renderKeyboard();
    board.innerHTML = `<div class="text-gray-400 font-bold mt-4 tracking-widest uppercase">System Ready.</div>`;
}

async function setupContexto() {
    vKeyboard.style.display = 'none'; contextoGuesses = []; bestContextoRank = 1000;
    document.getElementById('game-title').innerText = "CONTEXTO";
    document.getElementById('game-instructions').innerText = `GUESS THE SECRET WORD.`;
    board.innerHTML = `<div class="text-yellow-400 animate-pulse mt-10 font-bold tracking-widest text-xl">🧠 AI Building Semantic Tree...</div>`;
    
    // Abstract targets for harder difficulties
    let len = (difficulty === 'hard' || difficulty === 'extreme') ? Math.floor(Math.random() * 3) + 7 : Math.floor(Math.random() * 3) + 4;
    let list = dictCommon[len]; secretWord = list[Math.floor(Math.random() * list.length)];
    prefetchDef(secretWord);
    
    try {
        const res = await fetch(`https://api.datamuse.com/words?ml=${secretWord}&max=1000`);
        contextoData = (await res.json()).map(i => i.word.toUpperCase()); contextoData.unshift(secretWord);
        board.innerHTML = `<div class="contexto-list" id="contexto-board"></div>`;
    } catch (err) { activeGame = 'word500'; startNewRound(); }
}

function setupWordSearch() {
    vKeyboard.style.display = 'none'; colorIdx = 0;
    document.getElementById('game-title').innerText = "WORD SEARCH";
    
    let size = difficulty === 'easy' ? 10 : difficulty === 'moderate' ? 12 : difficulty === 'hard' ? 15 : 18;
    let count = difficulty === 'easy' ? 8 : difficulty === 'moderate' ? 12 : difficulty === 'hard' ? 16 : 22;
    document.getElementById('game-instructions').innerText = `FIND ${count} HIDDEN WORDS.`;

    let valid = [];
    for(let i=5; i<=15; i++) { if(dictCommon[i]) valid = valid.concat(dictCommon[i]); }
    valid = valid.filter(w => w.length <= size);
    
    let chosen = []; for(let i=0; i<count; i++) chosen.push(valid[Math.floor(Math.random() * valid.length)]);

    let grid = Array(size).fill(null).map(() => Array(size).fill(''));
    let placedInfo = [];
    let dirs = [[0,1,"Horizontal"], [1,0,"Vertical"]]; 
    if(difficulty !== 'easy') dirs.push([1,1,"Diagonal"]);

    chosen.forEach(word => {
        let placed = false, tries = 0;
        while (!placed && tries < 200) {
            tries++; let dir = dirs[Math.floor(Math.random() * dirs.length)];
            let r = Math.floor(Math.random() * size), c = Math.floor(Math.random() * size);
            if (r + (word.length * dir[0]) > size || c + (word.length * dir[1]) > size) continue;
            let col = false;
            for (let i = 0; i < word.length; i++) { if (grid[r+i*dir[0]][c+i*dir[1]] !== '' && grid[r+i*dir[0]][c+i*dir[1]] !== word[i]) { col = true; break; } }
            if (!col) {
                let coords = [];
                for (let i = 0; i < word.length; i++) { grid[r+i*dir[0]][c+i*dir[1]] = word[i]; coords.push(`${r}-${c}`); }
                placedInfo.push({ word, coords, len: word.length, dir: dir[2], start: `R${r+1} C${c+1}`}); placed = true;
            }
        }
    });

    wordSearchData = { grid, words: placedInfo, size };
    let html = `<div class="ws-container w-full max-w-6xl"><div class="ws-grid flex-1" style="grid-template-columns: repeat(${size}, 1fr); grid-template-rows: repeat(${size}, 1fr);">`;
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    for(let r=0; r<size; r++) for(let c=0; c<size; c++) {
        let char = grid[r][c] || letters.charAt(Math.floor(Math.random() * letters.length));
        html += `<div class="ws-cell" id="c-${r}-${c}">${char}</div>`;
    }
    html += `</div><div class="ws-clue-list w-80">`;
    placedInfo.forEach(w => html += `<div class="ws-clue-item" id="wsc-${w.word}"><span class="ws-clue-text">${w.len} Letters</span><div class="flex items-center gap-2 hidden" id="ws-finder-${w.word}"></div></div>`);
    board.innerHTML = html + `</div></div>`;
}

// 🌸 BLOSSOM
function setupBlossom() {
    vKeyboard.style.display = 'none';
    document.getElementById('game-title').innerText = "BLOSSOM";
    document.getElementById('game-instructions').innerText = `MAKE WORDS. CENTER LETTER REQUIRED.`;
    
    // Pangrams (7 unique letters)
    const pangrams = ["ABOLISH", "CABINET", "ECLIPSE", "GLACIER", "JOURNEY", "KINETIC", "LOBSTER", "MACHINE", "PELICAN", "QUANTUM", "RAVIOLI", "SOCIETY", "VAMPIRE", "WHISKEY", "YOGURTS", "ZEALOUS"];
    let pan = pangrams[Math.floor(Math.random() * pangrams.length)].split('');
    let center = pan[Math.floor(Math.random() * 7)];
    let outers = pan.filter(l => l !== center);
    
    // Pre-calculate valid words
    let targets = [];
    let dict = (difficulty === 'easy' || difficulty === 'moderate') ? dictCommon : dictAll;
    Object.keys(dict).forEach(len => {
        if(len >= 4) {
            dict[len].forEach(w => {
                if(w.includes(center)) {
                    let valid = true;
                    for(let i=0; i<w.length; i++) { if(!pan.includes(w[i])) { valid=false; break; } }
                    if(valid) targets.push(w);
                }
            });
        }
    });

    blossomData = { center, outers, found: [], targets };
    
    // Flower UI
    let angle = 0;
    let html = `<div class="blossom-container"><div class="petal center">${center}</div>`;
    outers.forEach(l => {
        let x = Math.cos(angle) * 80; let y = Math.sin(angle) * 80;
        html += `<div class="petal" style="transform: translate(calc(-50% + ${x}px), calc(-50% + ${y}px)); top: 50%; left: 50%;">${l}</div>`;
        angle += (Math.PI * 2) / 6;
    });
    html += `</div><div class="text-yellow-400 font-black text-xl mt-6">FOUND: <span id="blossom-count">0</span> / ${targets.length}</div><div class="flex flex-wrap gap-2 mt-4 w-full max-w-2xl justify-center" id="blossom-found-list"></div>`;
    board.innerHTML = html;
}

// 🎴 MEMORY
function setupMemory() {
    vKeyboard.style.display = 'none';
    document.getElementById('game-title').innerText = "MEMORY";
    
    let pairs = difficulty === 'easy' ? 4 : difficulty === 'moderate' ? 6 : difficulty === 'hard' ? 10 : 15;
    document.getElementById('game-instructions').innerText = `MATCH ${pairs} PAIRS. TYPE 'NUMBER NUMBER'.`;

    const emojis = ["🍎","🚗","🐶","⚽","🎸","🚀","💎","🔥","🍕","🧩","👻","🦄","🥑","🎧","🏆","🦖"];
    let deck = [];
    for(let i=0; i<pairs; i++) { deck.push(emojis[i]); deck.push(emojis[i]); }
    deck.sort(() => Math.random() - 0.5); // Shuffle
    
    memoryData = { cards: deck, flipped: [], matched: 0, lock: false };
    
    let cols = pairs <= 6 ? 4 : pairs <= 10 ? 5 : 6;
    let html = `<div class="memory-grid max-w-4xl" style="grid-template-columns: repeat(${cols}, 1fr);">`;
    deck.forEach((c, i) => {
        html += `<div class="memory-card" id="mem-${i}"><span>${i+1}</span><span class="hidden">${c}</span></div>`;
    });
    board.innerHTML = html + `</div>`;
}

// --- 🤖 BOTS & SOCKETS ---
socket.on('sys_status', status => {
    if(sysMode !== 'demo') {
        isDemoMode = status === 'DEMO'; sysMode = isDemoMode ? 'preview' : 'live';
        const b = document.getElementById('sys-mode-badge');
        b.className = `status-badge ${isDemoMode ? 'status-preview' : 'status-live'}`;
        b.innerText = isDemoMode ? '🟡 PREVIEW' : '🟢 LIVE';
    }
});
socket.on('chat', data => { if(sysMode === 'live') processInput(data.comment, data); });

setInterval(() => {
    if(sysMode === 'demo' && !isGameOver) {
        let intel = Math.random();
        let fake = {username: intel>0.8?"EinsteinBot":intel>0.4?"AvgBot":"NoobBot", profilePic: "https://ui-avatars.com/api/?name=B"};
        let g = "";
        
        if(activeGame==='word500') g = intel>0.9?secretWord:dictCommon[wordLength][Math.floor(Math.random()*dictCommon[wordLength].length)];
        else if(activeGame==='contexto') g = intel>0.9?secretWord:contextoData[Math.max(1, bestContextoRank-Math.floor(Math.random()*50))]||secretWord;
        else if(activeGame==='wordsearch') { if(intel>0.4 && wordSearchData.words.length>0) g = wordSearchData.words[0].word; }
        else if(activeGame==='blossom') { if(intel>0.5 && blossomData.targets.length>0) g = blossomData.targets[Math.floor(Math.random()*blossomData.targets.length)]; }
        else if(activeGame==='memory') { g = `${Math.floor(Math.random()*memoryData.cards.length)} ${Math.floor(Math.random()*memoryData.cards.length)}`; }
        
        if(g) processInput(g, fake);
    }
}, 3500);

document.getElementById('btn-test-guess').addEventListener('click', () => { let i = document.getElementById('host-test-input'); if(i.value) processInput(i.value, {uniqueId: 'host', username: 'HOST', profilePic: 'https://ui-avatars.com/api/?name=H'}); i.value = ""; });
document.getElementById('host-test-input').addEventListener('keypress', (e) => { if(e.key === 'Enter') document.getElementById('btn-test-guess').click(); });

function processInput(guess, user) {
    if (isGameOver) return; guess = guess.trim().toUpperCase(); 
    if(board.children[0] && board.children[0].innerText.includes("System")) board.innerHTML = "";

    if (activeGame === 'word500' && /^[A-Z]+$/.test(guess)) handleWord500Guess(guess, user); 
    else if (activeGame === 'contexto' && /^[A-Z]+$/.test(guess)) handleContextoGuess(guess, user); 
    else if (activeGame === 'wordsearch' && /^[A-Z]+$/.test(guess)) handleWordSearchGuess(guess, user);
    else if (activeGame === 'blossom' && /^[A-Z]+$/.test(guess)) handleBlossomGuess(guess, user);
    else if (activeGame === 'memory') handleMemoryGuess(guess, user);
}

function handleWord500Guess(guess, user) {
    if (guess.length !== wordLength || (!dictAll[wordLength].includes(guess) && !dictCommon[wordLength].includes(guess))) return;
    
    let green = 0, yellow = 0, secArr = secretWord.split(''), gsArr = guess.split('');
    // Mastermind Math (Simplified for speed)
    for (let i=0; i<wordLength; i++) { if (gsArr[i] === secArr[i]) { green++; secArr[i] = null; gsArr[i] = null; } }
    for (let i=0; i<wordLength; i++) { if (gsArr[i] !== null) { let idx = secArr.indexOf(gsArr[i]); if (idx !== -1) { yellow++; secArr[idx] = null; } } }
    if(green === 0 && yellow === 0) autoDarken(guess); 
    
    let row = document.createElement('div'); row.className = "w-row";
    row.innerHTML = `<div class="w-player">${user.username}</div><div class="w-letters">${guess.split('').map(l => `<div class="w-letter">${l}</div>`).join('')}</div><div class="w-clues"><div class="w-clue bg-green">${green}</div><div class="w-clue bg-yellow">${yellow}</div><div class="w-clue bg-red">${wordLength-green-yellow}</div></div>`;
    board.prepend(row);
    if(board.children.length > Math.max(6, 20-wordLength)) board.removeChild(board.lastChild);
    if (green === wordLength) triggerEndGame(user, guess, 1);
}

function handleContextoGuess(guess, user) {
    let rank = contextoData.indexOf(guess);
    if (rank === -1) { let hash = 0; for (let i = 0; i < guess.length; i++) hash = guess.charCodeAt(i) + ((hash << 5) - hash); rank = 1001 + (Math.abs(hash) % 89000); }
    if(rank < bestContextoRank) bestContextoRank = rank;
    contextoGuesses.push({ word: guess, rank: rank, username: user.username });
    contextoGuesses.sort((a, b) => a.rank - b.rank); 
    const cBoard = document.getElementById('contexto-board'); if(!cBoard) return; cBoard.innerHTML = "";
    contextoGuesses.slice(0, 12).forEach(g => {
        let percent = Math.max(5, 100 - (g.rank / 100)); let color = g.rank === 0 ? '#22c55e' : g.rank < 50 ? '#eab308' : g.rank < 500 ? '#f97316' : '#6b7280';
        let bar = document.createElement('div'); bar.className = "contexto-bar mt-1";
        bar.innerHTML = `<div class="contexto-fill" style="width: ${percent}%; background-color: ${color};">${g.word} <span class="ml-2 text-xs text-white/50 lowercase">@${g.username}</span></div><div class="contexto-rank">#${g.rank}</div>`;
        cBoard.appendChild(bar);
    });
    if (rank === 0) triggerEndGame(user, guess, 2); else if (rank <= 10) updateScore(user, 1);
}

function handleWordSearchGuess(guess, user) {
    let target = wordSearchData.words.find(w => w.word === guess);
    if(target) {
        let pColor = playerColors[colorIdx % playerColors.length]; colorIdx++;
        target.coords.forEach((coord, idx) => { 
            let c = document.getElementById(`c-${coord}`); c.classList.add('highlight'); c.style.setProperty('--user-color', pColor); 
            if(target.dir === "Horizontal") { if(idx === 0) c.classList.add('ws-start-horiz'); if(idx === target.coords.length-1) c.classList.add('ws-end-horiz'); } 
            else if (target.dir === "Vertical") { if(idx === 0) c.classList.add('ws-start-vert'); if(idx === target.coords.length-1) c.classList.add('ws-end-vert'); } 
            else { c.classList.add('ws-start-diag'); }
        });
        document.getElementById(`wsc-${guess}`).classList.add('found');
        let f = document.getElementById(`ws-finder-${guess}`); f.classList.remove('hidden'); f.innerHTML = `<img src="${user.profilePic}" class="w-6 h-6 rounded-full"><span class="text-xs font-black uppercase" style="color:${pColor}">@${user.username}</span>`;
        wordSearchData.words = wordSearchData.words.filter(w => w.word !== guess);
        updateScore(user, 1); confetti({ particleCount: 50, spread: 70, origin: { y: 0.8 } });
        if(wordSearchData.words.length === 0) triggerEndGame(user, "GRID CLEARED", 0);
    }
}

function handleBlossomGuess(guess, user) {
    if(blossomData.targets.includes(guess) && !blossomData.found.includes(guess)) {
        blossomData.found.push(guess);
        document.getElementById('blossom-count').innerText = blossomData.found.length;
        
        let pColor = playerColors[colorIdx % playerColors.length]; colorIdx++;
        let isPangram = true;
        [blossomData.center, ...blossomData.outers].forEach(l => { if(!guess.includes(l)) isPangram = false; });
        
        let item = document.createElement('div');
        item.className = "premium-panel px-4 py-2 flex items-center gap-2 animation-popIn";
        item.style.borderColor = pColor;
        item.innerHTML = `<span class="text-lg font-black ${isPangram ? 'text-yellow-400' : 'text-white'}">${guess}</span> <img src="${user.profilePic}" class="w-6 h-6 rounded-full ml-2 border border-white">`;
        document.getElementById('blossom-found-list').prepend(item);
        
        updateScore(user, isPangram ? 2 : 1);
        if(isPangram) confetti({ particleCount: 100, spread: 90, origin: { y: 0.6 } });
        
        if(blossomData.found.length === blossomData.targets.length || blossomData.found.length >= 25) triggerEndGame(user, "BLOSSOM MASTERED", 0);
    }
}

function handleMemoryGuess(guess, user) {
    if(memoryData.lock) return;
    const match = guess.match(/^(\d+)\s+(\d+)$/);
    if(!match) return;
    let i1 = parseInt(match[1]) - 1, i2 = parseInt(match[2]) - 1;
    if(i1 === i2 || i1 < 0 || i2 < 0 || i1 >= memoryData.cards.length || i2 >= memoryData.cards.length) return;
    
    let c1 = document.getElementById(`mem-${i1}`), c2 = document.getElementById(`mem-${i2}`);
    if(c1.classList.contains('matched') || c2.classList.contains('matched')) return;

    memoryData.lock = true;
    c1.classList.add('flipped'); c2.classList.add('flipped');
    c1.children[0].classList.add('hidden'); c1.children[1].classList.remove('hidden');
    c2.children[0].classList.add('hidden'); c2.children[1].classList.remove('hidden');

    setTimeout(() => {
        if(memoryData.cards[i1] === memoryData.cards[i2]) {
            c1.classList.add('matched'); c2.classList.add('matched');
            memoryData.matched += 2;
            updateScore(user, 1);
            showToast(`✅ @${user.username} matched ${memoryData.cards[i1]}!`);
            confetti({ particleCount: 40, origin: { y: 0.8 } });
            if(memoryData.matched === memoryData.cards.length) triggerEndGame(user, "MEMORY CLEARED", 0);
        } else {
            c1.classList.remove('flipped'); c2.classList.remove('flipped');
            c1.children[0].classList.remove('hidden'); c1.children[1].classList.add('hidden');
            c2.children[0].classList.remove('hidden'); c2.children[1].classList.add('hidden');
        }
        memoryData.lock = false;
    }, 2000);
}

// --- 🏆 SCORING & ENDGAME ---
function updateScore(u, p) { if(p>0 && u.uniqueId!=='host') fetch('/api/score', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({uniqueId:u.uniqueId, username:u.username, profilePic:u.profilePic, game:activeGame, points:p})}); fetchLeaderboard(); }

function fetchLeaderboard() {
    fetch('/api/leaderboard').then(r=>r.json()).then(d => {
        const t = document.getElementById('leaderboard-ticker');
        if(d.length===0) t.innerHTML = `<div class="ticker-item text-yellow-400">WAITING FOR SCORES...</div>`;
        else { let h = ""; for(let i=0; i<3; i++) d.forEach((p, idx) => { h += `<div class="ticker-item">${idx===0?"🥇":idx===1?"🥈":idx===2?"🥉":`🏅 #${idx+1}`} <img src="${p.profile_pic}" class="w-6 h-6 rounded-full"> <span class="text-teal-400">${p.username}</span> : ${p.total_score} PTS</div>`; }); t.innerHTML = h; }
    });
}
socket.on('leaderboard_reset', fetchLeaderboard);

function triggerEndGame(user, word, pts = 0) {
    isGameOver = true; updateScore(user, pts);
    confetti({ particleCount: 300, spread: 150, origin: { y: 0.5 }, zIndex: 9999 });

    const m = document.getElementById('winner-modal');
    document.getElementById('winner-pic').src = user.profilePic; document.getElementById('winner-name').innerText = user.username; document.getElementById('winning-word').innerText = word; document.getElementById('word-def').innerText = preloadedDef; 
    m.classList.remove('hidden'); m.classList.add('flex'); gsap.to(m, { opacity: 1, duration: 0.3 });

    setTimeout(() => { gsap.to(m, { opacity: 0, duration: 0.3, onComplete: () => { m.classList.add('hidden'); m.classList.remove('flex'); startNewRound(); }}); }, 5000);
}

// --- 🛠️ HOST ACTIONS & HINTS ---
function showToast(msg, isHint=false) { const c = document.getElementById('toast-container'), t = document.createElement('div'); t.className = `toast ${isHint?'hint':''}`; t.innerHTML = msg; c.prepend(t); setTimeout(() => { if(t.parentNode) t.remove(); }, 6000); }

document.getElementById('btn-toggle-host').addEventListener('click', () => { let m = document.getElementById('host-menu'); m.classList.toggle('scale-0'); m.classList.toggle('opacity-0'); });
document.getElementById('btn-toggle-instructions').addEventListener('click', () => { let m = document.getElementById('instruction-panel'); m.classList.toggle('scale-0'); m.classList.toggle('opacity-0'); });
document.getElementById('btn-toggle-input').addEventListener('click', (e) => { let p = document.getElementById('host-input-panel'); if(p.classList.contains('scale-y-0')){ p.classList.remove('scale-y-0','h-0','p-0','border-0', 'opacity-0'); e.target.innerText="▼ Hide Input"; } else { p.classList.add('scale-y-0','h-0','p-0','border-0', 'opacity-0'); e.target.innerText="▲ Show Input"; } });

document.getElementById('btn-hint').addEventListener('click', () => {
    if (activeGame === 'word500') showToast(`💡 HINT: Letter ${Math.floor(Math.random()*secretWord.length)+1} is <b>[ ${secretWord.charAt(Math.floor(Math.random()*secretWord.length))} ]</b>`, true);
    else if (activeGame === 'contexto') { let t = Math.floor(bestContextoRank/2); if(t<1)t=1; let w = contextoData[t]||secretWord; processInput(w, {username: "SYSTEM HINT", profilePic: "https://ui-avatars.com/api/?name=SYS&background=eab308"}); showToast(`💡 INJECTED Rank #${t} to board.`, true); }
    else if (activeGame === 'wordsearch' && wordSearchData.words.length>0) { let w = wordSearchData.words[0]; showToast(`💡 HINT: Find <b>[ ${w.word} ]</b> starting at ${w.start} going ${w.dir}!`, true); }
    else if (activeGame === 'blossom') { showToast(`💡 HINT: Try finding a word starting with <b>[ ${blossomData.targets[Math.floor(Math.random()*blossomData.targets.length)].charAt(0)} ]</b>`, true); }
    else if (activeGame === 'memory') showToast(`💡 HINT: Keep your eyes on the board!`, true);
});

// UI Bindings
document.querySelectorAll('.tab-btn').forEach(btn => { btn.addEventListener('click', (e) => { document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('text-teal-400', 'border-b-4', 'border-teal-400')); e.target.classList.add('text-teal-400', 'border-b-4', 'border-teal-400'); document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden')); document.getElementById(e.target.getAttribute('data-target')).classList.remove('hidden'); document.getElementById(e.target.getAttribute('data-target')).classList.add('flex'); }); });
document.getElementById('mode-selector').addEventListener('change', e => { sysMode = e.target.value; const b = document.getElementById('sys-mode-badge'); b.className = `status-badge status-${sysMode}`; b.innerText = sysMode === 'live' ? '🟢 LIVE MODE' : sysMode === 'demo' ? '🟣 DEMO (BOTS)' : '🟡 PREVIEW'; });
document.getElementById('theme-selector').addEventListener('change', e => document.body.className = e.target.value);
document.getElementById('game-selector').addEventListener('change', e => { activeGame=e.target.value; document.getElementById('length-wrapper').style.display = activeGame === 'word500' ? 'flex' : 'none'; startNewRound(); });
document.getElementById('diff-selector').addEventListener('change', startNewRound);
document.getElementById('length-slider').addEventListener('input', e => { wordLength=parseInt(e.target.value); document.getElementById('length-display').innerText = wordLength; });
document.getElementById('length-slider').addEventListener('change', startNewRound);
document.getElementById('btn-skip').addEventListener('click', startNewRound);
document.getElementById('btn-reveal').addEventListener('click', () => triggerEndGame({username: "HOST REVEAL", profilePic: "https://ui-avatars.com/api/?name=H"}, secretWord, 0));
document.getElementById('btn-tt-connect').addEventListener('click', () => { let u = document.getElementById('tt-username').value.trim(); if(u) { socket.emit('connect_tiktok', u); document.getElementById('mode-selector').value="live"; sysMode="live"; showToast(`Connecting to @${u}...`); }});
document.getElementById('zoom-slider').addEventListener('input', (e) => { document.getElementById('zoom-display').innerText = `${e.target.value}%`; document.getElementById('broadcast-stage').style.transform = `scale(${e.target.value / 100})`; });
document.getElementById('btn-reset-score').addEventListener('click', () => { if(confirm("Wipe all leaderboards?")) fetch('/api/reset_scores', {method: 'POST'}); });
document.getElementById('lang-selector').addEventListener('change', updateInstructions);
document.getElementById('btn-fullscreen').addEventListener('click', () => { if (!document.fullscreenElement) document.documentElement.requestFullscreen(); else if (document.exitFullscreen) document.exitFullscreen(); });
