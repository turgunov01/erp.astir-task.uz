import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

/**
 * Shared plumbing for the showcase seed.
 *
 * A plain client, not the one from src/lib/prisma: that one hides archived
 * and soft-deleted rows, and a seed must see everything it created on the
 * previous run to stay re-runnable.
 */
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
export const prisma = new PrismaClient({ adapter })

/** Project code every showcase row hangs off; `--reset` deletes by it. */
export const PROJECT_CODE = 'AST-001'

/** Day 0 of the production calendar: the brief meeting. */
export const START = new Date('2026-05-04T09:00:00+05:00')

/** A moment `offset` days after START, at the given studio-local time. */
export function day(offset: number, hour = 10, minute = 0): Date {
  const date = new Date(START)
  date.setDate(date.getDate() + offset)
  date.setHours(hour, minute, 0, 0)
  return date
}

export function addDays(date: Date, days: number): Date {
  const copy = new Date(date)
  copy.setDate(copy.getDate() + days)
  return copy
}

let seedCounter = 0
/** Deterministic pseudo-random in [0,1) so reruns produce the same shape. */
export function rnd(): number {
  seedCounter += 1
  const x = Math.sin(seedCounter * 12.9898) * 43758.5453
  return x - Math.floor(x)
}
export function pick<T>(items: readonly T[]): T {
  return items[Math.floor(rnd() * items.length)] as T
}
export function between(min: number, max: number): number {
  return min + Math.floor(rnd() * (max - min + 1))
}

export function log(line: string) {
  console.log('  ' + line)
}
