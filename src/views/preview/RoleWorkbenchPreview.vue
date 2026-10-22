<template>
  <div class="role-preview">
    <div class="preview-bar">
      <div class="preview-title">
        <span class="preview-kicker">PROTOTYPE</span>
        <strong>角色工作台</strong>
        <span class="preview-sub">同一套后台，不同身份看到不同工作区</span>
      </div>
      <el-radio-group v-model="roleKey" size="small" class="role-switch">
        <el-radio-button v-for="role in roles" :key="role.key" :value="role.key">
          {{ role.label }}
        </el-radio-button>
      </el-radio-group>
      <el-tag type="warning" effect="plain" size="small">Mock · 2.4.0</el-tag>
    </div>

    <div class="shell">
      <aside class="sidebar">
        <div class="brand">
          <div class="brand-mark">O</div>
          <div>
            <strong>OpenChat</strong>
            <span>{{ role.workspace }}</span>
          </div>
        </div>

        <div class="context-card">
          <div class="context-label">当前工作区</div>
          <div class="context-title">{{ role.workspace }}</div>
          <div class="context-path">{{ role.context }}</div>
          <div class="context-meta">
            <el-icon><Location /></el-icon>
            <span>{{ role.scopeLabel }}</span>
          </div>
        </div>

        <nav class="nav">
          <div v-for="section in role.nav" :key="section.title" class="nav-section">
            <div class="nav-section-title">{{ section.title }}</div>
            <button
              v-for="item in section.items"
              :key="item.key"
              class="nav-item"
              :class="{ active: activeNav === item.key }"
              type="button"
              @click="selectNav(item)"
            >
              <el-icon><component :is="item.icon" /></el-icon>
              <span>{{ item.label }}</span>
              <span v-if="item.badge" class="nav-badge">{{ item.badge }}</span>
            </button>
          </div>
        </nav>

        <div class="sidebar-foot">
          <el-icon><Lock /></el-icon>
          <span>仅展示当前角色可访问的模块</span>
        </div>
      </aside>

      <main class="main">
        <header class="topbar">
          <div class="crumb">
            <span>{{ role.workspace }}</span>
            <el-icon><ArrowRight /></el-icon>
            <strong>{{ activeLabel }}</strong>
          </div>
          <div class="topbar-actions">
            <el-badge :value="role.alertCount" :hidden="!role.alertCount" type="danger">
              <button class="icon-button" type="button" aria-label="通知" @click="notify('原型：通知中心')">
                <el-icon><Bell /></el-icon>
              </button>
            </el-badge>
            <button class="context-button" type="button" @click="notify('原型：切换门店 / 业态')">
              <el-icon><OfficeBuilding /></el-icon>
              {{ role.contextShort }}
              <el-icon><ArrowDown /></el-icon>
            </button>
            <div class="avatar">A</div>
          </div>
        </header>

        <div class="content">
          <div class="page-head">
            <div>
              <div class="page-eyebrow">{{ role.workspace }} / {{ role.scopeLabel }}</div>
              <h1>{{ isHome ? role.title : activeLabel }}</h1>
              <p>{{ isHome ? role.subtitle : '该模块沿用现有页面；原型阶段只验证它在导航中的位置。' }}</p>
            </div>
            <el-button v-if="isHome" type="primary" @click="notify('原型：' + role.primaryAction)">
              {{ role.primaryAction }}
            </el-button>
          </div>

          <template v-if="isHome">
            <div class="metrics">
              <div v-for="metric in role.metrics" :key="metric.label" class="metric-card" :class="metric.tone">
                <div class="metric-label">{{ metric.label }}</div>
                <div class="metric-value">{{ metric.value }}</div>
                <div class="metric-hint">{{ metric.hint }}</div>
              </div>
            </div>

            <div class="dashboard-grid">
              <section class="panel panel-main">
                <div class="panel-head">
                  <div>
                    <h2>{{ role.tableTitle }}</h2>
                    <p>{{ role.tableHint }}</p>
                  </div>
                  <el-button link type="primary" @click="notify('原型：查看全部')">查看全部</el-button>
                </div>
                <div class="data-table" :style="{ '--cols': role.columns.length }">
                  <div class="table-row table-head">
                    <span v-for="col in role.columns" :key="col">{{ col }}</span>
                  </div>
                  <div v-for="(row, index) in role.rows" :key="index" class="table-row">
                    <span v-for="(cell, colIndex) in row.cells" :key="colIndex" :class="{ strong: colIndex === 0 }">
                      <span v-if="cell && cell.tag" class="status-pill" :class="cell.tone">{{ cell.text }}</span>
                      <template v-else>{{ cell }}</template>
                    </span>
                  </div>
                </div>
              </section>

              <section class="panel panel-side">
                <div class="panel-head">
                  <div>
                    <h2>{{ role.sideTitle }}</h2>
                    <p>{{ role.sideHint }}</p>
                  </div>
                </div>

                <div v-if="role.sideType === 'alerts'" class="alert-list">
                  <div v-for="alert in role.alerts" :key="alert.title" class="alert-item">
                    <span class="alert-dot" :class="alert.tone" />
                    <div>
                      <strong>{{ alert.title }}</strong>
                      <p>{{ alert.detail }}</p>
                    </div>
                  </div>
                </div>

                <div v-else-if="role.sideType === 'businesses'" class="business-grid">
                  <div v-for="business in role.businesses" :key="business.name" class="business-card">
                    <div class="business-icon"><el-icon><component :is="business.icon" /></el-icon></div>
                    <div class="business-name">{{ business.name }}</div>
                    <div class="business-value">{{ business.value }}</div>
                    <div class="business-hint">{{ business.hint }}</div>
                  </div>
                </div>

                <div v-else-if="role.sideType === 'rooms'" class="room-grid">
                  <div v-for="room in role.rooms" :key="room.no" class="room-cell" :class="room.tone">
                    <strong>{{ room.no }}</strong>
                    <span>{{ room.label }}</span>
                  </div>
                </div>

                <div v-else-if="role.sideType === 'tasks'" class="quick-list">
                  <button v-for="task in role.quickTasks" :key="task.label" class="quick-item" type="button" @click="notify('原型：' + task.label)">
                    <span class="quick-icon"><el-icon><component :is="task.icon" /></el-icon></span>
                    <span>
                      <strong>{{ task.label }}</strong>
                      <small>{{ task.hint }}</small>
                    </span>
                    <el-icon class="quick-arrow"><ArrowRight /></el-icon>
                  </button>
                </div>

                <div v-else class="floor-grid">
                  <div v-for="room in role.floors" :key="room.no" class="floor-cell" :class="room.tone">
                    <strong>{{ room.no }}</strong>
                    <span>{{ room.label }}</span>
                    <small>{{ room.hint }}</small>
                  </div>
                </div>
              </section>
            </div>

            <div class="permission-note">
              <el-icon><Lock /></el-icon>
              <span>
                当前身份：{{ role.label }}。左侧只渲染该角色可访问的模块；无权限项不会出现，也不存在“点进去才提示没有权限”。
              </span>
            </div>
          </template>

          <div v-else class="module-placeholder">
            <div class="placeholder-icon"><el-icon><Grid /></el-icon></div>
            <h2>{{ activeLabel }}</h2>
            <p>该模块在正式方案中保留现有业务页面，仅重新归属到当前工作区。</p>
            <el-button @click="goHome">返回{{ role.homeLabel }}</el-button>
          </div>
        </div>
      </main>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  ArrowDown, ArrowRight, Bell, Calendar, Clock, DataAnalysis, Document, Goods,
  Grid, House, Location, Lock, Monitor, Money, OfficeBuilding, Service,
  Setting, Shop, Star, Tickets, TrendCharts, User, Wallet,
} from '@element-plus/icons-vue'

