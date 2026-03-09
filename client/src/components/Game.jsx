import React, { useEffect, useState } from "react";
import Hand from "./Hand";
import Opponent from "./Opponent";

export default function Game({ socket, roomId, name, leave }) {
  const [publicState, setPublicState] = useState(null);
  const [myHand, setMyHand] = useState([]);
  const [drawnCard, setDrawnCard] = useState(null);
  const [revealedIds, setRevealedIds] = useState(new Set());

  useEffect(() => {
    socket.on("stateUpdate", (s) => {
      setPublicState(s);
    });

    socket.on("yourHand", (hand) => {
      setMyHand(hand || []);
    });

    return () => {
      socket.off("stateUpdate");
      socket.off("yourHand");
    };
  }, [socket]);

  const takeFrom = (from) => {
    socket.emit("take", { roomId, from }, (res) => {
      if (res?.ok) setDrawnCard(res.card);
    });
  };

  const swapWith = (index) => {
    if (drawnCard == null) return;
    socket.emit(
      "swap",
      { roomId, index, drawnCard },
      () => setDrawnCard(null)
    );
  };

  const discardDrawn = () => {
    if (drawnCard == null) return;
    socket.emit(
      "swap",
      { roomId, index: -1, drawnCard },
      () => setDrawnCard(null)
    );
  };

  const peekTwo = () => {
    const ids = myHand.slice(0, 2).map((c) => c.id);
    setRevealedIds(new Set(ids));
  };

  const currentPlayer =
    publicState?.players?.[publicState.turnIndex] || null;

  const currentName =
    publicState?.names?.[currentPlayer] || "—";

  return (
    <div className="card-box">
      <div>
        <strong>Am Zug: {currentName}</strong>
      </div>

      <div style={{ marginTop: 10 }}>
        <button onClick={peekTwo}>2 Karten anschauen</button>
        <button onClick={() => takeFrom("deck")}>
          Nachziehstapel ({publicState?.deckCount || 0})
        </button>
        <button onClick={() => takeFrom("discard")}>
          Ablage ({publicState?.discardTop ?? "—"})
        </button>
        <button onClick={discardDrawn}>
          Gezogene abwerfen
        </button>
        <button onClick={leave}>Zur Lobby</button>
      </div>

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
