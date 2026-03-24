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

const DEFAULT_SETTINGS = {
  totalRounds: 10,
  roundSeconds: 45,
  gameMode: "both"
};

const SCORE = {
  fast: 5,
  slow: 2,
  speedWindowSeconds: 8
};

const SETTING_OPTIONS = {
  totalRounds: [8, 10, 12, 15, 20, 25, 30],
  roundSeconds: [40, 45, 60],
  gameMode: ["write", "choices", "both"]
};

const CATEGORY_TREE = {
  "حيوانات": {
    icon: "🐾",
    subcategories: {
      "برية": ["أسد", "فيل", "زرافة", "ذئب", "ثعلب", "دب", "غزال", "قرد"],
      "أليفة": ["قطة", "كلب", "أرنب", "حصان", "خروف", "ماعز", "هامستر", "سمكة"],
      "بحرية": ["دلفين", "قرش", "حوت", "أخطبوط", "سلطعون", "نجم البحر", "فقمة", "سلحفاة"]
    }
  },
  "أكل": {
    icon: "🍔",
    subcategories: {
      "وجبات": ["بيتزا", "برجر", "شاورما", "مندي", "كبسة", "مكرونة", "سوشي", "فلافل"],
      "حلويات": ["كعكة", "بقلاوة", "آيس كريم", "دونات", "كرواسون", "كوكيز", "كنافة", "تشيزكيك"],
      "مشروبات": ["قهوة", "شاي", "عصير", "حليب", "موهيتو", "ليمونادة", "كاكاو", "لبن"]
    }
  },
  "أماكن": {
    icon: "📍",
    subcategories: {
      "يومية": ["مدرسة", "مستشفى", "مطار", "مطعم", "بيت", "مول", "صيدلية", "مكتبة"],
      "ترفيه": ["سينما", "ملعب", "حديقة", "شاطئ", "منتزه", "متحف", "مدينة ألعاب", "مقهى"],
      "طبيعة": ["غابة", "جبل", "بحر", "صحراء", "جزيرة", "نهر", "شلال", "بحيرة"]
    }
  },
  "أشياء": {
    icon: "🪑",
    subcategories: {
      "منزل": ["كرسي", "طاولة", "مصباح", "مرآة", "مروحة", "وسادة", "باب", "معلقة"],
      "تقنية": ["هاتف", "كاميرا", "حاسوب", "سماعة", "ريموت", "لوحة مفاتيح", "ماوس", "ساعة ذكية"],
      "مدرسة": ["كتاب", "قلم", "حقيبة", "مسطرة", "ممحاة", "دفتر", "مقص", "ألوان"]
    }
  },
  "رياضة": {
    icon: "⚽",
    subcategories: {
      "كرة": ["كرة قدم", "كرة سلة", "كرة طائرة", "تنس", "بولينج", "هوكي", "بلياردو", "جولف"],
      "قتال": ["ملاكمة", "كاراتيه", "جودو", "تايكوندو", "مصارعة", "مبارزة"],
      "فردية": ["سباحة", "جري", "غوص", "رماية", "تسلق", "يوغا", "جمباز", "دراجات"]
    }
  },
  "وسائل نقل": {
    icon: "🚗",
    subcategories: {
      "برية": ["سيارة", "حافلة", "قطار", "تاكسي", "شاحنة", "دراجة", "مترو", "سكوتر"],
      "جوية": ["طائرة", "هليكوبتر", "منطاد", "مروحية", "طائرة ورقية", "صاروخ"],
      "بحرية": ["سفينة", "قارب", "يخت", "زورق", "غواصة", "عبارة"]
    }
  },
"طبيعة": {
    icon: "🌿",
    subcategories: {
      "سماء": ["شمس", "قمر", "نجمة", "سحابة", "مطر", "ثلج", "قوس قزح", "برق"],
      "أرض": ["شجرة", "وردة", "صخرة", "غابة", "جبل", "بركان", "نخلة", "شلال"],
      "مياه": ["بحر", "نهر", "بحيرة", "جزيرة", "موجة", "مرجان", "نافورة", "دلفين"]
    }
  },
  "أعلام": {
    icon: "🏁",
    subcategories: {
      "عربية": ["الكويت", "السعودية", "الإمارات", "قطر", "البحرين", "عمان", "مصر", "المغرب"],
      "آسيا": ["اليابان", "الصين", "كوريا الجنوبية", "الهند", "تايلند", "إندونيسيا"],
      "عالمية": ["فرنسا", "إيطاليا", "ألمانيا", "البرازيل", "الأرجنتين", "أمريكا", "بريطانيا", "كندا"]
    }
  }
};

