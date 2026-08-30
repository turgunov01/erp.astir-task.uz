import type { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { badRequest, notFound } from '../../lib/errors'
import { buildMeta, toSkipTake } from '../../lib/http'

const INCLUDE = {
  employee: {
    select: {
      id: true,
      position: true,
      weeklyCapacityHours: true,
      user: { select: { id: true, firstName: true, lastName: true } }
    }
  },
  project: { select: { id: true, code: true, name: true } },
  task: { select: { id: true, title: true } },
  shot: { select: { id: true, code: true } }
} satisfies Prisma.TimesheetEntryInclude

export interface TimesheetListQuery {
  page: number
  limit: number
  employeeId?: string
  projectId?: string
  taskId?: string
  from?: string
  to?: string
  order: 'asc' | 'desc'
}

function dateOnly(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) throw badRequest('Invalid date: ' + value)
  // Entries are day-grained, so a time part would only create false mismatches.
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

function buildWhere(query: Partial<TimesheetListQuery>): Prisma.TimesheetEntryWhereInput {
  const where: Prisma.TimesheetEntryWhereInput = {}
  if (query.employeeId) where.employeeId = query.employeeId
  if (query.projectId) where.projectId = query.projectId
  if (query.taskId) where.taskId = query.taskId
  if (query.from || query.to) {
    where.date = {
      ...(query.from ? { gte: dateOnly(query.from) } : {}),
      ...(query.to ? { lte: dateOnly(query.to) } : {})
    }
  }
  return where
}

export async function list(query: TimesheetListQuery) {
  const { skip, take } = toSkipTake(query.page, query.limit)
  const where = buildWhere(query)
  const [items, total] = await Promise.all([
    prisma.timesheetEntry.findMany({
      where,
      orderBy: [{ date: query.order }, { createdAt: 'desc' }],
      skip,
      take,
      include: INCLUDE
    }),
    prisma.timesheetEntry.count({ where })
  ])
  return { items, meta: buildMeta(total, query.page, query.limit) }
}

export async function getById(id: string) {
  const entry = await prisma.timesheetEntry.findUnique({ where: { id }, include: INCLUDE })
  if (!entry) throw notFound('Timesheet entry')
  return entry
}

/** Resolve the employment record for a user, since entries hang off Employee. */
export async function employeeIdForUser(userId: string) {
  const employee = await prisma.employee.findFirst({
    where: { userId, deletedAt: null },
    select: { id: true }
  })
  return employee?.id ?? null
}

export interface TimesheetInput {
  employeeId: string
  projectId: string
  taskId?: string | null
  shotId?: string | null
  date: string
  hours: number
  description?: string | null
}

export async function create(input: TimesheetInput) {
  const [employee, project] = await Promise.all([
    prisma.employee.findFirst({ where: { id: input.employeeId, deletedAt: null } }),
    prisma.project.findFirst({ where: { id: input.projectId, deletedAt: null } })
  ])
  if (!employee) throw notFound('Employee')
  if (!project) throw notFound('Project')

  return prisma.timesheetEntry.create({
    data: {
      employeeId: input.employeeId,
      projectId: input.projectId,
      taskId: input.taskId ?? null,
      shotId: input.shotId ?? null,
      date: dateOnly(input.date),
      hours: input.hours,
      description: input.description ?? null
    },
    include: INCLUDE
  })
}

export async function update(id: string, input: Partial<TimesheetInput>) {
  await getById(id)
  const data: Prisma.TimesheetEntryUpdateInput = {}
  if (input.hours !== undefined) data.hours = input.hours
  if (input.description !== undefined) data.description = input.description ?? null
  if (input.date !== undefined) data.date = dateOnly(input.date)
  if (input.projectId !== undefined) data.project = { connect: { id: input.projectId } }
  if (input.taskId !== undefined) {
    data.task = input.taskId ? { connect: { id: input.taskId } } : { disconnect: true }
  }
  if (input.shotId !== undefined) {
    data.shot = input.shotId ? { connect: { id: input.shotId } } : { disconnect: true }
  }
  return prisma.timesheetEntry.update({ where: { id }, data, include: INCLUDE })
}

export async function remove(id: string) {
  await getById(id)
  await prisma.timesheetEntry.delete({ where: { id } })
}

/** Hours grouped by project and by person, for the reporting views. */
export async function summary(query: Partial<TimesheetListQuery>) {
  const where = buildWhere(query)

  const [byProject, byEmployee, totals] = await Promise.all([
    prisma.timesheetEntry.groupBy({
      by: ['projectId'],
      where,
      _sum: { hours: true },
      _count: { _all: true }
    }),
    prisma.timesheetEntry.groupBy({
      by: ['employeeId'],
      where,
      _sum: { hours: true },
      _count: { _all: true }
    }),
    prisma.timesheetEntry.aggregate({ where, _sum: { hours: true }, _count: { _all: true } })
  ])

  const [projects, employees] = await Promise.all([
    prisma.project.findMany({
      where: { id: { in: byProject.map(row => row.projectId) } },
      select: { id: true, code: true, name: true }
    }),
    prisma.employee.findMany({
      where: { id: { in: byEmployee.map(row => row.employeeId) } },
      select: {
        id: true,
        position: true,
        user: { select: { firstName: true, lastName: true } }
      }
    })
  ])

  const projectById = new Map(projects.map(row => [row.id, row]))
  const employeeById = new Map(employees.map(row => [row.id, row]))

  return {
    totalHours: Number(totals._sum.hours ?? 0),
    entries: totals._count._all,
    byProject: byProject
      .map(row => ({
        project: projectById.get(row.projectId) ?? null,
        hours: Number(row._sum.hours ?? 0),
        entries: row._count._all
      }))
      .sort((a, b) => b.hours - a.hours),
    byEmployee: byEmployee
      .map(row => ({
        employee: employeeById.get(row.employeeId) ?? null,
        hours: Number(row._sum.hours ?? 0),
        entries: row._count._all
      }))
      .sort((a, b) => b.hours - a.hours)
  }
}

/** Utilisation bands from the spec (32): the label follows the percentage. */
function utilisationBand(percent: number) {
  if (percent >= 100) return 'OVERLOADED'
  if (percent >= 85) return 'HIGH'
  if (percent >= 60) return 'NORMAL'
  return 'AVAILABLE'
}

/** Monday of the current week, in UTC, matching the day-grained date column. */
function startOfWeek() {
  const now = new Date()
  const day = (now.getUTCDay() + 6) % 7
  return new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - day
  ))
}

