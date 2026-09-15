'use strict'
/**
 * Lay the narration clips onto the recorded walkthrough.
 *
 * timeline.json (written by record-prod.cjs) says when each step began;
 * every clip is delayed to its step's start and the result is mixed into one
 * track, then encoded next to the video as H.264 + AAC.
 *
 *   node scripts/demo/mux.mjs [media/astir-erp-demo-prod-raw.webm] [media/astir-erp-demo-prod.mp4]
 */
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join, dirname } from 'node:path'

const input = process.argv[2] ?? 'media/astir-erp-demo-prod-raw.webm'
const output = process.argv[3] ?? 'media/astir-erp-demo-prod.mp4'
const narration = join(dirname(input), 'narration')
const timeline = JSON.parse(readFileSync(join(narration, 'timeline.json'), 'utf8'))

const args = ['-y', '-i', input]
const delays = []
timeline.forEach((step, index) => {
  args.push('-i', join(narration, step.id + '.wav'))
  const ms = Math.max(0, Math.round(step.start + 300))
  delays.push('[' + (index + 1) + ':a]adelay=' + ms + '|' + ms + '[a' + index + ']')
})
const mix = delays.map((_, index) => '[a' + index + ']').join('') + 'amix=inputs=' + delays.length + ':duration=longest:normalize=0[voice]'
const filter = delays.join(';') + ';' + mix + ';[voice]volume=1.6,aresample=48000[aout]'
args.push('-filter_complex', filter, '-map', '0:v', '-map', '[aout]', '-c:v', 'libx264', '-preset', 'medium', '-crf', '22', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', '-shortest', output)
const result = spawnSync('ffmpeg', args, { stdio: ['ignore', 'inherit', 'pipe'], encoding: 'utf8' })
if (result.status !== 0) {
  console.error(result.stderr.split('\n').slice(-12).join('\n'))
  process.exit(result.status ?? 1)
}
console.log('muxed ' + timeline.length + ' clips into ' + output)
