/**
 * Construye el árbol de directorios a partir de la lista plana de rutas,
 * replicando el recorrido de `walk()` de codes2pdf.
 */
function makeNode (name, path) {
  return { name, path, dirs: [], files: [], entries: [] }
}

export function buildTree (paths) {
  const root = makeNode('', '')
  const nodes = new Map([['', root]])

  for (const p of paths) {
    const parts = p.split('/')
    let node = root
    for (let i = 0; i < parts.length - 1; i++) {
      const dirPath = parts.slice(0, i + 1).join('/')
      if (!nodes.has(dirPath)) {
        const child = makeNode(parts[i], dirPath)
        nodes.set(dirPath, child)
        node.dirs.push(child)
      }
      node = nodes.get(dirPath)
    }
    node.files.push({ name: parts[parts.length - 1], path: p })
  }

  sort(root)
  return root
}

function sort (node) {
  node.dirs.sort((a, b) => a.name.localeCompare(b.name))
  node.files.sort((a, b) => a.name.localeCompare(b.name))
  node.entries = [
    ...node.dirs.map(d => ({ type: 'dir', name: d.name, path: d.path, node: d })),
    ...node.files.map(f => ({ type: 'file', name: f.name, path: f.path }))
  ].sort((a, b) => a.name.localeCompare(b.name))
  node.dirs.forEach(sort)
}

export function baseName (path) {
  const name = path.split('/').pop()
  const i = name.lastIndexOf('.')
  return i > 0 ? name.slice(0, i) : name
}

export function slug (path) {
  return path.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}
