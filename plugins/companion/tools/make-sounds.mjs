// Writes the two crab chirps in ../assets as 16-bit mono WAV files.
// Original sounds, synthesised here from sine sweeps: no third-party audio.
// Run: node plugins/companion/tools/make-sounds.mjs
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const RATE = 22050
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets')

// One chirp: a short pitch sweep with a quick attack and an exponential tail.
function chirp(samples, at, dur, f0, f1, amp) {
  let phase = 0
  const n = Math.round(dur * RATE)
  const start = Math.round(at * RATE)
  for (let i = 0; i < n; i++) {
    const t = i / n
    const f = f0 + (f1 - f0) * t
    phase += (2 * Math.PI * f) / RATE
    const env = Math.min(1, i / (0.004 * RATE)) * Math.exp(-4.5 * t)
    // A touch of the second harmonic makes it clicky, like a little claw.
    const v = Math.sin(phase) * 0.8 + Math.sin(2 * phase) * 0.2
    samples[start + i] += v * env * amp
  }
}

function wav(name, length, parts) {
  const samples = new Float64Array(Math.round(length * RATE))
  for (const p of parts) chirp(samples, ...p)
  const data = Buffer.alloc(samples.length * 2)
  samples.forEach((s, i) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s)) * 32767), i * 2))
  const h = Buffer.alloc(44)
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8)
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22)
  h.writeUInt32LE(RATE, 24); h.writeUInt32LE(RATE * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34)
  h.write('data', 36); h.writeUInt32LE(data.length, 40)
  writeFileSync(join(out, name), Buffer.concat([h, data]))
}

// Done / waiting: two quick downward chirps.
wav('chirp.wav', 0.3, [[0, 0.09, 2600, 1900, 0.5], [0.12, 0.11, 2400, 1600, 0.45]])
// Celebration: three rising chirps.
wav('happy.wav', 0.5, [[0, 0.08, 1500, 2100, 0.4], [0.13, 0.08, 1900, 2600, 0.45], [0.26, 0.16, 2300, 3300, 0.5]])
