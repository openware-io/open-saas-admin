import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'

/**
 * 「门店变更申请 → 平台审批」接线守卫（P0，源码级）。
 *
 * 口径（`STORE_CHANGE_APPROVAL_WORKFLOW.md` rev3）：租户侧**不保留任何直写门店**的入口，
 * 四个写动作统一走申请单；平台侧新增审批队列页。这里用源码断言把「页面接错接口 / 又把直写加回来」
 * 挡在测试里，而不是等联调时才发现审批被绕过。
 */
const read = (relative) => readFile(new URL(relative, import.meta.url), 'utf8')

function importedNames(source, modulePath) {
  const escaped = modulePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = source.match(new RegExp(`import \{([\\s\\S]*?)\\} from '${escaped}'`))
  return match ? match[1] : ''
}

describe('租户门店页（stores.vue）：申请制', () => {
  it('只从 api/store 引入申请/只读函数，不含任何直写函数', async () => {
    const source = await read('../views/tenant/stores.vue')
    const names = importedNames(source, '@/api/store')
    for (const required of [
      'submitStoreChangeRequest',
      'listStoreChangeRequests',
      'cancelStoreChangeRequest',
      'getStoreCreateDefaults',
      'listStores',
    ]) {
      expect(names).toContain(required)
    }
    for (const legacy of ['createStore', 'updateStore', 'updateStoreStatus', 'deleteStore', 'updateStoreLogo']) {
      expect(names).not.toContain(legacy)
    }
  })

  it('页头「申请新增门店」+ 行内申请动作 + 变更记录抽屉', async () => {
    const source = await read('../views/tenant/stores.vue')
    expect(source).toContain('CHANGE_TEXT.createTitle')
    expect(source).toContain('CHANGE_TEXT.recordsTitle')
    expect(source).toContain('buildStoreChangeActions')
    expect(source).toContain('pendingRequestLabel')
    // 待审批新增申请卡片（CREATE 审批通过前门店不存在，必须单独提示）
    expect(source).toContain('pendingCreates')
    expect(source).toContain('CHANGE_TEXT.pendingCreateTitle')
    // 撤销入口（PENDING 才可撤销）
    expect(source).toContain('cancelStoreChangeRequest')
  })

  it('提交前理由必填 + 必须带 baseVersion（借纯函数组装请求体）', async () => {
    const source = await read('../views/tenant/stores.vue')
    expect(source).toContain('VALIDATION.reasonRequired')
    expect(source).toContain('STORE_CHANGE_VALIDATION_TEXT')
    expect(source).toContain('validateChangeRequest')
    expect(source).toContain('buildChangeRequestBody')
    expect(source).toContain('idempotencyKey: createIdempotencyKey()')
  })

  it('门店上下文：禁用申请/记录入口 + 顶部提示条「切回总部」（不再静默失败）', async () => {
    const source = await read('../views/tenant/stores.vue')
    expect(source).toContain('isStoreScope')
    expect(source).toContain('CHANGE_TEXT.storeScopeHint')
    expect(source).toContain('switchToHeadquarter')
    expect(source).toContain('contextStore.select(target.contextId)')
    // 门店级上下文下 pending 申请不发请求（避免 403 静默）
    expect(source).toMatch(/if \(isStoreScope\.value\)[\s\S]{0,120}pendingRequests\.value = \[\]/)
  })

  it('待审批申请加载失败不静默：顶部提示重试', async () => {
    const source = await read('../views/tenant/stores.vue')
    expect(source).toContain('pendingLoadFailed')
    expect(source).toContain('CHANGE_TEXT.pendingLoadFailedHint')
  })

  it('提交前切回租户总部上下文（门店级上下文会被服务端 400 拒绝）', async () => {
    const source = await read('../views/tenant/stores.vue')
    expect(source).toContain('ensureHeadquarterContext')
    expect(source).toContain('contextStore.select(target.contextId)')
  })

  it('表单复用既有字段与 ImageUrlEditor（Logo 也走编辑申请，不再直写 logo 接口）', async () => {
    const source = await read('../views/tenant/stores.vue')
    expect(source).toContain("import ImageUrlEditor from '@/components/ImageUrlEditor.vue'")
    expect(source).toContain('emptyStoreChangeForm')
    expect(source).toContain('storeChangeFormFromRow')
    expect(source).toContain('getStoreCreateDefaults')
  })

  it('create-defaults 失败时业态/组织下拉仍能显示当前值（不显示空标签）', async () => {
    const source = await read('../views/tenant/stores.vue')
    expect(source).toContain('withCurrentOption')
    expect(source).toContain('organizationOptionsWithCurrent')
  })

  it('已删除门店状态有中文映射与筛选兜底', async () => {
    const terms = await read('../constants/terms.js')
    expect(terms).toContain("DELETED: '已删除'")
    const source = await read('../views/tenant/stores.vue')
    expect(source).toContain('value="DELETED"')
  })
})

