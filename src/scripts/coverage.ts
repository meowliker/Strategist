import { ClickUpClient, fieldMap } from '../lib/clickup/client'
import { parseBrief } from '../lib/parse/brief'
import { PRODUCTS, DECIDED_STATUSES, categorise } from '../lib/products'

const FIELDS = ['Creative Structure','Production Style','Hook Type','Angle Tag','Persona Tag','Funnel Type','Creative USP','Drive Link']

async function main(){
  const c = new ClickUpClient(process.env.CLICKUP_TOKEN!)
  const all:any[] = []
  for (const p of PRODUCTS) all.push(...await c.listTasks(p.listId))

  const decided = all.filter(t => (DECIDED_STATUSES as readonly string[]).includes(t.status.status.toLowerCase()))
  const winners = decided.filter(t => categorise(t.status.status) !== 'loser')

  const report = (label:string, set:any[]) => {
    console.log(`\n── ${label} (n=${set.length}) ──`)
    for (const f of FIELDS){
      const n = set.filter(t => fieldMap(t)[f]).length
      const pct = set.length ? Math.round(100*n/set.length) : 0
      console.log(`  ${f.padEnd(20)} ${String(n).padStart(3)}/${set.length}  ${String(pct).padStart(3)}%  ${'▓'.repeat(Math.round(pct/5))}`)
    }
    const briefed = set.filter(t => parseBrief(t.markdown_description ?? t.description).angle).length
    console.log(`  ${'brief table present'.padEnd(20)} ${String(briefed).padStart(3)}/${set.length}  ${String(Math.round(100*briefed/(set.length||1))).padStart(3)}%`)
  }
  report('ALL DECIDED', decided)
  report('WINNERS ONLY', winners)
}
main()
