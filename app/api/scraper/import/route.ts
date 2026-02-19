import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ScraperResult } from '@/types'

export async function POST(req: NextRequest) {
  try {
    const { leads, niche, city }: { leads: ScraperResult[]; niche: string; city: string } =
      await req.json()

    if (!leads || leads.length === 0) {
      return NextResponse.json({ error: 'No hay leads para importar' }, { status: 400 })
    }

    const supabase = await createClient()

    const toInsert = leads.map((lead) => ({
      place_id: lead.place_id,
      business_name: lead.business_name,
      address: lead.address,
      phone: lead.phone,
      website: lead.website,
      rating: lead.rating,
      category: lead.category,
      google_photo_url: lead.google_photo_url,
      niche,
      city,
      status: 'nuevo',
    }))

    // Upsert: si ya existe el place_id, no lo duplica
    const { data, error } = await supabase
      .from('leads')
      .upsert(toInsert, { onConflict: 'place_id', ignoreDuplicates: true })
      .select('id, business_name')

    if (error) {
      console.error('[scraper/import]', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      imported: data?.length ?? 0,
      message: `${data?.length ?? 0} leads importados al CRM`,
    })
  } catch (error) {
    console.error('[scraper/import]', error)
    const message = error instanceof Error ? error.message : 'Error desconocido'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
