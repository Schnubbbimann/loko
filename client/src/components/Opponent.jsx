import React from "react";

export default function Opponent({ name, count }) {
  return (
    <div>
      <h3>{name}</h3>
      <div style={{ display: "flex", gap: 6 }}>
        {Array.from({ length: count }).map((_, i) => (
          <div
            key={i}
            style={{
              width: 40,
              height: 60,
              background: "#ddd",
              borderRadius: 6,
            }}
          />
        ))}
      </div>
    </div>
  );
}
