import React, { useEffect, useState } from "react";

/*
 WaitingRoom:
 - zeigt die Spielernamen (aus roomUpdate)
 - zeigt KEINE Spiel-Buttons solange players < 2
 - sobald players === 2, zeigt ein gemeinsames "Spiel starten" für alle
 - Start sendet startGame an Server; server reply + broadcast gameStarted -> App setzt gameStarted = true
 - "Zurück" erlaubt zum Lobby (client-side)
*/

export default function WaitingRoom({ socket, roomId, name, onLeave, onStart }) {
  const [players, setPlayers] = useState([]);
  const [namesMap, setNamesMap] = useState({});

  useEffect(() => {
    const handler = (data) => {
      if (!data) return;
      setNamesMap(data.names || {});
      setPlayers(Object.values(data.names || {}));
    };

    // get immediate room info if server supports (otherwise rely on roomUpdate)
    socket.on("roomUpdate", handler);

    // ask server to send current roomUpdate (optional event on your server)
    socket.emit("roomInfo", roomId, () => {});

    return () => {
      socket.off("roomUpdate", handler);
    };
  }, [socket, roomId]);

  const startGame = () => {
    // Start only if 2 players
    if (players.length < 2) return;
    socket.emit("startGame", roomId, (res) => {
      if (res && res.ok) {
        // server will emit 'gameStarted', App listens and flips to Game view
        if (onStart) onStart();
      } else {
        alert(res?.error || "Konnte nicht starten");
      }
    });
  };

  return (
    <div className="card-box">
      <h2>Wartebereich — Raum {roomId}</h2>

      <div style={{ marginTop: 8 }}>
        <strong>Du: </strong> {name}
      </div>

      <div style={{ marginTop: 12 }}>
        <strong>Spieler im Raum:</strong>
        <ul>
          {players.length > 0 ? (
            players.map((p, i) => <li key={i}>{p}</li>)
          ) : (
            <li>Warte auf Spieler...</li>
          )}
        </ul>
      </div>

      <div style={{ marginTop: 12 }}>
        {players.length < 2 ? (
          <div style={{ color: "#777" }}>
            Warte auf einen zweiten Spieler — Spiel-Buttons werden erst sichtbar, wenn beide da sind.
          </div>
        ) : (
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={startGame} style={{ background: "#16a34a", color: "white" }}>
              Spiel starten
            </button>
            <button onClick={onLeave}>Zurück zur Lobby</button>
          </div>
        )}
      </div>
    </div>
  );
}
