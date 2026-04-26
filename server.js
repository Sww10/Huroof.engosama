const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const compression = require('compression');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// ── Payment & Auth ────────────────────────────
const Stripe = require('stripe');
const { OAuth2Client } = require('google-auth-library');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_PUBLISHABLE_KEY = process.env.STRIPE_PUBLISHABLE_KEY || '';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GAME_PRICE_SAR = 2; // سعر اللعبة بالريال السعودي

const stripe = STRIPE_SECRET_KEY ? Stripe(STRIPE_SECRET_KEY) : null;
const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

// ── User Storage ──────────────────────────────
const USERS_FILE = path.join(__dirname, 'users.json');
function loadUsers() {
  try {
    const data = fs.readFileSync(USERS_FILE, 'utf8');
    return JSON.parse(data);
  } catch { return {}; }
}
function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
}
function getUser(email) {
  const users = loadUsers();
  return users[email] || null;
}
function setUserPaid(email, name) {
  const users = loadUsers();
  users[email] = { email, name, paid: true, paidAt: new Date().toISOString() };
  saveUsers(users);
}
function registerUser(email, name) {
  const users = loadUsers();
  if (!users[email]) {
    users[email] = { email, name, paid: false };
    saveUsers(users);
  }
  return users[email];
}

let questionsData = {};
function loadQuestions() {
  try {
    const data = fs.readFileSync(path.join(__dirname, 'questions.json'), 'utf8');
    questionsData = JSON.parse(data);
    console.log('Loaded questions.json successfully');
    return true;
  } catch (err) {
    console.error('Could not load questions.json', err.message);
    return false;
  }
}
loadQuestions();

// ── XSS Sanitization ──────────────────────────
function sanitizeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ── Middleware ─────────────────────────────────
app.use(compression());
app.use(express.json({ limit: '50mb' }));

// Simple rate limiting for API endpoints
const rateLimitMap = new Map();
function rateLimit(windowMs, maxRequests) {
  return (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    const record = rateLimitMap.get(ip) || { count: 0, resetTime: now + windowMs };
    if (now > record.resetTime) {
      record.count = 0;
      record.resetTime = now + windowMs;
    }
    record.count++;
    rateLimitMap.set(ip, record);
    if (record.count > maxRequests) {
      return res.status(429).json({ success: false, message: 'طلبات كثيرة، حاول لاحقاً' });
    }
    next();
  };
}

// Clean up rate limit map every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of rateLimitMap) {
    if (now > record.resetTime) rateLimitMap.delete(ip);
  }
}, 5 * 60 * 1000);

// Lightweight ping endpoint for cron jobs (Render keep-awake)
app.get('/ping', (req, res) => {
  res.send('OK');
});

// Redirect root to home page
app.get('/', (req, res) => {
  res.redirect('/home.html');
});

// Cache static files for 1 hour
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1h',
  etag: true,
}));

// ── Upload Questions Endpoint ─────────────────
app.post('/upload-questions', (req, res) => {
  try {
    const data = req.body;
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return res.status(400).json({ success: false, message: 'ملف غير صالح. يجب أن يكون ملف JSON بصيغة صحيحة.' });
    }
    fs.writeFileSync(path.join(__dirname, 'questions.json'), JSON.stringify(data, null, 4), 'utf8');
    const success = loadQuestions();
    if (success) {
      res.json({ success: true, message: 'تم تحميل الأسئلة بنجاح! عدد الفئات: ' + Object.keys(data).length });
    } else {
      res.status(500).json({ success: false, message: 'حدث خطأ أثناء تحميل الأسئلة.' });
    }
  } catch (err) {
    console.error('Upload questions error:', err.message);
    res.status(500).json({ success: false, message: 'خطأ في الخادم: ' + err.message });
  }
});

// ──────────────────────────────────────────────
// Payment & Auth API Routes
// ──────────────────────────────────────────────

// Get Stripe publishable key (for frontend)
app.get('/api/config', (req, res) => {
  res.json({
    stripePublishableKey: STRIPE_PUBLISHABLE_KEY,
    googleClientId: GOOGLE_CLIENT_ID,
    gamePrice: GAME_PRICE_SAR
  });
});

// Verify Google Sign-In token
app.post('/api/verify-google', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token || !googleClient) {
      return res.status(400).json({ success: false, message: 'توكن غير صالح' });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: token,
      audience: GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const { email, name, picture } = payload;

    const user = registerUser(email, name);
    res.json({ success: true, user: { email, name, picture, paid: user.paid } });
  } catch (err) {
    console.error('Google verify error:', err.message);
    res.status(401).json({ success: false, message: 'فشل التحقق من حساب قوقل' });
  }
});

// Check if user has paid
app.get('/api/check-payment/:email', (req, res) => {
  const email = decodeURIComponent(req.params.email);
  const user = getUser(email);
  res.json({ paid: user ? user.paid : false });
});

// Create Stripe Checkout Session
app.post('/api/create-checkout', async (req, res) => {
  try {
    const { email, name } = req.body;
    if (!email || !stripe) {
      return res.status(400).json({ success: false, message: 'بيانات غير صالحة' });
    }

    // Check if already paid
    const user = getUser(email);
    if (user && user.paid) {
      return res.json({ success: true, alreadyPaid: true });
    }

    const baseUrl = req.headers.origin || `http://localhost:${PORT}`;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      customer_email: email,
      line_items: [{
        price_data: {
          currency: 'sar',
          product_data: {
            name: 'حروف مع أسامة - فتح اللعبة',
            description: 'دفع مرة واحدة لفتح اللعبة بشكل دائم',
          },
          unit_amount: GAME_PRICE_SAR * 100, // Stripe uses halalas (cents)
        },
        quantity: 1,
      }],
      success_url: `${baseUrl}/payment-success.html?email=${encodeURIComponent(email)}`,
      cancel_url: `${baseUrl}/home.html`,
      metadata: { email, name },
    });

    res.json({ success: true, url: session.url });
  } catch (err) {
    console.error('Stripe checkout error:', err.message);
    res.status(500).json({ success: false, message: 'خطأ في إنشاء جلسة الدفع' });
  }
});

