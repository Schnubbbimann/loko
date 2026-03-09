const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const path = require("path");
const roomManager = require("./roomManager");

const app = express();
app.use(cors());

// serve react build
app.use(express.static(path.join(__dirname, "../client/dist")));
app.get("*", (req,res) => {
  res.sendFile(path.join(__dirname, "../client/dist/index.html"));
});

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

io.on("connection", socket => {
  console.log("conn", socket.id);

  socket.on("createRoom", ({roomId, name}, cb) => {
    if (!roomId) return cb && cb({ ok:false, error:"no roomId" });
    roomManager.createRoom(roomId);
    roomManager.joinRoom(roomId, socket.id, name || "Spieler");
    socket.join(roomId);
    const room = roomManager.getRoom(roomId);
    io.to(roomId).emit("roomUpdate", { players: room.players.length, names: room.names });
    cb && cb({ ok:true });
  });

  socket.on("joinRoom", ({roomId, name}, cb) => {
    const room = roomManager.getRoom(roomId);
    if (!room) return cb && cb({ ok:false, error:"Room not found" });
    roomManager.joinRoom(roomId, socket.id, name || "Spieler");
    socket.join(roomId);
    io.to(roomId).emit("roomUpdate", { players: room.players.length, names: room.names });
    cb && cb({ ok:true });
  });

  socket.on("startGame", (roomId, cb) => {
    console.log("startGame", roomId);
    const room = roomManager.getRoom(roomId);
    if (!room) return cb && cb({ ok:false, error:"Room not found" });
    if (room.players.length < 2) return cb && cb({ ok:false, error:"Need 2 players" });
    const game = roomManager.startGame(roomId);
    broadcastState(roomId);
    io.to(roomId).emit("gameStarted", { players: room.players, names: room.names });
    cb && cb({ ok:true });
  });

  // draw from deck or take from discard. 'from' = 'deck'|'discard'
  socket.on("take", ({roomId, from}, cb) => {
    const room = roomManager.getRoom(roomId);
    const game = room?.game;
    if (!game) return cb && cb({ ok:false });
    if (game.getCurrentPlayer() !== socket.id) return cb && cb({ ok:false, error:"Not your turn" });

    if (from === "deck") {
      const card = game.drawCard();
      // send card only to player via callback
      return cb && cb({ ok:true, card });
    } else if (from === "discard") {
      const top = game.discard.pop();
      return cb && cb({ ok:true, card: top });
    } else return cb && cb({ ok:false });
  });

  // swap: index >=0 swap with that slot (replacing); index === -1 discard drawn
  socket.on("swap", ({roomId, index, drawnCard}, cb) => {
    const room = roomManager.getRoom(roomId);
    const game = room?.game;
    if (!game) return cb && cb({ ok:false });
    if (game.getCurrentPlayer() !== socket.id) return cb && cb({ ok:false, error:"Not your turn" });

    if (index === -1) {
      // discard drawn card
      game.discard.push(drawnCard);
    } else {
      game.replaceCard(socket.id, index, drawnCard);
    }
    // end turn
    game.nextTurn();
    broadcastState(roomId);
    cb && cb({ ok:true });
  });

  // remove pair action: indices array [i1,i2]
  socket.on("removePair", ({roomId, idx1, idx2}, cb) => {
    const room = roomManager.getRoom(roomId);
    const game = room?.game;
    if (!game) return cb && cb({ ok:false });
    if (game.getCurrentPlayer() !== socket.id) return cb && cb({ ok:false, error:"Not your turn" });
    const ok = game.removePair(socket.id, idx1, idx2);
    if (!ok) return cb && cb({ ok:false, error:"Invalid pair" });
    // after removal, turn ends
    game.nextTurn();
    broadcastState(roomId);
    cb && cb({ ok:true });
  });

  socket.on("callCabo", (roomId, cb) => {
    const room = roomManager.getRoom(roomId);
    const game = room?.game;
    if (!game) return cb && cb({ ok:false });
    game.callCabo(socket.id);
    broadcastState(roomId);
    cb && cb({ ok:true });
  });

  socket.on("score", (roomId, cb) => {
    const room = roomManager.getRoom(roomId);
    const game = room?.game;
    if (!game) return cb && cb({ ok:false });
    const result = game.score();
    io.to(roomId).emit("roundResult", result);
    cb && cb({ ok:true });
  });

  socket.on("disconnect", () => {
    // remove from any rooms
    for (const rId of Object.keys(roomManager.rooms)) {
      const r = roomManager.rooms[rId];
      if (r.players.includes(socket.id)) {
        roomManager.leaveRoom(rId, socket.id);
        io.to(rId).emit("roomUpdate", { players: r.players.length, names: r.names });
      }
    }
  });

  // helper
  function broadcastState(roomId) {
    const room = roomManager.getRoom(roomId);
    if (!room || !room.game) return;
    const game = room.game;
    // public info + names
    io.to(roomId).emit("stateUpdate", { ...game.getPublicState(), names: room.names });
    // private hands to each player
    room.players.forEach(pid => {
      io.to(pid).emit("yourHand", game.getPrivateHand(pid));
    });
  }

});

const PORT = process.env.PORT || 3000;
server.listen(PORT, ()=> console.log("server on", PORT));
