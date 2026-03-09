import React, { useEffect, useState } from "react";
import Hand from "./Hand";
import Opponent from "./Opponent";

export default function Game({ socket, roomId, name, leave }) {
  const [publicState, setPublicState] = useState(null);
  const [myHand, setMyHand] = useState([]);
  const [drawnCard, setDrawnCard] = useState(null);
  const [names, setNames] = useState({});
  const [logs, setLogs] = useState([]);

  useEffect(()=>{
    socket.on("stateUpdate", (s)=>{
      setPublicState(s);
      setNames(s.names || {});
    });
    socket.on("yourHand", (hand)=> setMyHand(hand || []));
    socket.on("roundResult", (r)=> {
      addLog("Runde vorbei. Gewinner: " + (names[r.winner] || r.winner));
      // keep result UI simple: alert
      alert("Runde beendet. Gewinner: " + (names[r.winner] || r.winner));
    });
    return ()=> {
      socket.off("stateUpdate");
      socket.off("yourHand");
      socket.off("roundResult");
    };
  },[socket, names]);

  function addLog(t){ setLogs(l=>[t, ...l].slice(0,40)); }

  const startGame = () => {
    socket.emit("startGame", roomId, (res)=> {
      if (!res?.ok) alert(res?.error || "konnte nicht starten");
    });
  };

  const peekTwo = () => {
    // we implement client-side peek: request private hand (server already sends full hand)
    addLog("Peek: die ersten 2 Karten sichtbar (privat)");
    // no server action required; you can reveal first two cards locally by mapping revealed true — keep simple: show alert
    const peek = myHand.slice(0,2).map(c=>c.value);
    alert("Deine ersten 2 Karten: " + peek.join(", "));
  };

  const takeFrom = (from) => {
    // from: "deck" or "discard"
    socket.emit("take", { roomId, from }, (res)=>{
      if (!res?.ok) { addLog("Karte konnte nicht genommen werden"); return; }
      setDrawnCard(res.card);
      addLog("Gezogen: " + res.card);
      // Special cards: if drawn and directly discarded by player it will have special effect; UI should let player discard or swap
    });
  };

  const swapWith = (index) => {
    if (drawnCard === null) return alert("Keine gezogene Karte");
    socket.emit("swap", { roomId, index, drawnCard }, (res)=>{
      if (!res?.ok) return alert(res?.error || "Fehler");
      setDrawnCard(null);
    });
  };

  const discardDrawn = () => {
    if (drawnCard === null) return alert("Keine gezogene Karte");
    socket.emit("swap", { roomId, index:-1, drawnCard }, (res)=>{
      if (!res?.ok) return alert("Fehler");
      setDrawnCard(null);
    });
  };

  const removePair = (i1,i2) => {
    socket.emit("removePair", { roomId, idx1:i1, idx2:i2 }, (res)=>{
      if (!res?.ok) return alert(res?.error || "Invalid pair");
    });
  };

  const callCabo = () => socket.emit("callCabo", roomId, ()=>{});

  const showOpponentIds = (pub) => (pub?.players || []).filter(p=>!p.includes(socket.id));

  const currentPlayer = publicState ? publicState.players[publicState.turnIndex] : null;
  const whoName = currentPlayer ? (publicState.names?.[currentPlayer] || currentPlayer) : "—";

  return (
    <div className="card-box game">
      <div className="topbar">
        <div>Raum: {roomId}</div>
        <div>Am Zug: <strong>{whoName}</strong></div>
        <div className="controls">
          <button onClick={startGame}>Spiel starten</button>
          <button onClick={peekTwo}>2 anschauen</button>
          <button onClick={()=>takeFrom("deck")}>Vom Nachziehstapel ziehen</button>
          <button onClick={()=>takeFrom("discard")}>Von Ablage nehmen</button>
          <button onClick={discardDrawn}>Gezogene abwerfen</button>
          <button onClick={callCabo}>Cabo</button>
          <button onClick={leave}>Lobby</button>
        </div>
      </div>

      <div className="board">
        <div className="opponents">
          {(publicState?.players || []).filter(p=>p!==socket.id).map(pid=>(
            <Opponent key={pid} name={publicState?.names?.[pid] || pid} cardsCount={publicState?.playerCardsCount?.[pid] ?? 0} />
          ))}
        </div>

        <div className="center-stack">
          <div className="stack">
            <div className="deck">Deck: {publicState?.deckCount ?? "—"}</div>
            <div className="discard">Ablage: {publicState?.discardTop ?? "—"}</div>
            <div className="drawn">Gezogene: {drawnCard ?? "—"}</div>
          </div>
        </div>
      </div>

      <div className="your-hand">
        <Hand hand={myHand} onSwap={swapWith} onRemovePair={removePair} />
      </div>

      <div className="logs">
        <h4>Logs</h4>
        <ul>{logs.map((l,i)=><li key={i}>{l}</li>)}</ul>
      </div>
    </div>
  );
}
