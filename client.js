/**
 * Browser half of the BTW plugin.
 *
 * Two surfaces, one host-owned answer stream:
 *   - `shell.overlay`: a floating side-question panel that never touches the
 *     composer, the Agent loop, or the Session log.
 *   - `main` keyed by `btw`: a history page with a session picker, a list, and
 *     a detail view.
 *
 * The composer button and the `/btw` slash contribution open the panel; a
 * `/btw 问题` line is claimed by the hidden Host command and replayed here
 * through the local `command/executed` event.
 *
 * @module @local/dsh-plugin-btw/client
 */

window.__ModuleLoader__.load({
  id: '@local/dsh-plugin-btw',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useEffect, useMemo, useRef, useState } = React

    /** Dictionary namespace owned by this plugin. */
    const NS = 'btw'
    /** History page id shared with the sidebar entry. */
    const PANEL_ID = 'btw'
    /** Last history target, per browser. */
    const LAST_SESSION_KEY = 'dsh.btw.history.session.v1'
    /** Relative routes so a deployment mounted under a prefix keeps working. */
    const ROUTES = {
      ask: 'api/btw.ask',
      list: 'api/btw.list',
      entry: 'api/btw.entry',
      remove: 'api/btw.delete',
      clear: 'api/btw.clear',
      sessions: 'api/btw.sessions',
      meta: 'api/btw.meta',
    }

    // -----------------------------------------------------------------------
    // Copy
    // -----------------------------------------------------------------------

    const zh = {
      title: 'BTW 侧问',
      panel: 'BTW 旁问',
      openHint: '基于当前会话旁问（/btw）',
      placeholder: '基于当前会话上下文提问；不调用工具，也不会打断会话…',
      send: '发送',
      stop: '停止',
      close: '关闭',
      copy: '复制',
      copied: '已复制',
      thinking: '思考过程',
      thinkingLive: '正在思考…',
      streaming: '正在回答…',
      empty: '输入问题后按 ⌘/Ctrl + Enter 发送。',
      sessionRunning: '会话运行中',
      sessionIdle: '会话空闲',
      history: '历史',
      historyCount: '历史 ({count})',
      historyTitle: 'BTW 旁问历史',
      historySubtitle: '{count} 条记录',
      search: '搜索问题…',
      noResults: '没有匹配的记录',
      chars: '{count} 字',
      noHistory: '还没有 BTW 记录',
      noHistoryHint: '在对话底部点击 BTW，或输入 /btw，即可基于当前会话上下文旁问。',
      selectSession: '会话',
      loading: '加载中…',
      loadFailed: '加载失败',
      retry: '重试',
      emptyDetail: '选择左侧的一条记录查看详情。',
      questionLabel: '问题',
      answerLabel: '回答',
      model: '模型',
      tokens: 'Token',
      elapsed: '耗时',
      context: '上下文',
      contextValue: '{messages} 条消息 / {chars} 字符',
      truncated: '已截断',
      delete: '删除',
      deleteConfirm: '确认删除',
      clear: '清空本会话',
      clearConfirm: '确认清空？',
      cancel: '取消',
      back: '返回',
      backToChat: '返回对话',
      again: '再次提问',
      copyAnswer: '复制回答',
      copyQA: '复制问答',
      refresh: '刷新',
      openPanel: '打开 BTW',
      statusDone: '完成',
      statusStopped: '已停止',
      statusError: '失败',
      statusRunning: '进行中',
      noSession: '未选择会话',
      unknownSession: '未知会话',
      errorSessionNotLive: '会话已不在运行，无法读取上下文。',
      errorModelUnavailable: '找不到可用的模型，请先在设置里选择模型。',
      errorBusy: '该会话已有一个 BTW 提问在进行。',
      errorInvalidQuestion: '问题不能为空或过长。',
      errorTimeout: '请求超时，请重试。',
      errorStreamEnded: '回答流意外中断，请重试。',
      errorNetwork: '网络请求失败，请检查连接。',
      errorDefault: '请求失败',
      errorEmptyAnswer: '模型没有返回内容。',
      truncatedNotice: '回答达到模型输出上限，未输出完整。',
      truncatedBadge: '已截断',
      truncatedHint: '可在主会话继续追问，或重试本次旁问。',
    }

    const en = {
      title: 'BTW side question',
      panel: 'BTW',
      openHint: 'Ask a side question about this session (/btw)',
      placeholder: 'Ask about this session — no tools, no interruption…',
      send: 'Send',
      stop: 'Stop',
      close: 'Close',
      copy: 'Copy',
      copied: 'Copied',
      thinking: 'Reasoning',
      thinkingLive: 'Thinking…',
      streaming: 'Answering…',
      empty: 'Type a question and press ⌘/Ctrl + Enter.',
      sessionRunning: 'Session running',
      sessionIdle: 'Session idle',
      history: 'History',
      historyCount: 'History ({count})',
      historyTitle: 'BTW side questions',
      historySubtitle: '{count} entries',
      search: 'Search questions…',
      noResults: 'No matching entries',
      chars: '{count} chars',
      noHistory: 'No BTW entries yet',
      noHistoryHint: 'Click BTW under the conversation, or type /btw, to ask a side question about this session.',
      selectSession: 'Session',
      loading: 'Loading…',
      loadFailed: 'Failed to load',
      retry: 'Retry',
      emptyDetail: 'Select an entry on the left to see its details.',
      questionLabel: 'Question',
      answerLabel: 'Answer',
      model: 'Model',
      tokens: 'Tokens',
      elapsed: 'Elapsed',
      context: 'Context',
      contextValue: '{messages} messages / {chars} chars',
      truncated: 'truncated',
      delete: 'Delete',
      deleteConfirm: 'Confirm delete',
      clear: 'Clear session',
      clearConfirm: 'Clear all?',
      cancel: 'Cancel',
      back: 'Back',
      backToChat: 'Back to chat',
      again: 'Ask again',
      copyAnswer: 'Copy answer',
      copyQA: 'Copy Q&A',
      refresh: 'Refresh',
      openPanel: 'Open BTW',
      statusDone: 'Done',
      statusStopped: 'Stopped',
      statusError: 'Failed',
      statusRunning: 'Running',
      noSession: 'No session selected',
      unknownSession: 'Unknown session',
      errorSessionNotLive: 'The session is no longer live, so its context cannot be read.',
      errorModelUnavailable: 'No model is available; select one in Settings first.',
      errorBusy: 'Another BTW question is already running for this session.',
      errorInvalidQuestion: 'The question is empty or too long.',
      errorTimeout: 'The request timed out. Try again.',
      errorStreamEnded: 'The answer stream ended unexpectedly. Try again.',
      errorNetwork: 'The network request failed. Check your connection.',
      errorDefault: 'Request failed',
      errorEmptyAnswer: 'The model returned no content.',
      truncatedNotice: 'The answer hit the model output limit and is incomplete.',
      truncatedBadge: 'truncated',
      truncatedHint: 'Ask again in the main conversation, or retry this side question.',
    }

    const ERROR_KEYS = {
      'session-not-live': 'errorSessionNotLive',
      'model-unavailable': 'errorModelUnavailable',
      busy: 'errorBusy',
      'invalid-question': 'errorInvalidQuestion',
      'invalid-session': 'errorInvalidQuestion',
      'invalid-request': 'errorInvalidQuestion',
      timeout: 'errorTimeout',
      'stream-ended': 'errorStreamEnded',
      network: 'errorNetwork',
      'http-404': 'errorSessionNotLive',
    }

    // -----------------------------------------------------------------------
    // Utilities
    // -----------------------------------------------------------------------

    function pad(value) {
      return value < 10 ? `0${value}` : String(value)
    }

    function formatTime(timestamp) {
      if (typeof timestamp !== 'number' || timestamp <= 0) return ''
      const date = new Date(timestamp)
      const now = new Date()
      const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`
      if (date.toDateString() === now.toDateString()) return time
      const sameYear = date.getFullYear() === now.getFullYear()
      return `${sameYear ? '' : `${date.getFullYear()}-`}${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${time}`
    }

    function formatElapsed(milliseconds) {
      if (typeof milliseconds !== 'number' || !Number.isFinite(milliseconds) || milliseconds < 0) return ''
      if (milliseconds < 60000) return `${(milliseconds / 1000).toFixed(1)}s`
      return `${Math.floor(milliseconds / 60000)}m ${pad(Math.round((milliseconds % 60000) / 1000))}s`
    }

    function formatTokens(usage) {
      if (usage === null || typeof usage !== 'object') return ''
      const input = Number.isFinite(usage.inputTokens) ? usage.inputTokens : undefined
      const output = Number.isFinite(usage.outputTokens) ? usage.outputTokens : undefined
      if (input === undefined && output === undefined) return ''
      return `${input ?? 0} → ${output ?? 0}`
    }

    /**
     * Decide whether one answer stopped at the output cap. The explicit flag
     * arrived with the fix; the usage comparison also covers entries recorded
     * before it and hosts that predate the flag.
     * @param entry - an overlay state slice or a stored entry.
     * @param maxTokens - the effective output cap, when known.
     * @returns whether the answer may be incomplete.
     */
    function isTruncated(entry, maxTokens) {
      if (entry === null || entry === undefined) return false
      if (entry.truncated === true || entry.finish === 'max-tokens') return true
      const output = entry.usage?.outputTokens
      return (
        typeof output === 'number' &&
        typeof maxTokens === 'number' &&
        maxTokens > 0 &&
        output >= maxTokens
      )
    }

    function readLastSession() {
      try {
        const value = window.localStorage.getItem(LAST_SESSION_KEY)
        return typeof value === 'string' && value !== '' ? value : null
      } catch {
        return null
      }
    }

    function writeLastSession(sessionId) {
      try {
        if (typeof sessionId === 'string' && sessionId !== '') window.localStorage.setItem(LAST_SESSION_KEY, sessionId)
      } catch {
        // A disabled storage only costs the remembered default.
      }
    }

    function errorLabel(t, error) {
      if (error !== null && typeof error === 'object' && typeof error.code === 'string') {
        const key = ERROR_KEYS[error.code]
        if (key !== undefined) return t(key)
      }
      if (error !== null && typeof error === 'object' && typeof error.message === 'string' && error.message !== '') {
        return error.message
      }
      return t('errorDefault')
    }

    class BtwApiError extends Error {
      constructor(code, message) {
        super(message)
        this.name = 'BtwApiError'
        this.code = code
      }
    }

    // -----------------------------------------------------------------------
    // Host API
    // -----------------------------------------------------------------------

    const api = {
      async ask(sessionId, question, onEvent, signal) {
        const response = await fetch(ROUTES.ask, {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
          body: JSON.stringify({ sessionId, question }),
          signal,
        })
        if (!response.ok) {
          const payload = await response.json().catch(() => null)
          const code =
            payload !== null && typeof payload === 'object' && payload.error
              ? payload.error.code
              : `http-${response.status}`
          const message =
            payload !== null && typeof payload === 'object' && payload.error
              ? payload.error.message
              : `HTTP ${response.status}`
          throw new BtwApiError(code, message)
        }
        if (response.body === null) throw new BtwApiError('stream-ended', 'the answer stream is unavailable')
        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let settled = false
        for (;;) {
          const { value, done } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          let boundary
          while ((boundary = buffer.indexOf('\n\n')) >= 0) {
            const frame = buffer.slice(0, boundary)
            buffer = buffer.slice(boundary + 2)
            for (const line of frame.split('\n')) {
              if (!line.startsWith('data:')) continue
              let payload
              try {
                payload = JSON.parse(line.slice(5).trim())
              } catch {
                continue
              }
              if (payload !== null && typeof payload === 'object') {
                if (payload.type === 'done' || payload.type === 'error') settled = true
                onEvent(payload)
              }
            }
          }
        }
        if (!settled) throw new BtwApiError('stream-ended', 'the answer stream ended unexpectedly')
      },
      async list(sessionId) {
        const search = new URLSearchParams({ sessionId, limit: '500' })
        return getJson(`${ROUTES.list}?${search.toString()}`)
      },
      async entry(sessionId, id) {
        const search = new URLSearchParams({ sessionId, id })
        return getJson(`${ROUTES.entry}?${search.toString()}`)
      },
      async remove(sessionId, id) {
        return postJson(ROUTES.remove, { sessionId, id })
      },
      async clear(sessionId) {
        return postJson(ROUTES.clear, { sessionId })
      },
      async sessions() {
        return getJson(ROUTES.sessions)
      },
      async meta() {
        return getJson(ROUTES.meta)
      },
    }

    async function getJson(path) {
      const response = await fetch(path, { headers: { accept: 'application/json' } })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        throw new BtwApiError(
          payload !== null && typeof payload === 'object' && payload.error ? payload.error.code : `http-${response.status}`,
          payload !== null && typeof payload === 'object' && payload.error ? payload.error.message : `HTTP ${response.status}`,
        )
      }
      return payload
    }

    async function postJson(path, body) {
      const response = await fetch(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(body),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        throw new BtwApiError(
          payload !== null && typeof payload === 'object' && payload.error ? payload.error.code : `http-${response.status}`,
          payload !== null && typeof payload === 'object' && payload.error ? payload.error.message : `HTTP ${response.status}`,
        )
      }
      return payload
    }

    // -----------------------------------------------------------------------
    // Panel store
    // -----------------------------------------------------------------------

    function createStore(layout) {
      let state = {
        open: false,
        sessionId: null,
        question: '',
        phase: 'idle',
        entryId: null,
        answer: '',
        reasoning: '',
        error: null,
        model: null,
        usage: null,
        context: null,
        elapsedMs: 0,
        startedAt: 0,
        revision: 0,
        historySessionId: readLastSession(),
        historySelectedId: null,
        maxTokens: null,
        truncated: false,
      }
      const listeners = new Set()
      let activeRun = null
      let runCounter = 0

      function emit() {
        for (const listener of [...listeners]) listener()
      }

      function set(patch) {
        state = { ...state, ...patch }
        emit()
      }

      function snapshot() {
        return state
      }

      function subscribe(listener) {
        listeners.add(listener)
        return () => {
          listeners.delete(listener)
        }
      }

      let metaRequest = null

      function ensureMeta() {
        if (state.maxTokens !== null || metaRequest !== null) return
        metaRequest = api
          .meta()
          .then((meta) => {
            if (meta !== null && typeof meta === 'object' && typeof meta.maxTokens === 'number') {
              set({ maxTokens: meta.maxTokens })
            }
          })
          .catch(() => {})
          .finally(() => {
            metaRequest = null
          })
      }

      function settleLater(phase) {
        set({ phase })
        window.setTimeout(() => set({ revision: state.revision + 1 }), 800)
      }

      function stopActive() {
        const run = activeRun
        activeRun = null
        if (run !== null) run.controller.abort(new Error('btw run stopped'))
        return run !== null
      }

      async function runAsk(sessionId, question) {
        if (activeRun !== null) return
        const trimmed = question.trim()
        if (trimmed === '') return
        runCounter += 1
        const run = { id: runCounter, controller: new AbortController() }
        activeRun = run
        const isCurrent = () => activeRun === run
        set({
          open: true,
          sessionId,
          question: trimmed,
          phase: 'streaming',
          entryId: null,
          answer: '',
          reasoning: '',
          error: null,
          model: null,
          usage: null,
          context: null,
          elapsedMs: 0,
          startedAt: Date.now(),
          truncated: false,
        })
        writeLastSession(sessionId)
        try {
          await api.ask(
            sessionId,
            trimmed,
            (event) => {
              if (!isCurrent()) return
              if (event.type === 'start') {
                set({
                  entryId: event.entry?.id ?? null,
                  model: event.entry?.model ?? null,
                  context: event.entry?.context ?? null,
                  truncated: false,
                })
              } else if (event.type === 'delta') {
                set({ answer: state.answer + (typeof event.text === 'string' ? event.text : '') })
              } else if (event.type === 'reasoning') {
                set({ reasoning: state.reasoning + (typeof event.text === 'string' ? event.text : '') })
              } else if (event.type === 'usage') {
                set({ usage: event.usage ?? null })
              } else if (event.type === 'done') {
                set({
                  phase: 'done',
                  entryId: event.entry?.id ?? state.entryId,
                  answer: typeof event.entry?.answer === 'string' ? event.entry.answer : state.answer,
                  reasoning: typeof event.entry?.reasoning === 'string' ? event.entry.reasoning : state.reasoning,
                  usage: event.entry?.usage ?? state.usage,
                  context: event.entry?.context ?? state.context,
                  model: event.entry?.model ?? state.model,
                  elapsedMs: event.entry?.elapsedMs ?? 0,
                  truncated:
                    event.entry?.truncated === true ||
                    event.entry?.finish === 'max-tokens' ||
                    (typeof event.entry?.usage?.outputTokens === 'number' &&
                      typeof state.maxTokens === 'number' &&
                      event.entry.usage.outputTokens >= state.maxTokens),
                  revision: state.revision + 1,
                })
              } else if (event.type === 'error') {
                set({ phase: 'error', error: event.error ?? { code: 'error', message: '' }, truncated: false })
                window.setTimeout(() => set({ revision: state.revision + 1 }), 800)
              }
            },
            run.controller.signal,
          )
        } catch (error) {
          if (!isCurrent()) return
          if (run.controller.signal.aborted) {
            settleLater('stopped')
          } else {
            const failure =
              error !== null && typeof error === 'object'
                ? { code: typeof error.code === 'string' ? error.code : 'network', message: String(error.message ?? '') }
                : { code: 'network', message: String(error) }
            set({ phase: 'error', error: failure })
            window.setTimeout(() => set({ revision: state.revision + 1 }), 800)
          }
        } finally {
          if (isCurrent()) activeRun = null
        }
      }

      function openPanel(sessionId) {
        stopActive()
        ensureMeta()
        writeLastSession(sessionId)
        set({
          open: true,
          sessionId,
          question: '',
          phase: 'idle',
          entryId: null,
          answer: '',
          reasoning: '',
          error: null,
          model: null,
          usage: null,
          context: null,
          elapsedMs: 0,
          startedAt: 0,
          historySessionId: sessionId,
          truncated: false,
        })
      }

      return {
        getSnapshot: snapshot,
        subscribe,
        ensureMeta,
        open(sessionId) {
          if (state.open && state.sessionId === sessionId) return
          openPanel(sessionId)
        },
        askNow(sessionId, question) {
          openPanel(sessionId)
          void runAsk(sessionId, question)
        },
        openAsk(sessionId, question) {
          if (!state.open || state.sessionId !== sessionId) openPanel(sessionId)
          set({ question: typeof question === 'string' ? question : '' })
        },
        close() {
          const stopped = stopActive()
          set({ open: false })
          if (stopped) settleLater('stopped')
        },
        setQuestion(value) {
          set({ question: typeof value === 'string' ? value : '' })
        },
        submit() {
          if (state.sessionId === null) return
          if (activeRun !== null) return
          void runAsk(state.sessionId, state.question)
        },
        stop() {
          if (stopActive()) settleLater('stopped')
        },
        showHistory(sessionId) {
          const target = typeof sessionId === 'string' && sessionId !== '' ? sessionId : state.historySessionId
          if (target !== null) {
            writeLastSession(target)
            set({ historySessionId: target })
          }
          set({ revision: state.revision + 1 })
          if (state.phase !== 'streaming') set({ open: false })
          layout.selectPanel(PANEL_ID)
        },
        setHistorySession(sessionId) {
          writeLastSession(sessionId)
          set({ historySessionId: sessionId, historySelectedId: null })
        },
        selectHistoryEntry(id) {
          set({ historySelectedId: id })
        },
        bumpRevision() {
          set({ revision: state.revision + 1 })
        },
      }
    }

    // -----------------------------------------------------------------------
    // Markdown
    // -----------------------------------------------------------------------

    function isTableDivider(line) {
      return /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(line)
    }

    function splitTableRow(line) {
      const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '')
      return trimmed.split('|').map((cell) => cell.trim())
    }

    function isBlockStart(line) {
      return (
        /^\s*```/.test(line) ||
        /^#{1,6}\s+/.test(line) ||
        /^\s*(?:---+|\*\*\*+|___+)\s*$/.test(line) ||
        /^\s*>/.test(line) ||
        /^\s*(?:[-*+]|\d+[.)])\s+/.test(line)
      )
    }

    function parseList(lines, start) {
      const first = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(lines[start])
      const baseIndent = first[1].length
      const ordered = /\d/.test(first[2])
      const items = []
      let index = start
      while (index < lines.length) {
        const match = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(lines[index])
        if (match === null || match[1].length !== baseIndent) break
        const itemLines = [match[3]]
        const children = []
        index += 1
        while (index < lines.length) {
          const line = lines[index]
          if (/^\s*$/.test(line)) break
          const nested = /^(\s*)([-*+]|\d+[.)])\s+/.exec(line)
          if (nested !== null && nested[1].length > baseIndent) {
            const parsed = parseList(lines, index)
            children.push(parsed.block)
            index = parsed.next
            continue
          }
          if (nested !== null) break
          const indent = /^(\s*)/.exec(line)[1].length
          if (indent > baseIndent) {
            itemLines.push(line.trim())
            index += 1
            continue
          }
          break
        }
        items.push({ text: itemLines.join(' '), children })
        if (index < lines.length && /^\s*$/.test(lines[index])) {
          const next = lines[index + 1]
          if (next !== undefined && /^(\s*)([-*+]|\d+[.)])\s+/.test(next)) {
            index += 1
            continue
          }
          break
        }
      }
      return { block: { type: 'list', ordered, items }, next: index }
    }

    function parseBlocks(source) {
      const lines = String(source ?? '')
        .replace(/\r\n?/g, '\n')
        .split('\n')
      const blocks = []
      let index = 0
      while (index < lines.length) {
        const line = lines[index]
        if (/^\s*$/.test(line)) {
          index += 1
          continue
        }
        const fence = /^\s*```([\w#+.-]*)\s*$/.exec(line)
        if (fence !== null) {
          const language = fence[1] ?? ''
          const body = []
          index += 1
          while (index < lines.length && !/^\s*```\s*$/.test(lines[index])) {
            body.push(lines[index])
            index += 1
          }
          if (index < lines.length) index += 1
          blocks.push({ type: 'code', language, text: body.join('\n') })
          continue
        }
        const heading = /^(#{1,6})\s+(.*)$/.exec(line)
        if (heading !== null) {
          blocks.push({ type: 'heading', level: heading[1].length, text: heading[2].trim() })
          index += 1
          continue
        }
        if (/^\s*(?:---+|\*\*\*+|___+)\s*$/.test(line)) {
          blocks.push({ type: 'hr' })
          index += 1
          continue
        }
        if (/^\s*>/.test(line)) {
          const body = []
          while (index < lines.length && /^\s*>/.test(lines[index])) {
            body.push(lines[index].replace(/^\s*>\s?/, ''))
            index += 1
          }
          blocks.push({ type: 'quote', text: body.join('\n') })
          continue
        }
        if (line.includes('|') && index + 1 < lines.length && isTableDivider(lines[index + 1])) {
          const header = splitTableRow(line)
          index += 2
          const rows = []
          while (index < lines.length && lines[index].includes('|') && lines[index].trim() !== '') {
            rows.push(splitTableRow(lines[index]))
            index += 1
          }
          blocks.push({ type: 'table', header, rows })
          continue
        }
        if (/^\s*(?:[-*+]|\d+[.)])\s+/.test(line)) {
          const parsed = parseList(lines, index)
          blocks.push(parsed.block)
          index = parsed.next
          continue
        }
        const body = [line.trim()]
        index += 1
        while (index < lines.length && !/^\s*$/.test(lines[index]) && !isBlockStart(lines[index])) {
          body.push(lines[index].trim())
          index += 1
        }
        blocks.push({ type: 'paragraph', text: body.join(' ') })
      }
      return blocks
    }

    function renderInline(source, keyBase) {
      const text = String(source ?? '')
      const pattern =
        /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(__[^_\n]+__)|(~~[^~\n]+~~)|(\*[^*\n]+\*)|(_[^_\n]+_)|(\[[^\]\n]+\]\([^)\s]+\))|(https?:\/\/[^\s<>()]+)/g
      const nodes = []
      let last = 0
      let match
      let index = 0
      while ((match = pattern.exec(text)) !== null) {
        if (match.index > last) nodes.push(text.slice(last, match.index))
        const token = match[0]
        const key = `${keyBase}-i${index}`
        if (token.startsWith('`')) {
          nodes.push(h('code', { key, className: 'dsh-btw-inline-code' }, token.slice(1, -1)))
        } else if (token.startsWith('**') || token.startsWith('__')) {
          nodes.push(h('strong', { key }, renderInline(token.slice(2, -2), key)))
        } else if (token.startsWith('~~')) {
          nodes.push(h('del', { key }, renderInline(token.slice(2, -2), key)))
        } else if (token.startsWith('[')) {
          const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(token)
          if (link !== null && /^(https?:\/\/|mailto:)/i.test(link[2])) {
            nodes.push(
              h('a', { key, href: link[2], target: '_blank', rel: 'noreferrer noopener' }, link[1]),
            )
          } else {
            nodes.push(token)
          }
        } else if (/^https?:\/\//.test(token)) {
          nodes.push(h('a', { key, href: token, target: '_blank', rel: 'noreferrer noopener' }, token))
        } else {
          nodes.push(h('em', { key }, renderInline(token.slice(1, -1), key)))
        }
        last = match.index + token.length
        index += 1
      }
      if (last < text.length) nodes.push(text.slice(last))
      return nodes
    }

    function CodeBlock({ language, text, t }) {
      const [copied, setCopied] = useState(false)
      const copy = () => {
        try {
          void navigator.clipboard?.writeText(text)
        } catch {
          // Clipboard permission is browser-owned.
        }
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1400)
      }
      return h(
        'div',
        { className: 'dsh-btw-code' },
        h(
          'div',
          { className: 'dsh-btw-code-head' },
          h('span', null, language === '' ? 'text' : language),
          h(
            'button',
            { type: 'button', className: 'dsh-btw-code-copy', onClick: copy, title: copied ? t('copied') : t('copy') },
            copied ? '✓' : '⧉',
          ),
        ),
        h('pre', null, h('code', null, text)),
      )
    }

    function renderList(block, key, t) {
      const items = block.items.map((item, index) =>
        h(
          'li',
          { key: `${key}-${index}` },
          renderInline(item.text, `${key}-${index}`),
          item.children.length === 0 ? null : renderBlocks(item.children, t),
        ),
      )
      return h(block.ordered ? 'ol' : 'ul', { key }, items)
    }

    function renderTable(block, key, t) {
      const width = block.header.length
      const rows = block.rows.map((row, rowIndex) =>
        h(
          'tr',
          { key: `${key}-r${rowIndex}` },
          Array.from({ length: width }, (_, cellIndex) =>
            h('td', { key: `${key}-r${rowIndex}-c${cellIndex}` }, renderInline(row[cellIndex] ?? '', `${key}-${rowIndex}-${cellIndex}`)),
          ),
        ),
      )
      return h(
        'div',
        { className: 'dsh-btw-table-wrap', key },
        h(
          'table',
          null,
          h(
            'thead',
            null,
            h(
              'tr',
              null,
              block.header.map((cell, cellIndex) => h('th', { key: `${key}-h${cellIndex}` }, renderInline(cell, `${key}-h${cellIndex}`))),
            ),
          ),
          h('tbody', null, rows),
        ),
      )
    }

    function renderBlocks(blocks, t) {
      return blocks.map((block, index) => {
        const key = `b${index}`
        switch (block.type) {
          case 'heading': {
            const tag = `h${Math.min(6, Math.max(1, block.level))}`
            return h(tag, { key }, renderInline(block.text, key))
          }
          case 'paragraph':
            return h('p', { key }, renderInline(block.text, key))
          case 'code':
            return h(CodeBlock, { key, language: block.language, text: block.text, t })
          case 'hr':
            return h('hr', { key })
          case 'quote':
            return h('blockquote', { key }, renderInline(block.text, key))
          case 'list':
            return renderList(block, key, t)
          case 'table':
            return renderTable(block, key, t)
          default:
            return null
        }
      })
    }

    function Markdown({ text, t }) {
      const blocks = useMemo(() => parseBlocks(text), [text])
      return h('div', { className: 'dsh-btw-md' }, renderBlocks(blocks, t))
    }

    // -----------------------------------------------------------------------
    // Icons and shared bits
    // -----------------------------------------------------------------------

    function BtwGlyph({ size }) {
      const dimension = typeof size === 'number' ? size : 16
      return h(
        'svg',
        { width: dimension, height: dimension, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true },
        h('path', {
          d: 'M4.5 11.2c0-3.7 3.3-6.7 7.5-6.7s7.5 3 7.5 6.7-3.3 6.7-7.5 6.7c-.7 0-1.4-.1-2-.2L5.5 20l1-3.2a6.5 6.5 0 0 1-2-5.6Z',
          stroke: 'currentColor',
          strokeWidth: 1.6,
          strokeLinejoin: 'round',
        }),
        h('circle', { cx: 9, cy: 11.2, r: 1, fill: 'currentColor' }),
        h('circle', { cx: 12, cy: 11.2, r: 1, fill: 'currentColor' }),
        h('circle', { cx: 15, cy: 11.2, r: 1, fill: 'currentColor' }),
      )
    }

    function Spinner() {
      return h('span', { className: 'dsh-btw-spinner', 'aria-hidden': true })
    }

    function EmptyState({ title, hint, action }) {
      return h(
        'div',
        { className: 'dsh-btw-empty' },
        h(BtwGlyph, { size: 30 }),
        h('div', { className: 'dsh-btw-empty-title' }, title),
        hint === undefined ? null : h('div', { className: 'dsh-btw-empty-hint' }, hint),
        action === undefined ? null : action,
      )
    }

    // -----------------------------------------------------------------------
    // Composer button
    // -----------------------------------------------------------------------

    function BtwOpenButton(props) {
      const { t, open } = props
      return h(
        React.Fragment,
        null,
        h('style', { key: 'btw-css' }, CSS),
        h(
          'button',
          {
            key: 'btw-open',
            type: 'button',
            className: 'dsh-btw-open',
            onClick: open,
            title: t('openHint'),
            'aria-label': t('title'),
          },
          h(BtwGlyph, { size: 14 }),
          h('span', null, 'BTW'),
        ),
      )
    }

    // -----------------------------------------------------------------------
    // Floating panel
    // -----------------------------------------------------------------------

    function BtwOverlay(props) {
      const { t, useBtw, actions } = props
      const safeUseSessions = typeof props.useSessions === 'function' ? props.useSessions : null
      const safeUseStatus = typeof props.useSessionStatus === 'function' ? props.useSessionStatus : null
      const state = useBtw((snapshot) => snapshot)
      const sessions = safeUseSessions === null ? null : safeUseSessions((snapshot) => snapshot)
      const statuses = safeUseStatus === null ? null : safeUseStatus((snapshot) => snapshot)
      const textarea = useRef(null)
      const scroller = useRef(null)
      const [copied, setCopied] = useState(false)
      const [count, setCount] = useState(null)
      const [now, setNow] = useState(Date.now())
      const sid = state.sessionId
      const title =
        sid !== null && sessions !== null && sessions.byId[sid] !== undefined
          ? sessions.byId[sid].displayTitle
          : sid ?? ''
      const running = sid !== null && statuses !== null ? statuses.get(sid)?.running : undefined
      const streaming = state.phase === 'streaming'
      const canSend = state.question.trim() !== '' && !streaming && sid !== null
      const truncated =
        state.phase === 'done' &&
        isTruncated({ truncated: state.truncated, usage: state.usage }, state.maxTokens)

      useEffect(() => {
        if (state.open) actions.ensureMeta()
      }, [state.open, actions])

      useEffect(() => {
        if (!state.open) return undefined
        const timer = window.setTimeout(() => textarea.current?.focus(), 30)
        return () => window.clearTimeout(timer)
      }, [state.open, state.sessionId])

      useEffect(() => {
        if (!state.open) return
        if (scroller.current !== null) scroller.current.scrollTop = scroller.current.scrollHeight
      }, [state.open, state.answer, state.reasoning, state.phase])

      useEffect(() => {
        if (!state.open) return undefined
        const onKeyDown = (event) => {
          if (event.key === 'Escape') {
            event.stopPropagation()
            actions.close()
          }
        }
        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
      }, [state.open, actions])

      useEffect(() => {
        if (!state.open || sid === null) return undefined
        let cancelled = false
        api
          .sessions()
          .then((payload) => {
            if (cancelled) return
            const row = Array.isArray(payload?.sessions)
              ? payload.sessions.find((candidate) => candidate.sessionId === sid)
              : undefined
            setCount(row === undefined ? 0 : row.count)
          })
          .catch(() => {
            if (!cancelled) setCount(null)
          })
        return () => {
          cancelled = true
        }
      }, [state.open, sid, state.revision])

      useEffect(() => {
        if (!streaming) return undefined
        const timer = window.setInterval(() => setNow(Date.now()), 500)
        return () => window.clearInterval(timer)
      }, [streaming])

      useEffect(() => {
        if (!copied) return undefined
        const timer = window.setTimeout(() => setCopied(false), 1400)
        return () => window.clearTimeout(timer)
      }, [copied])

      if (!state.open) return null

      const elapsed = streaming ? Math.max(0, now - state.startedAt) : state.elapsedMs
      const inputTokens = state.usage?.inputTokens
      const outputTokens = state.usage?.outputTokens
      const copyAnswer = () => {
        try {
          void navigator.clipboard?.writeText(state.answer)
        } catch {
          // Clipboard permission is browser-owned.
        }
        setCopied(true)
      }
      const onKeyDown = (event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
          event.preventDefault()
          if (canSend) actions.submit()
          return
        }
        if (event.key === 'Escape') {
          event.preventDefault()
          actions.close()
        }
      }

      return h(
        'div',
        { className: 'dsh-btw-overlay' },
        h('style', null, CSS),
        h(
          'section',
          { className: 'dsh-btw-card', role: 'dialog', 'aria-label': t('title'), 'aria-modal': 'false' },
          h(
            'header',
            { className: 'dsh-btw-head' },
            h(BtwGlyph, { size: 15 }),
            h('span', { className: 'dsh-btw-head-title' }, t('title')),
            sid === null
              ? null
              : h(
                  'span',
                  { className: 'dsh-btw-state', title: running === true ? t('sessionRunning') : t('sessionIdle') },
                  h('span', { className: running === true ? 'dsh-btw-dot is-running' : 'dsh-btw-dot' }),
                  running === true ? t('sessionRunning') : t('sessionIdle'),
                ),
            h('span', { className: 'dsh-btw-spacer' }),
            sid === null ? null : h('span', { className: 'dsh-btw-session', title }, title),
            h(
              'button',
              { type: 'button', className: 'dsh-btw-icon-btn', onClick: actions.close, title: t('close'), 'aria-label': t('close') },
              '✕',
            ),
          ),
          h(
            'div',
            { className: 'dsh-btw-ask' },
            h('textarea', {
              ref: textarea,
              value: state.question,
              placeholder: t('placeholder'),
              rows: 3,
              spellCheck: false,
              onChange: (event) => actions.setQuestion(event.target.value),
              onKeyDown,
              'aria-label': t('placeholder'),
            }),
            h(
              'button',
              {
                type: 'button',
                className: streaming ? 'dsh-btw-btn danger' : 'dsh-btw-btn primary',
                onClick: streaming ? actions.stop : actions.submit,
                disabled: !streaming && !canSend,
              },
              streaming ? t('stop') : t('send'),
            ),
          ),
          h(
            'div',
            { className: 'dsh-btw-answer', ref: scroller },
            state.error === null
              ? null
              : h(
                  'div',
                  { className: 'dsh-btw-error', role: 'alert' },
                  h('span', null, errorLabel(t, state.error)),
                  h(
                    'button',
                    { type: 'button', className: 'dsh-btw-link', onClick: actions.submit },
                    t('retry'),
                  ),
                ),
            state.reasoning === ''
              ? null
              : h(
                  'details',
                  { className: 'dsh-btw-think' },
                  h('summary', null, streaming && state.answer === '' ? t('thinkingLive') : t('thinking')),
                  h('pre', null, state.reasoning),
                ),
            state.answer === ''
              ? streaming
                ? h(
                    'div',
                    { className: 'dsh-btw-loading' },
                    h(Spinner),
                    h('span', null, state.reasoning === '' ? t('thinkingLive') : t('streaming')),
                  )
                : h('div', { className: 'dsh-btw-hintline' }, t('empty'))
              : h(Markdown, { text: state.answer, t }),
            streaming && state.answer !== '' ? h('span', { className: 'dsh-btw-caret' }) : null,
            truncated
              ? h(
                  'div',
                  { className: 'dsh-btw-warn', role: 'status' },
                  h('div', null, t('truncatedNotice')),
                  h(
                    'div',
                    { className: 'dsh-btw-warn-hint' },
                    t('truncatedHint'),
                  ),
                  h(
                    'button',
                    { type: 'button', className: 'dsh-btw-link', onClick: actions.submit },
                    t('retry'),
                  ),
                )
              : null,
          ),
          h(
            'footer',
            { className: 'dsh-btw-foot' },
            state.model !== null && typeof state.model.model === 'string'
              ? h('span', { className: 'dsh-btw-chip' }, state.model.model)
              : null,
            elapsed > 0 ? h('span', null, `${t('elapsed')} ${formatElapsed(elapsed)}`) : null,
            inputTokens !== undefined || outputTokens !== undefined
              ? h('span', null, `${t('tokens')} ${inputTokens ?? 0} → ${outputTokens ?? 0}`)
              : null,
            state.context === null
              ? null
              : h(
                  'span',
                  { title: state.context.truncated ? t('truncated') : undefined },
                  t('contextValue', { messages: state.context.messages, chars: state.context.chars }),
                ),
            h('span', { className: 'dsh-btw-spacer' }),
            h(
              'button',
              {
                type: 'button',
                className: 'dsh-btw-link',
                onClick: () => actions.showHistory(sid),
              },
              count === null ? t('history') : t('historyCount', { count }),
            ),
            state.answer === ''
              ? null
              : h(
                  'button',
                  { type: 'button', className: 'dsh-btw-link', onClick: copyAnswer },
                  copied ? t('copied') : t('copy'),
                ),
          ),
        ),
      )
    }

    // -----------------------------------------------------------------------
    // History page
    // -----------------------------------------------------------------------

    function statusLabel(t, status) {
      if (status === 'done') return t('statusDone')
      if (status === 'stopped') return t('statusStopped')
      if (status === 'error') return t('statusError')
      if (status === 'running') return t('statusRunning')
      return status ?? ''
    }

    function BtwHistoryPage(props) {
      const { t, useBtw, actions } = props
      const safeUseSessions = typeof props.useSessions === 'function' ? props.useSessions : null
      const btw = useBtw((snapshot) => snapshot)
      const sessions = safeUseSessions === null ? null : safeUseSessions((snapshot) => snapshot)
      const [listState, setListState] = useState({ status: 'idle', entries: [], total: 0, error: null })
      const [detailState, setDetailState] = useState({ status: 'idle', entry: null, error: null })
      const [historyRows, setHistoryRows] = useState([])
      const [query, setQuery] = useState('')
      const [confirmDelete, setConfirmDelete] = useState(null)
      const [confirmClear, setConfirmClear] = useState(false)
      const [busy, setBusy] = useState(false)
      const [notice, setNotice] = useState(null)
      const selectedRef = useRef(btw.historySelectedId)
      const target = btw.historySessionId
      const selectedId = btw.historySelectedId

      selectedRef.current = selectedId

      const titleOf = (sessionId) => {
        if (sessions !== null && sessions.byId[sessionId] !== undefined) return sessions.byId[sessionId].displayTitle
        return sessionId
      }

      useEffect(() => {
        actions.ensureMeta()
      }, [actions])

      useEffect(() => {
        let cancelled = false
        api
          .sessions()
          .then((payload) => {
            if (cancelled) return
            setHistoryRows(Array.isArray(payload?.sessions) ? payload.sessions : [])
          })
          .catch(() => {
            if (!cancelled) setHistoryRows([])
          })
        return () => {
          cancelled = true
        }
      }, [btw.revision])

      useEffect(() => {
        if ((target === null || target === '') && historyRows.length > 0) {
          actions.setHistorySession(historyRows[0].sessionId)
        }
      }, [historyRows, target, actions])

      useEffect(() => {
        if (target === null || target === '') {
          setListState({ status: 'empty', entries: [], total: 0, error: null })
          return undefined
        }
        let cancelled = false
        setListState((current) => (current.status === 'ready' ? current : { status: 'loading', entries: [], total: 0, error: null }))
        api
          .list(target)
          .then((payload) => {
            if (cancelled) return
            const entries = Array.isArray(payload?.entries) ? payload.entries : []
            setListState({ status: 'ready', entries, total: Number.isFinite(payload?.total) ? payload.total : entries.length, error: null })
            if (selectedRef.current === null && entries.length > 0) actions.selectHistoryEntry(entries[0].id)
          })
          .catch((error) => {
            if (!cancelled) setListState({ status: 'error', entries: [], total: 0, error })
          })
        return () => {
          cancelled = true
        }
      }, [target, btw.revision, actions])

      useEffect(() => {
        if (target === null || target === '' || selectedId === null) {
          setDetailState({ status: 'idle', entry: null, error: null })
          return undefined
        }
        let cancelled = false
        setDetailState({ status: 'loading', entry: null, error: null })
        api
          .entry(target, selectedId)
          .then((payload) => {
            if (cancelled) return
            setDetailState({ status: 'ready', entry: payload?.entry ?? null, error: null })
          })
          .catch((error) => {
            if (!cancelled) setDetailState({ status: 'error', entry: null, error })
          })
        return () => {
          cancelled = true
        }
      }, [target, selectedId, btw.revision])

      useEffect(() => {
        if (notice === null) return undefined
        const timer = window.setTimeout(() => setNotice(null), 2200)
        return () => window.clearTimeout(timer)
      }, [notice])

      const filtered = useMemo(() => {
        const needle = query.trim().toLowerCase()
        if (needle === '') return listState.entries
        return listState.entries.filter(
          (entry) =>
            String(entry.question ?? '').toLowerCase().includes(needle) ||
            String(entry.answerPreview ?? '').toLowerCase().includes(needle),
        )
      }, [listState.entries, query])

      const entry = detailState.entry
      const total = listState.total ?? listState.entries.length
      const copy = (value) => {
        try {
          void navigator.clipboard?.writeText(value)
        } catch {
          // Clipboard permission is browser-owned.
        }
        setNotice(t('copied'))
      }
      const removeEntry = async (id) => {
        if (target === null || busy) return
        setBusy(true)
        try {
          await api.remove(target, id)
          if (selectedRef.current === id) actions.selectHistoryEntry(null)
          setConfirmDelete(null)
          actions.bumpRevision()
        } catch (error) {
          setNotice(errorLabel(t, error))
        } finally {
          setBusy(false)
        }
      }
      const clearSession = async () => {
        if (target === null || busy) return
        setBusy(true)
        try {
          await api.clear(target)
          actions.selectHistoryEntry(null)
          setConfirmClear(false)
          actions.bumpRevision()
        } catch (error) {
          setNotice(errorLabel(t, error))
        } finally {
          setBusy(false)
        }
      }

      const header = h(
        'header',
        { className: 'dsh-btw-page-head' },
        h(BtwGlyph, { size: 18 }),
        h(
          'div',
          { className: 'dsh-btw-page-title' },
          h('div', { className: 'dsh-btw-page-name' }, t('historyTitle')),
          h('div', { className: 'dsh-btw-page-sub' }, t('historySubtitle', { count: total })),
        ),
        h('span', { className: 'dsh-btw-spacer' }),
        historyRows.length === 0
          ? null
          : h(
              'label',
              { className: 'dsh-btw-field' },
              h('span', null, t('selectSession')),
              h(
                'select',
                {
                  className: 'dsh-btw-select',
                  value: target ?? '',
                  onChange: (event) => actions.setHistorySession(event.target.value),
                },
                historyRows.map((row) =>
                  h('option', { key: row.sessionId, value: row.sessionId }, `${titleOf(row.sessionId)} (${row.count})`),
                ),
              ),
            ),
        h('input', {
          className: 'dsh-btw-input',
          value: query,
          placeholder: t('search'),
          onChange: (event) => setQuery(event.target.value),
          'aria-label': t('search'),
        }),
        h(
          'button',
          { type: 'button', className: 'dsh-btw-btn', onClick: actions.refresh, title: t('refresh') },
          t('refresh'),
        ),
        confirmClear
          ? h(
              'span',
              { className: 'dsh-btw-confirm' },
              h(
                'button',
                { type: 'button', className: 'dsh-btw-btn danger', onClick: clearSession, disabled: busy },
                t('clearConfirm'),
              ),
              h('button', { type: 'button', className: 'dsh-btw-btn', onClick: () => setConfirmClear(false) }, t('cancel')),
            )
          : h(
              'button',
              {
                type: 'button',
                className: 'dsh-btw-btn',
                onClick: () => setConfirmClear(true),
                disabled: target === null || total === 0,
              },
              t('clear'),
            ),
        h(
          'button',
          { type: 'button', className: 'dsh-btw-btn', onClick: actions.backToChat },
          t('backToChat'),
        ),
      )

      const list = h(
        'div',
        { className: 'dsh-btw-list', role: 'list' },
        listState.status === 'loading'
          ? h('div', { className: 'dsh-btw-list-note' }, h(Spinner), t('loading'))
          : listState.status === 'error'
            ? h(
                'div',
                { className: 'dsh-btw-list-note is-error' },
                errorLabel(t, listState.error),
                h('button', { type: 'button', className: 'dsh-btw-link', onClick: actions.refresh }, t('retry')),
              )
            : listState.status === 'empty' || filtered.length === 0
              ? h('div', { className: 'dsh-btw-list-note' }, query.trim() === '' ? t('noHistory') : t('noResults'))
              : filtered.map((item) =>
                  h(
                    'button',
                    {
                      key: item.id,
                      type: 'button',
                      className: item.id === selectedId ? 'dsh-btw-item is-active' : 'dsh-btw-item',
                      onClick: () => actions.selectHistoryEntry(item.id),
                      role: 'listitem',
                    },
                    h('div', { className: 'dsh-btw-item-question' }, item.question),
                    h(
                      'div',
                      { className: 'dsh-btw-item-meta' },
                      h('span', null, formatTime(item.createdAt)),
                      h('span', { className: `dsh-btw-status is-${item.status}` }, statusLabel(t, item.status)),
                      item.model !== undefined && item.model !== null
                        ? h('span', { className: 'dsh-btw-item-model' }, item.model.model)
                        : null,
                      h('span', null, t('chars', { count: item.answerChars ?? 0 })),
                      isTruncated(item, btw.maxTokens)
                        ? h('span', { className: 'dsh-btw-chip is-warn' }, t('truncatedBadge'))
                        : null,
                    ),
                  ),
                ),
      )

      const detailBody = (() => {
        if (detailState.status === 'loading') {
          return h('div', { className: 'dsh-btw-detail-note' }, h(Spinner), t('loading'))
        }
        if (detailState.status === 'error') {
          return h(
            'div',
            { className: 'dsh-btw-detail-note is-error' },
            errorLabel(t, detailState.error),
            h('button', { type: 'button', className: 'dsh-btw-link', onClick: actions.refresh }, t('retry')),
          )
        }
        if (entry === null || entry === undefined) {
          return h(EmptyState, { title: t('noHistory'), hint: target === null ? t('noHistoryHint') : t('emptyDetail') })
        }
        return h(
          React.Fragment,
          null,
          h('h1', { className: 'dsh-btw-detail-question' }, entry.question),
          h(
            'div',
            { className: 'dsh-btw-meta' },
            h('span', null, formatTime(entry.createdAt)),
            h('span', { className: `dsh-btw-status is-${entry.status}` }, statusLabel(t, entry.status)),
            entry.model !== undefined && entry.model !== null ? h('span', { className: 'dsh-btw-chip' }, entry.model.model) : null,
            typeof entry.elapsedMs === 'number' ? h('span', null, `${t('elapsed')} ${formatElapsed(entry.elapsedMs)}`) : null,
            entry.usage !== undefined && entry.usage !== null && formatTokens(entry.usage) !== ''
              ? h('span', null, `${t('tokens')} ${formatTokens(entry.usage)}`)
              : null,
            entry.context !== undefined && entry.context !== null
              ? h(
                  'span',
                  { title: entry.context.truncated ? t('truncated') : undefined },
                  t('contextValue', { messages: entry.context.messages, chars: entry.context.chars }),
                )
              : null,
            isTruncated(entry, btw.maxTokens)
              ? h('span', { className: 'dsh-btw-chip is-warn' }, t('truncatedBadge'))
              : null,
          ),
          entry.error !== undefined && entry.error !== null
            ? h('div', { className: 'dsh-btw-error', role: 'alert' }, errorLabel(t, entry.error))
            : null,
          h('div', { className: 'dsh-btw-detail-actions' },
            h(
              'button',
              { type: 'button', className: 'dsh-btw-btn', onClick: () => actions.openAsk(target, entry.question) },
              t('again'),
            ),
            h('button', { type: 'button', className: 'dsh-btw-btn', onClick: () => copy(entry.answer) }, t('copyAnswer')),
            h(
              'button',
              {
                type: 'button',
                className: 'dsh-btw-btn',
                onClick: () => copy(`## ${entry.question}\n\n${entry.answer}\n`),
              },
              t('copyQA'),
            ),
            confirmDelete === entry.id
              ? h(
                  React.Fragment,
                  null,
                  h(
                    'button',
                    { type: 'button', className: 'dsh-btw-btn danger', onClick: () => removeEntry(entry.id), disabled: busy },
                    t('deleteConfirm'),
                  ),
                  h('button', { type: 'button', className: 'dsh-btw-btn', onClick: () => setConfirmDelete(null) }, t('cancel')),
                )
              : h(
                  'button',
                  { type: 'button', className: 'dsh-btw-btn', onClick: () => setConfirmDelete(entry.id) },
                  t('delete'),
                ),
            h(
              'button',
              {
                type: 'button',
                className: 'dsh-btw-btn dsh-btw-back',
                onClick: () => actions.selectHistoryEntry(null),
              },
              t('back'),
            ),
          ),
          entry.reasoning !== undefined && entry.reasoning !== ''
            ? h('details', { className: 'dsh-btw-think' }, h('summary', null, t('thinking')), h('pre', null, entry.reasoning))
            : null,
          entry.answer === ''
            ? h('div', { className: 'dsh-btw-detail-note' }, t('errorEmptyAnswer'))
            : h(Markdown, { text: entry.answer, t }),
          isTruncated(entry, btw.maxTokens)
            ? h(
                'div',
                { className: 'dsh-btw-warn', role: 'status' },
                h('div', null, t('truncatedNotice')),
                h(
                  'div',
                  { className: 'dsh-btw-warn-hint' },
                  t('truncatedHint'),
                ),
              )
            : null,
        )
      })()

      const body =
        target === null || target === ''
          ? h(
              'div',
              { className: 'dsh-btw-page-blank' },
              h(EmptyState, {
                title: t('noHistory'),
                hint: t('noHistoryHint'),
              }),
            )
          : h(
              'div',
              { className: selectedId === null ? 'dsh-btw-page-body' : 'dsh-btw-page-body is-detail' },
              list,
              h('div', { className: 'dsh-btw-detail' }, detailBody),
            )

      return h(
        'div',
        { className: 'dsh-btw-page' },
        h('style', null, CSS),
        header,
        body,
        notice === null ? null : h('div', { className: 'dsh-btw-toast' }, notice),
      )
    }

    function BtwPanelIcon({ size }) {
      return h(BtwGlyph, { size })
    }

    function BtwCommandRow() {
      return null
    }

    // -----------------------------------------------------------------------
    // Styles
    // -----------------------------------------------------------------------

    const CSS = `
.dsh-btw-open{display:inline-flex;align-items:center;gap:5px;height:28px;padding:0 8px;border-radius:8px;border:1px solid transparent;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11.5px;font-weight:650;letter-spacing:.03em;cursor:pointer;transition:background .12s,color .12s}
.dsh-btw-open:hover{background:color-mix(in srgb,var(--dsw-alias-label-primary) 7%,transparent);color:var(--dsw-alias-label-primary)}
.dsh-btw-open:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.dsh-btw-spacer{flex:1 1 auto;min-width:0}
.dsh-btw-overlay{position:fixed;right:20px;bottom:20px;z-index:900;display:flex;align-items:flex-end;justify-content:flex-end;pointer-events:none;font-size:13px;line-height:1.5;color:var(--dsw-alias-label-primary)}
.dsh-btw-card{pointer-events:auto;display:flex;flex-direction:column;width:min(586px,calc(100vw - 32px));max-height:min(74vh,740px);background:var(--dsw-alias-bg-overlay);border:1px solid var(--dsw-alias-border-l1);border-radius:14px;box-shadow:0 18px 48px color-mix(in srgb,var(--dsw-alias-label-primary) 18%,transparent);overflow:hidden}
.dsh-btw-head{display:flex;align-items:center;gap:7px;padding:9px 10px 9px 12px;border-bottom:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary)}
.dsh-btw-head-title{font-size:12.5px;font-weight:650;color:var(--dsw-alias-label-primary);letter-spacing:.01em}
.dsh-btw-state{display:inline-flex;align-items:center;gap:5px;font-size:11px;color:var(--dsw-alias-label-secondary)}
.dsh-btw-dot{width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-state-idle-primary)}
.dsh-btw-dot.is-running{background:var(--dsw-alias-brand-primary);animation:dsh-btw-pulse 1.4s ease-in-out infinite}
@keyframes dsh-btw-pulse{50%{opacity:.3}}
.dsh-btw-session{max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;color:var(--dsw-alias-label-secondary)}
.dsh-btw-icon-btn{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border:0;border-radius:7px;background:transparent;color:var(--dsw-alias-label-secondary);font-size:12px;cursor:pointer}
.dsh-btw-icon-btn:hover{background:color-mix(in srgb,var(--dsw-alias-label-primary) 8%,transparent);color:var(--dsw-alias-label-primary)}
.dsh-btw-ask{display:flex;align-items:flex-end;gap:8px;padding:10px 12px;border-bottom:1px solid var(--dsw-alias-border-l1)}
.dsh-btw-ask textarea{flex:1 1 auto;min-height:58px;max-height:170px;resize:none;padding:8px 10px;border-radius:10px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;line-height:1.55;outline:none}
.dsh-btw-ask textarea:focus{border-color:var(--dsw-alias-brand-primary)}
.dsh-btw-ask textarea::placeholder{color:var(--dsw-alias-label-secondary)}
.dsh-btw-btn{display:inline-flex;align-items:center;justify-content:center;gap:5px;height:28px;padding:0 10px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;cursor:pointer;white-space:nowrap}
.dsh-btw-btn:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2)}
.dsh-btw-btn:disabled{opacity:.45;cursor:not-allowed}
.dsh-btw-btn.primary{color:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);background:color-mix(in srgb,var(--dsw-alias-brand-primary) 10%,transparent)}
.dsh-btw-btn.danger{color:var(--dsw-alias-state-error-primary);border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary) 45%,var(--dsw-alias-border-l1))}
.dsh-btw-answer{flex:1 1 auto;min-height:96px;max-height:46vh;overflow:auto;padding:12px 14px;scrollbar-width:thin}
.dsh-btw-answer:empty{display:none}
.dsh-btw-foot{display:flex;align-items:center;gap:9px;flex-wrap:wrap;padding:8px 12px;border-top:1px solid var(--dsw-alias-border-l1);font-size:11px;color:var(--dsw-alias-label-secondary)}
.dsh-btw-chip{display:inline-flex;align-items:center;height:19px;padding:0 7px;border-radius:999px;border:1px solid var(--dsw-alias-border-l1);font-size:11px;color:var(--dsw-alias-label-secondary);white-space:nowrap}
.dsh-btw-link{border:0;background:transparent;color:var(--dsw-alias-brand-primary);font:inherit;font-size:11px;cursor:pointer;padding:0}
.dsh-btw-link:hover{text-decoration:underline}
.dsh-btw-hintline{font-size:12px;color:var(--dsw-alias-label-secondary);padding:6px 0}
.dsh-btw-loading{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--dsw-alias-label-secondary);padding:6px 0}
.dsh-btw-spinner{display:inline-block;width:12px;height:12px;border-radius:50%;border:2px solid color-mix(in srgb,var(--dsw-alias-label-secondary) 30%,transparent);border-top-color:var(--dsw-alias-brand-primary);animation:dsh-btw-spin .8s linear infinite}
@keyframes dsh-btw-spin{to{transform:rotate(360deg)}}
.dsh-btw-caret{display:inline-block;width:7px;height:14px;margin-left:2px;vertical-align:-2px;background:var(--dsw-alias-brand-primary);animation:dsh-btw-blink 1s steps(2) infinite}
@keyframes dsh-btw-blink{50%{opacity:0}}
.dsh-btw-error{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:8px 10px;margin:0 0 10px;border-radius:9px;border:1px solid color-mix(in srgb,var(--dsw-alias-state-error-primary) 40%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 9%,transparent);color:var(--dsw-alias-state-error-primary);font-size:12px}
.dsh-btw-warn{margin:10px 0 2px;padding:9px 11px;border-radius:9px;border:1px solid color-mix(in srgb,var(--dsw-alias-state-warn-primary) 45%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 9%,transparent);color:var(--dsw-alias-label-primary);font-size:12px;line-height:1.55}
.dsh-btw-warn-hint{color:var(--dsw-alias-label-secondary);margin-top:3px}
.dsh-btw-chip.is-warn{color:var(--dsw-alias-state-warn-primary);border-color:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 45%,transparent)}
.dsh-btw-think{margin:0 0 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:9px;background:var(--dsw-alias-bg-layer-1)}
.dsh-btw-think>summary{padding:6px 10px;font-size:11px;color:var(--dsw-alias-label-secondary);cursor:pointer;list-style:none}
.dsh-btw-think>summary::-webkit-details-marker{display:none}
.dsh-btw-think>summary:before{content:'▸';display:inline-block;margin-right:5px;transition:transform .12s}
.dsh-btw-think[open]>summary:before{transform:rotate(90deg)}
.dsh-btw-think>pre{margin:0;padding:0 10px 9px;white-space:pre-wrap;word-break:break-word;font:11.5px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--dsw-alias-label-secondary);max-height:240px;overflow:auto}
.dsh-btw-md{font-size:13.5px;line-height:1.68;color:var(--dsw-alias-label-primary);overflow-wrap:anywhere}
.dsh-btw-md>*:first-child{margin-top:0}
.dsh-btw-md>*:last-child{margin-bottom:0}
.dsh-btw-md h1,.dsh-btw-md h2,.dsh-btw-md h3,.dsh-btw-md h4,.dsh-btw-md h5,.dsh-btw-md h6{margin:1em 0 .45em;font-weight:650;line-height:1.35}
.dsh-btw-md h1{font-size:18px}
.dsh-btw-md h2{font-size:16px}
.dsh-btw-md h3{font-size:14.5px}
.dsh-btw-md h4,.dsh-btw-md h5,.dsh-btw-md h6{font-size:13.5px}
.dsh-btw-md p{margin:.55em 0}
.dsh-btw-md ul,.dsh-btw-md ol{margin:.5em 0;padding-left:1.4em}
.dsh-btw-md li{margin:.2em 0}
.dsh-btw-md li>ul,.dsh-btw-md li>ol{margin:.2em 0}
.dsh-btw-md blockquote{margin:.65em 0;padding:.1em 0 .1em .8em;border-left:2px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary)}
.dsh-btw-md hr{border:0;border-top:1px solid var(--dsw-alias-border-l1);margin:1em 0}
.dsh-btw-md a{color:var(--dsw-alias-brand-primary);text-decoration:none}
.dsh-btw-md a:hover{text-decoration:underline}
.dsh-btw-inline-code{padding:.1em .35em;border-radius:5px;background:var(--dsw-alias-bg-layer-2);font:12px ui-monospace,SFMono-Regular,Menlo,monospace}
.dsh-btw-code{margin:.7em 0;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;overflow:hidden;background:var(--dsw-alias-bg-layer-1)}
.dsh-btw-code-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:4px 9px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-size:10.5px;text-transform:lowercase}
.dsh-btw-code-copy{border:0;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11px;cursor:pointer;padding:0 2px}
.dsh-btw-code-copy:hover{color:var(--dsw-alias-label-primary)}
.dsh-btw-code pre{margin:0;padding:10px 12px;overflow:auto;font:12px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;scrollbar-width:thin}
.dsh-btw-table-wrap{margin:.7em 0;overflow:auto}
.dsh-btw-table-wrap table{border-collapse:collapse;font-size:12.5px;min-width:100%}
.dsh-btw-table-wrap th,.dsh-btw-table-wrap td{border:1px solid var(--dsw-alias-border-l1);padding:5px 8px;text-align:left;vertical-align:top}
.dsh-btw-table-wrap th{background:var(--dsw-alias-bg-layer-2);font-weight:600}
.dsh-btw-open:focus-visible,.dsh-btw-btn:focus-visible,.dsh-btw-icon-btn:focus-visible,.dsh-btw-link:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.dsh-btw-item:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}
.dsh-btw-page{position:relative;display:flex;flex-direction:column;height:100%;min-height:0;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:13px}
.dsh-btw-page-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:22px clamp(20px,3vw,32px) 14px;border-bottom:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary)}
[data-platform=darwin] .dsh-btw-page-head{padding-top:calc(22px + var(--dsh-frame-top-clearance,0px))}
.dsh-btw-page-title{min-width:0}
.dsh-btw-page-name{font-size:20px;font-weight:500;line-height:28px;color:var(--dsw-alias-label-primary)}
.dsh-btw-page-sub{font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary);margin-top:2px}
.dsh-btw-field{display:inline-flex;align-items:center;gap:6px;font-size:11px;color:var(--dsw-alias-label-secondary)}
.dsh-btw-select,.dsh-btw-input{height:28px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;padding:0 8px;outline:none;max-width:300px}
.dsh-btw-select:focus,.dsh-btw-input:focus{border-color:var(--dsw-alias-brand-primary)}
.dsh-btw-input{width:190px}
.dsh-btw-confirm{display:inline-flex;gap:6px}
.dsh-btw-page-body{flex:1 1 auto;min-height:0;display:grid;grid-template-columns:320px minmax(0,1fr)}
.dsh-btw-page-blank{flex:1 1 auto;display:flex;align-items:center;justify-content:center;padding:32px}
.dsh-btw-list{min-height:0;overflow:auto;border-right:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);scrollbar-width:thin}
.dsh-btw-list-note{display:flex;align-items:center;gap:8px;padding:18px 16px;font-size:12px;color:var(--dsw-alias-label-secondary)}
.dsh-btw-list-note.is-error{color:var(--dsw-alias-state-error-primary)}
.dsh-btw-item{display:block;width:100%;text-align:left;border:0;border-bottom:1px solid var(--dsw-alias-border-l1);background:transparent;color:inherit;font:inherit;padding:11px 14px;cursor:pointer}
.dsh-btw-item:hover{background:color-mix(in srgb,var(--dsw-alias-label-primary) 5%,transparent)}
.dsh-btw-item.is-active{background:var(--dsw-alias-bg-layer-1);box-shadow:inset 2px 0 0 var(--dsw-alias-brand-primary)}
.dsh-btw-item-question{font-size:12.5px;line-height:1.45;color:var(--dsw-alias-label-primary);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word}
.dsh-btw-item-meta{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-top:5px;font-size:10.5px;color:var(--dsw-alias-label-secondary)}
.dsh-btw-item-model{max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-btw-status{display:inline-flex;align-items:center;gap:4px;white-space:nowrap}
.dsh-btw-status:before{content:'';width:5px;height:5px;border-radius:50%;background:var(--dsw-alias-state-idle-primary)}
.dsh-btw-status.is-done:before{background:var(--dsw-alias-state-success-primary)}
.dsh-btw-status.is-error:before{background:var(--dsw-alias-state-error-primary)}
.dsh-btw-status.is-running:before{background:var(--dsw-alias-brand-primary)}
.dsh-btw-status.is-stopped:before{background:var(--dsw-alias-state-warn-primary)}
.dsh-btw-detail{min-height:0;overflow:auto;padding:20px 24px 48px;scrollbar-width:thin}
.dsh-btw-detail-question{font-size:17px;font-weight:650;line-height:1.45;margin:0 0 8px;word-break:break-word}
.dsh-btw-meta{display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:11px;color:var(--dsw-alias-label-secondary);margin-bottom:12px}
.dsh-btw-detail-actions{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin:2px 0 14px}
.dsh-btw-detail-note{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--dsw-alias-label-secondary);padding:8px 0}
.dsh-btw-detail-note.is-error{color:var(--dsw-alias-state-error-primary)}
.dsh-btw-empty{display:flex;flex-direction:column;align-items:center;gap:8px;max-width:420px;text-align:center;color:var(--dsw-alias-label-secondary);padding:24px}
.dsh-btw-empty-title{font-size:14px;font-weight:600;color:var(--dsw-alias-label-primary)}
.dsh-btw-empty-hint{font-size:12px;line-height:1.6}
.dsh-btw-toast{position:absolute;right:18px;bottom:18px;padding:7px 12px;border-radius:9px;background:var(--dsw-alias-bg-overlay);border:1px solid var(--dsw-alias-border-l1);box-shadow:0 10px 24px color-mix(in srgb,var(--dsw-alias-label-primary) 14%,transparent);font-size:12px}
.dsh-btw-back{display:none}
@media (max-width:720px){
  .dsh-btw-overlay{left:10px;right:10px;bottom:10px}
  .dsh-btw-card{width:100%;max-height:84vh;border-radius:16px}
  .dsh-btw-answer{max-height:52vh}
}
@media (max-width:900px){
  .dsh-btw-page-body{grid-template-columns:1fr}
  .dsh-btw-page-body .dsh-btw-list{border-right:0}
  .dsh-btw-page-body.is-detail .dsh-btw-list{display:none}
  .dsh-btw-page-body:not(.is-detail) .dsh-btw-detail{display:none}
  .dsh-btw-back{display:inline-flex}
  .dsh-btw-input{width:130px}
  .dsh-btw-page-head{padding:10px 12px}
}
`

    // -----------------------------------------------------------------------
    // Plugin
    // -----------------------------------------------------------------------

    const inject = ['slots', 'locale', 'layout']

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'btw: dictionaries')
      const t = ctx.locale.bind(NS)
      const store = createStore(ctx.layout)
      const actions = {
        close: () => store.close(),
        submit: () => store.submit(),
        stop: () => store.stop(),
        setQuestion: (value) => store.setQuestion(value),
        showHistory: (sessionId) => store.showHistory(sessionId),
        setHistorySession: (sessionId) => store.setHistorySession(sessionId),
        selectHistoryEntry: (id) => store.selectHistoryEntry(id),
        bumpRevision: () => store.bumpRevision(),
        refresh: () => store.bumpRevision(),
        openAsk: (sessionId, question) => store.openAsk(sessionId, question),
        ensureMeta: () => store.ensureMeta(),
        backToChat: () => ctx.layout.selectPanel('conversation'),
      }

      ctx.slots.inject('conversation.input.left', () =>
        ctx.slots.register(
          {
            name: 'conversation.input.left',
            id: 'btw-open',
            order: 14,
            locale: NS,
            inject: (sessionId) => ({ open: () => store.open(sessionId) }),
          },
          BtwOpenButton,
        ),
      )

      ctx.slots.inject('shell.overlay', () =>
        ctx.slots.register(
          {
            name: 'shell.overlay',
            id: 'btw-overlay',
            order: 90,
            locale: NS,
            inject: () => ({ hooks: { btw: store }, actions }),
          },
          BtwOverlay,
        ),
      )

      ctx.slots.inject('main', () =>
        ctx.slots.register(
          {
            name: 'main',
            key: PANEL_ID,
            locale: NS,
            inject: () => ({ hooks: { btw: store }, actions }),
          },
          BtwHistoryPage,
        ),
      )

      ctx.slots.inject('sidebar.panellist', () =>
        ctx.slots.register(
          {
            name: 'sidebar.panellist',
            id: PANEL_ID,
            order: 30,
            label: () => t('panel'),
            locale: NS,
          },
          BtwPanelIcon,
        ),
      )

      ctx.slots.inject('conversation.chat.commandview', () =>
        ctx.slots.register(
          {
            name: 'conversation.chat.commandview',
            key: 'btw',
            locale: NS,
          },
          BtwCommandRow,
        ),
      )

      const commandUi = ctx.get('commandUi')
      if (commandUi !== undefined && typeof commandUi.decorate === 'function') {
        ctx.effect(
          () =>
            commandUi.decorate({
              name: 'btw',
              available: () => true,
              ui: {
                kind: 'action',
                run: (session) => {
                  store.open(session.sessionId)
                },
              },
            }),
          'btw: slash decoration',
        )
      }

      ctx.effect(
        () =>
          ctx.on('command/executed', (sessionId, commandName, result) => {
            if (commandName !== 'btw') return
            if (
              result !== null &&
              typeof result === 'object' &&
              result.kind === 'success' &&
              typeof result.text === 'string' &&
              result.text.trim() !== ''
            ) {
              store.askNow(String(sessionId), result.text.trim())
            } else {
              store.open(String(sessionId))
            }
          }),
        'btw: command result',
      )
    }

    return { inject, apply }
  },
})
