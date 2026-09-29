import type { Command, Owner, SimState } from "@/lib/types";
import { entityInPlayerVision, makeFog, tickFog } from "@/lib/sim/fog";
import { evaluateObjectives } from "@/lib/sim/objectives";
import { compactDestroyedEntities, invalidateEntityCaches } from "@/lib/sim/world";

import { isSimSnapshot, sameOwners, sanitizeCommand, SKIRMISH_MATCH_SETTINGS } from "./protocol";
import type { MultiplayerRole, MultiplayerStatus, MultiplayerWire, IntroReadyMessage, IntroReleaseMessage, TickFrame } from "./protocol";

// Retain the existing public import surface for UI and headless callers.
export { sanitizeCommand, SKIRMISH_MATCH_SETTINGS, validSkirmishMatchSettings } from "./protocol";
export type { MultiplayerRole, MultiplayerStatus, MultiplayerWire, TickFrame, IntroReadyMessage, IntroReleaseMessage } from "./protocol";

const RTT_PROBE_INTERVAL_MS = 2_000;
const RTT_SAMPLE_MAX_AGE_MS = 6_000;
const MAX_PENDING_RTT_PROBES = 8;

function monotonicNow(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function validProbeId(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

type GuestSeat = { peerId: string; owner: Owner; sender: MultiplayerWire; connected: boolean };
type GuestIntent = { owner: Owner; command: Command };
type RttSample = { milliseconds: number; measuredAt: number };

export class MultiplayerSession {
  readonly owner: Owner;
  readonly role: MultiplayerRole;
  readonly owners: Owner[];
  readonly aiOwners: Owner[];
  private sender: MultiplayerWire;
  private statusValue: MultiplayerStatus = "connected";
  private listeners = new Set<() => void>();
  private pingListeners = new Set<() => void>();
  private localCommands: Command[] = [];
  private guestCommands: GuestIntent[] = [];
  private guests = new Map<string, GuestSeat>();
  private frames = new Map<number, Command[]>();
  private resyncRequested = false;
  private pendingSnapshot: SimState | null = null;
  private snapshotSource: (() => SimState) | null = null;
  private snapshotConsumer: ((state: SimState) => void) | null = null;
  private rttInterval: ReturnType<typeof setInterval> | null = null;
  private nextProbeId = 0;
  private pendingRttProbes = new Map<string, Map<number, number>>();
  private rttSamples = new Map<string, RttSample>();
  private lastPublishedPingMs: number | null = null;
  private introBarrierArmed = false;
  private introReleasedValue = true;
  private localIntroReady = false;
  private hostIntroReady = false;
  private readyGuests = new Set<string>();

  constructor(
    role: MultiplayerRole,
    owner: Owner,
    readonly seed: number,
    sender: MultiplayerWire,
    owners: readonly Owner[] = [0, 1],
    aiOwners: readonly Owner[] = [],
  ) {
    this.role = role;
    this.owner = owner;
    this.sender = sender;
    this.owners = [...owners];
    this.aiOwners = [...aiOwners];
    if (this.owners.length < 2 || this.owners.length > 4 || !this.owners.includes(0) ||
        !sameOwners(this.owners, this.owners) || !this.owners.includes(owner) ||
        !Array.isArray(aiOwners) || new Set(aiOwners).size !== aiOwners.length ||
        aiOwners.some((aiOwner) => aiOwner === 0 || aiOwner === owner || !this.owners.includes(aiOwner))) {
      throw new Error("Invalid multiplayer roster");
    }
  }

  get status(): MultiplayerStatus { return this.statusValue; }
  get connected(): boolean { return this.statusValue === "connected"; }
  get introReleased(): boolean { return !this.introBarrierArmed || this.introReleasedValue; }
  get hasPeerConnection(): boolean {
    return this.role === "guest" || this.guests.size > 0;
  }
  get pingMs(): number | null {
    if (!this.connected) return null;
    const now = monotonicNow();
    const peerIds = this.role === "host"
      ? [...this.guests.values()].filter((guest) => guest.connected).map((guest) => guest.peerId)
      : ["host"];
    const samples = peerIds
      .map((peerId) => this.rttSamples.get(peerId))
      .filter((sample): sample is RttSample => sample !== undefined && now - sample.measuredAt <= RTT_SAMPLE_MAX_AGE_MS);
    if (samples.length === 0) return null;
    return Math.round(samples.reduce((total, sample) => total + sample.milliseconds, 0) / samples.length);
  }

  /** Start lightweight peer-to-peer RTT probes while the battlefield is mounted. */
  startLatencyProbes(): () => void {
    this.stopLatencyProbes(false);
    if (this.statusValue === "ended") return () => undefined;
    const probe = () => {
      if (this.statusValue === "ended") return;
      if (this.connected) {
        if (this.role === "host") {
          for (const guest of this.guests.values()) {
            if (guest.connected) this.sendLatencyProbe(guest.peerId, guest.sender);
          }
        } else {
          this.sendLatencyProbe("host", this.sender);
        }
      }
      // Re-render once an older measurement expires, even if no pong arrives.
      this.publishPing();
    };
    probe();
    this.rttInterval = setInterval(probe, RTT_PROBE_INTERVAL_MS);
    return () => this.stopLatencyProbes();
  }

  private stopLatencyProbes(publish = true): void {
    if (this.rttInterval !== null) clearInterval(this.rttInterval);
    this.rttInterval = null;
    this.pendingRttProbes.clear();
    this.rttSamples.clear();
    if (publish) this.publishPing();
  }

  private sendLatencyProbe(peerId: string, sender: MultiplayerWire): void {
    const now = monotonicNow();
    const id = ++this.nextProbeId;
    const pending = this.pendingRttProbes.get(peerId) ?? new Map<number, number>();
    for (const [pendingId, sentAt] of pending) {
      if (now - sentAt > RTT_SAMPLE_MAX_AGE_MS) pending.delete(pendingId);
    }
    pending.set(id, now);
    while (pending.size > MAX_PENDING_RTT_PROBES) {
      const oldestId = pending.keys().next().value;
      if (oldestId === undefined) break;
      pending.delete(oldestId);
    }
    this.pendingRttProbes.set(peerId, pending);
    try {
      sender.send({ type: "ping", protocolVersion: SKIRMISH_MATCH_SETTINGS.protocolVersion, id });
    } catch {
      pending.delete(id);
    }
  }

  private replyToLatencyProbe(sender: MultiplayerWire, message: Record<string, unknown>): boolean {
    if (message.type !== "ping") return false;
    if (message.protocolVersion === SKIRMISH_MATCH_SETTINGS.protocolVersion && validProbeId(message.id)) {
      sender.send({ type: "pong", protocolVersion: SKIRMISH_MATCH_SETTINGS.protocolVersion, id: message.id });
    }
    return true;
  }

  private recordLatencyResponse(peerId: string, message: Record<string, unknown>): boolean {
    if (message.type !== "pong") return false;
    if (message.protocolVersion !== SKIRMISH_MATCH_SETTINGS.protocolVersion || !validProbeId(message.id)) return true;
    const pending = this.pendingRttProbes.get(peerId);
    const sentAt = pending?.get(message.id);
    if (sentAt === undefined) return true;
    pending!.delete(message.id);
    const receivedAt = monotonicNow();
    this.rttSamples.set(peerId, { milliseconds: Math.max(0, Math.round(receivedAt - sentAt)), measuredAt: receivedAt });
    this.publishPing();
    return true;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  subscribePing(listener: () => void): () => void {
    this.pingListeners.add(listener);
    return () => this.pingListeners.delete(listener);
  }

  private publishPing(): void {
    const next = this.pingMs;
    if (next === this.lastPublishedPingMs) return;
    this.lastPublishedPingMs = next;
    for (const listener of this.pingListeners) listener();
  }

  private publish(): void {
    for (const listener of this.listeners) listener();
    this.publishPing();
  }

  attach(sender: MultiplayerWire) {
    if (this.statusValue === "ended") return;
    this.sender = sender;
    if (this.role === "host") this.refreshHostStatus();
    else {
      this.statusValue = "connected";
      this.publish();
      if (this.introBarrierArmed && this.localIntroReady) this.sendIntroReady();
    }
  }

  /** Hold lockstep ticks until every human seat has completed its local arrival scene. */
  armIntroBarrier(): void {
    this.introBarrierArmed = true;
    this.introReleasedValue = false;
    this.localIntroReady = false;
    this.hostIntroReady = false;
    this.readyGuests.clear();
    this.publish();
  }

  markIntroReady(): void {
    if (!this.introBarrierArmed || this.introReleasedValue || this.localIntroReady) return;
    this.localIntroReady = true;
    if (this.role === "host") {
      this.hostIntroReady = true;
      this.tryReleaseIntro();
    } else {
      this.sendIntroReady();
    }
  }

  private sendIntroReady(): void {
    if (this.role !== "guest" || !this.introBarrierArmed || !this.localIntroReady || !this.connected) return;
    try {
      const message: IntroReadyMessage = { type: "intro-ready", protocolVersion: SKIRMISH_MATCH_SETTINGS.protocolVersion };
      this.sender.send(message);
    } catch {
      // Reconnect will resend readiness through attach().
    }
  }

  private tryReleaseIntro(): void {
    if (this.role !== "host" || !this.introBarrierArmed || this.introReleasedValue || !this.hostIntroReady) return;
    if ([...this.guests.keys()].some((peerId) => !this.readyGuests.has(peerId))) return;
    this.introReleasedValue = true;
    const message: IntroReleaseMessage = { type: "intro-release", protocolVersion: SKIRMISH_MATCH_SETTINGS.protocolVersion };
    this.broadcast(message);
    this.publish();
  }

  /** Register one authenticated guest seat on the host's peer mesh. */
  addGuest(peerId: string, owner: Owner, sender: MultiplayerWire): boolean {
    if (this.role !== "host" || owner === 0 || !this.owners.includes(owner) || this.aiOwners.includes(owner) || !peerId ||
        [...this.guests.values()].some((guest) => guest.owner === owner && guest.peerId !== peerId)) return false;
    this.guests.set(peerId, { peerId, owner, sender, connected: true });
    this.refreshHostStatus();
    return true;
  }

  disconnectGuest(peerId: string): void {
    const guest = this.guests.get(peerId);
    if (!guest) return;
    guest.connected = false;
    this.refreshHostStatus();
  }

  reconnectGuest(peerId: string, sender: MultiplayerWire): boolean {
    const guest = this.guests.get(peerId);
    if (!guest || this.statusValue === "ended") return false;
    guest.sender = sender;
    guest.connected = true;
    this.refreshHostStatus();
    if (this.introBarrierArmed && this.introReleasedValue) {
      sender.send({ type: "intro-release", protocolVersion: SKIRMISH_MATCH_SETTINGS.protocolVersion } satisfies IntroReleaseMessage);
    }
    return true;
  }

  private refreshHostStatus(): void {
    if (this.role !== "host" || this.statusValue === "ended") return;
    const next: MultiplayerStatus = [...this.guests.values()].some((guest) => !guest.connected) ? "disconnected" : "connected";
    if (next === this.statusValue) return;
    if (next === "connected") {
      this.pendingRttProbes.clear();
      this.rttSamples.clear();
    }
    this.statusValue = next;
    this.publish();
    this.broadcast({ type: next === "disconnected" ? "paused" : "resumed" });
  }

  private sendToGuest(peerId: string, value: unknown): void {
    const guest = this.guests.get(peerId);
    if (guest?.connected) guest.sender.send(value);
  }

  private broadcast(value: unknown): void {
    for (const guest of this.guests.values()) if (guest.connected) guest.sender.send(value);
  }

  setDisconnected() {
    if (this.statusValue === "ended") return;
    if (this.statusValue === "disconnected") return;
    this.statusValue = "disconnected";
    this.pendingRttProbes.clear();
    this.rttSamples.clear();
    this.publish();
    if (this.role === "host") this.broadcast({ type: "paused" });
  }

  bindState(source: () => SimState, consume: (state: SimState) => void) {
    this.snapshotSource = source;
    this.snapshotConsumer = consume;
  }

  submit(command: Command): void {
    const rawIntent = { ...command };
    delete rawIntent.owner;
    const intent = sanitizeCommand(rawIntent, false);
    if (!intent || !this.connected) return;
    if (this.role === "host") this.localCommands.push({ ...intent, owner: 0 } as Command);
    else this.sender.send({ type: "intent", command: intent });
  }

  submitMany(commands: readonly Command[]): void { for (const command of commands) this.submit(command); }

  receive(value: unknown): void {
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    const message = value as Record<string, unknown>;
    if (this.role === "host") return;
    if (this.replyToLatencyProbe(this.sender, message)) return;
    if (this.recordLatencyResponse("host", message)) return;
    if (message.type === "intro-release") {
      if (this.introBarrierArmed && message.protocolVersion === SKIRMISH_MATCH_SETTINGS.protocolVersion) {
        this.introReleasedValue = true;
        this.publish();
      }
      return;
    }
    if (this.role === "guest" && message.type === "tick" && Number.isSafeInteger(message.tick) && Array.isArray(message.commands) && message.commands.length <= 256) {
      if (message.protocolVersion !== SKIRMISH_MATCH_SETTINGS.protocolVersion) return;
      const tick = Number(message.tick);
      const commands = message.commands.map((command) => sanitizeCommand(command, true));
      if (commands.every(Boolean)) {
        this.frames.set(tick, commands as Command[]);
        while (this.frames.size > 256) this.frames.delete(Math.min(...this.frames.keys()));
      }
      return;
    }
    if (this.role === "guest" && message.type === "resync") {
      const localState = this.snapshotSource?.();
      if (isSimSnapshot(message.state, this.seed, this.owners, this.aiOwners, localState)) this.pendingSnapshot = message.state;
      return;
    }
    if (this.role === "guest" && message.type === "paused") {
      this.setDisconnected();
      return;
    }
    if (this.role === "guest" && message.type === "resumed") {
      if (this.statusValue !== "ended") {
        this.statusValue = "connected";
        this.publish();
      }
      return;
    }
    if (message.type === "ended") {
      this.statusValue = "ended";
      this.publish();
    }
  }

  /** Messages from guests must include their authenticated PeerJS identity. */
  receiveFrom(peerId: string, value: unknown): void {
    if (this.role !== "host" || this.statusValue === "ended") return;
    const guest = this.guests.get(peerId);
    if (!guest?.connected || !value || typeof value !== "object" || Array.isArray(value)) return;
    const message = value as Record<string, unknown>;
    if (this.replyToLatencyProbe(guest.sender, message)) return;
    if (this.recordLatencyResponse(peerId, message)) return;
    if (message.type === "intro-ready") {
      if (this.introBarrierArmed && message.protocolVersion === SKIRMISH_MATCH_SETTINGS.protocolVersion) {
        this.readyGuests.add(peerId);
        this.tryReleaseIntro();
      }
      return;
    }
    if (message.type === "intent") {
      const command = sanitizeCommand(message.command, false);
      if (command?.type === "attack") {
        const state = this.snapshotSource?.();
        const target = state?.entities.find((entity) => entity.id === command.targetId);
        if (!state || !target || !entityInPlayerVision(state, target, guest.owner)) return;
      }
      if (command && this.guestCommands.length < 384) this.guestCommands.push({ owner: guest.owner, command });
      return;
    }
    if (message.type === "resume") {
      const state = this.snapshotSource?.();
      if (state) this.sendToGuest(peerId, { type: "resync", state });
      return;
    }
  }

  /** Remove a disconnected seat after its reconnect grace period and resume the survivors. */
  forfeitGuest(peerId: string): Owner | null {
    if (this.role !== "host") return null;
    const guest = this.guests.get(peerId);
    const state = this.snapshotSource?.();
    if (!guest || !state) return null;
    this.guests.delete(peerId);
    this.readyGuests.delete(peerId);
    this.pendingRttProbes.delete(peerId);
    this.rttSamples.delete(peerId);
    this.guestCommands = this.guestCommands.filter((intent) => intent.owner !== guest.owner);
    state.multiplayerOwners = (state.multiplayerOwners ?? [0, guest.owner]).filter((owner) => owner !== guest.owner);
    for (const entity of state.entities) if (entity.owner === guest.owner) entity.hp = 0;
    invalidateEntityCaches(state);
    compactDestroyedEntities(state);
    state.credits[guest.owner] = 0;
    evaluateObjectives(state);
    tickFog(state);
    const snapshot = { ...state, entities: state.entities.map((entity) => ({ ...entity })) };
    this.snapshotConsumer?.(snapshot);
    this.broadcast({ type: "resync", state: snapshot });
    this.refreshHostStatus();
    this.tryReleaseIntro();
    return guest.owner;
  }

  syncSnapshot(): void {
    if (!this.pendingSnapshot) return;
    const snapshot = this.pendingSnapshot;
    this.pendingSnapshot = null;
    this.resyncRequested = false;
    for (const tick of [...this.frames.keys()]) {
      if (tick <= snapshot.tick) {
        this.frames.delete(tick);
      }
    }
    const local = this.snapshotSource?.();
    const state: SimState = {
      ...snapshot,
      viewOwner: this.owner,
      fog: local?.viewOwner === this.owner && local.width === snapshot.width && local.height === snapshot.height
        ? [...local.fog]
        : makeFog(snapshot.width, snapshot.height, 0),
    };
    if (state.result !== "playing" || (state.multiplayerOwners && !state.multiplayerOwners.includes(this.owner))) {
      state.result = state.winner === null ? "lost" : state.winner === this.owner ? "won" : "lost";
    }
    tickFog(state);
    this.snapshotConsumer?.(state);
  }

  canAdvance(state: SimState): boolean {
    this.syncSnapshot();
    if (!this.connected || !this.introReleased) return false;
    if (this.role === "host") return true;
    const nextTick = state.tick + 1;
    if (this.frames.has(nextTick)) return true;
    if ([...this.frames.keys()].some((tick) => tick > nextTick)) this.requestResync();
    return false;
  }

  private requestResync(): void {
    if (this.role !== "guest" || this.resyncRequested) return;
    this.resyncRequested = true;
    try {
      this.sender.send({ type: "resume" });
    } catch {
      this.resyncRequested = false;
    }
  }

  queuedFramesCount(state: SimState): number {
    this.syncSnapshot();
    if (this.role === "host") return 0;
    let count = 0;
    let tick = state.tick + 1;
    while (this.frames.has(tick)) {
      count++;
      tick++;
    }
    return count;
  }

  drainTick(state: SimState, localCommands: Command[]): Command[] {
    this.syncSnapshot();
    if (this.role === "host") {
      const commands = [
        ...this.localCommands.splice(0).map((command) => ({ ...command, owner: this.owner } as Command)),
        ...localCommands.map((command) => ({ ...command, owner: this.owner } as Command)),
        ...this.guestCommands.splice(0).map(({ owner, command }) => ({ ...command, owner } as Command)),
      ];
      const frame: TickFrame = { type: "tick", protocolVersion: SKIRMISH_MATCH_SETTINGS.protocolVersion, tick: state.tick + 1, commands };
      if (this.connected) this.broadcast(frame);
      return commands;
    }
    const next = state.tick + 1;
    const commands = this.frames.get(next) ?? [];
    this.frames.delete(next);
    return commands;
  }

  end(): void {
    if (this.statusValue === "ended") return;
    if (this.role === "host") this.broadcast({ type: "ended" });
    this.statusValue = "ended";
    this.stopLatencyProbes(false);
    this.publish();
  }
}
