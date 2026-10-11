// Adapted from ZCode terminal/terminalLinks.ts, Copyright 2026 Z.AI Co., Ltd, Apache-2.0.
// Mira maps UTF-16 offsets to xterm cells, including the full width of a final wide character.
import type { IBuffer, ILink } from '@xterm/xterm'

const miraWebAddressPattern = /\bhttps?:\/\/[^\s<>"'`]+/gi
const miraAddressSuffixPattern = /[.,;:!?]+$/
const miraAddressBracketPairs: Record<string, string> = { ')': '(', ']': '[', '}': '{' }
type MiraTerminalLink = Pick<ILink, 'range' | 'text' | 'decorations'>
interface MiraTerminalCell { column: number; row: number; width: number }

function cleanTerminalAddress(candidate: string) {
  let address = candidate.replace(miraAddressSuffixPattern, '')
  for (;;) {
    const closing = address[address.length - 1], opening = miraAddressBracketPairs[closing]
    if (!opening) return address
    let balance = 0
    for (const character of address) {
      if (character === closing) balance++
      else if (character === opening) balance--
    }
    if (balance <= 0) return address
    address = address.slice(0, -1).replace(miraAddressSuffixPattern, '')
  }
}

export function miraTerminalWebLinks(buffer: IBuffer, rowNumber: number, columns: number): MiraTerminalLink[] | undefined {
  if (rowNumber < 1 || rowNumber > buffer.length) return undefined
  let firstRow = rowNumber - 1, lastRow = firstRow
  while (firstRow > 0 && buffer.getLine(firstRow)?.isWrapped) firstRow--
  while (lastRow + 1 < buffer.length && buffer.getLine(lastRow + 1)?.isWrapped) lastRow++

  let text = ''
  const cells: MiraTerminalCell[] = []
  for (let row = firstRow; row <= lastRow; row++) {
    const line = buffer.getLine(row)
    if (!line) return undefined
    const scratchCell = line.getCell(0)
    for (let column = 0; column < columns; column++) {
      const cell = line.getCell(column, scratchCell)
      if (!cell || cell.getWidth() === 0) continue
      const characters = cell.getChars() || ' '
      text += characters
      const position = { column, row: row + 1, width: cell.getWidth() }
      for (let offset = 0; offset < characters.length; offset++) cells.push(position)
    }
  }

  const links: MiraTerminalLink[] = []
  for (const match of text.matchAll(miraWebAddressPattern)) {
    const address = cleanTerminalAddress(match[0]), offset = match.index ?? 0
    const first = cells[offset], last = cells[offset + address.length - 1]
    if (!first || !last || first.row > rowNumber || last.row < rowNumber) continue
    links.push({
      text: address,
      range: {
        start: { x: first.column + 1, y: first.row },
        end: { x: last.column + last.width, y: last.row },
      },
      // xterm applies these decorations only while the link is hovered.
      decorations: { underline: true, pointerCursor: true },
    })
  }
  return links.length ? links : undefined
}
