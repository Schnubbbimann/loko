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
    const handleRoomUpdate = (data) => {
      if (!data) return;
      setNamesMap(data.names || {});
      setPlayers(Object.values(data.names || {}));
    };

    socket.on("roomUpdate", handleRoomUpdate);

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
    <div
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        backgroundImage: "url('/Tablet_normal.png')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        overflow: "hidden",
      }}
    >
      <div
        className="card-box"
        style={{
          background: "#2CACAC",
          color: "white",
          padding: 30,
          borderRadius: 16,
          boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
          maxWidth: 500,
          width: "90%",
        }}
      >
        <h2 style={{ marginBottom: 16 }}>
          Wartebereich — Raum {roomId}
        </h2>

        <div style={{ marginTop: 10 }}>
          <strong>Spieler im Raum:</strong>
          <ul style={{ marginTop: 8 }}>
            {players.length > 0 ? (
              players.map((p, i) => <li key={i}>{p}</li>)
            ) : (
              <li>Warte auf Spieler...</li>
            )}
          </ul>
        </div>

        <div style={{ marginTop: 20 }}>
          {players.length < 2 ? (
            <div style={{ color: "#dffafa" }}>
              Warte auf zweiten Spieler...
            </div>
          ) : (
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={startGame}
                style={{
                  flex: 1,
                  background: "white",
                  color: "#2CACAC",
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "none",
                  fontWeight: "bold",
                  cursor: "pointer",
                }}
              >
                Spiel starten
              </button>

              <button
                onClick={onLeave}
                style={{
                  flex: 1,
                  background: "white",
                  color: "#2CACAC",
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "none",
                  fontWeight: "bold",
                  cursor: "pointer",
                }}
              >
                Zurück zur Lobby
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
