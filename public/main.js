const socket = io();

// --- STATE ---
let activeGame = 'word500';
let sysMode = 'preview'; 
let secretWord = "", isGameOver = false;

// Universal Game Data Objects
let gridData = { board: [], solution: [], type: '' }; 
let geoData = { target: null, type: '' }; 
let redactleData = { words: [], revealed: [] };
let dictAll = {}, dictCommon = {}; 
let contextoData = [], contextoGuesses = [], bestContextoRank = 1000;
let wordSearchData = { grid: [], words: [], size: 0 };
let blossomData = { center: '', outers: [], found: [], targets: [] };
let memoryData = { cards: [], flipped: [], matched: 0, lock: false };
let playerColors = ["#ef4444", "#3b82f6", "#a855f7", "#f97316", "#ec4899", "#14b8a6", "#fde047"];
let colorIdx = 0, preloadedDef = "", keyState = {}; 

const board = document.getElementById('game-board');
const vKeyboard = document.getElementById('virtual-keyboard');

// --- DATABASES ---
const COUNTRIES = [
    { name: "UNITED STATES", cap: "WASHINGTON", lat: 37.09, lon: -95.71 }, { name: "CANADA", cap: "OTTAWA", lat: 56.13, lon: -106.34 },
    { name: "BRAZIL", cap: "BRASILIA", lat: -14.23, lon: -51.92 }, { name: "FRANCE", cap: "PARIS", lat: 46.22, lon: 2.21 },
    { name: "JAPAN", cap: "TOKYO", lat: 36.20, lon: 138.25 }, { name: "AUSTRALIA", cap: "CANBERRA", lat: -25.27, lon: 133.77 },
    { name: "INDONESIA", cap: "JAKARTA", lat: -0.78, lon: 113.92 }, { name: "MALAYSIA", cap: "KUALA LUMPUR", lat: 4.21, lon: 101.97 }
];
const ANIMALS = [
    { name: "LION", class: "Mammal", diet: "Carnivore", habitat: "Savanna" }, { name: "EAGLE", class: "Bird", diet: "Carnivore", habitat: "Mountains" },
    { name: "FROG", class: "Amphibian", diet: "Carnivore", habitat: "Swamp" }, { name: "SHARK", class: "Fish", diet: "Carnivore", habitat: "Ocean" }
];

const INST = {
    word500: { en: "<b>WORD500:</b> Guess the word." },
    duckdoku: { en: "<b>DUCKDOKU:</b> Sudoku with Ducks! Type coords like 'A1 🦆' or 'B2 🦢'." },
    meowdoku: { en: "<b>MEOWDOKU:</b> Sudoku with Cats! Type 'C3 😻'." },
    murdoku: { en: "<b>MURDOKU:</b> Killer Sudoku. Cages must sum up correctly. Type 'A1 5'." },
    kakuro: { en: "<b>KAKURO:</b> Cross sums. Fill blanks to match row/col sums. Type 'A2 9'." },
    nonogram: { en: "<b>NONOGRAM:</b> Paint the grid! Type 'A1 FILL' or 'B2 EMPTY'." },
    worldle: { en: "<b>WORLDLE:</b> Guess the country by shape. Get distance hints!" },
    globle: { en: "<b>GLOBLE:</b> Guess any country. Hotter colors = closer to target!" },
    capitale: { en: "<b>CAPITALE:</b> Guess the Capital City!" },
    animadle: { en: "<b>ANIMADLE:</b> Guess the animal to reveal its Class, Diet, and Habitat!" },
    redactle: { en: "<b>REDACTLE:</b> Guess words to un-redact the Wikipedia article!" },
    wordsearch: { en: "<b>WORD SEARCH:</b> Find the hidden words in the grid!" },
    blossom: { en: "<b>BLOSSOM:</b> Make words using 7 letters. MUST use center letter!" },
    memory: { en: "<b>MEMORY:</b> Match pairs! Type two numbers in chat (e.g. '3 7')." }
};

let isLoadingDictionaries = false;
function updateInstructions() { 
    if(!isLoadingDictionaries) {
        document.getElementById('game-instructions').innerHTML = INST[activeGame]?.en || "Rules loaded."; 
    }
}

