import bcrypt from 'bcryptjs'
import { DEFAULT_DEPARTMENTS, PROJECT_TEMPLATES } from '@astir/config'
import { attachNext } from './media'
import { day, log, prisma } from './lib'

/**
 * The studio itself: departments, the team, the client and studio settings.
 *
 * Everything is keyed on a natural key (department name, e-mail, client
 * name) so a rerun updates rather than duplicates.
 */
export const PASSWORD = process.env.SHOWCASE_PASSWORD ?? 'astir-demo'

interface StaffSeed {
  key: string
  email: string
  firstName: string
  lastName: string
  role: 'OWNER' | 'PRODUCER' | 'PROJECT_MANAGER' | 'ART_DIRECTOR' | 'FINANCE' | 'ARTIST'
  position: string
  department: string
  rate: number | null
  employment?: 'FULL_TIME' | 'PART_TIME' | 'FREELANCE'
  hiredDaysBefore: number
  phone: string
}

const STAFF: readonly StaffSeed[] = [
  { key: 'owner', email: 'owner@astir.uz', firstName: 'Азиз', lastName: 'Каримов', role: 'OWNER', position: 'Основатель студии', department: 'Management', rate: null, hiredDaysBefore: 1400, phone: '+998 90 100 00 01' },
  { key: 'producer', email: 'producer@astir.uz', firstName: 'Тимур', lastName: 'Юсупов', role: 'PRODUCER', position: 'Исполнительный продюсер', department: 'Production', rate: 45, hiredDaysBefore: 1100, phone: '+998 90 100 00 02' },
  { key: 'pm', email: 'pm@astir.uz', firstName: 'Камила', lastName: 'Назарова', role: 'PROJECT_MANAGER', position: 'Проектный менеджер', department: 'Production', rate: 35, hiredDaysBefore: 800, phone: '+998 90 100 00 03' },
  { key: 'ad', email: 'art@astir.uz', firstName: 'Руслан', lastName: 'Абдуллаев', role: 'ART_DIRECTOR', position: 'Арт-директор', department: '2D', rate: 40, hiredDaysBefore: 1200, phone: '+998 90 100 00 04' },
  { key: 'finance', email: 'finance@astir.uz', firstName: 'Малика', lastName: 'Турсунова', role: 'FINANCE', position: 'Финансовый менеджер', department: 'Finance', rate: 30, hiredDaysBefore: 900, phone: '+998 90 100 00 05' },
  { key: 'gulnora', email: 'gulnora@astir.uz', firstName: 'Гульнора', lastName: 'Ахмедова', role: 'ARTIST', position: 'Сторибордист', department: '2D', rate: 25, hiredDaysBefore: 600, phone: '+998 90 100 00 06' },
  { key: 'bekzod', email: 'bekzod@astir.uz', firstName: 'Бекзод', lastName: 'Исмоилов', role: 'ARTIST', position: '3D-моделлер', department: 'Modeling', rate: 25, hiredDaysBefore: 700, phone: '+998 90 100 00 07' },
  { key: 'zilola', email: 'zilola@astir.uz', firstName: 'Зилола', lastName: 'Умарова', role: 'ARTIST', position: 'Художник по текстурам', department: 'Modeling', rate: 23, employment: 'PART_TIME', hiredDaysBefore: 300, phone: '+998 90 100 00 08' },
  { key: 'sardor', email: 'sardor@astir.uz', firstName: 'Сардор', lastName: 'Эргашев', role: 'ARTIST', position: 'Риггер', department: 'Rigging', rate: 26, hiredDaysBefore: 650, phone: '+998 90 100 00 09' },
  { key: 'marat', email: 'marat@astir.uz', firstName: 'Марат', lastName: 'Юлдашев', role: 'ARTIST', position: 'Layout-артист', department: '3D', rate: 24, hiredDaysBefore: 400, phone: '+998 90 100 00 10' },
  { key: 'anna', email: 'anna@astir.uz', firstName: 'Анна', lastName: 'Волкова', role: 'ARTIST', position: 'Старший аниматор', department: 'Animation', rate: 28, hiredDaysBefore: 1000, phone: '+998 90 100 00 11' },
  { key: 'shohruh', email: 'shohruh@astir.uz', firstName: 'Шохрух', lastName: 'Назаров', role: 'ARTIST', position: 'FX-артист', department: '3D', rate: 30, employment: 'FREELANCE', hiredDaysBefore: 200, phone: '+998 90 100 00 12' },
  { key: 'nigora', email: 'nigora@astir.uz', firstName: 'Нигора', lastName: 'Саидова', role: 'ARTIST', position: 'Художник по свету', department: 'Lighting', rate: 27, hiredDaysBefore: 500, phone: '+998 90 100 00 13' },
  { key: 'sherzod', email: 'sherzod@astir.uz', firstName: 'Шерзод', lastName: 'Мирзаев', role: 'ARTIST', position: 'Render TD', department: 'Rendering', rate: 29, hiredDaysBefore: 450, phone: '+998 90 100 00 14' },
  { key: 'javohir', email: 'javohir@astir.uz', firstName: 'Жавохир', lastName: 'Кодиров', role: 'ARTIST', position: 'Композер', department: 'Compositing', rate: 26, hiredDaysBefore: 550, phone: '+998 90 100 00 15' },
  { key: 'dilshod', email: 'dilshod@astir.uz', firstName: 'Дилшод', lastName: 'Рустамов', role: 'ARTIST', position: 'Саунд-дизайнер', department: 'Sound', rate: 27, employment: 'FREELANCE', hiredDaysBefore: 250, phone: '+998 90 100 00 16' },
  { key: 'farrux', email: 'farrux@astir.uz', firstName: 'Фаррух', lastName: 'Собиров', role: 'ARTIST', position: 'Монтажёр', department: 'Editing', rate: 26, hiredDaysBefore: 350, phone: '+998 90 100 00 17' }
]

