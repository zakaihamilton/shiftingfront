// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { AUDIO_SAMPLE_RATE } from "../../lib/audio/constants";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

class FakeParam {
  value = 0;
  readonly targets: Array<{ value: number; start: number; constant: number }> = [];
  setValueAtTime(value: number): void {
    this.value = value;
  }
  setTargetAtTime(value: number, start = 0, constant = 0): void {
    this.value = value;
    this.targets.push({ value, start, constant });
  }
  cancelScheduledValues(start: number): void {
    this.targets.splice(0, this.targets.length, ...this.targets.filter((target) => target.start < start));
  }
}

class FakeNode {
  context?: FakeAudioContext;
  readonly connections: FakeNode[] = [];
  readonly inputs: FakeNode[] = [];
  readonly gain = new FakeParam();
  readonly threshold = new FakeParam();
  readonly knee = new FakeParam();
  readonly ratio = new FakeParam();
  readonly attack = new FakeParam();
  readonly release = new FakeParam();

  connect(dest: FakeNode): FakeNode {
    this.connections.push(dest);
    dest.inputs.push(this);
    return dest;
  }

  disconnect(): void {
    for (const dest of this.connections) {
      const index = dest.inputs.indexOf(this);
      if (index >= 0) dest.inputs.splice(index, 1);
    }
    this.connections.length = 0;
  }
}

class FakeAudioContext {
  sampleRate = AUDIO_SAMPLE_RATE;
  currentTime = 0;
  destination = new FakeNode();
  failCompressor = false;

  constructor() {
    this.destination.context = this;
  }

  createGain(): FakeNode {
    const node = new FakeNode();
    node.context = this;
    return node;
  }

  createDynamicsCompressor(): FakeNode {
    if (this.failCompressor) throw new Error("compressor unavailable");
    const node = new FakeNode();
    node.context = this;
    return node;
  }
}

async function loadMixer(audio: FakeAudioContext) {
  vi.stubGlobal("window", {
    AudioContext: class {
      constructor() {
        return audio;
      }
    },
  });
  const context = await import("../../lib/audio/context");
  const mixer = await import("../../lib/audio/mixer");
  context.getAudioContext();
  return mixer;
}

describe("sfx mixer graph", () => {
  it("wires sfx through a limiter and makeup gain without duplicating the destination", async () => {
    const audio = new FakeAudioContext();
    const { getAudioBus, SFX_MAKEUP_GAIN, resetAudioMixerForTests } = await loadMixer(audio);

    const sfx = getAudioBus("sfx") as unknown as FakeNode;
    getAudioBus("sfx");
    getAudioBus("music");

    expect(audio.destination.inputs).toHaveLength(1);
    const master = audio.destination.inputs[0]!;
    expect(sfx.connections).toHaveLength(1);
    const limiter = sfx.connections[0]!;
    expect(limiter.connections).toHaveLength(1);
    const makeup = limiter.connections[0]!;
    expect(makeup.gain.value).toBe(SFX_MAKEUP_GAIN);
    expect(makeup.connections).toEqual([master]);
    expect(limiter.attack.value).toBe(0);
    expect(limiter.ratio.value).toBe(12);

    resetAudioMixerForTests();
    expect(audio.destination.inputs).toHaveLength(0);
  });

  it("does not leave a destination graph if limiter creation fails", async () => {
    const audio = new FakeAudioContext();
    audio.failCompressor = true;
    const { getAudioBus } = await loadMixer(audio);

    expect(() => getAudioBus("sfx")).toThrow(/compressor unavailable/);
    expect(audio.destination.inputs).toHaveLength(0);

    audio.failCompressor = false;
    const sfx = getAudioBus("sfx");
    expect(sfx).toBeTruthy();
    expect(audio.destination.inputs).toHaveLength(1);
  });

  it("ducks the music bus for heavy cues and schedules a smooth recovery", async () => {
    const audio = new FakeAudioContext();
    const { duckMusic, getAudioBus, setAudioLevels } = await loadMixer(audio);
    setAudioLevels({ musicVolume: 0.8 });
    const music = getAudioBus("music") as unknown as FakeNode;

    duckMusic(0.5, 0.2);

    expect(music.gain.value).toBe(0.8);
    expect(music.gain.targets.slice(-2)).toEqual([
      { value: 0.4, start: 0, constant: 0.018 },
      { value: 0.8, start: 0.2, constant: 0.08 },
    ]);
  });

  it("keeps ducking active when another sfx syncs the mixer", async () => {
    const audio = new FakeAudioContext();
    const { duckMusic, getAudioBus } = await loadMixer(audio);
    const music = getAudioBus("music") as unknown as FakeNode;

    duckMusic(0.5, 0.2);
    getAudioBus("sfx");

    expect(music.gain.targets.slice(-2)).toEqual([
      { value: 0.25, start: 0, constant: 0.018 },
      { value: 0.5, start: 0.2, constant: 0.08 },
    ]);
  });

  it("updates the recovery target when volume changes during a duck", async () => {
    const audio = new FakeAudioContext();
    const { duckMusic, getAudioBus, setAudioLevels } = await loadMixer(audio);
    const music = getAudioBus("music") as unknown as FakeNode;

    duckMusic(0.5, 0.2);
    setAudioLevels({ musicVolume: 0.3 });

    expect(music.gain.targets.slice(-2)).toEqual([
      { value: 0.15, start: 0, constant: 0.018 },
      { value: 0.3, start: 0.2, constant: 0.08 },
    ]);
  });

  it("mutes both buses while the page is out of the foreground", async () => {
    const audio = new FakeAudioContext();
    const { getAudioBus, setAudioForeground, setAudioLevels } = await loadMixer(audio);
    setAudioLevels({ musicVolume: 0.8, sfxVolume: 0.7 });
    const music = getAudioBus("music") as unknown as FakeNode;
    const sfx = getAudioBus("sfx") as unknown as FakeNode;

    setAudioForeground(false);

    expect(music.gain.value).toBe(0);
    expect(sfx.gain.value).toBe(0);

    setAudioForeground(true);

    expect(music.gain.value).toBe(0.8);
    expect(sfx.gain.value).toBe(0.7);
  });

  it("rebuilds the graph if the AudioContext instance changes", async () => {
    let currentAudio = new FakeAudioContext();
    vi.stubGlobal("window", {
      AudioContext: class {
        constructor() {
          return currentAudio;
        }
      },
    });
    const context = await import("../../lib/audio/context");
    const mixer = await import("../../lib/audio/mixer");
    context.getAudioContext();
    mixer.getAudioBus("sfx");
    expect(currentAudio.destination.inputs).toHaveLength(1);

    // Simulate AudioContext closing and a new context being created
    (currentAudio as unknown as { state: string }).state = "closed";
    currentAudio = new FakeAudioContext();
    context.getAudioContext();
    mixer.getAudioBus("sfx");
    expect(currentAudio.destination.inputs).toHaveLength(1);
  });
});
