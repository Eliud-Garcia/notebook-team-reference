import { chromium } from 'playwright'

const base = process.argv[2] || 'http://localhost:3100'
const out = process.argv[3] || '/tmp/opencode'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1120, height: 900 } })
await page.goto(base, { waitUntil: 'networkidle' })
await page.fill('#repo', 'https://github.com/Erfaniaa/codes2pdf')
await page.fill('#title', 'Notebook de prueba')
await page.fill('#team', 'Equipo & Co')
await page.fill('#initials', 'EC')
await page.click('button[type=submit]')
await page.waitForSelector('.toolbar', { timeout: 120000 })

await page.emulateMedia({ media: 'print' })
await page.waitForTimeout(300)
console.log('toolbar visible en impresión:', await page.locator('.toolbar').isVisible())
console.log('formulario visible en impresión:', await page.locator('form.card').isVisible())
console.log('vista previa visible en impresión:', await page.locator('.panel.preview').isVisible())
console.log('panel LaTeX visible en impresión:', await page.locator('.panel').nth(1).isVisible())
console.log('columnas:', await page.locator('.notebook').evaluate(el => getComputedStyle(el).columnCount))
console.log('tamaño letra:', await page.locator('.notebook').evaluate(el => getComputedStyle(el).fontSize))
await page.screenshot({ path: `${out}/04-print-media.png` })
await browser.close()
