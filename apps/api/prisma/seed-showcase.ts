import { storage } from '../src/lib/storage'
import { log, prisma, PROJECT_CODE } from './showcase/lib'
import { scanMedia } from './showcase/media'
import { seedClient, seedDepartments, seedStaff, seedStudio } from './showcase/people'
import { seedProduction } from './showcase/production'
import { seedWork } from './showcase/work'
import { seedReview } from './showcase/review'
import { seedFinance } from './showcase/finance'
import { seedFeeds } from './showcase/feeds'

/**
 * Showcase dataset: one project, AST-001, taken from the brief to delivery.
 *
 * Unlike seed-demo this is a single coherent story with real dates and real
 * files, so every page of the ERP has something true to show. Run it once on
 * a database that has no AST-001; pass --reset to wipe that project and its
 * blobs first, so the story can be replayed.
 *
 *   SHOWCASE_MEDIA_DIR=~/Downloads pnpm --filter @astir/api exec tsx prisma/seed-showcase.ts [--reset]
 */
async function removeBlob(url: string | null) {
  if (url && url.startsWith('/uploads/')) await storage.remove(url.replace('/uploads/', ''))
}

async function resetShowcase() {
  const project = await prisma.project.findUnique({ where: { code: PROJECT_CODE }, select: { id: true } })
  if (!project) return
  const where = { projectId: project.id }

  const documents = await prisma.document.findMany({ where, select: { id: true, fileUrl: true } })
  for (const document of documents) await removeBlob(document.fileUrl)
  const versions = await prisma.version.findMany({ where, select: { id: true, fileUrl: true, previewUrl: true } })
  for (const version of versions) {
    await removeBlob(version.fileUrl)
    if (version.previewUrl !== version.fileUrl) await removeBlob(version.previewUrl)
  }
  const assets = await prisma.asset.findMany({ where, select: { id: true, thumbnailUrl: true } })
  for (const asset of assets) await removeBlob(asset.thumbnailUrl)

  const tasks = await prisma.task.findMany({ where, select: { id: true } })
  const reviews = await prisma.review.findMany({ where: { version: where }, select: { id: true } })
  const entityIds = [...tasks, ...reviews].map(row => row.id)
  await prisma.comment.deleteMany({ where: { entityId: { in: entityIds } } })
  await prisma.notification.deleteMany({ where: { OR: [{ entityId: { in: [...entityIds, project.id] } }, { linkUrl: { contains: project.id } }, { entityType: { in: ['Revision', 'RenderJob'] } }] } })
  await prisma.activityLog.deleteMany({ where: { OR: [where, { entityType: 'Client' }] } })
  await prisma.auditLog.deleteMany({})

  await prisma.payment.deleteMany({ where })
  await prisma.invoice.deleteMany({ where })
  await prisma.expense.deleteMany({ where })
  await prisma.projectBudget.deleteMany({ where })
  await prisma.document.deleteMany({ where: { OR: [where, { projectId: null }] } })
  await prisma.renderJob.deleteMany({ where })
  await prisma.revision.deleteMany({ where })
  await prisma.review.deleteMany({ where: { id: { in: reviews.map(row => row.id) } } })
  await prisma.version.deleteMany({ where })
  await prisma.timesheetEntry.deleteMany({ where })
  await prisma.task.deleteMany({ where })
  await prisma.asset.deleteMany({ where })
  await prisma.project.delete({ where: { id: project.id } })
  log('reset: removed ' + PROJECT_CODE + ' with ' + documents.length + ' documents and ' + versions.length + ' versions')
}

async function main() {
  const reset = process.argv.includes('--reset')
  console.log('seeding showcase project ' + PROJECT_CODE + (reset ? ' (reset first)' : '') + '...')
  if (reset) await resetShowcase()

  const existing = await prisma.project.findUnique({ where: { code: PROJECT_CODE } })
  if (existing) {
    console.error(PROJECT_CODE + ' already exists; run with --reset to replay it.')
    process.exit(1)
  }

  scanMedia()
  const departments = await seedDepartments()
  const staff = await seedStaff(departments)
  const client = await seedClient()
  await seedStudio()
  const production = await seedProduction(staff, client)
  const tasks = await seedWork(staff, production)
  const review = await seedReview(staff, client, production, tasks)
  const finance = await seedFinance(staff, client, production, tasks, review)
  await seedFeeds(staff, client, production, tasks, review, finance)

  console.log('showcase seed complete. Sign in as owner@astir.uz to walk through it.')
}

main()
  .catch(err => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
