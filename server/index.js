// server/index.js (mit Debug-Logging für discard)
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

// helper to pretty-print discard for logs
function dumpDiscard(game) {
  return Array.isArray(game.discard) ? game.discard.slice() : [];
}

io.on("connection", (socket) => {
  console.log("Connected:", socket.id);

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

    // 🔥 WICHTIG: Schutz gegen undefined/null
    if (!card)
      return cb && cb({ ok: false });

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

      // EXACT ONE pop
      card = game.discard.pop();
      game.lastDrawSource[socket.id] = "discard";
      console.log(`[take] ${socket.id} drew from discard => ${card} ; new discard(top->last):`, dumpDiscard(game));
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
      // push card once
      game.discard.push(drawnCard);
      console.log(`[swap] ${socket.id} SPECIAL discarded ${drawnCard} -> discard now:`, dumpDiscard(game));

      let type = null;
      if (drawnCard === 7 || drawnCard === 8) type = "peekOwn";
      if (drawnCard === 9 || drawnCard === 10) type = "peekOpponent";
      if (drawnCard === 11 || drawnCard === 12) type = "swapOpponent";

      game.pendingSpecial = { player: socket.id, value: drawnCard };
      io.to(socket.id).emit("specialAction", { type });

      return cb && cb({ ok: true });
    }

    // Normal behavior
    if (index === -1) {
      game.discard.push(drawnCard);
      console.log(`[swap] ${socket.id} discarded ${drawnCard} -> discard now:`, dumpDiscard(game));
    } else {
      // replaceCard should handle pushing the old card into discard; we log around it
      const before = dumpDiscard(game);
      game.replaceCard(socket.id, index, drawnCard);
      const after = dumpDiscard(game);
      console.log(`[swap] ${socket.id} replaced index ${index} with ${drawnCard} ; discard before:`, before, " after:", after);
    }

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

    if (v === 7 || v === 8) {
      const card = game.getPrivateHand(socket.id)[payload.index];
      io.to(socket.id).emit("revealOwn", { value: card.value });
    }

    if (v === 9 || v === 10) {
      const opponent = game.players.find((p) => p !== socket.id);
      const card = game.getPrivateHand(opponent)[payload.index];
      io.to(socket.id).emit("revealOpponent", { value: card.value });
    }

    if (v === 11 || v === 12) {
      const opponent = game.players.find((p) => p !== socket.id);
      const ownCard = game.playerState[socket.id].hand[payload.ownIndex];
      const oppCard = game.playerState[opponent].hand[payload.oppIndex];
      const tmp = ownCard.value;
      ownCard.value = oppCard.value;
      oppCard.value = tmp;
      console.log(`[specialResolve] ${socket.id} swapped with ${opponent}; discard now:`, dumpDiscard(game));
    }

    // special ends the turn
    game.hasDrawn = game.hasDrawn || {};
    game.hasDrawn[socket.id] = false;
    game.nextTurn();
    broadcastState(roomId);

    cb && cb({ ok: true });
  });

  /* ================= CLAIM (ZUGOPTION C) ================= */

  socket.on("claimResolve", ({ roomId, idxA, idxB }, cb) => {
    const room = roomManager.getRoom(roomId);
    const game = room?.game;
    if (!game) return cb && cb({ ok: false, error: "no game" });

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

    const internalHand = game.playerState && game.playerState[socket.id] && game.playerState[socket.id].hand
      ? game.playerState[socket.id].hand
      : null;

    if (!internalHand) return cb && cb({ ok: false, error: "server internal hand missing" });

    const valA = internalHand[idxA].value;
    const valB = internalHand[idxB].value;

    if (valA === valB) {
      const high = Math.max(idxA, idxB);
      const low = Math.min(idxA, idxB);
      const removedHigh = internalHand.splice(high, 1)[0];
      const removedLow = internalHand.splice(low, 1)[0];

      // push both values to discard in the order of removal -> which makes removedHigh top
      game.discard.push(removedLow.value);
      game.discard.push(removedHigh.value);
      console.log(`[claimResolve] ${socket.id} correct claim, pushed ${removedLow.value}, ${removedHigh.value} -> discard:`, dumpDiscard(game));

      const newCard = game.drawCard();
      internalHand.push({ id: Date.now().toString(), value: newCard, revealed: false });

      io.to(socket.id).emit("claimResult", { correct: true });

      game.hasDrawn = game.hasDrawn || {};
      game.hasDrawn[socket.id] = false;
      game.nextTurn();
      broadcastState(roomId);

      return cb && cb({ ok: true, correct: true });
    }

    // incorrect
    const penalty = game.drawCard();
    internalHand.push({ id: Date.now().toString(), value: penalty, revealed: false });
    console.log(`[claimResolve] ${socket.id} incorrect claim, penalty ${penalty} -> discard:`, dumpDiscard(game));

    io.to(socket.id).emit("claimResult", { correct: false });

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

    room.players.forEach(pid => {
      io.to(pid).emit("yourHand", game.getPrivateHand(pid));
    });
  }
});

server.listen(process.env.PORT || 3000);
