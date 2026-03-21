const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const app = express();
app.use(cors());
app.use(express.json());

app.get("/", (_req, res) => {
  res.send("Ayam Al-Taybeen server running");
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

const DEFAULT_TOTAL_ROUNDS = 15;
const DEFAULT_ROUND_SECONDS = 60;
const GUESS_TEAM_SCORE = 2;
const DRAW_TEAM_SCORE = 1;
const SPEED_BONUS_SCORE = 1;
const SPEED_BONUS_SECONDS = 10;
const WRONG_GUESS_PENALTY = 1;

const WORDS_BY_CATEGORY = {
  "حيوانات": [
    "قطة", "كلب", "أسد", "فيل", "زرافة", "حصان", "أرنب", "سمكة", "بطة", "قرد",
    "دب", "خروف", "ماعز", "ذئب", "ثعلب", "سلحفاة", "بطريق", "حمار", "ديك", "نحلة"
  ],
  "مهن": [
    "طبيب", "معلم", "مهندس", "طيار", "شرطي", "خباز", "طباخ", "نجار", "رسام", "مبرمج",
    "محاسب", "ممرض", "سائق", "صحفي", "محامي", "قاضي", "حلاق", "ميكانيكي", "مذيع", "مصور"
  ],
  "أكل": [
    "بيتزا", "برجر", "شاورما", "رز", "سمك", "خبز", "تفاح", "موز", "عنب", "كعكة",
    "قهوة", "شاي", "آيسكريم", "بطاطس", "سلطة", "بيض", "مندي", "كبسة", "فلافل", "حمص"
  ],
  "أماكن": [
    "مدرسة", "مستشفى", "مطار", "حديقة", "مطعم", "بحر", "مكتبة", "سوق", "بيت", "ملعب",
    "جامعة", "مول", "صيدلية", "مسجد", "سينما", "فندق", "شاطئ", "غابة", "جبل", "مزرعة"
  ],
  "أشياء": [
    "كرسي", "طاولة", "هاتف", "ساعة", "مفتاح", "كتاب", "قلم", "حقيبة", "نظارة", "مصباح",
    "باب", "كاميرا", "كرة", "مروحة", "مرآة", "مقص", "ملعقة", "طبق", "قبعة", "سماعة"
  ],
  "رياضة": [
    "كرة قدم", "كرة سلة", "تنس", "سباحة", "جري", "ملاكمة", "هوكي", "بولينج", "جمباز", "يوغا",
    "تايكوندو", "كاراتيه", "غوص", "تسلق", "رماية", "دراجة", "كرة طائرة", "شطرنج", "بلياردو", "جودو"
  ],
  "وسائل نقل": [
    "سيارة", "حافلة", "قطار", "طائرة", "دراجة", "سفينة", "تاكسي", "شاحنة", "مترو", "هليكوبتر",
    "قارب", "دراجة نارية", "سكوتر", "صاروخ", "يخت", "زورق", "باص مدرسة", "سيارة إسعاف", "سيارة شرطة", "سيارة إطفاء"
  ],
  "كرتون": [
    "سبونج بوب", "توم", "جيري", "ميكي", "بوكيمون", "دورا", "بن تن", "ماريو", "شريك", "علاء الدين",
    "بيكاتشو", "موآنا", "إلسا", "سيمبا", "ميني", "باتمان", "سوبرمان", "كونغ فو باندا", "باربي", "ناروتو"
  ],
  "طبيعة": [
    "شمس", "قمر", "نجمة", "شجرة", "وردة", "سحابة", "مطر", "ثلج", "قوس قزح", "بركان",
    "نهر", "بحيرة", "صحراء", "جزيرة", "غابة", "جبل", "بحر", "صخرة", "نخلة", "شلال"
  ],
  "أفلام ومسلسلات": [
    "هاري بوتر", "باتمان", "سبايدرمان", "فروزن", "الأسد الملك", "شريك", "تايتانيك", "جوكر", "موآنا", "سندريلا",
    "ثور", "هالك", "باربي", "شيرلوك", "ون بيس", "ناروتو", "فريندز", "لعبة الحبار", "بيكي بلايندرز", "علاء الدين"
  ]
};

const CATEGORY_META = [
  { name: "حيوانات", icon: "🐾" },
  { name: "مهن", icon: "🧑‍🏭" },
  { name: "أكل", icon: "🍔" },
  { name: "أماكن", icon: "📍" },
  { name: "أشياء", icon: "🪑" },
  { name: "رياضة", icon: "⚽" },
  { name: "وسائل نقل", icon: "🚗" },
  { name: "كرتون", icon: "🦸" },
  { name: "طبيعة", icon: "🌿" },
  { name: "أفلام ومسلسلات", icon: "🎬" }
];

const CATEGORY_NAMES = CATEGORY_META.map((item) => item.name);
const rooms = new Map();

function createRoomCode() {
  return Math.random().toString(36).slice(2, 7).toUpperCase();
}

function buildTeams(teamCount) {
  return Array.from({ length: teamCount }, (_, index) => ({
    id: "team-" + (index + 1),
    name: "الفريق " + (index + 1),
    score: 0
  }));
}

function getPlayerById(room, playerId) {
  return room.players.find((player) => player.id === playerId) || null;
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
    .replace(/\s+/g, " ");
}

function publicPlayers(players) {
  return players.map((player) => ({
    id: player.id,
    name: player.name,
    teamId: player.teamId,
    isHost: player.isHost,
    streak: player.streak || 0
  }));
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
    chooserTeamId: room.chooserTeamId || null,
    players: publicPlayers(room.players),
    teams: room.teams
  });
}

