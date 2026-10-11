import { describe, expect, it } from 'vitest'
import type { IBuffer } from '@xterm/xterm'
import { miraTerminalWebLinks } from '../apps/harness-react/src/lib/mira-terminal-links'

// Cells reproduce xterm's wide/continuation and combined-character representation.
function buffer(rows: Array<{ wrapped?: boolean; cells: Array<[string, number]> }>): IBuffer {
  return { length: rows.length, getLine: (index: number) => rows[index] && {
    isWrapped: Boolean(rows[index].wrapped),
    getCell: (column: number) => rows[index].cells[column] && { getChars: () => rows[index].cells[column][0], getWidth: () => rows[index].cells[column][1] },
  } } as unknown as IBuffer
}
const ascii = (text: string): Array<[string, number]> => [...text].map(value => [value, 1])

describe('Mira terminal link cell geometry', () => {
  it('keeps balanced URL brackets and removes unmatched closers and prose punctuation', () => {
    const text = '(https://mira.test/a(b)). https://mira.test/x?! ftp://ignored https://mira.test/y]}:'
    const links = miraTerminalWebLinks(buffer([{ cells: ascii(text) }]), 1, text.length)!
    expect(links.map(link => link.text)).toEqual(['https://mira.test/a(b)', 'https://mira.test/x', 'https://mira.test/y'])
    expect(links[0].range).toEqual({ start: { x: 2, y: 1 }, end: { x: 23, y: 1 } })
  })
  it('finds the same logical URL on either of its wrapped physical lines without joining independent lines', () => {
    const data = buffer([{ cells: ascii('https://mira.') }, { wrapped: true, cells: ascii('test/page    ') }, { cells: ascii('no link here ') }])
    const expected = [{ text: 'https://mira.test/page', range: { start: { x: 1, y: 1 }, end: { x: 9, y: 2 } }, decorations: { underline: true, pointerCursor: true } }]
    expect(miraTerminalWebLinks(data, 1, 13)).toEqual(expected)
    expect(miraTerminalWebLinks(data, 2, 13)).toEqual(expected)
    expect(miraTerminalWebLinks(data, 3, 13)).toBeUndefined()
  })
  it('maps UTF-16 text after wide and combined cells and includes both columns of a wide final character', () => {
    const cells: Array<[string, number]> = [['中', 2], ['', 0], ['e\u0301', 1], [' ', 1], ...ascii('https://mira.test/'), ['😀', 2], ['', 0], ['文', 2], ['', 0], ['.', 1]]
    const links = miraTerminalWebLinks(buffer([{ cells }]), 1, cells.length)!
    expect(links[0].text).toBe('https://mira.test/😀文')
    expect(links[0].range).toEqual({ start: { x: 5, y: 1 }, end: { x: cells.length - 1, y: 1 } })
  })
  it('does not leak links into a queried row outside their range and tolerates unavailable rows', () => {
    const data = buffer([{ cells: ascii('https://a   ') }, { wrapped: true, cells: ascii('no link     ') }])
    expect(miraTerminalWebLinks(data, 2, 12)).toBeUndefined()
    expect(miraTerminalWebLinks(data, 9, 12)).toBeUndefined()
  })
})
