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
      if (!card) return cb && cb({ ok: false });
      game.lastDrawSource[socket.id] = "deck";
    }

    if (from === "discard") {
      if (!game.discard.length)
        return cb && cb({ ok: false });

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

    const isSpecial =
      drawnCard &&
      drawnCard.value >= 7 &&
      drawnCard.value <= 12;

    const wasFromDeck =
      game.lastDrawSource &&
      game.lastDrawSource[socket.id] === "deck";

    // Spezial nur bei Deck + direkt ablegen
    if (index === -1 && isSpecial && wasFromDeck) {

      game.discard.push(drawnCard);

      let type = null;

      if (drawnCard.value === 7 || drawnCard.value === 8)
        type = "peekOwn";
      if (drawnCard.value === 9 || drawnCard.value === 10)
        type = "peekOpponent";
      if (drawnCard.value === 11 || drawnCard.value === 12)
        type = "swapOpponent";

      game.pendingSpecial = {
        player: socket.id,
        value: drawnCard.value
      };

      io.to(socket.id).emit("specialAction", { type });

      return cb && cb({ ok: true });
    }

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

  /* ================= CLAIM ================= */

  socket.on("claimResolve", ({ roomId, idxA, idxB }, cb) => {
    const room = roomManager.getRoom(roomId);
    const game = room?.game;

    if (!game) return cb && cb({ ok: false });
    if (game.getCurrentPlayer() !== socket.id)
      return cb && cb({ ok: false });

    const result =
      game.claimPair(socket.id, idxA, idxB);

    io.to(socket.id).emit("claimResult", {
      correct: result.correct
    });

    game.hasDrawn[socket.id] = false;
    game.nextTurn();
    broadcastState(roomId);

    cb && cb({ ok: true });
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
      io.to(pid).emit(
        "yourHand",
        game.getPrivateHand(pid)
      );
    });
  }
});

server.listen(process.env.PORT || 3000);
