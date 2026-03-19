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

    // ❌ WICHTIG: roundResult setzt NICHT mehr gameStarted auf false
    // Dadurch bleiben wir im Game-Screen

    return () => {
      socket.off("gameStarted");
    };
  }, []);

  return (
    <div className="app">
      

      {!roomId ? (
        <Lobby
          socket={socket}
          setRoomId={setRoomId}
          name={name}
          setName={setName}
        />
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
        <Game
  socket={socket}
  roomId={roomId}
  name={name}
  leave={() => {
    setGameStarted(false);
  }}
/>
      )}
    </div>
  );
}
