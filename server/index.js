const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const path = require("path");
const roomManager = require("./roomManager");

const app = express();
app.use(cors());

// React Build ausliefern
app.use(express.static(path.join(__dirname, "../client/dist")));
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../client/dist/index.html"));
});

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

io.on("connection", (socket) => {
  console.log("Verbunden:", socket.id);

  /* ==========================
     RAUM ERSTELLEN
  ========================== */
  socket.on("createRoom", ({ roomId, name }, cb) => {
    if (!roomId) return cb && cb({ ok: false });

    roomManager.createRoom(roomId);
    roomManager.joinRoom(roomId, socket.id, name || "Spieler");
    socket.join(roomId);

    const room = roomManager.getRoom(roomId);

    io.to(roomId).emit("roomUpdate", {
      players: room.players.length,
      names: room.names,
    });

    cb && cb({ ok: true });
  });

  /* ==========================
     RAUM BEITRETEN
  ========================== */
  socket.on("joinRoom", ({ roomId, name }, cb) => {
    const room = roomManager.getRoom(roomId);
    if (!room) return cb && cb({ ok: false });

    roomManager.joinRoom(roomId, socket.id, name || "Spieler");
    socket.join(roomId);

    io.to(roomId).emit("roomUpdate", {
      players: room.players.length,
      names: room.names,
    });

    cb && cb({ ok: true });
  });

  /* ==========================
     ROOM INFO (FIX!)
  ========================== */
  socket.on("roomInfo", (roomId, cb) => {
    const room = roomManager.getRoom(roomId);
    if (!room) return cb && cb({ ok: false });

    cb &&
      cb({
        ok: true,
        players: room.players.length,
        names: room.names,
      });
  });

  /* ==========================
     SPIEL STARTEN
  ========================== */
  socket.on("startGame", (roomId, cb) => {
    const room = roomManager.getRoom(roomId);
    if (!room) return cb && cb({ ok: false });

    if (room.players.length < 2)
      return cb && cb({ ok: false, error: "Warte auf zweiten Spieler" });

    roomManager.startGame(roomId);

    broadcastState(roomId);

    io.to(roomId).emit("gameStarted");

    cb && cb({ ok: true });
  });

  /* ==========================
     KARTE NEHMEN
  ========================== */
  socket.on("take", ({ roomId, from }, cb) => {
    const room = roomManager.getRoom(roomId);
    const game = room?.game;
    if (!game) return cb && cb({ ok: false });

    if (game.getCurrentPlayer() !== socket.id)
      return cb && cb({ ok: false });

    if (from === "deck") {
      const card = game.drawCard();
      return cb && cb({ ok: true, card });
    }

    if (from === "discard") {
      const card = game.discard.pop();
      return cb && cb({ ok: true, card });
    }

    cb && cb({ ok: false });
  });

  /* ==========================
     TAUSCHEN / ABWERFEN
  ========================== */
  socket.on("swap", ({ roomId, index, drawnCard }, cb) => {
    const room = roomManager.getRoom(roomId);
    const game = room?.game;
    if (!game) return cb && cb({ ok: false });

    if (game.getCurrentPlayer() !== socket.id)
      return cb && cb({ ok: false });

    if (index === -1) {
      game.discard.push(drawnCard);
    } else {
      game.replaceCard(socket.id, index, drawnCard);
    }

    game.nextTurn();
    broadcastState(roomId);

    cb && cb({ ok: true });
  });

  /* ==========================
     DISCONNECT
  ========================== */
  socket.on("disconnect", () => {
    for (const roomId of Object.keys(roomManager.rooms)) {
      const room = roomManager.rooms[roomId];
      if (room.players.includes(socket.id)) {
        roomManager.leaveRoom(roomId, socket.id);

        io.to(roomId).emit("roomUpdate", {
          players: room.players.length,
          names: room.names,
        });
      }
    }
  });

  /* ==========================
     STATE BROADCAST
  ========================== */
  function broadcastState(roomId) {
    const room = roomManager.getRoom(roomId);
    if (!room || !room.game) return;

    const game = room.game;

    io.to(roomId).emit("stateUpdate", {
      ...game.getPublicState(),
      names: room.names,
    });

    room.players.forEach((pid) => {
      io.to(pid).emit("yourHand", game.getPrivateHand(pid));
    });
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("Server läuft auf Port", PORT);
});
