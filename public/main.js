const socket = io();

// --- 🐛 SYSTEM LOGGER ---
const sysLogs = [];
function logError(err, fix) { sysLogs.unshift(`[${new Date().toLocaleTimeString()}] ERROR: ${err} | FIX: ${fix}`); if(sysLogs.length > 50) sysLogs.pop(); }
window.onerror = (msg) => logError(msg, "Check syntax or variables.");

// --- ⚙️ MASTER STATE ---
let activeGame = 'word500', difficulty = 'moderate', wordLength = 5, sysMode = 'preview'; 
let dictAll = {}, dictCommon = {}; 
let contextoData = [], contextoGuesses = [], bestContextoRank = 1000;
let wordSearchData = { grid: [], words: [], size: 0 };
let blossomData = { center: '', outers: [], found: [], targets: [] };
let memoryData = { cards: [], flipped: [], matched: 0, lock: false };
let gridData = { board: [], solution: [], type: '', size: 0 }; 
let geoData = { target: null, type: '' }; 
let redactleData = { words: [], revealed: [] };

let playerColors = ["#ef4444", "#3b82f6", "#a855f7", "#f97316", "#ec4899", "#14b8a6", "#fde047"];
let colorIdx = 0, secretWord = "", preloadedDef = "", isGameOver = false, keyState = {}; 

const board = document.getElementById('game-board');
const vKeyboard = document.getElementById('virtual-keyboard');
const instBar = document.getElementById('game-instructions');

// --- 📖 DATABASES & INSTRUCTIONS ---
const COUNTRIES = [{ name: "UNITED STATES", cap: "WASHINGTON", lat: 37.09, lon: -95.71, iso: "us" }, { name: "CANADA", cap: "OTTAWA", lat: 56.13, lon: -106.34, iso: "ca" }, { name: "BRAZIL", cap: "BRASILIA", lat: -14.23, lon: -51.92, iso: "br" }, { name: "FRANCE", cap: "PARIS", lat: 46.22, lon: 2.21, iso: "fr" }, { name: "JAPAN", cap: "TOKYO", lat: 36.20, lon: 138.25, iso: "jp" }, { name: "AUSTRALIA", cap: "CANBERRA", lat: -25.27, lon: 133.77, iso: "au" }, { name: "INDONESIA", cap: "JAKARTA", lat: -0.78, lon: 113.92, iso: "id" }, { name: "MALAYSIA", cap: "KUALA LUMPUR", lat: 4.21, lon: 101.97, iso: "my" }, { name: "EGYPT", cap: "CAIRO", lat: 26.82, lon: 30.80, iso: "eg" }, { name: "SPAIN", cap: "MADRID", lat: 40.46, lon: -3.74, iso: "es" }];
const ANIMALS = [{ name: "LION", class: "Mammal", diet: "Carnivore", habitat: "Savanna" }, { name: "EAGLE", class: "Bird", diet: "Carnivore", habitat: "Mountains" }, { name: "FROG", class: "Amphibian", diet: "Carnivore", habitat: "Swamp" }, { name: "SHARK", class: "Fish", diet: "Carnivore", habitat: "Ocean" }, { name: "HORSE", class: "Mammal", diet: "Herbivore", habitat: "Plains" }];
const INST = {
    word500: { en: "<b>WORD500:</b> Guess the hidden word! Type in chat.<br>Host marks colors manually." },
    contexto: { en: "<b>CONTEXTO:</b> Guess the secret word. Words are ranked by AI meaning. Rank #1 wins!" },
    wordsearch: { en: "<b>WORD SEARCH:</b> Find the hidden words in the grid! Type the word." },
    blossom: { en: "<b>BLOSSOM:</b> Make words using 7 letters. MUST use center letter! Letters can be reused." },
    memory: { en: "<b>MEMORY:</b> Match pairs! Type two numbers in chat (e.g. '3 7')." },
    duckdoku: { en: "<b>DUCKDOKU:</b> Sudoku with Ducks! Type coords and emoji (e.g. 'A1 🦆')." },
    meowdoku: { en: "<b>MEOWDOKU:</b> Sudoku with Cats! Type coords (e.g. 'C3 😻')." },
    murdoku: { en: "<b>MURDOKU:</b> Killer Sudoku. Cages must sum up correctly. Type 'A1 5'." },
    kakuro: { en: "<b>KAKURO:</b> Cross sums. Fill blanks to match row/col sums. Type 'B2 9'." },
    nonogram: { en: "<b>NONOGRAM:</b> Paint the grid! Type 'A1 FILL' or 'B2 EMPTY'." },
    worldle: { en: "<b>WORLDLE:</b> Guess the country by shape. Get distance hints!" },
    globle: { en: "<b>GLOBLE:</b> Guess any country. Hotter colors = closer to target!" },
    capitale: { en: "<b>CAPITALE:</b> Guess the Capital City!" },
    animadle: { en: "<b>ANIMADLE:</b> Guess the animal to reveal its Class, Diet, and Habitat!" },
    redactle: { en: "<b>REDACTLE:</b> Guess words to un-redact the Wikipedia article!" }
};
function updateInstructions() { instBar.innerHTML = INST[activeGame]?.en || "Rules loaded."; }

