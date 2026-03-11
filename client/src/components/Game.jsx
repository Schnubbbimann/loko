import React, { useEffect, useState } from "react";

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
  /* ================= SPECIAL ================= */

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
    if (gameOver) return;
    socket.emit("take", { roomId, from }, (res) => {
      if (res?.ok) setDrawnCard(res.card);
    });
  };

  const swapWith = (index) => {
    if (gameOver) return;
    if (!drawnCard) return;
    socket.emit("swap", { roomId, index, drawnCard }, () => {
      setDrawnCard(null);
    });
  };

  const discardDrawn = () => {
    if (gameOver) return;
    if (!drawnCard) return;
    socket.emit("swap", { roomId, index: -1, drawnCard }, () => {
      setDrawnCard(null);
    });
  };

  const currentPlayer =
    publicState?.players?.[publicState.turnIndex] || null;

  const currentName =
    publicState?.names?.[currentPlayer] || "—";

  const opponentId =
    publicState?.players?.find(p => p !== socket.id);

  const myHasDrawn =
    publicState?.playerHasDrawn?.[socket.id] ?? false;

  return (
    <div style={{
      height: "100vh",
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-between",
      padding: 30,
      background: "#f3f3f3"
    }}>

      {/* TOP */}
      <div style={{ textAlign: "center" }}>
        <h3>Am Zug: {currentName}</h3>

        <div style={{
          display: "flex",
          justifyContent: "center",
          gap: 10,
          marginTop: 10
        }}>
          <button onClick={peekTwo} disabled={initialPeekDone || gameOver}>
            2 Karten anschauen
          </button>
          <button onClick={() => takeFrom("deck")} disabled={gameOver}>
            Nachziehstapel ({publicState?.deckCount ?? 0})
          </button>
          <button onClick={() => takeFrom("discard")} disabled={gameOver}>
            Ablage ({publicState?.discardTop ?? "—"})
          </button>
          <button onClick={discardDrawn} disabled={gameOver}>
            Abwerfen
          </button>
        </div>
      </div>

     {/* Gegner */}
<div style={{ marginTop: 20 }}>
  <h3>{publicState?.names?.[opponentId]}</h3>

  <div style={{ display: "flex", gap: 20, justifyContent: "center" }}>
    {Array.from({
      length: publicState?.playerCardsCount?.[opponentId] ?? 4
    }).map((_, i) => {

      const isSelectable =
        special === "peekOpponent" ||
        (special === "swapOpponent" && selectedOwn !== null);

      return (
        <div
          key={i}
          onClick={() => {
            if (!isSelectable || gameOver) return;

            if (special === "peekOpponent") {
              handleOpponentPeek(i);
            }

            if (special === "swapOpponent") {
              handleSwapSelectOpponent(i);
            }
          }}
          style={{
            width: 70,
            height: 110,
            background: "#bbb",
            borderRadius: 12,
            border: isSelectable ? "3px solid gold" : "none",
            cursor: isSelectable ? "pointer" : "default"
          }}
        />
      );
    })}
  </div>
</div>
      {/* MITTE */}
      <div style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        gap: 120
      }}>
        <div style={{
          width: 90,
          height: 140,
          background: "#999",
          borderRadius: 14
        }} />

        <div style={{
          width: 90,
          height: 140,
          background: "#fff",
          borderRadius: 14,
          border: "2px solid #bbb",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 24
        }}>
          {publicState?.discardTop ?? ""}
        </div>

        <div style={{
          display: "flex",
          flexDirection: "column",
          gap: 20
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

  {/* Eigene Karten */}
<div style={{ marginTop: 20 }}>
  <h3>Dein Blatt</h3>

  <div style={{ display: "flex", gap: 30, justifyContent: "center" }}>
    {myHand.map((c, i) => {

      const revealed =
        revealedIds.has(c.id) || c.revealed;

      const isClaimSelected =
        claimSelection.includes(i);

      const isSelectable =
        special === "peekOwn" ||
        (special === "swapOpponent" && selectedOwn === null);

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
            background: isClaimSelected ? "#ffe082" : "#ddd",
            border: isSelectable ? "3px solid gold" : "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 28,
            cursor: gameOver ? "default" : "pointer"
          }}
        >
          {revealed ? c.value : "verdeckt"}
        </div>
      );
    })}
  </div>
</div>

      {/* gezogene Karte sichtbar anzeigen */}
<div style={{ marginTop: 15, textAlign: "center", fontSize: 18 }}>
  Gezogene Karte: {drawnCard ? (drawnCard.value ?? drawnCard) : "—"}
</div>

      {/* RESULT */}
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

    </div>
  );
}
