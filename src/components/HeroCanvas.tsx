'use client'
import { useEffect, useRef } from 'react'

/** The blueprint's drifting green bezier field behind the hero. */
const LINES = [
  { sy: 0.35, ey: 0.55, amp: 180, phase: 0, speed: 0.008 },
  { sy: 0.45, ey: 0.65, amp: 140, phase: 0.8, speed: 0.006 },
  { sy: 0.25, ey: 0.5, amp: 220, phase: 1.6, speed: 0.01 },
  { sy: 0.6, ey: 0.8, amp: 160, phase: 2.4, speed: 0.007 },
  { sy: 0.15, ey: 0.4, amp: 200, phase: 3.2, speed: 0.009 },
]

export default function HeroCanvas() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let w = 0, h = 0, t = 0, raf = 0
    const resize = () => {
      w = canvas.offsetWidth; h = canvas.offsetHeight
      canvas.width = w * devicePixelRatio
      canvas.height = h * devicePixelRatio
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.scale(devicePixelRatio, devicePixelRatio)
    }
    resize()
    window.addEventListener('resize', resize)

    const draw = () => {
      ctx.clearRect(0, 0, w, h)
      LINES.forEach((l, i) => {
        const y1 = l.sy * h, y2 = l.ey * h
        ctx.beginPath()
        ctx.moveTo(-40, y1)
        ctx.bezierCurveTo(
          w * 0.3 + Math.sin(t * l.speed + l.phase) * l.amp,
          y1 + Math.cos(t * l.speed * 1.3 + l.phase) * 60,
          w * 0.7 + Math.cos(t * l.speed + l.phase + 1) * l.amp,
          y2 + Math.sin(t * l.speed * 1.1 + l.phase) * 60,
          w + 40, y2,
        )
        ctx.strokeStyle = `rgba(82,196,26,${0.06 - i * 0.005})`
        ctx.lineWidth = 1
        ctx.stroke()
      })
      t++
      raf = requestAnimationFrame(draw)
    }
    draw()
    return () => { window.removeEventListener('resize', resize); cancelAnimationFrame(raf) }
  }, [])

  return <canvas id="hero-canvas" ref={ref} aria-hidden="true" />
}
