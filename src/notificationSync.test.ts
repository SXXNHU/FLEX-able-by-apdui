import { describe, expect, it, vi } from 'vitest'
import { ApiError } from './api/client'
import { syncPaymentNotifications } from './notificationSync'
import type { RawNotification } from './native'

const raw = (id: string): RawNotification => ({
  id,
  packageName: 'com.card',
  title: '',
  text: '현대카드 승인 12,500원',
  bigText: '',
  postedAt: 0,
})

describe('결제 알림 동기화', () => {
  it('서버가 처리했다고 답한 알림만 기기 큐에서 지운다', async () => {
    const plugin = {
      pendingNotifications: vi.fn().mockResolvedValue({ items: [raw('a'), raw('b')] }),
      ackNotifications: vi.fn().mockResolvedValue({ removed: 2 }),
    }
    const send = vi.fn().mockResolvedValue({ processed: ['a', 'b'], added: 1, queued: 1, ignored: 0 })
    await expect(syncPaymentNotifications(plugin, send)).resolves.toMatchObject({ added: 1, queued: 1 })
    expect(send).toHaveBeenCalledWith([raw('a'), raw('b')])
    expect(plugin.ackNotifications).toHaveBeenCalledWith({ ids: ['a', 'b'] })
  })

  it('서버 저장이 실패하면 ACK하지 않아 다음에 다시 보낸다', async () => {
    const plugin = {
      pendingNotifications: vi.fn().mockResolvedValue({ items: [raw('a')] }),
      ackNotifications: vi.fn(),
    }
    const send = vi.fn().mockRejectedValue(new ApiError(0, 'network', '연결 안 됨'))
    await expect(syncPaymentNotifications(plugin, send)).rejects.toMatchObject({ code: 'network' })
    expect(plugin.ackNotifications).not.toHaveBeenCalled()
  })

  it('보낼 알림이 없으면 서버에 요청하지 않는다', async () => {
    const plugin = {
      pendingNotifications: vi.fn().mockResolvedValue({ items: [] }),
      ackNotifications: vi.fn(),
    }
    const send = vi.fn()
    await expect(syncPaymentNotifications(plugin, send)).resolves.toBeNull()
    expect(send).not.toHaveBeenCalled()
  })

  it('한 번에 100건까지만 보내고 나머지는 큐에 남긴다', async () => {
    const items = Array.from({ length: 150 }, (_, i) => raw(String(i)))
    const plugin = {
      pendingNotifications: vi.fn().mockResolvedValue({ items }),
      ackNotifications: vi.fn().mockResolvedValue({ removed: 100 }),
    }
    const send = vi.fn(async (sent: RawNotification[]) => ({
      processed: sent.map((s) => s.id),
      added: sent.length,
      queued: 0,
      ignored: 0,
    }))
    await syncPaymentNotifications(plugin, send)
    expect(send.mock.calls[0][0]).toHaveLength(100)
    expect(plugin.ackNotifications.mock.calls[0][0].ids).toHaveLength(100)
  })
})
