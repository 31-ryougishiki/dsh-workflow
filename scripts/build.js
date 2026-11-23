import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'

// DSH client modules are lazy factories, not browser ESM script entries.
await build({
  absWorkingDir: fileURLToPath(new URL('..', import.meta.url)),
  entryPoints: ['src/client.js'], outfile: 'lib/client.js',
  bundle: true, format: 'cjs', platform: 'browser', target: 'es2022',
  external: ['react', 'react-dom'],
  banner: { js: 'window.__ModuleLoader__.load({ id: "dsh-workflow-builder", factory: (require) => { var module = { exports: {} }; var exports = module.exports;' },
  footer: { js: 'return module.exports; } });' }
})
