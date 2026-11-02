/**
 * Browser-half smoke test for the BTW plugin, run without a browser:
 *   node test/client.test.mjs
 *
 * The module loader, React, and fetch are replaced with tiny fakes that let the
 * real component and store code run: the factory is materialized, `apply` is
 * called on a fake Cordis context, the SSE reader is exercised with split
 * chunks, and the rendered React tree is walked for the expected nodes.
 */

import assert from 'node:assert/strict'

// ---------------------------------------------------------------------------
// A tiny React stand-in: hooks keep a single render's order, elements are plain
// objects, and the walker below expands function components.
// ---------------------------------------------------------------------------

const Fragment = Symbol('Fragment')

function flatten(children) {
  const result = []
  const visit = (value) => {
    if (Array.isArray(value)) {
      for (const child of value) visit(child)
    } else if (value !== null && value !== undefined && value !== false && value !== true) {
      result.push(value)
    }
  }
  visit(children)
  return result
}

const React = {
  Fragment,
  createElement(type, props, ...children) {
    return { type, props: props ?? {}, children: flatten(children) }
  },
  useState(initial) {
    return [typeof initial === 'function' ? initial() : initial, () => {}]
  },
  useRef(initial) {
    return { current: initial }
  },
  useEffect() {},
  useMemo(factory) {
    return factory()
  },
}

function walk(node, visit) {
  if (node === null || node === undefined || node === false || node === true) return
  if (typeof node === 'string' || typeof node === 'number') {
    visit({ kind: 'text', value: String(node) })
    return
  }
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit)
    return
  }
  if (typeof node === 'object' && node.type !== undefined) {
    if (typeof node.type === 'function') {
      walk(node.type(node.props ?? {}), visit)
      return
    }
    visit({ kind: 'element', tag: typeof node.type === 'symbol' ? 'fragment' : node.type })
    for (const child of node.children ?? []) walk(child, visit)
    return
  }
}

function inspect(tree) {
  const tags = new Set()
  const text = []
  walk(tree, (node) => {
    if (node.kind === 'text') text.push(node.value)
  })
  walk(tree, (node) => {
    if (node.kind === 'element') tags.add(node.tag)
  })
  return { tags, text: text.join(' ') }
}

// ---------------------------------------------------------------------------
// Browser stubs
// ---------------------------------------------------------------------------

const storage = new Map()
globalThis.window = {
  __ModuleLoader__: {
    load(entry) {
      globalThis.window.__btwEntry = entry
    },
  },
  localStorage: {
    getItem(key) {
      return storage.has(key) ? storage.get(key) : null
    },
    setItem(key, value) {
      storage.set(key, String(value))
    },
  },
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  addEventListener() {},
  removeEventListener() {},
}

await import('../client.js')

const entry = globalThis.window.__btwEntry
assert.equal(entry.id, '@local/dsh-plugin-btw')

const plugin = entry.factory((name) => {
  if (name === 'react') return React
  throw new Error(`unexpected module request: ${name}`)
})
assert.deepEqual(plugin.inject, ['slots', 'locale', 'layout'])
assert.equal(typeof plugin.apply, 'function')

// ---------------------------------------------------------------------------
// Fake Cordis context
// ---------------------------------------------------------------------------

const registrations = []
const listeners = []
const decorations = []
const selectedPanels = []
const dictionaries = new Map()

const t = (key, params) => {
  if (params === undefined) return key
  return Object.entries(params).reduce((value, [name, replacement]) => value.replaceAll(`{${name}}`, String(replacement)), key)
}