// --- 🚀 INSTANT BOOT & TRUE MULTITHREADING DICTIONARY ---
async function bootSystem() {
    try {
        // 1. Instant Boot (10k Words only takes 50ms to parse)
        const res = await fetch('https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english-no-swears.txt');
        const text = await res.text();
        text.split(/\r?\n/).forEach(w => { const c = w.trim().toUpperCase(); if(c) { if(!dictCommon[c.length]) dictCommon[c.length]=[]; dictCommon[c.length].push(c); } });
        dictAll = JSON.parse(JSON.stringify(dictCommon)); // Deep copy as fallback
        
        startNewRound(); // Start games instantly

        // 2. Web Worker (Downloads & Parses 370k words on a separate CPU core, ZERO lag)
        const workerCode = `
            self.onmessage = async function() {
                try {
                    const res = await fetch('https://raw.githubusercontent.com/dwyl/english-words/master/words_alpha.txt');
                    const text = await res.text();
                    const words = text.split(/\\r?\\n/);
                    let dict = {};
                    for(let i=0; i<words.length; i++){
                        let w = words[i].trim().toUpperCase();
                        if(w) { if(!dict[w.length]) dict[w.length] = []; dict[w.length].push(w); }
                        if(i % 10000 === 0) self.postMessage({status: 'progress', pct: Math.floor((i/words.length)*100)});
                    }
                    self.postMessage({status: 'done', dict: dict});
                } catch(e) { self.postMessage({status: 'error'}); }
            }
        `;
        const blob = new Blob([workerCode], { type: 'application/javascript' });
        const worker = new Worker(URL.createObjectURL(blob));
        
        worker.onmessage = function(e) {
            const badge = document.getElementById('sys-mode-badge');
            if (e.data.status === 'progress') {
                badge.innerText = `🔄 LOADING DICT: ${e.data.pct}%`;
            } else if (e.data.status === 'done') {
                dictAll = e.data.dict;
                badge.innerText = sysMode === 'live' ? '🟢 LIVE NOW' : sysMode === 'demo' ? '🟣 DEMO MODE' : '🟡 PREVIEW MODE';
                console.log("✅ 370k Lexicon loaded successfully in background thread.");
            }
        };
        worker.postMessage('start');

    } catch (err) { logError(err, "Network fetch failed."); }
}
bootSystem();