/** Which team member normally owns each pipeline department. */
export const DEPARTMENT_LEAD: Record<string, string> = {
  Management: 'pm',
  Production: 'pm',
  '2D': 'gulnora',
  '3D': 'marat',
  Animation: 'anna',
  Modeling: 'bekzod',
  Rigging: 'sardor',
  Lighting: 'nigora',
  Rendering: 'sherzod',
  Compositing: 'javohir',
  Sound: 'dilshod',
  Editing: 'farrux',
  Finance: 'finance'
}

export interface Person {
  key: string
  userId: string
  employeeId: string | null
  firstName: string
  lastName: string
  role: string
  position: string
  department: string
}

export type Staff = Record<string, Person>

export function fullName(person: Person) {
  return person.firstName + ' ' + person.lastName
}

export async function seedDepartments() {
  for (const name of DEFAULT_DEPARTMENTS) {
    await prisma.department.upsert({
      where: { name },
      update: { deletedAt: null, archivedAt: null },
      create: { name, description: 'Отдел «' + name + '»' }
    })
  }
  const departments = await prisma.department.findMany({ select: { id: true, name: true } })
  log('departments: ' + departments.length)
  return new Map(departments.map(d => [d.name, d.id]))
}

export async function seedStaff(departments: Map<string, string>): Promise<Staff> {
  const passwordHash = await bcrypt.hash(PASSWORD, 12)
  const staff: Staff = {}

  for (const seed of STAFF) {
    const user = await prisma.user.upsert({
      where: { email: seed.email },
      update: { role: seed.role, firstName: seed.firstName, lastName: seed.lastName, isActive: true, deletedAt: null },
      create: {
        email: seed.email,
        passwordHash,
        firstName: seed.firstName,
        lastName: seed.lastName,
        role: seed.role,
        phone: seed.phone,
        emailVerifiedAt: day(-seed.hiredDaysBefore),
        lastLoginAt: day(134 - (seed.key.length % 4), 9, 15 + seed.key.length),
        createdAt: day(-seed.hiredDaysBefore)
      }
    })
    const employee = await prisma.employee.upsert({
      where: { userId: user.id },
      update: { position: seed.position, departmentId: departments.get(seed.department) ?? null, deletedAt: null, archivedAt: null },
      create: {
        userId: user.id,
        departmentId: departments.get(seed.department) ?? null,
        position: seed.position,
        employmentType: seed.employment ?? 'FULL_TIME',
        hourlyRate: seed.rate,
        weeklyCapacityHours: seed.employment === 'PART_TIME' ? 20 : 40,
        status: 'ACTIVE',
        hiredAt: day(-seed.hiredDaysBefore),
        createdAt: day(-seed.hiredDaysBefore)
      }
    })
    staff[seed.key] = {
      key: seed.key,
      userId: user.id,
      employeeId: employee.id,
      firstName: seed.firstName,
      lastName: seed.lastName,
      role: seed.role,
      position: seed.position,
      department: seed.department
    }
  }
  log('staff: ' + STAFF.length + ' (password: ' + PASSWORD + ')')
  return staff
}

