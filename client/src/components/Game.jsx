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
      // keep revealed flags for persistent revealed cards
      setRevealedIds((prev) => {
        const next = new Set();
        (hand || []).forEach((c) => {
          if (prev.has(c.id) || c.revealed) next.add(c.id);
        });
        return next;
      });
    };

    const handleGameStarted = () => {
      console.log("gameStarted received");
    };

    // Special handlers
    const handleSpecial = (data) => {
      console.log("specialAction received:", data);
      // data: { type: "peekOwn"|"peekOpponent"|"swapOpponent" }
      if (data.type === "peekOwn") {
        const idx = parseInt(
          prompt("Spezial: Welche deiner Karten anschauen? Index 0-3"),
          10
        );
        if (!Number.isFinite(idx)) return;
        socket.emit("specialResolve", { roomId, payload: { index: idx } }, (res) => {
          console.log("specialResolve resp:", res);
        });
      } else if (data.type === "peekOpponent") {
        const idx = parseInt(
          prompt("Spezial: Welche Gegnerkarte anschauen? Index 0-3"),
          10
        );
        if (!Number.isFinite(idx)) return;
        socket.emit("specialResolve", { roomId, payload: { index: idx } }, (res) => {
          console.log("specialResolve resp:", res);
        });
      } else if (data.type === "swapOpponent") {
        const ownIndex = parseInt(
          prompt("Spezial: Welche deiner Karten tauschen? Index 0-3"),
          10
        );
        const oppIndex = parseInt(
          prompt("Spezial: Welche Gegnerkarte tauschen? Index 0-3"),
          10
        );
        if (!Number.isFinite(ownIndex) || !Number.isFinite(oppIndex)) return;
        socket.emit(
          "specialResolve",
          { roomId, payload: { ownIndex, oppIndex } },
          (res) => {
            console.log("specialResolve swap resp:", res);
          }
        );
      }
    };

    const handleRevealOwn = (d) => {
      alert("Spezial — Deine Karte: " + d.value);
      // optionally reveal locally (only your UI)
      // find card id(s) with that value and mark revealed — but server will also send yourHand after broadcast
    };

    const handleRevealOpponent = (d) => {
      alert("Spezial — Gegnerkarte: " + d.value);
    };

    socket.on("stateUpdate", handleState);
    socket.on("yourHand", handleHand);
    socket.on("gameStarted", handleGameStarted);

    socket.on("specialAction", handleSpecial);
    socket.on("revealOwn", handleRevealOwn);
    socket.on("revealOpponent", handleRevealOpponent);

    // IMPORTANT: Immediately request current room info (publicState + yourHand)
    socket.emit("roomInfo", roomId, (res) => {
      console.log("roomInfo response:", res);
      if (res?.ok && res.publicState) {
        setPublicState(res.publicState);
      }
      // server will also emit 'yourHand' if game exists
    });

    return () => {
      socket.off("stateUpdate", handleState);
      socket.off("yourHand", handleHand);
      socket.off("gameStarted", handleGameStarted);

      socket.off("specialAction", handleSpecial);
      socket.off("revealOwn", handleRevealOwn);
      socket.off("revealOpponent", handleRevealOpponent);
    };
  }, [socket, roomId]);

  const takeFrom = (from) => {
    socket.emit("take", { roomId, from }, (res) => {
      if (res?.ok) {
        setDrawnCard(res.card);
      } else {
        alert("Karte konnte nicht genommen werden (nicht dein Zug oder leer)");
      }
    });
  };

  const swapWith = (index) => {
    if (drawnCard == null) {
      alert("Keine gezogene Karte zum Tauschen");
      return;
    }

    socket.emit("swap", { roomId, index, drawnCard }, (res) => {
      console.log("swap resp:", res);
      if (res?.ok) {
        // if special was triggered, server will send specialAction event
        setDrawnCard(null);
      } else {
        alert(res?.error || "Tausch fehlgeschlagen");
      }
    });
  };

  const discardDrawn = () => {
    if (drawnCard == null) {
      alert("Keine gezogene Karte zum Abwerfen");
      return;
    }

    socket.emit("swap", { roomId, index: -1, drawnCard }, (res) => {
      console.log("discard resp:", res);
      if (res?.ok) {
        // if it's a special and server returns specialAction, the client will handle it
        setDrawnCard(null);
      } else {
        alert(res?.error || "Abwerfen fehlgeschlagen");
      }
    });
  };

  const peekTwo = () => {
    if (!myHand.length) return;

    const ids = myHand.slice(0, 2).map((c) => c.id);
    setRevealedIds(new Set(ids));
    // tell server optionally (server can track peekUsed if implemented)
    socket.emit("peekUsed", { roomId }, () => {});
  };

  const currentPlayer = publicState?.players?.[publicState.turnIndex] || null;
  const currentName = publicState?.names?.[currentPlayer] || "—";

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
        <button onClick={discardDrawn}>Gezogene abwerfen</button>
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
              count={publicState?.playerCardsCount?.[p] ?? 4}
            />
          ))}
      </div>

      {/* Eigene Karten unten */}
      <div style={{ marginTop: 20 }}>
        <Hand hand={myHand} onSwap={swapWith} revealedIds={revealedIds} />
      </div>

      <div style={{ marginTop: 10 }}>
        Gezogene Karte: {drawnCard ?? "—"}
      </div>
    </div>
  );
}
