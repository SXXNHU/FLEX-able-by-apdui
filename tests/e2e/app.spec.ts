import { test, expect, type Page } from '@playwright/test'
async function demo(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: '먼저 둘러볼게요' }).click()
  await expect(page.locator('.hero-amount')).toContainText('22,000')
}
test('스플래시는 1.5초 후 사라진다', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-09-29T03:00:00Z') })
  await page.clock.pauseAt(new Date('2026-09-29T03:00:01Z'))
  await page.goto('/')
  await expect(page.locator('.splash')).toBeVisible()
  await page.clock.runFor(1499)
  await expect(page.locator('.splash')).toBeVisible()
  await page.clock.runFor(1)
  await expect(page.locator('.splash')).toHaveCount(0)
})
test('예산 설정부터 홈까지 실제 신규 사용자 흐름', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '내 생활비 알아보기' }).click()
  await page.getByRole('textbox', { name: '이름', exact: true }).fill('새사용자')
  await page.getByRole('spinbutton', { name: /현재 사용 가능 잔액/ }).fill('300000')
  await page.getByRole('button', { name: '다음', exact: true }).click()
  await page.getByRole('button', { name: '다음', exact: true }).click()
  await page.getByRole('button', { name: '내 생활비 확인하기' }).click()
  await expect(page.locator('.hero-amount')).toContainText('30,000')
  await expect(page.getByRole('heading', { name: /새사용자님/ })).toBeVisible()
})
test('현금 지출은 한 번만 차감하고 새로고침 후 유지된다', async ({ page }) => {
  await demo(page)
  await page.getByRole('button', { name: '지출 기록', exact: true }).click()
  await page.getByRole('textbox', { name: '거래 이름' }).fill('테스트 점심')
  await page.getByRole('spinbutton', { name: '금액 원', exact: true }).fill('10000')
  await page.getByRole('button', { name: '거래 반영하기' }).click()
  await expect(page.locator('.hero-amount')).toContainText('12,000')
  await page.reload()
  await expect(page.locator('.splash')).toHaveCount(0)
  await expect(page.locator('.hero-amount')).toContainText('12,000')
  await expect(page.getByRole('button', { name: /테스트 점심 식비/ })).toBeVisible()
})
test('자연어 계획 확정 전후 비교와 취소', async ({ page }) => {
  await demo(page)
  await page.getByRole('button', { name: '계획 추가', exact: true }).click()
  await page.getByRole('textbox', { name: '소비 계획 내용' }).fill('내일 친구랑 점심 1만 원')
  await page.getByRole('button', { name: '계획 초안 만들기' }).click()
  await expect(page.locator('.comparison')).toContainText('21,000')
  await page.getByRole('button', { name: '이 금액으로 계획 확정' }).click()
  await expect(page.locator('.hero-amount')).toContainText('21,000')
  await page.getByRole('navigation').getByRole('button', { name: '소비 계획' }).click()
  await page.getByRole('button', { name: /확정 내일 친구랑 점심/ }).click()
  await page.getByRole('button', { name: '이 계획 취소하기' }).click()
  await page.getByRole('button', { name: '계획 취소 확정' }).click()
  await page.getByRole('navigation').getByRole('button', { name: '오늘', exact: true }).click()
  await expect(page.locator('.hero-amount')).toContainText('22,000')
})
test('캡처 문자 후보는 확인 전에 반영되지 않는다', async ({ page }) => {
  await demo(page)
  await page.getByRole('button', { name: '캡처로 정산' }).click()
  await page.getByText('인식 문자 확인 · 직접 붙여넣기').click()
  await page.getByRole('textbox', { name: '인식된 거래 문자' }).fill('TEST CAFE 4,700원')
  await page.getByRole('button', { name: '이 문자로 후보 다시 만들기' }).click()
  await expect(page.getByRole('button', { name: '선택한 1건 반영하기' })).toBeDisabled()
  await page.getByRole('checkbox', { name: /날짜·금액·중복과 거래 구분을 확인했어요/ }).check()
  await page.getByRole('button', { name: '선택한 1건 반영하기' }).click()
  await expect(page.locator('.hero-amount')).toContainText('21,530')
})
test('정산 완료는 누락 없음 확인 후에만 가능하다', async ({ page }) => {
  await demo(page)
  await page.getByRole('button', { name: '확인하기', exact: true }).click()
  await expect(page.getByRole('button', { name: '하루 정산 완료' })).toBeDisabled()
  await page.getByRole('checkbox', { name: /빠진 거래 없이 모두 확인했어요/ }).check()
  await page.getByRole('button', { name: '하루 정산 완료' }).click()
  await expect(page.locator('.reconciled-state')).toContainText('반영된 금액')
})
test('모바일 화면에 가로 넘침과 브라우저 오류가 없다', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await demo(page)
  await expect(page.locator('.toast')).toHaveCount(0, { timeout: 7000 })
  await page.screenshot({ path: 'test-results/screenshots/home-mobile.png', fullPage: true })
  for (const name of ['오늘', '소비 계획', '정산', '내 예산']) {
    await page.getByRole('navigation').getByRole('button', { name, exact: true }).click()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  }
  expect(errors).toEqual([])
})
test('CSV 업로드 버튼은 캡처로 정산 왼쪽에 있고, 파일 거래를 확인 후 반영한다', async ({ page }) => {
  await demo(page)
  const labels = await page.locator('.quick-actions strong').allTextContents()
  expect(labels.indexOf('CSV 업로드')).toBe(labels.indexOf('캡처로 정산') - 1)
  await page.getByRole('button', { name: 'CSV 업로드' }).click()
  const today = await page.evaluate(() => {
    const d = new Date()
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
  })
  await page.getByLabel('CSV 파일 선택').setInputFiles({
    name: 'bank.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      `거래내역,,,\n거래일시,적요,출금액,입금액\n${today} 12:00,김밥천국,"8,000",0\n`,
      'utf8',
    ),
  })
  await expect(page.getByRole('textbox', { name: '상호 · 이름' })).toHaveValue('김밥천국')
  await page.getByRole('checkbox', { name: /날짜·금액·중복과 거래 구분을 확인했어요/ }).check()
  await page.getByRole('button', { name: '선택한 1건 반영하기' }).click()
  await expect(page.locator('.hero-amount')).toContainText('14,000')
})
test('이미 있는 거래는 막지 않고 추가할지 묻는다', async ({ page }) => {
  await demo(page)
  await page.getByRole('button', { name: '캡처로 정산' }).click()
  await page.getByText('인식 문자 확인 · 직접 붙여넣기').click()
  await page.getByRole('textbox', { name: '인식된 거래 문자' }).fill('동네커피 4,500원\n편의점 1,000원')
  await page.getByRole('button', { name: '이 문자로 후보 다시 만들기' }).click()
  await expect(page.locator('.candidate.duplicate')).toHaveCount(1)
  await expect(page.locator('.duplicate-note')).toContainText('동네 커피')
  await page.getByRole('checkbox', { name: /날짜·금액·중복과 거래 구분을 확인했어요/ }).check()
  await page.getByRole('button', { name: '선택한 2건 반영하기' }).click()
  const dialog = page.getByRole('alertdialog', { name: '중복 거래 확인' })
  await expect(dialog).toContainText('이미 있는 거래 같아요. 그래도 추가할까요?')
  await dialog.getByRole('button', { name: '중복 빼고 1건만 추가' }).click()
  await page.getByRole('navigation').getByRole('button', { name: '정산', exact: true }).click()
  await expect(page.getByRole('button', { name: /동네 커피|동네커피/ })).toHaveCount(1)
  await expect(page.getByRole('button', { name: /편의점/ })).toHaveCount(1)
})
test('직접 입력도 같은 거래가 있으면 한 번 더 묻는다', async ({ page }) => {
  await demo(page)
  await page.getByRole('button', { name: '지출 기록', exact: true }).click()
  await page.getByRole('textbox', { name: '거래 이름' }).fill('점심 한 그릇')
  await page.getByRole('spinbutton', { name: '금액 원', exact: true }).fill('9500')
  const yesterday = await page.evaluate(() => {
    const d = new Date(Date.now() - 86400000)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
  await page.getByLabel('거래일').fill(yesterday)
  await page.getByRole('button', { name: '거래 반영하기' }).click()
  await expect(page.getByRole('alertdialog', { name: '중복 거래 확인' })).toBeVisible()
  await page.getByRole('button', { name: '다른 거래예요, 추가할게요' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})
