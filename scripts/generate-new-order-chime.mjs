import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const sampleRate = 44_100;
const durationSeconds = 1.48;
const sampleCount = Math.round(sampleRate * durationSeconds);
const frequencies = [659.25, 783.99, 987.77, 1318.51];
const starts = [0, 0.22, 0.48, 0.92];
const durations = [0.42, 0.46, 0.62, 0.52];
const samples = new Float64Array(sampleCount);

for (let voice = 0; voice < frequencies.length; voice += 1) {
  const startSample = Math.round(starts[voice] * sampleRate);
  const voiceSamples = Math.round(durations[voice] * sampleRate);
  for (let offset = 0; offset < voiceSamples && startSample + offset < sampleCount; offset += 1) {
    const time = offset / sampleRate;
    const progress = offset / voiceSamples;
    const attack = Math.min(1, progress / 0.04);
    const release = Math.pow(Math.max(0, 1 - progress), 1.8);
    const envelope = attack * release;
    const fundamental = Math.sin(2 * Math.PI * frequencies[voice] * time);
    const harmonic = Math.sin(2 * Math.PI * frequencies[voice] * 2 * time) * 0.22;
    samples[startSample + offset] += (fundamental + harmonic) * envelope;
  }
}

let absolutePeak = 0;
for (const sample of samples) absolutePeak = Math.max(absolutePeak, Math.abs(sample));
const targetPeak = 0.86;
const normalization = absolutePeak > 0 ? targetPeak / absolutePeak : 1;
const dataSize = sampleCount * 2;
const wav = Buffer.alloc(44 + dataSize);

wav.write('RIFF', 0);
wav.writeUInt32LE(36 + dataSize, 4);
wav.write('WAVE', 8);
wav.write('fmt ', 12);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(sampleRate, 24);
wav.writeUInt32LE(sampleRate * 2, 28);
wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34);
wav.write('data', 36);
wav.writeUInt32LE(dataSize, 40);

for (let index = 0; index < sampleCount; index += 1) {
  const normalized = Math.max(-1, Math.min(1, samples[index] * normalization));
  wav.writeInt16LE(Math.round(normalized * 32767), 44 + index * 2);
}

const output = resolve('apps/web-tenant/android/app/src/main/res/raw/new_order_chime.wav');
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, wav);
process.stdout.write(`Generated ${output}\nduration=${durationSeconds}s peak=${targetPeak} samples=${sampleCount}\n`);
