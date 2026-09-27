import type { Command, Owner, SimState } from "@/lib/types";
import { makeFog, tickFog } from "@/lib/sim/fog";
import { evaluateObjectives } from "@/lib/sim/objectives";
import { compactDestroyedEntities, invalidateEntityCaches } from "@/lib/sim/world";

export type MultiplayerRole = "host" | "guest";
export type MultiplayerStatus = "connected" | "disconnected" | "ended";
export type MultiplayerWire = { send: (value: unknown) => void };
export type TickFrame = { type: "tick"; protocolVersion: number; tick: number; commands: Command[] };
export const SKIRMISH_MATCH_SETTINGS = Object.freeze({
  protocolVersion: 2,
  fogOfWar: true,
  victoryCondition: "constructionYardDestruction",
  maxPlayers: 4,
  mode: "freeForAll",
} as const);
type CommandIntent = Command extends infer Order ? Order extends { type: string } ? Omit<Order, "owner"> : never : never;

export function validSkirmishMatchSettings(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const settings = value as Record<string, unknown>;
  return settings.protocolVersion === SKIRMISH_MATCH_SETTINGS.protocolVersion &&
    settings.fogOfWar === SKIRMISH_MATCH_SETTINGS.fogOfWar &&
    settings.victoryCondition === SKIRMISH_MATCH_SETTINGS.victoryCondition &&
    settings.maxPlayers === SKIRMISH_MATCH_SETTINGS.maxPlayers &&
    settings.mode === SKIRMISH_MATCH_SETTINGS.mode;
}

const FORMATIONS = new Set(["line", "column", "wedge"]);
const STANCES = new Set(["aggressive", "defensive", "hold"]);
const BUILDINGS = new Set(["power", "refinery", "barracks", "factory", "turret", "runway", "antiAirTurret"]);
const UNITS = new Set(["harvester", "infantry", "antiArmor", "tank", "medic", "repairTruck", "convoyTruck", "strikePlane"]);

function validIds(value: unknown): value is number[] {
  return Array.isArray(value) && value.length <= 256 && value.every((id) => Number.isSafeInteger(id) && id > 0);
}

/** Accepts only the ShiftingFront command union, with bounded client-controlled values. */
export function sanitizeCommand(value: unknown, allowOwner = false): Command | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (allowOwner && input.owner !== 0 && input.owner !== 1 && input.owner !== 2 && input.owner !== 3) return null;
  if (!allowOwner && "owner" in input) return null;
  const owner = allowOwner ? input.owner as Owner : undefined;
  const idsOk = validIds(input.unitIds);
  const pointOk = (x: unknown, y: unknown) => Number.isFinite(x) && Number.isFinite(y) && Number(x) >= -2 && Number(y) >= -2 && Number(x) <= 300 && Number(y) <= 300;
  let command: CommandIntent | null = null;
  switch (input.type) {
    case "move":
    case "attackMove":
      if (!idsOk || !pointOk(input.x, input.y) || (input.formation !== undefined && !FORMATIONS.has(String(input.formation)))) return null;
      command = { type: input.type, unitIds: input.unitIds as number[], x: Number(input.x), y: Number(input.y), ...(input.formation ? { formation: input.formation as "line" | "column" | "wedge" } : {}) };
      break;
    case "attack":
    case "support":
      if (!idsOk || !Number.isSafeInteger(input.targetId) || Number(input.targetId) <= 0) return null;
      command = { type: input.type, unitIds: input.unitIds as number[], targetId: Number(input.targetId) };
      break;
    case "land":
      if (!idsOk || !Number.isSafeInteger(input.runwayId) || Number(input.runwayId) <= 0) return null;
      command = { type: "land", unitIds: input.unitIds as number[], runwayId: Number(input.runwayId) };
      break;
    case "harvest":
      if (!idsOk || !pointOk(input.x, input.y)) return null;
      command = { type: "harvest", unitIds: input.unitIds as number[], x: Number(input.x), y: Number(input.y) };
      break;
    case "build":
      if (typeof input.building !== "string" || !BUILDINGS.has(input.building) || !pointOk(input.x, input.y)) return null;
      command = { type: "build", building: input.building as Extract<Command, { type: "build" }>["building"], x: Number(input.x), y: Number(input.y) };
      break;
    case "produce":
      if (!Number.isSafeInteger(input.fromId) || Number(input.fromId) <= 0 || typeof input.unit !== "string" || !UNITS.has(input.unit)) return null;
      command = { type: "produce", fromId: Number(input.fromId), unit: input.unit as Extract<Command, { type: "produce" }>["unit"] };
      break;
    case "rally":
      if (!Number.isSafeInteger(input.buildingId) || Number(input.buildingId) <= 0 || !pointOk(input.x, input.y)) return null;
      command = { type: "rally", buildingId: Number(input.buildingId), x: Number(input.x), y: Number(input.y) };
      break;
    case "cancelBuild":
      if (typeof input.building !== "string" || !BUILDINGS.has(input.building)) return null;
      command = { type: "cancelBuild", building: input.building as Extract<Command, { type: "cancelBuild" }>["building"] };
      break;
    case "cancelProduce":
      if (typeof input.unit !== "string" || !UNITS.has(input.unit)) return null;
      command = { type: "cancelProduce", unit: input.unit as Extract<Command, { type: "cancelProduce" }>["unit"] };
      break;
    case "repair":
      if (!Number.isSafeInteger(input.buildingId) || Number(input.buildingId) <= 0) return null;
      command = { type: "repair", buildingId: Number(input.buildingId) };
      break;
    case "sell":
      if (!Number.isSafeInteger(input.buildingId) || Number(input.buildingId) <= 0) return null;
      command = { type: "sell", buildingId: Number(input.buildingId) };
      break;
    case "stop":
      if (!idsOk) return null;
      command = { type: "stop", unitIds: input.unitIds as number[] };
      break;
    case "stance":
      if (!idsOk || typeof input.stance !== "string" || !STANCES.has(input.stance)) return null;
      command = { type: "stance", unitIds: input.unitIds as number[], stance: input.stance as "aggressive" | "defensive" | "hold" };
      break;
    case "formation":
      if (!idsOk || typeof input.formation !== "string" || !FORMATIONS.has(input.formation)) return null;
      command = { type: "formation", unitIds: input.unitIds as number[], formation: input.formation as "line" | "column" | "wedge" };
      break;
  }
  return command ? { ...command, ...(owner === undefined ? {} : { owner }) } as Command : null;
}

