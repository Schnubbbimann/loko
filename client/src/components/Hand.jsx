import React from "react";

export default function Hand({ hand = [], onSwap, onRemovePair }) {
  return (
    <div className="hand">
      <h4>Dein Blatt</h4>
      <div className="cards">
        {hand.map((c,i)=>(
          <div className="card" key={c?.id || i}>
            <div className="val">{c.revealed ? c.value : c.value /* we show player's own cards always */}</div>
            <div className="actions">
              <button onClick={()=> onSwap(i) }>Mit gezogener tauschen</button>
            </div>
          </div>
        ))}
      </div>
      <div className="pair-note">
        Um zwei gleiche Karten zu entfernen: klicke die Buttons daneben (in dieser minimal UI bitte angeben, z.B. removePair(0,2))
      </div>
    </div>
  );
}
