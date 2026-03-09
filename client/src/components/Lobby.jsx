import React, { useEffect, useState } from "react";

export default function Lobby({ socket, setRoomId, name, setName }) {
  const [roomInput, setRoomInput] = useState("");
  const [players, setPlayers] = useState([]);

  useEffect(() => {
    const handler = (data) => {
      setPlayers(Object.values(data.names || {}));
    };
    socket.on("roomUpdate", handler);
    return () => socket.off("roomUpdate", handler);
  }, [socket]);

  const createRoom = () => {
    if (!roomInput || !name) return alert("Name & Raum-ID eingeben");
    socket.emit("createRoom", { roomId: roomInput, name }, (res) => {
      if (res?.ok) setRoomId(roomInput);
    });
  };

  const joinRoom = () => {
    if (!roomInput || !name) return alert("Name & Raum-ID eingeben");
    socket.emit("joinRoom", { roomId: roomInput, name }, (res) => {
      if (res?.ok) setRoomId(roomInput);
    });
  };

  const startGame = () => {
    socket.emit("startGame", roomInput);
  };

  return (
    <div className="card-box">
      <h2>Lobby</h2>

      <input
        placeholder="Dein Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />

      <input
        placeholder="Raum-ID"
        value={roomInput}
        onChange={(e) => setRoomInput(e.target.value)}
      />

      <div>
        <button onClick={createRoom}>Raum erstellen</button>
        <button onClick={joinRoom}>Beitreten</button>
      </div>

      <div style={{ marginTop: 10 }}>
        Spieler: {players.length ? players.join(", ") : "—"}
      </div>

      {players.length === 2 && (
        <button
          style={{ marginTop: 15, background: "#16a34a", color: "white" }}
          onClick={startGame}
        >
          Spiel starten
        </button>
      )}
    </div>
  );
}