const ctx = {
  locale: {
    register(namespace, dicts) {
      dictionaries.set(namespace, dicts)
      return () => {}
    },
    bind(namespace) {
      return t
    },
  },
  slots: {
    inject(name, callback) {
      callback()
      return () => {}
    },
    register(options, component) {
      registrations.push({ options, component })
      return () => {}
    },
  },
  layout: {
    selectPanel(id) {
      selectedPanels.push(id)
    },
  },
  get(name) {
    if (name === 'commandUi') {
      return {
        decorate(decoration) {
          decorations.push(decoration)
          return () => {}
        },
      }
    }
    return undefined
  },
  on(name, listener) {
    listeners.push({ name, listener })
    return () => {}
  },
  effect(callback) {
    const dispose = callback()
    return () => {
      if (typeof dispose === 'function') void dispose()
    }
  },
}

plugin.apply(ctx)

assert.equal(dictionaries.has('btw'), true)
const slotNames = registrations.map((registration) => registration.options.name).sort()
assert.deepEqual(slotNames, [
  'conversation.chat.commandview',
  'conversation.input.left',
  'main',
  'shell.overlay',
  'sidebar.panellist',
])
assert.equal(decorations.length, 1)
assert.equal(decorations[0].name, 'btw')
assert.equal(decorations[0].ui.kind, 'action')

// ---------------------------------------------------------------------------
// SSE response helpers
// ---------------------------------------------------------------------------

const encoder = new TextEncoder()

function framesToText(frames) {
  return frames.map((frame) => `data: ${JSON.stringify(frame)}\n\n`).join('')
}

function streamedResponse(frames, chunkSize = 7) {
  const text = framesToText(frames)
  let offset = 0
  const stream = new ReadableStream({
    pull(controller) {
      if (offset >= text.length) {
        controller.close()
        return
      }
      const next = Math.min(text.length, offset + chunkSize)
      controller.enqueue(encoder.encode(text.slice(offset, next)))
      offset = next
    },
  })
  return {
    ok: true,
    status: 200,
    headers: { get: () => 'text/event-stream' },
    body: stream,
    async json() {
      return null
    },
  }
}

const answer = [
  '## 端口',
  '',
  '- 端口是 **8080**',
  '',
  '| 配置 | 值 |',
  '| --- | --- |',
  '| port | 8080 |',
  '',
  '```js',
  'const port = 8080',
  '```',
].join('\n')

const askFrames = [
  {
    type: 'start',
    entry: {
      id: 'entry-1',
      sessionId: 'session-1',
      question: '配置里端口是多少？',
      answer: '',
      status: 'running',
      createdAt: Date.now(),
      model: { provider: 'deepseek-official', model: 'deepseek-flash' },
      context: { messages: 4, chars: 900, truncated: false, toolResults: 1 },
    },
  },
  { type: 'reasoning', text: '先看工具结果。' },
  { type: 'delta', text: answer.slice(0, 24) },
  { type: 'delta', text: answer.slice(24) },
  { type: 'usage', usage: { inputTokens: 1200, outputTokens: 80 } },
  {
    type: 'done',
    entry: {
      id: 'entry-1',
      sessionId: 'session-1',
      question: '配置里端口是多少？',
      answer,
      reasoning: '先看工具结果。',
      status: 'done',
      createdAt: Date.now(),
      completedAt: Date.now(),
      elapsedMs: 1234,
      model: { provider: 'deepseek-official', model: 'deepseek-flash' },
      usage: { inputTokens: 1200, outputTokens: 80 },
      context: { messages: 4, chars: 900, truncated: false, toolResults: 1 },
    },
  },
]

function jsonResponse(value) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    async json() {
      return value
    },
  }
}

let fetchCalls = []
let askResponse = () => streamedResponse(askFrames)
globalThis.fetch = async (url, init) => {
  const target = String(url)
  if (target.startsWith('api/btw.meta')) return jsonResponse({})
  if (target.startsWith('api/btw.sessions')) return jsonResponse({ sessions: [] })
  fetchCalls.push({ url, init })
  if (target.startsWith('api/btw.ask')) return askResponse()
  throw new Error(`unexpected fetch: ${url}`)
}

// ---------------------------------------------------------------------------
// Overlay: one streamed ask, then a rendered tree
// ---------------------------------------------------------------------------

