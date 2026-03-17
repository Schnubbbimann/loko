// server/index.js
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

  socket.on("startGame", (roomId, cb) => {
    const room = roomManager.getRoom(roomId);
    if (!room || room.players.length < 2)
      return cb && cb({ ok: false });

    roomManager.startGame(roomId);

    room.game.hasDrawn = {};
    room.game.lastDrawSource = {};

    io.to(roomId).emit("gameStarted");
    setTimeout(() => broadcastState(roomId), 60);

    cb && cb({ ok: true });
  });

  function postTurn(roomId) {
    const room = roomManager.getRoom(roomId);
    const game = room?.game;
    if (!game) return;

    if (game.phase === "scoring") {
      const result = game.score();
      io.to(roomId).emit("roundResult", result);
    } else {
      broadcastState(roomId);
    }
  }

  socket.on("take", ({ roomId, from }, cb) => {
    const room = roomManager.getRoom(roomId);
    const game = room?.game;

    if (!game || game.getCurrentPlayer() !== socket.id)
      return cb && cb({ ok: false });

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

  socket.on("swap", ({ roomId, index, drawnCard }, cb) => {
    const room = roomManager.getRoom(roomId);
    const game = room?.game;

    if (!game || game.getCurrentPlayer() !== socket.id)
      return cb && cb({ ok: false });

    const isSpecial =
      drawnCard?.value >= 7 && drawnCard?.value <= 12;

    const wasFromDeck =
      game.lastDrawSource[socket.id] === "deck";

    if (index === -1 && isSpecial && wasFromDeck) {

      game.discard.push(drawnCard);

      // 👉 sofort anzeigen
      broadcastState(roomId);

      let type = null;
      if (drawnCard.value <= 8) type = "peekOwn";
      if (drawnCard.value <= 10 && drawnCard.value >= 9) type = "peekOpponent";
      if (drawnCard.value >= 11) type = "swapOpponent";

      game.pendingSpecial = {
        player: socket.id,
        value: drawnCard.value
      };

      io.to(socket.id).emit("specialAction", { type });

      return cb && cb({ ok: true });
    }

    if (index === -1) game.discard.push(drawnCard);
    else game.replaceCard(socket.id, index, drawnCard);

    game.hasDrawn[socket.id] = false;
    game.nextTurn();
    postTurn(roomId);

    cb && cb({ ok: true });
  });

  socket.on("specialResolve", ({ roomId, payload }, cb) => {
    const room = roomManager.getRoom(roomId);
    const game = room?.game;
    if (!game || !game.pendingSpecial)
      return cb && cb({ ok: false });

    const v = game.pendingSpecial.value;
    delete game.pendingSpecial;

    const highlights = [];

    if (v === 9 || v === 10) {
      const opponent = game.players.find(p => p !== socket.id);
      highlights.push({ player: opponent, index: payload.index });
    }

    if (v === 11 || v === 12) {
      const opponent = game.players.find(p => p !== socket.id);
      highlights.push({ player: socket.id, index: payload.ownIndex });
      highlights.push({ player: opponent, index: payload.oppIndex });
    }

    io.to(roomId).emit("tempHighlight", highlights);

    game.hasDrawn[socket.id] = false;
    game.nextTurn();
    postTurn(roomId);

    cb && cb({ ok: true });
  });

  socket.on("callCabo", (roomId, cb) => {
    const room = roomManager.getRoom(roomId);
    const game = room?.game;

    if (!game || game.getCurrentPlayer() !== socket.id)
      return cb && cb({ ok: false });

    if (game.hasDrawn[socket.id])
      return cb && cb({ ok: false });

    game.callCabo(socket.id);

    // 🔥 CABO Banner
    io.to(roomId).emit("caboCalled");

    game.nextTurn();
    postTurn(roomId);

    cb && cb({ ok: true });
  });

  function broadcastState(roomId) {
    const room = roomManager.getRoom(roomId);
    const game = room?.game;
    if (!game) return;

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
