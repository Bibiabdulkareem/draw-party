const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const app = express();
app.use(cors());
app.use(express.json());

app.get("/", (_req, res) => {
  res.send("Draw Party server is running");
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const WORDS_BY_CATEGORY = {
  "حيوانات": [
    "قطة", "كلب", "أسد", "نمر", "زرافة", "فيل", "حصان", "أرنب", "دلفين", "سمكة",
    "بطة", "دجاجة", "سنجاب", "قرد", "جمل", "حوت", "تمساح", "ثعلب", "بومة", "نحلة"
  ],
  "مهن": [
    "طبيب", "معلم", "مهندس", "طيار", "شرطي", "مصور", "خباز", "طباخ", "نجار", "رسام",
    "مبرمج", "ممرض", "سائق", "صياد", "حارس", "إطفائي", "محاسب", "بائع", "مزارع", "صحفي"
  ],
  "أكل": [
    "بيتزا", "برجر", "شاورما", "تفاح", "موز", "عنب", "آيسكريم", "كعكة", "قهوة", "شاي",
    "رز", "سمك", "خبز", "تمر", "سلطة", "برتقال", "فراولة", "معكرونة", "بيض", "بطاطس"
  ],
  "أماكن": [
    "مدرسة", "مستشفى", "مطار", "حديقة", "مطعم", "بحر", "مكتبة", "سوق", "ملعب", "بيت",
    "مسجد", "سينما", "فندق", "محطة", "متحف", "شاطئ", "غابة", "جبل", "مزرعة", "جامعة"
  ],
  "أشياء": [
    "كرسي", "طاولة", "هاتف", "ساعة", "مفتاح", "كتاب", "قلم", "حقيبة", "شمسية", "نظارة",
    "مصباح", "باب", "كمبيوتر", "كاميرا", "كرة", "مروحة", "وسادة", "مرآة", "مقص", "فرشاة"
  ],
  "رياضة": [
    "كرة قدم", "كرة سلة", "تنس", "سباحة", "ملاكمة", "جري", "دراجة", "غولف", "طائرة", "رفع أثقال",
    "رماية", "تزلج", "تجديف", "كاراتيه", "جمباز", "بولينج", "هوكي", "سكواش", "تايكوندو", "يوغا"
  ],
  "وسائل نقل": [
    "سيارة", "حافلة", "قطار", "طائرة", "دراجة", "سفينة", "تاكسي", "دراجة نارية", "ترام", "غواصة",
    "شاحنة", "هليكوبتر", "قارب", "مترو", "سكوتر", "عربة", "صاروخ", "ونش", "حفار", "لوري"
  ],
  "كرتون": [
    "سبونج بوب", "توم", "جيري", "سونيك", "دورا", "بن تن", "ميكي", "سندباد", "بوكيمون", "شون",
    "غامبول", "بطوط", "بسيط", "فلينستون", "ماشا", "نينجا", "كونان", "ماريو", "أولاف", "سمبلة"
  ]
};

const CATEGORY_NAMES = Object.keys(WORDS_BY_CATEGORY);

const DEFAULT_TOTAL_ROUNDS = 15;
const DEFAULT_ROUND_SECONDS = 60;
const DRAWER_SCORE = 2;
const GUESSER_SCORE = 1;

const rooms = new Map();

function createRoomCode() {
  return Math.random().toString(36).slice(2, 7).toUpperCase();
}

function shuffle(array) {
  return [...array].sort(() => Math.random() - 0.5);
}

function buildTeams(teamCount) {
  return Array.from({ length: teamCount }, (_, index) => ({
    id: `team-${index + 1}`,
    name: `الفريق ${index + 1}`,
    score: 0
  }));
}

function getPlayerById(room, playerId) {
  return room.players.find((player) => player.id === playerId) || null;
}

function emitRoomState(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;

  io.to(roomCode).emit("room:state", {
    code: room.code,
    hostId: room.hostId,
    status: room.status,
    maxPlayers: room.maxPlayers,
    teamCount: room.teamCount,
    roundSeconds: room.roundSeconds,
    totalRounds: room.totalRounds,
    currentRound: room.currentRound,
    activeTeamId: room.activeTeamId,
    activeDrawerId: room.activeDrawerId,
    activeCategory: room.activeCategory,
    roundEndsAt: room.roundEndsAt,
    players: room.players,
    teams: room.teams
  });
}

function chooseNextDrawer(room, teamId) {
  const candidates = room.players.filter((player) => player.teamId === teamId);
  if (!candidates.length) return null;

  const previousDrawerId = room.lastDrawerByTeam[teamId] || null;
  const next = candidates.find((player) => player.id !== previousDrawerId) || candidates[0];
  room.lastDrawerByTeam[teamId] = next.id;
  return next;
}

function startNextRound(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;

  if (room.roundTimer) {
    clearTimeout(room.roundTimer);
    room.roundTimer = null;
  }

  if (room.currentRound >= room.totalRounds) {
    room.status = "finished";

    const sortedTeams = [...room.teams].sort((a, b) => b.score - a.score);
    const winner = sortedTeams[0] || null;

    io.to(roomCode).emit("game:finished", {
      winner,
      teams: room.teams
    });

    emitRoomState(roomCode);
    return;
  }

  room.currentRound += 1;

  const teamIndex = (room.currentRound - 1) % room.teams.length;
  const activeTeam = room.teams[teamIndex];
  const drawer = chooseNextDrawer(room, activeTeam.id);

  if (!drawer) {
    io.to(roomCode).emit("system:message", {
      text: `لا يوجد لاعب في ${activeTeam.name}، تم تجاوز الجولة`
    });
    emitRoomState(roomCode);
    startNextRound(roomCode);
    return;
  }

  const category = CATEGORY_NAMES[Math.floor(Math.random() * CATEGORY_NAMES.length)];
  const wordList = WORDS_BY_CATEGORY[category];
  const word = wordList[Math.floor(Math.random() * wordList.length)];

  room.status = "playing";
  room.activeTeamId = activeTeam.id;
  room.activeDrawerId = drawer.id;
  room.activeCategory = category;
  room.activeWord = word;
  room.correctGuessers = [];
  room.roundEndsAt = Date.now() + room.roundSeconds * 1000;
  room.boardStrokes = [];

  io.to(roomCode).emit("draw:clear");

  io.to(roomCode).emit("game:roundStarted", {
    roomState: {
      currentRound: room.currentRound,
      totalRounds: room.totalRounds,
      activeDrawerId: room.activeDrawerId,
      roundEndsAt: room.roundEndsAt
    },
    activeTeamName: activeTeam.name,
    drawerName: drawer.name,
    category
  });

  io.to(drawer.id).emit("game:wordForDrawer", {
    category,
    word
  });

  io.to(roomCode).emit("system:message", {
    text: `${drawer.name} يرسم للفريق ${activeTeam.name}`
  });

  emitRoomState(roomCode);

  room.roundTimer = setTimeout(() => {
    handleRoundTimeout(roomCode);
  }, room.roundSeconds * 1000);
}

function finishRoundEarlyIfNeeded(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;
  if (room.status !== "playing") return;

  const guessingPlayers = room.players.filter(
    (player) => player.teamId === room.activeTeamId && player.id !== room.activeDrawerId
  );

  if (!guessingPlayers.length) {
    handleRoundTimeout(roomCode);
    return;
  }

  const allGuessed = guessingPlayers.every((player) =>
    room.correctGuessers.includes(player.id)
  );

  if (allGuessed) {
    if (room.roundTimer) {
      clearTimeout(room.roundTimer);
      room.roundTimer = null;
    }

    io.to(roomCode).emit("system:message", {
      text: "كل أعضاء الفريق جاوبوا صح، انتهت الجولة"
    });

    startNextRound(roomCode);
  }
}

function handleRoundTimeout(roomCode) {
  const room = rooms.get(roomCode);
  if (!room || room.status !== "playing") return;

  const activeTeam = room.teams.find((team) => team.id === room.activeTeamId);
  if (activeTeam) {
    activeTeam.score = Math.max(0, activeTeam.score - 1);
  }

  io.to(roomCode).emit("system:message", {
    text: `انتهى الوقت. الكلمة كانت: ${room.activeWord}`
  });

  emitRoomState(roomCode);
  startNextRound(roomCode);
}

function normalizeArabic(text = "") {
  return text
    .trim()
    .toLowerCase()
    .replace(/[.,!؟]/g, "")
    .replace(/أ/g, "ا")
    .replace(/إ/g, "ا")
    .replace(/آ/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/_/g, "")
    .replace(/\s+/g, " ");
}

io.on("connection", (socket) => {
  socket.on("room:create", ({ name, maxPlayers = 4, teamCount = 2, roundSeconds = DEFAULT_ROUND_SECONDS }) => {
    const safeTeamCount = Math.max(2, Math.min(4, Number(teamCount) || 2));
    const safeMaxPlayers = Math.max(2, Math.min(12, Number(maxPlayers) || 4));
    const safeRoundSeconds = Math.max(30, Math.min(120, Number(roundSeconds) || DEFAULT_ROUND_SECONDS));
    const roomCode = createRoomCode();

    const room = {
      code: roomCode,
      hostId: socket.id,
      status: "lobby",
      maxPlayers: safeMaxPlayers,
      teamCount: safeTeamCount,
      roundSeconds: safeRoundSeconds,
      totalRounds: DEFAULT_TOTAL_ROUNDS,
      currentRound: 0,
      activeTeamId: null,
      activeDrawerId: null,
      activeCategory: null,
      activeWord: null,
      roundEndsAt: null,
      roundTimer: null,
      boardStrokes: [],
      correctGuessers: [],
      lastDrawerByTeam: {},
      teams: buildTeams(safeTeamCount),
      players: [
        {
          id: socket.id,
          name: name || "هوست",
          teamId: "team-1",
          isHost: true
        }
      ]
    };

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

    if (room.status !== "lobby") {
      socket.emit("room:error", { message: "اللعبة بدأت بالفعل" });
      return;
    }

    const teamIndex = room.players.length % room.teams.length;
    room.players.push({
      id: socket.id,
      name: name || "لاعب",
      teamId: room.teams[teamIndex].id,
      isHost: false
    });

    socket.join(roomCode);

    io.to(roomCode).emit("system:message", {
      text: `${name || "لاعب"} دخل الغرفة`
    });

    emitRoomState(roomCode);
  });

  socket.on("host:assign-team", ({ roomCode, playerId, teamId }) => {
    const room = rooms.get(roomCode);
    if (!room) return;
    if (room.hostId !== socket.id) return;
    if (room.status !== "lobby") return;

    const player = room.players.find((item) => item.id === playerId);
    const team = room.teams.find((item) => item.id === teamId);
    if (!player || !team) return;

    player.teamId = team.id;
    emitRoomState(roomCode);
  });

  socket.on("room:start", ({ roomCode }) => {
    const room = rooms.get(roomCode);
    if (!room) return;
    if (room.hostId !== socket.id) return;
    if (room.status !== "lobby") return;
    if (room.players.length < 2) {
      socket.emit("room:error", { message: "لازم لاعبين على الأقل" });
      return;
    }

    startNextRound(roomCode);
  });

  socket.on("wheel:spin", ({ roomCode }) => {
    const room = rooms.get(roomCode);
    if (!room) return;
    if (room.status !== "playing") return;
    if (room.activeDrawerId !== socket.id) return;

    const category = room.activeCategory || CATEGORY_NAMES[0];
    io.to(roomCode).emit("wheel:result", category);
  });

  socket.on("draw:move", ({ roomCode, x1, y1, x2, y2, color, lineWidth }) => {
    const room = rooms.get(roomCode);
    if (!room) return;
    if (room.status !== "playing") return;
    if (room.activeDrawerId !== socket.id) return;

    const stroke = { x1, y1, x2, y2, color, lineWidth };
    room.boardStrokes.push(stroke);
    socket.to(roomCode).emit("draw:move", stroke);
  });

  socket.on("draw:clear", ({ roomCode }) => {
    const room = rooms.get(roomCode);
    if (!room) return;
    if (room.activeDrawerId !== socket.id) return;

    room.boardStrokes = [];
    io.to(roomCode).emit("draw:clear");
  });

  socket.on("chat:send", ({ roomCode, playerName, text }) => {
    const room = rooms.get(roomCode);
    if (!room || room.status !== "playing") return;

    const message = String(text || "").trim();
    if (!message) return;

    io.to(roomCode).emit("chat:message", {
      playerName: playerName || "لاعب",
      text: message
    });

    const sender = getPlayerById(room, socket.id);
    if (!sender) return;
    if (sender.id === room.activeDrawerId) return;
    if (sender.teamId !== room.activeTeamId) return;

    const normalizedInput = normalizeArabic(message);
    const normalizedWord = normalizeArabic(room.activeWord);

    if (normalizedInput === normalizedWord && !room.correctGuessers.includes(sender.id)) {
      room.correctGuessers.push(sender.id);

      const activeTeam = room.teams.find((team) => team.id === room.activeTeamId);
      if (activeTeam) activeTeam.score += GUESSER_SCORE;

      const drawer = getPlayerById(room, room.activeDrawerId);
      const drawerTeam = room.teams.find((team) => team.id === room.activeTeamId);

      if (drawerTeam) drawerTeam.score += DRAWER_SCORE;

      io.to(roomCode).emit("chat:correct", {
        playerName: sender.name,
        answer: room.activeWord,
        guessingTeam: activeTeam ? activeTeam.name : "-"
      });

      io.to(roomCode).emit("system:message", {
        text: `${sender.name} جاوب صح`
      });

      emitRoomState(roomCode);
      finishRoundEarlyIfNeeded(roomCode);
    }
  });

  socket.on("disconnect", () => {
    for (const [roomCode, room] of rooms.entries()) {
      const leavingPlayer = getPlayerById(room, socket.id);
      if (!leavingPlayer) continue;

      room.players = room.players.filter((player) => player.id !== socket.id);

      if (!room.players.length) {
        if (room.roundTimer) clearTimeout(room.roundTimer);
        rooms.delete(roomCode);
        continue;
      }

      if (room.hostId === socket.id) {
        room.hostId = room.players[0].id;
        room.players[0].isHost = true;
      }

      if (room.activeDrawerId === socket.id && room.status === "playing") {
        if (room.roundTimer) {
          clearTimeout(room.roundTimer);
          room.roundTimer = null;
        }

        io.to(roomCode).emit("system:message", {
          text: "الرسام خرج من الغرفة، تم تجاوز الجولة"
        });

        startNextRound(roomCode);
        continue;
      }

      io.to(roomCode).emit("system:message", {
        text: `${leavingPlayer.name} طلع من الغرفة`
      });

      emitRoomState(roomCode);
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log("Draw Party server running on port " + PORT);
});
