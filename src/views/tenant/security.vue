<template>
  <div class="admin-page">
    <div class="page-header">
      <h2>脱敏权限</h2>
      <el-button @click="load"><el-icon><Refresh /></el-icon>刷新</el-button>
    </div>

    <div class="admin-card">
      <p class="tip">控制各角色是否能查看客户隐私信息（姓名 / 手机号明文）。未授权的角色在客户列表 / 客户详情中看到的是脱敏内容（如 张*、138****1234）。</p>
      <el-table :data="rows" v-loading="loading" border stripe>
        <el-table-column prop="code" label="角色编码" width="180" />
        <el-table-column prop="name" label="角色名称" min-width="140" />
        <el-table-column label="查看隐私明文" width="140" align="center">
          <template #default="{ row }">
            <el-tag :type="row.piiView ? 'success' : 'info'" size="small">{{ row.piiView ? '可见明文' : '脱敏' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="140" align="center">
          <template #default="{ row }">
            <el-switch
              :model-value="row.piiView"
              :loading="row.saving"
              @change="(v) => toggle(row, v)"
            />
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import { listMaskingRoles, toggleRolePermission } from '@/api/admin'
import { notifyAdminRequestError } from '@/utils/adminErrorMessage'

const loading = ref(false)
const rows = ref([])

async function load() {
  loading.value = true
  try {
    const data = await listMaskingRoles()
    rows.value = (Array.isArray(data) ? data : (data && data.items) || []).map((r) => ({ ...r, saving: false }))
  } catch (e) {
    notifyAdminRequestError(e, '加载脱敏权限失败')
  } finally {
    loading.value = false
  }
}

async function toggle(row, granted) {
  row.saving = true
  try {
    await toggleRolePermission(row.roleId, 'member.pii.view', granted)
    row.piiView = granted
    ElMessage.success(granted ? '已开放 ' + row.name + ' 查看隐私明文' : '已对 ' + row.name + ' 脱敏')
  } catch (e) {
    notifyAdminRequestError(e, '操作失败')
  } finally {
    row.saving = false
  }
}

onMounted(load)
</script>

<style scoped>
.tip { margin: 0 0 12px; color: var(--el-text-color-secondary); font-size: 13px; }
</style>
