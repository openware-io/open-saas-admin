# gv_saas_admin 多语言（vue-i18n）落地方案

- 状态：**方案稿**。多语言已纳入 2.0 规划，但本轮只做「术语/状态/错误提示」收敛（`src/constants/terms.js`），**不引入 vue-i18n、不做全量文案搬迁**。
- 依据：`gv_im_server/docs/audit-2026-09-17-exceptions-and-i18n.md` §4.5（两个前端都无 i18n 基础设施）、§4.6~4.9（术语/金额/时间各自实现）、§7.3（文案重复与中英混排）。
- 本轮已铺好的地基：`src/constants/terms.js`（词表唯一出处）、`src/utils/format.js`（金额/时间/枚举格式化唯一实现）、`src/utils/adminErrorMessage.js`（服务端错误码 → 中文唯一映射）、`src/constants/terms.test.js`（源码级防回退）。

## 1. 目标与边界

| 做 | 不做 |
|---|---|
| 先把**用户可见文案**收敛到少数几处（已有 constants/utils） | 不逐行把 1800+ 行中文搬进 json（一次性大爆炸，风险不可控） |
| 建立可增量替换的目录、key 规范与门禁 | 不做语言切换 UI（2.0 再定默认语言/时区与租户配置的关系，见 `platform/tenants.vue` 的 `defaultLocale`/`defaultTimezone`） |
| 让「新代码」从第一天就带 key | 不回改历史页面（按路由/功能分批） |

## 2. 目录结构（引入 vue-i18n 时新增）

```
src/
  locales/
    index.js              # createI18n 实例、locale 解析（租户配置 → localStorage → 浏览器 → zh-CN）
    formatters.js         # 金额/时间/数字格式化（包裹 utils/format，避免页面各自 Intl）
    zh-CN/
      common.json         # 通用词：确定/取消/保存/刷新/操作/暂无数据…
      terms.json          # 术语：包厢/租户/门店/商户/应收/已收/可退/房态看板…（与 constants/terms.js 一一对应）
      status.json         # 状态枚举：支付/预约/日结/资源/储值流水…
      error.json          # 前端兜底提示 + 服务端错误码文案（与 utils/adminErrorMessage.js 同源）
      menu.json           # 路由 meta.title（router/index.js）
      views/              # 页面私有文案，按路由分文件：tenant.orders.json / tenant.payments.json …
    en/
      ...（同构，按需增量）
```

- 与 `constants/terms.js` 的关系：`terms.js` 是**当前**的唯一出处；接入 i18n 后它逐步退化为「key → `t()`」的薄映射层（例如 `TERMS.ktvRoom` 改为 `resource.ktvRoom`），保证页面**不必同时改两遍**。
- 与 `adminErrorMessage.js` 的关系：错误码映射继续保留在 `utils/`，但其文案改为从 `locales/*/error.json` 读取，避免 json 与 js 双份维护。

## 3. key 命名规范

```
<域>.<对象>.<字段>          # 全小写点分，禁止下划线与驼峰
```

| 类型 | 规范 | 示例 |
|---|---|---|
| 术语（名词） | `term.<名词>` | `term.ktvRoom`、`term.merchant`、`term.money.receivable` |
| 状态枚举 | `status.<对象>.<后端枚举小写>` | `status.pay.succeeded`、`status.reservation.pending` |
| 菜单/页面标题 | `menu.<routeName>` | `menu.Resources` |
| 表单项/列名 | `<view>.<form\|column>.<field>` | `tenant.orders.column.payableAmount` |
| 按钮/动作 | `action.<动词>` | `action.submit`、`action.collect` |
| 提示/错误 | `error.<code 小写>` 或 `error.local.<语义>` | `error.admin_login_invalid`、`error.local.csrf_token_missing` |
| 带参数 | ICU 具名占位符 | `"tenant.orders.collected": "已收 {amount}"` |

约定：

1. **key 里不放中文、不放完整句子**（只放语义标识）；文案只存在于 json。
2. 金额/时间**不写进文案**，用占位符 + formatter：`t('tenant.orders.amount', { amount: formatYuan(minor) })`。
3. 复数/量词（如「1 张」）优先用 ICU `{count, plural, ...}` 或显式 `_one/_other`，不拼字符串。
4. 后端错误码直接作为 key 片段（`code.toLowerCase()`），保证「后端加码、前端补齐」时规则机械可执行。

