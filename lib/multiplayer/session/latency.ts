import { SKIRMISH_MATCH_SETTINGS, type MultiplayerStatus, type MultiplayerWire } from "../protocol";

const RTT_PROBE_INTERVAL_MS = 2_000;
const RTT_SAMPLE_MAX_AGE_MS = 6_000;
const MAX_PENDING_RTT_PROBES = 8;

type RttSample = { milliseconds: number; measuredAt: number };
type LatencyPeer = { peerId: string; sender: MultiplayerWire };

function monotonicNow(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function validProbeId(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

/** Owns RTT probes and samples independently from the match command/session state. */
export class MultiplayerLatency {
  private interval: ReturnType<typeof setInterval> | null = null;
  private nextProbeId = 0;
  private pending = new Map<string, Map<number, number>>();
  private samples = new Map<string, RttSample>();
  private lastPublishedPingMs: number | null = null;

  constructor(private readonly options: {
    status: () => MultiplayerStatus;
    peers: () => LatencyPeer[];
    onChange: () => void;
  }) {}

  get pingMs(): number | null {
    if (this.options.status() !== "connected") return null;
    const now = monotonicNow();
    const samples = this.options.peers()
      .map(({ peerId }) => this.samples.get(peerId))
      .filter((sample): sample is RttSample => sample !== undefined && now - sample.measuredAt <= RTT_SAMPLE_MAX_AGE_MS);
    if (samples.length === 0) return null;
    return Math.round(samples.reduce((total, sample) => total + sample.milliseconds, 0) / samples.length);
  }

  /** Start lightweight peer-to-peer RTT probes while the battlefield is mounted. */
  start(): () => void {
    this.stop(false);
    if (this.options.status() === "ended") return () => undefined;
    const probe = () => {
      if (this.options.status() === "ended") return;
      if (this.options.status() === "connected") {
        for (const peer of this.options.peers()) this.sendProbe(peer.peerId, peer.sender);
      }
      // Re-render once an older measurement expires, even if no pong arrives.
      this.publishIfChanged();
    };
    probe();
    this.interval = setInterval(probe, RTT_PROBE_INTERVAL_MS);
    return () => this.stop();
  }

  stop(publish = true): void {
    if (this.interval !== null) clearInterval(this.interval);
    this.interval = null;
    this.pending.clear();
    this.samples.clear();
    if (publish) this.publishIfChanged();
  }

  clearSamples(): void {
    this.pending.clear();
    this.samples.clear();
    this.publishIfChanged();
  }

  removePeer(peerId: string): void {
    this.pending.delete(peerId);
    this.samples.delete(peerId);
  }

  /** Consume ping/pong frames; return true when the message belongs to this collaborator. */
  receive(peerId: string, sender: MultiplayerWire, message: Record<string, unknown>): boolean {
    if (message.type === "ping") {
      if (message.protocolVersion === this.protocolVersion && validProbeId(message.id)) {
        sender.send({ type: "pong", protocolVersion: this.protocolVersion, id: message.id });
      }
      return true;
    }
    if (message.type !== "pong") return false;
    if (message.protocolVersion !== this.protocolVersion || !validProbeId(message.id)) return true;
    const peerPending = this.pending.get(peerId);
    const sentAt = peerPending?.get(message.id);
    if (sentAt === undefined) return true;
    peerPending!.delete(message.id);
    const receivedAt = monotonicNow();
    this.samples.set(peerId, { milliseconds: Math.max(0, Math.round(receivedAt - sentAt)), measuredAt: receivedAt });
    this.publishIfChanged();
    return true;
  }

  private get protocolVersion(): number {
    return SKIRMISH_MATCH_SETTINGS.protocolVersion;
  }

  private sendProbe(peerId: string, sender: MultiplayerWire): void {
    const now = monotonicNow();
    const id = ++this.nextProbeId;
    const peerPending = this.pending.get(peerId) ?? new Map<number, number>();
    for (const [pendingId, sentAt] of peerPending) {
      if (now - sentAt > RTT_SAMPLE_MAX_AGE_MS) peerPending.delete(pendingId);
    }
    peerPending.set(id, now);
    while (peerPending.size > MAX_PENDING_RTT_PROBES) {
      const oldestId = peerPending.keys().next().value;
      if (oldestId === undefined) break;
      peerPending.delete(oldestId);
    }
    this.pending.set(peerId, peerPending);
    try {
      sender.send({ type: "ping", protocolVersion: this.protocolVersion, id });
    } catch {
      peerPending.delete(id);
    }
  }

  private publishIfChanged(): void {
    const next = this.pingMs;
    if (next === this.lastPublishedPingMs) return;
    this.lastPublishedPingMs = next;
    this.options.onChange();
  }
}
