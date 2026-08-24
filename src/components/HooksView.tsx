'use client'
import { useState } from 'react'

export interface HookEntry {
  text: string
  creatives: string[]
}

export interface AngleGroup {
  angle: string
  textHooks: HookEntry[]
  voiceoverHooks: HookEntry[]
}

function HookCard({ entry }: { entry: HookEntry }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="hk-card" onClick={() => setOpen((o) => !o)}>
      <div className="hk-card-text">{entry.text}</div>
      {entry.creatives.length > 0 && (
        <div className="hk-card-footer">
          <span className="hk-card-pill">{entry.creatives.length} creative{entry.creatives.length > 1 ? 's' : ''}</span>
          {open && (
            <div className="hk-card-creatives">
              {entry.creatives.map((c) => (
                <span key={c} className="hk-card-cname">{c}</span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function HookColumn({ title, hooks }: { title: string; hooks: HookEntry[] }) {
  if (hooks.length === 0) return null
  return (
    <div className="hk-col">
      <div className="hk-col-hdr">{title} · {hooks.length}</div>
      <div className="hk-col-list">
        {hooks.map((h, i) => <HookCard key={i} entry={h} />)}
      </div>
    </div>
  )
}

export default function HooksView({ groups }: { groups: AngleGroup[] }) {
  if (groups.length === 0) {
    return (
      <div className="empty" style={{ margin: '48px' }}>
        No winning creatives with hook text yet. Run Watch on winners first.
      </div>
    )
  }

  return (
    <div className="hooks-wrap">
      {groups.map((g) => (
        <div className="hooks-group" key={g.angle}>
          <div className="hooks-angle">
            <span className="hooks-angle-name">{g.angle}</span>
            <span className="hooks-angle-count">{g.textHooks.length + g.voiceoverHooks.length}</span>
          </div>
          <div className="hk-cols">
            <HookColumn title="On-screen text" hooks={g.textHooks} />
            <HookColumn title="Voiceover" hooks={g.voiceoverHooks} />
          </div>
        </div>
      ))}
    </div>
  )
}
