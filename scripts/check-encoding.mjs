#!/usr/bin/env node
// Fails when a tracked file contains Russian text that was saved as UTF-8,
// read back as Windows-1251 and saved again, so every letter becomes a pair
// such as "Р" plus a symbol. That happens when a file is rewritten by a tool
// that uses the ANSI code page, and the result ships to users as gibberish.
//
//   node scripts/check-encoding.mjs          check every tracked text file
//   node scripts/check-encoding.mjs --fix    rewrite the damaged runs in place

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const BINARY = /\.(png|jpe?g|gif|webp|avif|ico|mp4|webm|mov|mp3|wav|woff2?|ttf|otf|gz|tar|zip|pdf)$/i
const MIN_RUN = 4

// Byte value of every character in the Windows-1251 code page.
const decoder1251 = new TextDecoder('windows-1251')
const byteOf = new Map()
for (let b = 0; b < 256; b++) byteOf.set(decoder1251.decode(Uint8Array.of(b)), b)

// A UTF-8 Cyrillic letter is two bytes, 0xD0/0xD1 then 0x80–0xBF. Read as
// Windows-1251 that is "Р" or "С" followed by a character from the upper half.
const DAMAGED_RUN = /(?:[РС][Ѐ-џ -¿‐-™Ґґ])+/g

function repair(run) {
  if (run.length < MIN_RUN) return null
  const bytes = [...run].map(ch => byteOf.get(ch))
  if (bytes.some(b => b === undefined)) return null
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bytes))
  } catch {
    return null
  }
}

const shouldFix = process.argv.includes('--fix')
const files = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
  .split('\n')
  .filter(file => file && !BINARY.test(file))

let damaged = 0
for (const file of files) {
  let source
  try {
    source = readFileSync(file, 'utf8')
  } catch {
    continue
  }
  const fixed = source.replace(DAMAGED_RUN, run => {
    const text = repair(run)
    if (text === null) return run
    damaged++
    console.log(`${file}: ${run} -> ${text}`)
    return text
  })
  if (shouldFix && fixed !== source) writeFileSync(file, fixed)
}

if (damaged === 0) {
  console.log('encoding: no damaged Cyrillic text')
} else if (shouldFix) {
  console.log(`encoding: repaired ${damaged} damaged run(s)`)
} else {
  console.error(`encoding: ${damaged} damaged run(s); run with --fix`)
  process.exit(1)
}
