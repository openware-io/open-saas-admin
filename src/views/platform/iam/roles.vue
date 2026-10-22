<template>
  <div class="admin-page">
    <div class="page-header">
      <div>
        <h2>角色工作台</h2>
        <p class="subtle">角色模板由 IAM 角色目录提供；这里维护工作区、登录落点和数据范围。</p>
      </div>
      <el-button :loading="loading" @click="load"><el-icon><Refresh /></el-icon>刷新</el-button>
    </div>

    <el-alert
      type="info"
      :closable="false"
      show-icon
      title="权限仍归 IAM"
      description="本页只维护角色的工作台投影，不修改角色权限。门店范围与权限分配在“运营人员”中完成。"
    />

    <div class="admin-card">
      <el-table v-loading="loading" :data="rows" border stripe>
        <el-table-column prop="roleCode" label="角色编码" width="170" />
        <el-table-column label="工作区" width="130">
          <template #default="{ row }">
            <el-tag size="small" effect="plain">{{ workspaceText(row.workspaceCode) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="landingRoute" label="登录落点" min-width="220" />
        <el-table-column label="数据范围" width="120">
          <template #default="{ row }">{{ scopeTypeText(row.defaultScope) }}</template>
        </el-table-column>
        <el-table-column prop="defaultBusinessType" label="默认业态" width="110">
          <template #default="{ row }">{{ row.defaultBusinessType || '全部' }}</template>
        </el-table-column>
        <el-table-column prop="sortNo" label="优先级" width="90" align="center" />
        <el-table-column label="操作" width="100" align="center" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="dialogVisible" title="编辑角色工作台" width="520px" :close-on-click-modal="false">
      <el-form label-width="100px">
        <el-form-item label="角色编码">
          <el-input :model-value="form.roleCode" disabled />
        </el-form-item>
        <el-form-item label="工作区">
          <el-select v-model="form.workspaceCode" style="width: 100%">
            <el-option v-for="option in WORKSPACES" :key="option.value" :label="option.label" :value="option.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="登录落点">
          <el-input v-model="form.landingRoute" placeholder="/admin/tenant/overview" />
        </el-form-item>
        <el-form-item label="数据范围">
          <el-select v-model="form.defaultScope" style="width: 100%">
            <el-option v-for="option in SCOPES" :key="option.value" :label="option.label" :value="option.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="优先级">
          <el-input-number v-model="form.sortNo" :min="1" :max="999" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import { listRoleProfiles, updateRoleProfile } from '@/api/admin'
import { scopeTypeText } from '@/constants/terms'
import { notifyAdminRequestError } from '@/utils/adminErrorMessage'

const rows = ref([])
const loading = ref(false)
const saving = ref(false)
const dialogVisible = ref(false)
const form = reactive({
  id: null,
  roleCode: '',
  workspaceCode: 'PLATFORM',
  landingRoute: '',
  defaultScope: 'PLATFORM',
  defaultBusinessType: null,
  sortNo: 100,
})

const WORKSPACES = [
  { value: 'PLATFORM', label: '平台运营' },
  { value: 'HEADQUARTERS', label: '集团总部' },
  { value: 'STORE', label: '门店经营' },
  { value: 'IM', label: 'IM 管理' },
]

const SCOPES = [
  { value: 'PLATFORM', label: '平台' },
  { value: 'TENANT', label: '租户' },
  { value: 'STORE', label: '门店' },
  { value: 'IM', label: 'IM' },
]

function workspaceText(value) {
  return WORKSPACES.find((item) => item.value === value)?.label || value || '未设置'
}

async function load() {
  loading.value = true
  try {
    rows.value = (await listRoleProfiles()) || []
  } catch (error) {
    rows.value = []
    notifyAdminRequestError(error, '加载角色工作台失败')
  } finally {
    loading.value = false
  }
}

function openEdit(row) {
  form.id = row.id
  form.roleCode = row.roleCode
  form.workspaceCode = row.workspaceCode
  form.landingRoute = row.landingRoute
  form.defaultScope = row.defaultScope
  form.defaultBusinessType = row.defaultBusinessType
  form.sortNo = row.sortNo
  dialogVisible.value = true
}

async function save() {
  if (!form.landingRoute.trim()) {
    ElMessage.warning('登录落点不能为空')
    return
  }
  saving.value = true
  try {
    await updateRoleProfile(form.id, {
      workspaceCode: form.workspaceCode,
      landingRoute: form.landingRoute.trim(),
      defaultScope: form.defaultScope,
      defaultBusinessType: form.defaultBusinessType,
      sortNo: form.sortNo,
    })
    dialogVisible.value = false
    ElMessage.success('角色工作台已更新')
    await load()
  } catch (error) {
    notifyAdminRequestError(error, '保存角色工作台失败')
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>
