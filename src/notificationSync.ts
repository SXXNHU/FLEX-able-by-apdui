import { notificationsApi, type IngestResult } from './api/ledger'
import { FlexNative, isNative, type FlexNativePlugin } from './native'

/**
 * 기기 큐 → 서버 → ACK. 서버가 처리했다고 답한 알림만 큐에서 지운다.
 * 전송이 실패하면 아무것도 지우지 않으므로 다음 실행 때 다시 보낸다. 서버는 같은 알림을 한 번만 반영한다.
 */
export async function syncPaymentNotifications(
  plugin: Pick<FlexNativePlugin, 'pendingNotifications' | 'ackNotifications'> = FlexNative,
  send: (
    items: Parameters<typeof notificationsApi.ingest>[0],
  ) => Promise<IngestResult> = notificationsApi.ingest,
): Promise<IngestResult | null> {
  const { items } = await plugin.pendingNotifications()
  if (!items.length) return null
  // 한 번에 너무 많이 보내지 않는다 (서버 제한 200). 남은 것은 다음 동기화 때 보낸다.
  const result = await send(items.slice(0, 100))
  if (result.processed.length) await plugin.ackNotifications({ ids: result.processed })
  return result
}

export const paymentNotificationsAvailable = isNative
