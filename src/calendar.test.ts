import { describe, expect, it } from 'vitest'
import { googleTemplateUrl } from './calendar'

describe('Google 캘린더 추가 링크', () => {
  it('종일 일정으로 제목 · 날짜 · 메모를 채운다', () => {
    const url = new URL(
      googleTemplateUrl({ title: '토요일 데이트', date: '2026-10-03', note: '영화는 내가' }),
    )
    expect(url.origin + url.pathname).toBe('https://calendar.google.com/calendar/render')
    expect(url.searchParams.get('action')).toBe('TEMPLATE')
    expect(url.searchParams.get('text')).toBe('토요일 데이트')
    expect(url.searchParams.get('dates')).toBe('20261003/20261004')
    expect(url.searchParams.get('details')).toContain('영화는 내가')
  })
  it('연말 일정은 다음 해로 넘어간다', () => {
    expect(
      new URL(googleTemplateUrl({ title: 'x', date: '2026-12-31', note: '' })).searchParams.get('dates'),
    ).toBe('20261231/20270101')
  })
})
