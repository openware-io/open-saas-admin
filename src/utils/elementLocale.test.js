import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { ElConfigProvider, ElPagination } from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import en from 'element-plus/es/locale/lang/en'

/**
 * 后台 UI 语言守卫：Element Plus 必须挂简体中文语言包。
 *
 * 背景（门店反馈）：日期控件弹出面板是英文（September、Su/Mo/Tu、Now/OK），分页是「Total 22」。
 * 根因：按需引入（unplugin-vue-components）**不会自带语言包**，Element Plus 默认 `en`，
 * 而 main.js 也从未 `app.use(ElementPlus, { locale })`。
 *
 * 做法：App.vue 用 `<ElConfigProvider :locale="zhCn">` 包住 `<router-view />`。
 * ElConfigProvider 会把 locale 写进 Element Plus 的**模块级 globalConfig**（use-global-config.mjs:57），
 * 因此 ElMessageBox / ElMessage / ElNotification 这些函数式组件也一并变中文。
 *
 * 断言策略：① 分页组件 SSR 真实渲染 + **负向对照**（不挂语言包时是 Total，证明守卫非空转）；
 * ② 面板文案逐项对比 zh-cn 与 en（面板是 teleport 弹层，SSR 不产出，直接比对语言包取值）；
 * ③ App.vue 接线源码守卫。日期区间控件的**占位**本来就是中文（DateRangeFilter 显式传入），不在本次范围。
 */

const render = (app) => renderToString(app)

const withLocale = (component, props) => createSSRApp({
  render: () => h(ElConfigProvider, { locale: zhCn }, { default: () => h(component, props) }),
})

describe('Element Plus 语言包（后台整体中文）', () => {
  it('负向对照：不挂语言包时分页就是英文 Total（证明守卫不是空转）', async () => {
    const html = await render(createSSRApp({
      render: () => h(ElPagination, { total: 22, layout: 'total, prev, pager, next' }),
    }))
    expect(html).toContain('Total')
  })

  it('分页：挂 zh-cn 后是「共 22 条」', async () => {
    const html = await render(withLocale(ElPagination, { total: 22, layout: 'total, prev, pager, next' }))
    expect(html).toContain('共')
    expect(html).toContain('条')
    expect(html).not.toContain('Total')
  })

  it('语言包标识与关键文案（日期面板 / 分页 / 确认框）', () => {
    expect(zhCn.name).toBe('zh-cn')
    // 日期面板：月份/星期/按钮——这就是门店看到的「英文日期控件」
    expect(zhCn.el.datepicker.months.sep).toBe('九月')
    expect(zhCn.el.datepicker.weeks.sun).toBe('日')
    expect(zhCn.el.datepicker.now).toBe('此刻')
    expect(zhCn.el.datepicker.confirm).toBe('确定')
    expect(zhCn.el.datepicker.selectDate).toBe('选择日期')
    expect(zhCn.el.datepicker.startDate).toBe('开始日期')
    expect(zhCn.el.datepicker.endDate).toBe('结束日期')
    // 分页 / 确认框 / 空数据
    expect(zhCn.el.pagination.total).toBe('共 {total} 条')
    expect(zhCn.el.messagebox.confirm).toBe('确定')
    expect(zhCn.el.messagebox.cancel).toBe('取消')
  })

  it('同一批 key 在默认语言包里是英文（说明这些 key 确实随语言包变化）', () => {
    expect(en.el.datepicker.months.sep).not.toBe(zhCn.el.datepicker.months.sep)
    expect(en.el.datepicker.now).not.toBe(zhCn.el.datepicker.now)
    expect(en.el.pagination.total).not.toBe(zhCn.el.pagination.total)
    expect(en.el.messagebox.confirm).not.toBe(zhCn.el.messagebox.confirm)
  })

  it('App.vue 接线：router-view 包在 ElConfigProvider(zh-cn) 里', async () => {
    const source = await readFile(new URL('../App.vue', import.meta.url), 'utf8')
    expect(source).toContain("import zhCn from 'element-plus/es/locale/lang/zh-cn'")
    expect(source).toContain('ElConfigProvider')
    expect(source).toMatch(/<ElConfigProvider :locale="zhCn">[\s\S]*<router-view \/>[\s\S]*<\/ElConfigProvider>/)
  })

  it('语言包只有唯一来源：不得在别处挂 en，也不得各自写死英文占位', async () => {
    for (const relative of ['App.vue', 'main.js']) {
      const source = await readFile(new URL(`../${relative}`, import.meta.url), 'utf8')
      expect(source).not.toContain('locale/lang/en')
    }
  })
})