const overlayRegistration = registrations.find(
  (registration) => registration.options.name === 'shell.overlay',
)
const overlayBusiness = overlayRegistration.options.inject()
const overlayStore = overlayBusiness.hooks.btw
const overlayProps = {
  ...overlayBusiness,
  t,
  useBtw: (selector) => selector(overlayStore.getSnapshot()),
  useSessions: (selector) =>
    selector({ ids: ['session-1'], byId: { 'session-1': { displayTitle: 'Demo Session' } } }),
  useSessionStatus: (selector) => selector(new Map([['session-1', { running: true }]])),
}

overlayStore.open('session-1')
assert.equal(overlayStore.getSnapshot().open, true)
assert.equal(overlayStore.getSnapshot().sessionId, 'session-1')
await new Promise((resolve) => setTimeout(resolve, 10))
assert.equal(overlayStore.getSnapshot().maxTokens, null)

const buttonRegistration = registrations.find(
  (registration) => registration.options.name === 'conversation.input.left',
)
const buttonProps = {
  ...buttonRegistration.options.inject('session-1'),
  t,
}
const buttonTree = inspect(buttonRegistration.component(buttonProps))
assert.equal(buttonTree.text.includes('BTW'), true)

overlayStore.setQuestion('配置里端口是多少？')
overlayStore.submit()

for (let attempt = 0; attempt < 100 && overlayStore.getSnapshot().phase !== 'done'; attempt += 1) {
  await new Promise((resolve) => setTimeout(resolve, 10))
}
assert.equal(overlayStore.getSnapshot().phase, 'done', 'the mocked stream should settle')
assert.equal(fetchCalls.length, 1)
assert.equal(fetchCalls[0].url, 'api/btw.ask')
assert.match(overlayStore.getSnapshot().answer, /8080/)
assert.equal(overlayStore.getSnapshot().elapsedMs, 1234)

const overlayTree = inspect(overlayRegistration.component(overlayProps))
for (const tag of ['h2', 'ul', 'li', 'strong', 'table', 'pre', 'code', 'button', 'textarea']) {
  assert.equal(overlayTree.tags.has(tag), true, `overlay should render <${tag}>`)
}
assert.match(overlayTree.text, /8080/)
assert.match(overlayTree.text, /deepseek-flash/)
assert.match(overlayTree.text, /Demo Session/)
assert.match(overlayTree.text, /entry-1|title/)
assert.equal(overlayTree.text.includes('truncatedNotice'), false)

// A capped answer must be called out instead of looking complete.
const truncatedFrames = [
  {
    type: 'start',
    entry: {
      id: 'entry-2',
      sessionId: 'session-1',
      question: '会截断的问题',
      answer: '',
      status: 'running',
      createdAt: Date.now(),
      model: { provider: 'deepseek-official', model: 'deepseek-flash' },
      context: { messages: 4, chars: 900, truncated: false, toolResults: 1 },
    },
  },
  { type: 'delta', text: '这段回答会' },
  { type: 'usage', usage: { inputTokens: 100, outputTokens: 2048 } },
  {
    type: 'done',
    entry: {
      id: 'entry-2',
      sessionId: 'session-1',
      question: '会截断的问题',
      answer: '这段回答会',
      status: 'done',
      finish: 'max-tokens',
      truncated: true,
      maxTokens: 2048,
      createdAt: Date.now(),
      completedAt: Date.now(),
      elapsedMs: 900,
      model: { provider: 'deepseek-official', model: 'deepseek-flash' },
      usage: { inputTokens: 100, outputTokens: 2048 },
      context: { messages: 4, chars: 900, truncated: false, toolResults: 1 },
    },
  },
]
askResponse = () => streamedResponse(truncatedFrames)
overlayStore.setQuestion('会截断的问题')
overlayStore.submit()
for (let attempt = 0; attempt < 100 && overlayStore.getSnapshot().phase !== 'done'; attempt += 1) {
  await new Promise((resolve) => setTimeout(resolve, 10))
}
assert.equal(overlayStore.getSnapshot().truncated, true)
const truncatedTree = inspect(overlayRegistration.component(overlayProps))
assert.equal(truncatedTree.text.includes('truncatedNotice'), true)
askResponse = () => streamedResponse(askFrames)

