import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, mkdir, mkdtemp } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { LibraryStore } from '../lib/store.js'
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
  const tmp = resolve('artifacts/tests')
  await mkdir(tmp, { recursive: true })
  const store = new LibraryStore(join(await mkdtemp(join(tmp, 'ui-')), 'library.json'))
  let library = await store.read()
  globalThis.fetch = async (_url, options) => {
    if (options.method === 'POST') {
      const body = JSON.parse(options.body)
      assert.equal(body.revision, library.revision)
      library = await store.change(body)
    } else library = await store.read()
    return new Response(JSON.stringify({ ...library, stepPresets: true }))
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
    await act(async () => {
      node.click()
      await store.tail
      await new Promise(resolve => setImmediate(resolve))
    })
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
    await fill('预设名称 1', '服务器 A')
    await click('另存为新预设')
    assert.equal(library.templates.length, 1)
    await fill('配置内容 / 执行说明 1', 'SSH 服务器 B')
    await fill('预设名称 1', '服务器 B')
    await click('另存为新预设')
    const choices = index => [...labelled('步骤 ' + index + ' 的预设').options].map(option => option.text)
    assert.deepEqual(choices(1), ['手动填写', '服务器 A', '服务器 B'])
    assert.deepEqual(choices(2), ['手动填写'])
    await fill('步骤 1 的预设', library.templates[0].id)
    await click('＋ 环境信息')
    await fill('步骤 4 的预设', library.templates[0].id)
    assert.equal(labelled('配置内容 / 执行说明 4').value, library.templates[0].instructions)
    await fill('配置内容 / 执行说明 4', '修改后的配置副本')
    assert.equal(library.templates[0].instructions, 'SSH 别名 demo-server；目录 /work/demo')
    await act(async () => labelled('上移步骤 4').click())
    assert.equal(labelled('配置内容 / 执行说明 3').value, '修改后的配置副本')
    const remove = labelled('删除步骤 3')
    remove.closest('details').open = false
    assert.ok(remove.closest('summary'), '折叠时仍可删除')
    await act(async () => remove.click())
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
    assert.deepEqual(choices(1), ['手动填写', '服务器 A', '服务器 B'])
    assert.equal(labelled('步骤 1 的预设').value, library.templates[0].id)
    await fill('步骤 1 的预设', library.templates[1].id)
    assert.equal(labelled('步骤 1 名称').value, '环境信息')
    await click('交给 DSH 执行')
    assert.match(prompts[1][0][0].text, /SSH 服务器 B/)
    assert.doesNotMatch(prompts[1][0][0].text, /demo-server/)
    await fill('预设名称 2', '推理')
    await click('另存为新预设', 1)
    await act(async () => {
      labelled('删除可复用步骤 环境信息').click()
      await store.tail
      await new Promise(resolve => setImmediate(resolve))
    })
    assert.equal(labelled('删除可复用步骤 环境信息'), null)
    assert.deepEqual(choices(1), ['手动填写'])
    assert.deepEqual(choices(2), ['手动填写', '推理'])
    assert.equal(labelled('配置内容 / 执行说明 1').value, 'SSH 服务器 B')
    assert.equal((await store.read()).workflows[0].steps[0].instructions, 'SSH 别名 demo-server；目录 /work/demo')
    for (let index = 3; index > 0; index--) {
      await act(async () => labelled('删除步骤 ' + index).click())
    }
    await click('保存流程')
    assert.equal((await store.read()).workflows[0].steps.length, 0)
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
