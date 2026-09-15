// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

const resumeAudio = vi.hoisted(() => vi.fn(() => ({ currentTime: 0 })));
const getAudioContext = vi.hoisted(() => vi.fn<() => AudioContext | null>(() => null));
const peekAudioContext = vi.hoisted(() => vi.fn<() => AudioContext | null>(() => null));

vi.mock("../../lib/audio/context", () => ({
  getAudioContext,
  peekAudioContext,
  resumeAudio,
}));

import {
  advanceMusicTrack,
  applyPattern,
  ensureMusicPlaying,
  stopMusic,
  tickScheduler,
  TOTAL_CAMPAIGN_TRACKS,
} from "../../lib/audio/musicScheduler";
import {
  cue,
  missionIndex,
  pattern,
  seed,
  setEnabled,
  setPaused,
  setPattern,
  setTimer,
  setCue,
  setSeed,
  setMissionIndex,
  setTrackIndex,
  setStep,
  setNextNoteTime,
  step,
  trackIndex,
  transitioning,
  setTransitioning,
  setGraph,
} from "../../lib/audio/musicState";
import { composeMusic, TUTORIAL_MUSIC_MISSION, type MusicPattern } from "../../lib/audio/compose";
import { indexPattern } from "../../lib/audio/musicGraph";
import { setMusicCue, resetMusicPosition } from "../../lib/audio/music";

afterEach(() => {
  setEnabled(true);
  setPaused(true);
  setPattern(null);
  setTimer(null);
  setCue("menu");
  setSeed(0);
  setMissionIndex(0);
  setTrackIndex(0);
  setStep(0);
  setTransitioning(false);
  resumeAudio.mockClear();
  getAudioContext.mockClear();
  peekAudioContext.mockClear();
});

describe("music scheduler recovery", () => {
  it("resumes an unlocked context even when the scheduler already has a timer", () => {
    setPaused(false);
    setTimer(1);

    ensureMusicPlaying();

    expect(resumeAudio).toHaveBeenCalledOnce();
  });
});

function createMockAudioContext(currentTime = 0) {
  const param = () => ({
    value: 0.7,
    cancelScheduledValues: vi.fn(),
    setValueAtTime: vi.fn(),
    setTargetAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  });
  const node = () => ({
    gain: param(),
    frequency: param(),
    detune: param(),
    Q: param(),
    playbackRate: param(),
    pan: param(),
    buffer: null,
    connect: vi.fn(),
    disconnect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  });
  return {
    currentTime,
    sampleRate: 44100,
    destination: node(),
    createGain: () => node(),
    createBiquadFilter: () => node(),
    createOscillator: () => node(),
    createBufferSource: () => node(),
    createWaveShaper: () => node(),
    createDelay: () => node(),
    createConvolver: () => node(),
    createDynamicsCompressor: () => node(),
    createStereoPanner: () => node(),
  };
}

function createMockMusicGraph(p?: MusicPattern) {
  const param = () => ({
    value: 0.7,
    cancelScheduledValues: vi.fn(),
    setValueAtTime: vi.fn(),
    setTargetAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
  });
  const node = () => ({
    gain: param(),
    frequency: param(),
    pan: param(),
    delayTime: param(),
    stop: vi.fn(),
    disconnect: vi.fn(),
  });
  return {
    style: p ? p.style : composeMusic(0, "mission", 0).style,
    master: node(),
    highpass: node(),
    saturation: node(),
    compressor: node(),
    bassBus: node(),
    rhythmBus: node(),
    harmonyBus: node(),
    pulseBus: node(),
    leadBus: node(),
    counterBus: node(),
    fxBus: node(),
    bassDuck: node(),
    reverb: node(),
    reverbFilter: node(),
    reverbSend: node(),
    reverbWet: node(),
    delay: node(),
    delayFilter: node(),
    delayFeedback: node(),
    delayWet: node(),
    padGain: node(),
    padFilter: node(),
    padOscA: node(),
    padOscB: node(),
    padOscC: node(),
    padOscD: node(),
    padLfo: node(),
    padLfoGain: node(),
    padGate: node(),
    padPanA: node(),
    padPanB: node(),
    padPanC: node(),
    padPanD: node(),
    padReverbFilter: node(),
    padReverbGate: node(),
    padReverbSend: node(),
    padReverbVoices: [],
    padBase: 0.1,
    index: p
      ? indexPattern(p)
      : {
          notes: {
            bass: new Map(),
            pulse: new Map(),
            counter: new Map(),
            melody: new Map(),
          },
          drums: new Map(),
        },
  };
}

