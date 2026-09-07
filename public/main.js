const socket = io();
let activeGame = 'word500', difficulty = 'moderate', wordLength = 5, sysMode = 'preview';
let dictAll = {}, dictCommon = {}, keyUsed = new Set(), secretWord = "", preloadedDef = "", isGameOver = false;
let contextoData = [], contextoGuesses = [], hintLevel = 0;
let memoryData = { cards: [], flipped: [], matches: 0 };
let blossomData = { center: '', letters: [], found: [] };

// DRAGGABLE INITIALIZATION
gsap.registerPlugin(Draggable);
Draggable.create("#draggable-rules", { bounds: "body", edgeResistance: 0.65 });

// 📚 LOAD DICTS
async function loadDictionaries() {
    try {
        const rC = await fetch('https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english-no-swears.txt');
        const textCommon = await rC.text();
        textCommon.split(/\r?\n/).forEach(w => { 
            const c = w.trim().toUpperCase(); 
            if(c.length > 2) { if(!dictCommon[c.length]) dictCommon[c.length]=[]; dictCommon[c.length].push(c); }
        });
        const rA = await fetch('https://raw.githubusercontent.com/dwyl/english-words/master/words_alpha.txt');
        const textAll = await rA.text();
        textAll.split(/\r?\n/).forEach(w => { 
            const c = w.trim().toUpperCase(); 
            if(!dictAll[c.length]) dictAll[c.length]=[]; dictAll[c.length].push(c); 
        });
        startNewRound();
    } catch (err) { console.error("Dict Error"); }
}
loadDictionaries();

// 🎮 GAME ROUTING
function startNewRound() {
    isGameOver = false; keyUsed.clear(); hintLevel = 0;
    const board = document.getElementById('game-board');
    board.innerHTML = ""; updateInstructions(); fetchLeaderboard();
    if(activeGame === 'word500') setupWord500(); 
    else if(activeGame === 'contexto') setupContexto(); 
    else if(activeGame === 'memory') setupMemory();
    else if(activeGame === 'blossom') setupBlossom();
}

// 🟩 WORD 500 LOGIC
function setupWord500() {
    document.getElementById('game-title').innerText = "WORD 500";
    let list = (difficulty === 'easy') ? dictCommon[wordLength].filter(w => !w.endsWith('S')) : dictCommon[wordLength];
    secretWord = list[Math.floor(Math.random() * list.length)];
    renderKeyboard();
}

function renderKeyboard() {
    const vK = document.getElementById('virtual-keyboard');
    vK.style.display = 'flex';
    const rows = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];
    vK.innerHTML = rows.map(r => `<div class="kbd-row">${r.split('').map(l => `<div class="key-btn ${keyUsed.has(l)?'used':''}">${l}</div>`).join('')}</div>`).join('');
}

// 🎯 CONTEXTO LOGIC
async function setupContexto() {
    document.getElementById('game-title').innerText = "CONTEXTO";
    contextoGuesses = []; 
    let len = difficulty === 'easy' ? 4 : difficulty === 'moderate' ? 6 : 8;
    secretWord = dictCommon[len][Math.floor(Math.random() * dictCommon[len].length)];
    try {
        const res = await fetch(`https://api.datamuse.com/words?ml=${secretWord}&max=1000`);
        const data = await res.json();
        contextoData = data.map(i => i.word.toUpperCase()); 
        contextoData.unshift(secretWord);
        document.getElementById('game-board').innerHTML = `<div class="w-full flex flex-col gap-2" id="contexto-board"></div>`;
    } catch (e) { activeGame = 'word500'; startNewRound(); }
}

