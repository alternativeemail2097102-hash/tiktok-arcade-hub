const socket = io();

// --- ⚙️ STATE ---
let activeGame = 'word500';
let difficulty = 'moderate'; 
let wordLength = 5;
let sysMode = 'preview'; 

let dictAll = {}, dictCommon = {}; 
let contextoGuesses = [], bestContextoRank = 1000;
let wordSearchData = { grid: [], words: [], size: 0 };
let playerColors = ["#ef4444", "#3b82f6", "#a855f7", "#f97316", "#ec4899", "#14b8a6", "#fde047"];
let colorIdx = 0, secretWord = "", preloadedDef = "", isGameOver = false, keyState = {}; 

const board = document.getElementById('game-board');
const vKeyboard = document.getElementById('virtual-keyboard');

// --- 📖 INSTRUCTIONS ---
const INST = {
    word500: { 
        en: "<b>WORD500:</b> Guess the hidden word!<br><span class='text-green-400'>Green</span> = Right letter & spot.<br><span class='text-yellow-400'>Yellow</span> = Right letter, wrong spot.<br><span class='text-red-400'>Red</span> = Letter not in word.", 
        id: "<b>WORD500:</b> Tebak kata tersembunyi!<br><span class='text-green-400'>Hijau</span> = Huruf & posisi benar.<br><span class='text-yellow-400'>Kuning</span> = Huruf benar, posisi salah.<br><span class='text-red-400'>Merah</span> = Huruf salah.", 
        ms: "<b>WORD500:</b> Teka perkataan tersembunyi!<br><span class='text-green-400'>Hijau</span> = Huruf & kedudukan betul.<br><span class='text-yellow-400'>Kuning</span> = Huruf betul, kedudukan salah.<br><span class='text-red-400'>Merah</span> = Huruf salah." 
    },
    contexto: { 
        en: "<b>CONTEXTO:</b> Guess the secret word. Rank #1 wins!", 
        id: "<b>CONTEXTO:</b> Tebak kata rahasia. Peringkat #1 menang!", 
        ms: "<b>CONTEXTO:</b> Teka perkataan rahsia. Kedudukan #1 menang!" 
    },
    wordsearch: { 
        en: "<b>WORD SEARCH:</b> Find the hidden words in the grid!", 
        id: "<b>WORD SEARCH:</b> Temukan kata yang tersembunyi di kotak!", 
        ms: "<b>WORD SEARCH:</b> Cari perkataan tersembunyi dalam grid!" 
    }
};

function updateInstructions() { 
    document.getElementById('instruction-text').innerHTML = INST[activeGame][document.getElementById('lang-selector').value]; 
}

// --- 📚 LOAD DICTS ---
async function loadDictionaries() {
    try {
        const rC = await fetch('https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english-no-swears.txt');
        const textCommon = await rC.text();
        textCommon.split(/\r?\n/).forEach(w => { 
            const c = w.trim().toUpperCase(); 
            if(!dictCommon[c.length]) dictCommon[c.length]=[]; 
            dictCommon[c.length].push(c); 
        });

        const rA = await fetch('https://raw.githubusercontent.com/dwyl/english-words/master/words_alpha.txt');
        const textAll = await rA.text();
        textAll.split(/\r?\n/).forEach(w => { 
            const c = w.trim().toUpperCase(); 
            if(!dictAll[c.length]) dictAll[c.length]=[]; 
            dictAll[c.length].push(c); 
        });

        document.getElementById('loading-dict').style.display = 'none';
        startNewRound();
    } catch (err) { 
        showToast("Error loading words."); 
    }
}
loadDictionaries();