const roles = [
  {
    key: 'platform',
    label: '平台超管',
    workspace: '平台运营',
    scopeLabel: '全平台',
    context: '全平台 · 128 个租户 · 342 家门店',
    contextShort: '全平台',
    title: '平台经营总览',
    subtitle: '租户健康、套餐与平台风险，不进入任何一家门店的日常经营。',
    primaryAction: '新建租户',
    homeKey: 'overview',
    homeLabel: '平台概览',
    alertCount: 3,
    nav: [
      {
        title: '平台',
        items: [
          { key: 'overview', label: '平台概览', icon: Monitor },
          { key: 'tenants', label: '租户与套餐', icon: OfficeBuilding, badge: '3' },
          { key: 'iam', label: '平台权限', icon: Lock },
          { key: 'payments', label: '支付方式', icon: Wallet },
          { key: 'audit', label: '审计与健康', icon: Document },
        ],
      },
    ],
    metrics: [
      { label: '租户总数', value: '128', hint: '本月 +12', tone: 'blue' },
      { label: '活跃门店', value: '342', hint: '较上月 +8.2%', tone: 'green' },
      { label: '待续费租户', value: '7', hint: '30 天内到期', tone: 'amber' },
      { label: '平台异常', value: '3', hint: '支付/消息/存储', tone: 'red' },
    ],
    tableTitle: '租户健康',
    tableHint: '平台只看租户与套餐，不进门店业务页面',
    columns: ['租户', '套餐', '门店', '健康状态', '到期'],
    rows: [
      { cells: ['OpenChat 生活服务', '集团版', '8', { text: '正常', tag: true, tone: 'success' }, '2027-06-30'] },
      { cells: ['海城酒店集团', '酒店版', '12', { text: '正常', tag: true, tone: 'success' }, '2027-03-31'] },
      { cells: ['星聚会 KTV', '标准版', '5', { text: '待续费', tag: true, tone: 'warning' }, '2026-11-15'] },
      { cells: ['云上健身', '试用版', '2', { text: '风险', tag: true, tone: 'danger' }, '2026-10-31'] },
    ],
    sideTitle: '平台告警',
    sideHint: '只处理平台级异常',
    sideType: 'alerts',
    alerts: [
      { title: '支付渠道成功率下降', detail: '微信支付 15 分钟成功率 92.1%', tone: 'red' },
      { title: '3 个租户即将到期', detail: '最早 2026-10-31 到期', tone: 'amber' },
      { title: '对象存储容量 78%', detail: '按当前增速约 14 天触发阈值', tone: 'amber' },
    ],
  },
  {
    key: 'hq',
    label: '集团总部',
    workspace: '集团总部',
    scopeLabel: '租户范围内',
    context: 'OpenChat 生活服务 / 总部 · 8 家门店',
    contextShort: '集团总部',
    title: '集团经营总览',
    subtitle: '跨门店看经营、看组合、定策略，不替代店长做日常操作。',
    primaryAction: '查看集团报表',
    homeKey: 'overview',
    homeLabel: '经营总览',
    alertCount: 9,
    nav: [
      {
        title: '集团',
        items: [
          { key: 'overview', label: '经营总览', icon: DataAnalysis },
          { key: 'portfolio', label: '业务组合', icon: Grid },
          { key: 'stores', label: '门店与业态', icon: Shop },
          { key: 'members', label: '会员与客户', icon: User },
          { key: 'finance', label: '资金与支付', icon: Wallet },
          { key: 'reports', label: '报表', icon: TrendCharts },
        ],
      },
      {
        title: '治理',
        items: [
          { key: 'iam', label: '组织与权限', icon: Lock },
          { key: 'policies', label: '策略中心', icon: Setting },
        ],
      },
    ],
    metrics: [
      { label: '集团营收', value: '$286k', hint: '较上月 +11.4%', tone: 'blue' },
      { label: '酒店入住率', value: '82%', hint: '8 家酒店', tone: 'green' },
      { label: 'KTV 开台率', value: '67%', hint: '5 家门店', tone: 'green' },
      { label: '待处理事项', value: '9', hint: '策略/权限/异常', tone: 'amber' },
    ],
    tableTitle: '门店经营排名',
    tableHint: '按门店聚合，不展示具体订单明细',
    columns: ['门店', '业态', '今日营收', '经营指标', '状态'],
    rows: [
      { cells: ['西湖酒店', '酒店', '$42.8k', '入住率 86%', { text: '正常', tag: true, tone: 'success' }] },
      { cells: ['滨江 KTV', 'KTV', '$18.6k', '开台率 74%', { text: '正常', tag: true, tone: 'success' }] },
      { cells: ['机场酒店', '酒店', '$12.1k', '入住率 61%', { text: '关注', tag: true, tone: 'warning' }] },
      { cells: ['城西 KTV', 'KTV', '$9.4k', '开台率 48%', { text: '待改善', tag: true, tone: 'danger' }] },
    ],
    sideTitle: '业务组合',
    sideHint: '多业态统一入口，不把所有菜单叠在一起',
    sideType: 'businesses',
    businesses: [
      { name: '酒店', value: '3 家门店', hint: '入住率 82%', icon: OfficeBuilding },
      { name: 'KTV', value: '5 家门店', hint: '开台率 67%', icon: Star },
      { name: '餐饮', value: '未开通', hint: '可申请开通', icon: Service },
      { name: '健身', value: '未开通', hint: '可申请开通', icon: TrendCharts },
    ],
  },
  {
    key: 'hotel',
    label: '酒店店长',
    workspace: '门店经营',
    scopeLabel: '酒店 · 西湖店',
    context: 'OpenChat 酒店 / 西湖店 · 酒店',
    contextShort: '西湖酒店',
    title: '今日经营',
    subtitle: '到店、在住、退房与房态，一屏完成今天的门店动作。',
    primaryAction: '新建预订',
    homeKey: 'today',
    homeLabel: '今日经营',
    alertCount: 4,
    nav: [
      {
        title: '门店',
        items: [
          { key: 'today', label: '今日经营', icon: House },
          { key: 'frontdesk', label: '前台', icon: Service, badge: '8' },
          { key: 'reservations', label: '预订', icon: Calendar },
          { key: 'rooms', label: '房态', icon: Grid },
          { key: 'rates', label: '房价与库存', icon: TrendCharts },
          { key: 'guests', label: '客人', icon: User },
          { key: 'reports', label: '报表', icon: DataAnalysis },
        ],
      },
      {
        title: '管理',
        items: [{ key: 'settings', label: '酒店设置', icon: Setting }],
      },
    ],
    metrics: [
      { label: '今日到店', value: '18', hint: '已入住 10', tone: 'blue' },
      { label: '在住', value: '76', hint: '含续住', tone: 'green' },
      { label: '待退房', value: '12', hint: '今日离店', tone: 'amber' },
      { label: '出租率', value: '82%', hint: '同比 +6%', tone: 'green' },
    ],
    tableTitle: '今日到店与离店',
    tableHint: '店长需要的是任务，不是全量订单表',
    columns: ['客人', '房型', '日期', '状态'],
    rows: [
      { cells: ['王先生', '豪华大床房', '10-22 → 10-24', { text: '待入住', tag: true, tone: 'warning' }] },
      { cells: ['李女士', '景观双床房', '10-22 → 10-23', { text: '在住', tag: true, tone: 'success' }] },
      { cells: ['陈先生', '行政套房', '10-23 → 10-25', { text: '已确认', tag: true, tone: 'info' }] },
      { cells: ['周女士', '豪华大床房', '10-22 → 10-23', { text: '待退房', tag: true, tone: 'danger' }] },
    ],
    sideTitle: '实时房态',
    sideHint: '点击客房进入房态详情',
    sideType: 'rooms',
    rooms: [
      { no: '0801', label: '可用', tone: 'available' },
      { no: '0802', label: '在住', tone: 'occupied' },
      { no: '0803', label: '清扫', tone: 'cleaning' },
      { no: '0805', label: '可用', tone: 'available' },
      { no: '0806', label: '待退', tone: 'dueout' },
      { no: '0808', label: '在住', tone: 'occupied' },
      { no: '1201', label: '可用', tone: 'available' },
      { no: '1202', label: '在住', tone: 'occupied' },
      { no: '1203', label: '可用', tone: 'available' },
      { no: '1205', label: '维修', tone: 'maintenance' },
      { no: '1206', label: '在住', tone: 'occupied' },
      { no: '1208', label: '待入', tone: 'arrival' },
    ],
  },
  {
    key: 'frontdesk',
    label: '酒店前台',
    workspace: '门店经营',
    scopeLabel: '酒店 · 西湖店',
    context: 'OpenChat 酒店 / 西湖店 · 前台',
    contextShort: '西湖酒店',
    title: '前台任务',
    subtitle: '只处理今天的客人动作：入住、退房、收款、确认。',
    primaryAction: '扫描证件',
    homeKey: 'today',
    homeLabel: '今日任务',
    alertCount: 5,
    nav: [
      {
        title: '前台',
        items: [
          { key: 'today', label: '今日任务', icon: House, badge: '18' },
          { key: 'checkin', label: '办理入住', icon: Tickets },
          { key: 'checkout', label: '办理退房', icon: Money },
          { key: 'payments', label: '收款', icon: Wallet },
          { key: 'reservations', label: '预订', icon: Calendar },
        ],
      },
    ],
    metrics: [
      { label: '待入住', value: '8', hint: '最早 12:30', tone: 'blue' },
      { label: '待退房', value: '5', hint: '含 2 间超时', tone: 'amber' },
      { label: '待结账', value: '3', hint: '押金/尾款', tone: 'red' },
      { label: '待确认', value: '2', hint: '客户加项', tone: 'amber' },
    ],
    tableTitle: '今日任务队列',
    tableHint: '按优先级排序，先处理影响客人的事项',
    columns: ['任务', '客人', '时间', '优先级'],
    rows: [
      { cells: ['办理入住', '王先生 · 1208', '12:30', { text: '高', tag: true, tone: 'danger' }] },
      { cells: ['退房结算', '周女士 · 0806', '13:00', { text: '高', tag: true, tone: 'danger' }] },
      { cells: ['押金退款', '李女士 · 1506', '14:20', { text: '中', tag: true, tone: 'warning' }] },
      { cells: ['确认加项', '陈先生 · 1206', '15:10', { text: '中', tag: true, tone: 'warning' }] },
    ],
    sideTitle: '快捷操作',
    sideHint: '前台只保留高频动作',
    sideType: 'tasks',
    quickTasks: [
      { label: '办理入住', hint: '选房、收押金、发房卡', icon: Tickets },
      { label: '结账退房', hint: '账单、扣减、退押金', icon: Money },
      { label: '收银/收款', hint: '尾款、押金、挂账', icon: Wallet },
      { label: '查询预订', hint: '按姓名/手机号/单号', icon: Calendar },
    ],
  },
  {
    key: 'ktv',
    label: 'KTV 店长',
    workspace: '门店经营',
    scopeLabel: 'KTV · 旗舰店',
    context: 'OpenChat KTV / 旗舰店 · KTV',
    contextShort: 'KTV 旗舰店',
    title: '今日经营',
    subtitle: '包厢、预约、收银与交班，门店运营的同一套工作台。',
    primaryAction: '快速开台',
    homeKey: 'today',
    homeLabel: '今日经营',
    alertCount: 4,
    nav: [
      {
        title: '门店',
        items: [
          { key: 'today', label: '今日经营', icon: House },
          { key: 'floor', label: '包厢', icon: Grid, badge: '6' },
          { key: 'reservations', label: '预约', icon: Calendar },
          { key: 'cashier', label: '收银', icon: Tickets },
          { key: 'shifts', label: '交班', icon: Clock },
          { key: 'products', label: '商品', icon: Goods },
          { key: 'reports', label: '报表', icon: DataAnalysis },
        ],
      },
      {
        title: '管理',
        items: [{ key: 'settings', label: 'KTV 设置', icon: Setting }],
      },
    ],
    metrics: [
      { label: '开台', value: '24', hint: '可用 8', tone: 'blue' },
      { label: '预约', value: '16', hint: '待确认 3', tone: 'green' },
      { label: '今日营收', value: '$18.6k', hint: '较昨日 +9%', tone: 'green' },
      { label: '待结账', value: '4', hint: '含超时 1', tone: 'amber' },
    ],
    tableTitle: '今日预约与开台',
    tableHint: '门店现场任务，不混入集团报表',
    columns: ['包厢', '类型', '状态', '客人'],
    rows: [
      { cells: ['A01', '大包', { text: '使用中', tag: true, tone: 'success' }, '王先生'] },
      { cells: ['A02', '中包', { text: '已预约', tag: true, tone: 'warning' }, '李女士'] },
      { cells: ['A03', '小包', { text: '可用', tag: true, tone: 'info' }, '—'] },
      { cells: ['A05', '大包', { text: '待结账', tag: true, tone: 'danger' }, '陈先生'] },
    ],
    sideTitle: '包厢状态',
    sideHint: '点击包厢进入开台/结账',
    sideType: 'floors',
    floors: [
      { no: 'A01', label: '使用中', hint: '02:18', tone: 'occupied' },
      { no: 'A02', label: '已预约', hint: '19:30', tone: 'reserved' },
      { no: 'A03', label: '可用', hint: '—', tone: 'available' },
      { no: 'A05', label: '待结账', hint: '$428', tone: 'dueout' },
      { no: 'A06', label: '可用', hint: '—', tone: 'available' },
      { no: 'A07', label: '使用中', hint: '01:05', tone: 'occupied' },
      { no: 'A08', label: '已预约', hint: '20:00', tone: 'reserved' },
      { no: 'A09', label: '可用', hint: '—', tone: 'available' },
    ],
  },
]