const CATEGORY_META = Object.entries(CATEGORY_TREE).map(([name, value]) => ({
  name,
  icon: value.icon,
  subcategories: Object.keys(value.subcategories)
}));

const rooms = new Map();

function createRoomCode() {
  let code = "";
  do {
    code = Math.random().toString(36).slice(2, 7).toUpperCase();
  } while (rooms.has(code));
  return code;
}

function buildTeams(teamCount, teamNames = []) {
  return Array.from({ length: teamCount }, (_, index) => ({
    id: `team-${index + 1}`,
    name: String(teamNames[index] || `الفريق ${index + 1}`).trim() || `الفريق ${index + 1}`,
    score: 0
  }));
}

function getPlayerById(room, playerId) {
  return room.players.find((player) => player.id === playerId) || null;
}

function normalizeArabic(text = "") {
  return String(text)
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

function pickFrom(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function makeOutline(word) {
  const parts = String(word).split(" ");
  return parts.map((part) => "_ ".repeat(part.length).trim()).join("   /   ");
}

function buildHint(category, _subcategory, word) {
  const letterCount = String(word).replace(/\s/g, "").length;
  if (category === "أعلام") {
    return `علم دولة - عدد الأحرف: ${letterCount}`;
  }
  return `عدد الأحرف: ${letterCount}`;
}

function sampleChoices(answer) {
  const pool = [];
  Object.values(CATEGORY_TREE).forEach((category) => {
    Object.values(category.subcategories).forEach((items) => {
      pool.push(...items);
    });
  });

  const unique = Array.from(new Set(pool.filter((item) => item !== answer)));
  const distractors = [];
  while (unique.length && distractors.length < 3) {
    const index = Math.floor(Math.random() * unique.length);
    distractors.push(unique.splice(index, 1)[0]);
  }

  const choices = [answer, ...distractors];
  return choices.sort(() => Math.random() - 0.5);
}

function chooseRoundContent() {
  const categoryName = pickFrom(Object.keys(CATEGORY_TREE));
  const category = CATEGORY_TREE[categoryName];
  const subcategoryName = pickFrom(Object.keys(category.subcategories));
  const word = pickFrom(category.subcategories[subcategoryName]);

  return {
    category: categoryName,
    subcategory: subcategoryName,
    word,
    choices: sampleChoices(word),
    outline: makeOutline(word),
    hint: buildHint(categoryName, subcategoryName, word)
  };
}

function buildRoundPayload(room) {
  return {
    currentRound: room.currentRound,
    totalRounds: room.settings.totalRounds,
    activeDrawerId: room.activeDrawerId,
    activeTeamId: room.activeTeamId,
    activeCategory: room.activeCategory,
    activeSubcategory: room.activeSubcategory,
    roundEndsAt: room.roundEndsAt,
    gameMode: room.settings.gameMode
  };
}

function publicPlayers(room) {
  return room.players.map((player) => ({
    id: player.id,
    name: player.name,
    teamId: player.teamId,
    isHost: player.isHost,
    streak: player.streak || 0,
    role:
      player.id === room.activeDrawerId
        ? "drawer"
        : "guesser"
  }));
}

function emitRoomState(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;

  io.to(roomCode).emit("room:state", {
    code: room.code,
    roomName: room.name,
    name: room.name,
    hostId: room.hostId,
    status: room.status,
    maxPlayers: room.maxPlayers,
    teamCount: room.teamCount,
    settings: room.settings,
    roundSeconds: room.settings.roundSeconds,
    totalRounds: room.settings.totalRounds,
    gameMode: room.settings.gameMode,
    currentRound: room.currentRound,
    activeTeamId: room.activeTeamId,
    activeDrawerId: room.activeDrawerId,
    activeCategory: room.activeCategory,
    activeSubcategory: room.activeSubcategory,
    roundEndsAt: room.roundEndsAt,
    chooserTeamId: room.chooserTeamId,
    players: publicPlayers(room),
    teams: room.teams,
    categories: CATEGORY_META
  });
}

function systemMessage(roomCode, text, type = "system") {
  io.to(roomCode).emit("system:message", {
    text,
    type,
    at: Date.now()
  });
}

function chooseNextTeam(room) {
  const teamIndex = (room.currentRound - 1) % room.teams.length;
  return room.teams[teamIndex];
}

function clearRoundTimer(room) {
  if (room.roundTimer) {
    clearTimeout(room.roundTimer);
    room.roundTimer = null;
  }
}

function finishGame(roomCode, reason = "انتهت اللعبة") {
  const room = rooms.get(roomCode);
  if (!room) return;

  room.status = "finished";
  room.roundEndsAt = null;
  room.chooserTeamId = null;
  clearRoundTimer(room);

  const winner = room.teams.slice().sort((a, b) => b.score - a.score)[0] || null;

  io.to(roomCode).emit("game:finished", {
    winner,
    teams: room.teams,
    reason
  });

  systemMessage(roomCode, `🏁 ${reason}`, "finish");
  emitRoomState(roomCode);
}

function prepareNextRound(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;

  clearRoundTimer(room);

  if (room.currentRound >= room.settings.totalRounds) {
    finishGame(roomCode, "اكتملت كل الجولات");
    return;
  }

  room.currentRound += 1;

  const activeTeam = chooseNextTeam(room);

  room.activeTeamId = activeTeam.id;
  room.activeDrawerId = null;
  room.activeCategory = null;
  room.activeSubcategory = null;
  room.activeWord = null;
  room.roundChoices = [];
  room.roundOutline = "";
  room.roundHint = "";
  room.roundEndsAt = null;
  room.roundStartedAt = null;
  room.lastGuess = null;
  room.roundResolved = false;
  room.firstCorrectAt = null;
  room.chooserTeamId = activeTeam.id;
  room.status = "choosing-drawer";

  io.to(roomCode).emit("game:chooseDrawer", {
    roundNumber: room.currentRound,
    activeTeamName: activeTeam.name,
    activeTeamId: activeTeam.id
  });

  systemMessage(roomCode, `🎯 دور ${activeTeam.name} لاختيار الرسام`, "drawer");
  emitRoomState(roomCode);
}

function startRoundAfterWheel(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;
  if (!room.activeDrawerId || !room.activeCategory || !room.activeWord) return;

  room.status = "playing";
  room.roundEndsAt = Date.now() + room.settings.roundSeconds * 1000;
  room.roundStartedAt = Date.now();
  room.lastGuess = null;
  room.roundResolved = false;
  room.firstCorrectAt = null;

  io.to(roomCode).emit("draw:clear");

  const activeTeam = room.teams.find((team) => team.id === room.activeTeamId);
  const drawer = getPlayerById(room, room.activeDrawerId);

  io.to(roomCode).emit("game:roundStarted", {
    roomState: buildRoundPayload(room),
    activeTeamName: activeTeam ? activeTeam.name : "-",
    drawerName: drawer ? drawer.name : "-",
    category: room.activeCategory,
    subcategory: room.activeSubcategory,
    gameMode: room.settings.gameMode
  });

  if (drawer) {
    io.to(drawer.id).emit("game:wordForDrawer", {
      category: room.activeCategory,
      subcategory: room.activeSubcategory,
      word: room.activeWord,
      outline: room.roundOutline,
      hint: room.roundHint,
      choices: room.settings.gameMode === "both" ? room.roundChoices : [],
      gameMode: room.settings.gameMode
    });
  }

  room.players.forEach((player) => {
    if (player.id !== room.activeDrawerId) {
      io.to(player.id).emit("game:wordInfo", {
        outline: room.settings.gameMode === "both" ? room.roundOutline : "",
        hint: "",
        choices: room.settings.gameMode === "both" ? room.roundChoices : [],
        gameMode: room.settings.gameMode
      });
    }
  });

  systemMessage(roomCode, `🎨 بدأت الجولة والجميع يقدر يجاوب`, "round");
  emitRoomState(roomCode);

  room.roundTimer = setTimeout(() => {
    handleRoundTimeout(roomCode);
  }, room.settings.roundSeconds * 1000);
}

function handleRoundTimeout(roomCode) {
  const room = rooms.get(roomCode);
  if (!room || room.status !== "playing") return;

  io.to(roomCode).emit("round:ended", {
    reason: "timeout",
    word: room.activeWord
  });

  systemMessage(roomCode, `⏱️ انتهى الوقت. الكلمة كانت: ${room.activeWord}`, "timeout");
  emitRoomState(roomCode);

  setTimeout(() => {
    prepareNextRound(roomCode);
  }, 1800);
}

function applyWrongGuess(room, player) {
  if (!player) return;
  player.streak = 0;

  io.to(room.code).emit("chat:wrong", {
    playerName: player.name,
    streak: 0
  });

  systemMessage(room.code, `❌ ${player.name} إجابته خطأ`, "wrong");
  emitRoomState(room.code);
}

function applyCorrectGuess(roomCode, player, answerText) {
  const room = rooms.get(roomCode);
  if (!room || room.status !== "playing" || !player) return;
  if (player.id === room.activeDrawerId) return;

  const playerTeam = room.teams.find((team) => team.id === player.teamId);
  if (!playerTeam) return;

  const elapsedMs = Date.now() - room.roundStartedAt;
  const isFast = elapsedMs <= SCORE.speedWindowSeconds * 1000;
  const added = isFast ? SCORE.fast : SCORE.slow;

  room.roundResolved = true;
  room.firstCorrectAt = Date.now();

  player.streak = (player.streak || 0) + 1;
  playerTeam.score += added;

  io.to(roomCode).emit("chat:correct", {
    playerName: player.name,
    answer: answerText || room.activeWord,
    guessingTeam: playerTeam.name,
    scoreAdded: added,
    streak: player.streak,
    isFast
  });

  systemMessage(
    roomCode,
    `✅ ${player.name} جاوب صح أول واحد +${added} (${playerTeam.name})`,
    "correct"
  );

  io.to(roomCode).emit("streak:show", {
    playerName: player.name,
    streak: player.streak
  });

  clearRoundTimer(room);
  emitRoomState(roomCode);

  setTimeout(() => {
    prepareNextRound(roomCode);
  }, 1800);
}

function sanitizeSettings(payload = {}) {
  const totalRounds = SETTING_OPTIONS.totalRounds.includes(Number(payload.totalRounds))
    ? Number(payload.totalRounds)
    : DEFAULT_SETTINGS.totalRounds;

  const roundSeconds = SETTING_OPTIONS.roundSeconds.includes(Number(payload.roundSeconds))
    ? Number(payload.roundSeconds)
    : DEFAULT_SETTINGS.roundSeconds;

  const gameMode = SETTING_OPTIONS.gameMode.includes(payload.gameMode)
    ? payload.gameMode
    : DEFAULT_SETTINGS.gameMode;

  return { totalRounds, roundSeconds, gameMode };
}

function roomPreview(room) {
  return {
    code: room.code,
    roomName: room.name,
    status: room.status,
    maxPlayers: room.maxPlayers,
    teamCount: room.teamCount,
    settings: room.settings,
    teams: room.teams.map((team) => ({
      id: team.id,
      name: team.name,
      playersCount: room.players.filter((p) => p.teamId === team.id).length
    }))
  };
}

io.on("connection", (socket) => { 
    socket.on("room:rejoin", (payload = {}) => {
    const roomCode = String(payload.roomCode || "").trim().toUpperCase();
    const name = String(payload.name || "").trim();

    const room = rooms.get(roomCode);
    if (!room || !name) return;

    const existingPlayer = room.players.find((player) => player.name === name);
    if (!existingPlayer) return;

    existingPlayer.id = socket.id;
    socket.join(roomCode);

    systemMessage(roomCode, `🔄 ${name} رجع للغرفة`, "rejoin");
    emitRoomState(roomCode);
  }); 
  
  socket.on("room:preview", (payload = {}) => {
    const roomCode = String(payload.roomCode || "").trim().toUpperCase();
    const room = rooms.get(roomCode);

    if (!room) {
      socket.emit("room:error", { message: "الغرفة غير موجودة" });
      return;
    }

    socket.emit("room:preview:result", roomPreview(room));
  });

  socket.on("room:create", (payload = {}) => {
    const name = String(payload.name || "هوست").trim().slice(0, 24) || "هوست";
    const roomName = String(payload.roomName || "غرفة أيام الطيبين").trim().slice(0, 32) || "غرفة أيام الطيبين";
    const maxPlayers = Math.max(2, Math.min(12, Number(payload.maxPlayers) || 6));
    const teamCount = Math.max(2, Math.min(4, Number(payload.teamCount) || 2));
    const settings = sanitizeSettings(payload.settings || payload);
    const teamNames = Array.isArray(payload.teamNames) ? payload.teamNames.slice(0, teamCount) : [];
    const roomCode = createRoomCode();

    const room = {
      code: roomCode,
      name: roomName,
      hostId: socket.id,
      status: "lobby",
      maxPlayers,
      teamCount,
      settings,
      currentRound: 0,
      activeTeamId: null,
      activeDrawerId: null,
      activeCategory: null,
      activeSubcategory: null,
      activeWord: null,
      roundChoices: [],
      roundOutline: "",
      roundHint: "",
      roundEndsAt: null,
      roundStartedAt: null,
      roundTimer: null,
      roundResolved: false,
      firstCorrectAt: null,
      chooserTeamId: null,
      lastGuess: null,
      teams: buildTeams(teamCount, teamNames),
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
    systemMessage(roomCode, `🚪 تم إنشاء الغرفة ${roomName}`, "room");
    emitRoomState(roomCode);
  });

  socket.on("room:join", (payload = {}) => {
    const roomCode = String(payload.roomCode || "").trim().toUpperCase();
    const name = String(payload.name || "لاعب").trim().slice(0, 24) || "لاعب";
    const preferredTeamId = String(payload.teamId || "");
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

    let chosenTeam = room.teams.find((t) => t.id === preferredTeamId);
    if (!chosenTeam) {
      chosenTeam = room.teams
        .slice()
        .sort((a, b) => {
          const aCount = room.players.filter((p) => p.teamId === a.id).length;
          const bCount = room.players.filter((p) => p.teamId === b.id).length;
          return aCount - bCount;
        })[0];
    }

    room.players.push({
      id: socket.id,
      name,
      teamId: chosenTeam.id,
      isHost: false,
      streak: 0
    });

    socket.join(roomCode);
    systemMessage(roomCode, `👋 ${name} دخل الغرفة إلى ${chosenTeam.name}`, "join");
    emitRoomState(roomCode);
  });

  socket.on("room:leave", (payload = {}) => {
    const roomCode = String(payload.roomCode || "").trim().toUpperCase();
    const room = rooms.get(roomCode);
    if (!room) return;

    const leavingPlayer = getPlayerById(room, socket.id);
    if (!leavingPlayer) return;

    room.players = room.players.filter((player) => player.id !== socket.id);
    socket.leave(roomCode);

    if (!room.players.length) {
      clearRoundTimer(room);
      rooms.delete(roomCode);
      return;
    }

    if (room.hostId === socket.id) {
      room.hostId = room.players[0].id;
      room.players[0].isHost = true;
    }

    systemMessage(roomCode, `🚪 ${leavingPlayer.name} خرج من الغرفة`, "leave");
    emitRoomState(roomCode);
  });

  socket.on("host:update-settings", (payload = {}) => {
    const room = rooms.get(payload.roomCode);
    if (!room || room.hostId !== socket.id || room.status !== "lobby") return;

    room.settings = sanitizeSettings(payload.settings || {});
    room.name = String(payload.roomName || room.name).trim().slice(0, 32) || room.name;

    if (Array.isArray(payload.teamNames)) {
      payload.teamNames.slice(0, room.teams.length).forEach((name, index) => {
        room.teams[index].name = String(name || room.teams[index].name).trim() || room.teams[index].name;
      });
    }

    systemMessage(room.code, "⚙️ تم تحديث إعدادات الغرفة", "settings");
    emitRoomState(room.code);
  });

  socket.on("host:assign-team", (payload = {}) => {
    const room = rooms.get(payload.roomCode);
    if (!room || room.hostId !== socket.id || room.status !== "lobby") return;

    const player = room.players.find((item) => item.id === payload.playerId);
    const team = room.teams.find((item) => item.id === payload.teamId);
    if (!player || !team) return;

    player.teamId = team.id;
    emitRoomState(room.code);
  });

  socket.on("room:start", (payload = {}) => {
    const room = rooms.get(payload.roomCode);
    if (!room || room.hostId !== socket.id || room.status !== "lobby") return;

    if (room.players.length < 2) {
      socket.emit("room:error", { message: "لازم لاعبين على الأقل" });
      return;
    }

    systemMessage(room.code, "📜 تم عرض القوانين وبدأت اللعبة", "start");
    prepareNextRound(room.code);
  });

  socket.on("drawer:choose", (payload = {}) => {
    const room = rooms.get(payload.roomCode);
    if (!room || room.status !== "choosing-drawer") return;

    const chooser = getPlayerById(room, socket.id);
    if (!chooser) return;

    const canChoose = chooser.teamId === room.chooserTeamId || room.hostId === socket.id;
    if (!canChoose) return;

    const drawer = getPlayerById(room, payload.playerId);
    if (!drawer || drawer.teamId !== room.chooserTeamId) return;

    room.activeDrawerId = drawer.id;
    room.status = "spinning";

    const activeTeam = room.teams.find((team) => team.id === room.activeTeamId);

    io.to(room.code).emit("game:prepareRound", {
      roundNumber: room.currentRound,
      roomState: buildRoundPayload(room),
      activeTeamName: activeTeam ? activeTeam.name : "-",
      drawerName: drawer.name
    });

    systemMessage(room.code, `🎯 تم اختيار ${drawer.name} كرسام`, "drawer");
    emitRoomState(room.code);
  });

  socket.on("wheel:spin", (payload = {}) => {
    const room = rooms.get(payload.roomCode);
    if (!room || room.status !== "spinning" || room.activeDrawerId !== socket.id) return;

    const result = chooseRoundContent();
    room.activeCategory = result.category;
    room.activeSubcategory = result.subcategory;
    room.activeWord = result.word;
    room.roundChoices = result.choices;
    room.roundOutline = result.outline;
    room.roundHint = result.hint;

    io.to(room.code).emit("wheel:result", {
      category: room.activeCategory,
      subcategory: room.activeSubcategory,
      icon: CATEGORY_TREE[result.category].icon
    });

    systemMessage(room.code, `🎡 توقفت العجلة على ${room.activeCategory} / ${room.activeSubcategory}`, "wheel");

    setTimeout(() => {
      startRoundAfterWheel(room.code);
    }, 2200);
  });

  socket.on("draw:move", (payload = {}) => {
    const room = rooms.get(payload.roomCode);
    if (!room || room.status !== "playing" || room.activeDrawerId !== socket.id) return;

    socket.to(room.code).emit("draw:move", {
      x1: payload.x1,
      y1: payload.y1,
      x2: payload.x2,
      y2: payload.y2,
      color: payload.color,
      lineWidth: payload.lineWidth,
      tool: payload.tool || "pen"
    });
  });

  socket.on("draw:clear", (payload = {}) => {
    const room = rooms.get(payload.roomCode);
    if (!room || room.activeDrawerId !== socket.id) return;
    io.to(room.code).emit("draw:clear");
    systemMessage(room.code, "🧽 تم مسح اللوحة", "draw");
  });

  socket.on("chat:send", (payload = {}) => {
    const room = rooms.get(payload.roomCode);
    if (!room || room.status !== "playing") return;

    const sender = getPlayerById(room, socket.id);
    if (!sender) return;

    const message = String(payload.text || "").trim();
    if (!message) return;

    if (sender.id === room.activeDrawerId) {
      socket.emit("room:error", { message: "الرسام ما يقدر يجاوب" });
      return;
    }

    room.lastGuess = {
      playerId: sender.id,
      playerName: sender.name,
      text: message
    };

    io.to(room.code).emit("chat:message", {
      playerName: sender.name,
      text: message,
      teamId: sender.teamId,
      at: Date.now()
    });

    systemMessage(room.code, `💬 ${sender.name} حاول يجاوب`, "guess");

    const normalizedInput = normalizeArabic(message);
    const normalizedWord = normalizeArabic(room.activeWord);

    if (normalizedInput === normalizedWord) {
      applyCorrectGuess(room.code, sender, message);
    } else {
      applyWrongGuess(room, sender);
    }
  });

  socket.on("guess:choice", (payload = {}) => {
    const room = rooms.get(payload.roomCode);
    if (!room || room.status !== "playing") return;

    const sender = getPlayerById(room, socket.id);
    if (!sender || sender.id === room.activeDrawerId) return;

    const choice = String(payload.choice || "").trim();
    if (!choice) return;

    io.to(room.code).emit("chat:message", {
      playerName: sender.name,
      text: `اختار: ${choice}`,
      teamId: sender.teamId,
      at: Date.now()
    });

    systemMessage(room.code, `🧩 ${sender.name} ضغط اختيار`, "guess");

    if (normalizeArabic(choice) === normalizeArabic(room.activeWord)) {
      applyCorrectGuess(room.code, sender, choice);
    } else {
      applyWrongGuess(room, sender);
    }
  });

  socket.on("guess:manual", (payload = {}) => {
    const room = rooms.get(payload.roomCode);
    if (!room || room.status !== "playing") return;

    const canJudge = socket.id === room.activeDrawerId || socket.id === room.hostId;
    if (!canJudge || !room.lastGuess) return;

    const player = getPlayerById(room, room.lastGuess.playerId);
    if (!player) return;

    if (payload.isCorrect) {
      applyCorrectGuess(room.code, player, room.lastGuess.text);
    } else {
      applyWrongGuess(room, player);
      room.lastGuess = null;
    }
  });

  socket.on("disconnect", () => {
    for (const [roomCode, room] of rooms.entries()) {
      const leavingPlayer = getPlayerById(room, socket.id);
      if (!leavingPlayer) continue;

      setTimeout(() => {
        const freshRoom = rooms.get(roomCode);
        if (!freshRoom) return;

        const stillSamePlayer = freshRoom.players.find((player) => player.id === socket.id);
        if (!stillSamePlayer) return;

        freshRoom.players = freshRoom.players.filter((player) => player.id !== socket.id);

        if (!freshRoom.players.length) {
          clearRoundTimer(freshRoom);
          rooms.delete(roomCode);
          return;
        }

        if (freshRoom.hostId === socket.id) {
          freshRoom.hostId = freshRoom.players[0].id;
          freshRoom.players[0].isHost = true;
        }

        if (freshRoom.activeDrawerId === socket.id && ["choosing-drawer", "spinning", "playing"].includes(freshRoom.status)) {
          clearRoundTimer(freshRoom);
          systemMessage(roomCode, "🚨 الرسام خرج من الغرفة وتم تجاوز الجولة", "leave");
          prepareNextRound(roomCode);
          return;
        }

        systemMessage(roomCode, `🚪 ${leavingPlayer.name} طلع من الغرفة`, "leave");
        emitRoomState(roomCode);
      }, 3000);
    }
  });