function prefetchDef(word) {
    preloadedDef = "Definition unavailable.";
    fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${word.toLowerCase()}`)
        .then(res => res.json())
        .then(data => { preloadedDef = data[0].meanings[0].definitions[0].definition; })
        .catch(e => {});
}

// --- ⌨️ VIRTUAL KEYBOARD ---
function renderKeyboard() {
    if(activeGame !== 'word500') { vKeyboard.style.display = 'none'; return; }
    vKeyboard.style.display = 'flex';
    const rows = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];
    vKeyboard.innerHTML = rows.map(r => 
        `<div class="kbd-row">${r.split('').map(l => {
            let c = keyState[l] === 'green' ? 'bg-green' : keyState[l] === 'yellow' ? 'bg-yellow' : keyState[l] === 'red' ? 'bg-red' : keyState[l] === 'dark' ? 'bg-dark' : '';
            return `<div class="key-btn ${c}" onclick="cycleKeyColor('${l}')">${l}</div>`;
        }).join('')}</div>`
    ).join('');
}

window.cycleKeyColor = function(l) {
    let c = keyState[l];
    if(!c) keyState[l] = 'red'; 
    else if(c === 'red') keyState[l] = 'yellow'; 
    else if(c === 'yellow') keyState[l] = 'green'; 
    else delete keyState[l];
    renderKeyboard();
}

function updateKeyState(letter, status) {
    let current = keyState[letter];
    if (status === 'green') keyState[letter] = 'green';
    else if (status === 'yellow' && current !== 'green') keyState[letter] = 'yellow';
    else if (status === 'dark' && current !== 'green' && current !== 'yellow') keyState[letter] = 'dark';
}

// --- 🎮 ROUTERS ---
function startNewRound() {
    isGameOver = false; board.innerHTML = ""; keyState = {}; updateInstructions(); fetchLeaderboard();
    if(activeGame === 'word500') setupWord500(); 
    else if(activeGame === 'contexto') setupContexto(); 
    else if(activeGame === 'wordsearch') setupWordSearch();
}

function setupWord500() {
    document.getElementById('game-title').innerText = "WORD 500";
    document.getElementById('game-instructions').innerText = `CRACK THE ${wordLength}-LETTER CODE.`;
    let list = (difficulty === 'easy' || difficulty === 'moderate') ? dictCommon[wordLength] : dictAll[wordLength];
    secretWord = list[Math.floor(Math.random() * list.length)];
    prefetchDef(secretWord); renderKeyboard();
    board.innerHTML = `<div class="text-gray-400 font-bold mt-4 tracking-widest uppercase">System Ready.</div>`;
}

async function setupContexto() {
    vKeyboard.style.display = 'none'; contextoGuesses = []; bestContextoRank = 1000;
    document.getElementById('game-title').innerText = "CONTEXTO";
    document.getElementById('game-instructions').innerText = `GUESS THE SECRET WORD.`;
    board.innerHTML = `<div class="text-yellow-400 animate-pulse mt-10 font-bold tracking-widest text-xl">🧠 AI Building Semantic Tree...</div>`;
    let list = dictCommon[Math.floor(Math.random() * 4) + 4]; 
    secretWord = list[Math.floor(Math.random() * list.length)];
    prefetchDef(secretWord);
    try {
        const res = await fetch(`https://api.datamuse.com/words?ml=${secretWord}&max=1000`);
        const data = await res.json();
        contextoData = data.map(i => i.word.toUpperCase()); 
        contextoData.unshift(secretWord);
        board.innerHTML = `<div class="contexto-list" id="contexto-board"></div>`;
    } catch (err) { activeGame = 'word500'; startNewRound(); }
}