// --- 🚀 V14 ENGINE: ASYNC LAZY-LOADING & CHUNKED PROCESSING ---
async function loadDictionaries() {
    const instBar = document.getElementById('game-instructions');
    document.getElementById('loading-dict').style.display = 'none';

    try {
        // 1. FAST BOOT: Load only the 10k common dictionary (75KB - parses in 0.1s)
        instBar.innerHTML = `<span class="text-yellow-400">Loading Base Lexicon...</span>`;
        const rC = await fetch('https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english-no-swears.txt');
        const textC = await rC.text();
        textC.split(/\r?\n/).forEach(w => { 
            const c = w.trim().toUpperCase(); 
            if(c) {
                if(!dictCommon[c.length]) dictCommon[c.length]=[]; dictCommon[c.length].push(c); 
                // Seed dictAll so the game functions safely before the huge file arrives
                if(!dictAll[c.length]) dictAll[c.length]=[]; dictAll[c.length].push(c); 
            }
        });

        // Start game INSTANTLY!
        startNewRound();

        // 2. BACKGROUND STREAM: Load 370k dictionary without freezing UI
        isLoadingDictionaries = true;
        instBar.innerHTML = `<span class="text-teal-400">Game Ready! Downloading Extended Lexicon...</span>`;
        
        const rA = await fetch('https://raw.githubusercontent.com/dwyl/english-words/master/words_alpha.txt');
        const textAll = await rA.text();
        const lines = textAll.split(/\r?\n/);
        
        let currentIndex = 0;
        
        // 3. MICRO-CHUNK PARSING: Prevents UI from freezing by giving CPU time back to browser
        function processChunk() {
            let endIndex = Math.min(currentIndex + 8000, lines.length); // Process 8000 words per frame
            for(; currentIndex < endIndex; currentIndex++) {
                const c = lines[currentIndex].trim().toUpperCase();
                if(c) {
                    if(!dictAll[c.length]) dictAll[c.length]=[]; 
                    dictAll[c.length].push(c); 
                }
            }

            if (currentIndex < lines.length) {
                let pct = Math.floor((currentIndex / lines.length) * 100);
                instBar.innerHTML = `<span class="text-teal-400">Indexing Extended Dictionary: ${pct}%</span>`;
                requestAnimationFrame(processChunk); // Schedule next chunk
            } else {
                isLoadingDictionaries = false;
                updateInstructions(); // Restore normal game rules text
                console.log("✅ Extended Lexicon fully loaded and indexed.");
            }
        }
        
        requestAnimationFrame(processChunk); // Kick off the chunk processor

    } catch (err) { 
        console.error(err);
        showToast("Warning: Dictionary load failed. Running on safe mode."); 
        isLoadingDictionaries = false;
        startNewRound();
    }
}

// Start the boot sequence
loadDictionaries();


// --- DRAGGABLE UI LOGIC ---
function makeDraggable(wrapId, handleId) {
    const wrap = document.getElementById(wrapId); const handle = document.getElementById(handleId);
    let isDragging = false, offX, offY;
    handle.addEventListener('mousedown', e => { isDragging=true; offX=e.clientX-wrap.offsetLeft; offY=e.clientY-wrap.offsetTop; });
    document.addEventListener('mousemove', e => { if(isDragging) { wrap.style.left=(e.clientX-offX)+'px'; wrap.style.top=(e.clientY-offY)+'px'; wrap.style.bottom='auto'; wrap.style.right='auto'; } });
    document.addEventListener('mouseup', () => isDragging=false);
}
makeDraggable('instruction-wrapper', 'inst-drag');
makeDraggable('chat-wrapper', 'chat-drag');

// Collapsible Toggles
document.getElementById('btn-toggle-instructions').addEventListener('click', () => { document.getElementById('instruction-panel').classList.toggle('scale-y-0'); });
document.getElementById('btn-toggle-chat').addEventListener('click', () => { document.getElementById('chat-panel').classList.toggle('scale-y-0'); });
document.getElementById('btn-toggle-host').addEventListener('click', () => { document.getElementById('host-menu').classList.toggle('scale-0'); });
document.getElementById('btn-toggle-input').addEventListener('click', e => { 
    let p = document.getElementById('host-input-panel'); 
    p.classList.contains('scale-y-0') ? (p.classList.remove('scale-y-0','h-0','p-0','border-0', 'opacity-0'), e.target.innerText="▼ Hide Input") : (p.classList.add('scale-y-0','h-0','p-0','border-0', 'opacity-0'), e.target.innerText="▲ Show Input"); 
});


