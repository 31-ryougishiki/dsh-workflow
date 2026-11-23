import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { LibraryStore } from './store.js'
import { object, invalid } from './model.js'

export const name = 'workflow-builder'
export const inject = ['connection']
export const LIBRARY_PATH = '/api/workflow-builder/library'

export function createHandler(store, lifetime) {
  return async request => {
    try {
      lifetime.throwIfAborted()
      if (request.method === 'GET') return response(await store.read())
      if (request.method !== 'POST') throw invalid('不支持的请求方法', 405)
      if (!request.headers.get('content-type')?.startsWith('application/json')) throw invalid('需要 JSON 请求')
      const text = await request.text()
      lifetime.throwIfAborted()
      request.signal.throwIfAborted()
      if (Buffer.byteLength(text) > 256 * 1024) throw invalid('请求超过 256 KB', 413)
      let body
      try { body = JSON.parse(text) } catch { throw invalid('JSON 格式错误') }
      object(body)
      return response(await store.change(body, AbortSignal.any([lifetime, request.signal])))
    } catch (error) {
      return response({ error: error.message || '操作失败' }, lifetime.aborted ? 503 : (error.status || 500))
    }
  }
}

function response(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } })
}

export function apply(ctx, config = {}) {
  object(config)
  if (config.dataDir !== undefined && (typeof config.dataDir !== 'string' || !config.dataDir.trim())) {
    throw invalid('dataDir 必须是非空路径')
  }
  const path = join(config.dataDir === undefined ? join(homedir(), '.dsh', 'workflow-builder') : resolve(config.dataDir), 'library.json')
  ctx.effect(() => {
    const lifetime = new AbortController()
    const store = new LibraryStore(path)
    // Connection owns authentication, Host/Origin checks and owner-only admission.
    const dispose = ctx.connection.fetch.register({
      path: LIBRARY_PATH, methods: ['GET', 'POST'], requestBody: 'buffered', fetch: createHandler(store, lifetime.signal)
    })
    return async () => {
      lifetime.abort()
      await dispose()
      await store.tail
    }
  }, 'workflow-builder: saved configuration library')
}