function setupWordSearch() {
    vKeyboard.style.display = 'none'; colorIdx = 0;
    document.getElementById('game-title').innerText = "WORD SEARCH";
    
    let size = difficulty === 'easy' ? 12 : difficulty === 'moderate' ? 14 : difficulty === 'hard' ? 16 : 18;
    let count = difficulty === 'easy' ? 15 : difficulty === 'moderate' ? 20 : difficulty === 'hard' ? 25 : 30;
    document.getElementById('game-instructions').innerText = `FIND ${count} HIDDEN WORDS.`;

    let valid = [];
    for(let i=5; i<=15; i++) { if(dictCommon[i]) valid = valid.concat(dictCommon[i]); }
    valid = valid.filter(w => w.length <= size);
    
    let chosen = []; 
    for(let i=0; i<count; i++) chosen.push(valid[Math.floor(Math.random() * valid.length)]);

    let grid = Array(size).fill(null).map(() => Array(size).fill(''));
    let placedInfo = [];
    const dirs = [[0,1,"Horizontal"], [1,0,"Vertical"], [1,1,"Diagonal"]]; 

    chosen.forEach(word => {
        let placed = false, tries = 0;
        while (!placed && tries < 200) {
            tries++; 
            let dir = dirs[Math.floor(Math.random() * dirs.length)];
            let r = Math.floor(Math.random() * size), c = Math.floor(Math.random() * size);
            if (r + (word.length * dir[0]) > size || c + (word.length * dir[1]) > size) continue;
            let col = false;
            for (let i = 0; i < word.length; i++) { 
                if (grid[r+i*dir[0]][c+i*dir[1]] !== '' && grid[r+i*dir[0]][c+i*dir[1]] !== word[i]) { col = true; break; } 
            }
            if (!col) {
                let coords = [];
                for (let i = 0; i < word.length; i++) { 
                    grid[r+i*dir[0]][c+i*dir[1]] = word[i]; 
                    coords.push(`${r}-${c}`); 
                }
                placedInfo.push({ word, coords, len: word.length, dir: dir[2], start: `R${r+1} C${c+1}`}); 
                placed = true;
            }
        }
    });

    wordSearchData = { grid, words: placedInfo, size };
    let html = `<div class="ws-container w-full max-w-5xl"><div class="ws-grid flex-1" style="grid-template-columns: repeat(${size}, 1fr); grid-template-rows: repeat(${size}, 1fr);">`;
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    for(let r=0; r<size; r++) {
        for(let c=0; c<size; c++) {
            let char = grid[r][c] || letters.charAt(Math.floor(Math.random() * letters.length));
            html += `<div class="ws-cell" id="c-${r}-${c}">${char}</div>`;
        }
    }
    html += `</div><div class="ws-clue-list w-72">`;
    placedInfo.forEach(w => html += `<div class="ws-clue-item" id="wsc-${w.word}"><span class="ws-clue-text">${w.len} Letters</span><div class="flex items-center gap-2 hidden" id="ws-finder-${w.word}"></div></div>`);
    board.innerHTML = html + `</div></div>`;
}

// --- BOTS & SOCKETS ---
socket.on('sys_status', status => {
    if(sysMode !== 'demo') {
        isDemoMode = status === 'DEMO'; sysMode = isDemoMode ? 'preview' : 'live';
        const b = document.getElementById('sys-mode-badge');
        b.className = `status-badge ${isDemoMode ? 'status-preview' : 'status-live'}`;
        b.innerText = isDemoMode ? '🟡 PREVIEW MODE' : '🟢 LIVE NOW';
    }
});

socket.on('chat', data => { if(sysMode === 'live') processInput(data.comment, data); });

setInterval(() => {
    if(sysMode === 'demo' && !isGameOver) {
        let intel = Math.random();
        let fake = {username: intel>0.8?"EinsteinBot":intel>0.4?"AvgBot":"NoobBot", profilePic: "https://ui-avatars.com/api/?name=B"};
        let g = "";
        if(activeGame==='word500') g = intel>0.8?secretWord:dictCommon[wordLength][Math.floor(Math.random()*dictCommon[wordLength].length)];
        else if(activeGame==='contexto') g = intel>0.9?secretWord:contextoData[Math.max(1, bestContextoRank-Math.floor(Math.random()*50))]||secretWord;
        else if(activeGame==='wordsearch') { if(intel>0.4 && wordSearchData.words.length>0) g = wordSearchData.words[0].word; }
        if(g) processInput(g, fake);
    }
}, 3500);

function processInput(guess, user) {
    if (isGameOver) return; 
    guess = guess.trim().toUpperCase(); 
    if (!/^[A-Z]+$/.test(guess)) return; 
    
    if (board.children[0] && board.children[0].innerText.includes("System")) board.innerHTML = "";
    
    if (activeGame === 'word500') handleWord500Guess(guess, user); 
    else if (activeGame === 'contexto') handleContextoGuess(guess, user); 
    else handleWordSearchGuess(guess, user);
}

