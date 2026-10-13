import { Agent } from '@earendil-works/pi-agent-core'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HarnessRuntime } from '../electron/services/harnessRuntime'
import { PlatformDatabase } from '../electron/storage/database'
import type { HarnessEvent } from '../src/config/harness'
import { MIRA_MODEL_ERROR_MESSAGE } from '../src/config/miraModelErrors'

const secret = 'mira-fixture-private-credential'
const fixtures: Array<{ root: string; database: PlatformDatabase; server: Server; runtime: HarnessRuntime; sessionId: string }> = []
afterEach(async () => {
  vi.restoreAllMocks()
  for (const fixture of fixtures.splice(0)) {
    fixture.runtime.abort(fixture.sessionId)
    fixture.server.closeAllConnections()
    await new Promise<void>(resolve => fixture.server.close(() => resolve()))
    fixture.database.close()
    rmSync(fixture.root, { recursive: true, force: true })
  }
})

/** Real installed Agent and OpenAI-compatible SDK, with controlled local HTTP. */
async function setup(detail = 'Provider rejected the request', status = 400, toolResponse = false) {
  const requests: string[] = []
  const server = createServer((request, response) => {
    requests.push(request.url || '')
    if (toolResponse) {
      response.writeHead(200, { 'Content-Type': 'text/event-stream' })
      response.end(`data: ${JSON.stringify({ id: 'hook-fixture', object: 'chat.completion.chunk', model: 'model', choices: [{ index: 0, delta: { role: 'assistant', tool_calls: [{ index: 0, id: 'real-hook-tool', type: 'function', function: { name: 'list_files', arguments: '{"path":"."}' } }] }, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ id: 'hook-fixture', object: 'chat.completion.chunk', model: 'model', choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] })}\n\ndata: [DONE]\n\n`)
      return
    }
    response.writeHead(status, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify({ error: { message: detail, type: 'invalid_request_error' } }))
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as { port: number }).port
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'mira-model-errors-'))), directory = join(root, 'project')
  mkdirSync(directory)
  const database = new PlatformDatabase(root), project = database.harness.createProject(directory)
  const created = database.harness.createSession(project.id)
  database.harness.updateSession({ ...created, delegationEnabled: false, titleSource: 'manual' })
  if (toolResponse) database.harness.savePermissionConfig({ ...database.harness.getPermissionConfig(), globalDefaultMode: 'full' })
  database.models.save({ id: 'fixture', name: 'Fixture', endpoint: `http://127.0.0.1:${port}/v1`, apiKey: secret, authMode: 'api-key', enabled: true, models: [{ id: 'model', enabled: true, reasoning: false }] })
  const runtime = new HarnessRuntime(database, { getTools: () => [] } as any)
  vi.spyOn(runtime as any, 'compactContext').mockImplementation(async (_sender, session) => session)
  vi.spyOn(database.memories, 'enabled').mockReturnValue(false)
  const events: HarnessEvent[] = []
  const sender: any = { isDestroyed: () => false, send: (_channel: string, event: HarnessEvent) => events.push(structuredClone(event)) }
  fixtures.push({ root, database, server, runtime, sessionId: created.id })
  return {
    root, database, runtime, events, requests, sessionId: created.id,
    run: (planning = false) => runtime.runMessage(sender, created.id, 'Run the task', [], { providerId: 'fixture', modelId: 'model' }, planning),
    session: () => database.harness.getSession(created.id),
    logs: () => readdirSync(database.paths.logs).map(name => readFileSync(join(database.paths.logs, name), 'utf8')).join('\n'),
  }
}

