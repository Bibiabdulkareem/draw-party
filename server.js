const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Draw Party server is running");
});

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

const WORDS_BY_CATEGORY = {
  "حيوانات": [
    "قطة", "كلب", "أسد", "فيل", "زرافة", "أرنب", "حصان", "نمر", "دلفين", "سمكة",
    "سلحفاة", "ذئب", "باندا", "جمل", "قرد"
  ],
  "مهن": [
    "طبيب", "معلم", "مهندس", "شرطي", "طيار", "طباخ", "ممرض", "نجار", "سباك", "رسام",
    "سائق", "مصور", "مزارع", "خباز", "حلاق"
  ],
  "أكل": [
    "بيتزا", "برجر", "تفاح", "كيك", "آيس كريم", "كبسة", "مكرونة", "سلطة", "شوربة", "ساندويتش",
    "بطاط", "رز", "خبز", "دجاج", "سمك"
  ],
  "أماكن": [
    "مدرسة", "مطار", "شاطئ", "مستشفى", "مطعم", "حديقة", "مكتبة", "فندق", "سوق", "ملعب",
    "مسجد", "متحف", "سينما", "منزل", "مخبز"
  ],
  "أشياء": [
    "كرسي", "هاتف", "ساعة", "نظارة", "مظلة", "مفتاح", "حقيبة", "كمبيوتر", "قلم", "كتاب",
    "باب", "مرآة", "مصباح", "مقص", "فرشاة"
  ],
  "رياضة": [
    "كرة قدم", "كرة سلة", "تنس", "سباحة", "ملاكمة", "جري", "ركوب خيل", "تزلج", "كرة طائرة", "رماية",
    "جمباز", "غوص", "كاراتيه", "دراجات", "بولينغ"
  ],
  "وسائل نقل": [
    "سيارة", "طائرة", "قطار", "دراجة", "سفينة", "حافلة", "تاكسي", "ترام", "قارب", "شاحنة"
  ],
  "كرتون": [
    "سبونج بوب", "توم", "جيري", "ميكي", "بطوط", "سندريلا", "سوبرمان", "باتمان", "فروزن", "شريك"
  ]
};

const CATEGORY_META = [
  { name: "حيوانات", icon: "🐾" },
  { name: "مهن", icon: "🧑‍🍳" },
  { name: "أكل", icon: "🍔" },
  { name: "أماكن", icon: "📍" },
  { name: "أشياء", icon: "🪑" },
  { name: "رياضة", icon: "⚽" },
  { name: "وسائل نقل", icon: "🚗" },
  { name: "كرتون", icon: "🎭" }
];

const TOTAL_ROUNDS = 15;
const DEFAULT_ROUND_SECONDS = 60;

const rooms = new Map();

function normalizeArabic(text = "") {
  return text
    .trim()
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ـ/g, "")
    .replace(/[ًٌٍَُِّْ]/g, "")
    .replace(/\s+/g, " ");
}

function createRoomCode() {
  return Math.random().toString(36).slice(2, 7).toUpperCase();
}

function buildTeams(teamCount) {
  return Array.from({ length: teamCount }, (_, i) => ({
    id: `team-${i + 1}`,
    name: `الفريق ${i + 1}`,
    score: 0
  }));
}

function getRoomState(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    status: room.status,
    maxPlayers: room.maxPlayers,
    teamCount: room.teamCount,
    players: room.players,
    teams: room.teams,
    currentRound: room.currentRound,
    totalRounds: TOTAL_ROUNDS,
    activeTeamId: room.activeTeamId,
    activeDrawerId: room.activeDrawerId,
    activeCategory: room.activeCategory,
    roundEndsAt: room.roundEndsAt,
    roundSeconds: room.roundSeconds
  };
}

function emitRoomState(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;
  io.to(roomCode).emit("room:state", getRoomState(room));
}

function pickRandomWord(categoryName) {
  const words = WORDS_BY_CATEGORY[categoryName] || [];
  return words[Math.floor(Math.random() * words.length)];
}

function getTeamById(room, teamId) {
  return room.teams.find((t) => t.id === teamId);
}

function getPlayerById(room, playerId) {
  return room.players.find((p) => p.id === playerId);
}

function getNextTeamId(room) {
  if (!room.activeTeamId) return room.teams[0]?.id || null;
  const currentIndex = room.teams.findIndex((t) => t.id === room.activeTeamId);
  const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % room.teams.length : 0;
  return room.teams[nextIndex]?.id || null;
}

