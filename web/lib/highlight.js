import hljs from 'highlight.js/lib/common'
import latex from 'highlight.js/lib/languages/latex'

// `common` ya trae los 40 idiomas más usados (js, ts, go, rust, java, py...).
hljs.registerLanguage('latex', latex)

const LANG = {
  '.cc': 'cpp',
  '.cpp': 'cpp',
  '.c': 'cpp',
  '.h': 'cpp',
  '.hpp': 'cpp',
  '.m': 'objectivec',
  '.java': 'java',
  '.py': 'python',
  '.tex': 'latex',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.go': 'go',
  '.rs': 'rust',
  '.rb': 'ruby',
  '.kt': 'kotlin',
  '.swift': 'swift',
  '.cs': 'csharp',
  '.php': 'php',
  '.sh': 'bash',
  '.sql': 'sql',
  '.lua': 'lua',
  '.r': 'r',
  '.pl': 'perl'
}

function escapeHtml (text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export function languageOf (path) {
  const i = path.lastIndexOf('.')
  return LANG[i === -1 ? '' : path.slice(i).toLowerCase()] || null
}

export function highlight (text, path) {
  const language = languageOf(path)
  if (!language) return escapeHtml(text)
  try {
    return hljs.highlight(text, { language, ignoreIllegals: true }).value
  } catch {
    return escapeHtml(text)
  }
}
