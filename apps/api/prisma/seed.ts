import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcryptjs'
import { DEFAULT_DEPARTMENTS } from '@astir/config'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

/**
 * Development password for every seeded account.
 * Documented in the README and expected to be rotated before any real use.
 */
const DEV_PASSWORD = 'admin123'

interface SeedUser {
  email: string
  firstName: string
  lastName: string
  role: 'OWNER' | 'ADMIN' | 'PRODUCER' | 'PROJECT_MANAGER' | 'ART_DIRECTOR' | 'ARTIST' | 'CLIENT' | 'FINANCE'
  position: string
  department: string
  hourlyRate?: number
}

const SEED_USERS: SeedUser[] = [
  { email: 'owner@aster.studio', firstName: 'Aziz', lastName: 'Karimov', role: 'OWNER', position: 'Studio Owner', department: 'Management' },
  { email: 'admin@aster.studio', firstName: 'Dilnoza', lastName: 'Rashidova', role: 'ADMIN', position: 'Studio Administrator', department: 'Management' },
  { email: 'producer@aster.studio', firstName: 'Timur', lastName: 'Yusupov', role: 'PRODUCER', position: 'Executive Producer', department: 'Production', hourlyRate: 45 },
  { email: 'pm@aster.studio', firstName: 'Kamila', lastName: 'Nazarova', role: 'PROJECT_MANAGER', position: 'Project Manager', department: 'Production', hourlyRate: 35 },
  { email: 'art@aster.studio', firstName: 'Ruslan', lastName: 'Abdullaev', role: 'ART_DIRECTOR', position: 'Art Director', department: '2D', hourlyRate: 40 },
  { email: 'finance@aster.studio', firstName: 'Malika', lastName: 'Tursunova', role: 'FINANCE', position: 'Finance Manager', department: 'Finance', hourlyRate: 30 },
  { email: 'anna@aster.studio', firstName: 'Anna', lastName: 'Volkova', role: 'ARTIST', position: 'Senior Animator', department: 'Animation', hourlyRate: 28 },
  { email: 'bekzod@aster.studio', firstName: 'Bekzod', lastName: 'Ismoilov', role: 'ARTIST', position: '3D Modeler', department: 'Modeling', hourlyRate: 25 },
  { email: 'sardor@aster.studio', firstName: 'Sardor', lastName: 'Ergashev', role: 'ARTIST', position: 'Rigging Artist', department: 'Rigging', hourlyRate: 26 },
  { email: 'nigora@aster.studio', firstName: 'Nigora', lastName: 'Saidova', role: 'ARTIST', position: 'Lighting Artist', department: 'Lighting', hourlyRate: 27 },
  { email: 'javohir@aster.studio', firstName: 'Javohir', lastName: 'Qodirov', role: 'ARTIST', position: 'Compositor', department: 'Compositing', hourlyRate: 26 }
]

const SEED_CLIENTS = [
  { name: 'Nur Media', companyName: 'Nur Media LLC', email: 'hello@nurmedia.uz', country: 'Uzbekistan' },
  { name: 'Silk Road Studios', companyName: 'Silk Road Studios FZ', email: 'contact@silkroad.ae', country: 'UAE' },
  { name: 'Bright Kids TV', companyName: 'Bright Kids Television', email: 'production@brightkids.tv', country: 'Kazakhstan' }
]

async function main() {
  console.log('seeding Aster Animation Studio...')

  const passwordHash = await bcrypt.hash(DEV_PASSWORD, 12)

  // Departments -----------------------------------------------------------
  for (const name of DEFAULT_DEPARTMENTS) {
    await prisma.department.upsert({
      where: { name },
      update: {},
      create: { name }
    })
  }
  const departments = await prisma.department.findMany()
  const departmentByName = new Map(departments.map(d => [d.name, d.id]))
  console.log('  departments: ' + departments.length)

  // Clients ---------------------------------------------------------------
  const clients = []
  for (const client of SEED_CLIENTS) {
    const existing = await prisma.client.findFirst({ where: { name: client.name } })
    clients.push(
      existing ??
        (await prisma.client.create({ data: { ...client, status: 'ACTIVE' } }))
    )
  }
  console.log('  clients: ' + clients.length)

  // Users and employees ---------------------------------------------------
  let userCount = 0
  for (const seed of SEED_USERS) {
    const user = await prisma.user.upsert({
      where: { email: seed.email },
      update: { role: seed.role, firstName: seed.firstName, lastName: seed.lastName },
      create: {
        email: seed.email,
        passwordHash,
        firstName: seed.firstName,
        lastName: seed.lastName,
        role: seed.role
      }
    })

    await prisma.employee.upsert({
      where: { userId: user.id },
      update: { position: seed.position },
      create: {
        userId: user.id,
        departmentId: departmentByName.get(seed.department) ?? null,
        position: seed.position,
        employmentType: 'FULL_TIME',
        hourlyRate: seed.hourlyRate ?? null,
        weeklyCapacityHours: 40,
        status: 'ACTIVE'
      }
    })
    userCount += 1
  }
  console.log('  users + employees: ' + userCount)

  // Client portal account, scoped to the first client (spec 36) ------------
  const portalClient = clients[0]
  if (portalClient) {
    await prisma.user.upsert({
      where: { email: 'client@nurmedia.uz' },
      update: { clientId: portalClient.id },
      create: {
        email: 'client@nurmedia.uz',
        passwordHash,
        firstName: 'Otabek',
        lastName: 'Rahimov',
        role: 'CLIENT',
        clientId: portalClient.id
      }
    })
    console.log('  client portal user: client@nurmedia.uz')
  }

  console.log('seed complete. Password for every account: ' + DEV_PASSWORD)
}

main()
  .catch(err => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
