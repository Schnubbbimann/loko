// simple 2-player cabo engine per your rules
const { v4: uuidv4 } = require("uuid");

class CaboGame {
  constructor(players) {
    this.players = players.slice(0,2); // only two players
    this.turnIndex = 0;
    this.deck = [];
    this.discard = [];
    this.playerState = {}; // socketId -> { hand: [{id,value,revealed}], peekUsed: false }
    this.phase = "playing"; // playing | final | scoring
    this.caboCalledBy = null;

    this.setupRound();
  }

  createDeck() {
    const deck = [];
    // 4 suits of 0..13
    for (let r = 0; r < 4; r++) {
      for (let v = 0; v <= 13; v++) deck.push(v);
    }
    return deck;
  }

  shuffle(array) {
    for (let i = array.length-1; i>0; i--) {
      const j = Math.floor(Math.random()*(i+1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  }

  setupRound() {
    this.deck = this.createDeck();
    this.shuffle(this.deck);
    this.discard = [];
    this.turnIndex = 0;
    this.caboCalledBy = null;
    this.phase = "playing";
    this.players.forEach(pid => {
      this.playerState[pid] = { hand: [], peekUsed: false };
      for (let i=0;i<4;i++){
        this.playerState[pid].hand.push({ id: uuidv4(), value: this.deck.pop(), revealed:false });
      }
    });
    // start discard with one card
    this.discard.push(this.deck.pop());
  }

  getCurrentPlayer() { return this.players[this.turnIndex]; }
  nextTurn() {
    this.turnIndex = (this.turnIndex + 1) % this.players.length;
    if (this.phase === "final" && this.getCurrentPlayer() === this.caboCalledBy) {
      this.phase = "scoring";
    }
  }

  drawCard() {
    if (this.deck.length === 0) {
      const top = this.discard.pop();
      this.deck = this.discard;
      this.shuffle(this.deck);
      this.discard = [top];
    }
    return this.deck.pop();
  }

  replaceCard(playerId, handIndex, newVal) {
    // swap: replace player's card at index with newVal, push old to discard, reveal replaced card
    const slot = this.playerState[playerId].hand[handIndex];
    const old = slot.value;
    this.playerState[playerId].hand[handIndex] = { id: uuidv4(), value: newVal, revealed: true };
    this.discard.push(old);
    // check pair-removal not triggered here
  }

  removePair(playerId, idx1, idx2) {
    // idx1, idx2 must exist and values identical
    const hand = this.playerState[playerId].hand;
    if (!hand[idx1] || !hand[idx2]) return false;
    if (hand[idx1].value !== hand[idx2].value) return false;
    // remove higher index first
    if (idx1 > idx2) [idx1,idx2] = [idx2,idx1];
    hand.splice(idx2,1);
    hand.splice(idx1,1);
    // then draw one card from deck into player's hand (as rule)
    const newCard = this.drawCard();
    hand.push({ id: uuidv4(), value: newCard, revealed:false });
    return true;
  }

  callCabo(playerId) {
    if (this.phase !== "playing") return false;
    this.caboCalledBy = playerId;
    this.phase = "final";
    return true;
  }

  score() {
    // reveal all and compute sums; 13 counts as 13 (per your rule)
    const results = {};
    let winner = null;
    let best = Infinity;
    this.players.forEach(pid=>{
      const sum = this.playerState[pid].hand.reduce((a,c)=>a + (c.value||0),0);
      results[pid] = sum;
      if (sum < best) { best = sum; winner = pid; }
    });
    this.phase = "scoring";
    return { results, winner };
  }

  // public safe state
  getPublicState() {
    return {
      players: this.players,
      turnIndex: this.turnIndex,
      deckCount: this.deck.length,
      discardTop: this.discard[this.discard.length-1] ?? null,
      phase: this.phase,
      playerCardsCount: Object.fromEntries(this.players.map(p=>[p, this.playerState[p].hand.length]))
    };
  }

  getPrivateHand(pid) {
    // return player's hand but do not reveal other players
    return this.playerState[pid].hand.map(c => ({ id: c.id, value: c.value, revealed: c.revealed }));
  }
}

module.exports = CaboGame;
