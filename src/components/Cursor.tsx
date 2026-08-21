'use client'
import { useEffect, useRef } from 'react'

/** Blueprint cursor: a lerped ring in difference blend mode that expands and
 *  labels itself over interactive rows. */
const INTERACTIVE = '.t-row,.ar,.d-it,.tp-btn,.tp-close,.hb,.fb,.snav-btn,.hero-cta,.d-lnk'

export default function Cursor() {
  const ring = useRef<HTMLDivElement>(null)
  const label = useRef<HTMLSpanElement>(null)
  const wrap = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let mx = 0, my = 0, cx = 0, cy = 0, raf = 0
    const onMove = (e: MouseEvent) => { mx = e.clientX; my = e.clientY }
    const loop = () => {
      cx += (mx - cx) * 0.28
      cy += (my - cy) * 0.28
      if (wrap.current) wrap.current.style.transform = `translate(${cx}px,${cy}px)`
      raf = requestAnimationFrame(loop)
    }
    const onOver = (e: MouseEvent) => {
      const el = (e.target as HTMLElement)?.closest?.(INTERACTIVE)
      if (el) {
        document.body.classList.add('cur-expand')
        if (label.current) {
          label.current.textContent = el.classList.contains('t-row') || el.classList.contains('d-it')
            ? 'Open →'
            : el.classList.contains('ar')
              ? 'Filter →'
              : ''
        }
      } else {
        document.body.classList.remove('cur-expand')
      }
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseover', onOver)
    loop()
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseover', onOver)
      cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <div id="cur" ref={wrap} aria-hidden="true">
      <div id="cur-o" ref={ring} />
      <span id="cur-l" ref={label} />
    </div>
  )
}