const route = useRoute()
const requestedRole = String(route.query.role || '')
const roleKey = ref(roles.some((item) => item.key === requestedRole) ? requestedRole : 'platform')
const role = computed(() => roles.find((item) => item.key === roleKey.value) || roles[0])
const activeNav = ref(role.value.homeKey)

watch(roleKey, () => {
  activeNav.value = role.value.nav[0].items[0].key
})

const activeLabel = computed(() => {
  for (const section of role.value.nav) {
    const found = section.items.find((item) => item.key === activeNav.value)
    if (found) return found.label
  }
  return role.value.homeLabel
})

const isHome = computed(() => activeNav.value === role.value.homeKey)

function selectNav(item) {
  activeNav.value = item.key
}

function goHome() {
  activeNav.value = role.value.homeKey
}

function notify(message) {
  ElMessage.info(message)
}
</script>

<style scoped>
.role-preview {
  min-height: 100vh;
  background: #eef1f6;
  color: #1f2937;
  font-family: Inter, "PingFang SC", "Microsoft YaHei", sans-serif;
}

.preview-bar {
  min-height: 64px;
  padding: 10px 20px;
  display: flex;
  align-items: center;
  gap: 18px;
  flex-wrap: wrap;
  background: #101828;
  color: #fff;
}

.preview-title {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex: 1;
  min-width: 300px;
}