function getValidTargets(arr) { return arr ? arr.filter(w => !w.endsWith('S') && !w.endsWith('ES') && !w.endsWith('ED')) : []; }
function prefetchDef(word) {
    preloadedDef = "Formal definition currently unavailable.";
    if(['worldle','globle','capitale','animadle'].includes(activeGame)) { preloadedDef = "Geography & Nature Database!"; return; }
    fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${word.toLowerCase()}`).then(res => res.json()).then(data => { preloadedDef = data[0].meanings[0].definitions[0].definition; }).catch(e=>{});
}

// --- ⌨️ VIRTUAL KEYBOARD ---
function renderKeyboard() {
    if(activeGame !== 'word500') { vKeyboard.style.display = 'none'; return; }
    vKeyboard.style.display = 'flex';
    vKeyboard.innerHTML = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"].map(r => 
        `<div class="kbd-row">${r.split('').map(l => {
            let c = keyState[l] === 'green' ? 'bg-green' : keyState[l] === 'yellow' ? 'bg-yellow' : keyState[l] === 'red' ? 'bg-red' : keyState[l] === 'used' ? 'bg-used' : '';
            return `<div class="key-btn ${c}" onclick="cycleKeyColor('${l}')">${l}</div>`;
        }).join('')}</div>`
    ).join('');
}
window.cycleKeyColor = function(l) {
    let c = keyState[l];
    if(!c || c==='used') keyState[l] = 'red'; else if(c === 'red') keyState[l] = 'yellow'; else if(c === 'yellow') keyState[l] = 'green'; else delete keyState[l];
    renderKeyboard();
}

// --- 🎮 MASTER ROUTER ---
function startNewRound() {
    isGameOver = false; board.innerHTML = ""; keyState = {}; updateInstructions(); fetchLeaderboard();
    
    if(activeGame === 'word500') setupWord500(); 
    else if(activeGame === 'contexto') setupContexto(); 
    else if(activeGame === 'wordsearch') setupWordSearch();
    else if(activeGame === 'blossom') setupBlossom();
    else if(activeGame === 'memory') setupMemory();
    else if(['duckdoku','meowdoku','murdoku','kakuro','nonogram'].includes(activeGame)) setupGridGame(activeGame);
    else if(['worldle','globle','capitale'].includes(activeGame)) setupGeoGame(activeGame);
    else if(activeGame === 'animadle') setupAnimadle();
    else if(activeGame === 'redactle') setupRedactle();
}

// 🟩 1. WORD 500
function setupWord500() {
    document.getElementById('game-title').innerText = "WORD 500";
    let list = getValidTargets((difficulty === 'easy' || difficulty === 'moderate') ? dictCommon[wordLength] : dictAll[wordLength]);
    if(!list || list.length===0) list = dictAll[wordLength];
    secretWord = list[Math.floor(Math.random() * list.length)]; prefetchDef(secretWord); renderKeyboard();
}
function handleWord500Guess(guess, user) {
    if (guess.length !== wordLength) return;
    if(!dictAll[wordLength].includes(guess) && !dictCommon[wordLength].includes(guess)) return;
    
    let green = 0, yellow = 0, secArr = secretWord.split(''), gsArr = guess.split('');
    for (let i=0; i<wordLength; i++) { if (gsArr[i] === secArr[i]) { green++; secArr[i] = null; gsArr[i] = null; } }
    for (let i=0; i<wordLength; i++) { if (gsArr[i] !== null) { let idx = secArr.indexOf(gsArr[i]); if (idx !== -1) { yellow++; secArr[idx] = null; } } }
    
    if(green === 0 && yellow === 0) guess.split('').forEach(l => { if(!keyState[l]) keyState[l] = 'used'; }); 
    renderKeyboard();
    
    let row = document.createElement('div'); row.className = "w-row";
    row.innerHTML = `<div class="w-player">${user.username}</div><div class="w-letters">${guess.split('').map(l => `<div class="w-letter">${l}</div>`).join('')}</div><div class="w-clues"><div class="w-clue bg-green">${green}</div><div class="w-clue bg-yellow">${yellow}</div><div class="w-clue bg-red">${wordLength-green-yellow}</div></div>`;
    board.prepend(row);
    if(board.children.length > Math.max(6, 20-wordLength)) board.removeChild(board.lastChild);
    if (green === wordLength) triggerEndGame(user, guess, 1);
}

// 🎯 2. CONTEXTO
async function setupContexto() {
    vKeyboard.style.display = 'none'; contextoGuesses = []; bestContextoRank = 1000;
    document.getElementById('game-title').innerText = "CONTEXTO";
    board.innerHTML = `<div class="text-yellow-400 animate-pulse mt-10 font-bold tracking-widest text-xl text-center w-full">🧠 AI Building Semantic Tree...</div>`;
    let len = (difficulty === 'hard' || difficulty === 'extreme') ? Math.floor(Math.random() * 3) + 7 : Math.floor(Math.random() * 3) + 4;
    let list = getValidTargets(dictCommon[len]); secretWord = list[Math.floor(Math.random() * list.length)]; prefetchDef(secretWord);
    try {
        const res = await fetch(`https://api.datamuse.com/words?ml=${secretWord}&max=1000`);
        contextoData = (await res.json()).map(i => i.word.toUpperCase()); contextoData.unshift(secretWord);
        board.innerHTML = `<div class="contexto-list" id="contexto-board"></div>`;
    } catch (err) { activeGame = 'word500'; startNewRound(); }
}
function handleContextoGuess(guess, user) {
    if(!dictAll[guess.length]?.includes(guess) && !dictCommon[guess.length]?.includes(guess)) { showToast("⚠️ Not a dictionary word!"); return; }
    if(contextoGuesses.some(g => g.word === guess)) { showToast("⚠️ Already guessed!"); return; }
    let rank = contextoData.indexOf(guess);
    if (rank === -1) { let hash = 0; for (let i = 0; i < guess.length; i++) hash = guess.charCodeAt(i) + ((hash << 5) - hash); rank = 1001 + (Math.abs(hash) % 89000); }
    if(rank < bestContextoRank) bestContextoRank = rank;
    contextoGuesses.push({ word: guess, rank: rank, username: user.username });
    contextoGuesses.sort((a, b) => a.rank - b.rank); 
    const cBoard = document.getElementById('contexto-board'); if(!cBoard) return; cBoard.innerHTML = "";
    contextoGuesses.slice(0, 10).forEach(g => {
        let percent = Math.max(5, 100 - (g.rank / 100)); let color = g.rank === 0 ? '#22c55e' : g.rank < 50 ? '#eab308' : g.rank < 500 ? '#f97316' : '#6b7280';
        let bar = document.createElement('div'); bar.className = "contexto-bar mt-2";
        bar.innerHTML = `<div class="contexto-fill" style="width: ${percent}%; background-color: ${color};"></div><div class="contexto-text">${g.word} <span class="ml-2 text-xs text-white/50 lowercase">@${g.username}</span></div><div class="contexto-rank">#${g.rank}</div>`;
        cBoard.appendChild(bar);
    });
    if (rank === 0) triggerEndGame(user, guess, 2); else if (rank <= 10) updateScore(user, 1);
}