function chooseNextTeam(room) {
  const teamIndex = (room.currentRound - 1) % room.teams.length;
  return room.teams[teamIndex];
}

function finishGame(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;

  room.status = "finished";
  room.roundEndsAt = null;
  room.chooserTeamId = null;

  if (room.roundTimer) {
    clearTimeout(room.roundTimer);
    room.roundTimer = null;
  }

  const winner = room.teams.slice().sort((a, b) => b.score - a.score)[0] || null;

  io.to(roomCode).emit("game:finished", {
    winner,
    teams: room.teams
  });

  emitRoomState(roomCode);
}

function prepareNextRound(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;

  if (room.roundTimer) {
    clearTimeout(room.roundTimer);
    room.roundTimer = null;
  }

  if (room.currentRound >= room.totalRounds) {
    finishGame(roomCode);
    return;
  }

  room.currentRound += 1;

  const activeTeam = chooseNextTeam(room);

  room.activeTeamId = activeTeam.id;
  room.activeDrawerId = null;
  room.activeCategory = null;
  room.activeWord = null;
  room.roundEndsAt = null;
  room.roundStartedAt = null;
  room.lastGuess = null;
  room.roundResolved = false;
  room.chooserTeamId = activeTeam.id;
  room.status = "choosing-drawer";

  io.to(roomCode).emit("game:chooseDrawer", {
    roundNumber: room.currentRound,
    activeTeamName: activeTeam.name,
    activeTeamId: activeTeam.id
  });

  emitRoomState(roomCode);
}

function startRoundAfterWheel(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;
  if (!room.activeDrawerId || !room.activeCategory || !room.activeWord) return;

  room.status = "playing";
  room.roundEndsAt = Date.now() + room.roundSeconds * 1000;
  room.roundStartedAt = Date.now();
  room.lastGuess = null;
  room.roundResolved = false;

  io.to(roomCode).emit("draw:clear");

  const activeTeam = room.teams.find((team) => team.id === room.activeTeamId);
  const drawer = getPlayerById(room, room.activeDrawerId);

  io.to(roomCode).emit("game:roundStarted", {
    roomState: {
      currentRound: room.currentRound,
      totalRounds: room.totalRounds,
      activeDrawerId: room.activeDrawerId,
      roundEndsAt: room.roundEndsAt
    },
    activeTeamName: activeTeam ? activeTeam.name : "-",
    drawerName: drawer ? drawer.name : "-",
    category: room.activeCategory
  });

  if (drawer) {
    io.to(drawer.id).emit("game:wordForDrawer", {
      category: room.activeCategory,
      word: room.activeWord
    });
  }

  emitRoomState(roomCode);

  room.roundTimer = setTimeout(() => {
    handleRoundTimeout(roomCode);
  }, room.roundSeconds * 1000);
}

function handleRoundTimeout(roomCode) {
  const room = rooms.get(roomCode);
  if (!room || room.status !== "playing") return;

  io.to(roomCode).emit("round:ended", {
    reason: "timeout",
    word: room.activeWord
  });

  io.to(roomCode).emit("system:message", {
    text: "انتهى الوقت. الكلمة كانت: " + room.activeWord
  });

  emitRoomState(roomCode);

  setTimeout(() => {
    prepareNextRound(roomCode);
  }, 1800);
}

