import { CHECK_HISTORY_LIMIT, STATE_CHECK_INTERVAL, stateChecksum, validChecksum } from "../checksum";
import { makeFog, tickFog } from "@/lib/sim/fog";
import type { Owner, SimState } from "@/lib/types";
import { isSimSnapshot, SKIRMISH_MATCH_SETTINGS } from "../protocol";
import type { MultiplayerRole, MultiplayerStatus, MultiplayerWire } from "../protocol";

type Repair = { at: number; tick: number; checksum: string; report: string; verified: boolean };

function monotonicNow(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

/** Owns checksums, snapshot staging, repair verification, and the guest resync request. */
export class MultiplayerSynchronization {
  private checks = new Map<number, string>();
  private remoteChecks = new Map<number, string>();
  private reportedChecks = new Set<number>();
  private repairs = new Map<string, Repair>();
  private pendingSnapshot: SimState | null = null;
  private pendingSnapshotChecksum: string | null = null;
  private installedSnapshotTick = -1;
  private resyncRequested = false;
  private snapshotSource: (() => SimState) | null = null;
  private snapshotConsumer: ((state: SimState) => void) | null = null;

  constructor(private readonly options: {
    role: MultiplayerRole;
    owner: Owner;
    seed: number;
    owners: readonly Owner[];
    aiOwners: readonly Owner[];
    sender: () => MultiplayerWire;
    status: () => MultiplayerStatus;
    broadcast: (value: unknown) => void;
    sendToPeer: (peerId: string, value: unknown) => void;
    publish: () => void;
    end: () => void;
    setNotice: (notice: string) => void;
    installTick: (tick: number) => void;
  }) {}

  bindState(source: () => SimState, consume: (state: SimState) => void): void {
    this.snapshotSource = source;
    this.snapshotConsumer = consume;
    this.checkState(source(), true);
  }

  receiveGuest(message: Record<string, unknown>): boolean {
    if (message.type === "state-check") {
      if (this.validCheck(message) && Number(message.tick) > this.installedSnapshotTick) {
        this.remoteChecks.set(Number(message.tick), message.checksum as string);
        this.trimChecks(this.remoteChecks);
        this.compareCheck(Number(message.tick));
      }
      return true;
    }
    if (message.type === "resync") {
      const localState = this.snapshotSource?.();
      if (message.protocolVersion !== SKIRMISH_MATCH_SETTINGS.protocolVersion || !validChecksum(message.checksum)) return true;
      if (isSimSnapshot(message.state, this.options.seed, this.options.owners, this.options.aiOwners, localState)) {
        this.pendingSnapshot = message.state;
        this.pendingSnapshotChecksum = message.checksum;
        this.options.setNotice("Synchronizing with the host…");
        this.options.publish();
      }
      return true;
    }
    return false;
  }

  receiveHost(peerId: string, message: Record<string, unknown>): boolean {
    if (message.type === "desync") {
      if (!this.validCheck(message)) return true;
      const tick = Number(message.tick);
      const expected = this.checks.get(tick);
      if (!expected || expected === message.checksum) return true;
      const previous = this.repairs.get(peerId);
      const now = monotonicNow();
      if (previous?.tick === tick && previous.report === message.checksum) return true;
      if (previous && previous.verified && now - previous.at < 60_000) { this.fail(); return true; }
      if (previous && (!previous.verified || tick <= previous.tick)) return true;
      const state = this.snapshotSource?.();
      if (state) {
        const checksum = stateChecksum(state);
        this.repairs.set(peerId, { at: now, tick: state.tick, checksum, report: message.checksum as string, verified: false });
        this.options.setNotice("Synchronizing a player with the host…");
        this.options.publish();
        this.options.sendToPeer(peerId, this.createSnapshotMessage(state, checksum));
      }
      return true;
    }
    if (message.type === "resync-check") {
      if (this.validCheck(message) && typeof message.verified === "boolean") {
        const repair = this.repairs.get(peerId);
        if (repair && repair.tick === message.tick && !repair.verified) {
          if (!message.verified || repair.checksum !== message.checksum) { this.fail(); return true; }
          repair.verified = true;
          this.options.setNotice("Synchronization restored.");
          this.options.publish();
        }
      }
      return true;
    }
    return false;
  }

  sendSnapshotToPeer(peerId: string): void {
    const state = this.snapshotSource?.();
    if (state) this.options.sendToPeer(peerId, this.snapshotMessage(state));
  }

  snapshotMessage(state: SimState) {
    return this.createSnapshotMessage(state);
  }

  resetChecks(): void {
    this.checks.clear();
    this.remoteChecks.clear();
    this.reportedChecks.clear();
  }

  clearLocalChecks(): void {
    this.checks.clear();
  }

  /** Capture checks after a completed tick, never from a mutable queued reference. */
  checkState(state: SimState, force = false): void {
    if (!force && state.tick % STATE_CHECK_INTERVAL !== 0 && state.result === "playing") return;
    if (this.options.status() === "ended" || this.checks.has(state.tick)) return;
    const checksum = stateChecksum(state);
    this.checks.set(state.tick, checksum);
    this.trimChecks(this.checks);
    if (this.options.role === "host") this.options.broadcast({ type: "state-check", protocolVersion: SKIRMISH_MATCH_SETTINGS.protocolVersion, tick: state.tick, checksum });
    else this.compareCheck(state.tick);
  }

  /** Install a staged guest snapshot at the frame boundary and verify it before resuming. */
  syncSnapshot(): boolean {
    for (const repair of this.repairs.values()) {
      if (!repair.verified && monotonicNow() - repair.at >= 60_000) this.fail();
    }
    if (!this.pendingSnapshot) return false;
    const snapshot = this.pendingSnapshot;
    this.pendingSnapshot = null;
    const expectedChecksum = this.pendingSnapshotChecksum;
    this.pendingSnapshotChecksum = null;
    this.resyncRequested = false;
    this.options.installTick(snapshot.tick);
    const local = this.snapshotSource?.();
    const state: SimState = {
      ...snapshot,
      viewOwner: this.options.owner,
      controlGroups: local?.controlGroups ?? {},
      fog: local?.viewOwner === this.options.owner && local.width === snapshot.width && local.height === snapshot.height
        ? [...local.fog]
        : makeFog(snapshot.width, snapshot.height, 0),
    };
    if (state.result !== "playing" || (state.multiplayerOwners && !state.multiplayerOwners.includes(this.options.owner))) {
      state.result = state.winner === null ? "lost" : state.winner === this.options.owner ? "won" : "lost";
    }
    tickFog(state);
    const checksum = stateChecksum(state);
    if (checksum !== expectedChecksum) {
      try { this.options.sender().send({ type: "resync-check", protocolVersion: SKIRMISH_MATCH_SETTINGS.protocolVersion, tick: state.tick, checksum, verified: false }); } catch {}
      this.fail();
      return false;
    }
    this.resetChecks();
    this.installedSnapshotTick = state.tick;
    this.snapshotConsumer?.(state);
    try { this.options.sender().send({ type: "resync-check", protocolVersion: SKIRMISH_MATCH_SETTINGS.protocolVersion, tick: state.tick, checksum, verified: true }); } catch {}
    this.options.setNotice("Synchronization restored.");
    this.options.publish();
    return true;
  }

  requestResync(): void {
    if (this.options.role !== "guest" || this.resyncRequested) return;
    this.resyncRequested = true;
    try {
      this.options.sender().send({ type: "resume" });
    } catch {
      this.resyncRequested = false;
    }
  }

  private validCheck(message: Record<string, unknown>): boolean {
    return message.protocolVersion === SKIRMISH_MATCH_SETTINGS.protocolVersion &&
      Number.isSafeInteger(message.tick) && Number(message.tick) >= 0 && validChecksum(message.checksum);
  }

  private trimChecks(checks: Map<number, string>): void {
    while (checks.size > CHECK_HISTORY_LIMIT) checks.delete(Math.min(...checks.keys()));
  }

  private createSnapshotMessage(state: SimState, checksum = stateChecksum(state)) {
    return { type: "resync", protocolVersion: SKIRMISH_MATCH_SETTINGS.protocolVersion, state: structuredClone(state), checksum };
  }

  private compareCheck(tick: number): void {
    const own = this.checks.get(tick);
    const remote = this.remoteChecks.get(tick);
    if (!own || !remote || own === remote || this.reportedChecks.has(tick)) return;
    this.reportedChecks.add(tick);
    while (this.reportedChecks.size > CHECK_HISTORY_LIMIT) this.reportedChecks.delete(this.reportedChecks.values().next().value!);
    this.options.sender().send({ type: "desync", protocolVersion: SKIRMISH_MATCH_SETTINGS.protocolVersion, tick, checksum: own });
  }

  private fail(): void {
    this.options.setNotice("Synchronization failed. Reload all players before starting another match.");
    if (this.options.role === "host") this.options.broadcast({ type: "ended", reason: "synchronization_failed" });
    this.options.end();
  }
}
