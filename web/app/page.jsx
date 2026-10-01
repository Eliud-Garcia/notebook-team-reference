'use client'

import { useMemo, useRef, useState } from 'react'
import { fetchRepo, rawUrl } from '@/lib/github'
import { buildTree, baseName, slug } from '@/lib/model'
import { buildTex } from '@/lib/tex'
import { highlight } from '@/lib/highlight'
import { DEFAULT_OPTS } from '@/lib/config'

const HEADING = ['h2', 'h3', 'h4']

function CodeBlock ({ path, text, lineNumbers }) {
  const html = useMemo(() => highlight(text, path), [path, text])
  const lines = useMemo(() => {
    if (!lineNumbers) return null
    return html.split('\n').map((chunk, i) => (
      <span className="ln" key={i} dangerouslySetInnerHTML={{ __html: chunk || ' ' }} />
    ))
  }, [html, lineNumbers])

  return (
    <pre className={`code${lineNumbers ? ' lines' : ''}`}>
      {lineNumbers
        ? lines
        : <code dangerouslySetInnerHTML={{ __html: html }} />}
    </pre>
  )
}

function Section ({ entry, depth, contents, lineNumbers }) {
  const Heading = HEADING[Math.min(depth, 2)]
  const isFile = entry.type === 'file'
  const text = isFile ? contents.get(entry.path) : null

  return (
    <section>
      <Heading id={slug(entry.path)}>
        {isFile ? baseName(entry.path) : entry.name}
      </Heading>
      {isFile ? (
        text == null
          ? <p className="missing">No se pudo descargar este archivo.</p>
          : <CodeBlock path={entry.path} text={text} lineNumbers={lineNumbers} />
      ) : (
        entry.node.entries.map(child => (
          <Section key={child.path} entry={child} depth={depth + 1} contents={contents} lineNumbers={lineNumbers} />
        ))
      )}
    </section>
  )
}

function TocList ({ node }) {
  return (
    <ul>
      {node.entries.map(entry => (
        <li key={entry.path}>
          <a href={`#${slug(entry.path)}`}>{entry.type === 'file' ? baseName(entry.path) : entry.name}</a>
          {entry.type === 'dir' && <TocList node={entry.node} />}
        </li>
      ))}
    </ul>
  )
}

function Select ({ label, value, options, onChange }) {
  const id = `opt-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={e => onChange(e.target.value)}>
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  )
}

function Check ({ label, checked, onChange }) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  )
}

function formatSize (bytes) {
  if (!Number.isFinite(bytes)) return ''
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`
}

function collectPaths (node, out = []) {
  for (const file of node.files) out.push(file.path)
  for (const dir of node.dirs) collectPaths(dir, out)
  return out
}

function hasMatch (node, query) {
  if (node.files.some(f => f.path.toLowerCase().includes(query))) return true
  return node.dirs.some(dir => hasMatch(dir, query))
}

function FolderCheck ({ node, excluded, onToggleMany }) {
  const paths = collectPaths(node)
  const kept = paths.reduce((n, p) => (excluded.has(p) ? n : n + 1), 0)
  const all = kept === paths.length

  return (
    <label className="check">
      <input
        type="checkbox"
        checked={all}
        ref={el => { if (el) el.indeterminate = kept > 0 && !all }}
        onChange={e => onToggleMany(paths, e.target.checked)}
      />
      <span className="fname">{node.name}/</span>
    </label>
  )
}

function FilesTree ({ node, sizes, excluded, onToggle, onToggleMany, query }) {
  const rows = []

  for (const entry of node.entries) {
    if (entry.type === 'dir') {
      if (query && !hasMatch(entry.node, query)) continue
      rows.push(
        <li key={entry.path} className="branch">
          <FolderCheck node={entry.node} excluded={excluded} onToggleMany={onToggleMany} />
          <FilesTree
            node={entry.node}
            sizes={sizes}
            excluded={excluded}
            onToggle={onToggle}
            onToggleMany={onToggleMany}
            query={query}
          />
        </li>
      )
      continue
    }

    if (query && !entry.path.toLowerCase().includes(query)) continue
    const off = excluded.has(entry.path)
    rows.push(
      <li key={entry.path} className={`fitem${off ? ' off' : ''}`}>
        <label className="check">
          <input type="checkbox" checked={!off} onChange={e => onToggle(entry.path, e.target.checked)} />
          <span className="fname">{entry.name}</span>
          <span className="size">{formatSize(sizes.get(entry.path))}</span>
        </label>
      </li>
    )
  }

  if (!rows.length) return null
  return <ul>{rows}</ul>
}

