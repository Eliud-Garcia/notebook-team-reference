/**
 * This Source Code Form is subject to the terms of the Mozilla Public License,
 * v. 2.0. If a copy of the MPL was not distributed with this file, You can
 * obtain one at https://mozilla.org/MPL/2.0/.
 *
 * Derivado de codes2pdf — https://github.com/Erfaniaa/codes2pdf
 * © Erfan Alimohammadi. Modificado para generar el .tex en el navegador.
 */
import template from '@/lib/template'
import { DEFAULT_OPTS, SECTIONS } from '@/lib/config'
import { baseName } from '@/lib/model'

const SPECIALS = /[\\{}%$&#_~^]/g

export function escapeLatex (value) {
  return String(value == null ? '' : value).replace(SPECIALS, c => '\\' + c)
}

/**
 * pdflatex con inputenc se queja de "Invalid UTF-8 byte sequence" si un
 * archivo del repo trae bytes rotos (nombres en Latin-1, etc.): se cambia
 * el caracter de reemplazo por '?' y se quitan los controles C0.
 */
function cleanBody (text) {
  let out = ''
  for (const ch of String(text)) {
    const code = ch.codePointAt(0)
    if (code === 0xfffd) {
      out += '?'
    } else if (code === 0x7f || (code < 0x20 && code !== 9 && code !== 10 && code !== 13)) {
      continue // \t, \n y \r se conservan
    } else {
      out += ch
    }
  }
  return out
}

function sanitizeContents (contents) {
  const clean = new Map()
  for (const [path, body] of contents) clean.set(path, cleanBody(body))
  return clean
}

/**
 * `listings` no sabe procesar caracteres multibyte: aunque carguemos
 * inputenc, cualquier acento dentro de un `lstlisting` aborta con
 * "Invalid UTF-8 byte sequence" (probado con TeX Live 2023). Por eso los
 * cuerpos de codigo pasan a ASCII: primero se quitan los diacriticos (NFD)
 * y luego se traducen los simbolos frecuentes. Solo afecta a los listados:
 * la vista previa HTML, los .tex del repo y el titulo/autor se quedan
 * como estan.
 */
const ASCII_MAP = {
  'ß': 'ss', 'æ': 'ae', 'Æ': 'AE', 'œ': 'oe', 'Œ': 'OE', 'ø': 'o', 'Ø': 'O',
  'ð': 'd', 'Ð': 'D', 'þ': 'th', 'Þ': 'Th', 'ł': 'l', 'Ł': 'L', 'đ': 'd',
  'ħ': 'h', 'ı': 'i', 'İ': 'I', 'µ': 'u', 'ĸ': 'k',
  '–': '-', '—': '-', '−': '-', '…': '...', '•': '*', '·': '.', '×': '*',
  '÷': '/', '±': '+/-', '°': ' deg', '‰': '%', '′': "'", '″': '"',
  '‘': "'", '’': "'", '‚': "'", '“': '"', '”': '"', '„': '"', '«': '"', '»': '"',
  '→': '->', '←': '<-', '⇒': '=>', '⟹': '->', '⟵': '<-', '↔': '<->',
  '≥': '>=', '≤': '<=', '≠': '!=', '≈': '~=', '≡': '==', '∝': 'prop to',
  '∞': 'inf', '√': 'sqrt', '∅': 'empty', '∈': ' in ', '∪': 'U', '∩': 'N',
  'π': 'pi', 'μ': 'u', 'α': 'alpha', 'β': 'beta', 'γ': 'gamma', 'δ': 'delta',
  'ε': 'epsilon', 'ζ': 'zeta', 'η': 'eta', 'θ': 'theta', 'λ': 'lambda',
  'ν': 'nu', 'ξ': 'xi', 'ρ': 'rho', 'σ': 'sigma', 'τ': 'tau', 'φ': 'phi',
  'χ': 'chi', 'ψ': 'psi', 'ω': 'omega', 'Γ': 'Gamma', 'Δ': 'Delta',
  'Θ': 'Theta', 'Λ': 'Lambda', 'Ξ': 'Xi', 'Σ': 'Sigma', 'Φ': 'Phi',
  'Ψ': 'Psi', 'Ω': 'Omega',
  '©': '(c)', '®': '(R)', '™': 'TM', '€': 'EUR', '£': 'GBP', '¥': 'YEN',
  '§': 'S', '¶': 'P', '†': '+', '¬': '!', '¦': '|', '¡': '!', '¿': '?',
  '¨': '"', '´': "'", '¸': ',', 'º': 'o', 'ª': 'a'
}

function toAscii (text) {
  const decomposed = String(text).normalize('NFD').replace(/\p{M}/gu, '')
  let out = ''

  for (const ch of decomposed) {
    if (ch.codePointAt(0) < 128) {
      out += ch
    } else if (ASCII_MAP[ch]) {
      out += ASCII_MAP[ch]
    }
    // el resto (CJK, emoji, etc.) se omite: en comentarios no aporta y
    // romperia la compilacion
  }

  return out
}

/** Envuelve codigo en un `lstlisting` ya apto para pdflatex. */
function listing (body) {
  return '\\begin{lstlisting}\n' + toAscii(body).replace(/\s+$/, '') + '\n\\end{lstlisting}\n'
}

/**
 * Los .tex que trae el repositorio pueden ser documentos completos: si los
 * incrustamos tal cual rompen esta plantilla (basada en `article`). Quitamos
 * el preambulo y el cierre del documento, y convertimos `\chapter` (que solo
 * existe en report/book) a secciones sin numerar.
 */
export function sanitizeTex (src) {
  return String(src)
    .replace(/^[ \t]*\\documentclass\b[^\n]*$/gm, '')
    .replace(/^[ \t]*\\usepackage\b[^\n]*$/gm, '')
    .replace(/^[ \t]*\\begin[ \t]*\{[ \t]*document[ \t]*\}[^\n]*$/gm, '')
    .replace(/^[ \t]*\\end[ \t]*\{[ \t]*document[ \t]*\}[^\n]*$/gm, '')
    .replace(/\\chapter[ \t]*\*?[ \t]*\{/g, '\\section*{')
}

/**
 * Los .tex del repo suelen incluir otros archivos con macros propias
 * (`\kactlimport{...}`, `\import{...}`, `\input{...}`): si no las resolvemos,
 * pdflatex se queja de "undefined control sequence". Se sustituyen por el
 * contenido del archivo si esta en el repo; si no, se comenta la linea.
 */
const INCLUDE_RE = /\\(?:[A-Za-z@]*import|input|include|lstinputlisting)\s*(?:\[[^\]]*\])?\s*\{([^}\n]+)\}/g

