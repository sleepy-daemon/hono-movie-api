import { useMemo } from 'react'
import { highlight, type Kind } from '../lib/highlight'

const KIND_CLASS: Record<Kind, string> = {
  plain: '',
  string: 'text-emerald-300',
  number: 'text-amber-300',
  boolean: 'text-violet-300',
  null: 'text-pink-300',
  key: 'text-sky-300',
  punct: 'text-slate-500',
  keyword: 'text-violet-300',
  comment: 'text-slate-500 italic',
  builtin: 'text-sky-300',
  method: 'text-emerald-300 font-semibold',
  url: 'text-sky-300',
  flag: 'text-amber-300',
  header: 'text-sky-300',
}

export function Highlight({ code, lang }: { code: string; lang?: string }) {
  const tokens = useMemo(() => highlight(code, lang), [code, lang])
  return (
    <>
      {tokens.map((t, i) => (
        <span key={i} className={KIND_CLASS[t.kind]}>
          {t.text}
        </span>
      ))}
    </>
  )
}
