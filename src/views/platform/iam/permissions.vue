<template>
  <div class="admin-page">
    <div class="page-header">
      <h2>权限</h2>
      <el-button type="primary" @click="dialogVisible = true">
        <el-icon><Plus /></el-icon>新增权限
      </el-button>
    </div>

    <div class="admin-card">
      <div class="filter-bar">
        <el-input v-model="keyword" placeholder="权限编码 / 名称" clearable style="width: 240px" />
        <el-button type="primary" @click="search">查询</el-button>
        <el-button @click="keyword = ''">重置</el-button>
      </div>

      <el-table :data="rows" border stripe row-key="code" default-expand-all>
        <el-table-column prop="name" label="权限名称" min-width="200" />
        <el-table-column prop="code" label="权限编码" min-width="220" />
        <el-table-column label="类型" width="120" align="center">
          <template #default="{ row }">
            <el-tag :type="permissionTypeTag(row.type)" size="small">{{ permissionTypeText(row.type) }}</el-tag>
          </template>
        </el-table-column>
      </el-table>

      <div class="admin-pagination">
        <el-pagination layout="total, prev, pager, next" :total="rows.length" :page-size="10" />
      </div>
    </div>

    <el-dialog v-model="dialogVisible" title="新增权限" width="480px">
      <el-form label-width="80px">
        <el-form-item label="权限编码"><el-input placeholder="如 tenant:read" /></el-form-item>
        <el-form-item label="权限名称"><el-input placeholder="权限名称" /></el-form-item>
        <el-form-item label="类型">
          <el-select placeholder="选择类型" style="width: 100%">
            <el-option v-for="(label, value) in PERMISSION_TYPE_TEXT" :key="value" :label="label" :value="value" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { PERMISSION_TYPE_TEXT, permissionTypeTag, permissionTypeText } from '@/constants/terms'

const keyword = ref('')
const dialogVisible = ref(false)

/** 权限类型用后端枚举 MENU / ACTION（与新增表单的取值一致），展示走统一词表。 */
const rows = ref([
  { code: 'iam', name: '权限管理', type: 'MENU', children: [
    { code: 'iam:role:read', name: '角色查询', type: 'ACTION' },
    { code: 'iam:permission:read', name: '权限查询', type: 'ACTION' },
  ] },
  { code: 'tenant', name: '租户管理', type: 'MENU', children: [
    { code: 'tenant:read', name: '租户查询', type: 'ACTION' },
    { code: 'tenant:write', name: '租户新增/编辑', type: 'ACTION' },
  ] },
])

function search() {
  ElMessage.info('该查询为占位实现，暂未接入后端接口')
}

function save() {
  dialogVisible.value = false
  ElMessage.success('已保存（占位，未写入后端）')
}
</script>