describe('平台审批页（store-approvals.vue）', () => {
  it('队列/详情/通过/驳回四个接口路径正确', async () => {
    const source = await read('../views/platform/store-approvals.vue')
    const names = importedNames(source, '@/api/store')
    for (const required of [
      'listPlatformStoreChangeRequests',
      'getPlatformStoreChangeRequest',
      'approveStoreChangeRequest',
      'rejectStoreChangeRequest',
    ]) {
      expect(names).toContain(required)
    }
    expect(source).toContain('platform.store.change.approve')
  })

  it('详情抽屉展示 before → after diff 与 payload，状态非 PENDING 不可审批', async () => {
    const source = await read('../views/platform/store-approvals.vue')
    expect(source).toContain('detailDiff')
    expect(source).toContain('buildChangeDiffForRequest')
    expect(source).toContain('PAGE_TEXT.diffTitle')
    expect(source).toContain('payloadText')
    // footer 只用 canReview（PENDING + 有审批权）渲染按钮；其余状态给独立文案
    expect(source).toContain('v-if="detail && canReview"')
    expect(source).toMatch(/detail\.value\.status === 'PENDING'/)
  })

  it('驳回理由必填（inputValidator + 提交前再拦），通过/驳回都走二次确认', async () => {
    const source = await read('../views/platform/store-approvals.vue')
    expect(source).toContain('inputValidator')
    expect(source).toContain('PAGE_TEXT.rejectCommentRequired')
    expect(source).toContain('ElMessageBox.prompt')
    // 通过后刷新队列
    expect(source).toContain('await load()')
  })

  it('空/错/加载态齐备（el-empty / loadError / v-loading）', async () => {
    const source = await read('../views/platform/store-approvals.vue')
    expect(source).toContain('<el-empty')
    expect(source).toContain('loadError')
    expect(source).toContain('v-loading')
  })

  it('审批权限严格判定 + footer 区分「非 PENDING / 无审批权限」', async () => {
    const source = await read('../views/platform/store-approvals.vue')
    // 快照存在才判定，缺失时不 fail-open
    expect(source).toContain('permissionSnapshot')
    expect(source).toContain('hasPermission(permissionSnapshot.value')
    expect(source).toContain('reviewFooterHint')
    expect(source).toContain('PAGE_TEXT.reviewedHint')
    expect(source).toContain('PAGE_TEXT.noApprovePermission')
    expect(source).toContain('PAGE_TEXT.snapshotMissingHint')
  })

  it('apply 失败后刷新队列与详情（CONFLICT / ALREADY_REVIEWED 不能停在旧状态）', async () => {
    const source = await read('../views/platform/store-approvals.vue')
    expect(source).toContain('refreshAfterReview')
    expect(source).toContain('PAGE_TEXT.reviewConflictHint')
    expect(source).toContain('PAGE_TEXT.refreshFailedHint')
    // 两种失败分支都要刷新
    const refreshCalls = source.match(/await refreshAfterReview\(request\.id\)/g) || []
    expect(refreshCalls.length).toBe(2)
  })

  it('状态筛选不用 clearable（后端空值默认 PENDING，清空会误导为「全部」）', async () => {
    const source = await read('../views/platform/store-approvals.vue')
    expect(source).not.toMatch(/v-model="query\.status"[^>]*clearable/)
    expect(source).toContain("query.status = 'PENDING'")
  })

  it('详情抽屉请求序号防竞态；审批后末页空页自动回退', async () => {
    const source = await read('../views/platform/store-approvals.vue')
    expect(source).toContain('detailRequestSeq')
    expect(source).toMatch(/seq !== detailRequestSeq/)
    expect(source).toContain('lastPage')
    expect(source).toMatch(/Math\.ceil\(page\.total \/ query\.pageSize\)/)
  })
})

describe('平台审批 API 与菜单/路由接线', () => {
  it('api/store.js 的路径与租户申请/平台审批契约一致', async () => {
    const source = await read('../api/store.js')
    expect(source).toContain("'/api/v1/admin/tenant/store-change-requests'")
    expect(source).toContain("'/api/v1/admin/platform/store-change-requests'")
    expect(source).toContain("`${TENANT_STORES}/create-defaults`")
    expect(source).toContain("`${TENANT_CHANGE_REQUESTS}/${id}/cancel`")
    expect(source).toContain("`${PLATFORM_CHANGE_REQUESTS}/${id}/approve`")
    expect(source).toContain("`${PLATFORM_CHANGE_REQUESTS}/${id}/reject`")
  })

  it('平台审批页由路由 /admin/platform/store-approvals 承载（PLATFORM scope + 权限码）', async () => {
    const router = await read('../router/index.js')
    expect(router).toContain('admin/platform/store-approvals')
    expect(router).toContain("title: '门店审批'")
    expect(router).toContain("permission: 'platform.store.change.approve'")
    expect(router).toContain("scope: 'PLATFORM'")
  })
})