// 🔍 3. WORD SEARCH
function setupWordSearch() {
    vKeyboard.style.display = 'none'; colorIdx = 0;
    document.getElementById('game-title').innerText = "WORD SEARCH";
    let size = difficulty === 'easy' ? 10 : difficulty === 'moderate' ? 12 : difficulty === 'hard' ? 15 : 18;
    let count = difficulty === 'easy' ? 15 : difficulty === 'moderate' ? 20 : difficulty === 'hard' ? 25 : 30;

    let valid = getValidTargets(dictCommon[4].concat(dictCommon[5], dictCommon[6]).filter(w => w.length <= size - 2));
    let chosen = []; for(let i=0; i<count; i++) chosen.push(valid[Math.floor(Math.random() * valid.length)]);
    let grid = Array(size).fill(null).map(() => Array(size).fill(''));
    let placedInfo = [];
    let dirs = [[0,1,"Horizontal"], [1,0,"Vertical"]]; if(difficulty !== 'easy') dirs.push([1,1,"Diagonal"]);

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
    let html = `<div class="ws-grid" style="grid-template-columns: repeat(${size}, 1fr);">`;
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    for(let r=0; r<size; r++) for(let c=0; c<size; c++) {
        let char = grid[r][c] || letters.charAt(Math.floor(Math.random() * letters.length));
        html += `<div class="ws-cell" id="c-${r}-${c}">${char}</div>`;
    }
    html += `</div><div class="ws-clue-list">`;
    placedInfo.forEach(w => html += `<div class="ws-clue-item" id="wsc-${w.word}"><span class="ws-clue-text">${w.len} Letters</span><div class="flex items-center gap-2 hidden" id="ws-finder-${w.word}"></div></div>`);
    board.innerHTML = html + `</div>`;
}
function handleWordSearchGuess(guess, user) {
    let target = wordSearchData.words.find(w => w.word === guess);
    if(target) {
        let pColor = playerColors[colorIdx % playerColors.length]; colorIdx++;
        target.coords.forEach((coord, idx) => { 
            let c = document.getElementById(`c-${coord}`);
            c.classList.add('highlight'); c.style.setProperty('--user-color', pColor); 
            if(target.dir === "Horizontal") { if(idx === 0) c.classList.add('ws-start-horiz'); else if(idx === target.coords.length-1) c.classList.add('ws-end-horiz'); } 
            else if (target.dir === "Vertical") { if(idx === 0) c.classList.add('ws-start-vert'); else if(idx === target.coords.length-1) c.classList.add('ws-end-vert'); } 
            else { c.classList.add('ws-diag-edge'); }
        });
        
        let itemEl = document.getElementById(`wsc-${guess}`); itemEl.classList.add('found');
        let finderEl = document.getElementById(`ws-finder-${guess}`); finderEl.classList.remove('hidden');
        finderEl.innerHTML = `<img src="${user.profilePic}" class="w-8 h-8 rounded-full border border-white"><span class="text-sm font-black uppercase" style="color:${pColor}">@${user.username}</span>`;
        
        wordSearchData.words = wordSearchData.words.filter(w => w.word !== guess);
        updateScore(user, 1); confetti({ particleCount: 50, spread: 70, origin: { y: 0.8 } });
        if(wordSearchData.words.length === 0) triggerEndGame(user, "GRID CLEARED", 0);
    }
}

// 🌸 4. BLOSSOM
function setupBlossom() {
    vKeyboard.style.display = 'none'; document.getElementById('game-title').innerText = "BLOSSOM";
    const pangrams = ["ABOLISH", "CABINET", "ECLIPSE", "GLACIER", "JOURNEY", "KINETIC", "LOBSTER", "MACHINE", "PELICAN", "QUANTUM", "RAVIOLI", "SOCIETY", "VAMPIRE", "WHISKEY", "YOGURTS", "ZEALOUS"];
    let pan = pangrams[Math.floor(Math.random() * pangrams.length)].split('');
    let center = pan[Math.floor(Math.random() * 7)]; let outers = pan.filter(l => l !== center);
    
    let targets = [];
    Object.keys(dictCommon).forEach(len => {
        if(len >= 4) dictCommon[len].forEach(w => {
            if(w.includes(center)) {
                let valid = true; for(let i=0; i<w.length; i++) { if(!pan.includes(w[i])) { valid=false; break; } }
                if(valid) targets.push(w);
            }
        });
    });
    blossomData = { center, outers, found: [], targets };
    
    let angle = 0, html = `<div class="blossom-container"><div class="petal center"><span>${center}</span></div>`;
    outers.forEach(l => {
        let x = Math.cos(angle) * 100; let y = Math.sin(angle) * 100; let rot = angle * (180/Math.PI);
        html += `<div class="petal" style="transform: translate(calc(-50% + ${x}px), calc(-50% + ${y}px)); top: 50%; left: 50%;"><span>${l}</span></div>`;
        angle += (Math.PI * 2) / 6;
    });
    html += `</div><div class="text-yellow-400 font-black text-2xl mt-6 text-center w-full">FOUND: <span id="blossom-count">0</span> / ${targets.length}</div><div class="flex flex-wrap gap-2 mt-4 w-full justify-center max-w-4xl" id="blossom-found-list"></div>`;
    board.innerHTML = html;
}
function handleBlossomGuess(guess, user) {
    if(blossomData.targets.includes(guess) && !blossomData.found.includes(guess)) {
        blossomData.found.push(guess); document.getElementById('blossom-count').innerText = blossomData.found.length;
        let pColor = playerColors[colorIdx % playerColors.length]; colorIdx++;
        let isPan = true; [blossomData.center, ...blossomData.outers].forEach(l => { if(!guess.includes(l)) isPan = false; });
        
        let item = document.createElement('div'); item.className = "premium-panel px-4 py-2 flex items-center gap-2"; item.style.borderColor = pColor;
        item.innerHTML = `<span class="text-2xl font-black ${isPan ? 'text-yellow-400' : 'text-white'}">${guess}</span> <img src="${user.profilePic}" class="w-8 h-8 rounded-full ml-2 border border-white">`;
        document.getElementById('blossom-found-list').prepend(item);
        
        updateScore(user, isPan ? 2 : 1); if(isPan) confetti({ particleCount: 100, origin: { y: 0.6 } });
        if(blossomData.found.length === blossomData.targets.length || blossomData.found.length >= 25) triggerEndGame(user, "BLOSSOM MASTERED", 0);
    }
}

