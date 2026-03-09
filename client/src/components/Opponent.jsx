import React from "react";

export default function Opponent({ name, cardsCount=4 }) {
  return (
    <div className="opponent">
      <div className="opp-name">{name}</div>
      <div className="opp-cards">
        {Array.from({length:cardsCount}).map((_,i)=>
          <div key={i} className="opp-card">X</div>
        )}
      </div>
    </div>
  );
}