function handleWord500Guess(guess, user) {
    if (guess.length !== wordLength) return;
    if(!dictAll[wordLength].includes(guess) && !dictCommon[wordLength].includes(guess)) return;
    
    let green = 0, yellow = 0, secArr = secretWord.split(''), gsArr = guess.split('');
    
    for (let i=0; i<wordLength; i++) { 
        if (gsArr[i] === secArr[i]) { green++; secArr[i] = null; gsArr[i] = null; updateKeyState(guess[i], 'green'); } 
    }
    for (let i=0; i<wordLength; i++) {
        if (gsArr[i] !== null) { 
            let idx = secArr.indexOf(gsArr[i]); 
            if (idx !== -1) { yellow++; secArr[idx] = null; updateKeyState(guess[i], 'yellow'); } 
        }
    }
    if(green === 0 && yellow === 0) guess.split('').forEach(l => updateKeyState(l, 'dark')); 
    
    renderKeyboard();
    let row = document.createElement('div'); row.className = "w-row";
    row.innerHTML = `<div class="w-player">${user.username}</div><div class="w-letters">${guess.split('').map(l => `<div class="w-letter">${l}</div>`).join('')}</div><div class="w-clues"><div class="w-clue bg-green">${green}</div><div class="w-clue bg-yellow">${yellow}</div><div class="w-clue bg-red">${wordLength-green-yellow}</div></div>`;
    board.prepend(row);
    if(board.children.length > Math.max(6, 20-wordLength)) board.removeChild(board.lastChild);
    
    if (green === wordLength) triggerEndGame(user, guess, 1);
}

function handleContextoGuess(guess, user) {
    let rank = contextoData.indexOf(guess);
    if (rank === -1) { 
        let hash = 0; 
        for (let i = 0; i < guess.length; i++) hash = guess.charCodeAt(i) + ((hash << 5) - hash); 
        rank = 1001 + (Math.abs(hash) % 89000); 
    }
    if(rank < bestContextoRank) bestContextoRank = rank;
    
    contextoGuesses.push({ word: guess, rank: rank, username: user.username });
    contextoGuesses.sort((a, b) => a.rank - b.rank); 
    
    const cBoard = document.getElementById('contexto-board'); 
    if(!cBoard) return; 
    cBoard.innerHTML = "";
    
    contextoGuesses.slice(0, 10).forEach(g => {
        let percent = Math.max(5, 100 - (g.rank / 100)); 
        let color = g.rank === 0 ? '#22c55e' : g.rank < 50 ? '#eab308' : g.rank < 500 ? '#f97316' : '#6b7280';
        let bar = document.createElement('div'); bar.className = "contexto-bar mt-1";
        bar.innerHTML = `<div class="contexto-fill" style="width: ${percent}%; background-color: ${color};">${g.word} <span class="ml-2 text-xs text-white/50 lowercase">@${g.username}</span></div><div class="contexto-rank">#${g.rank}</div>`;
        cBoard.appendChild(bar);
    });
    
    if (rank === 0) triggerEndGame(user, guess, 2); 
    else if (rank <= 10) updateScore(user, 1);
}

function handleWordSearchGuess(guess, user) {
    let target = wordSearchData.words.find(w => w.word === guess);
    if(target) {
        let pColor = playerColors[colorIdx % playerColors.length]; colorIdx++;
        
        target.coords.forEach((coord, idx) => { 
            let c = document.getElementById(`c-${coord}`);
            c.classList.add('highlight'); c.style.setProperty('--user-color', pColor); 
            if(target.dir === "Horizontal") {
                if(idx === 0) c.classList.add('ws-start-horiz');
                if(idx === target.coords.length-1) c.classList.add('ws-end-horiz');
            } else if (target.dir === "Vertical") {
                if(idx === 0) c.classList.add('ws-start-vert');
                if(idx === target.coords.length-1) c.classList.add('ws-end-vert');
            } else {
                c.classList.add('ws-start-diag'); 
            }
        });
        
        let itemEl = document.getElementById(`wsc-${guess}`); itemEl.classList.add('found');
        let finderEl = document.getElementById(`ws-finder-${guess}`); finderEl.classList.remove('hidden');
        finderEl.innerHTML = `<img src="${user.profilePic}" class="w-6 h-6 rounded-full"><span class="text-xs font-black uppercase" style="color:${pColor}">@${user.username}</span>`;
        
        wordSearchData.words = wordSearchData.words.filter(w => w.word !== guess);
        updateScore(user, 1);
        confetti({ particleCount: 50, spread: 70, origin: { y: 0.8 } });

        if(wordSearchData.words.length === 0) triggerEndGame(user, "GRID CLEARED", 0);
    }
}

