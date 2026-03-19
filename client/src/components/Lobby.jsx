import React, { useState } from "react";

export default function Lobby({ socket, setRoomId, name, setName }) {
  const [roomInput, setRoomInput] = useState("");

  const createRoom = () => {
    if (!roomInput || !name) return alert("Bitte Name & Raum-ID eingeben");
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
    <div
  style={{
    width: "100vw",
    height: "100vh",
    backgroundImage: "url('/Background_Tablet.png')",
    backgroundSize: "cover",
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
  }}
>
      <div
        className="card-box lobby"
        style={{
          background: "#FC6B85",
          color: "white",
          padding: 30,
          borderRadius: 16,
          boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
          maxWidth: 500,
          width: "100%",
        }}
      >
        <h2 style={{ marginBottom: 16 }}>Neues Spiel</h2>

        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <input
            placeholder="Dein Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{
              flex: 1,
              padding: 10,
              borderRadius: 8,
              border: "none",
            }}
          />
          <input
            placeholder="Raum-ID"
            value={roomInput}
            onChange={(e) => setRoomInput(e.target.value)}
            style={{
              flex: 1,
              padding: 10,
              borderRadius: 8,
              border: "none",
            }}
          />
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={createRoom}
            style={{
              flex: 1,
              padding: "10px 16px",
              borderRadius: 8,
              border: "none",
              background: "white",
              color: "#FC6B85",
              fontWeight: "bold",
              cursor: "pointer",
            }}
          >
            Raum erstellen
          </button>

          <button
            onClick={joinRoom}
            style={{
              flex: 1,
              padding: "10px 16px",
              borderRadius: 8,
              border: "none",
              background: "white",
              color: "#FC6B85",
              fontWeight: "bold",
              cursor: "pointer",
            }}
          >
            Beitreten
          </button>
        </div>

        <p style={{ marginTop: 12, color: "#ffe3ea", fontSize: 14 }}>
          Tipp: Teile die Raum-ID mit deinem Freund; beide müssen im selben Raum
          sein bevor das Spiel gestartet wird.
        </p>
      </div>
    </div>
  );
}