## 4. 渐进替换步骤

1. **第 0 步（已做）**：术语/状态/错误提示收敛到 `constants/terms.js` + `utils/format.js` + `utils/adminErrorMessage.js`；`terms.test.js` 守住回退。
2. **第 1 步（基础设施，独立 PR）**：加 `vue-i18n` 依赖与 `src/locales/index.js`，只迁 `common.json`（确定/取消/保存/刷新/暂无数据）与 `menu.json`（路由标题），其余页面照旧。此时应用行为不变，可随时回滚。
3. **第 2 步（术语与状态）**：把 `terms.js` 的每个常量改成 `t('term.*')`/`t('status.*')`，页面无需改动（因为它们已经引用常量）。这一步收益最大、改动面最小。
4. **第 3 步（按路由分批迁页面私有文案）**：一次一个路由目录（先 `tenant/`，后 `platform/`），每个 PR 只迁一个页面；CI 增加「该页面不得再出现中文字面量」的白名单式校验，逐步把页面加进白名单。
5. **第 4 步（en 增量）**：只对已迁完的 key 出 en 文案；缺失 key 用 CI 校验（`zh-CN` 有而 `en` 无 → 报错或告警）。
6. **最后**：打开语言切换与 `defaultLocale` 租户配置（需与产品确认默认值与回退链路）。

## 5. 防回退（lint / 门禁）

已经生效（本轮落地）：

- `src/constants/terms.test.js`：
  - 词表契约（术语值、金额字段、分钟单位、品牌名默认值）；
  - 源码扫描：页面不得出现禁用词（房间/包间/商家/待收/房台）、不得自行 `/ 100`、`* 100`、不得硬编码 `¥`、不得重复实现金额/时间函数、不得直接 `toLocaleString()` 渲染日期；
  - 已知欠账用 `KNOWN_DEBT` 显式登记（当前只有并发批次的 `views/tenant/orders.vue`），修完即删条目，避免「隐性豁免」。
- `src/utils/admin-copy.test.js`：包厢术语、储值品牌名、错误提示透传等既有守卫。

引入 vue-i18n 后追加：

1. **ESLint 规则（本地即可拦截）**：`vue/no-bare-strings-in-template` + `no-restricted-syntax` 禁止 `Literal[value=/\p{Script=Han}/u]`（白名单保留 `constants/`、`locales/`、测试）。
2. **CI 门禁 `npm run i18n:check`**：
   - key 完整性：`zh-CN` 每个 key 在 `en` 有定义（或有 `_todo` 标记）；
   - 幽灵 key：代码里 `t('x')` 必须在 json 中存在；
   - 未抽取中文：`src/views/**` 里出现中文字面量即失败（白名单文件逐个减少）。
3. **提交前钩子**：与 `npm test` 合并（`npm run check` 已串联 test + build），CI 只跑 `npm run check` + `i18n:check`。

## 6. 格式化与 locale（必须走 formatter，不写死）

- 金额：继续只走 `utils/format.js`（`fenToYuan` / `yuanToFen` / `formatYuan` / `formatYuanValue`）。分只落库、界面一律元。
- 时间：继续只走 `formatTime`；需要秒的场景单独加 `formatTimeWithSeconds`，不要回到 `toLocaleString()`（运行环境 locale 不确定，且时区口径不可控）。
- 数字千分位/货币符号：接入 i18n 后由 `locales/formatters.js` 统一包裹 `Intl.NumberFormat(locale, …)`，页面不允许直接 `Intl`。
- 后端字段与错误码不改（`payableAmount` / `ADMIN_LOGIN_INVALID` 等仍是英文技术标识）。

## 7. 风险与前置依赖

1. `platform/tenants.vue` 已有「默认语言 / 默认时区」配置项但无承载机制，落地前需产品确认：默认语言是否按租户生效、C/B 端与后台是否同一套 locale。
2. 后端 141 个业务码中 120 个前端无映射（审计 §4.4），且 18 个 message 为英文；i18n 前应先由后端导出码表（或 OpenAPI）驱动 `error.json`，否则抽取后仍是英文兜底。
3. 同一金额字段在 B 端/C 端/后台的称呼尚未完全一致（`gv_saas_mobile` 的「待收」），跨仓库词表应对齐 `terms.js` 后再抽取。