.preview-kicker {
  font-size: 10px;
  letter-spacing: 0.14em;
  color: #84caff;
}

.preview-title strong {
  font-size: 16px;
}

.preview-sub {
  font-size: 12px;
  color: #98a2b3;
}

.role-switch :deep(.el-radio-button__inner) {
  border-color: #344054;
  background: #1d2939;
  color: #d0d5dd;
  box-shadow: none;
}

.role-switch :deep(.el-radio-button__original-radio:checked + .el-radio-button__inner) {
  background: #1570ef;
  border-color: #1570ef;
  color: #fff;
}

.shell {
  display: flex;
  min-height: calc(100vh - 64px);
}

.sidebar {
  width: 244px;
  flex: 0 0 244px;
  background: #111827;
  color: #cbd5e1;
  display: flex;
  flex-direction: column;
  padding: 18px 12px 14px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 8px 18px;
}

.brand-mark {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  background: linear-gradient(135deg, #1570ef, #36bffa);
  display: grid;
  place-items: center;
  color: #fff;
  font-weight: 800;
}

.brand strong {
  display: block;
  color: #fff;
  font-size: 14px;
}

.brand span {
  font-size: 11px;
  color: #98a2b3;
}

.context-card {
  border: 1px solid #1f2a3d;
  background: #0b1220;
  border-radius: 10px;
  padding: 12px;
  margin-bottom: 16px;
}

.context-label {
  font-size: 10px;
  letter-spacing: 0.08em;
  color: #667085;
  text-transform: uppercase;
}

.context-title {
  margin-top: 4px;
  font-size: 14px;
  font-weight: 700;
  color: #f2f4f7;
}

.context-path {
  margin-top: 4px;
  font-size: 11px;
  line-height: 1.5;
  color: #98a2b3;
}

.context-meta {
  margin-top: 8px;
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: #84caff;
}

.nav {
  flex: 1;
  overflow-y: auto;
}

.nav-section-title {
  padding: 10px 10px 6px;
  font-size: 10px;
  letter-spacing: 0.08em;
  color: #667085;
  text-transform: uppercase;
}

.nav-item {
  width: 100%;
  border: 0;
  background: transparent;
  color: #cbd5e1;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 9px 10px;
  border-radius: 7px;
  font-size: 13px;
  cursor: pointer;
  text-align: left;
}

.nav-item:hover {
  background: #1d2939;
  color: #fff;
}

.nav-item.active {
  background: #1570ef;
  color: #fff;
  font-weight: 600;
}

.nav-badge {
  margin-left: auto;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 999px;
  background: #f97066;
  color: #fff;
  font-size: 10px;
  line-height: 18px;
  text-align: center;
}

.sidebar-foot {
  margin-top: 12px;
  padding: 10px;
  border-top: 1px solid #1f2a3d;
  font-size: 10px;
  line-height: 1.5;
  color: #667085;
  display: flex;
  gap: 6px;
  align-items: flex-start;
}

.main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.topbar {
  min-height: 60px;
  padding: 0 24px;
  background: #fff;
  border-bottom: 1px solid #e4e7ec;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.crumb {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 12px;
  color: #667085;
}

.crumb strong {
  color: #101828;
}

.topbar-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.icon-button,
.context-button {
  border: 1px solid #d0d5dd;
  background: #fff;
  border-radius: 7px;
  height: 32px;
  padding: 0 9px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #344054;
  font-size: 12px;
  cursor: pointer;
}

.avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: #d1e9ff;
  color: #1570ef;
  display: grid;
  place-items: center;
  font-weight: 700;
  font-size: 13px;
}