async function downloadContents (repo, onProgress) {
  const queue = [...repo.files]
  const out = new Map()
  const total = queue.length

  const worker = async () => {
    while (queue.length) {
      const file = queue.shift()
      try {
        const res = await fetch(rawUrl(repo, file), { signal: AbortSignal.timeout(20000) })
        if (!res.ok) throw new Error(String(res.status))
        out.set(file.path, await res.text())
      } catch (err) {
        const why = err && err.name === 'TimeoutError' ? 'tiempo agotado' : 'error de red'
        out.set(file.path, `// no se pudo descargar el archivo (${why}): ${file.path}\n`)
      }
      onProgress(out.size, total)
    }
  }

  await Promise.all(Array.from({ length: 6 }, worker))
  return out
}

const numeric = value => Number(value)

export default function Home () {
  const [repoUrl, setRepoUrl] = useState('')
  const [folder, setFolder] = useState('')
  const [opts, setOpts] = useState(DEFAULT_OPTS)
  const [tab, setTab] = useState('preview')

  const [repo, setRepo] = useState(null)
  const [contents, setContents] = useState(null)
  const [progress, setProgress] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [excluded, setExcluded] = useState(() => new Set())
  const [fileFilter, setFileFilter] = useState('')

  const runId = useRef(0)

  const set = (key, value) => setOpts(prev => ({ ...prev, [key]: value }))

  const fullTree = useMemo(() => (repo ? buildTree(repo.files.map(f => f.path)) : null), [repo])
  const tree = useMemo(() => {
    if (!repo) return null
    if (!excluded.size) return fullTree
    return buildTree(repo.files.filter(f => !excluded.has(f.path)).map(f => f.path))
  }, [repo, fullTree, excluded])

  const sizes = useMemo(() => new Map(repo ? repo.files.map(f => [f.path, f.size]) : []), [repo])
  const allPaths = useMemo(() => (repo ? repo.files.map(f => f.path) : []), [repo])

  // Los archivos excluidos no se listan ni se incrustan (tampoco si otro .tex los \input).
  const visibleContents = useMemo(() => {
    if (!contents) return null
    if (!excluded.size) return contents
    const out = new Map()
    for (const [path, body] of contents) {
      if (!excluded.has(path)) out.set(path, body)
    }
    return out
  }, [contents, excluded])

  const excludedCount = allPaths.reduce((n, p) => (excluded.has(p) ? n + 1 : n), 0)

  const tex = useMemo(() => {
    if (!tree || !visibleContents || tab !== 'latex') return ''
    return buildTex({ tree, contents: visibleContents, opts })
  }, [tree, visibleContents, tab, opts])

  function toggleFile (path, on) {
    setExcluded(prev => {
      const next = new Set(prev)
      if (on) next.delete(path)
      else next.add(path)
      return next
    })
  }

  function toggleMany (paths, on) {
    setExcluded(prev => {
      const next = new Set(prev)
      for (const p of paths) {
        if (on) next.delete(p)
        else next.add(p)
      }
      return next
    })
  }

  async function onSubmit (event) {
    event.preventDefault()
    const id = ++runId.current
    setError('')
    setCopied(false)
    setBusy(true)
    setRepo(null)
    setContents(null)
    setProgress(null)
    setExcluded(new Set())
    setFileFilter('')

    try {
      const data = await fetchRepoData(repoUrl, folder)
      if (id !== runId.current) return
      setRepo(data)
      setProgress({ done: 0, total: data.total })
      const files = await downloadContents(data, (done, total) => {
        if (id === runId.current) setProgress({ done, total })
      })
      if (id !== runId.current) return
      setContents(files)
      setProgress(null)
      setTab('preview')
    } catch (err) {
      if (id !== runId.current) return
      setError(err.message || 'Algo salió mal.')
      setRepo(null)
      setProgress(null)
    } finally {
      if (id === runId.current) setBusy(false)
    }
  }

  async function fetchRepoData (url, path) {
    const query = `repo=${encodeURIComponent(url)}&folder=${encodeURIComponent(path)}`
    let res
    try {
      res = await fetch(`/api/repo?${query}`, { signal: AbortSignal.timeout(45000) })
    } catch (err) {
      throw new Error(
        err && err.name === 'TimeoutError'
          ? 'GitHub tardó demasiado. Prueba de nuevo o indica una carpeta más pequeña.'
          : 'No se pudo contactar con el servidor.'
      )
    }
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || 'No se pudo leer el repositorio.')
    return data
  }

  async function onCopy () {
    try {
      await navigator.clipboard.writeText(tex)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Tu navegador no permitió copiar. Selecciona el texto manualmente.')
    }
  }

  function onPrint () {
    setTab('preview')
    setTimeout(() => window.print(), 50)
  }

  const ready = Boolean(repo && contents && tree)
  const notebookStyle = {
    '--cols': opts.columns,
    '--font': `${opts.fontSize}pt`,
    '--leading': opts.lineHeight,
    '--gap': `${opts.columnGap}mm`,
    '--tab': opts.tabSize
  }

  return (
    <main className="wrap">
      <style>{`@page { size: A4 ${opts.orientation}; margin: 10mm; }`}</style>

      <header className="top no-print">
        <div>
          <h1>codes2pdf</h1>
          <p>Pega la URL de un repo de GitHub y obtén un notebook en PDF.</p>
        </div>
      </header>

      <form className="card no-print" onSubmit={onSubmit}>
        <div className="row">
          <div className="field grow">
            <label htmlFor="repo">Repositorio</label>
            <input
              id="repo"
              type="text"
              placeholder="https://github.com/usuario/repo/tree/main/src"
              value={repoUrl}
              onChange={e => setRepoUrl(e.target.value)}
              autoFocus
            />
          </div>
          <div className="field folder">
            <label htmlFor="folder">Carpeta</label>
            <input
              id="folder"
              type="text"
              placeholder="vacío = todo"
              value={folder}
              onChange={e => setFolder(e.target.value)}
            />
          </div>
          <button type="submit" disabled={busy}>
            {busy ? 'Generando…' : 'Generar notebook'}
          </button>
        </div>

        <p className="group">Portada</p>
        <div className="grid">
          <div className="field wide">
            <label htmlFor="title">Título</label>
            <input id="title" value={opts.title} onChange={e => set('title', e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="team">Equipo</label>
            <input id="team" placeholder="opcional" value={opts.team} onChange={e => set('team', e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="university">Universidad</label>
            <input id="university" placeholder="opcional" value={opts.university} onChange={e => set('university', e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="initials">Iniciales</label>
            <input id="initials" placeholder="esquina superior" maxLength={12} value={opts.initials} onChange={e => set('initials', e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="date">Fecha</label>
            <input id="date" placeholder="vacío = hoy" value={opts.date} onChange={e => set('date', e.target.value)} />
          </div>
        </div>

        <p className="group">Diseño</p>
        <div className="grid">
          <Select
            label="Columnas"
            value={opts.columns}
            onChange={v => set('columns', numeric(v))}
            options={[
              { value: 1, label: '1 columna' },
              { value: 2, label: '2 columnas' },
              { value: 3, label: '3 columnas' }
            ]}
          />
          <Select
            label="Tamaño de letra (pt)"
            value={opts.fontSize}
            onChange={v => set('fontSize', numeric(v))}
            options={[6, 7, 8, 9, 10, 11, 12].map(v => ({ value: v, label: `${v} pt` }))}
          />
          <Select
            label="Interlineado"
            value={opts.lineHeight}
            onChange={v => set('lineHeight', numeric(v))}
            options={[1, 1.1, 1.25, 1.4, 1.6].map(v => ({ value: v, label: `${v} ×` }))}
          />
          <Select
            label="Espacio entre columnas"
            value={opts.columnGap}
            onChange={v => set('columnGap', numeric(v))}
            options={[2, 3, 5, 8, 12].map(v => ({ value: v, label: `${v} mm` }))}
          />
          <Select
            label="Orientación"
            value={opts.orientation}
            onChange={v => set('orientation', v)}
            options={[
              { value: 'landscape', label: 'Horizontal (A4)' },
              { value: 'portrait', label: 'Vertical (A4)' }
            ]}
          />
          <Select
            label="Tabulación"
            value={opts.tabSize}
            onChange={v => set('tabSize', numeric(v))}
            options={[1, 2, 4, 8].map(v => ({ value: v, label: `${v} espacio${v > 1 ? 's' : ''}` }))}
          />
          <div className="checks">
            <Check label="Índice" checked={opts.toc} onChange={v => set('toc', v)} />
            <Check label="Números de línea" checked={opts.lineNumbers} onChange={v => set('lineNumbers', v)} />
          </div>
        </div>
      </form>

      {error && <p className="status error no-print">{error}</p>}
      {progress && (
        <p className="status no-print">
          Descargando archivos… {progress.done} / {progress.total}
        </p>
      )}
      {ready && (
        <p className="status no-print">
          {repo.fullName} · rama <strong>{repo.ref}</strong>
          {repo.subpath && <> · carpeta <strong>{repo.subpath}</strong></>}
          {' · '}
          {excludedCount
            ? <><strong>{allPaths.length - excludedCount}</strong> de {allPaths.length} archivos</>
            : <>{allPaths.length} archivos</>}
          {excludedCount > 0 && (
            <>
              {' · '}
              <button className="linkish" type="button" onClick={() => setExcluded(new Set())}>
                restaurar {excludedCount}
              </button>
            </>
          )}
          {repo.truncated && ' · ⚠ repositorio enorme: el listado está incompleto, indica una carpeta para acotarlo'}
        </p>
      )}

      {ready && (
        <>
          <div className="toolbar no-print">
            <div className="tabs">
              <button className={`tab ${tab === 'preview' ? 'active' : ''}`} onClick={() => setTab('preview')} type="button">
                Vista previa
              </button>
              <button className={`tab ${tab === 'latex' ? 'active' : ''}`} onClick={() => setTab('latex')} type="button">
                Código LaTeX
              </button>
              <button className={`tab ${tab === 'files' ? 'active' : ''}`} onClick={() => setTab('files')} type="button">
                Archivos{excludedCount > 0 ? ` (${allPaths.length - excludedCount})` : ''}
              </button>
            </div>
            <button className="secondary" onClick={onCopy} type="button" disabled={tab !== 'latex'}>
              <span className={copied ? 'copied' : undefined}>{copied ? '¡Copiado!' : 'Copiar LaTeX'}</span>
            </button>
            <button type="button" onClick={onPrint}>Guardar como PDF</button>
          </div>

          <div className={`panel ${tab === 'preview' ? 'active' : ''} preview`}>
            <div className="sheet">
              <article className="notebook" style={notebookStyle}>
                <div className="cover">
                  <h1>{opts.title || DEFAULT_OPTS.title}</h1>
                  {opts.team && <p>{opts.team}</p>}
                  {opts.university && <p>{opts.university}</p>}
                </div>
                {opts.toc && (
                  <nav className="toc">
                    <TocList node={tree} />
                  </nav>
                )}
                <div className="pagebreak" />
                {tree.entries.map(entry => (
                  <Section key={entry.path} entry={entry} depth={0} contents={contents} lineNumbers={opts.lineNumbers} />
                ))}
              </article>
            </div>
          </div>

          <div className={`panel ${tab === 'latex' ? 'active' : ''}`}>
            <div className="texbox">
              <pre>{tex}</pre>
            </div>
            <p className="status no-print">
              Copia esto y pégalo en Overleaf para compilar el PDF con <code>pdflatex</code>.
            </p>
          </div>

          <div className={`panel ${tab === 'files' ? 'active' : ''} files no-print`}>
            <div className="filebox">
              <div className="filetools">
                <input
                  type="search"
                  aria-label="Filtrar archivos"
                  placeholder="Filtrar por nombre o ruta…"
                  value={fileFilter}
                  onChange={e => setFileFilter(e.target.value)}
                />
                <span className="count">
                  {allPaths.length - excludedCount} de {allPaths.length} archivos
                  {excludedCount > 0 && ` · ${excludedCount} excluidos`}
                </span>
                <button type="button" className="secondary" onClick={() => toggleMany(allPaths, true)}>
                  Incluir todos
                </button>
                <button type="button" className="secondary" onClick={() => toggleMany(allPaths, false)}>
                  Excluir todos
                </button>
              </div>

              {fullTree && fileFilter.trim() && !hasMatch(fullTree, fileFilter.trim().toLowerCase()) ? (
                <p className="status">Ningún archivo coincide con “{fileFilter.trim()}”.</p>
              ) : (
                <div className="filelist">
                  <FilesTree
                    node={fullTree}
                    sizes={sizes}
                    excluded={excluded}
                    onToggle={toggleFile}
                    onToggleMany={toggleMany}
                    query={fileFilter.trim().toLowerCase()}
                  />
                </div>
              )}

              <p className="status">
                Desmarca los archivos que no quieras: la vista previa, el índice y el LaTeX se
                actualizan al instante. Al regenerar el notebook vuelve a incluirse todo.
              </p>
            </div>
          </div>
        </>
      )}

      {!ready && !error && !progress && (
        <p className="status no-print">
          Se toman los archivos de código del repo, se arman con índice, resaltado de sintaxis y las
          opciones de diseño que elijas. En la pestaña <strong>Archivos</strong> ves el listado de lo
          que se trajo del repositorio y puedes excluir los que no quieras. Luego puedes guardarlo
          como PDF o copiar el LaTeX.
        </p>
      )}
    </main>
  )
}
