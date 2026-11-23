import { build } from 'esbuild'
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'

const result = await build({
  absWorkingDir: fileURLToPath(new URL('..', import.meta.url)), entryPoints: ['test/preview.js'],
  write: false, bundle: true, format: 'iife', platform: 'browser', target: 'es2022'
})
const server = createServer((req, res) => {
  if (req.url === '/preview.js') {
    res.writeHead(200, { 'Content-Type': 'text/javascript' })
    res.end(result.outputFiles[0].contents)
  } else {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>DSH 流程编排 · 离线预览</title><body><script src="/preview.js"></script></body></html>')
  }
})
server.listen(0, '127.0.0.1', () => console.log('Preview: http://127.0.0.1:' + server.address().port))
