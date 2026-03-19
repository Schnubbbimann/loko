// src/components/Game.jsx
import "../Game.css";
import React, { useEffect, useState } from "react";

const getCardImage = (value) => {
  return new URL(`../assets/cards/card${value}.jpeg`, import.meta.url).href;
};

const getBackImage = () => {
  return new URL(`../assets/cards/back.jpeg`, import.meta.url).href;
};

const flipStageStyle = {
  width: "100%",
  height: "100%",
  perspective: "1000px"
};

const flipInnerStyle = (flipped) => ({
  width: "100%",
  height: "100%",
  position: "relative",
  transformStyle: "preserve-3d",
  transition: "transform 0.45s ease",
  transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)"
});

const flipFaceStyle = {
  position: "absolute",
  inset: 0,
  backfaceVisibility: "hidden",
  WebkitBackfaceVisibility: "hidden",
  width: "100%",
  height: "100%"
};

const flipFrontFaceStyle = {
  ...flipFaceStyle,
  transform: "rotateY(180deg)"
};

export default function Game({ socket, roomId, leave }) {
  const [publicState, setPublicState] = useState(null);
  const [myHand, setMyHand] = useState([]);
  const [drawnCard, setDrawnCard] = useState(null);
  const [revealedIds, setRevealedIds] = useState(new Set());

  const [special, setSpecial] = useState(null);
  const [selectedOwn, setSelectedOwn] = useState(null);

  const [initialPeekMode, setInitialPeekMode] = useState(false);
  const [initialPeekSelection, setInitialPeekSelection] = useState([]);
  const [initialPeekDone, setInitialPeekDone] = useState(false);

  const [claimMode, setClaimMode] = useState(false);
  const [claimSelection, setClaimSelection] = useState([]);

  const [roundResult, setRoundResult] = useState(null);
  const [gameOver, setGameOver] = useState(false);

  const [tempReveals, setTempReveals] = useState([]);
  const [caboBanner, setCaboBanner] = useState(null);

  const [drawSource, setDrawSource] = useState(null);
  const [drawAnim, setDrawAnim] = useState(false);

  const [discardAnimCard, setDiscardAnimCard] = useState(null);
  const [discardAnim, setDiscardAnim] = useState(false);

  useEffect(() => {
    socket.on("stateUpdate", setPublicState);
    socket.on("yourHand", setMyHand);

    socket.on("specialAction", (data) => {
      setDrawnCard(null);
      setDrawSource(null);
      setDrawAnim(false);
      setSpecial(data.type);
    });

    socket.on("claimResult", (d) => {
      if (d.correct) alert("Richtig! Zwei gleiche Karten entfernt.");
      else alert("Falsch! Strafkarte erhalten.");
      setClaimMode(false);
      setClaimSelection([]);
    });

    socket.on("roundResult", (result) => {
      setRoundResult(result);
      setGameOver(true);
    });

    socket.on("tempReveal", (payload) => {
      if (!payload || !Array.isArray(payload.cards)) return;

      const cardsWithOwner = payload.cards.map((c) => ({
        ...c,
        by: payload.by
      }));

      setTempReveals(cardsWithOwner);
      setTimeout(() => setTempReveals([]), 2000);
    });

    socket.on("caboCalled", (data) => {
      setCaboBanner(data || { by: null });
      setTimeout(() => setCaboBanner(null), 2000);
    });

    socket.emit("roomInfo", roomId, (res) => {
      if (res?.ok && res.publicState) setPublicState(res.publicState);
    });

    return () => {
      socket.off("stateUpdate");
      socket.off("yourHand");
      socket.off("specialAction");
      socket.off("revealOwn");
      socket.off("revealOpponent");
      socket.off("claimResult");
      socket.off("roundResult");
      socket.off("tempReveal");
      socket.off("caboCalled");
    };
  }, [socket, roomId]);

  const handleOwnPeek = (index) => {
    socket.emit("specialResolve", {
      roomId,
      payload: { index }
    });
    setSpecial(null);
  };

  const handleOpponentPeek = (index) => {
    socket.emit("specialResolve", {
      roomId,
      payload: { index }
    });
    setSpecial(null);
  };

  const handleSwapSelectOwn = (index) => {
    setSelectedOwn(index);
  };

  const handleSwapSelectOpponent = (index) => {
    socket.emit("specialResolve", {
      roomId,
      payload: { ownIndex: selectedOwn, oppIndex: index }
    });
    setSelectedOwn(null);
    setSpecial(null);
  };

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

  const takeFrom = (from) => {
    if (gameOver || !isMyTurn) return;

    socket.emit("take", { roomId, from }, (res) => {
      if (res?.ok) {
        setDrawSource(from);
        setDrawnCard(res.card);
        setDrawAnim(false);
        setTimeout(() => {
          setDrawAnim(true);
        }, 20);
      }
    });
  };

  const swapWith = (index) => {
    if (gameOver) return;
    if (!drawnCard) return;
    socket.emit("swap", { roomId, index, drawnCard }, () => {
      setDrawnCard(null);
      setDrawSource(null);
      setDrawAnim(false);
    });
  };

  const discardDrawn = () => {
    if (gameOver) return;
    if (!drawnCard) return;
    if (discardAnimCard) return;

    setDiscardAnimCard(drawnCard);
    setDiscardAnim(false);

    setTimeout(() => {
      setDiscardAnim(true);
    }, 20);

    setTimeout(() => {
      socket.emit("swap", { roomId, index: -1, drawnCard }, () => {
        setDrawnCard(null);
        setDrawSource(null);
        setDrawAnim(false);
        setDiscardAnimCard(null);
        setDiscardAnim(false);
      });
    }, 280);

    setTimeout(() => {
      setDiscardAnimCard(null);
      setDiscardAnim(false);
    }, 700);
  };

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

  if (!publicState) {
    return <div style={{ padding: 40 }}>Lade Spiel...</div>;
  }

  const currentPlayer = publicState.players?.[publicState.turnIndex] || null;
  const currentName = publicState.names?.[currentPlayer] || "—";
  const opponentId = publicState.players?.find(p => p !== socket.id);
  const myHasDrawn = publicState.playerHasDrawn?.[socket.id] ?? false;
  const isMyTurn = currentPlayer === socket.id;

  const getTempReveal = (playerId, index) => {
    return tempReveals.find(
      r => r.playerId === playerId && Number(r.index) === Number(index)
    );
  };

  const opponentCount = publicState?.playerCardsCount?.[opponentId] ?? 4;
  const uiToServerOpponentIndex = (uiIndex) => opponentCount - 1 - uiIndex;

  return (
    <div className="game-container">

      <div style={{ textAlign: "center" }}>
        <h3>Am Zug: {currentName}</h3>
      </div>

      <div style={{ marginTop: 20 }}>
        <h3>{publicState?.names?.[opponentId]}</h3>

        <div style={{ display: "flex", gap: 20, justifyContent: "center" }}>
          {Array.from({
            length: opponentCount
          }).map((_, i) => {
            const realIndex = uiToServerOpponentIndex(i);

            const isSelectable =
              special === "peekOpponent" ||
              (special === "swapOpponent" && selectedOwn !== null);

            const temp = getTempReveal(opponentId, realIndex);

            const showFace =
              temp?.type === "peek" &&
              temp?.by === socket.id;

            return (
              <div
                key={i}
                onClick={() => {
                  if (!isSelectable || gameOver) return;

                  if (special === "peekOpponent") {
                    handleOpponentPeek(realIndex);
                  }

                  if (special === "swapOpponent") {
                    handleSwapSelectOpponent(realIndex);
                  }
                }}
                style={{
                  width: 70,
                  height: 110,
                  borderRadius: 12,
                  border: temp
                    ? "4px solid gold"
                    : (isSelectable ? "3px solid gold" : "none"),
                  cursor: isSelectable ? "pointer" : "default",
                  overflow: "hidden",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "#bbb"
                }}
              >
                <div style={flipStageStyle}>
                  <div style={flipInnerStyle(showFace)}>
                    <img
                      src={getBackImage()}
                      alt="card back"
                      style={flipFaceStyle}
                    />
                    <img
                      src={showFace ? getCardImage(temp?.value) : getBackImage()}
                      alt="card front"
                      style={flipFrontFaceStyle}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        gap: 120
      }}>
        <div
          onClick={() => {
            if (gameOver || !isMyTurn) return;
            takeFrom("deck");
          }}
          style={{
            width: 90,
            height: 140,
            position: "relative",
            cursor: gameOver || !isMyTurn ? "default" : "pointer"
          }}
        >
          {[2,1,0].map((offset) => (
            <img
              key={offset}
              src={getBackImage()}
              alt="deck"
              style={{
                position: "absolute",
                top: offset * 3,
                left: offset * 3,
                width: "100%",
                height: "100%",
                objectFit: "contain",
                borderRadius: 14,
                boxShadow: "0 6px 12px rgba(0,0,0,0.25)"
              }}
            />
          ))}
        </div>

        <div
          onClick={() => {
  if (gameOver || !isMyTurn) return;

  // 🔥 NEU: wenn Karte gezogen → abwerfen
  if (drawnCard) {
    discardDrawn();
  } else {
    // sonst normal ziehen
    takeFrom("discard");
  }
}}
          style={{
            width: 90,
            height: 140,
            position: "relative",
            cursor: gameOver || !isMyTurn ? "default" : "pointer"
          }}
        >
          {[2,1].map((offset) => (
            <img
              key={"under"+offset}
              src={getBackImage()}
              alt="under"
              style={{
                position: "absolute",
                top: offset * 3,
                left: offset * 3,
                width: "100%",
                height: "100%",
                objectFit: "contain",
                borderRadius: 14,
                opacity: 0.45
              }}
            />
          ))}

          {typeof publicState?.discardTop === "number" ? (
            <img
              src={getCardImage(publicState.discardTop)}
              alt="discard"
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: "100%",
                objectFit: "contain",
                borderRadius: 14,
                boxShadow: "0 6px 15px rgba(0,0,0,0.3)"
              }}
            />
          ) : (
            <img
              src={getBackImage()}
              alt="empty"
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: "100%",
                objectFit: "contain",
                borderRadius: 14
              }}
            />
          )}
        </div>

        <div style={{
          display: "flex",
          flexDirection: "column",
          gap: 20,
          alignItems: "center"
        }}>

          <button
            disabled={
              publicState?.players?.[publicState.turnIndex] !== socket.id ||
              myHasDrawn ||
              gameOver
            }
            onClick={() => socket.emit("callCabo", roomId)}
            style={{
              width: 130,
              height: 130,
              borderRadius: "50%",
              background: "#6f42c1",
              color: "white",
              fontSize: 18,
              border: "none"
            }}
          >
            CABO
          </button>

          <button
            onClick={startClaimMode}
            disabled={gameOver}
            style={{
              padding: "10px 20px",
              borderRadius: 20,
              background: "#6f42c1",
              color: "white",
              border: "none"
            }}
          >
            Doppelt ablegen
          </button>

          <button onClick={leave}>
            Zur Lobby
          </button>
        </div>
      </div>

      <div style={{ marginTop: 20 }}>
        <h3>Dein Blatt</h3>

        <div style={{
          display: "flex",
          gap: 30,
          justifyContent: "center",
          alignItems: "flex-end"
        }}>
          {drawnCard && (
            <div
              style={{
                width: 110,
                height: 170,
                borderRadius: 18,
                overflow: "hidden",
                boxShadow: "0 10px 20px rgba(0,0,0,0.2)",
                transform: drawAnim
                  ? "translateX(0) translateY(0) scale(1)"
                  : drawSource === "discard"
                    ? "translateX(60px) translateY(-10px) scale(0.85)"
                    : "translateX(-90px) translateY(-10px) scale(0.85)",
                opacity: drawAnim ? 1 : 0,
                transition: "transform 0.35s ease, opacity 0.35s ease"
              }}
            >
              <div style={flipStageStyle}>
                <div style={flipInnerStyle(true)}>
                  <img
                    src={getBackImage()}
                    alt="draw back"
                    style={flipFaceStyle}
                  />
                  <img
                    src={getCardImage(drawnCard.value ?? drawnCard)}
                    alt="draw front"
                    style={flipFrontFaceStyle}
                  />
                </div>
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: 30, justifyContent: "center" }}>
            {myHand.map((c, i) => {
              const temp = getTempReveal(socket.id, i);

              const isSelectable =
                special === "peekOwn" ||
                (special === "swapOpponent" && selectedOwn === null);

              const showFace =
                revealedIds.has(c.id) ||
                c.revealed ||
                (temp?.type === "peek" && temp?.by === socket.id);

              return (
                <div
                  key={c.id}
                  onClick={() => {
                    if (gameOver) return;

                    if (initialPeekMode)
                      handleInitialPeekClick(c.id);
                    else if (claimMode)
                      toggleClaim(i);
                    else if (special === "peekOwn")
                      handleOwnPeek(i);
                    else if (special === "swapOpponent" && selectedOwn === null)
                      handleSwapSelectOwn(i);
                    else if (drawnCard)
                      swapWith(i);
                  }}
                  style={{
                    width: 110,
                    height: 170,
                    borderRadius: 18,
                    background: claimSelection.includes(i) ? "#ffe082" : "#ddd",
                    border: temp
                      ? "4px solid gold"
                      : (isSelectable ? "3px solid gold" : "none"),
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: gameOver ? "default" : "pointer",
                    overflow: "hidden"
                  }}
                >
                  <div style={flipStageStyle}>
                    <div style={flipInnerStyle(showFace)}>
                      <img
                        src={getBackImage()}
                        alt="card back"
                        style={flipFaceStyle}
                      />
                      <img
                        src={getCardImage(c.value)}
                        alt="card front"
                        style={flipFrontFaceStyle}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {!initialPeekDone && !gameOver && (
          <div style={{ marginTop: 15, textAlign: "center" }}>
            <button onClick={peekTwo}>
              2 Karten anschauen
            </button>
          </div>
        )}
      </div>

  

      {discardAnimCard && (
        <div
          style={{
            position: "fixed",
            left: "50%",
            top: "78%",
            transform: discardAnim
              ? "translate(-50%, -180px) scale(0.6) rotate(8deg)"
              : "translate(-50%, 0px) scale(1) rotate(0deg)",
            opacity: discardAnim ? 0 : 1,
            transition: "transform 0.35s ease, opacity 0.35s ease",
            zIndex: 9998,
            pointerEvents: "none",
            width: 110,
            height: 170
          }}
        >
          <div style={flipStageStyle}>
            <div style={flipInnerStyle(true)}>
              <img
                src={getBackImage()}
                alt="discard back"
                style={flipFaceStyle}
              />
              <img
                src={getCardImage(discardAnimCard.value)}
                alt="discard front"
                style={flipFrontFaceStyle}
              />
            </div>
          </div>
        </div>
      )}

      {gameOver && roundResult && (
        <div style={{
          position: "absolute",
          top: "30%",
          left: "50%",
          transform: "translate(-50%,-50%)",
          background: "white",
          padding: 30,
          borderRadius: 20,
          boxShadow: "0 10px 40px rgba(0,0,0,0.3)"
        }}>
          <h3>Runde beendet</h3>

          {Object.entries(roundResult.results).map(([p, pts]) => (
            <div key={p}>
              {publicState?.names?.[p]}: {pts} Punkte
            </div>
          ))}

          <div style={{ marginTop: 10 }}>
            <strong>
              Gewinner: {publicState?.names?.[roundResult.winner]}
            </strong>
          </div>

          <div style={{ marginTop: 15 }}>
            <button onClick={() => {
              setRoundResult(null);
              setGameOver(false);
              leave();
            }}>
              Zur Lobby
            </button>
          </div>
        </div>
      )}

      {caboBanner && (
        <div style={{
          position: "fixed",
          top: 20,
          left: "50%",
          transform: "translateX(-50%)",
          background: "rgba(0,0,0,0.85)",
          color: "white",
          padding: "12px 20px",
          borderRadius: 12,
          zIndex: 9999,
          boxShadow: "0 6px 20px rgba(0,0,0,0.4)",
          display: "flex",
          alignItems: "center",
          gap: 12
        }}>
          <strong style={{ fontSize: 18 }}>CABO</strong>
          <span style={{ opacity: 0.9 }}>
            {publicState?.names?.[caboBanner.by] ? `von ${publicState.names[caboBanner.by]}` : ""}
          </span>
        </div>
      )}
    </div>
  );
}
