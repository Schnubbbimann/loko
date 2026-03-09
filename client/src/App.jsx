import React, { useState, useEffect } from "react";
import io from "socket.io-client";
import Lobby from "./components/Lobby";
import WaitingRoom from "./components/WaitingRoom";
import Game from "./components/Game";

const socket = io();

export default function App() {
  const [name, setName] = useState("");
  const [roomId, setRoomId] = useState(null);
  const [gameStarted, setGameStarted] = useState(false);

  useEffect(() => {
    socket.on("gameStarted", () => {
      setGameStarted(true);
    });
    socket.on("roundResult", () => {
      // nach Runde optional aufs Lobby zurücksetzen oder WaitingRoom bleiben — hier behalten wir roomId
      setGameStarted(false);
    });
    return () => {
      socket.off("gameStarted");
      socket.off("roundResult");
    };
  }, []);

  // flow:
  // no roomId -> show Lobby (create/join)
  // roomId && !gameStarted -> show WaitingRoom (players list, start button appears only when 2 players)
  // roomId && gameStarted -> show Game
  return (
    <div className="app">
      <header>
        <h1>Cabo — Geschenkversion</h1>
      </header>

      {!roomId ? (
        <Lobby socket={socket} setRoomId={setRoomId} name={name} setName={setName} />
      ) : !gameStarted ? (
        <WaitingRoom
          socket={socket}
          roomId={roomId}
          name={name}
          onLeave={() => {
            setRoomId(null);
            setGameStarted(false);
          }}
          onStart={() => setGameStarted(true)}
        />
      ) : (
        <Game socket={socket} roomId={roomId} name={name} leave={() => { setRoomId(null); setGameStarted(false); }} />
      )}
    </div>
  );
}
