/**
 * One-off: empty the production database and leave a single administrator.
 *
 * Everything but the migration history is truncated, so the schema and Prisma's
 * record of which migrations have run both survive — the application keeps
 * working without a redeploy.
 *
 * The password is generated here and printed once. It is never written to a
 * file, and only its bcrypt hash reaches the database.
 */
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcryptjs'
import { randomInt } from 'node:crypto'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@astir.uz'
const PASSWORD_LENGTH = 20
// No look-alike characters: someone will read this out loud or retype it, and
// confusing O with 0 turns into a support request.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'

/** randomInt, not Math.random: this guards a production administrator. */
function generatePassword(): string {
  let out = ''
  for (let i = 0; i < PASSWORD_LENGTH; i += 1) out += ALPHABET[randomInt(ALPHABET.length)]
  return out
}

async function main() {
  // This truncates every table. It sits next to seed.ts, one tab-completion away
  // from it, and a stray run against production is unrecoverable — so it refuses
  // to do anything without being told, in words, what it is about to do.
  if (process.env.CONFIRM !== 'ERASE') {
    console.error('Скрипт стирает ВСЕ данные. Запуск: CONFIRM=ERASE tsx prisma/reset-production.ts')
    process.exit(1)
  }

  const url = process.env.DATABASE_URL ?? ''
  console.log('база: ' + (url.split('@')[1] ?? '(DATABASE_URL не задан)'))

  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `
  if (tables.length === 0) throw new Error('в схеме public не найдено ни одной таблицы — прерываю')

  const list = tables.map(t => `"public"."${t.tablename}"`).join(', ')
  // CASCADE because the tables reference each other; RESTART IDENTITY so any
  // sequence starts from scratch rather than continuing the old numbering.
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`)
  console.log(`очищено таблиц: ${tables.length}`)

  const password = generatePassword()
  const admin = await prisma.user.create({
    data: {
      email: ADMIN_EMAIL,
      passwordHash: await bcrypt.hash(password, 12),
      firstName: 'Администратор',
      lastName: 'Системы',
      role: 'ADMIN',
      // Without this the verification gate blocks the only account that exists.
      emailVerifiedAt: new Date()
    }
  })

  const remaining = await prisma.user.count()
  console.log(`пользователей в базе: ${remaining}`)
  console.log('')
  console.log('=== УЧЁТНЫЕ ДАННЫЕ (показаны один раз) ===')
  console.log(`логин:  ${admin.email}`)
  console.log(`пароль: ${password}`)
  console.log('=========================================')
}

main()
  .catch(err => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
