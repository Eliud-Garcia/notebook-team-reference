/**
 * Genera lib/template.js a partir de ../../template_header.tex (proyecto
 * original, MPL-2.0), sustituyendo los valores fijos por marcadores que
 * buildTex() rellena con las opciones de la interfaz.
 *
 * Uso:  node scripts/build-template.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const src = path.resolve(here, '../../template_header.tex')
const dest = path.resolve(here, '../lib/template.js')

const TOC_BLOCK = [
  '\\begin{multicols}{3}',
  '\\tableofcontents',
  '\\end{multicols}',
  '',
  '\\pagebreak',
  '',
  '\\begin{multicols}{3}'
].join('\n')

/** [texto original, sustitución] — cada uno debe aparecer exactamente una vez. */
const STEPS = [
  ['\\title{Team Notebook}', '\\title{${title}}'],
  ['\\author{${author}}', '\\author{${author}}\n${date}'],
  ['\\begin{document}', '\\begin{document}\n\n${fontsizecmd}'],
  ['verbose,landscape,a4paper', 'verbose,${orientation},a4paper'],
  ['\\usepackage{amsmath}', '\\usepackage{amsmath}\n\\usepackage{amssymb}\n\\usepackage{enumitem}'],
  ['{0.1in}', '{${columnsep}}'],
  ['numbers=none', 'numbers=${numbers}'],
  ['tabsize=1', 'tabsize=${tabsize}'],
  ['{\\footnotesize\\ttfamily}', '{\\ttfamily}'],
  [TOC_BLOCK, '${tocblock}\n\\begin{multicols}{${columns}}']
]

const REQUIRED = [
  '${title}', '${author}', '${date}', '${initials}', '${fontsizecmd}',
  '${orientation}', '${columnsep}', '${numbers}', '${tabsize}',
  '${tocblock}', '${columns}'
]

const EXTRA_PACKAGES = ['amssymb', 'enumitem']

let text = fs.readFileSync(src, 'utf8')

for (const [from, to] of STEPS) {
  const first = text.indexOf(from)
  if (first === -1 || text.indexOf(from, first + from.length) !== -1) {
    throw new Error(`Se esperaba exactamente una ocurrencia de: ${JSON.stringify(from)}`)
  }
  text = text.replace(from, () => to)
}

for (const token of REQUIRED) {
  if (!text.includes(token)) throw new Error(`Falta el marcador ${token}`)
}

for (const pkg of EXTRA_PACKAGES) {
  if (!text.includes(`\\usepackage{${pkg}}`)) throw new Error(`Falta el paquete ${pkg}`)
}

const header = [
  '/**',
  ' * This Source Code Form is subject to the terms of the Mozilla Public License,',
  ' * v. 2.0. If a copy of the MPL was not distributed with this file, You can',
  ' * obtain one at https://mozilla.org/MPL/2.0/.',
  ' *',
  ' * Derivado de template_header.tex de codes2pdf (https://github.com/Erfaniaa/codes2pdf).',
  ' * GENERADO POR scripts/build-template.mjs — editar el .tex de la raíz y regenerar.',
  ' */',
  `export default ${JSON.stringify(text)}`,
  ''
].join('\n')

fs.writeFileSync(dest, header)
console.log(`OK → ${path.relative(process.cwd(), dest)} (${header.length} bytes)`)