export interface ClientInfo {
  id: string
  name: string
  portalUserId: string
}

export async function seedClient(): Promise<ClientInfo> {
  const name = '24reply.ai'
  const existing = await prisma.client.findFirst({ where: { name } })
  const client = existing ?? (await prisma.client.create({
    data: {
      name,
      companyName: '24reply LLC',
      email: 'hello@24reply.ai',
      phone: '+998 71 200 24 24',
      country: 'Uzbekistan',
      status: 'ACTIVE',
      notes: 'AI-ассистент для бизнеса: отвечает клиентам в мессенджерах за секунды. Пришли по рекомендации; интересует серия продуктовых роликов к запуску.',
      createdAt: day(-9, 11, 30),
      contacts: {
        create: [
          { name: 'Отабек Рахимов', position: 'CEO', email: 'otabek@24reply.ai', phone: '+998 90 123 45 67', isPrimary: true },
          { name: 'Дилноза Каримова', position: 'Head of Marketing', email: 'dilnoza@24reply.ai', phone: '+998 90 765 43 21', isPrimary: false }
        ]
      }
    }
  }))

  const passwordHash = await bcrypt.hash(PASSWORD, 12)
  const portal = await prisma.user.upsert({
    where: { email: 'client@24reply.ai' },
    update: { clientId: client.id, isActive: true, deletedAt: null },
    create: {
      email: 'client@24reply.ai',
      passwordHash,
      firstName: 'Отабек',
      lastName: 'Рахимов',
      role: 'CLIENT',
      clientId: client.id,
      phone: '+998 90 123 45 67',
      emailVerifiedAt: day(-8),
      lastLoginAt: day(127, 16, 40),
      createdAt: day(-8)
    }
  })
  log('client: ' + name + ' (portal: client@24reply.ai)')
  return { id: client.id, name, portalUserId: portal.id }
}

/** Studio card and the pipeline templates the settings page lists. */
export async function seedStudio() {
  const logo = await attachNext('image', 'shared', 'astir-logo')
  const card = {
    name: 'Astir Studio',
    legalName: 'ООО «Astir Animation»',
    email: 'hello@astir.uz',
    phone: '+998 71 205 05 05',
    website: 'https://astir.uz',
    address: 'Ташкент, ул. Шота Руставели, 53, 3 этаж',
    currency: 'USD',
    timezone: 'Asia/Tashkent',
    invoicePrefix: 'INV-'
  }
  await prisma.studioSettings.upsert({
    where: { id: 'studio' },
    update: { ...card, ...(logo ? { logoUrl: logo.url } : {}) },
    create: { id: 'studio', ...card, logoUrl: logo?.url ?? null }
  })

  const descriptions: Record<string, string> = {
    '2D Animation': 'Полный 2D-цикл: от брифа и раскадровки до композитинга и сдачи.',
    '3D Animation': 'Полный 3D-цикл с моделингом, ригом, симуляциями и рендером.',
    'Commercial': 'Рекламный ролик: короткий препродакшн, анимация, звук и сдача.',
    'Motion Design': 'Моушн-графика без 3D-этапов.',
    'Series Episode': 'Серийный эпизод: препродакшн уже сделан, только производство.'
  }
  for (const [name, stages] of Object.entries(PROJECT_TEMPLATES)) {
    await prisma.pipelineTemplate.upsert({
      where: { name },
      update: { stages: [...stages], isDefault: name === '3D Animation' },
      create: { name, description: descriptions[name] ?? null, stages: [...stages], isDefault: name === '3D Animation' }
    })
  }
  log('studio settings + ' + Object.keys(PROJECT_TEMPLATES).length + ' pipeline templates')
}
