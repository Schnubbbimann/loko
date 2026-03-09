import React, { useEffect, useState } from "react";

export default function Lobby({ socket, setRoomId, name, setName }) {
  const [roomInput, setRoomInput] = useState("");
  const [players, setPlayers] = useState([]);

  useEffect(()=>{
    const handler = (data) => {
      setPlayers(Object.values(data.names || {}));
    };
    socket.on("roomUpdate", handler);
    return ()=> socket.off("roomUpdate", handler);
  },[socket]);

  const create = () => {
    if (!roomInput || !name) return alert("Name & Raum-ID");
    socket.emit("createRoom", { roomId: roomInput, name }, (res)=>{
      if (res?.ok) setRoomId(roomInput);
      else alert(res?.error || "Fehler");
    });
  };

  const join = () => {
    if (!roomInput || !name) return alert("Name & Raum-ID");
    socket.emit("joinRoom", { roomId: roomInput, name }, (res)=>{
      if (res?.ok) setRoomId(roomInput);
      else alert(res?.error || "Fehler");
    });
  };

  return (
    <div className="card-box lobby">
      <h2>Lobby</h2>
      <input placeholder="Name" value={name} onChange={e=>setName(e.target.value)} />
      <input placeholder="Raum-ID" value={roomInput} onChange={e=>setRoomInput(e.target.value)} />
      <div className="buttons">
        <button onClick={create}>Raum erstellen</button>
        <button onClick={join}>Beitreten</button>
      </div>
      <div>Spieler: {players.length ? players.join(", ") : "—"}</div>
      <p>Tip: beide Spieler müssen im selben Raum sein, bevor Spielstart.</p>
    </div>
  );
}
