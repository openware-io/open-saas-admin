<template>
  <div class="admin-page">
    <div class="page-header">
      <div>
        <h2>权限目录</h2>
        <p class="subtle">权限由平台统一维护；角色只能在自己的作用域内勾选可授予的权限。</p>
      </div>
      <el-button :loading="loading" @click="load">刷新</el-button>
    </div>

    <el-alert
      type="info"
      :closable="false"
      show-icon
      title="权限不是角色"
      description="这里看到的是系统权限点；给角色授权请到“角色与权限”页的权限矩阵。"
    />

    <div class="admin-card">
      <div class="filter-bar">
        <el-input v-model="keyword" placeholder="权限编码 / 名称 / 模块" clearable style="width: 300px" />
      </div>
      <el-table v-loading="loading" :data="filteredRows" border stripe>
        <el-table-column prop="code" label="权限编码" min-width="220" />
        <el-table-column label="名称" min-width="170">
          <template #default="{ row }">{{ row.description || row.code }}</template>
        </el-table-column>
        <el-table-column prop="module" label="模块" width="130" />
        <el-table-column prop="domainCode" label="业务域" width="120" />
        <el-table-column label="适用作用域" width="110" align="center">
          <template #default="{ row }">{{ scopeTypeText(row.scopeLevel) }}</template>
        </el-table-column>
        <el-table-column prop="grantableLevels" label="可授予" width="150" />
      </el-table>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { listPermissions } from '@/api/admin'
import { scopeTypeText } from '@/constants/terms'
import { notifyAdminRequestError } from '@/utils/adminErrorMessage'

const rows = ref([])
const keyword = ref('')
const loading = ref(false)

const filteredRows = computed(() => {
  const value = keyword.value.trim().toLowerCase()
  if (!value) return rows.value
  return rows.value.filter((row) => [row.code, row.description, row.module, row.domainCode]
    .filter(Boolean)
    .some((field) => String(field).toLowerCase().includes(value)))
})

async function load() {
  loading.value = true
  try {
    rows.value = (await listPermissions()) || []
  } catch (error) {
    rows.value = []
    notifyAdminRequestError(error, '加载权限目录失败')
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>
