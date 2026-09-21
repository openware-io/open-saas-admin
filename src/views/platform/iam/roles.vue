<template>
  <div class="admin-page">
    <div class="page-header">
      <h2>角色</h2>
      <el-button type="primary" @click="dialogVisible = true">
        <el-icon><Plus /></el-icon>新增角色
      </el-button>
    </div>

    <div class="admin-card">
      <div class="filter-bar">
        <el-input v-model="keyword" placeholder="角色编码 / 名称" clearable style="width: 240px" />
        <el-button type="primary" @click="search">查询</el-button>
        <el-button @click="keyword = ''">重置</el-button>
      </div>

      <el-table :data="rows" border stripe>
        <el-table-column prop="code" label="角色编码" width="160" />
        <el-table-column prop="name" label="角色名称" min-width="160" />
        <el-table-column label="作用域" width="120" align="center">
          <template #default="{ row }">{{ scopeTypeText(row.scope) }}</template>
        </el-table-column>
        <el-table-column prop="desc" label="描述" min-width="200" />
        <el-table-column label="操作" width="160" align="center" fixed="right">
          <template #default>
            <el-button link type="primary">分配权限</el-button>
            <el-button link type="danger">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="admin-pagination">
        <el-pagination layout="total, prev, pager, next" :total="rows.length" :page-size="10" />
      </div>
    </div>

    <el-dialog v-model="dialogVisible" title="新增角色" width="480px">
      <el-form label-width="80px">
        <el-form-item label="角色编码"><el-input placeholder="如 ROLE_ADMIN" /></el-form-item>
        <el-form-item label="角色名称"><el-input placeholder="角色名称" /></el-form-item>
        <el-form-item label="作用域">
          <el-select placeholder="选择作用域" style="width: 100%">
            <el-option v-for="scope in SCOPE_TYPE_OPTIONS" :key="scope" :label="scopeTypeText(scope)" :value="scope" />
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
import { scopeTypeText } from '@/constants/terms'

const keyword = ref('')
const dialogVisible = ref(false)

/** 角色作用域只在这两类之间选择（与后端 iam_role.scope_type 一致），选项文案走统一词表。 */
const SCOPE_TYPE_OPTIONS = ['PLATFORM', 'TENANT']

const rows = ref([
  { code: 'ROLE_SUPER_ADMIN', name: '超级管理员', scope: 'PLATFORM', desc: '平台全量权限' },
  { code: 'ROLE_PLATFORM_OP', name: '平台运营', scope: 'PLATFORM', desc: '租户与计价方案管理' },
  { code: 'ROLE_TENANT_ADMIN', name: '租户管理员', scope: 'TENANT', desc: '门店与业务管理' },
  { code: 'ROLE_CASHIER', name: '收银员', scope: 'TENANT', desc: '收银与订单' },
])

function search() {
  ElMessage.info('该查询为占位实现，暂未接入后端接口')
}

function save() {
  dialogVisible.value = false
  ElMessage.success('已保存（占位，未写入后端）')
}
</script>
