import { probe, detectCuts, cutsPerMinute } from '../lib/media/probe'
import { extractFrames } from '../lib/media/frames'
import { extractAudio } from '../lib/media/transcribe'
import path from 'node:path'

const file = process.argv[2]
const work = process.argv[3] ?? path.join(path.dirname(file), 'work')

const meta = await probe(file)
console.log('probe      ', JSON.stringify(meta))

const cuts = await detectCuts(file)
console.log('cuts       ', cuts, '| per minute:', cutsPerMinute(cuts, meta.durationSec)?.toFixed(1))

const frames = await extractFrames(file, path.join(work, 'frames'), { durationSec: meta.durationSec ?? 0 })
console.log('frames     ', frames.length, '| hook window:', frames.filter(f => f.isHookFrame).length)
console.log('            timestamps:', frames.map(f => f.tSec.toFixed(2)).join(' '))

if (meta.hasAudio) {
  const wav = path.join(work, 'audio.wav')
  await extractAudio(file, wav)
  console.log('audio      extracted →', wav)
}