function getNextDrawerId(room, teamId) {
  const teamPlayers = room.players.filter((p) => p.teamId === teamId);
  if (!teamPlayers.length) return null;

  const currentIndex = teamPlayers.findIndex((p) => p.id === room.activeDrawerId);
  const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % teamPlayers.length : 0;
  return teamPlayers[nextIndex].id;
}

function startNextRound(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;

  room.currentRound += 1;

  if (room.currentRound > TOTAL_ROUNDS) {
    room.status = "finished";
    const winner = [...room.teams].sort((a, b) => b.score - a.score)[0] || null;
    io.to(roomCode).emit("game:finished", {
      winner,
      teams: room.teams
    });
    emitRoomState(roomCode);
    return;
  }

  room.status = "spinning";
  room.activeTeamId = getNextTeamId(room);
  room.activeDrawerId = getNextDrawerId(room, room.activeTeamId);
  room.activeCategory = null;
  room.activeWord = null;
  room.roundEndsAt = null;

  io.to(roomCode).emit("draw:clear");
  io.to(roomCode).emit("game:prepareRound", {
    roundNumber: room.currentRound,
    roomState: getRoomState(room),
    activeTeamName: getTeamById(room, room.activeTeamId)?.name || "",
    drawerName: getPlayerById(room, room.activeDrawerId)?.name || ""
  });

  emitRoomState(roomCode);
}

function startDrawingPhase(roomCode, categoryName) {
  const room = rooms.get(roomCode);
  if (!room) return;

  room.status = "playing";
  room.activeCategory = categoryName;
  room.activeWord = pickRandomWord(categoryName);
  room.roundEndsAt = Date.now() + room.roundSeconds * 1000;

  io.to(roomCode).emit("game:roundStarted", {
    roomState: getRoomState(room),
    activeTeamName: getTeamById(room, room.activeTeamId)?.name || "",
    drawerName: getPlayerById(room, room.activeDrawerId)?.name || "",
    category: room.activeCategory
  });

  if (room.activeDrawerId) {
    io.to(room.activeDrawerId).emit("game:wordForDrawer", {
      category: room.activeCategory,
      word: room.activeWord
    });
  }

  emitRoomState(roomCode);
}

function handleCorrectGuess(roomCode, socketId, answerText) {
  const room = rooms.get(roomCode);
  if (!room || room.status !== "playing" || !room.activeWord) return false;

  const player = getPlayerById(room, socketId);
  if (!player) return false;
  if (player.teamId === room.activeTeamId) return false;

  const normalizedGuess = normalizeArabic(answerText);
  const normalizedWord = normalizeArabic(room.activeWord);

  if (normalizedGuess !== normalizedWord) return false;

  const guessingTeam = getTeamById(room, player.teamId);
  const drawingTeam = getTeamById(room, room.activeTeamId);

  if (guessingTeam) guessingTeam.score += 2;
  if (drawingTeam) drawingTeam.score += 1;

  io.to(roomCode).emit("chat:correct", {
    playerName: player.name,
    answer: room.activeWord,
    guessingTeam: guessingTeam?.name || ""
  });

  emitRoomState(roomCode);
  startNextRound(roomCode);
  return true;
}

function handleTimeout(roomCode) {
  const room = rooms.get(roomCode);
  if (!room || room.status !== "playing") return;

  const drawingTeam = getTeamById(room, room.activeTeamId);
  if (drawingTeam) drawingTeam.score -= 1;

  io.to(roomCode).emit("system:message", {
    text: `انتهى الوقت. الكلمة كانت: ${room.activeWord}`
  });

  emitRoomState(roomCode);
  startNextRound(roomCode);
}

