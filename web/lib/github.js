import { EXTENSIONS, IGNORE_DIRS, MAX_FILES, MAX_FILE_SIZE } from '@/lib/config'

const API = 'https://api.github.com'
const TIMEOUT = 15000

const timeout = () => AbortSignal.timeout(TIMEOUT)

function headers () {
  const h = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'codes2pdf-web'
  }
  if (process.env.GITHUB_TOKEN) {
    h.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`
  }
  return h
}

function decode (segment) {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

function cleanPath (value) {
  return String(value || '').trim().replace(/^\/+|\/+$/g, '')
}

/**
 * Acepta:
 *   https://github.com/usuario/repo
 *   https://github.com/usuario/repo/tree/main/src/algo   ← solo esa carpeta
 *   https://github.com/usuario/repo/blob/main/src/x.cpp  ← su carpeta
 *   git@github.com:usuario/repo.git
 *   usuario/repo
 *
 * Devuelve las rutas que vienen después de /tree/ o /blob/ en `segments`.
 */
export function parseRepo (input) {
  const raw = String(input || '').trim()
  if (!raw) throw new Error('Pega la URL del repositorio.')

  let kind = null
  let rest = ''
  let m = raw.match(/github\.com[:/]([^/\s]+)\/([^/\s?#]+)(?:\/(tree|blob)\/([^?\s#]*))?/i)

  if (m) {
    kind = m[3] ? m[3].toLowerCase() : null
    rest = m[4] || ''
  } else {
    m = raw.match(/^([^/\s]+)\/([^/\s?#]+)$/)
  }

  if (!m) throw new Error('No parece una URL de GitHub. Usa algo como https://github.com/usuario/repo')

  const owner = m[1]
  const repo = m[2].replace(/\.git$/, '')
  if (!owner || !repo) throw new Error('No se pudo leer el repositorio de la URL.')

  let segments = rest.split('/').filter(Boolean).map(decode)
  if (kind === 'blob') segments = segments.slice(0, -1) // la URL apunta a un archivo

  return { owner, repo, fullName: `${owner}/${repo}`, segments }
}

async function gh (path, msg404) {
  const res = await fetch(`${API}${path}`, { headers: headers(), signal: timeout() }).catch(boom)
  if (res.status === 403 || res.status === 429) throw rateLimitError()
  if (res.status === 404) throw new Error(msg404)
  if (!res.ok) throw new Error(`GitHub respondió ${res.status}.`)
  return res.json()
}

function boom (err) {
  if (err && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
    throw new Error('GitHub tardó demasiado en responder. Inténtalo de nuevo.')
  }
  throw err
}

function rateLimitError () {
  return new Error('GitHub rechazó la petición (posible límite de 60 consultas/hora). Intenta más tarde o añade un GITHUB_TOKEN.')
}

function encodePath (path) {
  return path.split('/').map(encodeURIComponent).join('/')
}

/**
 * Devuelve el nombre real de la rama, o null si no existe. GitHub contesta
 * 301 con el nuevo nombre cuando la rama fue renombrada (p. ej. `main` →
 * `deprecated-main` en vercel/next.js): hay que seguirla y usar el nombre
 * final, porque el endpoint de árboles no acepta el nombre antiguo.
 */
async function branchName (owner, repo, name) {
  const res = await fetch(`${API}/repos/${owner}/${repo}/branches/${encodeURIComponent(name)}`, {
    headers: headers(),
    signal: timeout()
  }).catch(boom)
  if (res.status === 404) return null
  if (res.status === 403 || res.status === 429) throw rateLimitError()
  if (!res.ok) throw new Error(`GitHub respondió ${res.status}.`)

  const data = await res.json().catch(() => null)
  return data && typeof data.name === 'string' ? data.name : null
}

/**
 * En `usuario/repo/tree/main/src/algo`, "main" es la rama y "src/algo" la
 * carpeta. Como las ramas pueden llevar barras (feature/x), se prueba primero
 * un segmento, luego dos, etc.; si ninguna es rama, se asume la rama por
 * defecto y toda la ruta se trata como carpeta.
 */
async function resolveRef (owner, repo, segments, defaultBranch) {
  if (!segments.length) return { ref: defaultBranch, subpath: '' }
  if (segments[0] === defaultBranch) return { ref: defaultBranch, subpath: segments.slice(1).join('/') }

  for (let i = 1; i <= segments.length; i++) {
    const candidate = segments.slice(0, i).join('/')
    const real = await branchName(owner, repo, candidate)
    if (real) {
      return { ref: real, subpath: segments.slice(i).join('/') }
    }
  }

  return { ref: defaultBranch, subpath: segments.join('/') }
}

/**
 * Recorre una carpeta con la API de contenidos. Hace falta cuando el árbol
 * recursivo viene truncado (repos muy grandes como vercel/next.js): solo
 * pide las carpetas que interesan en vez de todo el repositorio.
 */
async function listByContents (owner, repo, ref, subpath) {
  const files = []
  const queue = [[subpath, 0]]
  const seen = new Set()

  while (queue.length && files.length < MAX_FILES) {
    const [path, depth] = queue.shift()
    if (seen.has(path)) continue
    seen.add(path)

    const entries = await gh(
      `/repos/${owner}/${repo}/contents/${encodePath(path)}?ref=${encodeURIComponent(ref)}`,
      `La carpeta "${path}" no existe en la rama "${ref}".`
    )

    for (const entry of Array.isArray(entries) ? entries : [entries]) {
      if (entry.type === 'dir') {
        if (depth < 6 && wanted(entry.path)) queue.push([entry.path, depth + 1])
        continue
      }
      if (entry.type !== 'file') continue
      if (entry.size > MAX_FILE_SIZE) continue
      if (!EXTENSIONS.includes(extname(entry.path))) continue
      if (!wanted(entry.path) || !inPath(entry.path, subpath)) continue

      files.push({ path: entry.path, size: entry.size, sha: entry.sha, raw: entry.download_url })
    }
  }

  return files.slice(0, MAX_FILES)
}

export async function fetchRepo (input, folder) {
  const { owner, repo, fullName, segments } = parseRepo(input)
  const meta = await gh(
    `/repos/${owner}/${repo}`,
    'Repositoritorio no encontrado. ¿Es público?'
  )
  const defaultBranch = meta.default_branch || 'main'

  const resolved = await resolveRef(owner, repo, segments, defaultBranch)
  const subpath = cleanPath(folder) || resolved.subpath

  const tree = await gh(
    `/repos/${owner}/${repo}/git/trees/${encodeURIComponent(resolved.ref)}?recursive=1`,
    `No se pudo leer la rama "${resolved.ref}" del repositorio.`
  )

  const truncated = Boolean(tree.truncated)
  let files

  if (truncated && subpath) {
    // El árbol vino incompleto: recorremos solo la carpeta pedida.
    files = await listByContents(owner, repo, resolved.ref, subpath)
  } else {
    files = (tree.tree || [])
      .filter(n => n.type === 'blob')
      .filter(n => n.size <= MAX_FILE_SIZE)
      .filter(n => EXTENSIONS.includes(extname(n.path)))
      .filter(n => wanted(n.path))
      .filter(n => inPath(n.path, subpath))
      .slice(0, MAX_FILES)
      .map(n => ({ path: n.path, size: n.size, sha: n.sha }))
  }

  if (!files.length) {
    const where = subpath ? ` en la carpeta "${subpath}"` : ''
    throw new Error(
      `No se encontraron archivos con extensiones ${EXTENSIONS.join(', ')}${where} ` +
      `(rama "${resolved.ref}") de ${fullName}.`
    )
  }

  return {
    owner,
    repo,
    fullName,
    ref: resolved.ref,
    sha: tree.sha || resolved.ref,
    subpath,
    truncated: truncated && !subpath,
    description: meta.description || '',
    total: files.length,
    files
  }
}

function inPath (path, subpath) {
  if (!subpath) return true
  return path === subpath || path.startsWith(subpath + '/')
}

function extname (p) {
  const i = p.lastIndexOf('.')
  return i === -1 ? '' : p.slice(i).toLowerCase()
}

/** Oculta archivos ocultos y directorios que no aportan al notebook. */
function wanted (path) {
  return !path.split('/').some(seg => seg.startsWith('.') || IGNORE_DIRS.includes(seg.toLowerCase()))
}

export function rawUrl (repo, file) {
  if (file.raw) return file.raw
  const segs = file.path.split('/').map(encodeURIComponent).join('/')
  return `https://raw.githubusercontent.com/${repo.owner}/${repo.repo}/${repo.sha}/${segs}`
}