/**
 * Capacity against committed work for every active employee.
 *
 * Assigned hours come from tasks that are still open: a finished task no longer
 * competes for someone's week, so counting it would leave everyone looking
 * overloaded forever.
 */
export async function workload() {
  const employees = await prisma.employee.findMany({
    where: { deletedAt: null, status: 'ACTIVE' },
    select: {
      id: true,
      position: true,
      weeklyCapacityHours: true,
      user: { select: { id: true, firstName: true, lastName: true } },
      department: { select: { id: true, name: true } }
    },
    orderBy: { position: 'asc' }
  })

  const userIds = employees.map(row => row.user.id)
  const OPEN_STATUSES = ['BACKLOG', 'READY', 'IN_PROGRESS', 'REVIEW', 'REVISION'] as const

  const [openTasks, loggedThisWeek] = await Promise.all([
    prisma.task.findMany({
      where: {
        assigneeId: { in: userIds },
        status: { in: [...OPEN_STATUSES] }
      },
      select: {
        id: true,
        title: true,
        status: true,
        deadline: true,
        estimatedHours: true,
        assigneeId: true,
        project: { select: { id: true, code: true } }
      },
      orderBy: { deadline: 'asc' }
    }),
    prisma.timesheetEntry.groupBy({
      by: ['employeeId'],
      where: { date: { gte: startOfWeek() } },
      _sum: { hours: true }
    })
  ])

  const loggedByEmployee = new Map(
    loggedThisWeek.map(row => [row.employeeId, Number(row._sum.hours ?? 0)])
  )

  const weekAhead = Date.now() + 7 * 24 * 60 * 60 * 1000

  return employees.map(employee => {
    const tasks = openTasks.filter(task => task.assigneeId === employee.user.id)
    const assignedHours = tasks.reduce(
      (sum, task) => sum + Number(task.estimatedHours ?? 0),
      0
    )
    const capacity = employee.weeklyCapacityHours || 0
    const percent = capacity > 0 ? Math.round((assignedHours / capacity) * 100) : 0

    // "Current" is what is due within the week; everything else is upcoming.
    const current = tasks.filter(
      task => !task.deadline || new Date(task.deadline).getTime() <= weekAhead
    )
    const upcoming = tasks.filter(task => !current.includes(task))

    return {
      employee: {
        id: employee.id,
        position: employee.position,
        user: employee.user,
        department: employee.department
      },
      capacityHours: capacity,
      assignedHours,
      loggedThisWeek: loggedByEmployee.get(employee.id) ?? 0,
      utilisation: percent,
      band: utilisationBand(percent),
      currentTasks: current.slice(0, 5),
      upcomingTasks: upcoming.slice(0, 5),
      currentCount: current.length,
      upcomingCount: upcoming.length
    }
  })
}
