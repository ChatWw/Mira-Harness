import { get } from 'node:http'
import { expect, it } from 'vitest'
import { LocalMicroAppServer } from '../electron/adapters/localMicroAppServer'

it('stops even when a renderer keeps a media response open', async () => {
  let started!: () => void
  const responding = new Promise<void>(resolve => { started = resolve })
  const server = new LocalMicroAppServer({ mediaHandler: (_path, _request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/plain' })
    response.write('still streaming')
    started()
  } })
  await server.start([])
  const request = get(server.getMediaUrl('a'.repeat(64)), response => {
    response.on('error', () => {})
    response.resume()
  })
  request.on('error', () => {})
  try {
    await responding
    await server.stop()
    expect(server.port).toBeUndefined()
    await server.stop()
  } finally { request.destroy(); await server.stop() }
}, 1500)