// Stripe Webhook (receives payment confirmation)
app.post('/api/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  try {
    const event = JSON.parse(req.body);
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const email = session.customer_email || session.metadata?.email;
      const name = session.metadata?.name || '';
      if (email) {
        setUserPaid(email, name);
        console.log(`✅ Payment confirmed for: ${email}`);
      }
    }
    res.json({ received: true });
  } catch (err) {
    console.error('Webhook error:', err.message);
    res.status(400).json({ error: 'Webhook error' });
  }
});

// Manual payment confirmation (for success page callback)
app.post('/api/confirm-payment', (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ success: false });
  const user = getUser(email);
  // If webhook already confirmed, return true
  if (user && user.paid) return res.json({ success: true, paid: true });
  // Otherwise mark as paid (fallback for webhook delay)
  setUserPaid(email, user?.name || '');
  res.json({ success: true, paid: true });
});

// ──────────────────────────────────────────────
// Game State
// ──────────────────────────────────────────────
let globalNgrokUrl = null;

// rooms: keyed by roomId -> { gameState, playerStats, activeTimer, timerStartedAt, timerDuration }
const rooms = {};

// players: maps socketId → { name, roomId }
const players = {};

function getRoom(roomId) {
  if (!rooms[roomId]) {
    rooms[roomId] = {
      gameState: {
        status: 'waiting', // waiting | first_buzz | first_locked | steal | steal_locked | open | open_locked
        teamNames: { 1: 'الفريق الأول', 2: 'الفريق الثاني' },
        scores: { 1: 0, 2: 0 },
        winner: null,
        stealTarget: null,
        ngrokUrl: globalNgrokUrl || `http://localhost:${PORT}`,
        hexMap: {},          // { 'أ': 'unclaimed', ... }
        activeQuestion: null,// { letter, q, a }
        currentRound: 1,
        mapOrder: [],
        bellDisabled: false, // Admin bell toggle
      },
      powerups: { frozen1: 0, frozen2: 0 },
      playerStats: {}, // { score, team, emoji, socketId, connected }
      bannedIPs: new Set(), // Banned player IPs
      buzzTracker: {}, // { playerName: consecutiveCount }
      activeTimer: null,
      timerStartedAt: null,
      timerDuration: 0,
      timerRemaining: null,
      isTimerPaused: false,
      settings: {
        gameTitle: "حروف مع أسامة",
        buzzerTime: 3,
        stealTime: 10,
        team1Color: "#f97316",
        team2Color: "#22c55e",
        correctScore: 1,
        wrongPenalty: 0,
        autoReveal: false,
        enableSound: true
      }
    };
    generateNewMap(rooms[roomId], roomId);
    rooms[roomId].gameState.currentRound = 1;
  }
  return rooms[roomId];
}

function clearActiveTimer(room) {
  if (room.activeTimer) {
    clearTimeout(room.activeTimer);
    room.activeTimer = null;
  }
  room.timerStartedAt = null;
  room.timerDuration = 0;
  room.timerRemaining = null;
  room.isTimerPaused = false;
}

const ARABIC_LETTERS = ['أ', 'ب', 'ت', 'ث', 'ج', 'ح', 'خ', 'د', 'ذ', 'ر', 'ز', 'س', 'ش', 'ص', 'ض', 'ط', 'ظ', 'ع', 'غ', 'ف', 'ق', 'ك', 'ل', 'م', 'ن', 'هـ', 'و', 'ي'];

function getMapDataPayload(room) {
  if (!room || !room.gameState.mapOrder) return [];
  return room.gameState.mapOrder.map(letter => ({
    id: letter,
    letter: letter,
    state: room.gameState.hexMap[letter] || 'unclaimed'
  }));
}

function generateNewMap(room, roomId) {
  let shuffled = [...ARABIC_LETTERS];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const selected = shuffled.slice(0, 28);
  room.gameState.mapOrder = selected;
  room.gameState.hexMap = {};
  selected.forEach(letter => {
    room.gameState.hexMap[letter] = 'unclaimed';
  });
  room.gameState.activeQuestion = null;

  if (roomId && typeof io !== 'undefined') {
    io.to(roomId).emit('map_update', getMapDataPayload(room));
  }
}

const HEX_NEIGHBORS = {
  0: [1, 5],
  1: [0, 2, 5, 6],
  2: [1, 3, 6, 7],
  3: [2, 4, 7, 8],
  4: [3, 8],
  5: [6, 0, 1, 10, 11],
  6: [5, 7, 1, 2, 11, 12],
  7: [6, 8, 2, 3, 12, 13],
  8: [7, 9, 3, 4, 13, 14],
  9: [8, 4, 14],
  10: [11, 5, 15],
  11: [10, 12, 5, 6, 15, 16],
  12: [11, 13, 6, 7, 16, 17],
  13: [12, 14, 7, 8, 17, 18],
  14: [13, 8, 9, 18, 19],
  15: [16, 10, 11, 20, 21],
  16: [15, 17, 11, 12, 21, 22],
  17: [16, 18, 12, 13, 22, 23],
  18: [17, 19, 13, 14, 23, 24],
  19: [18, 14, 24],
  20: [21, 15],
  21: [20, 22, 15, 16],
  22: [21, 23, 16, 17],
  23: [22, 24, 17, 18],
  24: [23, 18, 19]
};

