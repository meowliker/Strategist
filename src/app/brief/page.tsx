'use client'
import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

function BriefInner() {
  const params = useSearchParams()
  const product = params.get('product') ?? 'all'
  const [transcript, setTranscript] = useState('')
  const [brief, setBrief] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  const generate = async () => {
    if (!transcript.trim()) return
    setLoading(true)
    setError('')
    setBrief('')
    try {
      const res = await fetch('/api/brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript, product }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed')
      setBrief(data.brief)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const copy = async () => {
    await navigator.clipboard.writeText(brief)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const sections = brief ? brief.split(/^## /m).filter(Boolean).map(s => {
    const nl = s.indexOf('\n')
    return { title: s.slice(0, nl).trim(), body: s.slice(nl + 1).trim() }
  }) : []

  return (
    <>
      <div className="phead">
        <p className="phead-ey">07 · Brief Generator</p>
        <h1 className="phead-ttl">Turn inspiration into a brief</h1>
        <p className="phead-sub">
          Paste a transcript from any inspiration video. The system rewrites it using what
          actually wins for this product — same length, adapted framing.
        </p>
      </div>

      <div className="brief-wrap">
        <div className="brief-input-block">
          <div className="brief-input-hdr">
            <label className="brief-lbl">Inspiration transcript</label>
            <span className="brief-chars">{transcript.length} chars</span>
          </div>
          <textarea
            className="brief-ta"
            placeholder="Paste the transcript here — timestamps optional, voiceover or captions both work..."
            value={transcript}
            onChange={e => setTranscript(e.target.value)}
            rows={10}
          />
          <button
            className={`brief-btn${loading ? ' loading' : ''}`}
            onClick={generate}
            disabled={loading || !transcript.trim()}
          >
            {loading ? 'Generating…' : 'Generate Brief'}
          </button>
          {error && <div className="brief-error">{error}</div>}
        </div>

        {sections.length > 0 && (
          <div className="brief-out">
            <div className="brief-out-hdr">
              <span className="brief-out-ttl">Generated Brief</span>
              <button className="brief-copy" onClick={copy}>{copied ? 'Copied!' : 'Copy all'}</button>
            </div>
            {sections.map((s, i) => (
              <div className="brief-section" key={i}>
                <div className="brief-sec-ttl">{s.title}</div>
                <div className="brief-sec-body">{s.body}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

export default function BriefPage() {
  return (
    <Suspense>
      <BriefInner />
    </Suspense>
  )
}
