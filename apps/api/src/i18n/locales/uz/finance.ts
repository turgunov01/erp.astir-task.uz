import type { Messages } from '../../types'
import type ru from '../ru/finance'

export default {
  csv: {
    studioOverhead: 'Studiya (loyihasiz)',
    date: 'Sana',
    project: 'Loyiha',
    client: 'Mijoz',
    category: 'Toifa',
    vendor: 'Kontragent',
    description: 'Tavsif',
    paymentMethod: 'To‘lov usuli',
    documentNumber: 'Hujjat №',
    documentUrl: 'Hujjat havolasi',
    amount: 'Summa',
    vatIncluded: 'Shu jumladan QQS',
    currency: 'Valyuta',
    createdBy: 'Kiritgan',
    paidDate: 'To‘lov sanasi',
    dueDate: 'Muddat',
    invoice: 'Hisob-faktura',
    status: 'Holat',
    method: 'Usul',
    reference: 'Tranzaksiya raqami',
    fee: 'Komissiya',
    notes: 'Izoh',
    number: 'Raqam',
    issuedAt: 'Berilgan',
    payBy: 'To‘lash muddati',
    purpose: 'Maqsad',
    daysOverdue: 'Kechikish, kun',
    paid: 'To‘langan',
    remaining: 'Qoldiq',
    code: 'Kod',
    risk: 'Xavf',
    progress: 'Bajarilish, %',
    deadline: 'Muddat',
    late: 'Kechikkan',
    stagesTotal: 'Jami bosqichlar',
    stagesDone: 'Tayyor bosqichlar',
    tasksTotal: 'Jami vazifalar',
    tasksDone: 'Bajarilgan vazifalar',
    tasksOverdue: 'Muddati o‘tgan vazifalar',
    revisionsOpen: 'Ochiq tuzatishlar',
    term: 'Muddat',
    invoicesCount: 'Hisob-fakturalar',
    month: 'Oy',
    invoiced: 'Hisoblangan',
    collected: 'Olingan',
    spent: 'Sarflangan',
    net: 'Jami',
    employee: 'Xodim',
    position: 'Lavozim',
    department: 'Bo‘lim',
    rate: 'Stavka',
    hours: 'Soat',
    unpricedHours: 'Stavkasiz soatlar',
    cost: 'Qiymat',
    projectsCount: 'Loyihalar',
    outstanding: 'Qoldiq',
    avgDaysToPay: 'O‘rtacha to‘lov muddati, kun'
  },
  ageing: {
    current: 'Muddati o‘tmagan',
    d30: '1-30 kun',
    d60: '31-60 kun',
    d90: '61-90 kun',
    over90: '90 kundan ortiq'
  },
  payments: {
    feeTooLarge: 'Komissiya to‘lov summasidan katta bo‘lishi mumkin emas'
  },
  expenses: {
    vatTooLarge: 'QQS summadan katta bo‘lishi mumkin emas'
  },
  budget: {
    categoryOnce: 'Har bir toifa faqat bir marta ko‘rsatiladi'
  },
  payroll: {
    status: {
      DRAFT: 'qoralama',
      APPROVED: 'tasdiqlangan',
      PAID: 'to‘langan',
      CANCELLED: 'bekor qilingan'
    },
    employeeMissing: 'Xodim topilmadi yoki o‘chirilgan',
    latenessMinutesRequired: 'Kechikish jarimasi uchun xodim necha daqiqa kechikkanini ko‘rsating',
    externalIdTaken: 'Bu tashqi identifikatorli yozuv allaqachon bor',
    onlyDraftEditable: 'Faqat qoralamani o‘zgartirish mumkin. «{status}» yozuvini avval qoralamaga qaytaring.',
    transitionNotAllowed: 'Yozuvni «{from}» holatidan «{to}» holatiga o‘tkazib bo‘lmaydi',
    deleteOnlyDraft: 'Faqat qoralama yoki bekor qilingan yozuvni o‘chirish mumkin. Tasdiqlanganini avval bekor qiling.'
  }
} satisfies Messages<typeof ru>
