"use client";

import { useMultiplayerLobbyController } from "./lobby/useMultiplayerLobbyController";
import { MultiplayerBattleView, MultiplayerLobbyScreen } from "./lobby/views";

export function MultiplayerLobby() {
  const lobby = useMultiplayerLobbyController();

  if (lobby.mode === "battle" && lobby.session && lobby.gameSeed !== null) {
    return <MultiplayerBattleView lobby={lobby} />;
  }

  return <MultiplayerLobbyScreen lobby={lobby} />;
}
