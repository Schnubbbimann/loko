// server/gameEngine.js
const { v4: uuidv4 } = require("uuid");

class CaboGame {
  constructor(players) {
    this.players = players.slice(0, 2);
    this.turnIndex = 0;

    this.deck = [];
    this.discard = [];

    this.playerState = {};
    this.phase = "playing";
    this.caboCalledBy = null;

    this.setupRound();
  }

  /* ================= SETUP ================= */

  setupRound() {
    this.deck = this.createDeck();
    this.shuffle(this.deck);

    this.discard = [];
    this.turnIndex = 0;
    this.caboCalledBy = null;
    this.phase = "playing";

    this.players.forEach(pid => {
      this.playerState[pid] = { hand: [], peekUsed: false };

      for (let i = 0; i < 4; i++) {
        this.playerState[pid].hand.push(
          this.deck.pop()
        );
      }
    });

    // Erste Karte auf Ablage (als Objekt!)
    this.discard.push(this.deck.pop());
  }

  createDeck() {
    const deck = [];

    for (let r = 0; r < 4; r++) {
      for (let v = 0; v <= 13; v++) {
        deck.push({
          id: uuidv4(),
          value: v,
          revealed: false
        });
      }
    }

    return deck;
  }

  shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  }

  /* ================= TURN ================= */

  getCurrentPlayer() {
    return this.players[this.turnIndex];
  }

  nextTurn() {
    this.turnIndex =
      (this.turnIndex + 1) % this.players.length;

    if (
      this.phase === "final" &&
      this.getCurrentPlayer() === this.caboCalledBy
    ) {
      this.phase = "scoring";
    }
  }

  /* ================= DRAW ================= */

drawCard() {
  if (this.deck.length === 0) {

    if (this.discard.length <= 1)
      return null;

    const topCard =
      this.discard[this.discard.length - 1];

    const newDeck =
      this.discard.slice(0, this.discard.length - 1);

    this.shuffle(newDeck);

    this.deck = newDeck;
    this.discard = [topCard];
  }

  return this.deck.pop();
}

  /* ================= HAND ================= */

  replaceCard(playerId, handIndex, newCard) {

    const oldCard =
      this.playerState[playerId].hand[handIndex];

    this.playerState[playerId].hand[handIndex] = {
      id: uuidv4(),
      value: newCard.value,
      revealed: false
    };

    // Alte Karte als Objekt auf Ablage
    this.discard.push(oldCard);
  }

  removePair(playerId, idx1, idx2) {

    const hand = this.playerState[playerId].hand;

    if (!hand[idx1] || !hand[idx2]) return false;
    if (hand[idx1].value !== hand[idx2].value) return false;

    if (idx1 > idx2) [idx1, idx2] = [idx2, idx1];

    const removedHigh = hand.splice(idx2, 1)[0];
    const removedLow = hand.splice(idx1, 1)[0];

    // Beide Karten als Objekte auf Ablage
    this.discard.push(removedLow);
    this.discard.push(removedHigh);

    const newCard = this.drawCard();

    if (newCard) {
      hand.push({
        id: uuidv4(),
        value: newCard.value,
        revealed: false
      });
    }

    return true;
  }

  /* ================= CABO ================= */

  callCabo(playerId) {
    if (this.phase !== "playing") return false;
    this.caboCalledBy = playerId;
    this.phase = "final";
    return true;
  }

  score() {
    const results = {};
    let winner = null;
    let best = Infinity;

    this.players.forEach(pid => {
      const sum = this.playerState[pid].hand
        .reduce((a, c) => a + (c.value || 0), 0);

      results[pid] = sum;

      if (sum < best) {
        best = sum;
        winner = pid;
      }
    });

    this.phase = "scoring";
    return { results, winner };
  }

  /* ================= STATE ================= */

  getPublicState() {
    return {
      players: this.players,
      turnIndex: this.turnIndex,
      deckCount: this.deck.length,
      discardTop:
        this.discard[this.discard.length - 1]?.value ?? null,
      phase: this.phase,
      playerCardsCount: Object.fromEntries(
        this.players.map(p => [
          p,
          this.playerState[p].hand.length
        ])
      )
    };
  }

  getPrivateHand(pid) {
    return this.playerState[pid].hand.map(c => ({
      id: c.id,
      value: c.value,
      revealed: c.revealed
    }));
  }
}

module.exports = CaboGame;
