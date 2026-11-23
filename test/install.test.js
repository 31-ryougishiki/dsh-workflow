import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, realpath, writeFile, readdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { install } from '../scripts/install.js'

test('从含空格中文路径安装，只追加插件，保留原配置且重复安装不改写', async () => {
  const root = resolve('artifacts/tests')
  await mkdir(root, { recursive: true })
  const profile = await mkdtemp(join(root, '独立 profile '))
  const original = '# existing plugin\n- insert:\n    - id: example\n      name: example\n'
  const patch = join(profile, 'cordis.patch.yml')
  await writeFile(patch, original)
  const first = await install(profile, resolve('.'))
  assert.equal(first.changed, true)
  assert.equal(await readFile(first.backup, 'utf8'), original)
  const next = await readFile(patch, 'utf8')
  assert.ok(next.startsWith(original))
  assert.equal(await realpath(join(profile, 'node_modules/dsh-workflow-builder')), await realpath('.'))
  assert.equal((await install(profile, resolve('.'))).changed, false)
  assert.equal(await readFile(patch, 'utf8'), next)
  assert.equal((await readdir(profile)).filter(name => name.includes('.bak-workflow')).length, 1)
})

test('缺少 profile 或同名链接冲突时明确失败，不覆盖原配置', async () => {
  const root = resolve('artifacts/tests')
  await assert.rejects(install(join(root, 'missing-profile'), resolve('.')), error => error.code === 'ENOENT')
  const profile = await mkdtemp(join(root, 'conflict-'))
  await writeFile(join(profile, 'cordis.patch.yml'), '# unchanged')
  await mkdir(join(profile, 'node_modules/dsh-workflow-builder'), { recursive: true })
  await assert.rejects(install(profile, resolve('.')), /指向其他目录/)
  assert.equal(await readFile(join(profile, 'cordis.patch.yml'), 'utf8'), '# unchanged')
})
