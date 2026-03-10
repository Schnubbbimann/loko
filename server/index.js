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
  console.log("Connected:", socket.id);

  /* ================= ROOM ================= */

  socket.on("createRoom", ({ roomId, name }, cb) => {
    roomManager.createRoom(roomId);
    roomManager.joinRoom(roomId, socket.id, name || "Spieler");
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

    roomManager.joinRoom(roomId, socket.id, name || "Spieler");
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

    const publicState = room.game ? room.game.getPublicState() : null;

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

    // init tracking structures for this game
    room.game.hasDrawn = {};
    room.game.lastDrawSource = {};

    io.to(roomId).emit("gameStarted");

    // small delay to allow clients to mount listeners
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

    // only one draw per turn
    if (game.hasDrawn[socket.id]) return cb && cb({ ok: false });

    let card;

    if (from === "deck") {
      card = game.drawCard();
      game.lastDrawSource[socket.id] = "deck";
    } else if (from === "discard") {
      if (!game.discard.length) return cb && cb({ ok: false });
      card = game.discard.pop();
      game.lastDrawSource[socket.id] = "discard";
    } else {
      return cb && cb({ ok: false });
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
    const wasFromDeck = game.lastDrawSource && game.lastDrawSource[socket.id] === "deck";

    // SPECIAL: only trigger if card came from deck and is discarded immediately
    if (index === -1 && isSpecial && wasFromDeck) {
      // push card to discard first (stack behavior)
      game.discard.push(drawnCard);

      let type = null;
      if (drawnCard === 7 || drawnCard === 8) type = "peekOwn";
      if (drawnCard === 9 || drawnCard === 10) type = "peekOpponent";
      if (drawnCard === 11 || drawnCard === 12) type = "swapOpponent";

      game.pendingSpecial = { player: socket.id, value: drawnCard };

      // notify only the acting player to perform the special action
      io.to(socket.id).emit("specialAction", { type });

      return cb && cb({ ok: true });
    }

    // normal behavior
    if (index === -1) {
      // discard the drawn card (put back to discard)
      game.discard.push(drawnCard);
    } else {
      // replace card in player's hand; game.replaceCard should keep revealed:false
      game.replaceCard(socket.id, index, drawnCard);
    }

    // reset draw flag for the player (turn completed)
    game.hasDrawn = game.hasDrawn || {};
    game.hasDrawn[socket.id] = false;

    game.nextTurn();
    broadcastState(roomId);

    cb && cb({ ok: true });
  });

  /* ================= SPECIAL RESOLVE ================= */

  socket.on("specialResolve", ({ roomId, payload }, cb) => {
    const room = roomManager.getRoom(roomId);
    const game = room?.game;
    if (!game || !game.pendingSpecial) return cb && cb({ ok: false });

    const v = game.pendingSpecial.value;
    delete game.pendingSpecial;

    // peek own
    if (v === 7 || v === 8) {
      const card = game.getPrivateHand(socket.id)[payload.index];
      io.to(socket.id).emit("revealOwn", { value: card.value });
    }

    // peek opponent
    if (v === 9 || v === 10) {
      const opponent = game.players.find((p) => p !== socket.id);
      const card = game.getPrivateHand(opponent)[payload.index];
      io.to(socket.id).emit("revealOpponent", { value: card.value });
    }

    // swap with opponent
    if (v === 11 || v === 12) {
      const opponent = game.players.find((p) => p !== socket.id);
      const ownCard = game.playerState[socket.id].hand[payload.ownIndex];
      const oppCard = game.playerState[opponent].hand[payload.oppIndex];
      const tmp = ownCard.value;
      ownCard.value = oppCard.value;
      oppCard.value = tmp;
    }

    // special action ends the turn
    game.hasDrawn = game.hasDrawn || {};
    game.hasDrawn[socket.id] = false;
    game.nextTurn();
    broadcastState(roomId);

    cb && cb({ ok: true });
  });

  /* ================= CLAIM PAIR (ZUGOPTION C) ================= */

  socket.on("claimResolve", ({ roomId, idxA, idxB }, cb) => {
    const room = roomManager.getRoom(roomId);
    const game = room?.game;
    if (!game) return cb && cb({ ok: false, error: "no game" });

    // must be current player
    if (game.getCurrentPlayer() !== socket.id)
      return cb && cb({ ok: false, error: "not your turn" });

    idxA = parseInt(idxA, 10);
    idxB = parseInt(idxB, 10);
    if (!Number.isFinite(idxA) || !Number.isFinite(idxB) || idxA === idxB)
      return cb && cb({ ok: false, error: "invalid indices" });

    const hand = game.getPrivateHand(socket.id);
    if (!hand || hand.length < 2)
      return cb && cb({ ok: false, error: "not enough cards" });

    if (idxA < 0 || idxA >= hand.length || idxB < 0 || idxB >= hand.length)
      return cb && cb({ ok: false, error: "index out of range" });

    // access internal hand for mutation
    const internalHand = game.playerState && game.playerState[socket.id] && game.playerState[socket.id].hand
      ? game.playerState[socket.id].hand
      : null;

    if (!internalHand) return cb && cb({ ok: false, error: "server internal hand missing" });

    const valA = internalHand[idxA].value;
    const valB = internalHand[idxB].value;

    // correct claim
    if (valA === valB) {
      const high = Math.max(idxA, idxB);
      const low = Math.min(idxA, idxB);

      // remove both cards (higher index first)
      const removedHigh = internalHand.splice(high, 1)[0];
      const removedLow = internalHand.splice(low, 1)[0];

      // push their values to discard (stack)
      game.discard.push(removedLow.value);
      game.discard.push(removedHigh.value);

      // draw one card from deck (reshuffle handled by drawCard) and append hidden
      const newCard = game.drawCard();
      internalHand.push({ id: (Date.now() + Math.random()).toString(), value: newCard, revealed: false });

      // notify player
      io.to(socket.id).emit("claimResult", { correct: true });

      // claim ends the turn
      game.hasDrawn = game.hasDrawn || {};
      game.hasDrawn[socket.id] = false;
      game.nextTurn();
      broadcastState(roomId);

      return cb && cb({ ok: true, correct: true });
    }

    // incorrect claim -> penalty: draw one card and append hidden
    const penalty = game.drawCard();
    internalHand.push({ id: (Date.now() + Math.random()).toString(), value: penalty, revealed: false });

    io.to(socket.id).emit("claimResult", { correct: false });

    // claim (also incorrect) ends the turn
    game.hasDrawn = game.hasDrawn || {};
    game.hasDrawn[socket.id] = false;
    game.nextTurn();
    broadcastState(roomId);

    return cb && cb({ ok: true, correct: false });
  });

  /* ================= DISCONNECT ================= */

  socket.on("disconnect", () => {
    for (const roomId of Object.keys(roomManager.rooms)) {
      const room = roomManager.rooms[roomId];
      if (!room) continue;
      if (room.players.includes(socket.id)) {
        roomManager.leaveRoom(roomId, socket.id);
        io.to(roomId).emit("roomUpdate", {
          players: room.players.length,
          names: room.names
        });
      }
    }
  });

  /* ================= STATE BROADCAST ================= */

  function broadcastState(roomId) {
    const room = roomManager.getRoom(roomId);
    if (!room || !room.game) return;

    const game = room.game;

    io.to(roomId).emit("stateUpdate", {
      ...game.getPublicState(),
      names: room.names
    });

    room.players.forEach((pid) => {
      io.to(pid).emit("yourHand", game.getPrivateHand(pid));
    });
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("Server läuft auf Port", PORT));
