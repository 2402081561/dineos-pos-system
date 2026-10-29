import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import Module from 'node:module'
import path from 'node:path'
import { test } from 'node:test'
import { buildSync } from 'esbuild'

const root = path.resolve(import.meta.dirname, '..')
const read = (file) => readFileSync(path.join(root, file), 'utf8')

test('shared D mark is size-constrained, local and accessible without replacing the shop name', () => {
  const result = buildSync({
    stdin: {
      contents: `import React from 'react'; import {renderToStaticMarkup} from 'react-dom/server';
        import BrandMark from './src/components/common/BrandMark.jsx';
        export const normal=renderToStaticMarkup(<BrandMark/>);
        export const decorative=renderToStaticMarkup(<BrandMark decorative/>);
        export const login=renderToStaticMarkup(<BrandMark className="h-14 w-14"/>);`,
      resolveDir: root, loader: 'jsx',
    },
    bundle: true, write: false, platform: 'node', format: 'cjs',
    packages: 'external', jsx: 'automatic',
  })
  const module = new Module(path.join(root, 'tests', '__branding-memory.cjs'))
  module.paths = Module._nodeModulePaths(root)
  module._compile(result.outputFiles[0].text, module.id)
  const { normal, decorative, login } = module.exports
  assert.match(normal, /alt="DineOS"/)
  assert.match(normal, /src="\/branding\/dineos-mark.png"/)
  assert.match(normal, /shrink-0 object-contain h-8 w-8/)
  assert.match(decorative, /alt="" aria-hidden="true"/)
  assert.match(login, /h-14 w-14/)
  const header = read('src/components/common/PortalLayout.jsx')
  assert.match(header, /<BrandMark decorative \/><span className="truncate">\{name\}<\/span>/)
  for (const page of ['src/pages/admin/Login.jsx', 'src/pages/customer/Landing.jsx']) {
    assert.match(read(page), /<BrandMark /)
  }
})

test('every portal uses the common branded header', () => {
  for (const area of ['Admin', 'Cashier', 'Customer', 'Kitchen', 'Staff']) {
    assert.match(read(`src/layouts/${area}Layout.jsx`), /<PortalLayout/)
  }
})

test('header and browser icon files are real compact transparent PNGs of the declared sizes', () => {
  for (const [file, size] of [['dineos-mark.png', 192], ['dineos-favicon.png', 64], ['dineos-touch-icon.png', 180]]) {
    const png = readFileSync(path.join(root, 'public/branding', file))
    assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
    assert.equal(png.readUInt32BE(16), size)
    assert.equal(png.readUInt32BE(20), size)
    assert.equal(png[25], 6, 'RGBA keeps transparency')
    assert.ok(png.length < 40000, 'do not ship the large generated master in headers')
  }
  const html = read('index.html')
  assert.match(html, /rel="icon"[^>]+href="\/branding\/dineos-favicon.png"/)
  assert.match(html, /rel="apple-touch-icon"[^>]+href="\/branding\/dineos-touch-icon.png"/)
  assert.doesNotMatch(html, /data:image\/svg/)
})

test('receipt branding stays controlled by its saved shop logo, not the system D mark', () => {
  const receipt = read('src/components/cashier/ReceiptPaper.jsx')
  assert.match(receipt, /receipt.shopSnapshot\?\.logoUrl/)
  assert.doesNotMatch(receipt, /BrandMark|\/branding\/dineos-/)
})
