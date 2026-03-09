import React, { useState } from "react";
import io from "socket.io-client";
import Lobby from "./components/Lobby";
import Game from "./components/Game";

const socket = io();

export default function App() {
  const [name, setName] = useState("");
  const [roomId, setRoomId] = useState(null);

  return (
    <div className="app">
      <header>
        <h1>Cabo</h1>
      </header>

      {!roomId ? (
        <Lobby
          socket={socket}
          setRoomId={setRoomId}
          name={name}
          setName={setName}
        />
      ) : (
        <Game
          socket={socket}
          roomId={roomId}
          name={name}
          leave={() => setRoomId(null)}
        />
      )}
    </div>
  );
}
