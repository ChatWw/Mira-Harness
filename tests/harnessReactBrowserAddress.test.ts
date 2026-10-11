import { describe, expect, it } from 'vitest'
import { normalizeMiraBrowserAddress } from '../apps/harness-react/src/lib/mira-browser-address'

describe('browser address protocol inference', () => {
  it.each([
    [' localhost:3000/test ', 'http://localhost:3000/test'],
    ['localhost:443', 'http://localhost:443/'],
    ['127.0.0.1', 'http://127.0.0.1/'],
    ['10.0.1.2:8080/path', 'http://10.0.1.2:8080/path'],
    ['172.16.0.1', 'http://172.16.0.1/'],
    ['172.31.0.1', 'http://172.31.0.1/'],
    ['172.32.0.1', 'https://172.32.0.1/'],
    ['192.168.1.1', 'http://192.168.1.1/'],
    ['169.254.1.1', 'http://169.254.1.1/'],
    ['0.0.0.0:5173', 'http://0.0.0.0:5173/'],
    ['::1:3000', 'http://[::1]:3000/'],
    ['[::1]', 'http://[::1]/'],
    ['studio.local/path', 'http://studio.local/path'],
    ['mira.test', 'http://mira.test/'],
    ['example.com:443', 'https://example.com/'],
    ['example.com:80', 'http://example.com/'],
    ['//localhost:3000', 'http://localhost:3000/'],
    ['example.com/docs?q=a#b', 'https://example.com/docs?q=a#b'],
    ['https://localhost:3000', 'https://localhost:3000/'],
    ['http://example.com', 'http://example.com/'],
  ])('normalizes %s to %s', (input, expected) => expect(normalizeMiraBrowserAddress(input)).toBe(expected))
  it.each(['', '   ', 'not a url', 'https://user:secret@example.com', 'user@example.com', 'javascript:80', 'javascript:alert(1)', 'data:123', 'file:123', 'file:///tmp/example', 'ftp://example.com', 'blob:https://example.com/a', 'https://example.com:99999', 'https://', 'https://example.com/' + 'a'.repeat(4096)])('rejects unsafe or invalid address %s', input => expect(normalizeMiraBrowserAddress(input)).toBeUndefined())
})
