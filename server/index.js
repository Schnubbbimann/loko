const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const path = require("path");
const roomManager = require("./roomManager");

const app = express();
app.use(cors());

app.use(express.static(path.join(__dirname, "../client/dist")));
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../client/dist/index.html"));
});

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

io.on("connection", (socket) => {

  /* ================= ROOM ================= */

  socket.on("createRoom", ({ roomId, name }, cb) => {
    roomManager.createRoom(roomId);
    roomManager.joinRoom(roomId, socket.id, name);
    socket.join(roomId);

    const room = roomManager.getRoom(roomId);

    io.to(roomId).emit("roomUpdate", {
      players: room.players.length,
      names: room.names
    });

    cb && cb({ ok: true });
  });

  socket.on("joinRoom", ({ roomId, name }, cb) => {
    const room = roomManager.getRoom(roomId);
    if (!room) return cb && cb({ ok: false });

    roomManager.joinRoom(roomId, socket.id, name);
    socket.join(roomId);

    io.to(roomId).emit("roomUpdate", {
      players: room.players.length,
      names: room.names
    });

    cb && cb({ ok: true });
  });

  socket.on("roomInfo", (roomId, cb) => {
    const room = roomManager.getRoom(roomId);
    if (!room) return cb && cb({ ok: false });

    const publicState = room.game
      ? room.game.getPublicState()
      : null;

    cb && cb({
      ok: true,
      players: room.players.length,
      names: room.names,
      publicState
    });

    if (room.game) {
      socket.emit("yourHand", room.game.getPrivateHand(socket.id));
    }
  });

  /* ================= START GAME ================= */

  socket.on("startGame", (roomId, cb) => {
    const room = roomManager.getRoom(roomId);
    if (!room || room.players.length < 2)
      return cb && cb({ ok: false });

    roomManager.startGame(roomId);

    room.game.hasDrawn = {};
    room.game.lastDrawSource = {};

    io.to(roomId).emit("gameStarted");

    setTimeout(() => {
      broadcastState(roomId);
    }, 60);

    cb && cb({ ok: true });
  });

  /* ================= TAKE CARD ================= */

  socket.on("take", ({ roomId, from }, cb) => {
    const room = roomManager.getRoom(roomId);
    const game = room?.game;

    if (!game) return cb && cb({ ok: false });
    if (game.getCurrentPlayer() !== socket.id)
      return cb && cb({ ok: false });

    game.hasDrawn = game.hasDrawn || {};
    game.lastDrawSource = game.lastDrawSource || {};

    if (game.hasDrawn[socket.id])
      return cb && cb({ ok: false });

    let card;

    if (from === "deck") {
      card = game.drawCard();
      game.lastDrawSource[socket.id] = "deck";
    }

    if (from === "discard") {
      if (game.discard.length === 0)
        return cb && cb({ ok: false });

      // 🔥 STACK: genau EIN pop
      card = game.discard.pop();
      game.lastDrawSource[socket.id] = "discard";
    }

    game.hasDrawn[socket.id] = true;

    cb && cb({ ok: true, card });
  });

  /* ================= SWAP / DISCARD ================= */

  socket.on("swap", ({ roomId, index, drawnCard }, cb) => {
    const room = roomManager.getRoom(roomId);
    const game = room?.game;

    if (!game) return cb && cb({ ok: false });
    if (game.getCurrentPlayer() !== socket.id)
      return cb && cb({ ok: false });

    const isSpecial = drawnCard >= 7 && drawnCard <= 12;
    const wasFromDeck =
      game.lastDrawSource &&
      game.lastDrawSource[socket.id] === "deck";

    // 🔥 Spezial nur bei Deck + direkt ablegen
    if (index === -1 && isSpecial && wasFromDeck) {

      // Karte EINMALIG auf Ablage legen
      game.discard.push(drawnCard);

      let type = null;
      if (drawnCard === 7 || drawnCard === 8)
        type = "peekOwn";
      if (drawnCard === 9 || drawnCard === 10)
        type = "peekOpponent";
      if (drawnCard === 11 || drawnCard === 12)
        type = "swapOpponent";

      game.pendingSpecial = {
        player: socket.id,
        value: drawnCard
      };

      io.to(socket.id).emit("specialAction", { type });

      return cb && cb({ ok: true });
    }

    // Normales Verhalten

    if (index === -1) {
      game.discard.push(drawnCard);
    } else {
      game.replaceCard(socket.id, index, drawnCard);
    }

    game.hasDrawn[socket.id] = false;

    game.nextTurn();
    broadcastState(roomId);

    cb && cb({ ok: true });
  });

  /* ================= CLAIM (ZUGOPTION C) ================= */

  socket.on("claimResolve", ({ roomId, idxA, idxB }, cb) => {
    const room = roomManager.getRoom(roomId);
    const game = room?.game;

    if (!game) return cb && cb({ ok: false });
    if (game.getCurrentPlayer() !== socket.id)
      return cb && cb({ ok: false });

    const internalHand = game.playerState[socket.id].hand;

    if (!internalHand[idxA] || !internalHand[idxB] || idxA === idxB)
      return cb && cb({ ok: false });

    const valA = internalHand[idxA].value;
    const valB = internalHand[idxB].value;

    if (valA === valB) {
      const high = Math.max(idxA, idxB);
      const low = Math.min(idxA, idxB);

      const removedHigh = internalHand.splice(high, 1)[0];
      const removedLow = internalHand.splice(low, 1)[0];

      // 🔥 Reihenfolge korrekt als Stack
      game.discard.push(removedLow.value);
      game.discard.push(removedHigh.value);

      const newCard = game.drawCard();
      internalHand.push({
        id: Date.now().toString(),
        value: newCard,
        revealed: false
      });

      io.to(socket.id).emit("claimResult", { correct: true });
    } else {
      const penalty = game.drawCard();
      internalHand.push({
        id: Date.now().toString(),
        value: penalty,
        revealed: false
      });

      io.to(socket.id).emit("claimResult", { correct: false });
    }

    game.hasDrawn[socket.id] = false;
    game.nextTurn();
    broadcastState(roomId);

    cb && cb({ ok: true });
  });

  /* ================= DISCONNECT ================= */

  socket.on("disconnect", () => {
    for (const roomId of Object.keys(roomManager.rooms)) {
      const room = roomManager.rooms[roomId];
      if (room.players.includes(socket.id)) {
        roomManager.leaveRoom(roomId, socket.id);
        io.to(roomId).emit("roomUpdate", {
          players: room.players.length,
          names: room.names
        });
      }
    }
  });

  /* ================= BROADCAST ================= */

  function broadcastState(roomId) {
    const room = roomManager.getRoom(roomId);
    if (!room || !room.game) return;

    const game = room.game;

    io.to(roomId).emit("stateUpdate", {
      ...game.getPublicState(),
      names: room.names
    });

    room.players.forEach(pid => {
      io.to(pid).emit("yourHand", game.getPrivateHand(pid));
    });
  }
});

server.listen(process.env.PORT || 3000);
