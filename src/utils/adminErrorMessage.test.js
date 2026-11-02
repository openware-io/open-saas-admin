import { describe, expect, it } from 'vitest'
import { resolveAdminErrorMessage } from './adminErrorMessage'

describe('resolveAdminErrorMessage', () => {
  it('业务错误码优先映射为中文提示', () => {
    expect(resolveAdminErrorMessage({
      response: { status: 400, data: { code: 'CATALOG_ITEM_REQUIRED', message: '加项必须选择有效目录项' } },
    })).toBe('加项必须选择点单目录中的商品或服务。')
  })

  // 运营人员关联/换绑/解绑：两个 409 的处置动作不同，必须按错误码分开映射，不能靠后端 message 猜。
  it('运营人员 IM 关联的错误码映射到各自的下一步动作', () => {
    expect(resolveAdminErrorMessage({
      response: { status: 409, data: { code: 'STAFF_IM_REBIND_UNBIND_FIRST', message: '该运营人员已关联其他 IM 账号，请先解绑后再关联' } },
    })).toBe('该运营人员已关联其他 IM 账号，请先解绑后再关联。')

    expect(resolveAdminErrorMessage({
      response: { status: 409, data: { code: 'STAFF_IM_ALREADY_BOUND', message: '该 IM 账号已绑定后台账号' } },
    })).toBe('该 IM 账号已被其他后台账号占用，请核对该 IM 账号后重试。')

    expect(resolveAdminErrorMessage({
      response: { status: 404, data: { code: 'IM_ACCOUNT_NOT_FOUND', message: 'IM 账号不存在' } },
    })).toBe('IM 账号不存在（可能已被删除），请核对后重试。')
  })

  it('中文服务端 message 原样展示', () => {
    expect(resolveAdminErrorMessage({
      response: { status: 400, data: { code: 'SOMETHING', message: '库存不足' } },
    })).toBe('库存不足')
  })

  // F12：缺 Idempotency-Key 时 Spring 默认错误体没有 code/message，且 body 可能是英文。
  it('Spring 默认错误体（无 code/message）回落到中文状态码提示', () => {
    expect(resolveAdminErrorMessage({
      response: { status: 400, data: { timestamp: '2026-09-20T10:00:00', status: 400, error: 'Bad Request', path: '/api/v1/business/orders/1/items' } },
    })).toBe('请求参数有误，请检查后重试。')
  })

  it('英文原文（框架异常 message）绝不直接展示', () => {
    const message = resolveAdminErrorMessage({
      response: {
        status: 400,
        data: { timestamp: 'x', status: 400, message: "Required request header 'Idempotency-Key' for method parameter type String is not present" },
      },
    })
    expect(message).toBe('请求参数有误，请检查后重试。')
    expect(/[A-Za-z]/.test(message)).toBe(false)
  })

  it('网络失败与超时不再抛 axios 英文原文', () => {
    expect(resolveAdminErrorMessage({ code: 'ECONNABORTED', message: 'timeout of 15000ms exceeded' }))
      .toBe('请求超时，请检查网络后重试。')
    expect(resolveAdminErrorMessage({ message: 'Network Error' })).toBe('网络连接异常，请检查网络后重试。')
  })

  it('未知状态码回落到页面语义兜底，且不出现空串', () => {
    expect(resolveAdminErrorMessage({ response: { status: 418, data: {} } }, '加项失败')).toBe('加项失败')
    expect(resolveAdminErrorMessage({ response: { status: 418, data: {} } })).toBe('操作未完成，请稍后重试。')
  })

  // 门店变更申请（申请 → 审批 → 执行）：每个错误码都对应不同的下一步动作，
  // 且提示里不得出现英文原文/裸错误码（运营看不懂，也无法据此操作）。
  it('门店变更申请/平台审批错误码映射到可执行的中文提示', () => {
    const cases = {
      STORE_CHANGE_REASON_REQUIRED: '请填写申请理由。',
      STORE_CHANGE_PENDING_EXISTS: '该门店已有待审批的变更申请，请先在「变更记录」中撤销后再提交。',
      STORE_CHANGE_ALREADY_REVIEWED: '该申请已被审批或撤销，请刷新队列后查看最新状态。',
      STORE_CHANGE_CONFLICT: '审批执行时门店数据已变化（或编号已被占用），申请已标记为执行冲突，请重新提交。',
      STORE_CHANGE_REQUIRES_TENANT_CONTEXT: '门店变更申请必须在租户总部上下文提交，请先在右上角切换到总部。',
      STORE_CHANGE_BASE_VERSION_REQUIRED: '门店信息缺少版本号，请刷新门店列表后重新提交。',
      STORE_CODE_CONFLICT: '门店编号已被占用，请换一个编号后重新提交。',
      STORE_DELETE_REQUIRES_INACTIVE: '只有停用或已关闭的门店才能申请删除。',
      STORE_STATUS_TRANSITION_INVALID: '当前门店状态不允许该操作，请刷新后重试。',
      STORE_HAS_ACTIVE_BINDINGS: '门店仍有生效中的门店级人员/角色绑定，请先解除后再申请删除。',
      TIMEZONE_INVALID: '时区必须是合法的 IANA 时区（如 Asia/Shanghai），不能是 +08:00 / Z 这类偏移写法。',
      BUSINESS_DAY_CUTOFF_OUT_OF_RANGE: '营业日切点需在 00:00–12:00 之间。',
      PLATFORM_CONTEXT_REQUIRED: '请切换到平台工作区后再执行门店审批。',
      ORGANIZATION_TENANT_MISMATCH: '所选组织不属于当前租户，请重新选择组织后再提交。',
    }
    for (const [code, expected] of Object.entries(cases)) {
      const message = resolveAdminErrorMessage({ response: { status: 400, data: { code } } })
      expect(message).toBe(expected)
      expect(message).not.toBe(code)
      // 中文可读：不含英文原文（时区提示会引用 IANA 示例 Asia/Shanghai，单独放行）
      expect(/[\u4e00-\u9fff]/.test(message)).toBe(true)
      if (code !== 'TIMEZONE_INVALID') expect(/[A-Za-z]{4,}/.test(message)).toBe(false)
    }
  })
})
