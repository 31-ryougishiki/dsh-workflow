import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile, unlink } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { LibraryStore } from '../lib/store.js'
import { apply, createHandler, LIBRARY_PATH } from '../lib/index.js'
import { compileWorkflow, copyStep, starterFlow } from '../lib/model.js'
import { submitWorkflow } from '../lib/submit.js'

const root = resolve('artifacts/tests')
await mkdir(root, { recursive: true })
const config = (id = 'environment') => ({ id, title: '环境信息', instructions: 'SSH 别名 test-server，工作目录 /work/demo', inputs: '', output: '', completion: '' })
const flow = () => ({ id: 'flow', title: '测试流程', goal: '离线验证', steps: [config(), { ...config('model'), title: '模型配置', instructions: '使用示例模型' }, { ...config('task'), title: '任务配置', instructions: '运行验证并汇总结果' }] })
async function store() {
  return new LibraryStore(join(await mkdtemp(join(root, '配置 test-')), 'library.json'))
}

test('三段配置全部进入一个 prompt，顺序、参数和完成条件保留', () => {
  const source = flow()
  source.steps[2].completion = '准确率达到 90%'
  const text = compileWorkflow(source)
  assert.ok(text.indexOf('环境信息') < text.indexOf('模型配置'))
  assert.ok(text.indexOf('## 配置步骤 2') < text.indexOf('## 配置步骤 3'))
  assert.ok(text.includes('准确率达到 90%'))
  assert.ok(text.includes('不自动变更 DSH'))
  assert.equal(starterFlow(() => 'new').steps.length, 3)
})

test('模板副本修改不污染模板；不接受缺失配置、空数组、重复 ID 或过长输入', () => {
  const template = config()
  const copy = copyStep(template, 'copy')
  copy.instructions = '新的服务器'
  assert.equal(template.instructions, config().instructions)
  assert.equal(copy.templateId, template.id)
  for (const value of [null, [], {}, { ...flow(), steps: [] }, { ...flow(), steps: [config(), config()] }, { ...flow(), steps: [{ ...config(), instructions: '' }] }, { ...flow(), steps: [{ ...config(), instructions: 'x'.repeat(12001) }] }]) {
    assert.throws(() => compileWorkflow(value))
  }
})

test('配置与流程保存、重启读取、修改和删除；流程副本独立于模板', async () => {
  const repository = await store()
  let value = await repository.read()
  value = await repository.change({ action: 'save-template', revision: value.revision, item: config() })
  const snapshot = { ...flow(), steps: [copyStep(value.templates[0], 'snapshot')] }
  value = await repository.change({ action: 'save-workflow', revision: value.revision, item: snapshot })
  value = await repository.change({ action: 'save-template', revision: value.revision, item: { ...config(), instructions: 'changed' } })
  assert.equal(value.workflows[0].steps[0].instructions, config().instructions)
  const reopened = new LibraryStore(repository.path)
  assert.deepEqual(await reopened.read(), value)
  value = await reopened.change({ action: 'delete-template', revision: value.revision, id: config().id })
  assert.equal(value.templates.length, 0)
  assert.equal(value.workflows[0].steps[0].instructions, config().instructions)
  value = await reopened.change({ action: 'delete-workflow', revision: value.revision, id: 'flow' })
  assert.equal(value.workflows.length, 0)
})

test('并发保存同一版本只允许一次成功，失败不覆盖已保存内容', async () => {
  const repository = await store()
  const changes = await Promise.allSettled(['one', 'two'].map(id => repository.change({ action: 'save-template', revision: 'initial', item: config(id) })))
  assert.equal(changes.filter(result => result.status === 'fulfilled').length, 1)
  assert.equal(changes.find(result => result.status === 'rejected').reason.status, 409)
  assert.equal((await repository.read()).templates.length, 1)
  const other = new LibraryStore(repository.path)
  const current = await repository.read()
  const parallel = await Promise.allSettled([repository, other].map((repo, index) => repo.change({ action: 'save-template', revision: current.revision, item: config('parallel-' + index) })))
  assert.equal(parallel.filter(result => result.status === 'fulfilled').length, 1)
})

test('损坏主文件恢复备份，下一次保存不损坏备份；双份损坏显式报错', async () => {
  const repository = await store()
  let value = await repository.change({ action: 'save-template', revision: 'initial', item: config() })
  await repository.change({ action: 'save-template', revision: value.revision, item: config('second') })
  await writeFile(repository.path, '{broken')
  value = await repository.read()
  assert.equal(value.recovered, true)
  assert.equal(value.templates.length, 1)
  await repository.change({ action: 'save-template', revision: value.revision, item: config('third') })
  const backup = JSON.parse(await readFile(repository.path + '.bak', 'utf8'))
  assert.equal(backup.templates[0].id, 'environment')
  await writeFile(repository.path, '{broken')
  await writeFile(repository.path + '.bak', '{broken')
  await assert.rejects(repository.read(), /主文件和备份均不可用/)
})

