import { Capacitor, registerPlugin } from '@capacitor/core'

/** Android 앱(Capacitor) 안에서 실행 중인지. 웹에서는 false */
export const isNative = Capacitor.isNativePlatform()

export type DeviceEvent = { title: string; date: string; allDay: boolean }

/** android/app/src/main/java/com/flexable/app/FlexNativePlugin.java */
export interface FlexNativePlugin {
  secureGet(options: { key: string }): Promise<{ value: string | null }>
  secureSet(options: { key: string; value: string }): Promise<void>
  secureRemove(options: { key: string }): Promise<void>
  listCalendarEvents(options: { from: string; to: string }): Promise<{ events: DeviceEvent[] }>
  addCalendarEvent(options: { title: string; date: string; description?: string }): Promise<void>
  notificationAccessStatus(): Promise<{ granted: boolean }>
  openNotificationAccessSettings(): Promise<void>
  pendingNotifications(): Promise<{ items: RawNotification[] }>
  ackNotifications(options: { ids: string[] }): Promise<{ removed: number }>
}

/** 기기가 모은 결제 알림 원문. 금액 · 가맹점 해석은 서버가 한다. */
export type RawNotification = {
  id: string
  packageName: string
  title: string
  text: string
  bigText: string
  postedAt: number
}

export const FlexNative = registerPlugin<FlexNativePlugin>('FlexNative')
