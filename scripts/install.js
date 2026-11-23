import { lstat, mkdir, readFile, realpath, rename, symlink, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'

// Local development install without touching the profile's pnpm dependency tree.
export async function install(profileDir, pluginDir) {
  const profile = resolve(profileDir)
  const source = await realpath(pluginDir)
  const patch = join(profile, 'cordis.patch.yml')
  const text = await readFile(patch, 'utf8')
  const manifest = JSON.parse(await readFile(join(source, 'package.json'), 'utf8'))
  if (manifest.name !== 'dsh-workflow-builder') throw new Error('插件目录不匹配')
  await readFile(join(source, 'lib/client.js'))
  const link = join(profile, 'node_modules', manifest.name)
  let exists = false
  try { await lstat(link); exists = true } catch (error) { if (error.code !== 'ENOENT') throw error }
  if (exists) {
    if (await realpath(link) !== source) throw new Error('已有同名插件指向其他目录，未覆盖：' + link)
  } else {
    await mkdir(dirname(link), { recursive: true })
    await symlink(source, link, process.platform === 'win32' ? 'junction' : 'dir')
  }
  if (/name:\s*['"]?dsh-workflow-builder['"]?\s*$/m.test(text)) return { changed: false, profile }
  if (/id:\s*['"]?workflow-builder['"]?\s*$/m.test(text)) throw new Error('workflow-builder ID 已被占用，请检查 profile 配置')
  const suffix = randomUUID()
  const backup = patch + '.bak-workflow-' + suffix
  await writeFile(backup, text, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
  const next = text + (text.endsWith('\n') ? '' : '\n') + '\n# DSH workflow builder (local plugin)\n- insert:\n    - id: workflow-builder\n      name: \'dsh-workflow-builder\'\n'
  const temp = patch + '.tmp-' + suffix
  await writeFile(temp, next, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
  // Refuse to overwrite an unrelated edit made while preparing the backup.
  if (await readFile(patch, 'utf8') !== text) throw new Error('profile 配置已变化，未覆盖；请重新运行安装')
  await rename(temp, patch)
  return { changed: true, profile, backup }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const args = process.argv.slice(2)
  if (args.length !== 0 && (args.length !== 2 || args[0] !== '--profile-dir')) throw new Error('用法：node scripts/install.js [--profile-dir <现有 profile 目录>]')
  const result = await install(args[1] || join(homedir(), '.dsh', 'profiles', 'web'), fileURLToPath(new URL('..', import.meta.url)))
  console.log(result.changed ? '已安装流程编排插件；刷新 DSH 页面，未热加载时重启 DSH。' : '插件已安装，无需重复修改。')
  if (result.backup) console.log('原 profile 配置备份：' + result.backup)
}
