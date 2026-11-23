import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { WorkflowBuilder } from '../src/client.js'

document.body.style.cssText = 'margin:40px;background:#eaf0ec;font-family:system-ui'
const root = document.createElement('div')
document.body.append(root)
const note = document.createElement('p')
note.textContent = '离线界面预览 · 配置仅保存在本次预览内存中 · 不连接真实 DSH 或服务器'
document.body.append(note)
let library = { version: 1, revision: 'preview', workflows: [], templates: [] }
window.fetch = async (_url, options) => {
  if (options.method === 'POST') {
    const body = JSON.parse(options.body)
    const field = body.action.endsWith('workflow') ? 'workflows' : 'templates'
    const itemId = body.item?.id || body.id
    library[field] = library[field].filter(item => body.action === 'delete-group' ? item.groupId !== itemId : item.id !== itemId)
    if (body.item) library[field].push(body.item)
    library.revision = crypto.randomUUID()
  }
  return new Response(JSON.stringify({ ...library, stepPresets: true }))
}
createRoot(root).render(createElement(WorkflowBuilder, {
  sessionId: 'offline-preview', lifetime: new AbortController().signal,
  sessions: { retain: () => ({
    ready: Promise.resolve({ session: {
      beginSubmission: () => ({ requestId: 'preview', abandon() {} }),
      prompt: async () => ({ ok: true, value: { accepted: true } })
    } }), release() {}
  }) }
}))