test('失败写入显式报错且保留原内容，取消后不再保存', async () => {
  const repository = await store()
  const value = await repository.change({ action: 'save-template', revision: 'initial', item: config() })
  await unlink(repository.path + '.bak')
  await mkdir(repository.path + '.bak')
  await assert.rejects(repository.change({ action: 'save-template', revision: value.revision, item: config('second') }))
  assert.deepEqual(await repository.read(), value)
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(repository.change({ action: 'delete-template', revision: value.revision, id: 'environment' }, controller.signal))
  assert.deepEqual(await repository.read(), value)
})

test('HTTP 边界拒绝非对象、非法动作和长输入，不进行写入', async () => {
  let writes = 0
  const repository = await store()
  const original = repository.change.bind(repository)
  repository.change = (...args) => { writes += 1; return original(...args) }
  const lifetime = new AbortController()
  const handler = createHandler(repository, lifetime.signal)
  for (const body of ['null', '[]', '"text"', '{', ' '.repeat(256 * 1024 + 1)]) {
    const response = await handler(new Request('http://localhost' + LIBRARY_PATH, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }))
    assert.ok([400, 413].includes(response.status))
  }
  assert.equal(writes, 0)
  for (const body of [{ revision: 'initial', action: 'unknown' }, { revision: 'initial', action: 'save-template', item: null }]) {
    const response = await handler(new Request('http://localhost' + LIBRARY_PATH, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }))
    assert.equal(response.status, 400)
  }
  assert.equal((await repository.read()).templates.length, 0)
  lifetime.abort()
  assert.equal((await handler(new Request('http://localhost' + LIBRARY_PATH))).status, 503)
})

test('插件只登记 DSH 鉴权路由，卸载后拒绝迟到请求', async () => {
  let route
  let cleanup
  let removed = false
  apply({ effect: fn => { cleanup = fn() }, connection: { fetch: { register: value => { route = value; return async () => { removed = true } } } } }, { dataDir: await mkdtemp(join(root, 'host-')) })
  assert.equal(route.path, LIBRARY_PATH)
  assert.deepEqual(route.methods, ['GET', 'POST'])
  assert.equal((await route.fetch(new Request('http://localhost' + LIBRARY_PATH))).status, 200)
  await cleanup()
  assert.equal(removed, true)
  assert.equal((await route.fetch(new Request('http://localhost' + LIBRARY_PATH))).status, 503)
})

function sessionFake(ready) {
  const calls = []
  const session = {
    beginSubmission: value => { calls.push(['echo', value]); return { requestId: 'request-1', abandon: () => calls.push(['abandon']) } },
    prompt: async (...args) => { calls.push(['prompt', ...args]); return { ok: true, value: { accepted: true } } }
  }
  return { calls, session, sessions: { retain: id => { calls.push(['retain', id]); return { ready: ready || Promise.resolve({ session }), release: () => calls.push(['release']) } } } }
}

test('完整流程只提交一次到选定会话，保留原有权限并释放引用', async () => {
  const fake = sessionFake()
  await submitWorkflow(fake.sessions, 'selected-session', flow(), new AbortController().signal)
  assert.equal(fake.calls[0][1], 'selected-session')
  const prompts = fake.calls.filter(call => call[0] === 'prompt')
  assert.equal(prompts.length, 1)
  assert.equal(prompts[0][1][0].text, compileWorkflow(flow()))
  assert.equal(prompts[0][2], 'queue')
  assert.equal(prompts[0][4], 'request-1')
  assert.equal(fake.calls.at(-1)[0], 'release')
})

test('无会话、非法流程、预先取消时没有提交副作用', async () => {
  const fake = sessionFake()
  await assert.rejects(submitWorkflow(fake.sessions, '', flow(), new AbortController().signal), /先选择/)
  await assert.rejects(submitWorkflow(fake.sessions, 'id', null, new AbortController().signal))
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(submitWorkflow(fake.sessions, 'id', flow(), controller.signal))
  assert.equal(fake.calls.length, 0)
})

test('等待会话期间取消或卸载，迟到返回不再发送 prompt', async () => {
  for (const reason of ['cancel', 'unload']) {
    let resolveReady
    const ready = new Promise(resolve => { resolveReady = resolve })
    const fake = sessionFake(ready)
    const controller = new AbortController()
    const pending = submitWorkflow(fake.sessions, 'id', flow(), controller.signal)
    controller.abort(new Error(reason))
    resolveReady({ session: fake.session })
    await assert.rejects(pending, new RegExp(reason))
    assert.deepEqual(fake.calls.map(call => call[0]), ['retain', 'release'])
  }
})

test('发送失败不自动重试；结束回显并释放引用', async () => {
  const fake = sessionFake()
  let sends = 0
  fake.session.prompt = async () => { sends += 1; return { ok: false, error: { message: '拒绝接收' } } }
  await assert.rejects(submitWorkflow(fake.sessions, 'id', flow(), new AbortController().signal), /拒绝接收/)
  assert.equal(sends, 1)
  assert.deepEqual(fake.calls.slice(-2).map(call => call[0]), ['abandon', 'release'])
})
