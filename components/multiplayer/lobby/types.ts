import type { Owner } from "@/lib/types";

export type Credential = {
  code: string;
  seed?: number;
  hostPeerId: string;
  peerId: string;
  grant: string;
  expiresAt: number;
  peerJs: { host: string; port: number; path: string; key: string; secure: boolean };
  peerToken: string;
  peerExpiresAt: number;
  iceServers: RTCIceServer[];
};

export type LobbyMode = "choose" | "hostSetup" | "joining" | "waiting" | "battle";
export type LobbyPlayer = { owner: Owner; peerId?: string; connected: boolean; host?: boolean; ai?: boolean; forfeited?: boolean };
export type PeerConstructor = typeof import("peerjs").Peer;

declare global {
  interface Window {
    __SHIFTFRONT_PEER_FACTORY__?: () => PeerConstructor;
  }
}

