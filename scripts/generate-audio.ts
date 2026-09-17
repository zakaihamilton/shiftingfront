import fs from "fs";
import path from "path";

function generateRetroSoundtrack(durationSec = 20, sampleRate = 44100): Buffer {
  const numSamples = Math.floor(durationSec * sampleRate);
  const numChannels = 2;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numSamples * blockAlign;

  const buffer = Buffer.alloc(44 + dataSize);

  // WAV Header
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16); // PCM chunk size
  buffer.writeUInt16LE(1, 20);  // Format: PCM
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(16, 34); // Bits per sample
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  // Music timing: 130 BPM (approx 0.4615s per beat, 0.115s per 16th note)
  const bpm = 130;
  const beatSec = 60 / bpm;
  const sixteenthSec = beatSec / 4;

  // Bass frequencies (A minor pentatonic: A1, C2, D2, E2, G2)
  const bassNotes = [55, 65.4, 73.4, 82.4, 98];

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;

    // 1. Kick Drum (on beats 0, 1, 2, 3)
    const beatPos = (t % beatSec) / beatSec;
    const kickEnv = Math.max(0, 1 - beatPos * 4);
    const kickFreq = 140 * Math.exp(-beatPos * 18) + 40;
    const kick = Math.sin(2 * Math.PI * kickFreq * t) * kickEnv * 0.45;

    // 2. Industrial Snare / Clang (on beats 1 and 3)
    const measureBeat = Math.floor(t / beatSec) % 2;
    let snare = 0;
    if (measureBeat === 1 && beatPos < 0.3) {
      const snareEnv = Math.exp(-beatPos * 12);
      const snareNoise = (Math.random() * 2 - 1) * 0.25;
      const snareTone = Math.sin(2 * Math.PI * 220 * t) * 0.15;
      snare = (snareNoise + snareTone) * snareEnv;
    }

    // 3. Rolling 16th-note Synth Bassline (Classic C&C style)
    const sixteenthIndex = Math.floor(t / sixteenthSec);
    const noteFreq = bassNotes[sixteenthIndex % bassNotes.length];
    const notePos = (t % sixteenthSec) / sixteenthSec;
    const noteEnv = Math.max(0, 1 - notePos * 1.5);
    // Sawtooth-ish wave
    const sawPhase = (t * noteFreq) % 1;
    const bassSynth = (sawPhase * 2 - 1) * noteEnv * 0.25;

    // 4. Radio squelch / static clicks at transitions (0s, 3.2s, 7.5s, 12.5s, 16.5s)
    let squelch = 0;
    const transitionTimes = [0.05, 3.2, 7.5, 12.5, 16.5];
    for (const trans of transitionTimes) {
      if (t >= trans && t < trans + 0.12) {
        const transPos = (t - trans) / 0.12;
        squelch = (Math.random() * 2 - 1) * 0.2 * (1 - transPos);
      }
    }

    // 5. High-tension alarm pulse in Scene 4 (12.5s - 16.5s)
    let alarm = 0;
    if (t >= 12.5 && t < 16.5) {
      const alarmCycle = (t * 3) % 1;
      const alarmFreq = 880 + (alarmCycle > 0.5 ? 200 : 0);
      alarm = Math.sin(2 * Math.PI * alarmFreq * t) * 0.08 * (1 - (alarmCycle % 0.5) * 2);
    }

    // Master Mix
    let mix = (kick + snare + bassSynth + squelch + alarm) * 0.85;

    // Fade out at end
    if (t > 18.5) {
      mix *= Math.max(0, (20 - t) / 1.5);
    }

    // Clamp
    mix = Math.max(-0.95, Math.min(0.95, mix));

    const sample16 = Math.floor(mix * 32767);
    buffer.writeInt16LE(sample16, offset);     // Left
    buffer.writeInt16LE(sample16, offset + 2); // Right
    offset += 4;
  }

  return buffer;
}

const wavBuffer = generateRetroSoundtrack(20, 44100);
const outPath = path.resolve("brag-output/soundtrack.wav");
fs.writeFileSync(outPath, wavBuffer);
console.log(`Generated 20s 130BPM soundtrack at: ${outPath} (${(wavBuffer.length / 1024 / 1024).toFixed(2)} MB)`);
