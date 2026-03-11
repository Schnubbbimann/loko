import React, { useEffect, useState } from "react";

export default function Game({ socket, roomId, leave }) {
  const [publicState, setPublicState] = useState(null);
  const [myHand, setMyHand] = useState([]);
  const [drawnCard, setDrawnCard] = useState(null);
  const [revealedIds, setRevealedIds] = useState(new Set());

  const [special, setSpecial] = useState(null);
  const [selectedOwn, setSelectedOwn] = useState(null);

  // Startkarten
  const [initialPeekMode, setInitialPeekMode] = useState(false);
  const [initialPeekSelection, setInitialPeekSelection] = useState([]);
  const [initialPeekDone, setInitialPeekDone] = useState(false);

  // Claim Pair
  const [claimMode, setClaimMode] = useState(false);
  const [claimSelection, setClaimSelection] = useState([]);

  // Round result (after cabo/finish)
  const [roundResult, setRoundResult] = useState(null);
  const [gameOver, setGameOver] = useState(false);

  /* ================= SOCKET ================= */

  useEffect(() => {
    socket.on("stateUpdate", setPublicState);
    socket.on("yourHand", setMyHand);

    socket.on("specialAction", (data) => {
      setDrawnCard(null);
      setSpecial(data.type);
    });

    socket.on("revealOwn", (d) => {
      alert("Deine Karte: " + d.value);
    });

    socket.on("revealOpponent", (d) => {
      alert("Gegnerkarte: " + d.value);
    });

    socket.on("claimResult", (d) => {
      if (d.correct)
        alert("Richtig! Zwei gleiche Karten entfernt.");
      else alert("Falsch! Strafkarte erhalten.");
      setClaimMode(false);
      setClaimSelection([]);
    });

    socket.on("roundResult", (result) => {
      setRoundResult(result);
      setGameOver(true);
    });

    socket.emit("roomInfo", roomId, (res) => {
      if (res?.ok && res.publicState)
        setPublicState(res.publicState);
    });

    return () => {
      socket.off("stateUpdate");
      socket.off("yourHand");
      socket.off("specialAction");
      socket.off("revealOwn");
      socket.off("revealOpponent");
      socket.off("claimResult");
      socket.off("roundResult");
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

    const newSel = [...initialPeekSelection, cardId];
    setInitialPeekSelection(newSel);

    if (newSel.length === 2) {
      setRevealedIds(new Set(newSel));
      setTimeout(() => {
        setRevealedIds(new Set());
        setInitialPeekMode(false);
        setInitialPeekDone(true);
      }, 2000);
    }
  };

  /* ================= NORMAL ACTIONS ================= */

  const takeFrom = (from) => {
    if (gameOver) return;
    socket.emit("take", { roomId, from }, (res) => {
      if (res?.ok) setDrawnCard(res.card);
    });
  };

  const swapWith = (index) => {
    if (gameOver) return;
    if (drawnCard == null) return;
    socket.emit("swap", { roomId, index, drawnCard }, () => {
      setDrawnCard(null);
    });
  };

  const discardDrawn = () => {
    if (gameOver) return;
    if (drawnCard == null) return;
    socket.emit("swap", { roomId, index: -1, drawnCard }, () => {
      setDrawnCard(null);
    });
  };

  /* ================= CLAIM PAIR ================= */

  const startClaimMode = () => {
    if (gameOver) return;
    setClaimMode(true);
    setClaimSelection([]);
  };

  const toggleClaim = (index) => {
    if (gameOver) return;
    if (!claimMode) return;

    if (claimSelection.includes(index)) {
      setClaimSelection(claimSelection.filter(i => i !== index));
      return;
    }

    if (claimSelection.length >= 2) return;

    const newSel = [...claimSelection, index];
    setClaimSelection(newSel);

    if (newSel.length === 2) {
      socket.emit("claimResolve", {
        roomId,
        idxA: newSel[0],
        idxB: newSel[1]
      });
    }
  };

  /* ================= SPECIAL ================= */

  const handleOwnPeek = (index) => {
    if (gameOver) return;
    socket.emit("specialResolve", {
      roomId,
      payload: { index }
    });
    setSpecial(null);
  };

  const handleOpponentPeek = (index) => {
    if (gameOver) return;
    socket.emit("specialResolve", {
      roomId,
      payload: { index }
    });
    setSpecial(null);
  };

  const handleSwapSelectOwn = (index) => {
    if (gameOver) return;
    setSelectedOwn(index);
  };

  const handleSwapSelectOpponent = (index) => {
    if (gameOver) return;
    socket.emit("specialResolve", {
      roomId,
      payload: { ownIndex: selectedOwn, oppIndex: index }
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
    publicState?.players?.find(p => p !== socket.id);

  // can press CABO only if:
  // - you're current player
  // - you haven't drawn/taken any action this turn (checked via publicState.playerHasDrawn)
  const myHasDrawn =
    publicState?.playerHasDrawn?.[socket.id] ?? false;

  return (
    <div className="card-box">
      <h2>Spiel</h2>

      <div>
        <strong>Am Zug: {currentName}</strong>
      </div>

      <div style={{ marginTop: 10 }}>
        <button
          onClick={peekTwo}
          disabled={initialPeekDone || gameOver}
        >
          2 Karten anschauen
        </button>

        <button onClick={() => takeFrom("deck")} disabled={gameOver}>
          Nachziehstapel ({publicState?.deckCount ?? 0})
        </button>

        <button onClick={() => takeFrom("discard")} disabled={gameOver}>
          Ablage ({publicState?.discardTop ?? "—"})
        </button>

        <button onClick={discardDrawn} disabled={gameOver}>
          Gezogene abwerfen
        </button>

        <button onClick={startClaimMode} disabled={gameOver}>
          Zwei gleiche melden
        </button>

        <button
          disabled={
            // disabled if not your turn or you already did an action this turn or round finished
            publicState?.players?.[publicState.turnIndex] !== socket.id ||
            myHasDrawn ||
            !!roundResult ||
            gameOver
          }
          onClick={() => socket.emit("callCabo", roomId, (res) => {
            // optional: handle cb
            if (!res?.ok) {
              // console.log("callCabo failed", res);
            }
          })}
        >
          CABO
        </button>

        <button onClick={leave} disabled={false}>
          Zur Lobby
        </button>
      </div>

      {/* Gegner */}
      <div style={{ marginTop: 20 }}>
        <h3>{publicState?.names?.[opponentId]}</h3>
        <div style={{ display: "flex", gap: 10 }}>
          {Array.from({
            length: publicState?.playerCardsCount?.[opponentId] ?? 4
          }).map((_, i) => (
            <div key={i}>
              <div style={{
                width: 50,
                height: 70,
                background: "#ddd",
                borderRadius: 8
              }} />

              {special === "peekOpponent" && !gameOver && (
                <button onClick={() => handleOpponentPeek(i)}>
                  Anschauen
                </button>
              )}

              {special === "swapOpponent" && selectedOwn !== null && !gameOver && (
                <button onClick={() => handleSwapSelectOpponent(i)}>
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

            const isClaimSelected =
              claimSelection.includes(i);

            return (
              <div key={c.id}>
                <div
                  style={{
                    border: "1px solid black",
                    width: 60,
                    height: 80,
                    borderRadius: 8,
                    background: isClaimSelected
                      ? "#ffe082"
                      : "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: gameOver ? "default" : "pointer"
                  }}
                  onClick={() => {
                    if (gameOver) return;
                    if (initialPeekMode)
                      handleInitialPeekClick(c.id);
                    else if (claimMode)
                      toggleClaim(i);
                    else
                      swapWith(i);
                  }}
                >
                  {revealed ? c.value : "verdeckt"}
                </div>

                {special === "peekOwn" && !gameOver && (
                  <button onClick={() => handleOwnPeek(i)}>
                    Anschauen
                  </button>
                )}

                {special === "swapOpponent" && selectedOwn === null && !gameOver && (
                  <button onClick={() => handleSwapSelectOwn(i)}>
                    Auswählen
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ marginTop: 10 }}>
        Gezogene Karte: {drawnCard ? drawnCard.value : "—"}
      </div>

      {/* Winning / round result panel */}
      {gameOver && roundResult && (
        <div style={{
          marginTop: 20,
          padding: 16,
          borderRadius: 8,
          background: "#fff3cd",
          border: "1px solid #ffe08a"
        }}>
          <h3>🎉 Runde beendet 🎉</h3>

          {Object.entries(roundResult.results).map(([p, pts]) => (
            <div key={p}>
              {publicState?.names?.[p]}: {pts} Punkte
            </div>
          ))}

          <div style={{ marginTop: 8 }}>
            <strong>
              Gewinner: {publicState?.names?.[roundResult.winner]}
            </strong>
          </div>

          <div style={{ marginTop: 12 }}>
            

            <button style={{ marginLeft: 8 }} onClick={() => {
              // leave to lobby if user wants
              setRoundResult(null);
              setGameOver(false);
              leave();
            }}>
              Zur Lobby
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