// --- ROUTER ---
function startNewRound() {
    isGameOver = false; board.innerHTML = ""; updateInstructions();
    
    if(['duckdoku','meowdoku','murdoku','kakuro','nonogram'].includes(activeGame)) setupGridGame(activeGame);
    else if(['worldle','globle','capitale'].includes(activeGame)) setupGeoGame(activeGame);
    else if(activeGame === 'animadle') setupAnimadle();
    else if(activeGame === 'redactle') setupRedactle();
    else if(activeGame === 'word500') setupWord500();
    else if(activeGame === 'contexto') setupContexto();
    else if(activeGame === 'wordsearch') setupWordSearch();
    else if(activeGame === 'blossom') setupBlossom();
    else if(activeGame === 'memory') setupMemory();
}


// --- 🧩 ALGEBRAIC GRID GAMES ---
function setupGridGame(type) {
    document.getElementById('game-title').innerText = type.toUpperCase();
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

// --- 🌍 GEO GAMES ---
function setupGeoGame(type) {
    document.getElementById('game-title').innerText = type.toUpperCase();
    let newTarget;
    do { newTarget = COUNTRIES[Math.floor(Math.random() * COUNTRIES.length)]; } 
    while (geoData.target && newTarget.name === geoData.target.name);
    geoData = { type, target: newTarget }; secretWord = type === 'capitale' ? newTarget.cap : newTarget.name;

    if(type === 'worldle') {
        board.innerHTML = `<img src="https://raw.githubusercontent.com/djaiss/mapsicon/master/all/${newTarget.iso || 'us'}/vector.svg" class="w-64 h-64 invert opacity-80" onerror="this.style.display='none'"><div id="geo-list" class="w-full max-w-xl mt-4 flex flex-col gap-2"></div>`;
    } else {
        board.innerHTML = `<div id="geo-list" class="w-full max-w-xl mt-4 flex flex-col gap-2"></div>`;
    }
}

function setupAnimadle() {
    document.getElementById('game-title').innerText = "ANIMADLE";
    geoData.target = ANIMALS[Math.floor(Math.random() * ANIMALS.length)]; secretWord = geoData.target.name;
    board.innerHTML = `<div class="flex gap-2 text-xs font-bold text-gray-400 uppercase w-full max-w-2xl px-4"><span class="flex-1">Guess</span><span class="w-20 text-center">Class</span><span class="w-24 text-center">Diet</span><span class="w-24 text-center">Habitat</span></div><div id="geo-list" class="w-full max-w-2xl flex flex-col gap-2"></div>`;
}

// --- ⬛ REDACTLE ---
async function setupRedactle() {
    document.getElementById('game-title').innerText = "REDACTLE";
    board.innerHTML = `<div class="text-yellow-400 animate-pulse">📡 Fetching Wiki Database...</div>`;
    const topics = ["Earth", "Computer", "Ocean", "Music", "Science"];
    secretWord = topics[Math.floor(Math.random() * topics.length)].toUpperCase();
    try {
        const res = await fetch(`https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&titles=${secretWord}&format=json&origin=*`);
        const data = await res.json();
        const pages = data.query.pages;
        let text = pages[Object.keys(pages)[0]].extract;
        redactleData = { words: text.split(/\s+/), revealed: ["THE","IS","IN","OF","AND","A","TO"] };
        renderRedactle();
    } catch(err) { board.innerHTML = "Wiki API Error."; }
}
function renderRedactle() {
    let html = `<div class="redactle-board">`;
    redactleData.words.forEach(w => {
        let clean = w.replace(/[^a-zA-Z]/g, "").toUpperCase();
        if(redactleData.revealed.includes(clean)) html += `<span class="redact-word revealed">${w}</span> `;
        else html += `<span class="redact-word">${"█".repeat(clean.length||1)}</span> `;
    });
    board.innerHTML = html + `</div>`;
}

// --- 🟩 WORD500 ---
function getValidTargets(arr) { return arr ? arr.filter(w => !w.endsWith('S') && !w.endsWith('ES') && !w.endsWith('ED')) : []; }
function setupWord500() {
    document.getElementById('game-title').innerText = "WORD 500";
    let len = parseInt(document.getElementById('length-slider').value) || 5;
    let list = getValidTargets(dictCommon[len]); if(!list || list.length===0) list = dictAll[len];
    secretWord = list[Math.floor(Math.random() * list.length)];
    renderKeyboard();
    board.innerHTML = `<div class="text-gray-400 font-bold mt-4 tracking-widest uppercase text-center w-full">System Ready.</div>`;
}

// --- 🎯 CONTEXTO ---
async function setupContexto() {
    vKeyboard.style.display = 'none'; contextoGuesses = []; bestContextoRank = 1000;
    document.getElementById('game-title').innerText = "CONTEXTO";
    board.innerHTML = `<div class="text-yellow-400 animate-pulse mt-10 font-bold tracking-widest text-xl text-center w-full">🧠 AI Building Semantic Tree...</div>`;
    let list = getValidTargets(dictCommon[5]); secretWord = list[Math.floor(Math.random() * list.length)];
    try {
        const res = await fetch(`https://api.datamuse.com/words?ml=${secretWord}&max=1000`);
        contextoData = (await res.json()).map(i => i.word.toUpperCase()); contextoData.unshift(secretWord);
        board.innerHTML = `<div class="contexto-list" id="contexto-board"></div>`;
    } catch (err) { activeGame = 'word500'; startNewRound(); }
}

// --- 🔍 WORD SEARCH ---
function setupWordSearch() {
    vKeyboard.style.display = 'none'; colorIdx = 0;
    document.getElementById('game-title').innerText = "WORD SEARCH";
    
    let diff = document.getElementById('diff-selector').value;
    let size = diff === 'easy' ? 10 : diff === 'moderate' ? 12 : diff === 'hard' ? 15 : 18;
    let count = diff === 'easy' ? 8 : diff === 'moderate' ? 12 : diff === 'hard' ? 16 : 22;

    let valid = getValidTargets(dictCommon[4].concat(dictCommon[5], dictCommon[6]).filter(w => w.length <= size - 2));
    let chosen = []; for(let i=0; i<count; i++) chosen.push(valid[Math.floor(Math.random() * valid.length)]);

    let grid = Array(size).fill(null).map(() => Array(size).fill(''));
    let placedInfo = [];
    let dirs = [[0,1,"Horizontal"], [1,0,"Vertical"]]; if(diff !== 'easy') dirs.push([1,1,"Diagonal"]);

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

// --- ⌨️ INPUT INTERCEPTOR ---
document.getElementById('host-test-input').addEventListener('keydown', (e) => { 
    if(e.key === 'Enter' || e.key === 'ArrowDown') {
        let guess = e.target.value.trim().toUpperCase();
        if(guess) processInput(guess, {uniqueId: 'host', username: 'HOST', profilePic: 'https://ui-avatars.com/api/?name=H'});
        e.target.value = "";
    }
});

document.getElementById('btn-test-guess').addEventListener('click', () => { 
    let input = document.getElementById('host-test-input');
    let guess = input.value.trim().toUpperCase();
    if(guess) processInput(guess, {uniqueId: 'host', username: 'HOST', profilePic: 'https://ui-avatars.com/api/?name=H'});
    input.value = "";
});

socket.on('chat', data => { if(sysMode === 'live') processInput(data.comment.toUpperCase(), data); });

function processInput(guess, user) {
    if(isGameOver) return;
    
    if(['duckdoku','meowdoku','murdoku','kakuro','nonogram'].includes(activeGame)) {
        const match = guess.match(/^([A-Z])(\d+)\s+(.+)$/);
        if(match) {
            let c = match[1].charCodeAt(0) - 65, r = parseInt(match[2]) - 1, val = match[3];
            if(r >= 0 && r < gridData.size && c >= 0 && c < gridData.size && gridData.solution[r][c] === val) {
                gridData.board[r][c] = val; renderAlgebraicGrid(); showToast(`✅ ${user.username} solved ${match[1]}${match[2]}!`); confetti({ particleCount: 30 });
            }
        }
    } 
    else if(['worldle','globle','capitale'].includes(activeGame)) {
        let country = COUNTRIES.find(c => c.name === guess || c.cap === guess);
        if(!country) { showToast(`⚠️ @${user.username}, '${guess}' is not in the database.`); return; }
        let dist = Math.abs(country.lat - geoData.target.lat) + Math.abs(country.lon - geoData.target.lon); 
        let css = activeGame==='globle' ? (dist===0?'globle-hot':dist<20?'globle-warm':'globle-cold') : '';
        let row = document.createElement('div'); row.className = `geo-row ${css}`;
        row.innerHTML = `<span>${guess}</span> <span>${dist===0?'🎯 CORRECT': dist.toFixed(1) + ' units away'}</span>`;
        document.getElementById('geo-list').prepend(row);
        if(dist === 0) triggerEndGame(user, secretWord);
    }
    else if (activeGame === 'redactle') {
        let clean = guess.replace(/[^A-Z]/g, "");
        if(!redactleData.revealed.includes(clean)) {
            redactleData.revealed.push(clean); renderRedactle();
            if(clean === secretWord) triggerEndGame(user, secretWord);
        }
    }
    else if (activeGame === 'word500') {
        let wordLength = parseInt(document.getElementById('length-slider').value) || 5;
        if (guess.length !== wordLength) return;
        if(!dictAll[wordLength].includes(guess) && !dictCommon[wordLength].includes(guess)) return;
        let green = 0, yellow = 0, secArr = secretWord.split(''), gsArr = guess.split('');
        for (let i=0; i<wordLength; i++) { if (gsArr[i] === secArr[i]) { green++; secArr[i] = null; gsArr[i] = null; } }
        for (let i=0; i<wordLength; i++) { if (gsArr[i] !== null) { let idx = secArr.indexOf(gsArr[i]); if (idx !== -1) { yellow++; secArr[idx] = null; } } }
        guess.split('').forEach(l => { if(!secretWord.includes(l)) updateKeyState(l, 'used'); });
        renderKeyboard();
        let row = document.createElement('div'); row.className = "w-row";
        row.innerHTML = `<div class="w-player">${user.username}</div><div class="w-letters">${guess.split('').map(l => `<div class="w-letter">${l}</div>`).join('')}</div><div class="w-clues"><div class="w-clue bg-green">${green}</div><div class="w-clue bg-yellow">${yellow}</div><div class="w-clue bg-red">${wordLength-green-yellow}</div></div>`;
        board.prepend(row);
        if(board.children.length > 8) board.removeChild(board.lastChild);
        if (green === wordLength) triggerEndGame(user, guess);
    }
    else if (activeGame === 'contexto') {
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
        if (rank === 0) triggerEndGame(user, guess);
    }
    else if (activeGame === 'wordsearch') {
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
            confetti({ particleCount: 50, spread: 70, origin: { y: 0.8 } });
            if(wordSearchData.words.length === 0) triggerEndGame(user, "GRID CLEARED");
        }
    }
}

function showToast(msg) { const c = document.getElementById('toast-container'), t = document.createElement('div'); t.className = `toast`; t.innerHTML = msg; c.prepend(t); setTimeout(() => t.remove(), 4000); }

async function triggerEndGame(user, word) {
    isGameOver = true; confetti({ particleCount: 300, spread: 150, zIndex: 9999 });
    const modal = document.getElementById('winner-modal');
    document.getElementById('winner-pic').src = user.profilePic; document.getElementById('winner-name').innerText = user.username; document.getElementById('winning-word').innerText = word;
    document.getElementById('word-def').innerText = preloadedDef || "Solved!";
    modal.classList.remove('hidden'); modal.classList.add('flex'); gsap.to(modal, { opacity: 1, duration: 0.3 });
    setTimeout(() => { gsap.to(modal, { opacity: 0, duration: 0.3, onComplete: () => { modal.classList.add('hidden'); modal.classList.remove('flex'); startNewRound(); }}); }, 5000);
}

// UI BINDINGS
document.getElementById('game-selector').addEventListener('change', e => { activeGame=e.target.value; startNewRound(); });
document.getElementById('btn-skip').addEventListener('click', startNewRound);