// 🧠 MEMORY LOGIC
function setupMemory() {
    document.getElementById('game-title').innerText = "MEMORY MATCH";
    const pairs = difficulty === 'easy' ? 4 : difficulty === 'moderate' ? 6 : difficulty === 'hard' ? 10 : 15;
    const icons = ['🍎','🍌','⭐','💎','🍀','🔥','🌈','🍕','🎈','🚀','🦄','👾','🐱','🐶','🦊'];
    let selected = icons.slice(0, pairs);
    let boardCards = [...selected, ...selected].sort(() => Math.random() - 0.5);
    memoryData = { cards: boardCards, flipped: [], matches: 0 };
    let cols = Math.ceil(Math.sqrt(boardCards.length));
    let html = `<div class="memory-grid" style="grid-template-columns: repeat(${cols}, 1fr)">`;
    boardCards.forEach((icon, i) => html += `<div class="memory-card" id="mem-${i}">?</div>`);
    document.getElementById('game-board').innerHTML = html + `</div>`;
}

// 🌸 BLOSSOM LOGIC
function setupBlossom() {
    document.getElementById('game-title').innerText = "BLOSSOM";
    const pangrams = ["ACQUIRE", "JOURNEY", "FOCUSED", "WORKING", "QUALITY", "NETWORK", "VILLAGE"];
    const base = pangrams[Math.floor(Math.random()*pangrams.length)];
    const letters = [...new Set(base.split(''))];
    blossomData = { center: letters[0], letters: letters, found: [] };
    let html = `<div class="blossom-grid">`;
    html += `<div class="blossom-hex hex-center">${blossomData.center}</div>`;
    blossomData.letters.slice(1).forEach((l, i) => html += `<div class="blossom-hex hex-${i+1}">${l}</div>`);
    document.getElementById('game-board').innerHTML = html + `</div><div id="blossom-score" class="mt-4 text-xl font-bold">FOUND: 0</div>`;
}

// ⌨️ INPUT HANDLING
function processInput(guess, user) {
    if (isGameOver) return;
    guess = guess.trim().toUpperCase();
    if (!/^[A-Z]+$/.test(guess)) return;

    if (activeGame === 'word500') {
        if (guess.length !== secretWord.length) return;
        let green = 0, yellow = 0, secArr = secretWord.split(''), gsArr = guess.split('');
        gsArr.forEach(l => keyUsed.add(l)); renderKeyboard();
        for (let i=0; i<secretWord.length; i++) { if (gsArr[i] === secArr[i]) { green++; secArr[i] = null; gsArr[i] = null; } }
        for (let i=0; i<secretWord.length; i++) { if (gsArr[i] && secArr.includes(gsArr[i])) { yellow++; secArr[secArr.indexOf(gsArr[i])] = null; } }
        const row = document.createElement('div'); row.className = "w-row";
        row.innerHTML = `<div class="w-player">${user.username}</div><div class="flex gap-1">${guess.split('').map(l => `<div class="w-letter" style="width:30px; height:35px; font-size:1rem">${l}</div>`).join('')}</div><div class="flex gap-1 ml-2"><div class="w-clue bg-green">${green}</div><div class="w-clue bg-yellow">${yellow}</div></div>`;
        document.getElementById('game-board').prepend(row);
        if (green === secretWord.length) triggerEndGame(user, guess, 10);
    }

    if (activeGame === 'contexto') {
        let rank = contextoData.indexOf(guess);
        if (rank === -1) rank = 1000 + (Math.floor(Math.random()*5000));
        contextoGuesses.push({ word: guess, rank, user: user.username });
        contextoGuesses.sort((a,b) => a.rank - b.rank);
        const b = document.getElementById('contexto-board');
        b.innerHTML = contextoGuesses.slice(0, 10).map(g => `
            <div class="contexto-bar">
                <div class="contexto-fill" style="width:${Math.max(5, 100 - (g.rank/10))}%; background:${g.rank === 0 ? '#22c55e' : '#eab308'}"></div>
                <div class="contexto-text-wrap"><span>${g.word}</span><span>#${g.rank}</span></div>
            </div>
        `).join('');
        if (rank === 0) triggerEndGame(user, guess, 20);
    }

    if (activeGame === 'blossom') {
        if (guess.length >= 4 && guess.includes(blossomData.center) && !blossomData.found.includes(guess)) {
            if (guess.split('').every(l => blossomData.letters.includes(l))) {
                blossomData.found.push(guess);
                document.getElementById('blossom-score').innerText = `FOUND: ${blossomData.found.length}`;
                updateScore(user, guess.length);
                confetti({ particleCount: 30 });
            }
        }
    }
}

