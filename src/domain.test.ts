import { describe, expect, it } from 'vitest'
import { addDays, dayDiff, parseCalendar, parsePlan } from './domain'

// 예산 계산 · 거래 반영 규칙 테스트는 서버(LedgerTest, LedgerApiTest)로 옮겼다.
// 여기에는 저장 전에 사용자가 확인하는 입력 보조와 날짜 유틸만 남는다.
const today = '2026-09-29'

describe('입력 보조', () => {
  it('자연어의 토요일과 본인 금액을 추출한다', () => {
    expect(parsePlan('토요일 데이트 8만 원', today)).toMatchObject({
      date: '2026-10-03',
      amount: 80000,
      category: '약속',
    })
    expect(parsePlan('다음주 토요일 3만 5천 원', today)).toMatchObject({ date: '2026-10-10', amount: 35000 })
    expect(parsePlan('모니터 300,000원', today)).toMatchObject({ date: '', amount: 300000, category: '쇼핑' })
  })
  it('모호한 금액은 만들어 넣지 않는다', () => {
    expect(parsePlan('친구랑 점심', today).amount).toBe(0)
  })
  it('캘린더 일정을 미확정 계획의 원본으로 읽는다', () => {
    expect(
      parseCalendar(
        'BEGIN:VCALENDAR\nBEGIN:VEVENT\nDTSTART;VALUE=DATE:20261003\nSUMMARY:저녁 약속\nEND:VEVENT\nEND:VCALENDAR',
      ),
    ).toEqual([{ date: '2026-10-03', title: '저녁 약속' }])
  })
  it('윤년 및 연도 경계의 날짜 계산이 유지된다', () => {
    expect(dayDiff('2028-02-28', '2028-03-01')).toBe(2)
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })
})
