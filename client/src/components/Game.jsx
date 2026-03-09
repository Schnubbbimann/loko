import React, { useEffect, useState } from "react";
import Hand from "./Hand";
import Opponent from "./Opponent";

export default function Game({ socket, roomId, name, leave }) {
  const [publicState, setPublicState] = useState(null);
  const [myHand, setMyHand] = useState([]);
  const [drawnCard, setDrawnCard] = useState(null);
  const [revealedIds, setRevealedIds] = useState(new Set());

  useEffect(() => {
    console.log("Game mounted for room:", roomId);

    const handleState = (state) => {
      console.log("stateUpdate received:", state);
      setPublicState(state);
    };

    const handleHand = (hand) => {
      console.log("yourHand received:", hand);
      setMyHand(hand || []);
    };

    const handleGameStarted = () => {
      console.log("gameStarted received");
    };

    socket.on("stateUpdate", handleState);
    socket.on("yourHand", handleHand);
    socket.on("gameStarted", handleGameStarted);

    // 🔥 WICHTIG: sofort aktuellen Zustand holen
    socket.emit("roomInfo", roomId, (res) => {
      console.log("roomInfo response:", res);
      if (res?.ok && res.publicState) {
        setPublicState(res.publicState);
      }
    });

    return () => {
      socket.off("stateUpdate", handleState);
      socket.off("yourHand", handleHand);
      socket.off("gameStarted", handleGameStarted);
    };
  }, [socket, roomId]);

  const takeFrom = (from) => {
    socket.emit("take", { roomId, from }, (res) => {
      if (res?.ok) {
        setDrawnCard(res.card);
      }
    });
  };

  const swapWith = (index) => {
    if (drawnCard == null) return;

    socket.emit(
      "swap",
      { roomId, index, drawnCard },
      (res) => {
        if (res?.ok) {
          setDrawnCard(null);
        }
      }
    );
  };

  const discardDrawn = () => {
    if (drawnCard == null) return;

    socket.emit(
      "swap",
      { roomId, index: -1, drawnCard },
      (res) => {
        if (res?.ok) {
          setDrawnCard(null);
        }
      }
    );
  };

  const peekTwo = () => {
    if (!myHand.length) return;

    const ids = myHand.slice(0, 2).map((c) => c.id);
    setRevealedIds(new Set(ids));
  };

  const currentPlayer =
    publicState?.players?.[publicState.turnIndex] || null;

  const currentName =
    publicState?.names?.[currentPlayer] || "—";

  return (
    <div className="card-box">
      <h2>Spiel</h2>

      <div>
        <strong>Am Zug: {currentName}</strong>
      </div>

      <div style={{ marginTop: 10 }}>
        <button onClick={peekTwo}>2 Karten anschauen</button>
        <button onClick={() => takeFrom("deck")}>
          Nachziehstapel ({publicState?.deckCount ?? 0})
        </button>
        <button onClick={() => takeFrom("discard")}>
          Ablage ({publicState?.discardTop ?? "—"})
        </button>
        <button onClick={discardDrawn}>
          Gezogene abwerfen
        </button>
        <button onClick={leave}>Zur Lobby</button>
      </div>

      {/* Gegner oben */}
      <div style={{ marginTop: 20 }}>
        {(publicState?.players || [])
          .filter((p) => p !== socket.id)
          .map((p) => (
            <Opponent
              key={p}
              name={publicState?.names?.[p]}
              count={publicState?.playerCardsCount?.[p]}
            />
          ))}
      </div>

      {/* Eigene Karten unten */}
      <div style={{ marginTop: 20 }}>
        <Hand
          hand={myHand}
          onSwap={swapWith}
          revealedIds={revealedIds}
        />
      </div>

      <div style={{ marginTop: 10 }}>
        Gezogene Karte: {drawnCard ?? "—"}
      </div>
    </div>
  );
}
