import { chromium } from 'playwright'

const base = process.argv[2] || 'http://localhost:3100'
const out = process.argv[3] || '/tmp/opencode'

const problems = []
let failures = 0
const assert = (cond, msg) => {
  if (!cond) failures++
  console.log(`${cond ? '  ok ' : 'FALLO'} ${msg}`)
}
const near = (a, b) => Math.abs(parseFloat(a) - b) < 0.6

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } })
const page = await ctx.newPage()
page.on('console', m => {
  // el 400 es esperado: lo provoca la prueba de URL inválida
  if (m.type() === 'error' && !m.text().includes('status of 400')) problems.push(`console: ${m.text()}`)
})
page.on('pageerror', e => problems.push(`pageerror: ${e.message}`))
page.on('requestfailed', r => problems.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`))

await page.goto(base, { waitUntil: 'networkidle' })
await page.screenshot({ path: `${out}/01-home.png` })

// --- 1) URL inválida
await page.fill('#repo', 'esto-no-es-un-repo')
await page.click('button:has-text("Generar notebook")')
await page.waitForSelector('.status.error', { timeout: 20000 })
assert(true, `URL inválida → ${(await page.textContent('.status.error')).slice(0, 40)}…`)

// --- 2) carpeta indicada en la URL
await page.fill('#repo', 'https://github.com/kth-competitive-programming/kactl/tree/main/content/combinatorial')
await page.fill('#folder', '')
await page.click('button:has-text("Generar notebook")')
await page.waitForSelector('.toolbar', { timeout: 120000 })
const status1 = (await page.textContent('.status')).replace(/\s+/g, ' ')
assert(status1.includes('carpeta content/combinatorial'), `estado muestra la carpeta → ${status1}`)
assert(await page.locator('.notebook pre.code').count() === 4, `4 archivos de la carpeta (hay ${await page.locator('.notebook pre.code').count()})`)
const headings = await page.locator('.notebook h2, .notebook h3, .notebook h4').allTextContents()
assert(
  headings.every(h => ['content', 'combinatorial', 'chapter', 'factorial', 'IntPerm', 'multinomial'].includes(h)),
  `solo esa carpeta → ${headings.join(', ')}`
)

// --- 3) opciones de diseño
await page.getByLabel('Columnas', { exact: true }).selectOption('2')
await page.getByLabel('Tamaño de letra (pt)').selectOption('7')
await page.getByLabel('Interlineado').selectOption('1.4')
await page.getByLabel('Espacio entre columnas').selectOption('8')
await page.getByLabel('Orientación').selectOption('portrait')
await page.getByLabel('Tabulación').selectOption('4')
await page.getByLabel('Números de línea').check()
await page.fill('#title', 'Notebook de prueba')
await page.fill('#team', 'Equipo & Co')
await page.fill('#university', 'Universidad Nacional')
await page.fill('#initials', 'EC')
await page.fill('#date', '1 de enero de 2026')

const style = await page.locator('.notebook').evaluate(el => {
  const cs = getComputedStyle(el)
  return { cols: cs.columnCount, font: cs.fontSize, gap: cs.columnGap }
})
const tab = await page.locator('.notebook pre.code').first().evaluate(el => getComputedStyle(el).tabSize)
assert(style.cols === '2', `columnas = 2`)
assert(style.font === '9.33333px', `tamaño 7pt = ${style.font}`)
assert(near(style.gap, 30.24), `espacio 8mm = ${style.gap}`)
assert(tab === '4', `tabulación = ${tab}`)
assert(await page.locator('.notebook pre.code.lines .ln').count() > 0, 'números de línea visibles')
assert((await page.textContent('.notebook .cover')).includes('Universidad Nacional'), 'portada: equipo y universidad')
await page.screenshot({ path: `${out}/02-preview.png` })

// --- 4) LaTeX
await page.click('button:has-text("Código LaTeX")')
await page.waitForTimeout(500)
const tex = await page.textContent('.texbox pre')
const checks = [
  ['\\begin{multicols}{2}', '2 columnas'],
  ['\\fontsize{7}{9.8}\\selectfont', '7pt con interlineado 1.4'],
  ['\\author{Equipo \\& Co \\\\ Universidad Nacional}', 'autor escapado con salto de línea'],
  ['\\date{1 de enero de 2026}', 'fecha'],
  ['fancyhead[L]{EC}', 'iniciales'],
  ['\\geometry{verbose,portrait,a4paper', 'orientación vertical'],
  ['\\setlength{\\columnsep}{8mm}', 'espacio entre columnas'],
  ['numbers=left', 'números de línea'],
  ['tabsize=4', 'tabulación'],
  ['\\tableofcontents', 'índice'],
  ['\\section{content}', 'sección de la carpeta'],
  ['\\end{document}', 'cierre']
]
for (const [needle, desc] of checks) assert(tex.includes(needle), `LaTeX: ${desc}`)
await page.screenshot({ path: `${out}/03-latex.png` })

// --- 5) copiar
await ctx.grantPermissions(['clipboard-read', 'clipboard-write'])
await page.click('button:has-text("Copiar LaTeX")')
await page.waitForTimeout(300)
assert((await page.textContent('button:has-text("Copi")')).includes('Copiado'), 'botón copiar')

// --- 6) quitar el índice
await page.getByLabel('Índice').uncheck()
await page.waitForTimeout(400)
assert(!(await page.textContent('.texbox pre')).includes('\\tableofcontents'), 'desactivar índice quita \\tableofcontents')

// --- 7) carpeta por el campo (repo a secas)
await page.fill('#repo', 'https://github.com/kth-competitive-programming/kactl')
await page.fill('#folder', 'content/geometry')
await page.click('button:has-text("Generar notebook")')
await page.waitForSelector('.toolbar', { timeout: 120000 })
const status2 = (await page.textContent('.status')).replace(/\s+/g, ' ')
assert(status2.includes('carpeta content/geometry'), `campo carpeta → ${status2}`)
assert(await page.locator('.notebook pre.code').count() === 35, `35 archivos (hay ${await page.locator('.notebook pre.code').count()})`)

// --- 8) carpeta inexistente
await page.fill('#folder', 'no/existe')
await page.click('button:has-text("Generar notebook")')
await page.waitForSelector('.status.error', { timeout: 60000 })
assert((await page.textContent('.status.error')).includes('no/existe'), 'error claro con carpeta inexistente')

// --- 9) impresión
await page.fill('#folder', '')
await page.fill('#repo', 'https://github.com/Erfaniaa/codes2pdf')
await page.click('button:has-text("Generar notebook")')
await page.waitForSelector('.toolbar', { timeout: 120000 })
await page.emulateMedia({ media: 'print' })
assert(!(await page.locator('.toolbar').isVisible()), 'impresión: sin barra de herramientas')
assert(!(await page.locator('form.card').isVisible()), 'impresión: sin formulario')
assert(await page.locator('.panel.preview').isVisible(), 'impresión: sí vista previa')
await page.emulateMedia({ media: 'screen' })
await page.pdf({ path: `${out}/opciones.pdf`, preferCSSPageSize: true, printBackground: true })
console.log('PDF generado')

console.log(problems.length ? `\nPROBLEMAS:\n${problems.join('\n')}` : '\nSin errores de consola/red.')
console.log(failures ? `\n${failures} comprobaciones fallidas` : '\nTodo OK')
await browser.close()
