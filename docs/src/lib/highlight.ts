// Hand-rolled syntax highlighter — tiny, zero deps, enough for docs code blocks.
// Produces an array of {text, kind} tokens the Highlight component paints.
// Supported languages: json, bash, javascript, typescript, python, http.

export type Token = { text: string; kind: Kind }
export type Kind = 'plain' | 'string' | 'number' | 'boolean' | 'null' | 'key' | 'punct' | 'keyword' | 'comment' | 'builtin' | 'method' | 'url' | 'flag' | 'header'

const JS_KEYWORDS = new Set([
  'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'async', 'await',
  'try', 'catch', 'finally', 'throw', 'new', 'typeof', 'instanceof', 'import', 'from', 'export',
  'default', 'class', 'extends', 'super', 'this', 'true', 'false', 'null', 'undefined', 'in', 'of',
  'do', 'switch', 'case', 'break', 'continue', 'void', 'yield', 'static', 'public', 'private',
])

const PY_KEYWORDS = new Set([
  'def', 'return', 'if', 'elif', 'else', 'for', 'while', 'try', 'except', 'finally', 'with', 'as',
  'import', 'from', 'class', 'in', 'not', 'and', 'or', 'is', 'True', 'False', 'None', 'pass',
  'break', 'continue', 'lambda', 'yield', 'raise', 'global', 'nonlocal',
])

const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'])

export function highlight(code: string, lang: string | undefined): Token[] {
  switch ((lang ?? '').toLowerCase()) {
    case 'json':
      return highlightJSON(code)
    case 'bash':
    case 'sh':
    case 'shell':
    case 'curl':
      return highlightBash(code)
    case 'javascript':
    case 'js':
    case 'typescript':
    case 'ts':
    case 'fetch':
      return highlightJS(code)
    case 'python':
    case 'py':
      return highlightPython(code)
    case 'http':
      return highlightHTTP(code)
    default:
      return [{ text: code, kind: 'plain' }]
  }
}

function highlightJSON(code: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < code.length) {
    const c = code[i]
    if (c === '"') {
      let j = i + 1
      while (j < code.length && code[j] !== '"') {
        if (code[j] === '\\' && j + 1 < code.length) j += 2
        else j++
      }
      j = Math.min(j + 1, code.length)
      const str = code.slice(i, j)
      const after = code.slice(j).match(/^\s*:/)
      tokens.push({ text: str, kind: after ? 'key' : 'string' })
      i = j
    } else if (/[0-9.\-+eE]/.test(c)) {
      let j = i
      if (code[j] === '-' || code[j] === '+') j++
      while (j < code.length && /[0-9.eE+\-]/.test(code[j])) j++
      tokens.push({ text: code.slice(i, j), kind: 'number' })
      i = j
    } else if (code.slice(i, i + 4) === 'true' || code.slice(i, i + 5) === 'false') {
      const len = code[i] === 't' ? 4 : 5
      tokens.push({ text: code.slice(i, i + len), kind: 'boolean' })
      i += len
    } else if (code.slice(i, i + 4) === 'null') {
      tokens.push({ text: 'null', kind: 'null' })
      i += 4
    } else if (/[{}[\],:]/.test(c)) {
      tokens.push({ text: c, kind: 'punct' })
      i++
    } else {
      tokens.push({ text: c, kind: 'plain' })
      i++
    }
  }
  return mergeAdjacent(tokens)
}

function highlightBash(code: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < code.length) {
    // Line comment
    if (code[i] === '#' && (i === 0 || code[i - 1] === '\n')) {
      const end = code.indexOf('\n', i)
      const j = end === -1 ? code.length : end
      tokens.push({ text: code.slice(i, j), kind: 'comment' })
      i = j
      continue
    }
    // String (single or double quoted)
    if (code[i] === '"' || code[i] === "'") {
      const q = code[i]
      let j = i + 1
      while (j < code.length && code[j] !== q) {
        if (code[j] === '\\' && j + 1 < code.length) j += 2
        else j++
      }
      j = Math.min(j + 1, code.length)
      tokens.push({ text: code.slice(i, j), kind: 'string' })
      i = j
      continue
    }
    // Flag (-X, --header)
    if (code[i] === '-' && (i === 0 || /\s/.test(code[i - 1]))) {
      let j = i
      while (j < code.length && !/\s/.test(code[j])) j++
      tokens.push({ text: code.slice(i, j), kind: 'flag' })
      i = j
      continue
    }
    // Builtin commands at start of word
    if (/[a-zA-Z_]/.test(code[i])) {
      let j = i
      while (j < code.length && /[a-zA-Z0-9_.-]/.test(code[j])) j++
      const word = code.slice(i, j)
      const prevNonSpace = findPrevNonSpace(code, i - 1)
      const atStart = i === 0 || code[prevNonSpace] === '\n' || prevNonSpace < 0
      if (atStart && /^(curl|npm|node|yarn|pnpm|npx|cd|ls|cat|echo|export|git|fly|docker|python|pip|tsx)$/i.test(word)) {
        tokens.push({ text: word, kind: 'builtin' })
      } else if (HTTP_METHODS.has(word)) {
        tokens.push({ text: word, kind: 'method' })
      } else {
        tokens.push({ text: word, kind: 'plain' })
      }
      i = j
      continue
    }
    tokens.push({ text: code[i], kind: 'plain' })
    i++
  }
  return mergeAdjacent(tokens)
}

