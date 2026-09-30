/**
 * 파일 바이트를 가진 브라우저에서만 할 수 있는 일: 인코딩 판별.
 * CSV 표 분리 · 열 판별 · 거래 후보 생성 · 중복 판정은 서버가 한다.
 */

/** 엑셀이 만든 한국어 CSV는 CP949(EUC-KR)인 경우가 많아 UTF-8 해석이 실패하면 EUC-KR로 다시 읽는다. */
export function decodeCsv(buffer: ArrayBuffer) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer).replace(/^﻿/, '')
  } catch {
    return new TextDecoder('euc-kr').decode(buffer)
  }
}
