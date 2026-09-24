// Offline checks for desktop/plugin.js that mirror what the Hermes loader and catalog lint enforce.
// No dependencies; runs in CI and locally with `npm run check`.
import { readFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const pluginPath = `${root}desktop/plugin.js`
const src = await readFile(pluginPath, 'utf8')
const manifest = await readFile(`${root}plugin.yaml`, 'utf8')
const failures = []
const fail = msg => failures.push(msg)

// 1. It parses as an ES module.
try { execFileSync(process.execPath, ['--check', pluginPath], { stdio: 'pipe' }) }
catch (err) { fail(`does not parse: ${String(err.stderr || err.message).trim()}`) }

// 2. Only the three specifiers the desktop loader resolves.
const ALLOWED = new Set(['@hermes/plugin-sdk', 'react', 'react/jsx-runtime'])
for (const m of src.matchAll(/(?:from\s*|import\s*\(\s*|import\s+)(['"])([^'"]+)\1/g)) {
  if (!ALLOWED.has(m[2])) fail(`imports "${m[2]}"; only ${[...ALLOWED].join(', ')} load`)
}

// 3. Nothing the catalog's desktop surface lint refuses.
for (const [re, why] of [
  [/\beval\s*\(/, 'uses eval'],
  [/\bnew\s+Function\s*\(/, 'uses new Function'],
  [/\b(Array|Object|String|Function|Element|Node|Document)\.prototype\.\w+\s*=/, 'patches a built-in prototype'],
  [/<script[\s>]/i, 'injects a script tag']
]) if (re.test(src)) fail(why)

// 4. The default export's id matches the manifest name (the desktop folder name must equal the id).
const id = src.match(/const ID = '([^']+)'/)?.[1]
const name = manifest.match(/^name:\s*(\S+)/m)?.[1]
if (!id || id !== name) fail(`plugin id "${id}" does not match plugin.yaml name "${name}"`)

// 5. The required attribution link stays in the UI.
if (!src.includes('Data from Codex Resets')) fail('missing the "Data from Codex Resets" attribution')

if (failures.length) {
  console.error(`desktop/plugin.js: ${failures.length} problem(s)\n- ${failures.join('\n- ')}`)
  process.exit(1)
}
console.log('desktop/plugin.js: ok')
