import React, { useState } from "react";

export default function Lobby({ socket, setRoomId, name, setName }) {
  const [roomInput, setRoomInput] = useState("");

  const createRoom = () => {
    if (!roomInput || !name) return alert("Bitte Name & Raum-ID eingeben");
    // createRoom now expects payload {roomId, name}
    socket.emit("createRoom", { roomId: roomInput, name }, (res) => {
      if (res?.ok) {
        setRoomId(roomInput);
      } else {
        alert(res?.error || "Fehler beim Erstellen");
      }
    });
  };

  const joinRoom = () => {
    if (!roomInput || !name) return alert("Bitte Name & Raum-ID eingeben");
    socket.emit("joinRoom", { roomId: roomInput, name }, (res) => {
      if (res?.ok) setRoomId(roomInput);
      else alert(res?.error || "Fehler beim Beitreten");
    });
  };

  return (
    <div className="card-box lobby">
      <h2>Neues Spiel</h2>
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <input placeholder="Dein Name" value={name} onChange={(e) => setName(e.target.value)} />
        <input placeholder="Raum-ID" value={roomInput} onChange={(e) => setRoomInput(e.target.value)} />
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={createRoom}>Raum erstellen</button>
        <button onClick={joinRoom}>Beitreten</button>
      </div>

      <p style={{ marginTop: 12, color: "#555" }}>
        Tipp: Teile die Raum-ID mit deinem Freund; beide müssen im selben Raum sein bevor das Spiel gestartet wird.
      </p>
    </div>
  );
}