// --- ENDGAME & SCORES ---
function updateScore(u, p) { 
    if(p>0 && u.uniqueId!=='host') {
        fetch('/api/score', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({uniqueId:u.uniqueId, username:u.username, profilePic:u.profilePic, game:activeGame, points:p})}); 
    }
    fetchLeaderboard(); 
}
        
function fetchLeaderboard() {
    fetch('/api/leaderboard').then(r=>r.json()).then(d => {
        const t = document.getElementById('leaderboard-ticker');
        if(d.length===0) t.innerHTML = `<div class="ticker-item text-yellow-400">WAITING FOR SCORES...</div>`;
        else {
            let h = ""; 
            for(let i=0; i<3; i++) {
                d.forEach((p, idx) => { 
                    h += `<div class="ticker-item">${idx===0?"🥇":idx===1?"🥈":idx===2?"🥉":`🏅 #${idx+1}`} <img src="${p.profile_pic}" class="w-5 h-5 rounded-full"> <span class="text-teal-400">${p.username}</span> : ${p.total_score} PTS</div>`; 
                });
            }
            t.innerHTML = h;
        }
    });
}
socket.on('leaderboard_reset', fetchLeaderboard);

async function triggerEndGame(user, word, pts = 0) {
    isGameOver = true; updateScore(user, pts);
    confetti({ particleCount: 300, spread: 150, origin: { y: 0.5 }, zIndex: 9999 });

    const m = document.getElementById('winner-modal');
    document.getElementById('winner-pic').src = user.profilePic; 
    document.getElementById('winner-name').innerText = user.username; 
    document.getElementById('winning-word').innerText = word; 
    document.getElementById('word-def').innerText = preloadedDef; 
    
    m.classList.remove('hidden'); m.classList.add('flex'); gsap.to(m, { opacity: 1, duration: 0.3 });

    setTimeout(() => { 
        gsap.to(m, { opacity: 0, duration: 0.3, onComplete: () => { 
            m.classList.add('hidden'); m.classList.remove('flex'); startNewRound(); 
        }}); 
    }, 5000);
}

// --- UI & HOST ACTIONS ---
function showToast(msg, isHint=false) { 
    const c = document.getElementById('toast-container'), t = document.createElement('div'); 
    t.className = `toast ${isHint?'hint':''}`; t.innerText = msg; 
    c.prepend(t); 
    setTimeout(() => { if(t.parentNode) t.remove(); }, 6000); 
}

document.getElementById('btn-test-guess').addEventListener('click', () => { 
    let i = document.getElementById('host-test-input'); 
    if(i.value) processInput(i.value, {uniqueId: 'host', username: 'HOST', profilePic: 'https://ui-avatars.com/api/?name=H'}); 
    i.value = ""; 
});
document.getElementById('btn-toggle-host').addEventListener('click', () => { 
    let m = document.getElementById('host-menu'); 
    m.classList.toggle('scale-0'); m.classList.toggle('opacity-0'); 
});
document.getElementById('btn-toggle-instructions').addEventListener('click', () => { 
    let m = document.getElementById('instruction-panel'); 
    m.classList.toggle('scale-0'); m.classList.toggle('opacity-0'); 
});

