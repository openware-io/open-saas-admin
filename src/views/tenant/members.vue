<template>
  <div class="admin-page">
    <div class="page-header">
      <h2>客户管理</h2>
      <div class="header-actions">
        <el-button @click="load">
          <el-icon><Refresh /></el-icon>刷新
        </el-button>
        <el-button @click="rebuildNameIndex">
          <el-icon><Refresh /></el-icon>重建姓名索引
        </el-button>
        <el-button type="primary" @click="openCreate">
          <el-icon><Plus /></el-icon>新建客户
        </el-button>
      </div>
    </div>

    <div class="admin-card">
      <div class="filter-bar">
        <!-- 建档时间（joinedAt）：from/to 是闭区间，结束端由后端收口到当天 23:59:59 -->
        <DateRangeFilter v-model="query.range" />
        <el-input v-model="query.keyword" placeholder="客户号 / 姓名 / 手机号 / IM 账号" clearable style="width: 260px" @keyup.enter="search" />
        <el-select v-model="query.status" placeholder="状态" clearable style="width: 140px">
          <el-option label="待激活" value="PENDING" />
          <el-option label="正常" value="ACTIVE" />
          <el-option label="暂停" value="SUSPENDED" />
          <el-option label="已关闭" value="CLOSED" />
        </el-select>
        <el-input-number v-model="query.level" :min="1" placeholder="等级" style="width: 140px" />
        <el-button type="primary" @click="search">查询</el-button>
        <el-button @click="reset">重置</el-button>
      </div>

      <el-table :data="rows" v-loading="loading" border stripe>
        <el-table-column prop="memberNo" label="客户号" width="190" />
        <el-table-column label="姓名" min-width="130">
          <template #default="{ row }">{{ memberNameText(row) }}</template>
        </el-table-column>
        <el-table-column prop="phone" label="手机号" min-width="140" />
        <el-table-column label="IM 账号" min-width="180">
          <template #default="{ row }">
            <template v-if="row.imAccount">
              <!-- 显示 IM 侧真实账号（im_server.user.username）；登录标识 im_<id> 放 title 里备查。 -->
              <span :title="'IM 登录标识：' + row.imAccount">{{ imAccountText(row) }}</span>
              <el-tag v-if="row.imAccountDeleted" type="danger" effect="plain" size="small" style="margin-left: 6px">
                IM 账号已删除
              </el-tag>
            </template>
            <el-tag v-else type="danger" effect="plain">无 IM 关联</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="账号类型" width="110" align="center">
          <template #default="{ row }">
            <el-tag v-if="row.accountType" :type="row.accountType === 'EMPLOYEE' ? 'warning' : 'info'" effect="plain">
              {{ accountTypeText(row.accountType) }}
            </el-tag>
            <span v-else>—</span>
          </template>
        </el-table-column>        <el-table-column label="IM 用户名" min-width="130">
          <template #default="{ row }">{{ row.imUsername || '—' }}</template>
        </el-table-column>
        <el-table-column prop="levelId" label="等级" width="80" align="center" />
        <el-table-column label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="memberStatusType(row.status)">{{ memberStatusText(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="建档时间" width="160">
          <template #default="{ row }">{{ formatTime(row.joinedAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="210" align="center" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openDetail(row)">详情</el-button>
            <el-button link type="primary" @click="openPoints(row)">积分</el-button>
            <el-button link type="success" @click="openWallet(row)">储值</el-button>
            <el-button v-if="!row.imAccount || row.imAccountDeleted" link type="danger" @click="purgeUnlinked(row)">
              清理
            </el-button>
          </template>
        </el-table-column>
        <template #empty>
          <el-empty description="暂无客户" />
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

    <el-dialog v-model="createVisible" title="新建客户" width="480px">
      <el-form label-width="90px">
        <el-form-item label="姓名">
          <el-input v-model="createForm.name" placeholder="姓名" />
        </el-form-item>
        <el-form-item label="手机号">
          <el-input v-model="createForm.phone" placeholder="手机号" />
        </el-form-item>
        <el-form-item label="IM 账号">
          <el-input v-model="createForm.imAccount" placeholder="IM 登录标识（如 im_71 / openId，可空）" />
        </el-form-item>
        <el-form-item label="IM 用户名">
          <el-input v-model="createForm.imUsername" placeholder="IM 用户名 / 昵称（可空）" />
        </el-form-item>
        <el-form-item label="营销授权">
          <el-switch v-model="createForm.consent" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" @click="save">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="detailVisible" title="客户详情" width="520px">
      <el-descriptions v-if="detail" :column="1" border>
        <el-descriptions-item label="客户号">{{ detail.memberNo }}</el-descriptions-item>
        <el-descriptions-item label="姓名">{{ detail.name || '—' }}</el-descriptions-item>
        <el-descriptions-item label="手机号">{{ detail.phone || '—' }}</el-descriptions-item>
      </el-descriptions>
      <el-form label-width="90px" style="margin-top: 16px">
        <el-form-item label="IM 账号">
          <el-input v-model="bindForm.imAccount" placeholder="IM 登录标识（如 im_71 / openId）" />
        </el-form-item>
        <el-form-item label="IM 用户名">
          <el-input v-model="bindForm.imUsername" placeholder="IM 用户名 / 昵称" />
        </el-form-item>
      </el-form>
      <div class="dialog-hint">
        同一个 IM 账号只能绑定一个客户；已被其它客户占用时保存会失败并提示现有客户号。
        姓名 / 手机号无「客户隐私查看」权限时按脱敏显示。
      </div>
      <template #footer>
        <el-button @click="detailVisible = false">取消</el-button>
        <el-button type="primary" @click="saveBinding">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="pointsVisible" title="客户积分" width="600px">
      <el-descriptions v-if="pointsAccount" :column="2" border style="margin-bottom: 16px">
        <el-descriptions-item label="可用积分">{{ formatPoints(pointsAccount.availablePoints ?? 0) }}</el-descriptions-item>
        <el-descriptions-item label="冻结积分">{{ formatPoints(pointsAccount.frozenPoints ?? 0) }}</el-descriptions-item>
      </el-descriptions>
      <div class="adjust-bar">
        <el-input-number v-model="pointsForm.points" :min="1" style="width: 140px" />
        <el-input v-model="pointsForm.reason" placeholder="调整原因" style="width: 220px" />
        <el-button type="primary" @click="doAdjust">积分调整</el-button>
      </div>
      <el-table v-if="ledger.length" :data="ledger" border size="small" style="margin-top: 14px">
        <el-table-column prop="entryType" label="类型" width="100" align="center">
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
    </el-dialog>

    <el-dialog v-model="walletVisible" title="客户储值" width="520px">
      <el-descriptions v-if="wallet" :column="2" border>
        <el-descriptions-item :label="'可用' + walletTokenBrand">{{ formatTokens(walletTokenCount) }}</el-descriptions-item>
        <el-descriptions-item :label="'冻结' + walletTokenBrand">{{ formatTokens(walletFrozenTokenCount) }}</el-descriptions-item>
        <el-descriptions-item label="代币名称">{{ walletTokenBrand }}</el-descriptions-item>
        <el-descriptions-item label="状态">{{ memberWalletStatusText(wallet.status) }}</el-descriptions-item>
      </el-descriptions>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh, Plus } from '@element-plus/icons-vue'
import {
  listMembers,
  createMember,
  purgeUnlinkedMember,
  getMemberPoints,
  adjustPoints,
  getMemberWallet,
  bindMemberIm,
  rebuildMemberNameIndex,
} from '@/api/member'
import { getWalletTokenConfig } from '@/api/admin'
import DateRangeFilter from '@/components/DateRangeFilter.vue'
import { dateRangeParams, dateRangeWarning, emptyDateRange } from '@/utils/dateRange'
import { formatPoints, formatTime, formatTokens, resolveTokenBrand, resolveTokenCount, resolveTokenRatio } from '@/utils/format'
import { ACCOUNT_TYPE_TEXT, LEGACY_PLACEHOLDER_NAMES, WALLET_BRAND_NAME_DEFAULT, memberStatusText, memberStatusType, memberWalletStatusText, pointsEntryTypeText, resolveWalletBrandName, accountTypeText } from '@/constants/terms'

/**
 * 清理「无 IM 关联」的客户（垃圾数据）：客户一定从 IM 进来，所以没有 IM 身份的档案是垃圾。
 * 二次确认后调后端；后端有引用时会拒绝，这里把它的中文原因原样展示（不自己编话术）。
 */
async function purgeUnlinked(row) {
  const deletedIm = Boolean(row && row.imAccountDeleted)
  try {
    await ElMessageBox.confirm(
      deletedIm
        ? '该客户挂的 IM 账号在 IM 侧已不存在（用户已删除），已失去有效 IM 关联，将按垃圾数据清理，删除后不可恢复。是否继续？'
        : '该客户没有 IM 关联（正常客户都从 IM 进入），将按垃圾数据清理，删除后不可恢复。是否继续？',
      deletedIm ? '清理 IM 账号已删除的客户' : '清理无 IM 关联客户',
      { confirmButtonText: '确认清理', cancelButtonText: '返回', type: 'warning' },
    )
  } catch (dismissed) {
    return
  }
  try {
    const result = await purgeUnlinkedMember(row.id)
    ElMessage.success('已清理客户 ' + ((result && result.memberNo) || row.memberNo || ''))
    await load()
  } catch (e) {
    notifyAdminRequestError(e, '清理失败')
  }
}
/**
 * 「IM 账号」列显示值：优先 IM 侧**真实账号**（im_server.user.username，如 user600）；
 * 后端解析不到时回退为登录标识，至少不显示空白。
 */
function imAccountText(row) {
  const real = (row?.imAccountName || '').trim()
  return real || row?.imAccount || '—'
}
function memberNameText(row) {
  const nickname = (row?.imUsername || '').trim()
  if (nickname) return nickname
  const name = (row?.name || '').trim()
  return name && !LEGACY_PLACEHOLDER_NAMES.includes(name) ? name : '—'
}
import { notifyAdminRequestError } from '@/utils/adminErrorMessage'
import { useContextStore } from '@/stores/context'

const contextStore = useContextStore()
const rows = ref([])
const total = ref(0)
const loading = ref(false)
const query = reactive({ page: 1, pageSize: 10, keyword: '', level: null, status: '', range: emptyDateRange() })

const createVisible = ref(false)
const createForm = reactive({ name: '', phone: '', imAccount: '', imUsername: '', consent: true })

const detailVisible = ref(false)
const detail = ref(null)
const bindForm = reactive({ imAccount: '', imUsername: '' })

const pointsVisible = ref(false)
const pointsAccount = ref(null)
const ledger = ref([])
const pointsForm = reactive({ points: 1, reason: '' })
const pointsMemberId = ref(null)

const walletVisible = ref(false)
const wallet = ref(null)
/** 储值展示名 / 兑换比例：租户配置为唯一来源，缺配置走 constants/terms 的默认品牌名与默认比例。 */
const walletBrandName = ref(WALLET_BRAND_NAME_DEFAULT)
const walletRatio = ref(resolveTokenRatio(null))

/** 客户状态 / 储值账户状态 / 积分流水类型的中文词表统一在 constants/terms。 */

/**
 * 客户储值账户：余额本身是最小货币单位整数，但**代币不是货币**，界面只显示数量。
 * 数量优先取服务端 `tokenAmount` / `tokenBrandName`，缺字段时用已取到的租户配置按同一公式降级换算；
 * 时间统一走 formatTime，不再出现货币符号或币种。
 */
const walletTokenBrand = computed(() => resolveTokenBrand(wallet.value?.tokenBrandName, walletBrandName.value))
const walletTokenCount = computed(() => resolveTokenCount(wallet.value?.tokenAmount, wallet.value?.availableAmount, walletRatio.value))
const walletFrozenTokenCount = computed(() => resolveTokenCount(wallet.value?.frozenTokenAmount, wallet.value?.frozenAmount, walletRatio.value))

async function loadWalletTokenConfig() {
  try {
    const cfg = await getWalletTokenConfig(contextStore.tenantId)
    walletBrandName.value = resolveWalletBrandName(cfg)
    walletRatio.value = resolveTokenRatio(cfg?.ratio)
  } catch { /* 缺配置用默认品牌名与默认比例，不阻塞页面 */ }
}

async function load() {
  loading.value = true
  try {
    const data = await listMembers({
      page: query.page,
      pageSize: query.pageSize,
      keyword: query.keyword || undefined,
      level: query.level || undefined,
      status: query.status || undefined,
      ...dateRangeParams(query.range),
    })
    rows.value = data?.records || []
    total.value = Number(data?.total || 0)
  } catch (e) {
    notifyAdminRequestError(e, '加载客户失败')
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
  query.status = ''
  query.level = null
  query.range = emptyDateRange()
  search()
}

function openCreate() {
  createForm.name = ''
  createForm.phone = ''
  createForm.imAccount = ''
  createForm.imUsername = ''
  createForm.consent = true
  createVisible.value = true
}

async function save() {
  if (!createForm.name || !createForm.phone) {
    ElMessage.warning('请填写姓名和手机号')
    return
  }
  try {
    // accountId / imAccount 命中既有客户时服务端返回那条客户（幂等），不会产生重复客户。
    await createMember({
      accountId: null,
      name: createForm.name,
      phone: createForm.phone,
      imAccount: createForm.imAccount || null,
      imUsername: createForm.imUsername || null,
      consent: createForm.consent,
    })
    ElMessage.success('已保存')
    createVisible.value = false
    load()
  } catch (e) {
    notifyAdminRequestError(e, '创建失败')
  }
}

function openDetail(row) {
  detail.value = row
  bindForm.imAccount = row.imAccount || ''
  bindForm.imUsername = row.imUsername || ''
  detailVisible.value = true
}

async function saveBinding() {
  try {
    const updated = await bindMemberIm(detail.value.id, {
      imAccount: bindForm.imAccount,
      imUsername: bindForm.imUsername,
    })
    ElMessage.success('已绑定')
    detail.value = updated
    detailVisible.value = false
    load()
  } catch (e) {
    notifyAdminRequestError(e, '绑定 IM 账号失败')
  }
}

async function rebuildNameIndex() {
  try {
    await ElMessageBox.confirm(
      '为当前租户中「还没有姓名检索索引」的客户重建盲索引（姓名是随机 IV 密文，只能逐条解密重建）。是否继续？',
      '重建姓名索引',
      { type: 'warning' },
    )
  } catch {
    return
  }
  try {
    const result = await rebuildMemberNameIndex({ tenantId: contextStore.tenantId })
    ElMessage.success(`已重建 ${result?.rebuilt ?? 0} 条，失败 ${result?.failed ?? 0} 条，剩余 ${result?.remaining ?? 0} 条`)
  } catch (e) {
    notifyAdminRequestError(e, '重建姓名索引失败')
  }
}

async function openPoints(row) {
  pointsMemberId.value = row.id
  pointsAccount.value = null
  ledger.value = []
  pointsForm.points = 1
  pointsForm.reason = ''
  pointsVisible.value = true
  try {
    const data = await getMemberPoints(row.id, { page: 1, pageSize: 20 })
    pointsAccount.value = data?.account || null
    ledger.value = data?.ledger?.records || []
  } catch (e) {
    notifyAdminRequestError(e, '加载积分失败')
  }
}

async function doAdjust() {
  if (!pointsForm.reason) {
    ElMessage.warning('请填写调整原因')
    return
  }
  try {
    await adjustPoints(pointsMemberId.value, {
      points: pointsForm.points,
      reason: pointsForm.reason,
      commandId: 'pts-' + Date.now(),
    })
    ElMessage.success('已调整积分')
    openPoints({ id: pointsMemberId.value })
  } catch (e) {
    notifyAdminRequestError(e, '调整失败')
  }
}

async function openWallet(row) {
  wallet.value = null
  walletVisible.value = true
  try {
    wallet.value = await getMemberWallet(row.id)
  } catch (e) {
    notifyAdminRequestError(e, '加载储值失败')
  }
}

onMounted(() => {
  load()
  // 代币品牌名 / 比例用于「服务端没给 tokenAmount」时的降级换算，与列表加载并行。
  loadWalletTokenConfig()
})
</script>

<style scoped>
.header-actions { display: flex; gap: 12px; }
.adjust-bar { display: flex; gap: 12px; align-items: center; }
.dialog-hint { margin-top: 8px; color: #909399; font-size: 12px; line-height: 1.6; }
</style>
