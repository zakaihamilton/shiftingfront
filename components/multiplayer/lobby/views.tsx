"use client";

import dynamic from "next/dynamic";
import { CodeInput } from "@/components/shared/CodeInput";
import { rollSeed } from "@/components/menu/menuLaunch";
import { ConsoleButton } from "@/components/ui/ConsoleButton";
import { ConsoleLabel } from "@/components/ui/ConsoleLabel";
import { MetalPanel } from "@/components/ui/MetalPanel";
import { useModalFocus } from "@/components/ui/useModalFocus";
import type { MultiplayerSession } from "@/lib/multiplayer/session";
import type { MultiplayerLobbyModel } from "./useMultiplayerLobbyController";
import { ownerLabel } from "./utils";
import { SkirmishPreviewPane } from "./SkirmishPreviewPane";
import styles from "../MultiplayerLobby.module.css";

const DynamicGameClient = dynamic(() => import("@/components/game/GameClient").then((module) => module.GameClient), {
  ssr: false,
  loading: () => <main className={styles.battleLoading} role="status">Preparing skirmish…</main>,
});

type LobbyModel = MultiplayerLobbyModel;

function HostSetupView({ lobby }: { lobby: LobbyModel }) {
  return (
    <div className={styles.hostSetupLayout}>
      <section className={styles.hostSetupForm}>
        <ConsoleLabel>ONLINE SKIRMISH · FREE-FOR-ALL</ConsoleLabel>
        <h1 id="multiplayer-title">Host a room</h1>
        <p>Choose the four-digit match seed. This is separate from the invite code.</p>
        <label htmlFor="multiplayer-seed">Match seed</label>
        <div className={styles.seedRow}>
          <CodeInput id="multiplayer-seed" testId="multiplayer-seed-input" value={lobby.seed} length={4}
            label="Four digit match seed" onChange={lobby.setSeed}
            normalize={(value) => value.replace(/\D/g, "")} onEnter={() => void lobby.hostRoom()} />
          <ConsoleButton muted onClick={() => lobby.setSeed(rollSeed())}>Roll seed</ConsoleButton>
        </div>
        <div className={styles.actions}>
          <ConsoleButton onClick={() => void lobby.hostRoom()}>Create room</ConsoleButton>
          <ConsoleButton muted onClick={lobby.backToChoose}>Back</ConsoleButton>
        </div>
        {lobby.error ? <p className={styles.error} role="alert">{lobby.error}</p> : null}
        {lobby.status === "Room creation failed." ? <p className={styles.status} role="status">{lobby.status}</p> : null}
      </section>
      <SkirmishPreviewPane biome={lobby.skirmishBiome} className={styles.hostSetupPreview} />
    </div>
  );
}

function ChooseRoomView({ lobby }: { lobby: LobbyModel }) {
  return (
    <>
      <p>Host a room, invite up to three guests, or fill vacant corners with AI. The host can start with at least one opponent.</p>
      <div className={styles.actions}>
        <ConsoleButton onClick={lobby.showHostSetup}>Host a room</ConsoleButton>
        <form onSubmit={lobby.joinRoom} className={styles.joinForm}>
          <label htmlFor="join-code">Host code</label>
          <CodeInput id="join-code" testId="multiplayer-code-input" value={lobby.joinCode} length={6}
            label="Six-letter host code" inputMode="text" autoCapitalize="characters"
            onChange={lobby.changeJoinCode}
            normalize={(value) => value.toUpperCase().replace(/[^A-HJ-NP-Z]/g, "")}
            className={styles.joinCode} />
          <ConsoleButton type="submit" disabled={lobby.joinCode.length !== 6}>Join room</ConsoleButton>
        </form>
      </div>
    </>
  );
}

