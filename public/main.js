const socket = io();
let activeGame = 'word500', difficulty = 'moderate', wordLength = 5, sysMode = 'preview';
let secretWord = "", dictCommon = {}, dictAll = {}, isGameOver = false, keyUsed = new Set();
let blossomData = { center: '', outer: [], solutions: [] };
let memoryData = { cards: [], flipped: [], matches: 0 };
let contextoGuesses = [], contextoData = [];

// 1. INITIALIZE DRAGGABLE RULES
gsap.registerPlugin(Draggable);
Draggable.create("#rules-container", { type: "x,y", edgeResistance: 0.65, bounds: "body" });

// 2. DICTIONARIES
async function loadDicts() {
    const rC = await fetch('https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english-no-swears.txt');
    const textC = await rC.text();
    textC.split('\n').forEach(w => {
        let word = w.trim().toUpperCase();
        if(word.length > 2) {
            if(!dictCommon[word.length]) dictCommon[word.length] = [];
            dictCommon[word.length].push(word);
        }
    });
    startNewRound();
}
loadDicts();

// 3. GAME ROUTING
function startNewRound() {
    isGameOver = false; keyUsed.clear();
    document.getElementById('game-board').innerHTML = "";
    if (activeGame === 'word500') setupWord500();
    else if (activeGame === 'contexto') setupContexto();
    else if (activeGame === 'wordsearch') setupWordSearch();
    else if (activeGame === 'memory') setupMemory();
    else if (activeGame === 'blossom') setupBlossom();
}

// --- WORD 500 (Cleaned up keyboard & strict words) ---
function setupWord500() {
    document.getElementById('game-title').innerText = "WORD 500";
    let list = (difficulty === 'easy') ? dictCommon[wordLength] : dictCommon[wordLength]; 
    secretWord = list[Math.floor(Math.random() * list.length)];
    renderKeyboard();
    document.getElementById('game-instructions').innerText = `Guess the ${wordLength} letter word!`;
}

function renderKeyboard() {
    const kb = document.getElementById('virtual-keyboard');
    kb.style.display = 'flex';
    const rows = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];
    kb.innerHTML = rows.map(r => `<div class="kbd-row flex justify-center gap-1 mb-1">${r.split('').map(l => `<div class="key-btn ${keyUsed.has(l)?'used':''}" style="width:30px">${l}</div>`).join('')}</div>`).join('');
}

// --- CONTEXTO (Improved Difficulty & Overlap Fix) ---
async function setupContexto() {
    document.getElementById('game-title').innerText = "CONTEXTO";
    contextoGuesses = [];
    const len = (difficulty === 'easy') ? 4 : (difficulty === 'moderate') ? 6 : 8;
    secretWord = dictCommon[len][Math.floor(Math.random() * dictCommon[len].length)];
    const res = await fetch(`https://api.datamuse.com/words?ml=${secretWord}&max=500`);
    const data = await res.json();
    contextoData = data.map(d => d.word.toUpperCase());
    contextoData.unshift(secretWord);
    document.getElementById('game-board').innerHTML = `<div class="contexto-list" id="ctx-board"></div>`;
}

// --- MEMORY MATCH (New Game) ---
function setupMemory() {
    document.getElementById('game-title').innerText = "MEMORY MATCH";
    const pairs = difficulty === 'easy' ? 4 : difficulty === 'moderate' ? 6 : 8;
    const icons = ['🍎','🍌','⭐','💎','🍀','🔥','🌈','🍕','🎈','🚀'];
    let selected = icons.slice(0, pairs);
    let board = [...selected, ...selected].sort(() => Math.random() - 0.5);
    memoryData = { cards: board, flipped: [], matches: 0 };
    
    let html = `<div class="memory-grid" style="grid-template-columns: repeat(${pairs/2}, 1fr)">`;
    board.forEach((icon, i) => html += `<div class="memory-card" id="mem-${i}" onclick="flipCard(${i})">?</div>`);
    document.getElementById('game-board').innerHTML = html + `</div>`;
}

window.flipCard = (i) => {
    if(memoryData.flipped.length === 2 || memoryData.flipped.includes(i)) return;
    const el = document.getElementById(`mem-${i}`);
    el.innerText = memoryData.cards[i]; el.classList.add('flipped');
    memoryData.flipped.push(i);
    if(memoryData.flipped.length === 2) {
        setTimeout(checkMemoryMatch, 1000);
    }
};

function checkMemoryMatch() {
    const [a, b] = memoryData.flipped;
    if(memoryData.cards[a] === memoryData.cards[b]) {
        memoryData.matches++;
        if(memoryData.matches === memoryData.cards.length / 2) triggerEndGame({username:'Audience'}, 'CLEARED', 10);
    } else {
        document.getElementById(`mem-${a}`).innerText = "?";
        document.getElementById(`mem-${b}`).innerText = "?";
        document.getElementById(`mem-${a}`).classList.remove('flipped');
        document.getElementById(`mem-${b}`).classList.remove('flipped');
    }
    memoryData.flipped = [];
}

