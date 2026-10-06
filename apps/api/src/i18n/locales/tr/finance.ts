import type { Messages } from '../../types'
import type ru from '../ru/finance'

export default {
  csv: {
    studioOverhead: 'Stüdyo (projesiz)',
    date: 'Tarih',
    project: 'Proje',
    client: 'Müşteri',
    category: 'Kategori',
    vendor: 'Tedarikçi',
    description: 'Açıklama',
    paymentMethod: 'Ödeme yöntemi',
    documentNumber: 'Belge no',
    documentUrl: 'Belge bağlantısı',
    amount: 'Tutar',
    vatIncluded: 'KDV dahil',
    currency: 'Para birimi',
    createdBy: 'Giren',
    paidDate: 'Ödeme tarihi',
    dueDate: 'Vade',
    invoice: 'Fatura',
    status: 'Durum',
    method: 'Yöntem',
    reference: 'İşlem numarası',
    fee: 'Komisyon',
    notes: 'Not',
    number: 'Numara',
    issuedAt: 'Düzenlenme',
    payBy: 'Son ödeme',
    purpose: 'Açıklama',
    daysOverdue: 'Gecikme, gün',
    paid: 'Ödenen',
    remaining: 'Kalan',
    code: 'Kod',
    risk: 'Risk',
    progress: 'İlerleme, %',
    deadline: 'Teslim tarihi',
    late: 'Gecikmiş',
    stagesTotal: 'Toplam aşama',
    stagesDone: 'Biten aşama',
    tasksTotal: 'Toplam görev',
    tasksDone: 'Biten görev',
    tasksOverdue: 'Geciken görev',
    revisionsOpen: 'Açık düzeltme',
    term: 'Vade',
    invoicesCount: 'Fatura',
    month: 'Ay',
    invoiced: 'Faturalanan',
    collected: 'Tahsil edilen',
    spent: 'Harcanan',
    net: 'Net',
    employee: 'Çalışan',
    position: 'Pozisyon',
    department: 'Departman',
    rate: 'Ücret',
    hours: 'Saat',
    unpricedHours: 'Ücreti tanımsız saat',
    cost: 'Maliyet',
    projectsCount: 'Proje',
    outstanding: 'Kalan',
    avgDaysToPay: 'Ortalama ödeme süresi, gün'
  },
  ageing: {
    current: 'Gecikmemiş',
    d30: '1-30 gün',
    d60: '31-60 gün',
    d90: '61-90 gün',
    over90: '90 günden fazla'
  },
  payments: {
    feeTooLarge: 'Komisyon ödeme tutarından fazla olamaz'
  },
  expenses: {
    vatTooLarge: 'KDV tutardan fazla olamaz'
  },
  budget: {
    categoryOnce: 'Her kategori yalnızca bir kez belirtilebilir'
  },
  payroll: {
    status: {
      DRAFT: 'taslak',
      APPROVED: 'onaylandı',
      PAID: 'ödendi',
      CANCELLED: 'iptal edildi'
    },
    employeeMissing: 'Çalışan bulunamadı veya silinmiş',
    latenessMinutesRequired: 'Gecikme cezası için çalışanın kaç dakika geciktiğini belirtin',
    externalIdTaken: 'Bu harici kimliğe sahip bir kayıt zaten var',
    onlyDraftEditable: 'Yalnızca taslak düzenlenebilir. “{status}” durumundaki kaydı önce taslağa geri alın.',
    transitionNotAllowed: 'Kayıt “{from}” durumundan “{to}” durumuna geçirilemez',
    deleteOnlyDraft: 'Yalnızca taslak veya iptal edilmiş bir kayıt silinebilir. Onaylanmış kaydı önce iptal edin.'
  }
} satisfies Messages<typeof ru>
