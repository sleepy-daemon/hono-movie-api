import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { dereference, type OpenAPIDoc, type OpenAPISchema } from '../api'
import { Pill } from './ui'

function typeLabel(s: OpenAPISchema | null | undefined): string {
  if (!s) return 'any'
  if (s.const !== undefined) return JSON.stringify(s.const)
  if (s.enum) return s.enum.map((v) => JSON.stringify(v)).join(' | ')
  if (Array.isArray(s.type)) return s.type.join(' | ')
  if (s.type === 'array') return `${typeLabel(s.items)}[]`
  if (s.type) return s.type
  if (s.oneOf || s.anyOf) return (s.oneOf ?? s.anyOf)!.map(typeLabel).join(' | ')
  if (s.properties) return 'object'
  return 'any'
}

export function SchemaView({ doc, schema, depth = 0 }: { doc: OpenAPIDoc; schema: OpenAPISchema | undefined; depth?: number }) {
  const resolved = dereference(doc, schema)
  if (!resolved) return <span className="mono text-xs text-subtle">—</span>

  if (resolved.type === 'array') {
    const items = dereference(doc, resolved.items)
    return (
      <div className="space-y-1">
        <div className="mono text-xs text-subtle">array of {typeLabel(items)}</div>
        {items?.properties ? <SchemaView doc={doc} schema={items} depth={depth + 1} /> : null}
      </div>
    )
  }

  if (resolved.properties) {
    const req = new Set(resolved.required ?? [])
    return (
      <div className={depth === 0 ? '' : 'border-l border-border/60 pl-4 ml-1'}>
        <ul className="divide-y divide-border/60">
          {Object.entries(resolved.properties).map(([name, propSchema]) => (
            <PropRow key={name} doc={doc} name={name} schema={propSchema} required={req.has(name)} depth={depth} />
          ))}
        </ul>
      </div>
    )
  }

  return <div className="mono text-xs text-subtle">{typeLabel(resolved)}</div>
}

function PropRow({
  doc,
  name,
  schema,
  required,
  depth,
}: {
  doc: OpenAPIDoc
  name: string
  schema: OpenAPISchema
  required: boolean
  depth: number
}) {
  const resolved = dereference(doc, schema)
  const hasNested = !!(resolved?.properties || (resolved?.type === 'array' && dereference(doc, resolved.items)?.properties))
  const [open, setOpen] = useState(depth < 1)

  return (
    <li className="py-2">
      <div className="flex items-start gap-2">
        {hasNested ? (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="mt-0.5 text-subtle hover:text-accent transition-colors"
            aria-expanded={open}
            aria-label={open ? 'Collapse' : 'Expand'}
          >
            <ChevronRight
              size={14}
              className={`transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
              aria-hidden
            />
          </button>
        ) : (
          <span className="mt-0.5 w-[14px]" aria-hidden />
        )}
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="mono text-sm text-fg">{name}</span>
            <span className="mono text-xs text-subtle">{typeLabel(resolved)}</span>
            {required ? <Pill tone="accent">required</Pill> : <Pill>optional</Pill>}
          </div>
          {resolved?.description ? <p className="text-xs text-subtle leading-relaxed">{resolved.description}</p> : null}
          {resolved?.default !== undefined ? (
            <div className="mono text-2xs text-subtle">
              default: <span className="text-fg">{JSON.stringify(resolved.default)}</span>
            </div>
          ) : null}
          {hasNested ? (
            <div className="expand" data-open={open}>
              <div className="pt-2">
                <SchemaView doc={doc} schema={resolved!} depth={depth + 1} />
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </li>
  )
}