// 🥇 LEADERBOARD
function fetchLeaderboard() {
    const gameType = activeGame === 'word500' ? 'word500' : activeGame === 'contexto' ? 'contexto' : activeGame === 'blossom' ? 'blossom' : 'memory';
    fetch(`/api/leaderboard?game=${gameType}`).then(r => r.json()).then(data => {
        const t = document.getElementById('leaderboard-ticker');
        t.innerHTML = data.map((p, i) => `<div class="ticker-item">#${i+1} <img src="${p.profile_pic}" class="w-5 h-5 rounded-full"> ${p.username}: ${p.score}</div>`).join('');
    });
}

// 💡 PROGRESSIVE HINTS
document.getElementById('btn-hint').addEventListener('click', () => {
    hintLevel++;
    if (activeGame === 'contexto') {
        if (hintLevel === 1) showToast("Broad Category: Object");
        else if (hintLevel === 2) showToast(`Word Length: ${secretWord.length}`);
        else if (hintLevel === 3) showToast(`First Letter: ${secretWord[0]}`);
        else showToast(`Near match: ${contextoData[10]}`);
    }
});

// 📥 HOST INPUT SHORTCUT
document.getElementById('host-test-input').addEventListener('keydown', (e) => {
    if (e.key === "Enter" || e.key === "ArrowDown") {
        let val = e.target.value;
        if(val) processInput(val, {uniqueId:'host', username:'HOST', profilePic:'https://ui-avatars.com/api/?name=H'});
        e.target.value = "";
    }
});

document.getElementById('btn-test-guess').addEventListener('click', () => {
    let i = document.getElementById('host-test-input');
    if(i.value) processInput(i.value, {uniqueId:'host', username:'HOST', profilePic:''});
    i.value = "";
});

// ℹ️ UI HELPERS
const INST = {
    word500: { en: "Guess the hidden word! Keys go dark when used." },
    contexto: { en: "Find the secret word by its semantic rank!" },
    memory: { en: "Audience must match pairs by commenting!" },
    blossom: { en: "Make words using the center letter!" }
};
function updateInstructions() { document.getElementById('instruction-text').innerText = INST[activeGame].en; }
document.getElementById('game-selector').addEventListener('change', e => { activeGame = e.target.value; startNewRound(); });
document.getElementById('btn-toggle-host').addEventListener('click', () => { document.getElementById('host-menu').classList.toggle('hidden'); document.getElementById('host-menu').classList.toggle('scale-0'); document.getElementById('host-menu').classList.toggle('opacity-0'); });
document.getElementById('btn-toggle-instructions').addEventListener('click', () => document.getElementById('instruction-panel').classList.toggle('hidden'));

function updateScore(u, p) { 
    if(u.uniqueId !== 'host') fetch('/api/score', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({uniqueId:u.uniqueId, username:u.username, profilePic:u.profilePic, game:activeGame, points:p})}); 
}

function triggerEndGame(user, word, pts) {
    isGameOver = true; updateScore(user, pts);
    const m = document.getElementById('winner-modal');
    document.getElementById('winner-pic').src = user.profilePic;
    document.getElementById('winner-name').innerText = user.username;
    document.getElementById('winning-word').innerText = word;
    m.classList.remove('hidden'); gsap.to(m, { opacity:1, duration:0.5 });
    confetti({ particleCount: 200 });
    setTimeout(() => { gsap.to(m, { opacity:0, onComplete: () => { m.classList.add('hidden'); startNewRound(); }}); }, 5000);
}

function showToast(m) {
    const c = document.getElementById('toast-container');
    const t = document.createElement('div'); t.className = "toast"; t.innerText = m;
    c.appendChild(t); setTimeout(() => t.remove(), 4000);
}