function applyCorrectGuess(roomCode, player, answerText) {
  const room = rooms.get(roomCode);
  if (!room || room.status !== "playing" || !player) return;
  if (player.id === room.activeDrawerId) return;
  if (player.teamId === room.activeTeamId) return;
  if (room.roundResolved) return;

  room.roundResolved = true;

  const guessTeam = room.teams.find((team) => team.id === player.teamId);
  const drawTeam = room.teams.find((team) => team.id === room.activeTeamId);

  let bonusText = "";
  const elapsedMs = Date.now() - room.roundStartedAt;
  const speedBonusApplied = elapsedMs <= SPEED_BONUS_SECONDS * 1000;

  if (guessTeam) {
    guessTeam.score += GUESS_TEAM_SCORE;
    if (speedBonusApplied) {
      guessTeam.score += SPEED_BONUS_SCORE;
      bonusText = " + سرعة";
    }
  }

  if (drawTeam) {
    drawTeam.score += DRAW_TEAM_SCORE;
  }

  room.players.forEach((item) => {
    if (item.id === player.id) {
      item.streak = (item.streak || 0) + 1;
    } else if (item.teamId !== room.activeTeamId) {
      item.streak = 0;
    }
  });

  io.to(roomCode).emit("chat:correct", {
    playerName: player.name,
    answer: answerText || room.activeWord,
    guessingTeam: guessTeam ? guessTeam.name : "-",
    bonusText
  });

  io.to(roomCode).emit("system:message", {
    text: player.name + " جاوب صح"
  });

  if (speedBonusApplied) {
    io.to(roomCode).emit("system:message", {
      text: "⚡ Speed Bonus +1"
    });
  }

  if ((player.streak || 0) >= 3) {
    io.to(roomCode).emit("streak:show", {
      playerName: player.name,
      streak: player.streak
    });
  }

  emitRoomState(roomCode);

  if (room.roundTimer) {
    clearTimeout(room.roundTimer);
    room.roundTimer = null;
  }

  setTimeout(() => {
    prepareNextRound(roomCode);
  }, 1800);
}

