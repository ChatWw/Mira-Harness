import { describe, expect, it } from 'vitest'

function formatChapterLabel(index: number) {
  const digits = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九']
  const number = Math.max(1, index)
  if (number < 10) return `第${digits[number]}章`
  if (number < 20) return `第十${number === 10 ? '' : digits[number % 10]}章`
  if (number < 100) return `第${digits[Math.floor(number / 10)]}十${number % 10 ? digits[number % 10] : ''}章`
  return `第${number}章`
}

describe('chapter title labels', () => {
  it('keeps the chapter sequence when a generated subtitle is applied', () => {
    expect(`${formatChapterLabel(1)} 废柴替身？这个局我接了`).toBe('第一章 废柴替身？这个局我接了')
    expect(formatChapterLabel(10)).toBe('第十章')
    expect(formatChapterLabel(12)).toBe('第十二章')
  })
})
