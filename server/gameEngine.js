// server/gameEngine.js
const { v4: uuidv4 } = require("uuid");

class CaboGame {
  constructor(players) {
    this.players = players;
    this.turnIndex = 0;

    this.deck = [];
    this.discard = [];

    this.playerState = {};
    this.pendingSpecial = null;

    // Zugkontrolle
    this.hasDrawn = {};
    this.lastDrawSource = {};

    this.setup();
  }

  /* ================= SETUP ================= */

  setup() {
    this.deck = this.createDeck();
    this.shuffle(this.deck);

    this.discard = [];

    this.players.forEach(player => {
      this.playerState[player] = { hand: [] };

      for (let i = 0; i < 4; i++) {
        this.playerState[player].hand.push(
          this.deck.pop()
        );
      }

      this.hasDrawn[player] = false;
      this.lastDrawSource[player] = null;
    });

    // Erste Ablagekarte
    this.discard.push(this.deck.pop());
  }

  /* ================= DECK ================= */

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

  drawCard() {
    if (this.deck.length === 0) {

      // Nur reshufflen wenn mehr als 1 Karte auf Ablage
      if (this.discard.length <= 1) return null;

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

  /* ================= GAME FLOW ================= */

  getCurrentPlayer() {
    return this.players[this.turnIndex];
  }

  nextTurn() {
    this.turnIndex =
      (this.turnIndex + 1) % this.players.length;
  }

  /* ================= HAND ================= */

  replaceCard(playerId, index, newCard) {

    const oldCard =
      this.playerState[playerId].hand[index];

    this.playerState[playerId].hand[index] = {
      id: uuidv4(),
      value: newCard.value,
      revealed: false
    };

    // Alte Karte korrekt oben auf Ablage
    this.discard.push(oldCard);
  }

  /* ================= CLAIM ================= */

  claimPair(playerId, idxA, idxB) {

    const hand = this.playerState[playerId].hand;

    if (!hand[idxA] || !hand[idxB] || idxA === idxB)
      return { ok: false };

    const valA = hand[idxA].value;
    const valB = hand[idxB].value;

    if (valA === valB) {

      const high = Math.max(idxA, idxB);
      const low = Math.min(idxA, idxB);

      const removedHigh = hand.splice(high, 1)[0];
      const removedLow = hand.splice(low, 1)[0];

      // Stack korrekt
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

      return { ok: true, correct: true };
    }

    // Strafkarte
    const penalty = this.drawCard();
    if (penalty) {
      hand.push({
        id: uuidv4(),
        value: penalty.value,
        revealed: false
      });
    }

    return { ok: true, correct: false };
  }

  /* ================= STATE ================= */

  getPublicState() {
    return {
      players: this.players,
      turnIndex: this.turnIndex,
      deckCount: this.deck.length,
      discardTop:
        this.discard[this.discard.length - 1]?.value ?? null,
      playerCardsCount: Object.fromEntries(
        Object.entries(this.playerState).map(
          ([p, data]) => [
            p,
            data.hand.length
          ]
        )
      )
    };
  }

  getPrivateHand(playerId) {
    return this.playerState[playerId].hand;
  }
}

module.exports = CaboGame;