function dirname (path) {
  const i = path.lastIndexOf('/')
  return i === -1 ? '' : path.slice(0, i)
}

function resolvePath (dir, target, contents) {
  const clean = target.trim().replace(/^\.\//, '')
  const full = clean.startsWith('/') || !dir ? clean : `${dir}/${clean}`
  return [full, `${full}.tex`].find(key => contents.has(key)) || null
}

function resolveIncludes (src, dir, contents, depth = 0) {
  if (depth > 3) return src
  return src.replace(INCLUDE_RE, (match, target) => {
    const key = resolvePath(dir, target, contents)
    const body = key ? contents.get(key) : null
    if (body == null) return `% (archivo no incluido: ${target})\n`
    if (key.endsWith('.tex')) {
      return resolveIncludes(sanitizeTex(body), dirname(key), contents, depth + 1)
    }
    return listing(body)
  })
}

/** Recorrido equivalente a `walk()` de codes2pdf.js. */
function walk (node, depth, contents) {
  const d = Math.min(depth, SECTIONS.length - 1)
  let out = ''

  for (const entry of node.entries) {
    const title = escapeLatex(entry.type === 'dir' ? entry.name : baseName(entry.path))

    if (entry.type === 'dir') {
      out += `\n\\${SECTIONS[d]}{${title}}\n`
      out += walk(entry.node, d + 1, contents)
      continue
    }

    out += `\n\\${SECTIONS[d]}{${title}}\n`
    const body = contents.get(entry.path)
    if (body == null) continue

    if (entry.name.toLowerCase().endsWith('.tex')) {
      out += resolveIncludes(sanitizeTex(body), dirname(entry.path), contents).trim() + '\n'
    } else {
      out += listing(body)
    }
  }

  return out
}

/** Normaliza las opciones recibidas de la interfaz. */
export function normalizeOpts (opts = {}) {
  const o = { ...DEFAULT_OPTS, ...opts }
  const num = (value, fallback, min, max) => {
    const n = Number(value)
    return Number.isFinite(n) && n >= min && n <= max ? n : fallback
  }

  return {
    ...o,
    columns: Math.round(num(o.columns, DEFAULT_OPTS.columns, 1, 3)),
    fontSize: num(o.fontSize, DEFAULT_OPTS.fontSize, 5, 20),
    lineHeight: num(o.lineHeight, DEFAULT_OPTS.lineHeight, 0.8, 3),
    columnGap: num(o.columnGap, DEFAULT_OPTS.columnGap, 0, 40),
    tabSize: Math.round(num(o.tabSize, DEFAULT_OPTS.tabSize, 1, 8)),
    orientation: o.orientation === 'portrait' ? 'portrait' : 'landscape',
    toc: Boolean(o.toc),
    lineNumbers: Boolean(o.lineNumbers)
  }
}

/** Documento .tex completo, listo para pegar en Overleaf. */
export function buildTex ({ tree, contents, opts }) {
  const o = normalizeOpts(opts)
  const clean = sanitizeContents(contents)
  const leading = parseFloat((o.fontSize * o.lineHeight).toFixed(2))
  // Cada parte se escapa por separado para que el `\\` del salto no se
  // vuelva a escapar.
  const author = [o.team, o.university]
    .filter(v => v && v.trim())
    .map(escapeLatex)
    .join(' \\\\ ')

  const tocBlock = o.toc
    ? `\\begin{multicols}{${o.columns}}\n\\tableofcontents\n\\end{multicols}\n\n\\pagebreak\n\n`
    : '\\pagebreak\n\n'

  let doc = template
    .replaceAll('${title}', () => escapeLatex(o.title || DEFAULT_OPTS.title))
    .replaceAll('${author}', () => author)
    .replaceAll('${date}', () => (o.date ? `\\date{${escapeLatex(o.date)}}` : ''))
    .replaceAll('${initials}', () => escapeLatex(o.initials || ''))
    .replaceAll('${fontsizecmd}', () => `\\fontsize{${o.fontSize}}{${leading}}\\selectfont`)
    .replaceAll('${orientation}', () => o.orientation)
    .replaceAll('${columnsep}', () => `${o.columnGap}mm`)
    .replaceAll('${numbers}', () => (o.lineNumbers ? 'left' : 'none'))
    .replaceAll('${tabsize}', () => String(o.tabSize))
    .replaceAll('${columns}', () => String(o.columns))
    .replaceAll('${tocblock}', () => tocBlock)

  doc += walk(tree, 0, clean)
  doc += '\\end{multicols}\n\\end{document}\n'
  return doc
}
