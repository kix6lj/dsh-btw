/**
 * Host-half checks for the BTW plugin, run without a live Harness:
 *   node test/host.test.mjs
 *
 * The fake context supplies only the services `apply` consumes; the fake
 * session returns the same derived-message shape a live Session produces.
 */

import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply, buildTranscript, normalizeConfig, resolveModel } from '../index.mjs'

function message(role, content, extra = {}) {
  return { role, content, ...extra }
}

function createSession(overrides = {}) {
  return {
    id: 'session-1',
    header: { cwd: '/work/demo' },
    requestContext: () => ({ provider: 'deepseek-official', model: 'deepseek-flash', contextWindow: 128000 }),
    deriveMessages: () => [
      message('system', [{ type: 'text', text: 'SYSTEM PROMPT WITH TOOL INSTRUCTIONS' }]),
      message('developer', [{ type: 'text', text: 'DEVELOPER CONTEXT' }]),
      message('user', [{ type: 'text', text: '请读一下 config.toml' }]),
      message('assistant', [{ type: 'tool-call', id: 'call-1', name: 'read', arguments: '{"path":"config.toml"}' }]),
      message('tool', [{ type: 'text', text: 'port = 8080\nhost = 127.0.0.1' }], { toolCallId: 'call-1' }),
      message('assistant', [{ type: 'text', text: '配置文件里的端口是 8080。' }]),
    ],
    ...overrides,
  }
}

function createHarness(options = {}) {
  const root = options.root
  const session = options.session ?? createSession()
  const observed = { streamOptions: undefined, commandDefinitions: [] }
  const routes = new Map()

  const chunks = options.chunks ?? [
    { type: 'block-start', index: 0, blockType: 'text' },
    { type: 'text-delta', index: 0, text: '端口是 ' },
    { type: 'text-delta', index: 0, text: '8080。' },
    { type: 'reasoning-delta', index: 0, text: '先看 tool 结果。' },
    { type: 'usage', usage: { inputTokens: 1200, outputTokens: 40 } },
    { type: 'finish', reason: { kind: 'stop' } },
  ]

  const services = {
    llm: {
      async *stream(streamOptions) {
        observed.streamOptions = streamOptions
        for (const chunk of chunks) {
          if (options.beforeChunk !== undefined) await options.beforeChunk()
          if (streamOptions.signal?.aborted) throw Object.assign(new Error('aborted'), { code: 'aborted' })
          yield chunk
        }
      },
    },
    sessions: { get: (id) => (id === session.id ? session : undefined) },
    connection: {
      fetch: {
        register(route) {
          routes.set(route.path, route)
          return async () => {
            routes.delete(route.path)
          }
        },
      },
    },
    commands: {
      register(definition) {
        observed.commandDefinitions.push(definition)
        return () => {}
      },
    },
    agentDefaultModel: {
      currentSelection: () => ({ provider: 'fallback-provider', model: 'fallback-model' }),
    },
  }

  const ctx = {
    llm: services.llm,
    sessions: services.sessions,
    connection: services.connection,
    commands: services.commands,
    get: (name) => services[name],
    on: () => () => {},
    effect: (callback) => {
      const dispose = callback()
      return () => {
        if (typeof dispose === 'function') void dispose()
      }
    },
  }

  apply(ctx, {
    storeDir: root,
    contextChars: 40000,
    toolResultChars: 3000,
  })

  return { root, routes, observed, session }
}

async function sseEvents(response) {
  const text = await response.text()
  return text
    .split('\n\n')
    .filter((frame) => frame.trim() !== '')
    .map((frame) => {
      const line = frame.split('\n').find((candidate) => candidate.startsWith('data:'))
      return JSON.parse(line.slice(5).trim())
    })
}

function askRequest(question, sessionId = 'session-1') {
  return new Request('http://localhost/api/btw.ask', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId, question }),
  })
}

const workspace = await mkdtemp(join(tmpdir(), 'dsh-btw-test-'))

