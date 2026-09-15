<script setup lang="ts">
/*
 * /reports has no page of its own: the section is four reports and the sidebar
 * links each directly. The address stays alive rather than starting to 404,
 * because it is the one people already have bookmarked and linked to.
 */
definePageMeta({ redirect: '/reports/production' })
</script>

<template>
  <div />
</template>
