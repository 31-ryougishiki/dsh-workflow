import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { JSDOM } from 'jsdom'

test('真实 client bundle：编辑、模板替换与复制、排序、保存重载、预览及整套发送', async () => {
  const dom = new JSDOM('<div id="app"></div>', { url: 'http://localhost:3080' })
  const previous = { window: globalThis.window, document: globalThis.document, fetch: globalThis.fetch }
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true }
  dom.window.HTMLDialogElement.prototype.close = function () { this.open = false }
  dom.window.confirm = () => true
  const React = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { Simulate } = await import('react-dom/test-utils')
  const { act } = React
  const require = createRequire(import.meta.url)
  let library = { version: 1, revision: 'initial', recovered: false, templates: [], workflows: [] }
  globalThis.fetch = async (_url, options) => {
    if (options.method === 'POST') {
      const body = JSON.parse(options.body)
      assert.equal(body.revision, library.revision)
      const field = body.action.endsWith('template') ? 'templates' : 'workflows'
      library = { ...library, revision: crypto.randomUUID(), [field]: [...library[field].filter(item => item.id !== body.item.id), structuredClone(body.item)] }
    }
    return new Response(JSON.stringify(library))
  }
  let plugin
  runInNewContext(await readFile(new URL('../lib/client.js', import.meta.url), 'utf8'), {
    window: { confirm: () => true, __ModuleLoader__: { load: bundle => { assert.equal(bundle.id, 'dsh-workflow-builder'); plugin = bundle.factory(require) } } },
    document: dom.window.document, crypto, AbortController, AbortSignal,
    fetch: (...args) => globalThis.fetch(...args), console
  })
  // The factory closes over its window; make confirm available without touching DSH globals.
  // Native DOM and React still come from this isolated document.
  const root = createRoot(dom.window.document.getElementById('app'))
  const prompts = []
  const lifetime = new AbortController()
  const props = {
    sessionId: 'test-session', lifetime: lifetime.signal,
    sessions: { retain: id => {
      assert.equal(id, 'test-session')
      return { ready: Promise.resolve({ session: {
        beginSubmission: () => ({ requestId: 'one', abandon() {} }),
        prompt: async (...args) => { prompts.push(args); return { ok: true, value: { accepted: true } } }
      } }), release() {} }
    } }
  }
  const buttons = text => [...dom.window.document.querySelectorAll('button')].filter(node => node.textContent === text)
  const labelled = label => dom.window.document.querySelector('[aria-label="' + label + '"]')
  async function click(text, index = 0) {
    const node = buttons(text)[index]
    assert.ok(node, 'button ' + text)
    assert.equal(node.disabled, false, text + ' enabled')
    await act(async () => { node.click() })
  }
  async function fill(label, value) {
    const node = labelled(label)
    assert.ok(node, label)
    await act(async () => { Simulate.change(node, { target: { value } }) })
  }
  try {
    await act(async () => { root.render(React.createElement(plugin.WorkflowBuilder, props)) })
    await click('流程编排')
    assert.equal(dom.window.document.querySelector('dialog').open, true)
    await fill('配置内容 / 执行说明 1', 'SSH 别名 demo-server；目录 /work/demo')
    await fill('配置内容 / 执行说明 2', '示例模型；FP16；并行数 2')
    await fill('配置内容 / 执行说明 3', '运行性能基准，输出报告')
    await click('存为新配置')
    assert.equal(library.templates.length, 1)
    await click('＋ 空白步骤')
    await fill('步骤 4 使用已保存配置', library.templates[0].id)
    assert.equal(labelled('配置内容 / 执行说明 4').value, library.templates[0].instructions)
    await fill('配置内容 / 执行说明 4', '修改后的配置副本')
    assert.equal(library.templates[0].instructions, 'SSH 别名 demo-server；目录 /work/demo')
    await act(async () => labelled('上移步骤 4').click())
    assert.equal(labelled('配置内容 / 执行说明 3').value, '修改后的配置副本')
    await act(async () => labelled('删除步骤 3').click())
    await click('保存流程')
    assert.equal(library.workflows.length, 1)
    assert.equal(library.workflows[0].steps.length, 3)
    await click('预览')
    const preview = dom.window.document.querySelector('.dwf-preview').textContent
    for (const text of ['demo-server', 'FP16', '性能基准']) assert.ok(preview.includes(text))
    await click('交给 DSH 执行')
    assert.equal(prompts.length, 1)
    assert.equal(prompts[0][0][0].text, preview)
    assert.ok(dom.window.document.querySelector('[role=status]').textContent.includes('已被 DSH 接收'))
    await click('收起')
    assert.equal(dom.window.document.querySelector('dialog').open, false)
    await click('流程编排')
    assert.equal(labelled('配置内容 / 执行说明 2').value, '示例模型；FP16；并行数 2')
    await act(async () => root.unmount())
    const reopened = createRoot(dom.window.document.getElementById('app'))
    await act(async () => reopened.render(React.createElement(plugin.WorkflowBuilder, props)))
    await click('流程编排')
    await click('服务器任务')
    assert.equal(labelled('配置内容 / 执行说明 2').value, '示例模型；FP16；并行数 2')
    await act(async () => reopened.unmount())
  } finally {
    lifetime.abort()
    globalThis.window = previous.window
    globalThis.document = previous.document
    globalThis.fetch = previous.fetch
    delete globalThis.IS_REACT_ACT_ENVIRONMENT
    dom.window.close()
  }
})
