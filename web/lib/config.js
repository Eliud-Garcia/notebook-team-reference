// Debe coincidir con los idiomas registrados en lib/highlight.js.
export const EXTENSIONS = [
  // originales de codes2pdf
  '.cc', '.cpp', '.c', '.h', '.hpp', '.java', '.py', '.tex',
  // comunes en cualquier repo
  '.js', '.jsx', '.ts', '.tsx', '.go', '.rs', '.rb', '.kt', '.swift',
  '.cs', '.php', '.sh', '.sql', '.lua', '.r', '.pl', '.m'
]

// Directorios que nunca interesan en un notebook.
export const IGNORE_DIRS = [
  'node_modules', 'vendor', 'dist', 'build', 'out', 'target',
  'coverage', '__pycache__', 'third_party', 'bower_components'
]

// Límites para no traer repos gigantes de golpe.
export const MAX_FILES = 300
export const MAX_FILE_SIZE = 200 * 1024 // 200 KB por archivo

// Jerarquía LaTeX: dir raíz -> subdirectorio -> subsubdirectorio.
export const SECTIONS = ['section', 'subsection', 'subsubsection']

// Opciones por defecto de la interfaz (vista previa y LaTeX usan las mismas).
export const DEFAULT_OPTS = {
  title: 'Team Notebook',
  team: '',
  university: '',
  initials: '',
  date: '',
  columns: 3,
  fontSize: 8,
  lineHeight: 1.25,
  columnGap: 3,
  orientation: 'landscape',
  tabSize: 1,
  toc: true,
  lineNumbers: false
}
