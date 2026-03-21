const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

let rooms = {};

const categories = {
  "أعلام": ["الكويت","السعودية","الإمارات","قطر","مصر","فرنسا"],
  "رياضة": ["كرة قدم","تنس","سباحة","جري"],
  "حيوانات": ["قطة","أسد","فيل","حصان"],
  "مهن": ["طبيب","معلم","طيار","شرطي"],
  "مسلسلات": ["طاش ما طاش","باب الحارة","Friends"]
};

function normalize(text){
  return text.trim().toLowerCase();
}

function random(arr){
  return arr[Math.floor(Math.random()*arr.length)];
}

function generateChoices(word, category){
  const list = categories[category];
  let choices = [word];

  while(choices.length < 4){
    let w = random(list);
    if(!choices.includes(w)) choices.push(w);
  }

  return choices.sort(()=>Math.random()-0.5);
}

io.on("connection",(socket)=>{

  socket.on("createRoom",({name,roomName})=>{
    const code = Math.random().toString(36).substr(2,5).toUpperCase();

    rooms[code]={
      code,
      roomName,
      players:[{id:socket.id,name,score:0,streak:0}],
      host:socket.id,
      drawer:null,
      word:"",
      category:"",
      startTime:0
    };

    socket.join(code);
    socket.emit("roomCreated",{code});
  });

  socket.on("joinRoom",({code,name})=>{
    const room = rooms[code];
    if(!room) return;

    room.players.push({id:socket.id,name,score:0,streak:0});
    socket.join(code);

    io.to(code).emit("players",room.players);
  });

  socket.on("startRound",(code)=>{
    const room = rooms[code];

    const cat = random(Object.keys(categories));
    const word = random(categories[cat]);

    room.category = cat;
    room.word = word;
    room.drawer = random(room.players).id;
    room.startTime = Date.now();

    const choices = generateChoices(word,cat);

    io.to(code).emit("roundStart",{
      category:cat,
      choices
    });

    io.to(room.drawer).emit("yourTurn",word);
  });

  socket.on("guess",({code,text})=>{
    const room = rooms[code];
    const player = room.players.find(p=>p.id===socket.id);

    if(normalize(text) === normalize(room.word)){
      let points = 10;

      if(Date.now()-room.startTime < 10000){
        points += 5;
      }

      player.streak++;
      if(player.streak >=3){
        points +=5;
      }

      player.score += points;

      io.to(code).emit("correct",{
        name:player.name,
        points,
        scores:room.players
      });

    }else{
      player.streak = 0;
    }
  });

  socket.on("leaveRoom",(code)=>{
    socket.leave(code);
  });

});

server.listen(3001,()=>console.log("Server running"));
