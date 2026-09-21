import {
  Avatar, Box, ChatDotRound, Coin, CreditCard, DataAnalysis, Document, Grid, HomeFilled,
  Key, Lock, Menu, OfficeBuilding, PriceTag, Setting, Shop, Star, Tickets,
  TrendCharts, User, UserFilled,
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
  money: Coin,
  coin: Coin,
  lock: Lock,
  key: Key,
  role: Avatar,
  permission: Lock,
  store: Shop,
  resource: Grid,
  box: Box,
  order: Tickets,
  payment: CreditCard,
  report: DataAnalysis,
  chart: TrendCharts,
  menu: Menu,
  setting: Setting,
  star: Star,
  // 审计日志菜单（后端 icon 语义名 audit / document / log 都能落到图标）
  audit: Document,
  document: Document,
  log: Document,
}

export function resolveIcon(icon) {
  return iconMap[icon] || Menu
}
