import React, { useEffect, useState } from "react";
import Hand from "./Hand";
import Opponent from "./Opponent";

export default function Game({ socket, roomId, leave }) {
  const [publicState, setPublicState] = useState(null);
  const [myHand, setMyHand] = useState([]);
  const [drawnCard, setDrawnCard] = useState(null);
  const [revealedIds, setRevealedIds] = useState(new Set());

  const [special, setSpecial] = useState(null);
  const [selectedOwn, setSelectedOwn] = useState(null);

  // 🔥 Neue States für Startkarten
  const [initialPeekMode, setInitialPeekMode] = useState(false);
  const [initialPeekSelection, setInitialPeekSelection] = useState([]);
  const [initialPeekDone, setInitialPeekDone] = useState(false);

  /* ================= SOCKET ================= */

  useEffect(() => {
    socket.on("stateUpdate", setPublicState);
    socket.on("yourHand", setMyHand);

    socket.on("specialAction", (data) => {
      setSpecial(data.type);
    });

    socket.on("revealOwn", (d) => {
      alert("Deine Karte: " + d.value);
    });

    socket.on("revealOpponent", (d) => {
      alert("Gegnerkarte: " + d.value);
    });

    socket.emit("roomInfo", roomId, (res) => {
      if (res?.ok && res.publicState) {
        setPublicState(res.publicState);
      }
    });

    return () => {
      socket.off("stateUpdate");
      socket.off("yourHand");
      socket.off("specialAction");
      socket.off("revealOwn");
      socket.off("revealOpponent");
    };
  }, [socket, roomId]);

  /* ================= STARTKARTEN ================= */

  const peekTwo = () => {
    if (initialPeekDone) return;
    setInitialPeekMode(true);
    setInitialPeekSelection([]);
  };

  const handleInitialPeekClick = (cardId) => {
    if (!initialPeekMode) return;
    if (initialPeekSelection.includes(cardId)) return;

    const newSelection = [...initialPeekSelection, cardId];
    setInitialPeekSelection(newSelection);

    if (newSelection.length === 2) {
      setRevealedIds(new Set(newSelection));

      setTimeout(() => {
        setRevealedIds(new Set());
        setInitialPeekMode(false);
        setInitialPeekDone(true);
      }, 2000);
    }
  };

  /* ================= NORMAL ACTIONS ================= */

  const takeFrom = (from) => {
    socket.emit("take", { roomId, from }, (res) => {
      if (res?.ok) setDrawnCard(res.card);
    });
  };

  const swapWith = (index) => {
    if (drawnCard == null) return;
    socket.emit("swap", { roomId, index, drawnCard }, () => {
      setDrawnCard(null);
    });
  };

  const discardDrawn = () => {
    if (drawnCard == null) return;
    socket.emit("swap", { roomId, index: -1, drawnCard }, () => {
      setDrawnCard(null);
    });
  };

  /* ================= SPECIAL ================= */

  const handleOwnPeek = (index) => {
    socket.emit("specialResolve", {
      roomId,
      payload: { index },
    });
    setSpecial(null);
  };

  const handleOpponentPeek = (index) => {
    socket.emit("specialResolve", {
      roomId,
      payload: { index },
    });
    setSpecial(null);
  };

  const handleSwapSelectOwn = (index) => {
    setSelectedOwn(index);
  };

  const handleSwapSelectOpponent = (index) => {
    socket.emit("specialResolve", {
      roomId,
      payload: { ownIndex: selectedOwn, oppIndex: index },
    });
    setSelectedOwn(null);
    setSpecial(null);
  };

  /* ================= RENDER ================= */

  const currentPlayer =
    publicState?.players?.[publicState.turnIndex] || null;

  const currentName =
    publicState?.names?.[currentPlayer] || "—";

  const opponentId =
    publicState?.players?.find((p) => p !== socket.id);

  return (
    <div className="card-box">
      <h2>Spiel</h2>

      <div>
        <strong>Am Zug: {currentName}</strong>
      </div>

      <div style={{ marginTop: 10 }}>
        <button
          onClick={peekTwo}
          disabled={initialPeekDone}
        >
          2 Karten anschauen
        </button>

        <button onClick={() => takeFrom("deck")}>
          Nachziehstapel ({publicState?.deckCount ?? 0})
        </button>

        <button onClick={() => takeFrom("discard")}>
          Ablage ({publicState?.discardTop ?? "—"})
        </button>

        <button onClick={discardDrawn}>
          Gezogene abwerfen
        </button>

        <button onClick={leave}>
          Zur Lobby
        </button>
      </div>

      {/* Gegner */}
      <div style={{ marginTop: 20 }}>
        <h3>{publicState?.names?.[opponentId]}</h3>
        <div style={{ display: "flex", gap: 10 }}>
          {Array.from({
            length:
              publicState?.playerCardsCount?.[opponentId] ?? 4,
          }).map((_, i) => (
            <div key={i} style={{ textAlign: "center" }}>
              <div
                style={{
                  width: 50,
                  height: 70,
                  background: "#ddd",
                  borderRadius: 8,
                }}
              />

              {special === "peekOpponent" && (
                <button onClick={() => handleOpponentPeek(i)}>
                  Anschauen
                </button>
              )}

              {special === "swapOpponent" &&
                selectedOwn !== null && (
                  <button
                    onClick={() =>
                      handleSwapSelectOpponent(i)
                    }
                  >
                    Tauschen
                  </button>
                )}
            </div>
          ))}
        </div>
      </div>

      {/* Eigene Karten */}
      <div style={{ marginTop: 20 }}>
        <h3>Dein Blatt</h3>
        <div style={{ display: "flex", gap: 10 }}>
          {myHand.map((c, i) => {
            const revealed =
              revealedIds.has(c.id) || c.revealed;

            return (
              <div key={c.id} style={{ textAlign: "center" }}>
                <div
                  style={{
                    border: "1px solid black",
                    width: 60,
                    height: 80,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 8,
                    background: "#fff",
                    cursor: "pointer",
                  }}
                  onClick={() => {
                    if (initialPeekMode) {
                      handleInitialPeekClick(c.id);
                    } else {
                      swapWith(i);
                    }
                  }}
                >
                  {revealed ? c.value : "verdeckt"}
                </div>

                {special === "peekOwn" && (
                  <button onClick={() => handleOwnPeek(i)}>
                    Anschauen
                  </button>
                )}

                {special === "swapOpponent" &&
                  selectedOwn === null && (
                    <button
                      onClick={() =>
                        handleSwapSelectOwn(i)
                      }
                    >
                      Auswählen
                    </button>
                  )}
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ marginTop: 10 }}>
        Gezogene Karte: {drawnCard ?? "—"}
      </div>
    </div>
  );
}