function highlightJS(code: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < code.length) {
    // Line comment
    if (code[i] === '/' && code[i + 1] === '/') {
      const end = code.indexOf('\n', i)
      const j = end === -1 ? code.length : end
      tokens.push({ text: code.slice(i, j), kind: 'comment' })
      i = j
      continue
    }
    // Block comment
    if (code[i] === '/' && code[i + 1] === '*') {
      const end = code.indexOf('*/', i + 2)
      const j = end === -1 ? code.length : end + 2
      tokens.push({ text: code.slice(i, j), kind: 'comment' })
      i = j
      continue
    }
    // String
    if (code[i] === '"' || code[i] === "'" || code[i] === '`') {
      const q = code[i]
      let j = i + 1
      while (j < code.length && code[j] !== q) {
        if (code[j] === '\\' && j + 1 < code.length) j += 2
        else if (q === '`' && code[j] === '$' && code[j + 1] === '{') {
          const close = code.indexOf('}', j)
          if (close === -1) break
          j = close + 1
        } else j++
      }
      j = Math.min(j + 1, code.length)
      tokens.push({ text: code.slice(i, j), kind: 'string' })
      i = j
      continue
    }
    // Number
    if (/[0-9]/.test(code[i]) && (i === 0 || !/[a-zA-Z_]/.test(code[i - 1]))) {
      let j = i
      while (j < code.length && /[0-9.eE_]/.test(code[j])) j++
      tokens.push({ text: code.slice(i, j), kind: 'number' })
      i = j
      continue
    }
    // Word
    if (/[a-zA-Z_$]/.test(code[i])) {
      let j = i
      while (j < code.length && /[a-zA-Z0-9_$]/.test(code[j])) j++
      const word = code.slice(i, j)
      if (JS_KEYWORDS.has(word)) tokens.push({ text: word, kind: 'keyword' })
      else if (word === 'true' || word === 'false') tokens.push({ text: word, kind: 'boolean' })
      else if (word === 'null' || word === 'undefined') tokens.push({ text: word, kind: 'null' })
      else tokens.push({ text: word, kind: 'plain' })
      i = j
      continue
    }
    tokens.push({ text: code[i], kind: 'plain' })
    i++
  }
  return mergeAdjacent(tokens)
}

function highlightPython(code: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < code.length) {
    if (code[i] === '#') {
      const end = code.indexOf('\n', i)
      const j = end === -1 ? code.length : end
      tokens.push({ text: code.slice(i, j), kind: 'comment' })
      i = j
      continue
    }
    if (code[i] === '"' || code[i] === "'") {
      const q = code[i]
      let j = i + 1
      while (j < code.length && code[j] !== q) {
        if (code[j] === '\\' && j + 1 < code.length) j += 2
        else j++
      }
      j = Math.min(j + 1, code.length)
      tokens.push({ text: code.slice(i, j), kind: 'string' })
      i = j
      continue
    }
    if (/[0-9]/.test(code[i]) && (i === 0 || !/[a-zA-Z_]/.test(code[i - 1]))) {
      let j = i
      while (j < code.length && /[0-9.]/.test(code[j])) j++
      tokens.push({ text: code.slice(i, j), kind: 'number' })
      i = j
      continue
    }
    if (/[a-zA-Z_]/.test(code[i])) {
      let j = i
      while (j < code.length && /[a-zA-Z0-9_]/.test(code[j])) j++
      const word = code.slice(i, j)
      if (PY_KEYWORDS.has(word)) tokens.push({ text: word, kind: 'keyword' })
      else tokens.push({ text: word, kind: 'plain' })
      i = j
      continue
    }
    tokens.push({ text: code[i], kind: 'plain' })
    i++
  }
  return mergeAdjacent(tokens)
}

function highlightHTTP(code: string): Token[] {
  const tokens: Token[] = []
  const lines = code.split('\n')
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li]
    const methodMatch = /^([A-Z]+)\s+(\S+)(.*)$/.exec(line)
    if (li === 0 && methodMatch && HTTP_METHODS.has(methodMatch[1])) {
      tokens.push({ text: methodMatch[1], kind: 'method' })
      tokens.push({ text: ' ', kind: 'plain' })
      tokens.push({ text: methodMatch[2], kind: 'url' })
      tokens.push({ text: methodMatch[3], kind: 'plain' })
    } else {
      const headerMatch = /^([A-Za-z-]+):\s(.*)$/.exec(line)
      if (headerMatch) {
        tokens.push({ text: headerMatch[1], kind: 'header' })
        tokens.push({ text: ': ', kind: 'punct' })
        tokens.push({ text: headerMatch[2], kind: 'string' })
      } else {
        tokens.push({ text: line, kind: 'plain' })
      }
    }
    if (li < lines.length - 1) tokens.push({ text: '\n', kind: 'plain' })
  }
  return mergeAdjacent(tokens)
}

function findPrevNonSpace(code: string, start: number): number {
  let i = start
  while (i >= 0 && code[i] === ' ') i--
  return i
}

function mergeAdjacent(tokens: Token[]): Token[] {
  const out: Token[] = []
  for (const t of tokens) {
    const last = out[out.length - 1]
    if (last && last.kind === t.kind) last.text += t.text
    else out.push({ ...t })
  }
  return out
}
