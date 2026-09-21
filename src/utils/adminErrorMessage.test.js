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
})
