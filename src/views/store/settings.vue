<template>
  <div class="admin-page store-settings-page">
    <div class="page-header">
      <div>
        <h2>门店设置</h2>
        <p class="subtle">{{ context?.storeName || '当前门店' }} · {{ businessTypeText(context?.businessType) }}</p>
      </div>
      <el-button :disabled="!context?.storeId" @click="go('/store')">返回门店工作台</el-button>
    </div>

    <el-alert
      v-if="!context?.storeId"
      type="warning"
      :closable="false"
      title="请先选择具体门店，门店设置只对当前门店生效"
    />

    <div class="settings-grid">
      <section class="admin-card">
        <div class="section-head">
          <div>
            <h3>当前门店</h3>
            <p class="section-subtitle">门店基础信息来自当前登录上下文</p>
          </div>
          <el-tag effect="plain">{{ businessTypeText(context?.businessType) }}</el-tag>
        </div>
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item label="门店名称">{{ context?.storeName || '-' }}</el-descriptions-item>
          <el-descriptions-item label="门店 ID">{{ context?.storeId || '-' }}</el-descriptions-item>
          <el-descriptions-item label="经营业态">{{ businessTypeText(context?.businessType) }}</el-descriptions-item>
          <el-descriptions-item label="时区">{{ context?.timezone || 'Asia/Shanghai' }}</el-descriptions-item>
        </el-descriptions>
      </section>

      <section class="admin-card">
        <div class="section-head">
          <div>
            <h3>经营入口</h3>
            <p class="section-subtitle">门店设置不替代经营页面，常用配置和现场操作从这里进入</p>
          </div>
        </div>
        <div class="setting-entry-grid">
          <button
            v-for="entry in visibleEntries"
            :key="entry.path"
            class="setting-entry"
            type="button"
            @click="go(entry.path)"
          >
            <span class="setting-entry-icon"><el-icon><component :is="entry.icon" /></el-icon></span>
            <span class="setting-entry-copy">
              <strong>{{ entry.label }}</strong>
              <small>{{ entry.description }}</small>
            </span>
            <span class="setting-entry-arrow">›</span>
          </button>
          <el-empty v-if="!visibleEntries.length" description="当前账号没有可进入的经营配置" :image-size="72" />
        </div>
      </section>
    </div>

    <section class="admin-card settings-note">
      <div class="section-head">
        <div>
          <h3>配置边界</h3>
          <p class="section-subtitle">门店设置只展示当前门店；跨门店、跨业态配置由服务端权限拦截</p>
        </div>
      </div>
      <ul>
        <li>KTV 计价、支付、服务目录和规则统一在「KTV 配置」维护，保存后当前门店生效。</li>
        <li>收银台、支付、交班属于现场经营操作，不在设置页直接改账。</li>
        <li>门店、员工、角色和权限由租户后台或门店管理员按授权维护。</li>
      </ul>
    </section>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import {
  Calendar, Coin, CreditCard, DataAnalysis, Management, SetUp, Tickets,
} from '@element-plus/icons-vue'
import { businessTypeText } from '@/constants/terms'
import { hasPermission } from '@/utils/context'
import { useContextStore } from '@/stores/context'

const router = useRouter()
const contextStore = useContextStore()
const context = computed(() => contextStore.current)

const entries = [
  {
    path: '/admin/ktv/config',
    label: 'KTV 配置',
    description: '计价方案、支付开关、服务目录与经营规则',
    permission: 'ktv.config.manage',
    icon: SetUp,
    businessType: 'KTV',
  },
  {
    path: '/business/orders',
    label: '收银台',
    description: '包厢房态、开台、点单、结台与收款',
    permission: 'order.view',
    icon: Tickets,
  },
  {
    path: '/business/reservations',
    label: '预约管理',
    description: '到店、排期与包厢预约',
    permission: 'reservation.view',
    icon: Calendar,
  },
  {
    path: '/admin/resources',
    label: '资源管理',
    description: '包厢/房态与资源占用',
    permission: 'resource.manage',
    icon: Management,
  },
  {
    path: '/business/payments',
    label: '收银/支付',
    description: '支付流水与退款处理',
    permission: 'payment.collect',
    icon: CreditCard,
  },
  {
    path: '/business/shifts',
    label: '交班/日结',
    description: '班次、现金盘点与营业日结',
    permission: 'order.view',
    icon: Coin,
  },
  {
    path: '/admin/reports',
    label: '门店报表',
    description: '经营、支付、销售和资源报表',
    permission: 'report.view',
    icon: DataAnalysis,
  },
]

const visibleEntries = computed(() => {
  const permissions = context.value?.permissions || []
  const businessType = context.value?.businessType
  return entries.filter((entry) => {
    if (entry.businessType && entry.businessType !== businessType) return false
    return !entry.permission || hasPermission(permissions, entry.permission)
  })
})

function go(path) {
  router.push(path)
}
</script>

<style scoped>
.store-settings-page { display: flex; flex-direction: column; gap: 18px; }
.settings-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr); gap: 18px; }
.section-subtitle { margin: 4px 0 0; color: #8492a6; font-size: 12px; }
.setting-entry-grid { display: flex; flex-direction: column; gap: 8px; margin-top: 14px; }
.setting-entry {
  display: flex; align-items: center; gap: 12px; width: 100%; padding: 12px 14px; border: 1px solid #e8eef7;
  border-radius: 10px; background: #fff; text-align: left; cursor: pointer; transition: border-color .16s ease, box-shadow .16s ease;
}
.setting-entry:hover { border-color: #9fc4f8; box-shadow: 0 6px 16px rgba(42, 94, 170, .1); }
.setting-entry-icon {
  display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 34px;
  border-radius: 9px; color: #3f7bd9; background: #eef5ff; flex: none;
}
.setting-entry-copy { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.setting-entry-copy strong { color: #2d3b50; font-size: 13px; }
.setting-entry-copy small { color: #8492a6; font-size: 12px; line-height: 1.45; }
.setting-entry-arrow { margin-left: auto; color: #a9b5c5; font-size: 20px; }
.settings-note ul { margin: 12px 0 0; padding-left: 20px; color: #66758a; font-size: 13px; line-height: 1.9; }
@media (max-width: 900px) { .settings-grid { grid-template-columns: 1fr; } }
</style>
