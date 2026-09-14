export type { StorageAdapter } from "./save/storage";
export {
  safeGetItem,
  safeSetItem,
  safeRemoveItem,
  safeKeys,
  memoryStorage,
  localStorageAdapter,
  cachedLocalStorage,
  sessionStorageAdapter,
  cachedSessionStorage,
} from "./save/storage";

export {
  SAVE_CONTENT_VERSION,
} from "./save/validation";

export {
  SAVE_VERSION,
  type SaveMeta,
  saveKey,
  serializeState,
  deserializeState,
  decodeSave,
  decodeSavedState,
} from "./save/serialize";

export {
  writeSave,
  hasSaveForSeed,
  readSave,
  removeSave,
  listUnreadableSaves,
  listSaves,
} from "./save/api";

export {
  SLOT_PREFIX,
  SLOT_VERSION,
  SLOT_NAME_MAX,
  SLOT_IMPORT_MAX_BYTES,
  SLOT_ID_PATTERN,
  type SlotMeta,
  type ParsedSlot,
  type ArchiveEntry,
  type SlotWriteResult,
  slotKey,
  isSlotId,
  normalizeSlotName,
  defaultSlotName,
  createSlotId,
  exportSlot,
  importSlot,
  writeSlot,
  readSlot,
  removeSlot,
  listSlots,
  listUnreadableSlots,
  listArchiveEntries,
  listPauseLoadEntries,
  hasLoadableSaves,
} from "./save/slots";

export {
  createSaveSession,
  saveStorageSnapshot,
  type SaveSession,
  type SaveStorageSnapshot,
  type SaveWriteMode,
  type SaveWriteStatus,
} from "./save/session";
