'use client'
import { useEffect, useRef, useState } from 'react'

interface AdResult {
  id: string
  filename: string
  competitor: string | null
  platform: string | null
  notes: string | null
  uploadedAt: string
  hookText: string | null
  hookSpoken: string | null
  angle: string | null
  persona: string | null
  hookType: string | null
  productionStyle: string | null
  creativeStructure: string | null
  painPoints: string[] | null
  ctaText: string | null
  durationSec: number | null
}

function Tag({ label, value }: { label: string; value: string | null }) {
  if (!value) return null
  return (
    <div className="ci-field">
      <span className="ci-label">{label}</span>
      <span className="ci-value">{value}</span>
    </div>
  )
}

function AdCard({ ad }: { ad: AdResult }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="ci-card">
      <div className="ci-card-hd" onClick={() => setOpen(o => !o)} role="button" tabIndex={0}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(o => !o) } }}>
        <div className="ci-card-left">
          <span className="ci-fname">{ad.competitor || 'Unknown'}</span>
          {ad.platform && <span className="ci-platform">{ad.platform}</span>}
          {ad.durationSec && <span className="ci-dur">{ad.durationSec.toFixed(0)}s</span>}
        </div>
        <div className="ci-card-right">
          {ad.angle && <span className="ci-angle-tag">{ad.angle}</span>}
          <span className="ci-chev">{open ? '▴' : '▾'}</span>
        </div>
      </div>

      {open && (
        <div className="ci-card-body">
          {ad.hookText && (
            <div className="ci-hook-block">
              <span className="ci-hook-lbl">On-screen hook</span>
              <div className="ci-hook-text">&ldquo;{ad.hookText}&rdquo;</div>
            </div>
          )}
          {ad.hookSpoken && (
            <div className="ci-hook-block">
              <span className="ci-hook-lbl">Voiceover hook</span>
              <div className="ci-hook-text">&ldquo;{ad.hookSpoken}&rdquo;</div>
            </div>
          )}
          <div className="ci-fields">
            <Tag label="Angle" value={ad.angle} />
            <Tag label="Persona" value={ad.persona} />
            <Tag label="Hook type" value={ad.hookType} />
            <Tag label="Production" value={ad.productionStyle} />
            <Tag label="Structure" value={ad.creativeStructure} />
            <Tag label="CTA" value={ad.ctaText} />
          </div>
          {ad.painPoints && ad.painPoints.length > 0 && (
            <div className="ci-pains">
              <span className="ci-hook-lbl">Pain points</span>
              <ul className="ci-pain-list">
                {ad.painPoints.map((p, i) => <li key={i}>{p}</li>)}
              </ul>
            </div>
          )}
          {ad.notes && <div className="ci-notes">{ad.notes}</div>}
        </div>
      )}
    </div>
  )
}

export default function CompetitorPage() {
  const [ads, setAds] = useState<AdResult[]>([])
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const [drag, setDrag] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const [competitor, setCompetitor] = useState('')
  const [platform, setPlatform] = useState('')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    fetch('/api/competitor/list').then(r => r.json()).then(d => setAds(d.ads ?? []))
  }, [])

  const upload = async (file: File) => {
    setUploading(true)
    setError('')
    setProgress('Uploading…')
    const form = new FormData()
    form.append('file', file)
    if (competitor.trim()) form.append('competitor', competitor)
    if (platform.trim()) form.append('platform', platform)
    if (notes.trim()) form.append('notes', notes)
    try {
      setProgress('Analysing with Claude — this takes ~30s…')
      const res = await fetch('/api/competitor/upload', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Upload failed')
      setProgress('')
      setCompetitor(''); setPlatform(''); setNotes('')
      const list = await fetch('/api/competitor/list').then(r => r.json())
      setAds(list.ads ?? [])
    } catch (e) {
      setError((e as Error).message)
      setProgress('')
    } finally {
      setUploading(false)
    }
  }

  const onFiles = (files: FileList | null) => {
    if (!files?.length) return
    upload(files[0])
  }

  return (
    <>
      <div className="phead">
        <p className="phead-ey">08 · Competitor</p>
        <h1 className="phead-ttl">Competitor ad intelligence</h1>
        <p className="phead-sub">
          Upload any competitor ad video. Claude analyses it blind — extracts the angle, hook, persona, and structure — so you can see exactly what they&apos;re doing.
        </p>
      </div>

      <div className="ci-wrap">
        <div className="ci-upload-block">
          <div
            className={`ci-drop${drag ? ' drag' : ''}`}
            onDragOver={e => { e.preventDefault(); setDrag(true) }}
            onDragLeave={() => setDrag(false)}
            onDrop={e => { e.preventDefault(); setDrag(false); onFiles(e.dataTransfer.files) }}
            onClick={() => fileRef.current?.click()}
          >
            <input ref={fileRef} type="file" accept="video/*" style={{ display: 'none' }}
              onChange={e => onFiles(e.target.files)} />
            {uploading
              ? <div className="ci-drop-msg">{progress}</div>
              : <div className="ci-drop-msg">Drop a video here or <span className="ci-drop-link">click to browse</span></div>
            }
          </div>

          <div className="ci-meta-row">
            <input className="ci-input" placeholder="Competitor name" value={competitor}
              onChange={e => setCompetitor(e.target.value)} disabled={uploading} />
            <select className="ci-input ci-select" value={platform}
              onChange={e => setPlatform(e.target.value)} disabled={uploading}>
              <option value="">Platform (optional)</option>
              <option>Facebook</option>
              <option>Instagram</option>
              <option>TikTok</option>
              <option>YouTube</option>
              <option>Other</option>
            </select>
          </div>
          <textarea className="ci-notes-ta" placeholder="Notes (optional)"
            value={notes} onChange={e => setNotes(e.target.value)}
            rows={2} disabled={uploading} />

          {error && <div className="ci-error">{error}</div>}
        </div>

        {ads.length > 0 && (
          <div className="ci-list">
            <div className="ci-list-hdr">{ads.length} ad{ads.length > 1 ? 's' : ''} analysed</div>
            {ads.map(ad => <AdCard key={ad.id} ad={ad} />)}
          </div>
        )}

        {ads.length === 0 && !uploading && (
          <div className="empty" style={{ padding: '0 48px' }}>
            No competitor ads yet. Upload a video above to get started.
          </div>
        )}
      </div>
    </>
  )
}
