import path from 'node:path'
import Module, { createRequire } from 'node:module'
import { build } from 'esbuild'

// In-memory hook harness for lifecycle/async regression tests. It compiles the
// actual source and mocks only React scheduling and API boundaries; no DB writes.
export function hookRuntime() {
  const instances = new Map()
  let current, cursor
  const equal = (first, second) => first && second && first.length === second.length && first.every((value, index) => Object.is(value, second[index]))
  const react = {
    createContext: (value) => ({ Provider: 'Provider', value }),
    useContext: (context) => context.value,
    useState(initial) {
      const index = cursor++, owner = current
      if (!owner.slots[index]) owner.slots[index] = { value: typeof initial === 'function' ? initial() : initial }
      return [owner.slots[index].value, (value) => { owner.updates++; owner.slots[index].value = typeof value === 'function' ? value(owner.slots[index].value) : value }]
    },
    useRef(initial) {
      const index = cursor++
      return (current.slots[index] ??= { current: initial })
    },
    useMemo(fn, deps) {
      const index = cursor++
      if (!equal(current.slots[index]?.deps, deps)) current.slots[index] = { deps, value: fn() }
      return current.slots[index].value
    },
    useCallback(fn, deps) { return react.useMemo(() => fn, deps) },
    useEffect(fn, deps) {
      const index = cursor++, owner = current
      if (!equal(owner.slots[index]?.deps, deps)) owner.effects.push(() => {
        owner.slots[index]?.cleanup?.()
        owner.slots[index] = { deps, cleanup: fn() }
      })
    },
    useId: () => 'test-id',
  }
  react.useLayoutEffect = react.useEffect
  return {
    react,
    render(fn, props = {}) {
      current = instances.get(fn) ?? { slots: [], effects: [], updates: 0 }
      instances.set(fn, current); cursor = 0
      return fn(props)
    },
    effects() { for (const owner of instances.values()) for (const effect of owner.effects.splice(0)) effect() },
    cleanup() { for (const owner of instances.values()) for (const slot of owner.slots) slot?.cleanup?.() },
    updateCount: () => [...instances.values()].reduce((count, owner) => count + owner.updates, 0),
  }
}

export async function bundleHarness(contents, runtime, mocks = {}) {
  const root = path.resolve(import.meta.dirname, '../..')
  const result = await build({
    stdin: { contents, resolveDir: root, loader: 'jsx' }, bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external', jsx: 'automatic', define: { 'import.meta.env': '{}' },
    plugins: [{ name: 'regression-api-boundaries', setup(plugin) {
      plugin.onResolve({ filter: /.*/ }, (args) => {
        const name = args.path.split('/').pop().replace(/\.(js|jsx)$/, '')
        return Object.hasOwn(mocks, name) ? { path: name, namespace: 'fixture' } : undefined
      })
      plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path: name }) => ({ contents: mocks[name], loader: 'js' }))
    } }],
  })
  const file = path.join(root, 'tests', '__hook-fixture-memory.cjs')
  const module = new Module(file), require = createRequire(file)
  module.filename = file; module.paths = Module._nodeModulePaths(root)
  let fixture
  module.require = (name) => name === 'react' ? runtime.react : name === 'react/jsx-runtime' ? { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) } : name === 'react-router-dom' ? { useNavigate: () => (...args) => fixture.navigation?.push(args), Link: () => null, useLocation: () => fixture.location ?? {} } : require(name)
  module._compile(result.outputFiles[0].text, file)
  fixture = module.exports.fixture ?? {}
  return module.exports
}

export function findElement(node, predicate) {
  if (!node || typeof node !== 'object') return null
  if (Array.isArray(node)) {
    for (const child of node) { const found = findElement(child, predicate); if (found) return found }
    return null
  }
  if (predicate(node)) return node
  for (const value of Object.values(node.props ?? {})) { const found = findElement(value, predicate); if (found) return found }
  return null
}

export const flush = () => new Promise((resolve) => setImmediate(resolve))
export function memoryStorage() {
  const values = new Map()
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) }
}
