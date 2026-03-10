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

    let card;

    if (from === "deck") {
      card = game.drawCard();

      // 🔥 Merken woher die Karte kam
      game.lastDrawSource = game.lastDrawSource || {};
      game.lastDrawSource[socket.id] = "deck";
    }

    if (from === "discard") {
      if (!game.discard.length)
        return cb && cb({ ok: false });

      card = game.discard.pop();

      game.lastDrawSource = game.lastDrawSource || {};
      game.lastDrawSource[socket.id] = "discard";
    }

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

    // 🔥 Spezial nur wenn vom Deck + direkt abgelegt
    if (index === -1 && isSpecial && wasFromDeck) {
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

    // Normale Behandlung

    if (index === -1) {
      game.discard.push(drawnCard);
    } else {
      game.replaceCard(socket.id, index, drawnCard);
    }

    game.nextTurn();
    broadcastState(roomId);

    cb && cb({ ok: true });
  });

  /* ================= SPECIAL RESOLVE ================= */

  socket.on("specialResolve", ({ roomId, payload }, cb) => {
    const room = roomManager.getRoom(roomId);
    const game = room?.game;

    if (!game || !game.pendingSpecial)
      return cb && cb({ ok: false });

    const v = game.pendingSpecial.value;
    delete game.pendingSpecial;

    if (v === 7 || v === 8) {
      const card =
        game.getPrivateHand(socket.id)[payload.index];
      io.to(socket.id).emit("revealOwn", {
        value: card.value
      });
    }

    if (v === 9 || v === 10) {
      const opponent =
        game.players.find((p) => p !== socket.id);

      const card =
        game.getPrivateHand(opponent)[payload.index];

      io.to(socket.id).emit("revealOpponent", {
        value: card.value
      });
    }

    if (v === 11 || v === 12) {
      const opponent =
        game.players.find((p) => p !== socket.id);

      const ownCard =
        game.playerState[socket.id].hand[payload.ownIndex];

      const oppCard =
        game.playerState[opponent].hand[payload.oppIndex];

      const tmp = ownCard.value;
      ownCard.value = oppCard.value;
      oppCard.value = tmp;
    }

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
      io.to(pid).emit(
        "yourHand",
        game.getPrivateHand(pid)
      );
    });
  }
});

server.listen(process.env.PORT || 3000);
