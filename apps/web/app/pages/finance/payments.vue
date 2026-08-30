<script setup lang="ts">
// Placeholder shell. Real module lands in phase 6.
useHead({ title: `Payments — Aster ERP` })
</script>

<template>
  <div class="mx-auto max-w-7xl px-6 py-8">
    <header class="mb-8 flex items-start justify-between gap-4">
      <div>
        <p class="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Payments
        </p>
        <h1 class="mt-1.5 text-2xl font-semibold tracking-tight">Payments</h1>
        <p class="mt-1 text-sm text-muted-foreground">Платежи клиентов</p>
      </div>
    </header>

    <section class="grid place-items-center rounded-xl border bg-card px-6 py-20 text-center">
      <span class="grid size-11 place-items-center rounded-lg bg-secondary text-muted-foreground">
        <Icon name="lucide:credit-card" class="size-5" />
      </span>
      <h2 class="mt-4 text-sm font-medium">Нет платежей</h2>
      <p class="mt-1.5 max-w-sm text-sm text-muted-foreground">Платежи привязываются к клиенту и проекту.</p>
      <p class="mt-5 inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-xs text-muted-foreground">
        <span class="size-1.5 rounded-full bg-signal" />
        Модуль реализуется в фазе 6
      </p>
    </section>
  </div>
</template>
