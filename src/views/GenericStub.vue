<template>
  <div class="admin-page">
    <div class="page-header">
      <h2>{{ title }}</h2>
      <el-tag type="info" effect="plain">未接入</el-tag>
    </div>
    <div class="admin-card">
      <el-empty :description="'当前路径 ' + route.path + ' 尚未接入业务流程，属于占位页。'" />
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const title = computed(() => route.meta.title || '页面开发中')
</script>
