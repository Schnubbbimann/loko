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
      ? {
          ...room.game.getPublicState(),
          pendingDraw: room.game.pendingDraw || null,
          pendingBetweenwerfen: room.game.pendingBetweenwerfen || null,
          discardPile: (room.game.discard || []).map(c => c.value)
        }
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

    // ensure turn/draw tracking initialized
    room.game.hasDrawn = room.game.hasDrawn || {};
    room.game.lastDrawSource = room.game.lastDrawSource || {};
    room.game.pendingDraw = null;
    room.game.pendingBetweenwerfen = null;

    io.to(roomId).emit("gameStarted");

    setTimeout(() => {
      broadcastState(roomId);
    }, 60);

    cb && cb({ ok: true });
  });

  /* ================= helper: post-turn handling ================= */

  function postTurn(roomId) {
    const room = roomManager.getRoom(roomId);
    if (!room || !room.game) return;
    const game = room.game;

    // If after advancing turn we are in scoring -> compute & emit results
    if (game.phase === "scoring") {
      const result = game.score();

      const finalHands = {};
      room.players.forEach((pid) => {
        finalHands[pid] = (game.playerState?.[pid]?.hand || []).map((card) => ({
          id: card.id,
          value: card.value
        }));
      });

      io.to(roomId).emit("roundResult", {
        ...result,
        finalHands
      });
    } else {
      broadcastState(roomId);
    }
  }

  /* ================= TAKE CARD ================= */

  socket.on("take", ({ roomId, from }, cb) => {
    const room = roomManager.getRoom(roomId);
    const game = room?.game;

    if (!game) return cb && cb({ ok: false });
    if (game.pendingBetweenwerfen) return cb && cb({ ok: false });
    if (game.getCurrentPlayer() !== socket.id)
      return cb && cb({ ok: false });

    game.hasDrawn = game.hasDrawn || {};
    game.lastDrawSource = game.lastDrawSource || {};

    if (game.hasDrawn[socket.id])
      return cb && cb({ ok: false });

    let card;

    if (from === "deck") {
      card = game.drawCard();
      // if no card available, block the action
      if (!card) return cb && cb({ ok: false });
      game.lastDrawSource[socket.id] = "deck";
    }

    if (from === "discard") {
      if (!Array.isArray(game.discard) || game.discard.length === 0)
        return cb && cb({ ok: false });

      // STACK: exactly one pop -> top card object
      card = game.discard.pop();
      game.lastDrawSource[socket.id] = "discard";
    }

    game.hasDrawn[socket.id] = true;

    // keep draw visible for everyone until discard/swap ends the turn
    game.pendingDraw = {
      playerId: socket.id,
      from
    };

    broadcastState(roomId);

    cb && cb({ ok: true, card });
  });

  /* ================= BETWEENWERFEN ================= */

  socket.on("betweenwerfenRequest", (roomId, cb) => {
    const room = roomManager.getRoom(roomId);
    const game = room?.game;

    if (!game) return cb && cb({ ok: false });
    if (game.pendingBetweenwerfen) return cb && cb({ ok: false });

    game.pendingBetweenwerfen = {
      by: socket.id
    };

    broadcastState(roomId);

    cb && cb({ ok: true });
  });

  socket.on("betweenwerfenResolve", ({ roomId, kind, index, targetPlayerId }, cb) => {
    const room = roomManager.getRoom(roomId);
    const game = room?.game;

    if (!game || !game.pendingBetweenwerfen) return cb && cb({ ok: false });
    if (game.pendingBetweenwerfen.by !== socket.id) return cb && cb({ ok: false });

    const discardTop = game.discard?.[game.discard.length - 1];
    if (!discardTop) return cb && cb({ ok: false });

    const actorId = socket.id;
    const actorHand = game.playerState?.[actorId]?.hand;
    if (!actorHand) return cb && cb({ ok: false });

    const idx = Number(index);
    if (!Number.isFinite(idx)) return cb && cb({ ok: false });

    let chosenCard = null;
    let ownerId = null;

    if (kind === "own") {
      ownerId = actorId;
      chosenCard = actorHand[idx] || null;
    }

    if (kind === "opponent") {
      ownerId = targetPlayerId;
      const targetHand = game.playerState?.[targetPlayerId]?.hand;
      if (!targetHand) return cb && cb({ ok: false });
      chosenCard = targetHand[idx] || null;
    }

    if (!chosenCard || !ownerId) return cb && cb({ ok: false });

    const matches = chosenCard.value === discardTop.value;

    if (matches) {
      const hand = game.playerState[ownerId].hand;
      const removed = hand.splice(idx, 1)[0];
      if (removed) {
        game.discard.push(removed);
      }

      game.pendingBetweenwerfen = null;
      broadcastState(roomId);

      return cb && cb({ ok: true, correct: true });
    }

    const penalty = game.drawCard();
    if (penalty) {
      actorHand.push({
        id: Date.now().toString(),
        value: penalty.value,
        revealed: false
      });
    }

    game.pendingBetweenwerfen = null;
    broadcastState(roomId);

    return cb && cb({ ok: true, correct: false });
  });

  /* ================= SWAP / DISCARD ================= */

  socket.on("swap", ({ roomId, index, drawnCard }, cb) => {
    const room = roomManager.getRoom(roomId);
    const game = room?.game;

    if (!game) return cb && cb({ ok: false });
    if (game.pendingBetweenwerfen) return cb && cb({ ok: false });
    if (game.getCurrentPlayer() !== socket.id)
      return cb && cb({ ok: false });

    // drawnCard is expected to be an object {id, value, revealed}
    const isSpecial =
      drawnCard &&
      typeof drawnCard.value === "number" &&
      drawnCard.value >= 7 &&
      drawnCard.value <= 12;

    const wasFromDeck =
      game.lastDrawSource &&
      game.lastDrawSource[socket.id] === "deck";

    // Special only triggers when drawn from deck and immediately discarded (index === -1)
    if (index === -1 && isSpecial && wasFromDeck) {
      // push the drawn card object once onto discard
      game.discard.push(drawnCard);

      // clear draw display now that the card is on the discard pile
      game.pendingDraw = null;

      // IMPORTANT: broadcast state now so everyone sees the special card on the discard pile
      broadcastState(roomId);

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

    // Normal behavior
    if (index === -1) {
      // discard the drawn card object
      game.discard.push(drawnCard);
    } else {
      // replaceCard in gameEngine expects newCard object; it will push the old card object to discard
      game.replaceCard(socket.id, index, drawnCard);
    }

    // end of action: reset draw flag, clear pending draw, next turn and postTurn
    game.pendingDraw = null;
    game.hasDrawn = game.hasDrawn || {};
    game.hasDrawn[socket.id] = false;
    game.nextTurn();
    postTurn(roomId);

    cb && cb({ ok: true });
  });

  /* ================= SPECIAL RESOLVE ================= */

  socket.on("specialResolve", ({ roomId, payload }, cb) => {
    const room = roomManager.getRoom(roomId);
    const game = room?.game;
    if (!game || !game.pendingSpecial) return cb && cb({ ok: false });

    if (game.pendingBetweenwerfen) return cb && cb({ ok: false });

    const pending = game.pendingSpecial;
    // only the player who triggered the special may resolve it
    if (pending.player !== socket.id) return cb && cb({ ok: false });

    const v = pending.value; // number 7..12
    // remove pending to prevent double-execution
    delete game.pendingSpecial;

    // we'll collect cards to reveal/highlight for both players
    const revealCards = []; // { playerId, index, value, type }

    if (v === 7 || v === 8) {
      // peek own
      const idx = payload.index;
      const card = game.getPrivateHand(socket.id)[idx];
      if (card) {
        // inform only the actor about the value (existing event)
        io.to(socket.id).emit("revealOwn", { value: card.value });
        // but also inform room to briefly reveal/highlight that card (so opponent sees which card was peeked)
        revealCards.push({
          playerId: socket.id,
          index: idx,
          value: card.value,
          type: "peek"
        });
      }
    }

    if (v === 9 || v === 10) {
      // peek opponent
      const opponent = game.players.find(p => p !== socket.id);
      const idx = payload.index;
      const card = game.getPrivateHand(opponent)[idx];
      if (card) {
        // actor gets the private reveal event
        io.to(socket.id).emit("revealOpponent", { value: card.value, index: idx });
        // room gets a tempReveal so both see which card was peeked (value + highlight)
        revealCards.push({
          playerId: opponent,
          index: idx,
          value: card.value,
          type: "peek"
        });
      }
    }

    if (v === 11 || v === 12) {
      // swap opponent: swap values in internal hands
      const opponent = game.players.find(p => p !== socket.id);
      const ownIndex = payload.ownIndex;
      const oppIndex = payload.oppIndex;
      if (
        opponent &&
        Number.isFinite(ownIndex) && Number.isFinite(oppIndex) &&
        game.playerState[socket.id].hand[ownIndex] &&
        game.playerState[opponent].hand[oppIndex]
      ) {
        const ownCard = game.playerState[socket.id].hand[ownIndex];
        const oppCard = game.playerState[opponent].hand[oppIndex];
        // swap values
        const tmp = ownCard.value;
        ownCard.value = oppCard.value;
        oppCard.value = tmp;

        // after swap: reveal both cards to the room temporarily and highlight them
        revealCards.push({
          playerId: socket.id,
          index: ownIndex,
          value: ownCard.value,
          type: "swap"
        });
        revealCards.push({
          playerId: opponent,
          index: oppIndex,
          value: oppCard.value,
          type: "swap"
        });
      }
    }

    // if we have revealCards, broadcast them as a single tempReveal event to the whole room
    if (revealCards.length > 0) {
      io.to(roomId).emit("tempReveal", {
        by: socket.id,
        cards: revealCards.map(c => ({
          playerId: c.playerId,
          index: Number(c.index),
          value: c.value,
          type: c.type
        }))
      });
    }

    // special ends the turn
    game.pendingDraw = null;
    game.hasDrawn = game.hasDrawn || {};
    game.hasDrawn[socket.id] = false;
    game.nextTurn();
    postTurn(roomId);

    cb && cb({ ok: true });
  });

  /* ================= CLAIM (ZUGOPTION C) ================= */

  socket.on("claimResolve", ({ roomId, idxA, idxB }, cb) => {
    const room = roomManager.getRoom(roomId);
    const game = room?.game;

    if (!game) return cb && cb({ ok: false });
    if (game.pendingBetweenwerfen) return cb && cb({ ok: false });
    if (game.getCurrentPlayer() !== socket.id)
      return cb && cb({ ok: false });

    const internalHand = game.playerState[socket.id].hand;

    // validation & normalization
    idxA = Number(idxA);
    idxB = Number(idxB);
    if (!Number.isFinite(idxA) || !Number.isFinite(idxB) || idxA === idxB)
      return cb && cb({ ok: false });

    if (!internalHand[idxA] || !internalHand[idxB])
      return cb && cb({ ok: false });

    const valA = internalHand[idxA].value;
    const valB = internalHand[idxB].value;

    if (valA === valB) {
      const high = Math.max(idxA, idxB);
      const low = Math.min(idxA, idxB);

      const removedHigh = internalHand.splice(high, 1)[0];
      const removedLow = internalHand.splice(low, 1)[0];

      // push objects (low first, high on top)
      game.discard.push(removedLow);
      game.discard.push(removedHigh);

      // draw new card object and push normalized object into hand
      const newCard = game.drawCard();
      if (newCard) {
        internalHand.push({
          id: Date.now().toString(),
          value: newCard.value,
          revealed: false
        });
      }

      io.to(socket.id).emit("claimResult", { correct: true });
    } else {
      // incorrect -> penalty
      const penalty = game.drawCard();
      if (penalty) {
        internalHand.push({
          id: Date.now().toString(),
          value: penalty.value,
          revealed: false
        });
      }

      io.to(socket.id).emit("claimResult", { correct: false });
    }

    // claim ends turn
    game.pendingDraw = null;
    game.hasDrawn = game.hasDrawn || {};
    game.hasDrawn[socket.id] = false;
    game.nextTurn();
    postTurn(roomId);

    cb && cb({ ok: true });
  });

  /* ================= CALL CABO ================= */

  socket.on("callCabo", (roomId, cb) => {
    const room = roomManager.getRoom(roomId);
    const game = room?.game;

    if (!game) return cb && cb({ ok: false });
    if (game.pendingBetweenwerfen) return cb && cb({ ok: false });
    if (game.getCurrentPlayer() !== socket.id)
      return cb && cb({ ok: false });

    game.hasDrawn = game.hasDrawn || {};

    // only allowed if player hasn't done anything this turn
    if (game.hasDrawn[socket.id]) return cb && cb({ ok: false });

    const ok = game.callCabo(socket.id);
    if (!ok) return cb && cb({ ok: false });

    io.to(roomId).emit("caboCalled", {
      by: socket.id
    });

    // immediate end of this player's turn; opponent gets one final turn
    game.pendingDraw = null;
    game.nextTurn();
    postTurn(roomId);

    cb && cb({ ok: true });
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

  /* ================= BROADCAST ================= */

  function broadcastState(roomId) {
    const room = roomManager.getRoom(roomId);
    if (!room || !room.game) return;

    const game = room.game;

    io.to(roomId).emit("stateUpdate", {
      ...game.getPublicState(),
      pendingDraw: game.pendingDraw || null,
      pendingBetweenwerfen: game.pendingBetweenwerfen || null,
      discardPile: (game.discard || []).map(c => c.value),
      names: room.names
    });

    room.players.forEach(pid => {
      io.to(pid).emit("yourHand", game.getPrivateHand(pid));
    });
  }
});

server.listen(process.env.PORT || 3000);
