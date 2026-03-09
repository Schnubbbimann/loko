import React from "react";

export default function Hand({ hand, onSwap, revealedIds }) {
  return (
    <div>
      <h3>Dein Blatt</h3>
      <div style={{ display: "flex", gap: 10 }}>
        {hand.map((c, i) => {
          const revealed =
            revealedIds.has(c.id) || c.revealed;
          return (
            <div
              key={c.id}
              style={{
                border: "1px solid black",
                padding: 10,
                width: 80,
                textAlign: "center",
                cursor: "pointer",
              }}
              onClick={() => onSwap(i)}
            >
              {revealed ? c.value : "verdeckt"}
            </div>
          );
        })}
      </div>
    </div>
  );
}
