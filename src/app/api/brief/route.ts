import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { loadSynthesis, loadCombinations } from '../../../lib/data/research'
import { PRODUCTS } from '../../../lib/products'
import type { ProductKey } from '../../../lib/data/types'

export const dynamic = 'force-dynamic'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({})) as { transcript?: string; product?: string }
  const { transcript, product } = body

  if (!transcript?.trim()) return NextResponse.json({ error: 'transcript required' }, { status: 400 })

  const productKey = (product ?? 'all') as ProductKey | 'all'
  const productConfig = PRODUCTS.find(p => p.key === productKey)
  const productName = productConfig?.name ?? 'this product'
  const [syntheses, combos] = await Promise.all([loadSynthesis(productKey), loadCombinations(productKey)])

  const synth = syntheses[0]
  const topCombos = combos.bets.slice(0, 5).map((c, i) =>
    `${i + 1}. ${c.angle} × ${c.persona} × ${c.hookType} — ${c.wins}W / ${c.losses}L`
  ).join('\n')
  const dyingCombos = combos.dying.slice(0, 3).map((c) =>
    `- ${c.angle} × ${c.persona} × ${c.hookType} (${c.losses}L, 0W)`
  ).join('\n')
  const fadingPatterns = combos.fadingPatterns.join('\n')

  const hookFormulas = synth?.hookFormulas.slice(0, 5).map((h) =>
    `- ${h.hookType} (${h.wins}W/${h.losses}L): "${h.example}" — ${h.whyItWorks}`
  ).join('\n') ?? ''

  const avoid = synth?.avoid.map((a) => `- ${a.thing}: ${a.reason}`).join('\n') ?? ''
  const topPattern = synth?.topPattern ?? ''

  const charCount = transcript.length

  const SYSTEM = `You are a creative strategist writing ad briefs for a direct-response ecommerce brand.
You are given:
1. A transcript from an inspiration video (used ONLY for structure, pacing, and length — not for topic)
2. The product you are writing for: ${productName}
3. Data on what actually wins for ${productName} — combinations, hook formulas, vocabulary, patterns to avoid

Your job: write a creative brief for ${productName} that:
- Borrows the STRUCTURE and LENGTH of the inspiration transcript
- Uses the winning angles, personas, hooks, and vocabulary for ${productName}
- Is entirely about ${productName} — not about whatever the inspiration video was about
- Keeps the total script content roughly the same character count as the input (±10%)
Do not mention the source transcript or that you rewrote anything.
Be specific and concrete — no filler, no generic advice.`

  const USER = `INSPIRATION TRANSCRIPT — use for structure/length only (${charCount} characters):
${transcript}

---
PRODUCT: ${productName}
WHAT WINS FOR ${productName.toUpperCase()}:

Top combinations (angle × persona × hook type):
${topCombos || 'Not enough data yet.'}

Hook formulas that work:
${hookFormulas || 'Not enough data yet.'}

Pattern to replicate:
${topPattern || 'Not enough data yet.'}

${dyingCombos ? `DYING — avoid these combinations:\n${dyingCombos}` : ''}
${fadingPatterns ? `FADING PATTERNS:\n${fadingPatterns}` : ''}
${avoid ? `WHAT TO AVOID:\n${avoid}` : ''}

---
Write a complete creative brief with these exact sections:

## Angle / Core Message
One sentence. The persuasive argument this ad makes.

## Target Persona
Who this is speaking to. Specific. One line.

## Hook Options
Write 3 hook variations, each on its own line, numbered. Each must use a different hook type from the winning formulas above. Keep each under 2 sentences.

## Script Arc
The beats in order. Number each beat. For each: beat name + what happens + the exact line or action.

## Vocabulary to Use
Bullet list of specific phrases drawn from winning vocabulary and adapted from the transcript.

## Production Notes
Format, talent description, setting, pacing, caption style. Concrete — not generic.

## What to Avoid
Bullet list of specific things that lose for this product.

## CTA
The exact call-to-action line to use.`

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    messages: [{ role: 'user', content: USER }],
    system: SYSTEM,
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : ''
  return NextResponse.json({ brief: text, charCount })
}