io.on("connection", (socket) => {
  socket.on("room:create", (payload) => {
    const name = payload && payload.name ? payload.name : "هوست";
    const maxPlayers = Math.max(2, Math.min(12, Number(payload.maxPlayers) || 6));
    const teamCount = Math.max(2, Math.min(4, Number(payload.teamCount) || 2));
    const roundSeconds = Math.max(30, Math.min(120, Number(payload.roundSeconds) || DEFAULT_ROUND_SECONDS));
    const roomCode = createRoomCode();

    const room = {
      code: roomCode,
      hostId: socket.id,
      status: "lobby",
      maxPlayers,
      teamCount,
      roundSeconds,
      totalRounds: DEFAULT_TOTAL_ROUNDS,
      currentRound: 0,
      activeTeamId: null,
      activeDrawerId: null,
      activeCategory: null,
      activeWord: null,
      roundEndsAt: null,
      roundStartedAt: null,
      roundTimer: null,
      roundResolved: false,
      chooserTeamId: null,
      lastGuess: null,
      teams: buildTeams(teamCount),
      players: [
        {
          id: socket.id,
          name,
          teamId: "team-1",
          isHost: true,
          streak: 0
        }
      ]
    };

    rooms.set(roomCode, room);
    socket.join(roomCode);

    socket.emit("room:created", { roomCode });
    emitRoomState(roomCode);
  });

  socket.on("room:join", (payload) => {
    const roomCode = payload && payload.roomCode ? payload.roomCode : "";
    const name = payload && payload.name ? payload.name : "لاعب";
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
      name,
      teamId: room.teams[teamIndex].id,
      isHost: false,
      streak: 0
    });

    socket.join(roomCode);

    io.to(roomCode).emit("system:message", {
      text: name + " دخل الغرفة"
    });

    emitRoomState(roomCode);
  });

  socket.on("host:assign-team", (payload) => {
    const room = rooms.get(payload.roomCode);
    if (!room) return;
    if (room.hostId !== socket.id) return;
    if (room.status !== "lobby") return;

    const player = room.players.find((item) => item.id === payload.playerId);
    const team = room.teams.find((item) => item.id === payload.teamId);
    if (!player || !team) return;

    player.teamId = team.id;
    emitRoomState(room.code);
  });

  socket.on("room:start", (payload) => {
    const room = rooms.get(payload.roomCode);
    if (!room) return;
    if (room.hostId !== socket.id) return;
    if (room.status !== "lobby") return;
    if (room.players.length < 2) {
      socket.emit("room:error", { message: "لازم لاعبين على الأقل" });
      return;
    }

    prepareNextRound(room.code);
  });

  socket.on("drawer:choose", (payload) => {
    const room = rooms.get(payload.roomCode);
    if (!room) return;
    if (room.status !== "choosing-drawer") return;

    const chooser = getPlayerById(room, socket.id);
    if (!chooser) return;

    const canChoose =
      chooser.teamId === room.chooserTeamId ||
      room.hostId === socket.id;

    if (!canChoose) return;

    const drawer = getPlayerById(room, payload.playerId);
    if (!drawer) return;
    if (drawer.teamId !== room.chooserTeamId) return;

    room.activeDrawerId = drawer.id;
    room.status = "spinning";

    const activeTeam = room.teams.find((team) => team.id === room.activeTeamId);

    io.to(room.code).emit("game:prepareRound", {
      roundNumber: room.currentRound,
      roomState: {
        currentRound: room.currentRound,
        totalRounds: room.totalRounds,
        activeDrawerId: room.activeDrawerId
      },
      activeTeamName: activeTeam ? activeTeam.name : "-",
      drawerName: drawer.name
    });

    emitRoomState(room.code);
  });

  socket.on("wheel:spin", (payload) => {
    const room = rooms.get(payload.roomCode);
    if (!room) return;
    if (room.status !== "spinning") return;
    if (room.activeDrawerId !== socket.id) return;

    const category = CATEGORY_NAMES[Math.floor(Math.random() * CATEGORY_NAMES.length)];
    const words = WORDS_BY_CATEGORY[category];
    room.activeCategory = category;
    room.activeWord = words[Math.floor(Math.random() * words.length)];

    io.to(room.code).emit("wheel:result", {
      category: room.activeCategory
    });

    setTimeout(() => {
      startRoundAfterWheel(room.code);
    }, 1500);
  });

  socket.on("draw:move", (payload) => {
    const room = rooms.get(payload.roomCode);
    if (!room) return;
    if (room.status !== "playing") return;
    if (room.activeDrawerId !== socket.id) return;

    socket.to(room.code).emit("draw:move", {
      x1: payload.x1,
      y1: payload.y1,
      x2: payload.x2,
      y2: payload.y2,
      color: payload.color,
      lineWidth: payload.lineWidth
    });
  });

  socket.on("draw:clear", (payload) => {
    const room = rooms.get(payload.roomCode);
    if (!room) return;
    if (room.activeDrawerId !== socket.id) return;
    io.to(room.code).emit("draw:clear");
  });

  socket.on("chat:send", (payload) => {
    const room = rooms.get(payload.roomCode);
    if (!room || room.status !== "playing") return;

    const sender = getPlayerById(room, socket.id);
    if (!sender) return;
    if (sender.id === room.activeDrawerId) return;

    const message = String(payload.text || "").trim();
    if (!message) return;

    room.lastGuess = {
      playerId: sender.id,
      playerName: sender.name,
      text: message
    };

    io.to(room.code).emit("chat:message", {
      playerName: payload.playerName || sender.name,
      text: message
    });

    const normalizedInput = normalizeArabic(message);
    const normalizedWord = normalizeArabic(room.activeWord);

    if (normalizedInput === normalizedWord) {
      applyCorrectGuess(room.code, sender, message);
    }
  });

  socket.on("guess:manual", (payload) => {
    const room = rooms.get(payload.roomCode);
    if (!room || room.status !== "playing") return;

    const canJudge =
      socket.id === room.activeDrawerId ||
      socket.id === room.hostId;

    if (!canJudge) return;
    if (!room.lastGuess) return;

    const player = getPlayerById(room, room.lastGuess.playerId);
    if (!player) return;

    if (payload.isCorrect) {
      applyCorrectGuess(room.code, player, room.lastGuess.text);
    } else {
      const team = room.teams.find((item) => item.id === player.teamId);
      if (team) {
        team.score = Math.max(0, team.score - WRONG_GUESS_PENALTY);
      }

      player.streak = 0;

      io.to(room.code).emit("system:message", {
        text: room.lastGuess.playerName + " إجابته خطأ"
      });

      room.lastGuess = null;
      emitRoomState(room.code);
    }
  });

  socket.on("disconnect", () => {
    for (const [roomCode, room] of rooms.entries()) {
      const leavingPlayer = getPlayerById(room, socket.id);
      if (!leavingPlayer) continue;

      room.players = room.players.filter((player) => player.id !== socket.id);

      if (!room.players.length) {
        if (room.roundTimer) {
          clearTimeout(room.roundTimer);
        }
        rooms.delete(roomCode);
        continue;
      }

      if (room.hostId === socket.id) {
        room.hostId = room.players[0].id;
        room.players[0].isHost = true;
      }

      if (
        room.activeDrawerId === socket.id &&
        (room.status === "choosing-drawer" || room.status === "spinning" || room.status === "playing")
      ) {
        if (room.roundTimer) {
          clearTimeout(room.roundTimer);
          room.roundTimer = null;
        }

        io.to(roomCode).emit("system:message", {
          text: "الرسام خرج من الغرفة، تم تجاوز الجولة"
        });

        prepareNextRound(roomCode);
        continue;
      }

      io.to(roomCode).emit("system:message", {
        text: leavingPlayer.name + " طلع من الغرفة"
      });

      emitRoomState(roomCode);
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log("Ayam Al-Taybeen server listening on port " + PORT);
});