// 🎴 5. MEMORY
function setupMemory() {
    vKeyboard.style.display = 'none'; document.getElementById('game-title').innerText = "MEMORY";
    let pairs = difficulty === 'easy' ? 4 : difficulty === 'moderate' ? 6 : difficulty === 'hard' ? 10 : 15;
    const emojis = ["🍎","🚗","🐶","⚽","🎸","🚀","💎","🔥","🍕","🧩","👻","🦄","🥑","🎧","🏆","🦖"];
    let deck = []; for(let i=0; i<pairs; i++) { deck.push(emojis[i]); deck.push(emojis[i]); }
    deck.sort(() => Math.random() - 0.5); 
    memoryData = { cards: deck, flipped: [], matched: 0, lock: false };
    
    let cols = pairs <= 6 ? 4 : pairs <= 10 ? 5 : 6;
    let html = `<div class="memory-grid max-w-4xl" style="grid-template-columns: repeat(${cols}, 1fr);">`;
    deck.forEach((c, i) => { html += `<div class="memory-card" id="mem-${i}"><span>${i+1}</span><span class="hidden">${c}</span></div>`; });
    board.innerHTML = html + `</div>`;
}
function handleMemoryGuess(guess, user) {
    if(memoryData.lock) return; const match = guess.match(/^(\d+)\s+(\d+)$/); if(!match) return;
    let i1 = parseInt(match[1]) - 1, i2 = parseInt(match[2]) - 1;
    if(i1 === i2 || i1 < 0 || i2 < 0 || i1 >= memoryData.cards.length || i2 >= memoryData.cards.length) return;
    
    let c1 = document.getElementById(`mem-${i1}`), c2 = document.getElementById(`mem-${i2}`);
    if(c1.classList.contains('matched') || c2.classList.contains('matched')) return;

    memoryData.lock = true; c1.classList.add('flipped'); c2.classList.add('flipped');
    c1.children[0].classList.add('hidden'); c1.children[1].classList.remove('hidden');
    c2.children[0].classList.add('hidden'); c2.children[1].classList.remove('hidden');

    setTimeout(() => {
        if(memoryData.cards[i1] === memoryData.cards[i2]) {
            c1.classList.add('matched'); c2.classList.add('matched'); memoryData.matched += 2;
            updateScore(user, 1); showToast(`✅ @${user.username} matched ${memoryData.cards[i1]}!`); confetti({ particleCount: 40, origin: { y: 0.8 } });
            if(memoryData.matched === memoryData.cards.length) triggerEndGame(user, "MEMORY CLEARED", 0);
        } else {
            c1.classList.remove('flipped'); c2.classList.remove('flipped');
            c1.children[0].classList.remove('hidden'); c1.children[1].classList.add('hidden');
            c2.children[0].classList.remove('hidden'); c2.children[1].classList.add('hidden');
        }
        memoryData.lock = false;
    }, 2000);
}