.content {
  padding: 22px 24px 30px;
}

.page-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}

.page-eyebrow {
  font-size: 11px;
  color: #667085;
  margin-bottom: 5px;
}

.page-head h1 {
  margin: 0;
  font-size: 24px;
  line-height: 1.3;
  letter-spacing: -0.02em;
}

.page-head p {
  margin: 6px 0 0;
  font-size: 12px;
  color: #667085;
}

.metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 14px;
}

.metric-card {
  background: #fff;
  border: 1px solid #e4e7ec;
  border-radius: 10px;
  padding: 14px;
  border-top: 3px solid #98a2b3;
}

.metric-card.blue { border-top-color: #2e90fa; }
.metric-card.green { border-top-color: #12b76a; }
.metric-card.amber { border-top-color: #f79009; }
.metric-card.red { border-top-color: #f04438; }

.metric-label {
  font-size: 11px;
  color: #667085;
}

.metric-value {
  margin: 5px 0 2px;
  font-size: 24px;
  font-weight: 750;
  letter-spacing: -0.02em;
}

.metric-hint {
  font-size: 11px;
  color: #98a2b3;
}

.dashboard-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.7fr) minmax(300px, 1fr);
  gap: 14px;
}

.panel {
  background: #fff;
  border: 1px solid #e4e7ec;
  border-radius: 10px;
  padding: 16px;
  min-width: 0;
}

.panel-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 12px;
}

.panel-head h2 {
  margin: 0;
  font-size: 14px;
}

.panel-head p {
  margin: 4px 0 0;
  font-size: 11px;
  color: #98a2b3;
}

.data-table {
  width: 100%;
  overflow-x: auto;
}

.table-row {
  display: grid;
  grid-template-columns: repeat(var(--cols, 5), minmax(90px, 1fr));
  gap: 8px;
  align-items: center;
  min-height: 38px;
  padding: 7px 4px;
  border-bottom: 1px solid #f2f4f7;
  font-size: 12px;
  color: #475467;
}

.table-head {
  min-height: 30px;
  color: #98a2b3;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  border-bottom-color: #e4e7ec;
}

.table-row .strong {
  color: #101828;
  font-weight: 600;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  min-height: 20px;
  padding: 0 7px;
  border-radius: 999px;
  background: #f2f4f7;
  color: #475467;
  font-size: 10px;
  line-height: 20px;
  white-space: nowrap;
}

.status-pill.success { background: #ecfdf3; color: #027a48; }
.status-pill.warning { background: #fffaeb; color: #b54708; }
.status-pill.danger { background: #fef3f2; color: #b42318; }
.status-pill.info { background: #eff8ff; color: #175cd3; }

.alert-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.alert-item {
  display: flex;
  gap: 9px;
  align-items: flex-start;
}

.alert-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-top: 5px;
  background: #98a2b3;
}

.alert-dot.red { background: #f04438; }
.alert-dot.amber { background: #f79009; }

.alert-item strong {
  display: block;
  font-size: 12px;
}

.alert-item p {
  margin: 3px 0 0;
  font-size: 11px;
  color: #667085;
  line-height: 1.5;
}

.business-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.business-card {
  border: 1px solid #e4e7ec;
  border-radius: 9px;
  padding: 12px;
  background: #fcfcfd;
}

.business-icon {
  width: 26px;
  height: 26px;
  border-radius: 7px;
  background: #eff8ff;
  color: #1570ef;
  display: grid;
  place-items: center;
  margin-bottom: 8px;
}

.business-name {
  font-size: 12px;
  font-weight: 650;
}

.business-value {
  margin-top: 5px;
  font-size: 12px;
  color: #101828;
}

.business-hint {
  margin-top: 2px;
  font-size: 10px;
  color: #98a2b3;
}

.room-grid,
.floor-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.room-cell,
.floor-cell {
  border: 1px solid #e4e7ec;
  border-radius: 8px;
  padding: 9px 8px;
  background: #fcfcfd;
  min-height: 58px;
}

.room-cell strong,
.floor-cell strong {
  display: block;
  font-size: 12px;
}

.room-cell span,
.floor-cell span {
  display: block;
  margin-top: 3px;
  font-size: 10px;
  color: #667085;
}

.floor-cell small {
  font-size: 9px;
  color: #98a2b3;
}

.room-cell.available,
.floor-cell.available { border-color: #abefc6; background: #f6fef9; }
.room-cell.occupied,
.floor-cell.occupied { border-color: #b2ddff; background: #f5faff; }
.room-cell.cleaning { border-color: #e4e7ec; background: #f9fafb; }
.room-cell.dueout,
.floor-cell.dueout { border-color: #fecdca; background: #fffbfa; }
.room-cell.maintenance { border-color: #fecdca; background: #fef3f2; }
.room-cell.arrival,
.floor-cell.reserved { border-color: #fedf89; background: #fffcf5; }

.quick-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.quick-item {
  border: 1px solid #e4e7ec;
  border-radius: 8px;
  background: #fcfcfd;
  padding: 10px;
  display: flex;
  align-items: center;
  gap: 9px;
  text-align: left;
  cursor: pointer;
}

.quick-item:hover {
  border-color: #b2ddff;
  background: #f5faff;
}

.quick-icon {
  width: 28px;
  height: 28px;
  border-radius: 7px;
  background: #eff8ff;
  color: #1570ef;
  display: grid;
  place-items: center;
  flex: 0 0 28px;
}

.quick-item strong {
  display: block;
  font-size: 12px;
  color: #101828;
}

.quick-item small {
  display: block;
  margin-top: 2px;
  font-size: 10px;
  color: #98a2b3;
}

.quick-arrow {
  margin-left: auto;
  color: #98a2b3;
}

.permission-note {
  margin-top: 14px;
  padding: 10px 12px;
  border: 1px dashed #d0d5dd;
  border-radius: 8px;
  display: flex;
  gap: 8px;
  align-items: flex-start;
  font-size: 11px;
  line-height: 1.6;
  color: #667085;
  background: #fcfcfd;
}

.module-placeholder {
  min-height: 360px;
  border: 1px dashed #d0d5dd;
  border-radius: 10px;
  background: #fff;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 30px;
}

.placeholder-icon {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  background: #eff8ff;
  color: #1570ef;
  display: grid;
  place-items: center;
  font-size: 22px;
  margin-bottom: 12px;
}

.module-placeholder h2 {
  margin: 0;
  font-size: 18px;
}

.module-placeholder p {
  color: #667085;
  font-size: 12px;
  margin: 8px 0 16px;
}

@media (max-width: 1100px) {
  .metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .dashboard-grid { grid-template-columns: 1fr; }
}

@media (max-width: 760px) {
  .sidebar { display: none; }
  .preview-title { min-width: 100%; }
  .content { padding: 16px; }
  .topbar { padding: 0 16px; }
  .context-button { max-width: 140px; overflow: hidden; }
}
</style>
