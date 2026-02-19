import { ScraperResult } from '@/types'
import { readFileSync } from 'fs'
import { join } from 'path'

function readEnvKey(keyName: string): string {
  if (process.env[keyName]) return process.env[keyName]!
  try {
    const content = readFileSync(join(process.cwd(), '.env.local'), 'utf8')
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed.includes('=') || trimmed.startsWith('#')) continue
      const eqIdx = trimmed.indexOf('=')
      const k = trimmed.slice(0, eqIdx).trim()
      const v = trimmed.slice(eqIdx + 1).trim()
      if (k === keyName && v) return v
    }
  } catch { /* ignorar */ }
  throw new Error(`${keyName} no encontrada en el entorno`)
}

const PLACES_API_BASE = 'https://places.googleapis.com/v1'

interface PlacesTextSearchResponse {
  places?: PlaceResult[]
  nextPageToken?: string
}

interface PlaceResult {
  id: string
  displayName?: { text: string }
  formattedAddress?: string
  nationalPhoneNumber?: string
  internationalPhoneNumber?: string
  websiteUri?: string
  rating?: number
  userRatingCount?: number
  primaryTypeDisplayName?: { text: string }
  photos?: { name: string }[]
}

export interface PlaceDetails {
  rating: number | null
  userRatingCount: number | null
  openingHours: string[] | null // weekdayDescriptions array from Places API
}

/** Obtiene detalles de un Place por su place_id: rating, reviews, horarios reales */
export async function fetchPlaceDetails(placeId: string): Promise<PlaceDetails> {
  const apiKey = readEnvKey('GOOGLE_PLACES_API_KEY')

  const response = await fetch(`${PLACES_API_BASE}/places/${placeId}`, {
    headers: {
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'rating,userRatingCount,regularOpeningHours',
    },
  })

  if (!response.ok) {
    console.warn(`[fetchPlaceDetails] ${response.status} for ${placeId}`)
    return { rating: null, userRatingCount: null, openingHours: null }
  }

  const data = await response.json() as {
    rating?: number
    userRatingCount?: number
    regularOpeningHours?: { weekdayDescriptions?: string[] }
  }

  return {
    rating: data.rating ?? null,
    userRatingCount: data.userRatingCount ?? null,
    openingHours: data.regularOpeningHours?.weekdayDescriptions ?? null,
  }
}

export async function searchPlaces(
  niche: string,
  city: string,
  maxResults: number = 20
): Promise<ScraperResult[]> {
  const apiKey = readEnvKey('GOOGLE_PLACES_API_KEY')

  const query = `${niche} en ${city}`
  const results: ScraperResult[] = []
  let nextPageToken: string | undefined

  do {
    const body: Record<string, unknown> = {
      textQuery: query,
      maxResultCount: Math.min(maxResults - results.length, 20),
      languageCode: 'es',
    }

    if (nextPageToken) {
      body.pageToken = nextPageToken
    }

    const response = await fetch(`${PLACES_API_BASE}/places:searchText`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': [
          'places.id',
          'places.displayName',
          'places.formattedAddress',
          'places.nationalPhoneNumber',
          'places.internationalPhoneNumber',
          'places.websiteUri',
          'places.rating',
          'places.primaryTypeDisplayName',
          'places.photos',
          'nextPageToken',
        ].join(','),
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const err = await response.text()
      throw new Error(`Google Places API error: ${response.status} — ${err}`)
    }

    const data: PlacesTextSearchResponse = await response.json()

    for (const place of data.places ?? []) {
      // Filtro obligatorio: tiene teléfono Y website
      if (!place.nationalPhoneNumber && !place.internationalPhoneNumber) continue
      if (!place.websiteUri) continue

      const photoUrl = place.photos?.[0]?.name
        ? `https://places.googleapis.com/v1/${place.photos[0].name}/media?maxWidthPx=400&key=${apiKey}`
        : null

      results.push({
        place_id: place.id,
        business_name: place.displayName?.text ?? 'Sin nombre',
        address: place.formattedAddress ?? '',
        phone: place.nationalPhoneNumber ?? place.internationalPhoneNumber ?? '',
        website: place.websiteUri,
        rating: place.rating ?? null,
        category: place.primaryTypeDisplayName?.text ?? niche,
        google_photo_url: photoUrl,
      })

      if (results.length >= maxResults) break
    }

    nextPageToken = data.nextPageToken
  } while (nextPageToken && results.length < maxResults)

  return results
}