// 🧩 6-10. ALGEBRAIC GRIDS
function setupGridGame(type) {
    vKeyboard.style.display = 'none'; document.getElementById('game-title').innerText = type.toUpperCase();
    let size = type === 'nonogram' ? 5 : 4; 
    let elements = type === 'duckdoku' ? ["🦆","🦢","🦉","🐧"] : type === 'meowdoku' ? ["😺","😻","🙀","😾"] : ["1","2","3","4"];
    gridData = { type, size, board: Array(size).fill().map(()=>Array(size).fill('')), solution: Array(size).fill().map(()=>Array(size).fill('')) };
    
    for(let r=0; r<size; r++) for(let c=0; c<size; c++) {
        gridData.solution[r][c] = type==='nonogram' ? (Math.random()>0.5?'FILL':'EMPTY') : elements[(r+c)%size];
        gridData.board[r][c] = Math.random()>0.4 ? gridData.solution[r][c] : ''; 
    }
    renderAlgebraicGrid();
}
function renderAlgebraicGrid() {
    let cols = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let html = `<div class="alg-grid-wrapper"><div class="alg-row"><div class="alg-cell alg-label"></div>`;
    for(let c=0; c<gridData.size; c++) html += `<div class="alg-cell alg-label">${cols[c]}</div>`;
    html += `</div>`;
    for(let r=0; r<gridData.size; r++) {
        html += `<div class="alg-row"><div class="alg-cell alg-label">${r+1}</div>`;
        for(let c=0; c<gridData.size; c++) {
            let val = gridData.board[r][c];
            let css = (gridData.type === 'nonogram' && val === 'FILL') ? 'filled' : val !== '' ? 'text-white' : '';
            html += `<div class="alg-cell ${css}" id="alg-${r}-${c}">${val==='FILL'||val==='EMPTY'?'':val}</div>`;
        }
        html += `</div>`;
    }
    board.innerHTML = html + `</div>`;
}
function handleGridGuess(guess, user) {
    const match = guess.match(/^([A-Z])(\d+)\s+(.+)$/);
    if(match) {
        let c = match[1].charCodeAt(0) - 65, r = parseInt(match[2]) - 1, val = match[3];
        if(r >= 0 && r < gridData.size && c >= 0 && c < gridData.size && gridData.solution[r][c] === val) {
            gridData.board[r][c] = val; renderAlgebraicGrid(); showToast(`✅ ${user.username} solved ${match[1]}${match[2]}!`); confetti({ particleCount: 30 });
            updateScore(user, 1);
        }
    }
}

// 🌍 11-13. GEO GAMES
function setupGeoGame(type) {
    vKeyboard.style.display = 'none'; document.getElementById('game-title').innerText = type.toUpperCase();
    let t; do { t = COUNTRIES[Math.floor(Math.random() * COUNTRIES.length)]; } while (geoData.target && t.name === geoData.target.name);
    geoData = { type, target: t }; secretWord = type === 'capitale' ? t.cap : t.name; prefetchDef(secretWord);

    if(type === 'worldle') {
        board.innerHTML = `<img src="https://raw.githubusercontent.com/djaiss/mapsicon/master/all/${t.iso}/vector.svg" class="worldle-img" onerror="this.style.display='none'">
        <div id="geo-list" class="w-full max-w-xl mt-4 flex flex-col gap-2"></div>`;
    } else board.innerHTML = `<div id="geo-list" class="w-full max-w-xl mt-4 flex flex-col gap-2"></div>`;
}
function handleGeoGuess(guess, user) {
    let country = COUNTRIES.find(c => c.name === guess || c.cap === guess);
    if(!country) { showToast(`⚠️ @${user.username}, '${guess}' is not a recognized geography target.`); return; }
    
    // Haversine
    const R = 6371; const dLat = (country.lat - geoData.target.lat)*Math.PI/180; const dLon = (country.lon - geoData.target.lon)*Math.PI/180;
    const a = Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(geoData.target.lat*Math.PI/180)*Math.cos(country.lat*Math.PI/180)*Math.sin(dLon/2)*Math.sin(dLon/2);
    let dist = Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
    if(country.name === geoData.target.name) dist = 0;

    let pct = Math.max(0, Math.round(100 - (dist / 150)));
    let css = activeGame==='globle' ? (dist===0?'globle-hot':dist<3000?'globle-warm':'globle-cold') : '';
    
    let row = document.createElement('div'); row.className = `geo-row ${css}`;
    row.innerHTML = `<span class="w-1/3 truncate">${guess}</span> <span class="text-gray-400">${dist===0?'🎯 MATCH': dist+'km'}</span> <span class="${pct>90?'text-green-400':pct>50?'text-yellow-400':'text-red-400'}">${pct}%</span>`;
    document.getElementById('geo-list').prepend(row);
    if(dist === 0) triggerEndGame(user, secretWord, 2); else updateScore(user, 1);
}

// 🐾 14. ANIMADLE
function setupAnimadle() {
    vKeyboard.style.display = 'none'; document.getElementById('game-title').innerText = "ANIMADLE";
    geoData.target = ANIMALS[Math.floor(Math.random() * ANIMALS.length)]; secretWord = geoData.target.name; prefetchDef(secretWord);
    board.innerHTML = `<div class="flex gap-2 text-sm font-bold text-gray-400 uppercase w-full max-w-2xl px-4 mt-10"><span class="flex-1">Guess</span><span class="w-24 text-center">Class</span><span class="w-24 text-center">Diet</span><span class="w-24 text-center">Habitat</span></div><div id="geo-list" class="w-full max-w-2xl flex flex-col gap-2"></div>`;
}
function handleAnimadleGuess(guess, user) {
    let anim = ANIMALS.find(a => a.name === guess);
    if(!anim) { showToast(`⚠️ Not in Animal DB.`); return; }
    let t = geoData.target;
    let c1 = anim.class === t.class ? 'text-green-400' : 'text-red-400';
    let c2 = anim.diet === t.diet ? 'text-green-400' : 'text-red-400';
    let c3 = anim.habitat === t.habitat ? 'text-green-400' : 'text-red-400';
    let row = document.createElement('div'); row.className = "geo-row";
    row.innerHTML = `<span class="truncate w-1/4">${guess}</span> <span class="${c1} w-24 text-center">${anim.class}</span> <span class="${c2} w-24 text-center">${anim.diet}</span> <span class="${c3} w-24 text-center">${anim.habitat}</span>`;
    document.getElementById('geo-list').prepend(row);
    if(anim.name === t.name) triggerEndGame(user, secretWord, 2); else updateScore(user, 1);
}