// Hide/Unhide Host Input
document.getElementById('btn-toggle-input').addEventListener('click', (e) => { 
    let p = document.getElementById('host-input-panel'); 
    if(p.classList.contains('scale-y-0')){ 
        p.classList.remove('scale-y-0','h-0','p-0','border-0', 'opacity-0'); 
        e.target.innerText="▼ Hide Input"; 
    } else { 
        p.classList.add('scale-y-0','h-0','p-0','border-0', 'opacity-0'); 
        e.target.innerText="▲ Show Input"; 
    } 
});

// Cloud Custom Username Connection
document.getElementById('btn-tt-connect').addEventListener('click', () => {
    let ttUser = document.getElementById('tt-username').value.trim();
    if(ttUser) {
        socket.emit('connect_tiktok', ttUser);
        document.getElementById('mode-selector').value = "live";
        sysMode = "live";
        showToast(`Connecting to @${ttUser}...`);
    }
});

// Dynamic Hints
document.getElementById('btn-hint').addEventListener('click', () => {
    if (activeGame === 'word500') showToast(`💡 HINT: Letter ${Math.floor(Math.random()*secretWord.length)+1} is [ ${secretWord.charAt(Math.floor(Math.random()*secretWord.length))} ]`, true);
    else if (activeGame === 'contexto') showToast(`💡 HINT: Try '${contextoData[Math.max(1, Math.floor(bestContextoRank/2))] || secretWord}'`, true);
    else if (activeGame === 'wordsearch' && wordSearchData.words.length>0) { let w = wordSearchData.words[0]; showToast(`💡 HINT: Find [ ${w.word} ] starting at ${w.start} going ${w.dir}!`, true); }
});

document.querySelectorAll('.tab-btn').forEach(btn => { 
    btn.addEventListener('click', (e) => { 
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('text-teal-400', 'border-b-2', 'border-teal-400')); 
        e.target.classList.add('text-teal-400', 'border-b-2', 'border-teal-400'); 
        document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden')); 
        document.getElementById(e.target.getAttribute('data-target')).classList.remove('hidden'); 
        document.getElementById(e.target.getAttribute('data-target')).classList.add('flex'); 
    }); 
});

document.getElementById('mode-selector').addEventListener('change', e => { 
    sysMode = e.target.value; 
    const b = document.getElementById('sys-mode-badge'); 
    b.className = `status-badge status-${sysMode}`; 
    b.innerText = sysMode === 'live' ? '🟢 LIVE MODE' : sysMode === 'demo' ? '🟣 DEMO (BOTS)' : '🟡 PREVIEW'; 
});
document.getElementById('theme-selector').addEventListener('change', e => document.body.className = e.target.value);
document.getElementById('game-selector').addEventListener('change', e => { activeGame=e.target.value; document.getElementById('length-wrapper').style.display = activeGame === 'word500' ? 'flex' : 'none'; startNewRound(); });
document.getElementById('diff-selector').addEventListener('change', startNewRound);
document.getElementById('length-slider').addEventListener('input', e => { wordLength=parseInt(e.target.value); document.getElementById('length-display').innerText = wordLength; });
document.getElementById('length-slider').addEventListener('change', startNewRound);
document.getElementById('btn-skip').addEventListener('click', startNewRound);
document.getElementById('btn-reveal').addEventListener('click', () => triggerEndGame({username: "HOST REVEAL", profilePic: "https://ui-avatars.com/api/?name=H"}, secretWord, 0));
document.getElementById('zoom-slider').addEventListener('input', (e) => { document.getElementById('zoom-display').innerText = `${e.target.value}%`; document.getElementById('broadcast-stage').style.transform = `scale(${e.target.value / 100})`; });
document.getElementById('btn-reset-score').addEventListener('click', () => { if(confirm("Wipe all leaderboards?")) fetch('/api/reset_scores', {method: 'POST'}); });
document.getElementById('lang-selector').addEventListener('change', updateInstructions);
document.getElementById('btn-fullscreen').addEventListener('click', () => { if (!document.fullscreenElement) document.documentElement.requestFullscreen(); else if (document.exitFullscreen) document.exitFullscreen(); });
