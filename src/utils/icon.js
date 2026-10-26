import {
  Avatar, Box, ChatDotRound, Coin, CreditCard, DataAnalysis, Document, Grid, HomeFilled,
  Key, Lock, Management, Menu, Money, OfficeBuilding, PriceTag, Setting, Shop, Star, Tickets,
  TrendCharts, User, UserFilled,
  Wallet, Goods, List, Clock, Calendar, Service, Collection, Mic, Tools, SetUp, TakeawayBox,
} from '@element-plus/icons-vue'

// 后端菜单 / 后台列表的 icon 为语义名（chat/building/shop…）。
const iconMap = {
  chat: ChatDotRound,
  building: OfficeBuilding,
  shop: Shop,
  home: HomeFilled,
  user: User,
  users: UserFilled,
  price: PriceTag,
  money: Money,
  coin: Coin,
  wallet: Wallet,
  lock: Lock,
  key: Key,
  role: Avatar,
  permission: Lock,
  avatar: Avatar,
  store: Shop,
  resource: Grid,
  box: Box,
  order: Tickets,
  payment: CreditCard,
  'credit-card': CreditCard,
  collection: Collection,
  report: DataAnalysis,
  chart: TrendCharts,
  calendar: Calendar,
  list: List,
  clock: Clock,
  goods: Goods,
  service: Service,
  management: Management,
  tickets: Tickets,
  menu: Menu,
  setting: Setting,
  star: Star,
  // 审计日志菜单（后端 icon 语义名 audit / document / log 都能落到图标）
  audit: Document,
  document: Document,
  log: Document,
}

// 后端菜单历史种子存在同图标复用的码；按菜单 code 做唯一性覆盖，
// 不依赖重新刷库，保证侧栏在本地/生产同一套菜单数据下也不出现重复图标。
const codeIconMap = {
  'store.resource': Management,
  'store.stock': TakeawayBox,
  'store.crm': UserFilled,
  'store.settings': SetUp,
  'tenant.finance': CreditCard,
  'tenant.iam': Avatar,
  'tenant.wallet-token-config': Coin,
  'tenant.settings': Tools,
  ktv: Mic,
  pricing: PriceTag,
}

export function resolveIcon(icon, code) {
  if (code && codeIconMap[code]) return codeIconMap[code]
  return iconMap[icon] || Menu
}
