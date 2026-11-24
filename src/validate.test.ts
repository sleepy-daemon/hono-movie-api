import { describe, it, expect } from 'vitest'
import { isSlug, isYear, parsePage, parsePositiveInt, MAX_PAGE } from './validate'

describe('isSlug', () => {
  it.each(['avengers-endgame', 'Movie-2024', 'a', '123'])('accepts %s', v => expect(isSlug(v)).toBe(true))
  it.each([undefined, '', '-lead', '../admin', 'a/b', 'a?b', 'a&b', 'a b', 'x'.repeat(201)])(
    'rejects %j', v => expect(isSlug(v)).toBe(false)
  )
})

describe('isYear', () => {
  it('accepts four digits', () => expect(isYear('2021')).toBe(true))
  it.each([undefined, '21', '20x1', '20211'])('rejects %j', v => expect(isYear(v)).toBe(false))
})

describe('parsePositiveInt', () => {
  it('parses positive integers', () => expect(parsePositiveInt('42')).toBe(42))
  it.each([undefined, '', '0', '-1', '1.5', 'abc', '1e3', 'NaN'])('rejects %j', v =>
    expect(parsePositiveInt(v)).toBeNull()
  )
  it('enforces max', () => {
    expect(parsePositiveInt('10', 10)).toBe(10)
    expect(parsePositiveInt('11', 10)).toBeNull()
  })
})

describe('parsePage', () => {
  it('defaults to 1 when absent', () => {
    expect(parsePage(undefined)).toBe(1)
    expect(parsePage('')).toBe(1)
  })
  it('rejects invalid or out-of-range pages', () => {
    expect(parsePage('abc')).toBeNull()
    expect(parsePage('0')).toBeNull()
    expect(parsePage(String(MAX_PAGE + 1))).toBeNull()
  })
  it('accepts the max page', () => expect(parsePage(String(MAX_PAGE))).toBe(MAX_PAGE))
})
