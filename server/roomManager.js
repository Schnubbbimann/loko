const CaboGame = require("./gameEngine");

class RoomManager {
  constructor(){
    this.rooms = {}; // id -> { players: [], names: {}, game: CaboGame|null }
  }

  createRoom(id){
    if (!this.rooms[id]) this.rooms[id] = { players: [], names: {}, game: null };
  }

  joinRoom(id, socketId, name="Spieler"){
    const room = this.rooms[id];
    if (!room) return false;
    if (!room.players.includes(socketId)) {
      room.players.push(socketId);
      room.names[socketId] = name;
    }
    return true;
  }

  leaveRoom(id, socketId){
    const room = this.rooms[id];
    if (!room) return;
    room.players = room.players.filter(p=>p!==socketId);
    delete room.names[socketId];
    if (room.players.length === 0) delete this.rooms[id];
  }

  startGame(id){
    const room = this.rooms[id];
    if (!room) return null;
    room.game = new CaboGame(room.players);
    return room.game;
  }

  getRoom(id){ return this.rooms[id]; }
}

module.exports = new RoomManager();
