import type { AiBehavior, AiContact, MultiplayerAiMemory, Owner, SimState } from "../../types";

export function multiplayerAiMemory(state: SimState, owner: Owner): MultiplayerAiMemory {
  if (!state.multiplayer) throw new Error("Multiplayer AI memory requires a multiplayer state");
  const memory = state.multiplayerAiMemory ?? {};
  if (!state.multiplayerAiMemory) state.multiplayerAiMemory = memory;
  let ownerMemory = memory[owner];
  if (!ownerMemory) {
    ownerMemory = {};
    memory[owner] = ownerMemory;
  }
  return ownerMemory;
}

export function aiBehavior(state: SimState, owner: Owner): AiBehavior | undefined {
  return state.multiplayer ? multiplayerAiMemory(state, owner).behavior : state.aiState;
}

export function setAiBehavior(state: SimState, owner: Owner, behavior: AiBehavior): void {
  if (state.multiplayer) multiplayerAiMemory(state, owner).behavior = behavior;
  else state.aiState = behavior;
}

export function aiRetreatTick(state: SimState, owner: Owner): number | undefined {
  return state.multiplayer ? multiplayerAiMemory(state, owner).retreatTick : state.aiRetreatTick;
}

export function setAiRetreatTick(state: SimState, owner: Owner, tick: number | undefined): void {
  if (state.multiplayer) multiplayerAiMemory(state, owner).retreatTick = tick;
  else state.aiRetreatTick = tick;
}

export function aiRetreatLocked(state: SimState, owner: Owner): boolean {
  return state.multiplayer ? multiplayerAiMemory(state, owner).retreatLocked === true : state.aiRetreatLocked === true;
}

export function setAiRetreatLocked(state: SimState, owner: Owner, locked: boolean | undefined): void {
  if (state.multiplayer) multiplayerAiMemory(state, owner).retreatLocked = locked;
  else state.aiRetreatLocked = locked;
}

export function aiContacts(state: SimState, owner: Owner): Record<string, AiContact> {
  if (state.multiplayer) {
    const memory = multiplayerAiMemory(state, owner);
    if (!memory.contacts) memory.contacts = {};
    return memory.contacts;
  }
  if (!state.aiContacts) state.aiContacts = {};
  return state.aiContacts;
}