// ⬛ 15. REDACTLE
async function setupRedactle() {
    vKeyboard.style.display = 'none'; document.getElementById('game-title').innerText = "REDACTLE";
    board.innerHTML = `<div class="text-yellow-400 animate-pulse mt-10 text-xl font-bold">📡 Fetching Wiki Database...</div>`;
    const topics = ["Earth", "Computer", "Ocean", "Music", "Science"];
    secretWord = topics[Math.floor(Math.random() * topics.length)].toUpperCase(); prefetchDef(secretWord);
    try {
        const res = await fetch(`https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&titles=${secretWord}&format=json&origin=*`);
        const data = await res.json();
        let text = data.query.pages[Object.keys(data.query.pages)[0]].extract;
        redactleData = { words: text.split(/\s+/), revealed: ["THE","IS","IN","OF","AND","A","TO","OR","AS","IT"] };
        renderRedactle();
    } catch(err) { board.innerHTML = "Wiki API Error."; }
}
function renderRedactle() {
    let html = `<div class="redactle-board w-full max-w-4xl">`;
    redactleData.words.forEach(w => {
        let clean = w.replace(/[^a-zA-Z]/g, "").toUpperCase();
        if(redactleData.revealed.includes(clean)) html += `<span class="redact-word revealed">${w}</span> `;
        else html += `<span class="redact-word">${"█".repeat(clean.length||1)}</span> `;
    });
    board.innerHTML = html + `</div>`;
}
function handleRedactleGuess(guess, user) {
    let clean = guess.replace(/[^A-Z]/g, "");
    if(clean && !redactleData.revealed.includes(clean)) {
        redactleData.revealed.push(clean); renderRedactle();
        if(clean === secretWord) triggerEndGame(user, secretWord, 5); else updateScore(user, 1);
    }
}

// --- 🤖 BOTS & INPUT PIPELINE ---
socket.on('sys_status', status => {
    if(sysMode !== 'demo') {
        let isDemoMode = status === 'DEMO'; sysMode = isDemoMode ? 'preview' : 'live';
        const b = document.getElementById('sys-mode-badge');
        b.className = `status-badge ${isDemoMode ? 'status-preview' : 'status-live'}`; b.innerText = isDemoMode ? '🟡 PREVIEW' : '🟢 LIVE';
    }
});
socket.on('chat', data => { if(sysMode === 'live') processInput(data.comment, data); });

setInterval(() => {
    if(sysMode === 'demo' && !isGameOver) {
        let intel = Math.random(); let fake = {username: intel>0.8?"EinsteinBot":intel>0.4?"AvgBot":"NoobBot", profilePic: "https://ui-avatars.com/api/?name=B"}; let g = "";
        
        if(activeGame==='word500') g = intel>0.8?secretWord:dictCommon[wordLength]?.[Math.floor(Math.random()*dictCommon[wordLength].length)];
        else if(activeGame==='contexto') g = intel>0.9?secretWord:contextoData[Math.max(1, bestContextoRank-Math.floor(Math.random()*50))]||secretWord;
        else if(activeGame==='wordsearch') { if(intel>0.4 && wordSearchData.words.length>0) g = wordSearchData.words[0].word; }
        else if(activeGame==='blossom') { if(intel>0.5 && blossomData.targets.length>0) g = blossomData.targets[Math.floor(Math.random()*blossomData.targets.length)]; }
        else if(activeGame==='memory') { g = `${Math.floor(Math.random()*memoryData.cards.length)+1} ${Math.floor(Math.random()*memoryData.cards.length)+1}`; }
        else if(['worldle','globle','capitale'].includes(activeGame)) { g = intel>0.9?secretWord:COUNTRIES[Math.floor(Math.random()*COUNTRIES.length)].name; }
        else if(activeGame==='animadle') g = intel>0.9?secretWord:ANIMALS[Math.floor(Math.random()*ANIMALS.length)].name;
        
        if(g) processInput(g, fake);
    }
}, 3000);

document.getElementById('host-test-input').addEventListener('keydown', (e) => { 
    if(e.key === 'Enter' || e.key === 'ArrowDown') { let i = e.target; if(i.value) processInput(i.value, {uniqueId: 'host', username: 'HOST', profilePic: 'https://ui-avatars.com/api/?name=H'}); i.value = ""; }
});
document.getElementById('btn-test-guess').addEventListener('click', () => { let i = document.getElementById('host-test-input'); if(i.value) processInput(i.value, {uniqueId: 'host', username: 'HOST', profilePic: 'https://ui-avatars.com/api/?name=H'}); i.value = ""; });