function checkPathfindingWin(room, roomId) {
  const mapOrder = room.gameState.mapOrder;
  const hexMap = room.gameState.hexMap;
  if (!mapOrder || mapOrder.length !== 25) return;

  const team1Indices = [];
  const team2Indices = [];

  mapOrder.forEach((letter, index) => {
    if (hexMap[letter] === 'team1') team1Indices.push(index);
    if (hexMap[letter] === 'team2') team2Indices.push(index);
  });

  // Team 1 (Orange): Left to Right
  const team1Start = team1Indices.filter(i => [0, 5, 10, 15, 20].includes(i));
  const team1Target = [4, 9, 14, 19, 24];

  // Team 2 (Green): Top to Bottom
  const team2Start = team2Indices.filter(i => [0, 1, 2, 3, 4].includes(i));
  const team2Target = [20, 21, 22, 23, 24];

  function bfs(startNodes, targetNodes, teamIndices) {
    let visited = new Set(startNodes);
    let queue = [...startNodes];

    while (queue.length > 0) {
      const node = queue.shift();
      if (targetNodes.includes(node)) return true;

      const neighbors = HEX_NEIGHBORS[node] || [];
      for (const neighbor of neighbors) {
        if (teamIndices.includes(neighbor) && !visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
    return false;
  }

  if (team1Start.length > 0 && bfs(team1Start, team1Target, team1Indices)) {
    room.gameState.status = 'round_ended';
    io.to(roomId).emit('round_win', { team: 1, teamName: room.gameState.teamNames[1] });
    return;
  }

  if (team2Start.length > 0 && bfs(team2Start, team2Target, team2Indices)) {
    room.gameState.status = 'round_ended';
    io.to(roomId).emit('round_win', { team: 2, teamName: room.gameState.teamNames[2] });
    return;
  }
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────
function buildRosterPayload(room) {
  const roster = { 1: [], 2: [] };
  for (const [name, data] of Object.entries(room.playerStats)) {
    const team = data.team;
    if (team === 1 || team === 2) {
      roster[team].push({ name, score: data.score, emoji: data.emoji, connected: data.connected });
    }
  }
  return roster;
}

function getMvp(room) {
  let mvp = null;
  let highest = -1;
  for (const [name, data] of Object.entries(room.playerStats)) {
    if (data.score > highest) {
      highest = data.score;
      mvp = { name, score: data.score, emoji: data.emoji, team: data.team };
    }
  }
  return mvp;
}

function getCalculatedRemaining(room) {
  if (room.isTimerPaused && room.timerRemaining > 0) {
    return room.timerRemaining;
  } else if (!room.isTimerPaused && room.timerStartedAt && room.timerDuration > 0) {
    const elapsed = (Date.now() - room.timerStartedAt) / 1000;
    return Math.max(0, room.timerDuration - elapsed);
  }
  return 0;
}

function broadcastGameState(roomId) {
  const room = rooms[roomId];
  if (!room) return;
  io.to(roomId).emit('game_state', {
    status: room.gameState.status,
    teamNames: room.gameState.teamNames,
    scores: room.gameState.scores,
    winner: room.gameState.winner,
    stealTarget: room.gameState.stealTarget,
    hexMap: room.gameState.hexMap,
    activeQuestion: room.gameState.activeQuestion ? { letter: room.gameState.activeQuestion.letter } : null,
    currentRound: room.gameState.currentRound,
    mapOrder: room.gameState.mapOrder,
    isTimerPaused: room.isTimerPaused,
    calculatedRemaining: getCalculatedRemaining(room),
    timerRemaining: room.timerRemaining,
    timerDuration: room.timerDuration,
    timerStartedAt: room.timerStartedAt,
    bellDisabled: room.gameState.bellDisabled,
    settings: room.settings
  });
}

function broadcastRoster(roomId) {
  const room = rooms[roomId];
  if (!room) return;
  io.to(roomId).emit('roster_update', {
    roster: buildRosterPayload(room),
    mvp: getMvp(room),
    scores: room.gameState.scores,
    teamNames: room.gameState.teamNames,
  });
}

function broadcastAll(roomId) {
  broadcastGameState(roomId);
  broadcastRoster(roomId);
}

function transitionToSteal(roomId, wrongPlayerName) {
  const room = rooms[roomId];
  clearActiveTimer(room);

  const wrongTeam = room.playerStats[wrongPlayerName]?.team;
  const stealTeam = wrongTeam === 1 ? 2 : 1;

  room.gameState.status = 'steal';
  room.gameState.stealTarget = stealTeam;
  room.gameState.winner = null;

  const STEAL_DURATION = room.settings.stealTime;
  room.timerDuration = STEAL_DURATION;
  room.timerStartedAt = Date.now();

  io.to(roomId).emit('buzzer_wrong', { playerName: wrongPlayerName });
  broadcastGameState(roomId);

  io.to(roomId).emit('steal_window', {
    stealTeam,
    teamName: room.gameState.teamNames[stealTeam],
    duration: STEAL_DURATION,
  });

  room.activeTimer = setTimeout(() => {
    // Steal window expired → go to open for all
    room.gameState.status = 'open';
    room.gameState.stealTarget = null;
    room.gameState.winner = null;
    clearActiveTimer(room);

    // We emit steal_expired to clear steal UI
    io.to(roomId).emit('steal_expired');

    // Then broadcast new state 'open' immediately
    broadcastGameState(roomId);
  }, STEAL_DURATION * 1000);
}

function transitionToOpen(roomId, wrongPlayerName) {
  const room = rooms[roomId];
  clearActiveTimer(room);
  room.gameState.status = 'open';
  room.gameState.stealTarget = null;
  room.gameState.winner = null;
  io.to(roomId).emit('buzzer_wrong', { playerName: wrongPlayerName });
  broadcastGameState(roomId);
}

function resetToWaiting(roomId) {
  const room = rooms[roomId];
  clearActiveTimer(room);
  room.gameState.status = 'waiting';
  room.gameState.winner = null;
  room.gameState.stealTarget = null;
  room.gameState.activeQuestion = null;
  broadcastAll(roomId);
}

// ──────────────────────────────────────────────
// Socket.io
// ──────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // ── Pre-join room info check ────────────────
  socket.on('check_room', ({ roomId }) => {
    if (!roomId) roomId = 'public';
    const room = getRoom(roomId);
    if (!room.gameState.mapOrder || room.gameState.mapOrder.length === 0) {
      generateNewMap(room, roomId);
    }

    socket.emit('game_state', {
      teamNames: room.gameState.teamNames
    });
  });

  // ── Display: join room (view-only) ────────────
  socket.on('display_join', ({ roomId }) => {
    if (!roomId) roomId = 'public';
    socket.join(roomId);
    const room = getRoom(roomId);

    // Send full game state
    socket.emit('game_state', {
      status: room.gameState.status,
      teamNames: room.gameState.teamNames,
      scores: room.gameState.scores,
      hexMap: room.gameState.hexMap,
      activeQuestion: room.gameState.activeQuestion ? { letter: room.gameState.activeQuestion.letter } : null,
      currentRound: room.gameState.currentRound,
      calculatedRemaining: getCalculatedRemaining(room),
      settings: room.settings,
    });

    // Send hex map data
    socket.emit('map_update', getMapDataPayload(room));

    // Send roster
    socket.emit('roster_update', {
      roster: buildRosterPayload(room),
      mvp: getMvp(room),
      scores: room.gameState.scores,
      teamNames: room.gameState.teamNames,
    });

    console.log(`Display joined room: ${roomId}`);
  });

  // ── Admin: join room ─────────────────────────
  socket.on('admin_join_room', ({ roomId }) => {
    if (!roomId) roomId = 'public';
    socket.join(roomId);
    const room = getRoom(roomId);

    // Send state immediately
    socket.emit('game_state', {
      status: room.gameState.status,
      teamNames: room.gameState.teamNames,
      scores: room.gameState.scores,
      winner: room.gameState.winner,
      stealTarget: room.gameState.stealTarget,
      hexMap: room.gameState.hexMap,
      activeQuestion: room.gameState.activeQuestion ? { letter: room.gameState.activeQuestion.letter } : null,
      currentRound: room.gameState.currentRound,
      mapOrder: room.gameState.mapOrder,
      settings: room.settings
    });
    socket.emit('admin_sync', { activeQuestion: room.gameState.activeQuestion });
    socket.emit('map_update', getMapDataPayload(room));
    socket.emit('roster_update', {
      roster: buildRosterPayload(room),
      mvp: getMvp(room),
      scores: room.gameState.scores,
      teamNames: room.gameState.teamNames,
    });
    if (room.gameState.ngrokUrl) {
      socket.emit('ngrok_url', room.gameState.ngrokUrl);
    }
  });

  // ── Player: join ──────────────────────────────
  socket.on('player_join', ({ roomId, name, team, emoji }) => {
    if (!roomId) roomId = 'public';
    if (!name || !team || !emoji) return;

    const room = getRoom(roomId);
    const trimmed = sanitizeHTML(name.trim());
    if (!trimmed) return;

    // Check if player is banned by IP
    const playerIP = socket.handshake.address;
    if (room.bannedIPs.has(playerIP)) {
      socket.emit('join_rejected', { reason: 'أنت محظور من هذه الغرفة' });
      return;
    }

    socket.join(roomId);

    // ── Single-device enforcement: kick old session if same name is already connected ──
    if (room.playerStats[trimmed] && room.playerStats[trimmed].connected && room.playerStats[trimmed].socketId !== socket.id) {
      const oldSocketId = room.playerStats[trimmed].socketId;
      io.to(oldSocketId).emit('session_replaced');
      // Clean up old socket mapping
      delete players[oldSocketId];
    }

    if (room.playerStats[trimmed]) {
      room.playerStats[trimmed].socketId = socket.id;
    } else {
      room.playerStats[trimmed] = { score: 0, team, emoji, socketId: socket.id };
    }

    room.playerStats[trimmed].team = team;
    room.playerStats[trimmed].emoji = emoji;
    room.playerStats[trimmed].socketId = socket.id;
    room.playerStats[trimmed].connected = true;

    players[socket.id] = { name: trimmed, roomId };

    socket.emit('join_success', {
      name: trimmed,
      team,
      emoji,
      score: room.playerStats[trimmed].score,
    });

    // Send active states if joining mid-game
    socket.emit('game_state', {
      status: room.gameState.status,
      teamNames: room.gameState.teamNames,
      scores: room.gameState.scores,
      winner: room.gameState.winner,
      stealTarget: room.gameState.stealTarget,
      hexMap: room.gameState.hexMap,
      activeQuestion: room.gameState.activeQuestion ? { letter: room.gameState.activeQuestion.letter } : null,
      currentRound: room.gameState.currentRound,
      mapOrder: room.gameState.mapOrder,
      calculatedRemaining: getCalculatedRemaining(room),
      bellDisabled: room.gameState.bellDisabled,
      settings: room.settings
    });
    socket.emit('map_update', getMapDataPayload(room));

    broadcastRoster(roomId);
  });

  // ── Player: buzz ──────────────────────────────
  socket.on('buzz', () => {
    const player = players[socket.id];
    if (!player) return;

    const { name, roomId } = player;
    const room = rooms[roomId];
    if (!room || !room.playerStats[name]) return;

    // Block buzz if bell is disabled by admin
    if (room.gameState.bellDisabled) return;

    // Block buzz if team is frozen
    const playerTeam = room.playerStats[name].team;
    if (room.gameState.powerups && Date.now() < room.gameState.powerups['frozen' + playerTeam]) {
      // Send frozen feedback purely to the attempting player if desired
      socket.emit('buzzer_frozen');
      return;
    }

    // Spam protection: count consecutive buzzes
    if (!room.buzzTracker[name]) room.buzzTracker[name] = 0;
    room.buzzTracker[name]++;
    if (room.buzzTracker[name] >= 5) {
      // Auto-kick for spamming
      const kickedSocketId = room.playerStats[name].socketId;
      delete room.playerStats[name];
      delete room.buzzTracker[name];
      for (const [sid, pObj] of Object.entries(players)) {
        if (pObj.name === name && pObj.roomId === roomId) delete players[sid];
      }
      if (kickedSocketId) {
        io.to(kickedSocketId).emit('kicked_spam');
      }
      io.to(roomId).emit('player_spam_kicked', { playerName: name });
      broadcastRoster(roomId);
      return;
    }

    const status = room.gameState.status;

    if (status === 'first_buzz') {
      clearActiveTimer(room);
      room.gameState.status = 'first_locked';
      room.gameState.winner = { name, team: playerTeam, emoji: room.playerStats[name].emoji };

      if (room.settings && room.settings.autoReveal) {
        room.gameState.revealActive = true;
      }

      const ANSWER_TIME = room.settings.buzzerTime;
      room.timerDuration = ANSWER_TIME;
      room.timerStartedAt = Date.now();

      // Reset buzz tracker on successful buzz
      room.buzzTracker[name] = 0;

      io.to(roomId).emit('player_buzzed', {
        playerName: name,
        team: playerTeam,
        emoji: room.playerStats[name].emoji,
        duration: ANSWER_TIME,
      });
      broadcastGameState(roomId);

      room.activeTimer = setTimeout(() => {
        transitionToSteal(roomId, name);
      }, ANSWER_TIME * 1000);

    } else if (status === 'steal') {
      if (playerTeam !== room.gameState.stealTarget) return;

      const elapsed = (Date.now() - room.timerStartedAt) / 1000;
      const remaining = Math.max(0, room.timerDuration - elapsed);

      clearActiveTimer(room);
      room.gameState.status = 'steal_locked';
      room.gameState.winner = { name, team: playerTeam, emoji: room.playerStats[name].emoji };

      if (room.settings && room.settings.autoReveal) {
        room.gameState.revealActive = true;
      }
      room.timerDuration = remaining;
      room.timerStartedAt = Date.now();

      room.buzzTracker[name] = 0;

      io.to(roomId).emit('player_buzzed', {
        playerName: name,
        team: playerTeam,
        emoji: room.playerStats[name].emoji,
        duration: remaining,
      });
      broadcastGameState(roomId);

      room.activeTimer = setTimeout(() => {
        transitionToOpen(roomId, name);
      }, remaining * 1000);

    } else if (status === 'open') {
      clearActiveTimer(room);
      room.gameState.status = 'open_locked';
      room.gameState.winner = { name, team: playerTeam, emoji: room.playerStats[name].emoji };

      if (room.settings && room.settings.autoReveal) {
        room.gameState.revealActive = true;
      }

      const ANSWER_TIME = 3;
      room.timerDuration = ANSWER_TIME;
      room.timerStartedAt = Date.now();

      room.buzzTracker[name] = 0;

      io.to(roomId).emit('player_buzzed', {
        playerName: name,
        team: playerTeam,
        emoji: room.playerStats[name].emoji,
        duration: ANSWER_TIME,
      });
      broadcastGameState(roomId);

      room.activeTimer = setTimeout(() => {
        transitionToOpen(roomId, name);
      }, ANSWER_TIME * 1000);
    }
  });

  // ── Player: Vote Hex ─────────────────────────
  socket.on('player_vote_hex', ({ letter }) => {
    const player = players[socket.id];
    if (!player) return;
    io.to(player.roomId).emit('hex_vote_admin', { letter, playerName: player.name });
  });

  // ── Player: Team Settings ─────────────────────
  socket.on('rename_team', ({ team, newName }) => {
    const player = players[socket.id];
    if (!player) return;
    const room = rooms[player.roomId];
    if (!room) return;

    const trimmed = sanitizeHTML((newName || '').trim());
    if (!trimmed) return;

    room.gameState.teamNames[team] = trimmed;
    broadcastAll(player.roomId);
  });

  socket.on('change_team_color', ({ team, newColor }) => {
    const player = players[socket.id];
    if (!player) return;
    const room = rooms[player.roomId];
    if (!room) return;

    const hexColorMatch = /^#([0-9A-F]{3}){1,2}$/i.test(newColor);
    if (!hexColorMatch) return;

    if (team === 1) room.settings.team1Color = newColor;
    if (team === 2) room.settings.team2Color = newColor;

    io.to(player.roomId).emit('team_color_updated', { team, newColor });
    broadcastGameState(player.roomId);
  });

  socket.on('switch_team', ({ team, playerName }) => {
    const player = players[socket.id];
    if (!player || player.name !== playerName) return;
    const room = rooms[player.roomId];
    if (!room || !room.playerStats[playerName]) return;

    room.playerStats[playerName].team = team;
    io.to(player.roomId).emit('team_switched', { playerName, newTeam: team });
    broadcastRoster(player.roomId);
  });

  // ── Admin: Power-Ups ──────────────────────────
  socket.on('admin_use_powerup', ({ roomId, type, targetTeam }) => {
    const room = rooms[roomId];
    if (!room) return;

    if (type === 'freeze') {
      const duration = 5000; // 5 seconds freeze
      if (!room.gameState.powerups) room.gameState.powerups = { frozen1: 0, frozen2: 0 };
      room.gameState.powerups['frozen' + targetTeam] = Date.now() + duration;
      io.to(roomId).emit('team_frozen', { team: targetTeam, duration });
    } else if (type === 'add_time') {
      if (room.activeTimer && room.timerRemaining > 0) {
        room.timerDuration += 5; // add 5 seconds
        // Resend state if needed, but display handles client-side mostly
        io.to(roomId).emit('time_added', { team: targetTeam, extra: 5 });
      }
    }
  });

  // ── Admin: Manual Hex Coloring ─────────────────
  socket.on('admin_set_hex_color', ({ roomId, letter, color }) => {
    const room = rooms[roomId];
    if (!room) return;
    // Reset buzz tracker when admin changes hex color
    room.buzzTracker = {};
    if (['team1', 'team2', 'unclaimed'].includes(color)) {
      room.gameState.hexMap[letter] = color;

      // If this letter was the active question, consider it closed
      if (room.gameState.activeQuestion && room.gameState.activeQuestion.letter === letter) {
        clearActiveTimer(room);
        room.gameState.status = 'waiting';
        room.gameState.winner = null;
        room.gameState.stealTarget = null;
        room.gameState.activeQuestion = null;
      }

      io.to(roomId).emit('hex_update', { hexMap: room.gameState.hexMap });
      checkPathfindingWin(room, roomId);
      broadcastAll(roomId);
    }
  });

  // ── Player Settings Updates ──────────────────────

  socket.on('rename_team', ({ team, newName }) => {
    const player = players[socket.id];
    if (!player) return;
    const room = rooms[player.roomId];
    if (!room) return;
    if ((team === 1 || team === 2 || team === '1' || team === '2') && newName) {
      room.gameState.teamNames[team] = sanitizeHTML(newName.trim());
      broadcastRoster(player.roomId);
      broadcastGameState(player.roomId);
    }
  });

  socket.on('change_team_color', ({ team, newColor }) => {
    const player = players[socket.id];
    if (!player) return;
    const room = rooms[player.roomId];
    if (!room) return;

    if (!room.settings) room.settings = {};
    if (team === 1 || team === '1') {
      room.settings.team1Color = newColor;
    } else if (team === 2 || team === '2') {
      room.settings.team2Color = newColor;
    }
    io.to(player.roomId).emit('settings_updated', room.settings);
  });

  socket.on('switch_team', ({ team, playerName }) => {
    const player = players[socket.id];
    if (!player || player.name !== playerName) return;
    const room = rooms[player.roomId];
    if (!room) return;

    const data = room.playerStats[playerName];
    const newTeam = parseInt(team);
    if (!data || data.team === newTeam) return;

    const oldTeam = data.team;
    room.gameState.scores[oldTeam] = Math.max(0, (room.gameState.scores[oldTeam] || 0) - data.score);
    room.gameState.scores[newTeam] = (room.gameState.scores[newTeam] || 0) + data.score;
    data.team = newTeam;

    if (data.socketId) {
      io.to(data.socketId).emit('team_switched', { playerName, newTeam });
    }
    broadcastRoster(player.roomId);
    broadcastGameState(player.roomId);
  });

  // ── Admin Commands ─────────────────────────────

  socket.on('admin_start_question', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;
    clearActiveTimer(room);
    // Reset buzz tracker when admin starts new question
    room.buzzTracker = {};
    room.gameState.status = 'first_buzz';
    room.gameState.winner = null;
    room.gameState.stealTarget = null;
    io.to(roomId).emit('question_started');
    broadcastGameState(roomId);
  });

  socket.on('admin_correct', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;
    const winner = room.gameState.winner;
    if (!winner) return;

    clearActiveTimer(room);
    // Reset buzz tracker when admin gives correct answer
    room.buzzTracker = {};
    if (room.playerStats[winner.name]) {
      const points = (room.settings && room.settings.correctScore) ? parseInt(room.settings.correctScore) : 1;
      room.playerStats[winner.name].score += points;
      room.gameState.scores[winner.team] = (room.gameState.scores[winner.team] || 0) + points;
    }

    if (room.gameState.activeQuestion) {
      const letter = room.gameState.activeQuestion.letter;
      room.gameState.hexMap[letter] = winner.team === 1 ? 'team1' : 'team2';
      room.gameState.activeQuestion = null;
    }

    io.to(roomId).emit('answer_correct', { playerName: winner.name, team: winner.team, emoji: winner.emoji });

    checkPathfindingWin(room, roomId);

    if (room.gameState.status !== 'round_ended') {
      resetToWaiting(roomId);
    } else {
      broadcastGameState(roomId);
    }
  });

  socket.on('admin_wrong', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;
    // Reset buzz tracker when admin gives wrong answer
    room.buzzTracker = {};
    const winner = room.gameState.winner;
    const status = room.gameState.status;

    if (status === 'first_locked' && winner) {
      if (room.settings && room.settings.wrongPenalty) {
        const penalty = parseInt(room.settings.wrongPenalty);
        if (room.playerStats[winner.name]) room.playerStats[winner.name].score -= penalty;
        room.gameState.scores[winner.team] = Math.max(0, (room.gameState.scores[winner.team] || 0) - penalty);
      }
      transitionToSteal(roomId, winner.name);
    } else if (status === 'steal_locked' || status === 'steal') {
      if (winner && room.settings && room.settings.wrongPenalty) {
        const penalty = parseInt(room.settings.wrongPenalty);
        if (room.playerStats[winner.name]) room.playerStats[winner.name].score -= penalty;
        room.gameState.scores[winner.team] = Math.max(0, (room.gameState.scores[winner.team] || 0) - penalty);
      }
      transitionToOpen(roomId, winner ? winner.name : null);
    } else if (status === 'open_locked' && winner) {
      if (room.settings && room.settings.wrongPenalty) {
        const penalty = parseInt(room.settings.wrongPenalty);
        if (room.playerStats[winner.name]) room.playerStats[winner.name].score -= penalty;
        room.gameState.scores[winner.team] = Math.max(0, (room.gameState.scores[winner.team] || 0) - penalty);
      }
      transitionToOpen(roomId, winner.name);
    } else {
      clearActiveTimer(room);
      room.gameState.status = 'waiting';
      room.gameState.winner = null;
      broadcastGameState(roomId);
    }
  });

  socket.on('admin_reset', ({ roomId }) => {
    const room = rooms[roomId];
    if (room) {
      generateNewMap(room, roomId);
    }
    resetToWaiting(roomId);
  });

  socket.on('admin_next_round', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;
    room.gameState.currentRound += 1;
    generateNewMap(room, roomId);
    resetToWaiting(roomId);
  });

  socket.on('admin_toggle_timer', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;

    if (!room.isTimerPaused && room.timerStartedAt && room.timerDuration > 0) {
      // Pause
      if (room.activeTimer) {
        clearTimeout(room.activeTimer);
        room.activeTimer = null;
      }
      const elapsed = (Date.now() - room.timerStartedAt) / 1000;
      room.timerRemaining = Math.max(0, room.timerDuration - elapsed);
      room.isTimerPaused = true;
      io.to(roomId).emit('timer_paused', { remaining: room.timerRemaining });
      broadcastGameState(roomId);
    }
    else if (room.isTimerPaused && room.timerRemaining > 0) {
      // Resume
      room.isTimerPaused = false;
      room.timerDuration = room.timerRemaining;
      room.timerStartedAt = Date.now();
      room.timerRemaining = null;

      io.to(roomId).emit('timer_resumed', { duration: room.timerDuration });
      broadcastGameState(roomId);

      // Re-create the timeout based on current state
      room.activeTimer = setTimeout(() => {
        if (room.gameState.status === 'first_locked') {
          // Time ran out for first answering player -> steal
          transitionToSteal(roomId, room.gameState.winner.name);
        } else if (room.gameState.status === 'steal_locked' || room.gameState.status === 'steal') {
          // Time ran out for steal answering player -> open
          transitionToOpen(roomId, room.gameState.winner ? room.gameState.winner.name : null);
        } else if (room.gameState.status === 'open_locked') {
          // Time ran out for open answering player -> back to open
          transitionToOpen(roomId, room.gameState.winner ? room.gameState.winner.name : null);
        }
      }, room.timerDuration * 1000);
    }
  });

  // Helper function to map single letter to questions.json key
  function getQuestionKey(letter) {
    const letterToKeyMap = {
      'أ': 'حرف_الألف', 'ب': 'حرف_الباء', 'ت': 'حرف_التاء', 'ث': 'حرف_الثاء',
      'ج': 'حرف_الجيم', 'ح': 'حرف_الحاء', 'خ': 'حرف_الخاء', 'د': 'حرف_الدال',
      'ذ': 'حرف_الذال', 'ر': 'حرف_الراء', 'ز': 'حرف_الزاي', 'س': 'حرف_السين',
      'ش': 'حرف_الشين', 'ص': 'حرف_الصاد', 'ض': 'حرف_الضاد', 'ط': 'حرف_الطاء',
      'ظ': 'حرف_الظاء', 'ع': 'حرف_العين', 'غ': 'حرف_الغين', 'ف': 'حرف_الفاء',
      'ق': 'حرف_القاف', 'ك': 'حرف_الكاف', 'ل': 'حرف_اللام', 'م': 'حرف_الميم',
      'ن': 'حرف_النون', 'هـ': 'حرف_الهاء', 'و': 'حرف_الواو', 'ي': 'حرف_الياء'
    };
    return letterToKeyMap[letter] || letter;
  }

  socket.on('admin_peek_hex', ({ roomId, letter }) => {
    const room = rooms[roomId];
    if (!room) return;
    const cat = getQuestionKey(letter);
    const qList = questionsData[cat] || [];
    let qObj = { q: "لا يوجد سؤال متاح", a: "---" };
    if (qList.length > 0) {
      qObj = qList[Math.floor(Math.random() * qList.length)];
    }
    socket.emit('hex_peek_admin', { letter, question: qObj });
  });

  socket.on('admin_request_questions', ({ roomId, letter }) => {
    const room = rooms[roomId];
    if (!room) return;
    const cat = getQuestionKey(letter);
    const qList = questionsData[cat] || [];
    socket.emit('admin_receive_questions', { letter, questions: qList });
  });

  socket.on('admin_select_custom_question', ({ roomId, letter, question }) => {
    const room = rooms[roomId];
    if (!room) return;

    // Reset buzz tracker when admin selects new question
    room.buzzTracker = {};
    room.gameState.hexMap[letter] = 'active';
    room.gameState.activeQuestion = { letter, q: question.q, a: question.a };

    // Auto-start buzzer
    clearActiveTimer(room);
    room.gameState.status = 'first_buzz';
    room.gameState.winner = null;
    room.gameState.stealTarget = null;

    socket.emit('hex_selected_admin', { letter, question });
    io.to(roomId).emit('hex_selected', { letter });
    io.to(roomId).emit('question_started');
    broadcastGameState(roomId);
  });

  socket.on('admin_select_hex', ({ roomId, letter }) => {
    const room = rooms[roomId];
    if (!room) return;
    // Reset buzz tracker when admin selects new hex/letter
    room.buzzTracker = {};
    const cat = getQuestionKey(letter);
    const qList = questionsData[cat] || [];
    let qObj = { q: "لا يوجد سؤال متاح", a: "---" };
    if (qList.length > 0) {
      qObj = qList[Math.floor(Math.random() * qList.length)];
    }
    room.gameState.hexMap[letter] = 'active';
    room.gameState.activeQuestion = { letter, q: qObj.question || qObj.q, a: qObj.answer || qObj.a };

    // Auto-start buzzer
    clearActiveTimer(room);
    room.gameState.status = 'first_buzz';
    room.gameState.winner = null;
    room.gameState.stealTarget = null;

    socket.emit('hex_selected_admin', { letter, question: { q: qObj.question || qObj.q, a: qObj.answer || qObj.a } });
    io.to(roomId).emit('hex_selected', { letter });
    io.to(roomId).emit('question_started');
    broadcastGameState(roomId);
  });

  socket.on('admin_hex_undo', ({ roomId, letter }) => {
    const room = rooms[roomId];
    if (!room) return;
    const currentState = room.gameState.hexMap[letter];
    if (currentState === 'team1') {
      room.gameState.scores[1] = Math.max(0, (room.gameState.scores[1] || 0) - 1);
    } else if (currentState === 'team2') {
      room.gameState.scores[2] = Math.max(0, (room.gameState.scores[2] || 0) - 1);
    }
    room.gameState.hexMap[letter] = 'unclaimed';
    if (room.gameState.activeQuestion && room.gameState.activeQuestion.letter === letter) {
      room.gameState.activeQuestion = null;
    }
    io.to(roomId).emit('hex_update', { hexMap: room.gameState.hexMap });
    broadcastAll(roomId);
  });

  socket.on('admin_rename_team', ({ roomId, team, name }) => {
    const room = rooms[roomId];
    if (!room) return;
    if ((team === 1 || team === 2) && name) {
      room.gameState.teamNames[team] = sanitizeHTML(name.trim());
      broadcastRoster(roomId);
      broadcastGameState(roomId);
    }
  });

  socket.on('admin_adjust_score', ({ roomId, playerName, delta }) => {
    const room = rooms[roomId];
    if (!room || !room.playerStats[playerName]) return;
    room.playerStats[playerName].score = Math.max(0, room.playerStats[playerName].score + delta);
    const team = room.playerStats[playerName].team;
    room.gameState.scores[team] = Math.max(0, (room.gameState.scores[team] || 0) + delta);
    broadcastRoster(roomId);
  });

  socket.on('admin_kick', ({ roomId, playerName }) => {
    const room = rooms[roomId];
    if (!room) return;
    const data = room.playerStats[playerName];
    if (!data) return;

    const kickedSocketId = data.socketId;
    delete room.playerStats[playerName];

    for (const [sid, pObj] of Object.entries(players)) {
      if (pObj.name === playerName && pObj.roomId === roomId) delete players[sid];
    }

    if (kickedSocketId) io.to(kickedSocketId).emit('kicked');
    // Clean up buzz tracker
    delete room.buzzTracker[playerName];
    broadcastRoster(roomId);
  });

  socket.on('admin_change_team', ({ roomId, playerName, newTeam }) => {
    const room = rooms[roomId];
    if (!room) return;
    const data = room.playerStats[playerName];
    if (!data || data.team === newTeam) return;

    const oldTeam = data.team;
    room.gameState.scores[oldTeam] = Math.max(0, (room.gameState.scores[oldTeam] || 0) - data.score);
    room.gameState.scores[newTeam] = (room.gameState.scores[newTeam] || 0) + data.score;
    data.team = newTeam;

    if (data.socketId) {
      io.to(data.socketId).emit('team_changed', { newTeam, teamName: room.gameState.teamNames[newTeam] });
    }
    broadcastRoster(roomId);
    broadcastGameState(roomId);
  });

  socket.on('admin_end_game', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;
    clearActiveTimer(room);
    const mvp = getMvp(room);
    let winnerTeam = null;
    if (room.gameState.scores[1] > room.gameState.scores[2]) winnerTeam = 1;
    else if (room.gameState.scores[2] > room.gameState.scores[1]) winnerTeam = 2;

    io.to(roomId).emit('game_over', {
      winnerTeam,
      teamNames: room.gameState.teamNames,
      scores: room.gameState.scores,
      mvp,
    });

    room.gameState.status = 'game_over';
    room.gameState.winner = null;
  });

  socket.on('admin_destroy', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;
    clearActiveTimer(room);

    // Clear out players looking at this room
    for (const [sid, p] of Object.entries(players)) {
      if (p.roomId === roomId) delete players[sid];
    }

    delete rooms[roomId];
    io.to(roomId).emit('destroy_game');
  });

  // ── Admin: Toggle Bell ─────────────────────────
  socket.on('admin_toggle_bell', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;
    room.gameState.bellDisabled = !room.gameState.bellDisabled;
    io.to(roomId).emit('bell_state', { disabled: room.gameState.bellDisabled });
    broadcastGameState(roomId);
  });

  // ── Admin: Ban Player ────────────────────────────
  socket.on('admin_ban', ({ roomId, playerName }) => {
    const room = rooms[roomId];
    if (!room) return;
    const data = room.playerStats[playerName];
    if (!data) return;

    // Get the player's IP and ban it
    const bannedSocketId = data.socketId;
    if (bannedSocketId) {
      const bannedSocket = io.sockets.sockets.get(bannedSocketId);
      if (bannedSocket) {
        const bannedIP = bannedSocket.handshake.address;
        room.bannedIPs.add(bannedIP);
      }
    }

    // Kick the player
    delete room.playerStats[playerName];
    delete room.buzzTracker[playerName];

    for (const [sid, pObj] of Object.entries(players)) {
      if (pObj.name === playerName && pObj.roomId === roomId) delete players[sid];
    }

    if (bannedSocketId) io.to(bannedSocketId).emit('banned');
    broadcastRoster(roomId);
  });

  socket.on('admin_reload_questions', ({ roomId }) => {
    const success = loadQuestions();
    socket.emit('questions_reloaded', { success });
  });

  // ── Admin: Update Settings ────────────────────
  socket.on('update_settings', ({ roomId, settings }) => {
    if (!roomId) roomId = 'public';
    const room = rooms[roomId];
    if (!room) return;

    // Merge new settings gracefully
    room.settings = { ...room.settings, ...settings };

    // Broadcast setting changes safely back to frontend clients
    io.to(roomId).emit('settings_updated', room.settings);
  });

  // ── Disconnect ────────────────────────────────
  socket.on('disconnect', () => {
    const player = players[socket.id];
    if (player) {
      const room = rooms[player.roomId];
      if (room && room.playerStats[player.name]) {
        room.playerStats[player.name].connected = false;
        broadcastRoster(player.roomId);
      }
      delete players[socket.id];
    }
    console.log('Client disconnected:', socket.id);
  });
});

