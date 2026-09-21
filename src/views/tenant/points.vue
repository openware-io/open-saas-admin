<template>
  <div class="admin-page">
    <div class="page-header">
      <h2>积分管理</h2>
      <div class="header-actions">
        <el-button @click="load">
          <el-icon><Refresh /></el-icon>刷新
        </el-button>
      </div>
    </div>

    <div class="admin-card">
      <div class="filter-bar">
        <!-- 客户建档时间（joinedAt）：from/to 是闭区间，结束端由后端收口到当天 23:59:59 -->
        <DateRangeFilter v-model="query.range" />
        <el-input v-model="query.keyword" placeholder="客户号 / 手机号" clearable style="width: 220px" @keyup.enter="search" />
        <el-button type="primary" @click="search">查询</el-button>
        <el-button @click="reset">重置</el-button>
      </div>

      <el-table :data="rows" v-loading="loading" border stripe>
        <el-table-column prop="memberNo" label="会员号" width="200" />
        <el-table-column prop="name" label="姓名" min-width="110" />
        <el-table-column prop="phone" label="手机号" min-width="140" />
        <el-table-column label="可用积分" width="130" align="right">
          <template #default="{ row }">{{ formatPoints(row.availablePoints) }}</template>
        </el-table-column>
        <el-table-column label="冻结积分" width="130" align="right">
          <template #default="{ row }">{{ formatPoints(row.frozenPoints) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="160" align="center" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openLedger(row)">明细</el-button>
            <el-button link type="success" @click="openAdjust(row)">调整</el-button>
          </template>
        </el-table-column>
        <template #empty>
          <el-empty description="暂无积分账户" />
        </template>
      </el-table>

      <div class="admin-pagination">
        <el-pagination
          layout="total, prev, pager, next, sizes"
          :total="total"
          v-model:current-page="query.page"
          v-model:page-size="query.pageSize"
          :page-sizes="[10, 20, 50]"
          @current-change="load"
          @size-change="search"
        />
      </div>
    </div>

    <el-dialog v-model="adjustVisible" title="调整积分" width="480px">
      <el-descriptions v-if="current" :column="2" border style="margin-bottom: 14px">
        <el-descriptions-item label="客户">{{ current.name || current.memberNo }}</el-descriptions-item>
        <el-descriptions-item label="当前积分">{{ formatPoints(current.availablePoints) }}</el-descriptions-item>
      </el-descriptions>
      <el-form label-width="80px">
        <el-form-item label="变动积分">
          <el-input-number v-model="adjustForm.points" :min="-999999" :max="999999" style="width: 200px" />
        </el-form-item>
        <el-form-item label="调整原因">
          <el-input v-model="adjustForm.reason" placeholder="调整原因" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="adjustVisible = false">取消</el-button>
        <el-button type="primary" @click="doAdjust">确认调整</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="ledgerVisible" title="积分明细" width="640px">
      <el-descriptions v-if="current" :column="2" border style="margin-bottom: 14px">
        <el-descriptions-item label="客户">{{ current.name || current.memberNo }}</el-descriptions-item>
        <el-descriptions-item label="可用积分">{{ formatPoints(current.availablePoints) }}</el-descriptions-item>
      </el-descriptions>
      <el-table v-if="ledger.length" :data="ledger" border size="small">
        <el-table-column label="类型" width="100" align="center">
          <template #default="{ row }">{{ pointsEntryTypeText(row.entryType) }}</template>
        </el-table-column>
        <el-table-column label="变动" width="110" align="right">
          <template #default="{ row }">{{ formatPoints(row.points) }}</template>
        </el-table-column>
        <el-table-column label="余额" width="110" align="right">
          <template #default="{ row }">{{ formatPoints(row.balanceAfter) }}</template>
        </el-table-column>
        <el-table-column label="时间" min-width="150">
          <template #default="{ row }">{{ formatTime(row.occurredAt) }}</template>
        </el-table-column>
      </el-table>
      <el-empty v-else description="暂无积分流水" />
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import { listPointsAccounts, getMemberPoints, adjustPoints } from '@/api/member'
import DateRangeFilter from '@/components/DateRangeFilter.vue'
import { dateRangeParams, dateRangeWarning, emptyDateRange } from '@/utils/dateRange'
import { formatPoints, formatTime } from '@/utils/format'
import { pointsEntryTypeText } from '@/constants/terms'
import { notifyAdminRequestError } from '@/utils/adminErrorMessage'

const rows = ref([])
const total = ref(0)
const loading = ref(false)
const query = reactive({ page: 1, pageSize: 10, keyword: '', range: emptyDateRange() })

const adjustVisible = ref(false)
const ledgerVisible = ref(false)
const current = ref(null)
const adjustForm = reactive({ points: 100, reason: '' })
const ledger = ref([])

/** 积分流水类型 → 中文（cst_point_ledger.entry_type）：词表唯一出处 constants/terms。 */

async function load() {
  loading.value = true
  try {
    const data = await listPointsAccounts({
      page: query.page,
      pageSize: query.pageSize,
      keyword: query.keyword || undefined,
      ...dateRangeParams(query.range),
    })
    rows.value = data?.records || []
    total.value = Number(data?.total || 0)
  } catch (e) {
    notifyAdminRequestError(e, '加载积分账户失败')
  } finally {
    loading.value = false
  }
}

function search() {
  // 查询入口统一守一道门：区间倒挂时只提示、不发请求（后端也会兜 400）。
  const warning = dateRangeWarning(query.range)
  if (warning) { ElMessage.warning(warning); return }
  query.page = 1
  load()
}
function reset() {
  query.keyword = ''
  query.range = emptyDateRange()
  search()
}

function openAdjust(row) {
  current.value = row
  adjustForm.points = 100
  adjustForm.reason = ''
  adjustVisible.value = true
}

async function doAdjust() {
  if (!adjustForm.reason) {
    ElMessage.warning('请填写调整原因')
    return
  }
  if (!adjustForm.points || adjustForm.points === 0) {
    ElMessage.warning('变动积分不能为0')
    return
  }
  try {
    await adjustPoints(current.value.memberId, {
      points: adjustForm.points,
      reason: adjustForm.reason,
      commandId: 'pts-' + Date.now(),
    })
    ElMessage.success('已调整积分')
    adjustVisible.value = false
    load()
  } catch (e) {
    notifyAdminRequestError(e, '调整失败')
  }
}

async function openLedger(row) {
  current.value = row
  ledger.value = []
  ledgerVisible.value = true
  try {
    const data = await getMemberPoints(row.memberId, { page: 1, pageSize: 50 })
    ledger.value = data?.ledger?.records || []
  } catch (e) {
    notifyAdminRequestError(e, '加载明细失败')
  }
}

onMounted(load)
</script>

<style scoped>
.header-actions { display: flex; gap: 12px; }
</style>
