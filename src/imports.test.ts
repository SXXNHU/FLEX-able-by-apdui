import { describe, expect, it } from 'vitest'
import { decodeCsv } from './imports'

// CSV · 알림 파싱과 중복 판정 테스트는 서버(ImportParsersTest)로 옮겼다.
describe('CSV 인코딩', () => {
  it('EUC-KR로 저장된 엑셀 CSV를 읽는다', () => {
    // "날짜" = B3 AF C2 A5 (EUC-KR)
    const bytes = new Uint8Array([0xb3, 0xaf, 0xc2, 0xa5, 0x0a])
    expect(decodeCsv(bytes.buffer).trim()).toBe('날짜')
  })
  it('UTF-8 BOM을 지운다', () => {
    const bytes = new TextEncoder().encode('﻿날짜,금액')
    expect(decodeCsv(bytes.buffer as ArrayBuffer)).toBe('날짜,금액')
  })
})