// --- BLOSSOM (New Game) ---
function setupBlossom() {
    document.getElementById('game-title').innerText = "BLOSSOM";
    const pangrams = ["ACQUIRE", "JOURNEY", "FOCUSED", "PROBLEM", "WORKING", "QUALITY", "NETWORK"];
    const base = pangrams[Math.floor(Math.random() * pangrams.length)];
    const letters = base.split('');
    blossomData = { center: letters[0], outer: letters.slice(1), found: [] };
    
    let html = `<div class="blossom-container">`;
    html += `<div class="hex-cell hex-center">${blossomData.center}</div>`;
    blossomData.outer.forEach((l, i) => html += `<div class="hex-cell hex-${i+1}">${l}</div>`);
    document.getElementById('game-board').innerHTML = html + `</div><div id="blossom-found" class="mt-4 text-xs font-bold text-teal-400">Words: 0</div>`;
}

// 4. INPUT PROCESSING
function processInput(guess, user) {
    if(isGameOver) return;
    guess = guess.trim().toUpperCase();

    if(activeGame === 'word500') {
        if(guess.length !== secretWord.length) return;
        guess.split('').forEach(l => { keyUsed.add(l); });
        renderKeyboard();
        let green = 0, yellow = 0;
        let sec = secretWord.split(''), g = guess.split('');
        g.forEach((l, i) => { if(l === sec[i]) { green++; sec[i] = null; g[i] = null; } });
        g.forEach((l, i) => { if(l && sec.includes(l)) { yellow++; sec[sec.indexOf(l)] = null; } });
        
        const row = document.createElement('div');
        row.className = "flex gap-2 items-center bg-white/5 p-2 rounded mb-1 w-full";
        row.innerHTML = `<span class="text-[10px] w-12 truncate">${user.username}</span><span class="font-black tracking-widest text-lg">${guess}</span><span class="ml-auto text-green-400 font-bold">${green}G</span><span class="text-yellow-400 font-bold">${yellow}Y</span>`;
        document.getElementById('game-board').prepend(row);
        if(green === secretWord.length) triggerEndGame(user, guess, 10);
    }

    if(activeGame === 'contexto') {
        let rank = contextoData.indexOf(guess);
        if(rank === -1) rank = 5000;
        contextoGuesses.push({ word: guess, rank, user: user.username });
        contextoGuesses.sort((a,b) => a.rank - b.rank);
        const board = document.getElementById('ctx-board');
        board.innerHTML = contextoGuesses.slice(0, 8).map(g => `
            <div class="contexto-bar">
                <div class="contexto-fill" style="width: ${Math.max(5, 100 - (g.rank/10))}% ; background: ${g.rank === 0 ? '#22c55e' : '#eab308'}"></div>
                <span class="contexto-text">${g.word}</span>
                <span class="contexto-text">#${g.rank}</span>
            </div>
        `).join('');
        if(rank === 0) triggerEndGame(user, guess, 20);
    }

    if(activeGame === 'blossom') {
        if(guess.length < 4 || !guess.includes(blossomData.center)) return;
        if(blossomData.found.includes(guess)) return;
        // Basic valid letter check
        const allLetters = [blossomData.center, ...blossomData.outer];
        if(!guess.split('').every(l => allLetters.includes(l))) return;
        
        blossomData.found.push(guess);
        document.getElementById('blossom-found').innerText = `Words Found: ${blossomData.found.length}`;
        confetti({ particleCount: 20, spread: 50 });
        updateScore(user, guess.length);
    }
}

// 5. SYSTEMS & UI
function triggerEndGame(user, word, pts) {
    isGameOver = true;
    updateScore(user, pts);
    const m = document.getElementById('winner-modal');
    document.getElementById('winner-pic').src = user.profilePic;
    document.getElementById('winner-name').innerText = user.username;
    document.getElementById('winning-word').innerText = word;
    m.classList.remove('hidden'); m.classList.add('flex');
    gsap.to(m, { opacity: 1, duration: 0.5 });
    confetti({ particleCount: 200, spread: 100 });
    setTimeout(() => {
        gsap.to(m, { opacity: 0, onComplete: () => { m.classList.add('hidden'); startNewRound(); } });
    }, 5000);
}

function updateScore(u, p) {
    if(u.uniqueId === 'host') return;
    fetch('/api/score', { 
        method: 'POST', 
        headers: {'Content-Type':'application/json'}, 
        body: JSON.stringify({ uniqueId: u.uniqueId, username: u.username, profilePic: u.profilePic, game: activeGame, points: p })
    });
}

// SOCKET EVENTS
socket.on('chat', data => processInput(data.comment, data));
document.getElementById('btn-tt-connect').addEventListener('click', () => {
    const user = document.getElementById('tt-username').value;
    if(user) socket.emit('connect_tiktok', user);
});

// UI HANDLERS
document.getElementById('btn-toggle-host').addEventListener('click', () => {
    const m = document.getElementById('host-menu');
    m.classList.toggle('scale-0'); m.classList.toggle('hidden'); m.classList.toggle('opacity-0');
});
document.getElementById('game-selector').addEventListener('change', e => { activeGame = e.target.value; startNewRound(); });
document.getElementById('btn-test-guess').addEventListener('click', () => {
    const i = document.getElementById('host-test-input');
    processInput(i.value, { uniqueId: 'host', username: 'HOST', profilePic: '' });
    i.value = "";
});