function HostWaitingRoom({ lobby }: { lobby: LobbyModel }) {
  return (
    <>
      <p>Invite guests or switch vacant User seats to AI. Start locks the roster and places each force in its corner.</p>
      <div className={styles.inviteCode} data-testid="multiplayer-invite-code">{lobby.inviteCode || "······"}</div>
      <ul className={styles.roster} data-testid="multiplayer-roster" aria-label="Room roster">
        {lobby.roster.map((player) => (
          <li key={player.owner} data-testid={"multiplayer-roster-seat-" + player.owner}>
            <span>{ownerLabel(player.owner)}</span>
            <span>{player.host ? "Host" : player.forfeited ? "Forfeited" : player.ai ? "AI opponent" : player.peerId ? player.connected ? "Connected" : "Reserved · reconnecting" : "Open User seat"}</span>
            {!player.host && !player.peerId ? (
              <button type="button" className={styles.seatToggle}
                data-testid={"multiplayer-seat-toggle-" + player.owner}
                aria-label={"Set " + ownerLabel(player.owner) + " to " + (player.ai ? "User" : "AI")}
                onClick={() => lobby.setSeatAi(player.owner)}>
                {player.ai ? "Switch to User" : "Switch to AI"}
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      <div className={styles.actions}>
        <ConsoleButton muted onClick={() => void lobby.copyInvite()} disabled={!lobby.inviteCode}>Copy code</ConsoleButton>
        <ConsoleButton data-testid="multiplayer-start-button" onClick={lobby.startMatch} disabled={lobby.activePlayers < 2}>Start skirmish</ConsoleButton>
        <ConsoleButton muted onClick={lobby.endCurrentMatch}>Close room</ConsoleButton>
      </div>
    </>
  );
}

function GuestWaitingRoom({ lobby }: { lobby: LobbyModel }) {
  return (
    <>
      <p data-testid="multiplayer-seat">{lobby.guestOwner === null ? "Verifying your room seat…" : ownerLabel(lobby.guestOwner) + " is reserved."}</p>
      <p>The host will start the match when ready. Your corner and the match seed are set by the host.</p>
      <ConsoleButton muted onClick={lobby.endCurrentMatch}>Leave room</ConsoleButton>
    </>
  );
}

function WaitingRoomView({ lobby }: { lobby: LobbyModel }) {
  return lobby.lobbyRole === "host" ? <HostWaitingRoom lobby={lobby} /> : <GuestWaitingRoom lobby={lobby} />;
}

export function MultiplayerLobbyScreen({ lobby }: { lobby: LobbyModel }) {
  const hostSetup = lobby.mode === "hostSetup";
  const title = lobby.mode === "waiting"
    ? (lobby.lobbyRole === "host" ? "Room open" : "Waiting for host")
    : lobby.mode === "joining" ? "Joining room" : "Multiplayer";

  return (
    <main className={styles.screen + (hostSetup ? " " + styles.hostSetupScreen : "")}>
      <MetalPanel
        as="section"
        className={styles.panel + (hostSetup ? " " + styles.hostSetupPanel : "")}
        role="region"
        aria-labelledby="multiplayer-title"
      >
        {hostSetup ? <HostSetupView lobby={lobby} /> : (
          <>
            <ConsoleLabel>ONLINE SKIRMISH · FREE-FOR-ALL</ConsoleLabel>
            <h1 id="multiplayer-title">{title}</h1>
            {lobby.mode === "choose" ? <ChooseRoomView lobby={lobby} /> : null}
            {lobby.mode === "waiting" ? <WaitingRoomView lobby={lobby} /> : null}
            {lobby.mode === "joining" ? <p role="status">{lobby.status}</p> : null}
            {lobby.error ? <p className={styles.error} role="alert">{lobby.error}</p> : null}
            {lobby.mode !== "joining" ? <p className={styles.status} role="status">{lobby.status}</p> : null}
            {lobby.mode === "choose" ? <ConsoleButton className={styles.menuBack} muted onClick={lobby.backToMenu}>Back to menu</ConsoleButton> : null}
          </>
        )}
      </MetalPanel>
    </main>
  );
}

function MultiplayerConnectionOverlay({ session, status, onLeave }: { session: MultiplayerSession; status: string; onLeave: () => void }) {
  const disconnected = session.status === "disconnected";
  const ended = session.status === "ended";
  const connectionStatus = status === "Skirmish in progress" ? "Reconnecting automatically…" : status;
  const connectionTitle = connectionStatus.toLowerCase().includes("signaling")
    ? "Signaling interrupted"
    : connectionStatus.toLowerCase().includes("host")
      ? "Host connection lost"
      : "Player connection interrupted";
  const multiplayerDialogRef = useModalFocus(disconnected || ended, session.status, "dialog");

  if (!disconnected && !ended) return null;

  return (
    <div className={styles.connectionOverlay} data-state={ended ? "ended" : "disconnected"}>
      <MetalPanel
        ref={multiplayerDialogRef}
        tabIndex={-1}
        className={styles.connectionDialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="multiplayer-connection-title"
        aria-describedby="multiplayer-connection-description"
      >
        <ConsoleLabel>ONLINE SKIRMISH · NETWORK STATUS</ConsoleLabel>
        <h1 id="multiplayer-connection-title" className={styles.connectionTitle}>
          {ended ? "Connection ended" : connectionTitle}
        </h1>
        <p id="multiplayer-connection-description" className={styles.connectionDescription}>
          {ended
            ? "This skirmish can no longer continue. Return to the multiplayer menu to start or join another room."
            : connectionStatus.toLowerCase().includes("signaling")
              ? "The match is paused while your signaling connection recovers. Reconnection is automatic for up to 60 seconds."
              : session.role === "host"
                ? "The match is paused while the disconnected player reconnects. Their seat is reserved for up to 60 seconds."
                : "The match is paused while your connection to the host recovers. Reconnection is automatic for up to 60 seconds."}
        </p>
        <p className={styles.connectionStatus} role="status">
          {ended && status === "Skirmish in progress" ? "Connection to the room ended." : connectionStatus}
        </p>
        <div className={styles.connectionActions}>
          <ConsoleButton onClick={onLeave}>
            {ended ? "Return to menu" : "Leave skirmish"}
          </ConsoleButton>
        </div>
      </MetalPanel>
    </div>
  );
}

export function MultiplayerBattleView({ lobby }: { lobby: LobbyModel }) {
  if (!lobby.session || lobby.gameSeed === null) return null;
  const ended = lobby.session.status === "ended";

  return (
    <div className={styles.battle}>
      {!ended ? <DynamicGameClient seed={lobby.gameSeed} mission={0} resume={false} fresh multiplayerSession={lobby.session} /> : null}
      <MultiplayerConnectionOverlay session={lobby.session} status={lobby.status} onLeave={lobby.endCurrentMatch} />
    </div>
  );
}
