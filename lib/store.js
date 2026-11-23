import { mkdir, readFile, writeFile, rename, open, unlink } from 'node:fs/promises'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { library, object, id, preset, workflow, invalid, groupOf } from './model.js'

export class LibraryStore {
  constructor(path) {
    this.path = path
    this.tail = Promise.resolve()
  }

  // One queue per mounted store plus an exclusive file lock across host processes.
  enqueue(operation) {
    const pending = this.tail.then(operation)
    this.tail = pending.catch(() => {}) // Caller still receives the actual failure.
    return pending
  }

  async load() {
    let primaryError
    try {
      return { ...library(JSON.parse(await readFile(this.path, 'utf8'))), recovered: false }
    } catch (error) {
      primaryError = error
    }
    try {
      return { ...library(JSON.parse(await readFile(this.path + '.bak', 'utf8'))), recovered: true }
    } catch (error) {
      if (primaryError.code === 'ENOENT' && error.code === 'ENOENT') {
        return { version: 1, revision: 'initial', templates: [], workflows: [], recovered: false }
      }
      throw invalid('配置库读取失败，主文件和备份均不可用；请保留文件并检查：' + this.path, 500)
    }
  }

  read() {
    return this.enqueue(() => this.load())
  }

  change(input, signal) {
    object(input)
    const revision = id(input.revision)
    if (!['save-preset', 'save-template', 'save-workflow', 'delete-template', 'delete-workflow'].includes(input.action)) {
      throw invalid('不支持的配置操作')
    }
    const field = input.action.endsWith('workflow') ? 'workflows' : 'templates'
    const deleting = input.action.startsWith('delete')
    const item = deleting ? { id: id(input.id) } : (field === 'templates' ? preset(input.item) : workflow(input.item, true))
    if (input.action === 'save-preset' && (!item.presetName || !item.groupId)) throw invalid('请填写步骤和预设名称')
    return this.enqueue(async () => {
      signal?.throwIfAborted()
      await mkdir(dirname(this.path), { recursive: true })
      signal?.throwIfAborted()
      let lock
      try {
        lock = await open(this.path + '.lock', 'wx')
      } catch (error) {
        if (error.code === 'EEXIST') throw invalid('配置库正由另一进程保存，请稍后刷新；异常退出残留的 .lock 需在关闭 DSH 后移除', 409)
        throw error
      }
      const temp = this.path + '.tmp-' + randomUUID()
      const backupTemp = temp + '.bak'
      try {
        const current = await this.load()
        signal?.throwIfAborted()
        if (current.revision !== revision) throw invalid('配置库已被其他窗口更新，请刷新配置库后重试；当前流程草稿会保留', 409)
        const next = library(current)
        // Freeze inferred legacy groups before a rename or deletion changes their identity.
        for (const flow of next.workflows) {
          for (const row of flow.steps) row.groupId = groupOf(row, current.templates)
        }
        for (const row of next.templates) row.groupId = groupOf(row, current.templates)
        const index = next[field].findIndex(row => row.id === item.id)
        if (input.action === 'save-preset') {
          if (index >= 0 && next.templates[index].groupId !== item.groupId) throw invalid('该预设属于其他步骤')
          if (next.templates.some(row => row.id !== item.id && row.groupId === item.groupId && (row.presetName || row.title) === item.presetName)) throw invalid('此步骤已有同名预设，请换一个名称或更新原预设')
        }
        if (deleting) {
          if (index < 0) throw invalid('配置已不存在', 404)
          next[field].splice(index, 1)
        } else if (index < 0) {
          next[field].push(item)
        } else {
          next[field][index] = item
        }
        next.revision = randomUUID()
        library(next)
        await writeFile(temp, JSON.stringify(next, null, 2), { encoding: 'utf8', mode: 0o600 })
        // Preserve a validated previous generation, never copy a corrupt primary over the backup.
        await writeFile(backupTemp, JSON.stringify(library(current), null, 2), { encoding: 'utf8', mode: 0o600 })
        signal?.throwIfAborted()
        await rename(backupTemp, this.path + '.bak')
        signal?.throwIfAborted()
        await rename(temp, this.path)
        return { ...next, recovered: false }
      } finally {
        // Fixed temporary files only; cleanup failures are reported instead of hidden.
        await Promise.all([temp, backupTemp].map(async path => {
          try { await unlink(path) } catch (error) { if (error.code !== 'ENOENT') throw error }
        })).finally(async () => {
          await lock.close()
          await unlink(this.path + '.lock')
        })
      }
    })
  }
}
