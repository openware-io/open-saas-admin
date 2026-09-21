<template>
  <div class="admin-page">
    <div class="page-header">
      <h2>计价方案</h2>
      <el-button type="primary" @click="dialogVisible = true">
        <el-icon><Plus /></el-icon>新增方案
      </el-button>
    </div>

    <div class="admin-card">
      <div class="filter-bar">
        <el-input v-model="keyword" placeholder="方案名称 / 编码" clearable style="width: 240px" />
        <el-button type="primary" @click="search">查询</el-button>
        <el-button @click="keyword = ''">重置</el-button>
      </div>

      <el-table :data="rows" border stripe>
        <el-table-column prop="code" label="方案编码" width="140" />
        <el-table-column prop="name" label="方案名称" min-width="160" />
        <el-table-column :label="withCurrencyLabel('价格/月')" width="140" align="right">
          <template #default="{ row }">{{ formatMoney(row.priceMinor, row.currencyCode) }}</template>
        </el-table-column>
        <el-table-column label="币种" width="100" align="center">
          <template #default="{ row }">{{ currencyText(row.currencyCode) }}</template>
        </el-table-column>
        <el-table-column prop="quota" label="门店/包厢配额" width="150" />
        <el-table-column label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="activeStatusType(row.status)">{{ activeStatusText(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="140" align="center" fixed="right">
          <template #default>
            <el-button link type="primary">编辑</el-button>
            <el-button link type="danger">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="admin-pagination">
        <el-pagination layout="total, prev, pager, next" :total="rows.length" :page-size="10" />
      </div>
    </div>

    <el-dialog v-model="dialogVisible" title="新增计价方案" width="480px">
      <el-form label-width="110px">
        <el-form-item label="方案编码"><el-input placeholder="如 plan-standard" /></el-form-item>
        <el-form-item label="方案名称"><el-input placeholder="标准版" /></el-form-item>
        <el-form-item :label="withCurrencyLabel('价格/月')"><el-input-number :min="0" style="width: 100%" /></el-form-item>
        <el-form-item label="门店/包厢配额"><el-input-number :min="0" style="width: 100%" /></el-form-item>
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
import { currencyText, formatMoney, withCurrencyLabel } from '@/utils/format'
import { activeStatusText, activeStatusType } from '@/constants/terms'

const keyword = ref('')
const dialogVisible = ref(false)

// 占位数据（接口未接入）：金额同样按最小货币单位存，展示统一走 formatMoney（符号取自当前币种），
// 页面不得自造货币符号；状态用后端枚举 ACTIVE / DISABLED，展示走 constants/terms 的统一词表。
const rows = ref([
  { code: 'plan-standard', name: '标准版', priceMinor: 99900, quota: '1 门店 / 20 包厢', status: 'ACTIVE' },
  { code: 'plan-premium', name: '旗舰版', priceMinor: 299900, quota: '5 门店 / 200 包厢', status: 'ACTIVE' },
  { code: 'plan-trial', name: '试用版', priceMinor: 0, quota: '1 门店 / 5 包厢', status: 'DISABLED' },
])

function search() {
  ElMessage.info('该查询为占位实现，暂未接入后端接口')
}

function save() {
  dialogVisible.value = false
  ElMessage.success('已保存（占位，未写入后端）')
}
</script>