describe("automatic music track variety", () => {
  it("defines TOTAL_CAMPAIGN_TRACKS as 6 matching campaign missions", () => {
    expect(TOTAL_CAMPAIGN_TRACKS).toBe(6);
  });

  it("cycles smoothly across all 6 campaign tracks in mission cue", () => {
    const testSeed = 421;
    setCue("mission");
    setSeed(testSeed);
    setMissionIndex(0);
    setTrackIndex(0);
    setPattern(composeMusic(testSeed, "mission", 0));

    expect(trackIndex).toBe(0);
    expect(pattern?.style.name).toBe(composeMusic(testSeed, "mission", 0).style.name);

    // Advance across all 6 tracks
    for (let expected = 1; expected < TOTAL_CAMPAIGN_TRACKS; expected++) {
      advanceMusicTrack();
      expect(trackIndex).toBe(expected);
      expect(pattern).toEqual(composeMusic(testSeed, "mission", expected));
    }

    // Advancing after track 5 wraps back to track 0
    advanceMusicTrack();
    expect(trackIndex).toBe(0);
    expect(pattern).toEqual(composeMusic(testSeed, "mission", 0));
  });

  it("starts the cycle from the mission index where the player launched", () => {
    const testSeed = 888;
    setCue("mission");
    setSeed(testSeed);
    setMissionIndex(3);
    setTrackIndex(3);
    setPattern(composeMusic(testSeed, "mission", 3));

    advanceMusicTrack();
    expect(trackIndex).toBe(4);
    expect(pattern).toEqual(composeMusic(testSeed, "mission", 4));

    advanceMusicTrack();
    expect(trackIndex).toBe(5);

    advanceMusicTrack();
    expect(trackIndex).toBe(0);
  });

  it("does not advance on non-mission cues (menu, briefing, victory, defeat)", () => {
    const nonMissionCues = ["menu", "briefing", "victory", "defeat"] as const;
    for (const testCue of nonMissionCues) {
      setCue(testCue);
      setSeed(123);
      setMissionIndex(0);
      setTrackIndex(0);
      const initialPattern = composeMusic(123, testCue, 0);
      setPattern(initialPattern);

      advanceMusicTrack();

      expect(trackIndex).toBe(0);
      expect(pattern).toBe(initialPattern);
    }
  });

  it("does not advance on tutorial missions", () => {
    setCue("mission");
    setSeed(100);
    setMissionIndex(TUTORIAL_MUSIC_MISSION);
    setTrackIndex(TUTORIAL_MUSIC_MISSION);
    const initialPattern = composeMusic(100, "mission", TUTORIAL_MUSIC_MISSION);
    setPattern(initialPattern);

    advanceMusicTrack();

    expect(trackIndex).toBe(TUTORIAL_MUSIC_MISSION);
    expect(pattern).toBe(initialPattern);
  });

  it("synchronizes trackIndex when setMusicCue is called", () => {
    setMusicCue("mission", 555, 2);

    expect(cue).toBe("mission");
    expect(seed).toBe(555);
    expect(missionIndex).toBe(2);
    expect(trackIndex).toBe(2);
    expect(pattern).toEqual(composeMusic(555, "mission", 2));
  });

  it("resets trackIndex when resetMusicPosition is called", () => {
    setMusicCue("mission", 555, 4);
    expect(trackIndex).toBe(4);

    resetMusicPosition();

    expect(cue).toBe("menu");
    expect(missionIndex).toBe(0);
    expect(trackIndex).toBe(0);
    expect(step).toBe(0);
    expect(transitioning).toBe(false);
  });

  it("handles transitioning flag during applyPattern crossfade and resets on stopMusic", () => {
    vi.useFakeTimers();
    try {
      const fakeAudio = { currentTime: 5.0 };
      getAudioContext.mockReturnValue(fakeAudio as unknown as AudioContext);
      setTimer(123);
      setPattern(composeMusic(421, "mission", 0));
      (setTransitioning as (v: boolean) => void)(false);

      const fakeGraph = createMockMusicGraph();
      // @ts-expect-error test mock
      setGraph(fakeGraph);

      expect(transitioning).toBe(false);

      const next = composeMusic(421, "mission", 1);
      applyPattern(next);

      // Transition is now active (fade-out in progress)
      expect(transitioning).toBe(true);
      expect(fakeGraph.master.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0.001, 5.0 + 0.275);

      // Advance timers past the crossfade midpoint (275ms)
      vi.advanceTimersByTime(300);

      // Transition is now complete
      expect(transitioning).toBe(false);
      expect(pattern).toEqual(next);
      expect(step).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("clears transitioning immediately if stopMusic is called during a fade", () => {
    vi.useFakeTimers();
    try {
      getAudioContext.mockReturnValue({ currentTime: 2.0 } as unknown as AudioContext);
      setTimer(456);
      const initialPattern = composeMusic(421, "mission", 0);
      setPattern(initialPattern);

      const fakeGraph = createMockMusicGraph();
      // @ts-expect-error test mock
      setGraph(fakeGraph);

      const next = composeMusic(421, "mission", 1);
      applyPattern(next);
      expect(transitioning).toBe(true);

      // Call stopMusic before the fade timeout finishes
      stopMusic();
      // Advance timers
      vi.advanceTimersByTime(300);

      expect(transitioning).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("automatically advances the music track when the pattern reaches the loop boundary", () => {
    vi.useFakeTimers();
    try {
      const fakeAudio = createMockAudioContext(100.0);
      getAudioContext.mockReturnValue(fakeAudio as unknown as AudioContext);
      setTimer(789);
      setCue("mission");
      setSeed(421);
      setMissionIndex(0);
      setTrackIndex(0);
      const initialPattern = composeMusic(421, "mission", 0);
      setPattern(initialPattern);

      const fakeGraph = createMockMusicGraph(initialPattern);
      // @ts-expect-error test mock
      setGraph(fakeGraph);

      // Set scheduler right at the final step before wrap-around (p.steps - 1)
      setStep(initialPattern.steps - 1);
      setNextNoteTime(100.0); // Within schedule-ahead window (100.0 < 100.0 + 0.2)

      expect(trackIndex).toBe(0);

      // Tick scheduler
      tickScheduler();

      // Upon reaching step 0 from p.steps - 1, advanceMusicTrack was automatically called
      expect(trackIndex).toBe(1);
      expect(transitioning).toBe(true);

      // Complete crossfade
      vi.advanceTimersByTime(300);
      expect(transitioning).toBe(false);
      expect(pattern).toEqual(composeMusic(421, "mission", 1));
      expect(step).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