// ---------------------------------------------------------------------------
// History page: header, list, and detail markup
// ---------------------------------------------------------------------------

const pageRegistration = registrations.find((registration) => registration.options.name === 'main')
assert.equal(pageRegistration.options.key, 'btw')
const pageBusiness = pageRegistration.options.inject()
pageBusiness.hooks.btw.setHistorySession('session-1')
pageBusiness.hooks.btw.selectHistoryEntry('entry-1')
const pageProps = {
  ...pageBusiness,
  t,
  useBtw: (selector) => selector(pageBusiness.hooks.btw.getSnapshot()),
  useSessions: (selector) =>
    selector({ ids: ['session-1'], byId: { 'session-1': { displayTitle: 'Demo Session' } } }),
}
const pageTree = inspect(pageRegistration.component(pageProps))
assert.equal(pageTree.text.includes('historyTitle'), true)
assert.equal(pageTree.tags.has('select') || pageTree.tags.has('input'), true)

// The sidebar entry and the hidden command row exist and render without throwing.
const iconRegistration = registrations.find(
  (registration) => registration.options.name === 'sidebar.panellist',
)
assert.equal(iconRegistration.options.id, 'btw')
inspect(iconRegistration.component({ size: 16 }))
const commandRow = registrations.find(
  (registration) => registration.options.name === 'conversation.chat.commandview',
)
assert.equal(commandRow.options.key, 'btw')
assert.equal(commandRow.component({}), null)

// ---------------------------------------------------------------------------
// `/btw` bare decoration and `/btw 问题` command result
// ---------------------------------------------------------------------------

decorations[0].ui.run({ sessionId: 'session-1' })
assert.equal(overlayStore.getSnapshot().open, true)

fetchCalls = []
const commandListener = listeners.find((listener) => listener.name === 'command/executed')
assert.ok(commandListener !== undefined)
commandListener.listener('session-1', 'btw', { kind: 'success', text: '再问一次：主机是什么？' })
for (let attempt = 0; attempt < 100 && overlayStore.getSnapshot().phase !== 'done'; attempt += 1) {
  await new Promise((resolve) => setTimeout(resolve, 10))
}
assert.equal(overlayStore.getSnapshot().phase, 'done')
assert.equal(overlayStore.getSnapshot().question, '再问一次：主机是什么？')
assert.equal(overlayStore.getSnapshot().sessionId, 'session-1')

// ---------------------------------------------------------------------------
// Host error and empty-question behavior
// ---------------------------------------------------------------------------

fetchCalls = []
globalThis.fetch = async (url) => {
  fetchCalls.push({ url })
  return {
    ok: false,
    status: 409,
    headers: { get: () => 'application/json' },
    async json() {
      return { error: { code: 'busy', message: 'another question is running' } }
    },
  }
}
overlayStore.setQuestion('并发问题')
overlayStore.submit()
for (let attempt = 0; attempt < 100 && overlayStore.getSnapshot().phase !== 'error'; attempt += 1) {
  await new Promise((resolve) => setTimeout(resolve, 10))
}
assert.equal(overlayStore.getSnapshot().phase, 'error')
assert.equal(overlayStore.getSnapshot().error.code, 'busy')

fetchCalls = []
overlayStore.setQuestion('   ')
overlayStore.submit()
await new Promise((resolve) => setTimeout(resolve, 20))
assert.equal(fetchCalls.length, 0)

assert.deepEqual(selectedPanels, [])

console.log('btw client tests: OK')
