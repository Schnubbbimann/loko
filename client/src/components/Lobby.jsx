import React, { useEffect, useState } from "react";

export default function Lobby({ socket, setRoomId, name, setName }) {
  const [roomInput, setRoomInput] = useState("");

  useEffect(() => {
    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overflow = prevHtmlOverflow;
    };
  }, []);

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
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        backgroundImage: "url('/Background_Tablet.png')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        overflow: "hidden",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        boxSizing: "border-box",
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
          maxWidth: 560,
          width: "min(560px, calc(100vw - 32px))",
          boxSizing: "border-box",
        }}
      >
        <h2 style={{ marginBottom: 16, marginTop: 0 }}>Neues Spiel</h2>

        <div
          style={{
            display: "flex",
            gap: 8,
            marginBottom: 12,
            flexWrap: "wrap",
          }}
        >
          <input
            placeholder="Dein Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{
              flex: "1 1 220px",
              minWidth: 0,
              padding: 10,
              borderRadius: 8,
              border: "none",
              fontSize: 16,
              boxSizing: "border-box",
              outline: "none",
              WebkitAppearance: "none",
              appearance: "none",
            }}
          />

          <input
            placeholder="Raum-ID"
            value={roomInput}
            onChange={(e) => setRoomInput(e.target.value)}
            style={{
              flex: "1 1 220px",
              minWidth: 0,
              padding: 10,
              borderRadius: 8,
              border: "none",
              fontSize: 16,
              boxSizing: "border-box",
              outline: "none",
              WebkitAppearance: "none",
              appearance: "none",
            }}
          />
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            onClick={createRoom}
            style={{
              flex: "1 1 220px",
              padding: "10px 16px",
              borderRadius: 8,
              border: "none",
              background: "white",
              color: "#FC6B85",
              fontWeight: "bold",
              cursor: "pointer",
              fontSize: 16,
              touchAction: "manipulation",
            }}
          >
            Raum erstellen
          </button>

          <button
            onClick={joinRoom}
            style={{
              flex: "1 1 220px",
              padding: "10px 16px",
              borderRadius: 8,
              border: "none",
              background: "white",
              color: "#FC6B85",
              fontWeight: "bold",
              cursor: "pointer",
              fontSize: 16,
              touchAction: "manipulation",
            }}
          >
            Beitreten
          </button>
        </div>

        <p style={{ marginTop: 12, color: "#ffe3ea", fontSize: 14, marginBottom: 0 }}>
          Tipp: Teile die Raum-ID mit deinem Freund; beide müssen im selben Raum sein bevor das Spiel gestartet wird.
        </p>
      </div>
    </div>
  );
}