function isSimSnapshot(value: unknown, seed: number): value is SimState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<SimState>;
  return state.seed === seed && state.multiplayer === true && Number.isSafeInteger(state.tick) &&
    Array.isArray(state.entities) && Array.isArray(state.tiles) && Array.isArray(state.heights) &&
    Array.isArray(state.resourceAmount) && Array.isArray(state.fog) &&
    Array.isArray(state.multiplayerOwners) && state.multiplayerOwners.length >= 2 && state.multiplayerOwners.length <= 4 &&
    (state.result === "playing" || state.result === "won" || state.result === "lost");
}

type GuestSeat = { peerId: string; owner: Owner; sender: MultiplayerWire; connected: boolean };
type GuestIntent = { owner: Owner; command: Command };

export class MultiplayerSession {
  readonly owner: Owner;
  readonly role: MultiplayerRole;
  readonly owners: Owner[];
  private sender: MultiplayerWire;
  private statusValue: MultiplayerStatus = "connected";
  private listeners = new Set<() => void>();
  private localCommands: Command[] = [];
  private guestCommands: GuestIntent[] = [];
  private guests = new Map<string, GuestSeat>();
  private frames = new Map<number, Command[]>();
  private pendingSnapshot: SimState | null = null;
  private snapshotSource: (() => SimState) | null = null;
  private snapshotConsumer: ((state: SimState) => void) | null = null;

  constructor(role: MultiplayerRole, owner: Owner, readonly seed: number, sender: MultiplayerWire, owners: readonly Owner[] = [0, 1]) {
    this.role = role;
    this.owner = owner;
    this.sender = sender;
    this.owners = [...owners];
  }

  get status(): MultiplayerStatus { return this.statusValue; }
  get connected(): boolean { return this.statusValue === "connected"; }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private publish() { for (const listener of this.listeners) listener(); }

  attach(sender: MultiplayerWire) {
    if (this.statusValue === "ended") return;
    this.sender = sender;
    if (this.role === "host") this.refreshHostStatus();
    else {
      this.statusValue = "connected";
      this.publish();
    }
  }

  /** Register one authenticated guest seat on the host's peer mesh. */
  addGuest(peerId: string, owner: Owner, sender: MultiplayerWire): boolean {
    if (this.role !== "host" || owner === 0 || !peerId || [...this.guests.values()].some((guest) => guest.owner === owner && guest.peerId !== peerId)) return false;
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
    return true;
  }

  private refreshHostStatus(): void {
    if (this.role !== "host" || this.statusValue === "ended") return;
    const next: MultiplayerStatus = [...this.guests.values()].some((guest) => !guest.connected) ? "disconnected" : "connected";
    if (next === this.statusValue) return;
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
    if (this.role === "guest" && message.type === "resync" && isSimSnapshot(message.state, this.seed)) {
      this.pendingSnapshot = message.state;
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
    if (message.type === "intent") {
      const command = sanitizeCommand(message.command, false);
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
    return guest.owner;
  }

  syncSnapshot(): void {
    if (!this.pendingSnapshot) return;
    const snapshot = this.pendingSnapshot;
    this.pendingSnapshot = null;
    const local = this.snapshotSource?.();
    const state: SimState = {
      ...snapshot,
      viewOwner: this.owner,
      fog: local?.viewOwner === this.owner && local.width === snapshot.width && local.height === snapshot.height
        ? [...local.fog]
        : makeFog(snapshot.width, snapshot.height, 0),
    };
    if (state.result !== "playing") {
      state.result = state.winner === null ? "lost" : state.winner === this.owner ? "won" : "lost";
    }
    tickFog(state);
    this.snapshotConsumer?.(state);
  }

  canAdvance(state: SimState): boolean {
    this.syncSnapshot();
    if (!this.connected) return false;
    if (this.role === "host") return true;
    return this.frames.has(state.tick + 1);
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
    this.publish();
  }
}
