import { NextResponse } from 'next/server'
import { db } from '../../../../db/client'
import { competitorAds } from '../../../../db/schema'
import { desc } from 'drizzle-orm'

export const dynamic = 'force-dynamic'

export async function GET() {
  const rows = await db.select().from(competitorAds).orderBy(desc(competitorAds.uploadedAt))
  return NextResponse.json({ ads: rows })
}
