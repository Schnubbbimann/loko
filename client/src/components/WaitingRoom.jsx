import React, { useEffect, useState } from "react";

export default function WaitingRoom({
  socket,
  roomId,
  name,
  onLeave,
  onStart,
}) {
  const [players, setPlayers] = useState([]);
  const [namesMap, setNamesMap] = useState({});

  useEffect(() => {
    // Wenn jemand joint oder leaved
    const handleRoomUpdate = (data) => {
      if (!data) return;

      setNamesMap(data.names || {});
      setPlayers(Object.values(data.names || {}));
    };

    socket.on("roomUpdate", handleRoomUpdate);

    // 🔥 WICHTIG:
    // Direkt beim Betreten aktuellen Raumzustand holen
    socket.emit("roomInfo", roomId, (res) => {
      if (res?.ok) {
        setNamesMap(res.names || {});
        setPlayers(Object.values(res.names || {}));
      }
    });

    return () => {
      socket.off("roomUpdate", handleRoomUpdate);
    };
  }, [socket, roomId]);

  const startGame = () => {
    if (players.length < 2) return;

    socket.emit("startGame", roomId, (res) => {
      if (res?.ok) {
        if (onStart) onStart();
      } else {
        alert(res?.error || "Konnte nicht starten");
      }
    });
  };

  return (
    <div className="card-box">
      <h2>Wartebereich — Raum {roomId}</h2>

      <div style={{ marginTop: 10 }}>
        <strong>Spieler im Raum:</strong>
        <ul>
          {players.length > 0 ? (
            players.map((p, i) => <li key={i}>{p}</li>)
          ) : (
            <li>Warte auf Spieler...</li>
          )}
        </ul>
      </div>

      <div style={{ marginTop: 15 }}>
        {players.length < 2 ? (
          <div style={{ color: "#777" }}>
            Warte auf zweiten Spieler...
          </div>
        ) : (
          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={startGame}
              style={{
                background: "#16a34a",
                color: "white",
                padding: "8px 12px",
                borderRadius: 8,
              }}
            >
              Spiel starten
            </button>

            <button onClick={onLeave}>
              Zurück zur Lobby
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
