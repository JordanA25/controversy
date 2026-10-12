// Controversy — Hot Seat mode, pass-and-play on one phone.
(() => {
  'use strict';

  const LEVELS = window.LEVELS;
  const GAME_KEY = 'controversy.game.v1';
  const SETUP_KEY = 'controversy.setup.v1';
  const MIN_PLAYERS = 2, MAX_PLAYERS = 8, MAX_ROUNDS = 5;
  const CONVINCE_SECONDS = 60;
  const FLAME_SCALE = [0.55, 0.7, 0.85, 1];

  const $app = document.getElementById('app');
  const esc = s => String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  const drop = k => { try { localStorage.removeItem(k); } catch {} };
  const buzz = p => { try { navigator.vibrate && navigator.vibrate(p); } catch {} };
  const shuffle = a => {
    for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  };
  const level = id => LEVELS.find(l => l.id === id);
  const vote = v => v ? 'Agree' : 'Disagree';

  let setup = load(SETUP_KEY, { players: [], levels: [1, 2, 3, 4], rounds: 3 });
  // The first MIN_PLAYERS rows always exist; extra rows exist only while they hold a name.
  const tidyPlayers = () => {
    setup.players = setup.players.filter((n, i) => i < MIN_PLAYERS || n.trim());
    while (setup.players.length < MIN_PLAYERS) setup.players.push('');
  };
  tidyPlayers();
  let G = load(GAME_KEY, null);
  let screen = 'home';
  let timerId = null;

  // ---------- art ----------

  // Official papercut flame from the box art; it grows with the heat level.
  // Bridge-Burners (level 4) get the box's suspension bridge, snapped in half.
  const flame = lv =>
    `<span class="flame" style="--s:${FLAME_SCALE[lv - 1]}" aria-hidden="true">` +
    `<img class="flick" src="art/flame.png" alt="">` +
    (lv === 4 ? `<img class="bridge" src="art/bridge-broken.png" alt="">` : '') + `</span>`;

  const cardBack = (lv, extra = '') =>
    `<div class="card-back lv${lv}">${flame(lv)}${extra}<img class="card-brand" src="art/wordmark.png" alt=""></div>`;

  // ---------- game logic ----------

  const n = () => G.players.length;
  const totalTurns = () => G.rounds * n();
  const hotIdx = () => G.turn % n();
  const hot = () => G.players[hotIdx()];
  const voters = () => {
    const out = [];
    for (let i = 1; i < n(); i++) out.push((hotIdx() + i) % n());
    return out;
  };

  function setupProblem() {
    const names = setup.players.map(s => s.trim()).filter((n, i) => i < MIN_PLAYERS || n), filled = names.filter(Boolean);
    if (filled.length !== names.length) return `Enter at least ${MIN_PLAYERS} player names.`;
    if (new Set(filled.map(s => s.toLowerCase())).size !== filled.length) return 'Every player needs a different name.';
    return '';
  }

  function persist() { if (G) save(GAME_KEY, G); }

  function startGame() {
    tidyPlayers();
    const names = setup.players.map(s => s.trim());
    G = {
      players: names.map(name => ({ name, score: 0 })),
      levels: [...setup.levels].sort(),
      rounds: setup.rounds,
      decks: {},
      turn: 0,
    };
    beginTurn();
    requestWakeLock();
  }

  function beginTurn() {
    Object.assign(G, { card: null, flipped: false, votes: {}, preds: {}, results: [], rv: 0, rvStage: 'guess' });
    handoff(hotIdx(), 'heat', `Round ${Math.floor(G.turn / n()) + 1} of ${G.rounds} · You're in the Hot Seat`);
  }

  function handoff(to, then, note = 'Pass the phone to') {
    G.handoff = { to, then, note };
    G.screen = 'handoff';
  }

  function draw(lv) {
    let deck = G.decks[lv];
    if (!deck || !deck.length) deck = G.decks[lv] = shuffle(level(lv).cards.map((_, i) => i));
    G.card = { lv, text: level(lv).cards[deck.pop()] };
    G.flipped = false;
    G.screen = 'card';
  }

  function nextVoter(justVoted) {
    const vs = voters();
    const i = justVoted == null ? 0 : vs.indexOf(justVoted) + 1;
    if (i < vs.length) handoff(vs[i], 'vote', justVoted == null ? 'Secret vote! Pass the phone to' : 'Locked in 🔒 Pass the phone to');
    else handoff(hotIdx(), 'predict', 'Everyone has voted. Pass the phone back to');
  }

  function score(outcome) {
    const p = voters()[G.rv];
    G.results.push({ p, guess: G.preds[p], vote: G.votes[p], outcome });
    if (outcome !== 'held') hot().score++;
  }

  function nextReveal() {
    G.rv++;
    G.rvStage = 'guess';
    if (G.rv >= voters().length) G.screen = 'summary';
  }

  function nextTurn() {
    G.turn++;
    if (G.turn >= totalTurns()) G.screen = 'final';
    else beginTurn();
  }

  // ---------- views ----------

  const scoreboard = (highlight = -1) => {
    const ranked = G.players.map((p, i) => ({ ...p, i })).sort((a, b) => b.score - a.score);
    const top = ranked[0].score;
    return `<ol class="scores">${ranked.map(p => `
      <li class="${p.i === highlight ? 'me' : ''} ${p.score === top && top > 0 ? 'lead' : ''}">
        <span class="nm">${esc(p.name)}</span><span class="pts">${p.score}</span>
      </li>`).join('')}</ol>`;
  };

  const topbar = () => `
    <header class="topbar">
      <span>Round ${Math.min(Math.floor(G.turn / n()) + 1, G.rounds)}/${G.rounds}</span>
      <span class="hs">🔥 ${esc(hot().name)}</span>
      <button class="icon-btn" data-a="quit" aria-label="Quit game">✕</button>
    </header>`;

  // A greyed-out "ghost" row at the end turns into a real player as soon as someone types in it.
  const playerRow = (i, name, ghost = false) => `
    <li class="${ghost ? 'ghost' : ''}"><span class="seat">${i + 1}</span>
      <input data-i="${i}" value="${esc(name)}" maxlength="16" placeholder="${ghost ? 'Add player' : `Player ${i + 1}`}" autocomplete="off" enterkeyhint="next" aria-label="Player ${i + 1} name">
      ${!ghost && i >= MIN_PLAYERS ? removeBtn(i) : ''}
    </li>`;
  const removeBtn = i => `<button class="icon-btn" data-a="rmPlayer" data-i="${i}" aria-label="Remove player">✕</button>`;

  const miniCard = () =>
    `<div class="mini-card lv${G.card.lv}"><span class="lvl">${esc(level(G.card.lv).name)}</span>${esc(G.card.text)}</div>`;

  const views = {
    home: () => `
      <section class="screen home">
        <p class="tag">Converse. Convince. Connect.</p>
        <h1 class="logo"><img src="art/wordmark.png" alt="Controversy"></h1>
        <img class="hero" src="art/hero.jpg" alt="Two faces, a flame, and a bridge">
        <p class="band">Turn fights into friends</p>
        <div class="stack">
          ${G ? `<button class="btn primary" data-a="resume">Resume game</button>` : ''}
          <button class="btn ${G ? 'ghost' : 'primary'}" data-a="setup">New game</button>
          <button class="btn ghost" data-a="rules">How to play</button>
        </div>
        <ul class="facts">
          <li><b>2–8</b>players</li><li><b>30–60</b>minutes</li><li><b>14+</b>ages</li>
        </ul>
        <footer class="foot">
          created by <strong>Roast Beef Games</strong><br>
          <a href="https://controversygame.com" target="_blank" rel="noopener">www.controversygame.com</a>
        </footer>
      </section>`,

    rules: () => `
      <section class="screen rules">
        <button class="back" data-a="home">‹ Back</button>
        <h2>How to play</h2>
        <p class="lead-in">Welcome to Controversy, the game that turns fights into friends. You're about to find out who
        secretly disagrees with you about everything from pineapple on pizza to world peace. Don't worry: this is a
        no-hard-feelings zone. Debate boldly, laugh loudly, and let the game begin!</p>
        <h3>Hot Seat</h3>
        <ol class="steps">
          <li>Enter players in seating order, <b>youngest first</b>. The youngest starts in the Hot Seat.</li>
          <li>The Hot Seat picks a heat level, flips a card, and reads it aloud.</li>
          <li>Pass the phone around. Everyone else secretly votes <b class="agree-t">Agree</b> or <b class="disagree-t">Disagree</b>.</li>
          <li>The Hot Seat predicts each player's vote. <b>Correct guess = 1 point.</b></li>
          <li>Wrong guess? The Hot Seat has <b>1 minute</b> to convince that player to switch. Win them over = 1 point.</li>
          <li>The Hot Seat passes to the left. Most points after the last round wins.</li>
        </ol>
        <h3>Heat levels</h3>
        <ul class="heat-list">${LEVELS.map(l => `
          <li><span class="dot lv${l.id}"></span><b>${esc(l.name)}</b><em>${['Friendly fire', 'Things get spicy', 'Hot-button issues', 'Proceed with caution'][l.id - 1]}</em></li>`).join('')}
        </ul>
        <p class="small">Want a new way to play? Go for it. We can only be so perfect.</p>
        <button class="btn primary" data-a="setup">Let's play</button>
      </section>`,

    setup: () => {
      const why = setupProblem();
      const ok = !why;
      return `
      <section class="screen setup">
        <button class="back" data-a="home">‹ Back</button>
        <h2>Players</h2>
        <p class="small">Enter players in seating order, <b>youngest first</b>. The Hot Seat moves to the left.</p>
        <ul class="players">${setup.players.map((p, i) => playerRow(i, p)).join('')}${
          setup.players.length < MAX_PLAYERS ? playerRow(setup.players.length, '', true) : ''}
        </ul>
        <h2>Heat levels</h2>
        <div class="levels">${LEVELS.map(l => `
          <button class="lvl-chip lv${l.id} ${setup.levels.includes(l.id) ? 'on' : ''}" data-a="toggleLevel" data-lv="${l.id}" aria-pressed="${setup.levels.includes(l.id)}">
            ${flame(l.id)}<span>${esc(l.name)}</span>
          </button>`).join('')}
        </div>
        <h2>Rounds</h2>
        <div class="stepper">
          <button class="icon-btn" data-a="rounds" data-d="-1" ${setup.rounds <= 1 ? 'disabled' : ''} aria-label="Fewer rounds">−</button>
          <span class="val">${setup.rounds}</span>
          <button class="icon-btn" data-a="rounds" data-d="1" ${setup.rounds >= MAX_ROUNDS ? 'disabled' : ''} aria-label="More rounds">+</button>
        </div>
        <p class="small">Each round, everyone takes the Hot Seat once. The rules recommend 5.</p>
        <p class="warn" id="why">${why}</p>
        <button class="btn primary" data-a="start" ${ok ? '' : 'disabled'}>Start game</button>
      </section>`;
    },

    handoff: () => {
      const p = G.players[G.handoff.to];
      return `
      <section class="screen handoff">
        <div class="pass" aria-hidden="true">📱</div>
        <p class="eyebrow">${esc(G.handoff.note)}</p>
        <h2 class="big-name">${esc(p.name)}</h2>
        <button class="btn primary" data-a="takePhone">I'm ${esc(p.name)}</button>
      </section>`;
    },

    heat: () => `
      ${topbar()}
      <section class="screen heat">
        <h2>Pick your heat, ${esc(hot().name)}</h2>
        <div class="heat-grid">${G.levels.map(l => `
          <button class="heat-card" data-a="pick" data-lv="${l}">${cardBack(l, `<span class="lvl-name">${esc(level(l).name)}</span>`)}</button>`).join('')}
        </div>
        ${G.levels.length > 1 ? `<button class="btn ghost small" data-a="pick" data-lv="random">🎲 Surprise me</button>` : ''}
      </section>`,

    card: () => `
      ${topbar()}
      <section class="screen card-screen">
        <button class="flipper ${G.flipped ? 'flipped' : ''}" data-a="flip" aria-label="${G.flipped ? esc(G.card.text) : 'Tap to flip the card'}">
          <div class="flip-inner">
            <div class="face back">${cardBack(G.card.lv, '<span class="tap">Tap to flip</span>')}</div>
            <div class="face front lv${G.card.lv}">
              <span class="lvl">${esc(level(G.card.lv).name)}</span>
              <p class="statement ${G.card.text.length > 80 ? 'long' : ''}">${esc(G.card.text)}</p>
              <span class="front-brand">CONTROVERSY</span>
            </div>
          </div>
        </button>
        <div class="after-flip ${G.flipped ? 'show' : ''}">
          <p class="small">Read it aloud. Everyone else votes in secret.</p>
          <button class="btn primary" data-a="startVote">Start the vote</button>
          <button class="link" data-a="skipCard">Skip this card</button>
        </div>
      </section>`,

    vote: () => {
      const me = G.players[G.handoff.to];
      return `
      ${topbar()}
      <section class="screen vote">
        <p class="eyebrow">Don't let ${esc(hot().name)} see!</p>
        ${miniCard()}
        <h2>${esc(me.name)}, what do you think?</h2>
        <div class="choices">
          <button class="choice agree" data-a="vote" data-v="1">Agree</button>
          <button class="choice disagree" data-a="vote" data-v="0">Disagree</button>
        </div>
      </section>`;
    },

    predict: () => {
      const vs = voters();
      const done = vs.every(p => p in G.preds);
      return `
      ${topbar()}
      <section class="screen predict">
        <h2>Read the room, ${esc(hot().name)}</h2>
        ${miniCard()}
        <p class="small">Predict how each player voted.</p>
        <ul class="pred-list">${vs.map(p => `
          <li><span class="nm">${esc(G.players[p].name)}</span>
            <span class="seg">
              <button class="${G.preds[p] === true ? 'on agree' : ''}" data-a="pred" data-p="${p}" data-v="1">Agree</button>
              <button class="${G.preds[p] === false ? 'on disagree' : ''}" data-a="pred" data-p="${p}" data-v="0">Disagree</button>
            </span></li>`).join('')}
        </ul>
        <button class="btn primary" data-a="lockPreds" ${done ? '' : 'disabled'}>Lock in predictions</button>
      </section>`;
    },

    reveal: () => {
      const p = voters()[G.rv];
      const name = esc(G.players[p].name);
      const guess = G.preds[p], actual = G.votes[p];
      const right = guess === actual;
      const guessTag = `<span class="tag-v ${guess ? 'agree' : 'disagree'}">${vote(guess)}</span>`;
      const progress = `<p class="eyebrow">Reveal ${G.rv + 1} of ${voters().length}</p>`;
      const stage = {
        guess: () => `
          ${progress}
          <h2 class="big-name">${name}</h2>
          <p class="said">${esc(hot().name)} guessed ${guessTag}</p>
          <button class="btn primary" data-a="reveal">Reveal ${name}'s vote</button>`,
        shown: () => right ? `
          ${progress}
          <h2 class="big-name">${name}</h2>
          <div class="verdict ${actual ? 'agree' : 'disagree'} pop">${vote(actual)}</div>
          <p class="result win">Nailed it! +1 for ${esc(hot().name)} 🔥</p>
          <button class="btn primary" data-a="correct">Next</button>` : `
          ${progress}
          <h2 class="big-name">${name}</h2>
          <div class="verdict ${actual ? 'agree' : 'disagree'} pop">${vote(actual)}</div>
          <p class="result">Wrong! ${esc(hot().name)}, you get 1 minute to convince ${name} to ${actual ? 'disagree' : 'agree'}.</p>
          <button class="btn primary" data-a="convince">Start the 1:00 timer</button>
          <button class="link" data-a="noConvince">Skip, no point</button>`,
        convince: () => `
          <p class="eyebrow">Convince ${name} to ${actual ? 'disagree' : 'agree'}</p>
          ${miniCard()}
          <div class="timer"><svg viewBox="0 0 120 120"><circle class="track" cx="60" cy="60" r="52"/>
            <circle class="ring" cx="60" cy="60" r="52" pathLength="100"/></svg><span class="secs">1:00</span></div>
          <button class="btn primary" data-a="timeUp">Done arguing</button>`,
        ask: () => `
          <p class="eyebrow">Moment of truth</p>
          <h2>${name}, did ${esc(hot().name)} change your mind?</h2>
          <div class="choices">
            <button class="choice ${actual ? 'disagree' : 'agree'}" data-a="convinced">Yes, now I ${actual ? 'disagree' : 'agree'}</button>
            <button class="choice held" data-a="held">No, I'm holding firm</button>
          </div>`,
      }[G.rvStage];
      return `${topbar()}<section class="screen reveal">${stage()}</section>`;
    },

    summary: () => {
      const pts = G.results.filter(r => r.outcome !== 'held').length;
      const last = G.turn + 1 >= totalTurns();
      const icon = { correct: '🎯', convinced: '🗣️', held: '🧱' };
      const label = { correct: 'Called it', convinced: 'Convinced', held: 'Held firm' };
      return `
      ${topbar()}
      <section class="screen summary">
        <p class="eyebrow">Turn over</p>
        <h2>${esc(hot().name)} scored ${pts} point${pts === 1 ? '' : 's'}</h2>
        <ul class="results">${G.results.map(r => `
          <li class="${r.outcome}"><span>${icon[r.outcome]}</span><span class="nm">${esc(G.players[r.p].name)}</span>
            <span class="tag-v ${r.vote ? 'agree' : 'disagree'}">${vote(r.vote)}</span><em>${label[r.outcome]}</em></li>`).join('')}
        </ul>
        ${scoreboard(hotIdx())}
        <button class="btn primary" data-a="nextTurn">${last ? 'See final scores' : `Next up: ${esc(G.players[(G.turn + 1) % n()].name)}`}</button>
      </section>`;
    },

    final: () => {
      const top = Math.max(...G.players.map(p => p.score));
      const winners = G.players.filter(p => p.score === top).map(p => esc(p.name));
      return `
      <section class="screen final">
        <img class="trophy" src="art/hero.jpg" alt="">
        <p class="eyebrow">${winners.length > 1 ? "It's a tie!" : 'Winner'}</p>
        <h2 class="big-name">${winners.join(' & ')}</h2>
        ${scoreboard()}
        <p class="tag">Thanks for playing!</p>
        <div class="stack">
          <button class="btn primary" data-a="again">Play again</button>
          <button class="btn ghost" data-a="endHome">Home</button>
        </div>
      </section>`;
    },
  };

  // ---------- actions ----------

  const actions = {
    home: () => { screen = 'home'; },
    rules: () => { screen = 'rules'; },
    setup: () => { screen = 'setup'; },
    resume: () => { screen = 'game'; requestWakeLock(); },
    start: () => { save(SETUP_KEY, setup); startGame(); screen = 'game'; },
    rmPlayer: d => { setup.players.splice(+d.i, 1); save(SETUP_KEY, setup); },
    toggleLevel: d => {
      const lv = +d.lv, on = setup.levels.includes(lv);
      if (on && setup.levels.length === 1) return;
      setup.levels = on ? setup.levels.filter(x => x !== lv) : [...setup.levels, lv];
    },
    rounds: d => { setup.rounds = Math.min(MAX_ROUNDS, Math.max(1, setup.rounds + +d.d)); },
    quit: () => {
      if (!confirm('Quit this game? Scores will be lost.')) return false;
      G = null; drop(GAME_KEY); screen = 'home';
    },
    takePhone: () => { G.screen = G.handoff.then; buzz(15); },
    pick: d => draw(d.lv === 'random' ? G.levels[Math.random() * G.levels.length | 0] : +d.lv),
    flip: () => {
      // Toggle the class in place so the CSS flip animation actually plays.
      if (!G.flipped) {
        G.flipped = true; buzz(20); persist();
        $app.querySelector('.flipper').classList.add('flipped');
        $app.querySelector('.after-flip').classList.add('show');
      }
      return false;
    },
    skipCard: () => draw(G.card.lv),
    startVote: () => nextVoter(null),
    vote: d => { const p = G.handoff.to; G.votes[p] = d.v === '1'; buzz(30); nextVoter(p); },
    pred: d => { G.preds[d.p] = d.v === '1'; },
    lockPreds: () => { G.rv = 0; G.rvStage = 'guess'; G.screen = 'reveal'; },
    reveal: () => {
      G.rvStage = 'shown';
      const p = voters()[G.rv];
      buzz(G.preds[p] === G.votes[p] ? [40, 60, 40] : 200);
    },
    correct: () => { score('correct'); nextReveal(); },
    noConvince: () => { score('held'); nextReveal(); },
    convince: () => { G.rvStage = 'convince'; G.timerEnd = Date.now() + CONVINCE_SECONDS * 1000; },
    timeUp: () => { G.rvStage = 'ask'; },
    convinced: () => { score('convinced'); buzz([40, 60, 40]); nextReveal(); },
    held: () => { score('held'); nextReveal(); },
    nextTurn: () => nextTurn(),
    again: () => { startGame(); },
    endHome: () => { G = null; drop(GAME_KEY); screen = 'home'; },
  };

  let focusIdx = null;
  let lastKey = '';

  // ---------- render loop ----------

  function render() {
    clearInterval(timerId);
    const name = screen === 'game' && G ? G.screen : screen;
    // Only animate the screen in when it actually changes (not on in-place updates like toggles).
    const key = [name, G?.rvStage, G?.handoff?.to, G?.turn].join('|');
    $app.className = `view-${name}` + (G && G.card && screen === 'game' ? ` heat-${G.card.lv}` : '') +
      (key === lastKey ? ' still' : '');
    lastKey = key;
    $app.innerHTML = views[name]();
    persist();
    if (name === 'reveal' && G.rvStage === 'convince') runTimer();
    if (focusIdx != null) {
      $app.querySelector(`.players input[data-i="${focusIdx}"]`)?.focus();
      focusIdx = null;
    }
  }

  function runTimer() {
    const ring = $app.querySelector('.ring'), secs = $app.querySelector('.secs');
    const tick = () => {
      const left = Math.max(0, G.timerEnd - Date.now());
      const s = Math.ceil(left / 1000);
      ring.style.strokeDashoffset = 100 - (left / (CONVINCE_SECONDS * 1000)) * 100;
      secs.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      secs.classList.toggle('urgent', s <= 10);
      if (left <= 0) {
        clearInterval(timerId);
        buzz([300, 100, 300]);
        beep();
        G.rvStage = 'ask';
        setTimeout(render, 600);
      }
    };
    tick();
    timerId = setInterval(tick, 250);
  }

  function beep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = 660; o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.25, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
      o.start(); o.stop(ctx.currentTime + 0.8);
    } catch {}
  }

  let wakeLock = null;
  async function requestWakeLock() {
    try { wakeLock = await navigator.wakeLock?.request('screen'); } catch {}
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && screen === 'game' && G) requestWakeLock();
  });

  $app.addEventListener('click', e => {
    const el = e.target.closest('[data-a]');
    if (!el || el.disabled) return;
    const fn = actions[el.dataset.a];
    if (fn && fn(el.dataset) !== false) {
      render();
      if (!['flip', 'pred', 'toggleLevel', 'rounds'].includes(el.dataset.a)) window.scrollTo(0, 0);
    }
  });

  // Typing names updates state without re-rendering (keeps keyboard focus).
  $app.addEventListener('input', e => {
    if (e.target.matches('.players input')) {
      const li = e.target.closest('li');
      if (li.classList.contains('ghost')) {
        // First keystroke in the ghost row: it becomes a real player and a new ghost appears below it.
        li.classList.remove('ghost');
        e.target.placeholder = `Player ${setup.players.length + 1}`;
        setup.players.push(e.target.value);
        li.insertAdjacentHTML('beforeend', removeBtn(setup.players.length - 1));
        if (setup.players.length < MAX_PLAYERS) li.insertAdjacentHTML('afterend', playerRow(setup.players.length, '', true));
      } else {
        setup.players[+e.target.dataset.i] = e.target.value;
      }
      save(SETUP_KEY, setup);
      const why = setupProblem();
      $app.querySelector('[data-a="start"]').disabled = !!why;
      $app.querySelector('#why').textContent = why;
    }
  });
  // Leaving an extra row empty removes it (and the ghost row moves up).
  $app.addEventListener('focusout', e => {
    if (!e.target.matches('.players input')) return;
    const i = +e.target.dataset.i;
    if (i < MIN_PLAYERS || i >= setup.players.length || setup.players[i].trim()) return;
    const next = e.relatedTarget?.matches?.('.players input') ? +e.relatedTarget.dataset.i : null;
    setup.players.splice(i, 1);
    save(SETUP_KEY, setup);
    focusIdx = next == null ? null : next > i ? next - 1 : next;
    render();
  });
  $app.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.matches('.players input')) {
      e.preventDefault();
      const next = $app.querySelector(`.players input[data-i="${+e.target.dataset.i + 1}"]`);
      next ? next.focus() : e.target.blur();
    }
  });

  render();
})();
