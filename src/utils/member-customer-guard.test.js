import { describe, expect, it } from 'vitest'
import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

/**
 * 「会员」→「客户」口径守卫（源码扫描）。
 *
 * `cst_member` 实际存的是**客户**：等级 / 权益 / 成长值业务都没有实现，界面与菜单一律按「客户」展示，
 * 但**路径与字段名不动**（`/business/members`、`memberNo`、`member.js`），否则会牵动菜单授权与既有链接。
 *
 * 这条守卫防止两件回退：
 *  1. 页面/路由标题又变回「会员管理」，或界面文案里重新出现面向用户的「会员」措辞；
 *  2. IM 绑定入口（列 + 编辑绑定）被删掉——「防止同一 IM 用户生成多条客户」的 UI 抓手就没了。
 */

const srcRoot = fileURLToPath(new URL('..', import.meta.url))

/** 与其它源码守卫同口径：先去掉注释，避免「说明为什么不再这么写」的注释被当成实现。 */
function stripComments(source) {
  return source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

const read = async (...segments) => readFile(path.join(srcRoot, ...segments), 'utf8')
const readView = async (relative) => stripComments(await read('views', relative))

describe('「会员管理」改名「客户管理」（源码守卫）', () => {
  it('members.vue 面向用户不再出现「会员」措辞，标题/列头/空态都是「客户」', async () => {
    const source = await readView('tenant/members.vue')
    expect(source).not.toContain('会员')
    expect(source).toContain('客户管理')
    expect(source).toContain('新建客户')
    expect(source).toContain('暂无客户')
    expect(source).toContain('label="客户号"')
    expect(source).toContain('建档时间')
  })

  it('路由 business/members 的 meta.title 是「客户管理」，路径与 name 不变', async () => {
    const source = await read('router', 'index.js')
    const start = source.indexOf("path: 'business/members'")
    expect(start).toBeGreaterThan(-1)
    const block = source.slice(start, start + 400)
    expect(block).toContain("title: '客户管理'")
    expect(block).not.toContain('会员管理')
    expect(block).toContain("name: 'Members'")
  })

  it('审计资源名 cst_member 按客户口径展示（储值/积分词条保持原样）', async () => {
    const source = await read('constants', 'terms.js')
    expect(source).toContain("cst_member: '客户'")
    // 储值管理 / 积分管理页面不在本次改名范围：这两个词条必须保持原样
    expect(source).toContain("cst_wallet_account: '客户储值'")
    expect(source).toContain("cst_point_account: '客户积分'")
  })

  it('members.vue 有 IM 账号 / IM 用户名列，并能编辑绑定（PUT /im-binding）', async () => {
    const source = await readView('tenant/members.vue')
    expect(source).toContain('label="IM 账号"')
    expect(source).toContain('label="IM 用户名"')
    expect(source).toContain('bindMemberIm(')
    // 无 IM 关联的行要显式标记（不再用「—」蒙混），有值直接显示 IM 标识
    expect(source).toContain('无 IM 关联')
    expect(source).toContain('row.imAccount')
    // 姓名以 IM 昵称优先，且占位名「会员」不作为姓名展示
    expect(source).toContain('memberNameText(row)')
    expect(source).toContain('LEGACY_PLACEHOLDER_NAMES')
  })

  it('api/member.js 暴露绑定与姓名索引回填入口，且路径与后端一致', async () => {
    const source = await read('api', 'member.js')
    expect(source).toContain("request.put('/api/v1/business/members/' + id + '/im-binding'")
    expect(source).toContain("'/api/v1/business/members/name-index/rebuild'")
  })

  it('改名不动代币口径：members.vue 仍只走 formatTokens / formatPoints（不得出现 formatMoney）', async () => {
    const source = await readView('tenant/members.vue')
    expect(source).toContain('formatTokens(')
    expect(source).toContain('formatPoints(')
    expect(source).toContain('resolveTokenCount(')
    expect(source).toContain('resolveTokenRatio(')
    expect(source).not.toContain('formatMoney')
  })

  it('全站页面不得再把「客户」这个人称作「会员」（表单/详情标签、独立文本）', async () => {
    // 门店反馈：储值/积分/收款页仍把选中的客户写成「会员」，与「客户管理」两套叫法。
    // 允许保留的是**资产/价格口径**（会员储值 / 会员积分 / 会员价），它们不在 .vue 里出现标签形态。
    const files = await collectVueFiles(path.join(srcRoot, 'views'))
    const rootFiles = await collectVueFiles(path.join(srcRoot, 'components'))
    const offenders = []
    for (const file of [...files, ...rootFiles]) {
      const source = stripComments(await readFile(file, 'utf8'))
      if (/label="会员"/.test(source) || />\s*会员\s*</.test(source)) {
        offenders.push(path.relative(srcRoot, file))
      }
    }
    expect(offenders).toEqual([])
  })
})

/** 递归收集 .vue 文件（排除测试/快照）。 */
async function collectVueFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) files.push(...await collectVueFiles(full))
    else if (entry.name.endsWith('.vue')) files.push(full)
  }
  return files
}
