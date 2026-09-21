import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  DEFAULT_CURRENCY,
  currencyMeta,
  parseSupportedCurrencies,
  resolveCurrencyCode,
} from '@/constants/currency'
import { getTenantCurrency, updateTenantCurrency } from '@/api/currency'
import {
  currentCurrencyCode,
  currentSupportedCurrencies,
  resetCurrencyRuntime,
  setCurrency,
  setSupportedCurrencies,
} from '@/utils/currency-runtime'

/**
 * 全局币种 store（租户级唯一来源，§2/§3）。
 *
 *  - 当前币种的响应式状态在 `utils/currency-runtime`（叶子模块），
 *    这样 `formatMoney`、axios 拦截器与页面读到的是**同一份**，不会出现「各页面各请求一套」；
 *  - 本 store 只负责「取/改后端币种 + 维护 supported 列表」；
 *  - 写入时机：登录后 / 选择上下文后（context select 响应带 currencyCode）/ 币种设置保存后。
 *
 * 缺省与非法值口径见 §1/§4：无值 = USD，非法值 = 保留当前币种 + 一条 console warn。
 */
export const useCurrencyStore = defineStore('currency', () => {
  const loading = ref(false)
  const saving = ref(false)
  const error = ref('')
  /** 是否已经从后端读到过本租户币种（避免每次进页面都请求）。 */
  const loaded = ref(false)

  const code = computed(() => currentCurrencyCode())
  // 后端 supported 里带 minorUnitDigits 时以它为准（新增币种不必改前端），否则用本地字典。
  const meta = computed(() => {
    const base = currencyMeta(currentCurrencyCode(), DEFAULT_CURRENCY)
    const option = currentSupportedCurrencies().find((item) => item.code === base.code)
    if (!option || !Number.isFinite(Number(option.digits))) return base
    return {
      ...base,
      symbol: option.symbol || base.symbol,
      label: option.label || base.label,
      digits: Number(option.digits),
    }
  })
  const symbol = computed(() => meta.value.symbol)
  const label = computed(() => meta.value.label)
  const minorUnitDigits = computed(() => meta.value.digits)
  const supported = computed(() => currentSupportedCurrencies())

  /**
   * 应用后端币种响应（GET/PUT 同一结构，§2；老字段名 currency 也兼容）。
   * 响应缺 currencyCode 时保留当前币种，由调用方决定是否再走一次 GET。
   */
  function applyResponse(data) {
    if (!data) return currentCurrencyCode()
    setSupportedCurrencies(parseSupportedCurrencies(data.supported))
    const next = data.currencyCode ?? data.currency
    if (next === null || next === undefined || next === '') return currentCurrencyCode()
    return setCurrency(next)
  }

  /** 读取租户币种；`force` 为 true 时强制刷新。失败不抛错（保留当前币种），由页面决定是否提示。 */
  async function load(force = false) {
    if (loaded.value && !force) return code.value
    loading.value = true
    error.value = ''
    try {
      applyResponse(await getTenantCurrency())
      loaded.value = true
      return code.value
    } catch (e) {
      error.value = e?.message || '获取租户币种失败'
      return code.value
    } finally {
      loading.value = false
    }
  }

  /** 修改租户币种（需 tenant.currency.manage）；失败向上抛，由页面统一提示。 */
  async function update(nextCode) {
    const target = resolveCurrencyCode(nextCode, code.value)
    saving.value = true
    try {
      const data = await updateTenantCurrency(target)
      // 后端响应为准（可能带最新 supported）；缺字段时用提交值兜底，保证「保存后立刻全站生效」。
      const applied = applyResponse(data)
      if (!data || (data.currencyCode ?? data.currency) == null) setCurrency(target)
      loaded.value = true
      return (data && (data.currencyCode ?? data.currency)) ? applied : target
    } finally {
      saving.value = false
    }
  }

  /** 退出登录 / 切换账号：回到缺省 USD（含清掉网关闭包），避免把上一个租户的币种带到下一个账号。 */
  function reset() {
    resetCurrencyRuntime()
    loaded.value = false
    error.value = ''
  }

  return {
    code,
    meta,
    symbol,
    label,
    minorUnitDigits,
    supported,
    loading,
    saving,
    error,
    loaded,
    setCurrency,
    applyResponse,
    load,
    update,
    reset,
  }
})
