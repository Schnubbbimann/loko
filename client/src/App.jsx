import React, { useState, useEffect } from "react";
import io from "socket.io-client";
import Lobby from "./components/Lobby";
import Game from "./components/Game";

const socket = io(); // same origin

export default function App(){
  const [name, setName] = useState("");
  const [roomId, setRoomId] = useState(null);
  const [inGame, setInGame] = useState(false);

  useEffect(()=>{
    socket.on("gameStarted", ()=> setInGame(true));
    socket.on("roundResult", ()=> setInGame(false)); // simple reset
    return ()=> {
      socket.off("gameStarted");
      socket.off("roundResult");
    };
  },[]);

  return (
    <div className="app">
      <header><h1>Cabo — Geschenkversion</h1></header>
      {!roomId ? (
        <Lobby socket={socket} setRoomId={setRoomId} name={name} setName={setName} />
      ) : (
        <Game socket={socket} roomId={roomId} name={name} leave={()=> setRoomId(null)} />
      )}
    </div>
  );
}
