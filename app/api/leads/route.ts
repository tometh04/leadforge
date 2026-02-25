import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionUser } from '@/lib/auth/verify-session'

export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')
    const niche = searchParams.get('niche')
    const city = searchParams.get('city')
    const search = searchParams.get('search')
    const scoreMin = searchParams.get('scoreMin')
    const scoreMax = searchParams.get('scoreMax')
    const page = parseInt(searchParams.get('page') ?? '1')
    const limit = parseInt(searchParams.get('limit') ?? '50')
    const offset = (page - 1) * limit

    const supabase = await createClient()
    let query = supabase.from('leads').select('*', { count: 'exact' }).eq('user_id', user.id)

    if (status && status !== 'all') query = query.eq('status', status)
    if (niche) query = query.eq('niche', niche)
    if (city) query = query.ilike('city', `%${city}%`)
    if (search) {
      query = query.or(
        `business_name.ilike.%${search}%,website.ilike.%${search}%,address.ilike.%${search}%`
      )
    }
    if (scoreMin) query = query.gte('score', parseInt(scoreMin))
    if (scoreMax) query = query.lte('score', parseInt(scoreMax))

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ leads: data, total: count, page, limit })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