io.on("connection", (socket) => {
  socket.on("room:create", ({ name, maxPlayers = 4, teamCount = 2, roundSeconds = DEFAULT_ROUND_SECONDS }) => {
    const roomCode = createRoomCode();

    const room = {
      code: roomCode,
      hostId: socket.id,
      status: "lobby",
      maxPlayers,
      teamCount,
      roundSeconds,
      players: [],
      teams: buildTeams(teamCount),
      currentRound: 0,
      activeTeamId: null,
      activeDrawerId: null,
      activeCategory: null,
      activeWord: null,
      roundEndsAt: null
    };

    room.players.push({
      id: socket.id,
      name: name || "Host",
      teamId: room.teams[0].id,
      isHost: true,
      connected: true
    });

    rooms.set(roomCode, room);
    socket.join(roomCode);

    socket.emit("room:created", { roomCode });
    emitRoomState(roomCode);
  });

  socket.on("room:join", ({ roomCode, name }) => {
    const room = rooms.get(roomCode);
    if (!room) {
      socket.emit("room:error", { message: "الغرفة غير موجودة" });
      return;
    }

    if (room.players.length >= room.maxPlayers) {
      socket.emit("room:error", { message: "الغرفة ممتلئة" });
      return;
    }

    socket.join(roomCode);

    if (!room.players.some((p) => p.id === socket.id)) {
      const teamId = room.teams[room.players.length % room.teams.length]?.id || room.teams[0].id;
      room.players.push({
        id: socket.id,
        name: name || "Player",
        teamId,
        isHost: false,
        connected: true
      });
    }

    io.to(roomCode).emit("system:message", {
      text: `${name || "Player"} دخل الغرفة`
    });

    emitRoomState(roomCode);
  });

  socket.on("team:assign", ({ roomCode, playerId, teamId }) => {
    const room = rooms.get(roomCode);
    if (!room || room.hostId !== socket.id) return;

    const player = getPlayerById(room, playerId);
    if (!player) return;

    player.teamId = teamId;
    emitRoomState(roomCode);
  });

  socket.on("room:start", ({ roomCode }) => {
    const room = rooms.get(roomCode);
    if (!room || room.hostId !== socket.id) return;
    startNextRound(roomCode);
  });

  socket.on("wheel:spin", ({ roomCode }) => {
    const room = rooms.get(roomCode);
    if (!room || room.status !== "spinning") return;
    if (socket.id !== room.activeDrawerId) return;

    const selected = CATEGORY_META[Math.floor(Math.random() * CATEGORY_META.length)];

    io.to(roomCode).emit("wheel:result", selected);

    setTimeout(() => {
      startDrawingPhase(roomCode, selected.name);
    }, 1800);
  });

  socket.on("chat:send", ({ roomCode, playerName, text }) => {
    const room = rooms.get(roomCode);
    if (!room || !text?.trim()) return;

    io.to(roomCode).emit("chat:message", { playerName, text });

    handleCorrectGuess(roomCode, socket.id, text);
  });

  socket.on("guess:manual", ({ roomCode, isCorrect }) => {
    const room = rooms.get(roomCode);
    if (!room || room.status !== "playing") return;
    if (socket.id !== room.activeDrawerId && socket.id !== room.hostId) return;

    if (isCorrect) {
      const drawingTeam = getTeamById(room, room.activeTeamId);
      if (drawingTeam) drawingTeam.score += 1;
      io.to(roomCode).emit("system:message", { text: "تم اعتماد الإجابة كإجابة صحيحة يدويًا" });
    } else {
      io.to(roomCode).emit("system:message", { text: "تم اعتبار الإجابة غير صحيحة" });
    }

    emitRoomState(roomCode);
    startNextRound(roomCode);
  });

  socket.on("game:timeout", ({ roomCode }) => {
    handleTimeout(roomCode);
  });

  socket.on("draw:start", (payload) => {
    socket.to(payload.roomCode).emit("draw:start", payload);
  });

  socket.on("draw:move", (payload) => {
    socket.to(payload.roomCode).emit("draw:move", payload);
  });

  socket.on("draw:end", (payload) => {
    socket.to(payload.roomCode).emit("draw:end", payload);
  });

  socket.on("draw:clear", ({ roomCode }) => {
    io.to(roomCode).emit("draw:clear");
  });
 socket.on("team:set", ({ code, playerId, team }) => {
  const room = rooms.get(code);
  if (!room) return;
  if (room.hostId !== socket.id) return;

  const player = room.players.find((p) => p.id === playerId);
  if (!player) return;

  player.teamId = Number(team);
  emitRoomState(code);
});

socket.on("disconnect", () => {
  for (const [roomCode, room] of rooms.entries()) {
    const leavingPlayer = getPlayerById(room, socket.id);

    room.players = room.players.filter((p) => p.id !== socket.id);

    if (room.players.length === 0) {
      rooms.delete(roomCode);
      continue;
    }

    if (room.hostId === socket.id) {
      room.hostId = room.players[0].id;
      room.players[0].isHost = true;
    }
if (leavingPlayer) {
  io.to(roomCode).emit("system:message", {
    text: `${leavingPlayer.name} طلع من الغرفة`
  });
}
    emitRoomState(roomCode);
  }
});
});
const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log("Draw Party server running on port " + PORT);
});
