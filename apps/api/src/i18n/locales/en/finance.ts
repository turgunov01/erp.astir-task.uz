import type { Messages } from '../../types'
import type ru from '../ru/finance'

export default {
  csv: {
    studioOverhead: 'Studio (no project)',
    date: 'Date',
    project: 'Project',
    client: 'Client',
    category: 'Category',
    vendor: 'Vendor',
    description: 'Description',
    paymentMethod: 'Payment method',
    documentNumber: 'Document no.',
    documentUrl: 'Document link',
    amount: 'Amount',
    vatIncluded: 'Incl. VAT',
    currency: 'Currency',
    createdBy: 'Entered by',
    paidDate: 'Payment date',
    dueDate: 'Due date',
    invoice: 'Invoice',
    status: 'Status',
    method: 'Method',
    reference: 'Transaction no.',
    fee: 'Fee',
    notes: 'Notes',
    number: 'Number',
    issuedAt: 'Issued',
    payBy: 'Pay by',
    purpose: 'Purpose',
    daysOverdue: 'Days overdue',
    paid: 'Paid',
    remaining: 'Remaining',
    code: 'Code',
    risk: 'Risk',
    progress: 'Progress, %',
    deadline: 'Deadline',
    late: 'Late',
    stagesTotal: 'Stages total',
    stagesDone: 'Stages done',
    tasksTotal: 'Tasks total',
    tasksDone: 'Tasks done',
    tasksOverdue: 'Tasks overdue',
    revisionsOpen: 'Open revisions',
    term: 'Term',
    invoicesCount: 'Invoices',
    month: 'Month',
    invoiced: 'Invoiced',
    collected: 'Collected',
    spent: 'Spent',
    net: 'Net',
    employee: 'Employee',
    position: 'Position',
    department: 'Department',
    rate: 'Rate',
    hours: 'Hours',
    unpricedHours: 'Hours without a rate',
    cost: 'Cost',
    projectsCount: 'Projects',
    outstanding: 'Outstanding',
    avgDaysToPay: 'Average days to pay'
  },
  ageing: {
    current: 'Not overdue',
    d30: '1-30 days',
    d60: '31-60 days',
    d90: '61-90 days',
    over90: 'Over 90 days'
  },
  payments: {
    feeTooLarge: 'The fee cannot be more than the payment amount'
  },
  expenses: {
    vatTooLarge: 'VAT cannot be more than the amount'
  },
  budget: {
    categoryOnce: 'Each category can be listed only once'
  },
  payroll: {
    status: {
      DRAFT: 'draft',
      APPROVED: 'approved',
      PAID: 'paid',
      CANCELLED: 'cancelled'
    },
    employeeMissing: 'The employee was not found or has been deleted',
    latenessMinutesRequired: 'For a lateness penalty, give how many minutes late the employee was',
    externalIdTaken: 'An entry with this external ID already exists',
    onlyDraftEditable: 'Only a draft can be edited. Return the “{status}” entry to draft first.',
    transitionNotAllowed: 'An entry cannot move from “{from}” to “{to}”',
    deleteOnlyDraft: 'Only a draft or a cancelled entry can be deleted. Cancel an approved one first.'
  }
} satisfies Messages<typeof ru>