try {
  // --- transcript shape -----------------------------------------------------
  const transcript = buildTranscript(createSession(), normalizeConfig({ contextChars: 40000 }))
  assert.match(transcript.text, /\[environment\] cwd: \/work\/demo/)
  assert.match(transcript.text, /\[user\] 请读一下 config\.toml/)
  assert.match(transcript.text, /\[tool result: read\] port = 8080/)
  assert.match(transcript.text, /\[assistant\] 配置文件里的端口是 8080。/)
  assert.doesNotMatch(transcript.text, /SYSTEM PROMPT/)
  assert.doesNotMatch(transcript.text, /DEVELOPER CONTEXT/)
  assert.equal(transcript.stats.toolResults, 1)

  const withSystem = buildTranscript(
    createSession(),
    normalizeConfig({ includeSystemPrompt: true, includeDeveloper: true }),
  )
  assert.match(withSystem.text, /SYSTEM PROMPT/)
  assert.match(withSystem.text, /DEVELOPER CONTEXT/)

  const longTool = createSession({
    deriveMessages: () => [
      message('user', [{ type: 'text', text: '读大文件' }]),
      message('assistant', [{ type: 'tool-call', id: 'call-long', name: 'read', arguments: '{}' }]),
      message('tool', [{ type: 'text', text: 'A'.repeat(6000) }], { toolCallId: 'call-long' }),
      message('assistant', [{ type: 'text', text: '读完了。' }]),
    ],
  })
  const truncated = buildTranscript(longTool, normalizeConfig({ contextChars: 2000, toolResultChars: 3000 }))
  assert.equal(truncated.stats.truncated, true)
  assert.match(truncated.text, /已省略/)
  assert.ok(truncated.stats.chars <= 2100, `expected a bounded transcript, got ${truncated.stats.chars}`)

  // --- model resolution -----------------------------------------------------
  const config = normalizeConfig({})
  const session = createSession()
  const ctx = { get: () => ({ currentSelection: () => ({ provider: 'fallback-provider', model: 'fallback-model' }) }) }
  assert.deepEqual(resolveModel(ctx, session, config), {
    provider: 'deepseek-official',
    model: 'deepseek-flash',
  })
  assert.deepEqual(resolveModel(ctx, session, normalizeConfig({ provider: 'p', model: 'm' })), {
    provider: 'p',
    model: 'm',
  })
  assert.deepEqual(
    resolveModel(ctx, createSession({ requestContext: () => undefined }), config),
    { provider: 'fallback-provider', model: 'fallback-model' },
  )

  // --- command --------------------------------------------------------------
  const harness = createHarness({ root: workspace })
  assert.equal(harness.observed.commandDefinitions.length, 1)
  const command = harness.observed.commandDefinitions[0]
  assert.equal(command.name, 'btw')
  assert.equal(command.recordInput, false)
  assert.deepEqual(command.handler({ rawInput: '  配置端口？ ', agent: { id: 'session-1' } }), {
    kind: 'success',
    text: '配置端口？',
  })
  assert.equal(command.handler({ rawInput: '   ' }).kind, 'error')

  // --- ask route ------------------------------------------------------------
  const ask = harness.routes.get('/api/btw.ask')
  assert.ok(ask !== undefined)
  const response = await ask.fetch(askRequest('配置文件的端口是多少？'))
  assert.equal(response.status, 200)
  assert.match(response.headers.get('content-type'), /text\/event-stream/)
  const events = await sseEvents(response)
  assert.equal(events[0].type, 'start')
  assert.ok(events.some((event) => event.type === 'delta'))
  assert.ok(events.some((event) => event.type === 'reasoning' && event.text === '先看 tool 结果。'))
  assert.ok(events.some((event) => event.type === 'usage' && event.usage.outputTokens === 40))
  assert.equal(events.at(-1).type, 'done')
  assert.match(events.at(-1).entry.answer, /8080/)
  assert.equal(events.at(-1).entry.status, 'done')
  assert.equal(events.at(-1).entry.finish, 'stop')
  assert.equal(events.at(-1).entry.truncated, false)
  assert.equal(events.at(-1).entry.context.toolResults, 1)

  const streamOptions = harness.observed.streamOptions
  assert.equal(streamOptions.provider, 'deepseek-official')
  assert.equal(streamOptions.model, 'deepseek-flash')
  assert.equal(streamOptions.maxTokens, undefined)
  assert.equal(streamOptions.tools, undefined)
  assert.match(streamOptions.system, /<session_transcript>/)
  assert.match(streamOptions.system, /port = 8080/)
  assert.doesNotMatch(streamOptions.system, /SYSTEM PROMPT/)
  assert.deepEqual(streamOptions.messages, [
    { role: 'user', content: [{ type: 'text', text: '配置文件的端口是多少？' }] },
  ])

  // --- persistence and reading back ----------------------------------------
  const stored = JSON.parse(await readFile(join(workspace, 'sessions', 'session-1.json'), 'utf8'))
  assert.equal(stored.version, 1)
  assert.equal(stored.entries.length, 1)
  assert.equal(stored.entries[0].answer, '端口是 8080。')
  assert.equal(stored.entries[0].model.model, 'deepseek-flash')
  assert.equal(stored.entries[0].usage.inputTokens, 1200)
  assert.equal(stored.entries[0].finish, 'stop')
  assert.equal(stored.entries[0].truncated, false)

  const list = await harness.routes
    .get('/api/btw.list')
    .fetch(new Request('http://localhost/api/btw.list?sessionId=session-1'))
  const listed = await list.json()
  assert.equal(listed.total, 1)
  assert.equal(listed.entries[0].question, '配置文件的端口是多少？')
  assert.equal(listed.entries[0].answer, undefined)
  assert.match(listed.entries[0].answerPreview, /8080/)

  const entryId = listed.entries[0].id
  const entry = await harness.routes
    .get('/api/btw.entry')
    .fetch(new Request(`http://localhost/api/btw.entry?sessionId=session-1&id=${entryId}`))
  assert.equal((await entry.json()).entry.answer, '端口是 8080。')

  const sessionsPayload = await (
    await harness.routes
      .get('/api/btw.sessions')
      .fetch(new Request('http://localhost/api/btw.sessions'))
  ).json()
  assert.equal(sessionsPayload.sessions.length, 1)
  assert.equal(sessionsPayload.sessions[0].count, 1)
  assert.equal(sessionsPayload.sessions[0].sessionId, 'session-1')

  const meta = await (
    await harness.routes.get('/api/btw.meta').fetch(new Request('http://localhost/api/btw.meta'))
  ).json()
  assert.equal(meta.maxEntries, 200)
  assert.equal(meta.storeReasoning, true)

  // --- validation and concurrency ------------------------------------------
  const empty = await ask.fetch(askRequest('   '))
  assert.equal(empty.status, 400)
  assert.equal((await empty.json()).error.code, 'invalid-question')

  const missing = await ask.fetch(askRequest('hello', 'session-404'))
  assert.equal(missing.status, 404)

  let release
  const slow = new Promise((resolve) => {
    release = resolve
  })
  const slowRoot = await mkdtemp(join(tmpdir(), 'dsh-btw-slow-'))
  const slowHarness = createHarness({
    root: slowRoot,
    beforeChunk: () => slow,
  })
  const first = await slowHarness.routes.get('/api/btw.ask').fetch(askRequest('第一个问题'))
  const second = await slowHarness.routes.get('/api/btw.ask').fetch(askRequest('第二个问题'))
  assert.equal(second.status, 409)
  assert.equal((await second.json()).error.code, 'busy')
  await first.body.cancel()
  release()
  await new Promise((resolve) => setTimeout(resolve, 20))
  await rm(slowRoot, { recursive: true, force: true })

  // --- delete and clear -----------------------------------------------------
  const deleted = await harness.routes.get('/api/btw.delete').fetch(
    new Request('http://localhost/api/btw.delete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: 'session-1', id: entryId }),
    }),
  )
  assert.equal((await deleted.json()).deleted, true)

  const cleared = await harness.routes.get('/api/btw.clear').fetch(
    new Request('http://localhost/api/btw.clear', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: 'session-1' }),
    }),
  )
  assert.equal((await cleared.json()).cleared, 0)

  // --- cancellation settles as stopped, not error ---------------------------
  const stopRoot = await mkdtemp(join(tmpdir(), 'dsh-btw-stop-'))
  const stopHarness = createHarness({
    root: stopRoot,
    session: createSession({ id: 'session-stop' }),
    beforeChunk: () => new Promise((resolve) => setTimeout(resolve, 15)),
  })
  const stopResponse = await stopHarness.routes
    .get('/api/btw.ask')
    .fetch(askRequest('会被停止的问题', 'session-stop'))
  const stopReader = stopResponse.body.getReader()
  await stopReader.read()
  await stopReader.cancel()
  const stoppedFile = join(stopRoot, 'sessions', 'session-stop.json')
  let stoppedLog
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      stoppedLog = JSON.parse(await readFile(stoppedFile, 'utf8'))
      break
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
  }
  assert.ok(stoppedLog !== undefined, 'a cancelled ask should still persist as stopped')
  assert.equal(stoppedLog.entries.length, 1)
  assert.equal(stoppedLog.entries[0].status, 'stopped')
  assert.equal(stoppedLog.entries[0].error, undefined)
  await rm(stopRoot, { recursive: true, force: true })

  // --- hitting the output cap is recorded, not silently treated as complete ---
  const maxRoot = await mkdtemp(join(tmpdir(), 'dsh-btw-max-'))
  const maxHarness = createHarness({
    root: maxRoot,
    session: createSession({ id: 'session-max' }),
    chunks: [
      { type: 'text-delta', index: 0, text: '截断前的回答' },
      { type: 'usage', usage: { inputTokens: 100, outputTokens: 1024 } },
      { type: 'finish', reason: { kind: 'max-tokens' } },
    ],
  })
  const maxResponse = await maxHarness.routes
    .get('/api/btw.ask')
    .fetch(askRequest('会触顶的问题', 'session-max'))
  const maxEvents = await sseEvents(maxResponse)
  const maxEntry = maxEvents.at(-1).entry
  assert.equal(maxEvents.at(-1).type, 'done')
  assert.equal(maxEntry.status, 'done')
  assert.equal(maxEntry.finish, 'max-tokens')
  assert.equal(maxEntry.truncated, true)
  await rm(maxRoot, { recursive: true, force: true })

  // --- legacy entries without maxTokens migrate on read ---------------------
  const legacyRoot = await mkdtemp(join(tmpdir(), 'dsh-btw-legacy-'))
  await mkdir(join(legacyRoot, 'sessions'), { recursive: true })
  await writeFile(
    join(legacyRoot, 'sessions', 'session-legacy.json'),
    JSON.stringify({
      version: 1,
      sessionId: 'session-legacy',
      entries: [
        {
          id: 'legacy-1',
          sessionId: 'session-legacy',
          question: '旧问题',
          answer: '旧回答',
          status: 'done',
          createdAt: 1,
          model: { provider: 'p', model: 'm' },
          usage: { inputTokens: 10, outputTokens: 2048 },
          context: { messages: 1, chars: 10, truncated: false, toolResults: 0 },
        },
      ],
    }),
    'utf8',
  )
  const legacyHarness = createHarness({ root: legacyRoot })
  const legacyList = await legacyHarness.routes
    .get('/api/btw.list')
    .fetch(new Request('http://localhost/api/btw.list?sessionId=session-legacy'))
  const legacyEntry = (await legacyList.json()).entries[0]
  assert.equal(legacyEntry.truncated, true)
  assert.equal(legacyEntry.finish, 'max-tokens')
  assert.equal(legacyEntry.maxTokens, 2048)
  await rm(legacyRoot, { recursive: true, force: true })

  console.log('btw host tests: OK')
} finally {
  await rm(workspace, { recursive: true, force: true })
}