function processInput(guess, user) {
    if (isGameOver) return; guess = guess.trim().toUpperCase();
    if(board.children[0] && board.children[0].innerText.includes("System")) board.innerHTML = "";

    if(['duckdoku','meowdoku','murdoku','kakuro','nonogram'].includes(activeGame)) handleGridGuess(guess, user);
    else if(['worldle','globle','capitale'].includes(activeGame)) handleGeoGuess(guess, user);
    else if(activeGame === 'animadle') handleAnimadleGuess(guess, user);
    else if(activeGame === 'redactle') handleRedactleGuess(guess, user);
    else if (activeGame === 'memory') handleMemoryGuess(guess, user);
    else if (!/^[A-Z]+$/.test(guess)) return; 
    else if (activeGame === 'word500') handleWord500Guess(guess, user); 
    else if (activeGame === 'contexto') handleContextoGuess(guess, user); 
    else if (activeGame === 'wordsearch') handleWordSearchGuess(guess, user);
    else if (activeGame === 'blossom') handleBlossomGuess(guess, user);
}

// --- 🏆 SCORE & ENDGAME ---
function updateScore(u, p) { 
    if(p>0 && u.uniqueId!=='host') { fetch('/api/score', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({uniqueId:u.uniqueId, username:u.username, profilePic:u.profilePic, game:activeGame, points:p})}); }
    fetchLeaderboard(); 
}
function fetchLeaderboard() {
    fetch('/api/leaderboard').then(r=>r.json()).then(d => {
        const t = document.getElementById('leaderboard-ticker');
        if(d.length===0) t.innerHTML = `<div class="ticker-item text-yellow-400">WAITING FOR SCORES...</div>`;
        else { let h = ""; for(let i=0; i<3; i++) { d.forEach((p, idx) => { h += `<div class="ticker-item">${idx===0?"🥇":idx===1?"🥈":idx===2?"🥉":`🏅 #${idx+1}`} <img src="${p.profile_pic}" class="w-6 h-6 rounded-full border border-white"> <span class="text-teal-400">${p.username}</span> : ${p.total_score} PTS</div>`; }); } t.innerHTML = h; }
    });
}
socket.on('leaderboard_reset', fetchLeaderboard);

function triggerEndGame(user, word, pts = 0) {
    isGameOver = true; updateScore(user, pts);
    confetti({ particleCount: 300, spread: 150, origin: { y: 0.5 }, zIndex: 9999 });

    const m = document.getElementById('winner-modal');
    document.getElementById('winner-pic').src = user.profilePic; document.getElementById('winner-name').innerText = user.username; document.getElementById('winning-word').innerText = word; document.getElementById('word-def').innerText = preloadedDef; 
    let fw = document.getElementById('winning-word'); fw.style.fontSize = word.length > 10 ? 'clamp(2rem, 6vw, 4rem)' : 'clamp(3rem, 10vw, 8rem)';
    document.getElementById('def-box').style.display = ['worldle','globle','capitale','animadle'].includes(activeGame) ? 'none' : 'block';
    
    m.classList.remove('hidden'); m.classList.add('flex'); gsap.to(m, { opacity: 1, duration: 0.3 });
    setTimeout(() => { gsap.to(m, { opacity: 0, duration: 0.3, onComplete: () => { m.classList.add('hidden'); m.classList.remove('flex'); startNewRound(); }}); }, 5000);
}

// --- UI & HOST ACTIONS ---
function showToast(msg, isHint=false) { const c = document.getElementById('toast-container'), t = document.createElement('div'); t.className = `toast ${isHint?'hint':''}`; t.innerHTML = msg; c.prepend(t); setTimeout(() => { if(t.parentNode) t.remove(); }, 6000); }

document.getElementById('btn-hint').addEventListener('click', () => {
    if (activeGame === 'word500') showToast(`💡 HINT: Letter ${Math.floor(Math.random()*secretWord.length)+1} is <b>[ ${secretWord.charAt(Math.floor(Math.random()*secretWord.length))} ]</b>`, true);
    else if (activeGame === 'contexto') { let t = Math.floor(bestContextoRank/2); if(t<1)t=1; let w = contextoData[t]||secretWord; processInput(w, {username: "SYSTEM HINT", profilePic: "https://ui-avatars.com/api/?name=SYS&background=eab308"}); showToast(`💡 INJECTED Rank #${t} to board.`, true); }
    else if (activeGame === 'wordsearch' && wordSearchData.words.length>0) { let w = wordSearchData.words[0]; showToast(`💡 HINT: Find <b>[ ${w.word} ]</b> starting at ${w.start} going ${w.dir}!`, true); }
    else if (activeGame === 'blossom') { showToast(`💡 HINT: Find a word starting with <b>[ ${blossomData.targets[Math.floor(Math.random()*blossomData.targets.length)].charAt(0)} ]</b>`, true); }
    else if (['worldle','globle','capitale'].includes(activeGame)) { showToast(`💡 HINT: The target is ${secretWord.length} letters long!`, true); }
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

// Drag setup
makeDraggable('instruction-wrapper', 'inst-drag');
makeDraggable('chat-wrapper', 'chat-drag');