// ──────────────────────────────────────────────
// Start Server + Ngrok
// ──────────────────────────────────────────────
const { exec } = require('child_process');

server.listen(PORT, async () => {
  console.log(`Server running on http://localhost:${PORT}`);

  let launchUrl = `http://localhost:${PORT}/home.html`;

  // For cloud hosting (Render, Railway, Heroku, etc.), the environment provides the domain.
  // We can just set globalNgrokUrl to the root or allow clients to connect via relative paths.
  // Clients connecting to a cloud host shouldn't need a hardcoded URL from the server.
  globalNgrokUrl = process.env.PUBLIC_URL || `http://localhost:${PORT}`;

  if (process.env.IS_ELECTRON) {
    console.log(`Electron environment detected. Skipping browser auto-open.`);
  } else if (process.env.RENDER || process.env.RAILWAY || process.env.HEROKU || process.env.PORT) {
    // Cloud hosting detected — do NOT open a browser (there's no display)
    console.log(`Cloud environment detected. Skipping browser auto-open.`);
  } else {
    // Local development — open the browser automatically
    console.log(`Opening browser at: ${launchUrl}`);
    const startCmd = process.platform === 'win32' ? 'start' : (process.platform === 'darwin' ? 'open' : 'xdg-open');
    exec(`${startCmd} ${launchUrl}`, (err) => {
      if (err) console.error('Failed to open browser:', err);
    });
  }
});