describe('public model failure diagnostics', () => {
  it.each([400, 401])('retains a real HTTP %i provider error, redacted in all public and persisted surfaces', async status => {
    const fixture = await setup(`Provider rejected ${secret}; Authorization: Bearer extra-private-value; password=hidden-password`, status)
    const failure = await fixture.run().catch(error => error)
    expect(fixture.requests).toEqual(['/v1/chat/completions'])
    expect(failure).toMatchObject({ message: MIRA_MODEL_ERROR_MESSAGE, modelError: { code: 'MODEL_REQUEST_FAILED', message: MIRA_MODEL_ERROR_MESSAGE, detail: expect.stringContaining('Provider rejected [已隐藏]') } })
    const message = fixture.session().messages.at(-1)!
    expect(message.run).toMatchObject({ status: 'failed', error: MIRA_MODEL_ERROR_MESSAGE, modelError: failure.modelError })
    const event = fixture.events.find(event => event.type === 'error')!
    expect(event).toMatchObject({ sessionId: fixture.sessionId, runId: message.runId, payload: { message: MIRA_MODEL_ERROR_MESSAGE, messageId: message.id, modelError: failure.modelError } })
    expect(failure.modelError.detail).toContain(String(status))
    const publicData = JSON.stringify({ events: fixture.events, session: fixture.session(), error: failure.message, diagnostic: failure.modelError, stack: failure.stack, logs: fixture.logs() })
    for (const credential of [secret, 'extra-private-value', 'hidden-password']) expect(publicData).not.toContain(credential)
    const reloaded = new PlatformDatabase(fixture.root)
    try { expect(reloaded.harness.getSession(fixture.sessionId).messages.at(-1)?.run?.modelError).toEqual(failure.modelError) }
    finally { reloaded.close() }
  })

  it('bounds a real provider detail by UTF-8 bytes after credential redaction', async () => {
    const fixture = await setup(`Invalid request ${secret}\n${'无效请求'.repeat(10000)}`)
    const failure = await fixture.run().catch(error => error)
    expect(Buffer.byteLength(failure.modelError.detail, 'utf8')).toBeLessThanOrEqual(8 * 1024)
    expect(Buffer.byteLength(failure.modelError.detail, 'utf8')).toBeGreaterThan(8 * 1024 - 4)
    expect(failure.modelError.detail).not.toContain('\ufffd')
    expect(failure.modelError.detail).not.toContain(secret)
    expect(fixture.session().messages.at(-1)?.run?.modelError).toEqual(failure.modelError)
  })

  it('reports the original model failure in planning mode without replacing it with a missing-plan error', async () => {
    const fixture = await setup('The selected model was not found')
    const failure = await fixture.run(true).catch(error => error)
    expect(failure.modelError.detail).toContain('The selected model was not found')
    expect(fixture.session().messages.at(-1)?.run?.error).toBe(MIRA_MODEL_ERROR_MESSAGE)
    expect(fixture.requests).toHaveLength(1)
  })

  it('keeps a preparation failure generic and sanitizes the bridge rejection and persisted error', async () => {
    const fixture = await setup()
    vi.mocked((fixture.runtime as any).compactContext).mockRejectedValue(new Error(`Provider setup failed ${secret}`))
    const failure = await fixture.run().catch(error => error)
    expect(failure.message).toBe('Provider setup failed [已隐藏]')
    expect(failure.modelError).toBeUndefined()
    expect(fixture.session().messages.at(-1)?.run).toMatchObject({ status: 'failed', error: failure.message })
    expect(fixture.session().messages.at(-1)?.run?.modelError).toBeUndefined()
    expect(fixture.events.find(event => event.type === 'error')?.payload.modelError).toBeUndefined()
    expect(JSON.stringify({ events: fixture.events, session: fixture.session(), stack: failure.stack })).not.toContain(secret)
    expect(fixture.requests).toEqual([])
  })

  it('keeps a thrown hook or tool failure distinct from a model error despite provider-like text', async () => {
    const fixture = await setup()
    vi.spyOn(Agent.prototype, 'prompt').mockRejectedValue(new Error(`HTTP 401 invalid model api-key=${secret}`))
    const failure = await fixture.run().catch(error => error)
    expect(failure.message).toContain('HTTP 401 invalid model')
    expect(failure.modelError).toBeUndefined()
    expect(fixture.session().messages.at(-1)?.run?.modelError).toBeUndefined()
    expect(JSON.stringify({ events: fixture.events, session: fixture.session(), stack: failure.stack, logs: fixture.logs() })).not.toContain(secret)
  })

  it('does not misclassify a real Agent lifecycle callback exception flattened into Agent.errorMessage', async () => {
    const fixture = await setup('', 200, true)
    const prompt = Agent.prototype.prompt
    vi.spyOn(Agent.prototype, 'prompt').mockImplementation(async function (this: Agent, ...args) {
      this.prepareNextTurnWithContext = async () => { throw new Error(`Hook failed: HTTP 401 invalid model ${secret}`) }
      return prompt.apply(this, args)
    })
    const failure = await fixture.run().catch(error => error)
    expect(fixture.requests).toHaveLength(1)
    expect(fixture.session().toolCalls.find(tool => tool.tool === 'list_files')).toMatchObject({ status: 'ok' })
    expect(failure.message).toBe('Hook failed: HTTP 401 invalid model [已隐藏]')
    expect(failure.modelError).toBeUndefined()
    expect(fixture.session().messages.at(-1)?.run).toMatchObject({ status: 'failed', error: failure.message })
    expect(fixture.session().messages.at(-1)?.run?.modelError).toBeUndefined()
    expect(fixture.events.find(event => event.type === 'error')?.payload.modelError).toBeUndefined()
    expect(JSON.stringify({ events: fixture.events, session: fixture.session(), stack: failure.stack, logs: fixture.logs() })).not.toContain(secret)
  })

  it('does not turn an aborted request into a model failure or publish late diagnostics', async () => {
    const fixture = await setup()
    vi.spyOn(Agent.prototype, 'prompt').mockImplementation(async function (this: any) {
      this.state.errorMessage = `Cancelled model request ${secret}`
      fixture.runtime.abort(fixture.sessionId)
    })
    await fixture.run()
    expect(fixture.session().messages.at(-1)?.run).toMatchObject({ status: 'stopped' })
    expect(fixture.session().messages.at(-1)?.run?.modelError).toBeUndefined()
    expect(fixture.events.filter(event => event.type === 'error')).toEqual([])
    expect(JSON.stringify({ events: fixture.events, session: fixture.session(), logs: fixture.logs() })).not.toContain(secret)
  })
})
