import * as cheerio from 'cheerio'

export interface SiteScrapedData {
  url: string
  title: string
  description: string
  visibleText: string
  links: string[]
  imageUrls: string[]
  logoUrl: string | null
  phoneNumbers: string[]
  emails: string[]
  socialLinks: { platform: string; url: string }[]
  siteType: 'full_website' | 'landing' | 'link_in_bio' | 'menu_only' | 'social_redirect' | 'error'
  screenshot: string | null
  loadedSuccessfully: boolean
  detectedColors: string[]
  htmlSnippet: string
}

const ICON_KEYWORDS = [
  'icon', 'logo', 'sprite', 'pixel', '1x1', 'banner-ad',
  'whatsapp', 'facebook', 'instagram', 'twitter', 'tiktok', 'youtube', 'linkedin',
  'favicon', 'badge', 'btn', 'button', 'arrow', 'star', 'check', 'close', 'menu',
  'hamburger', 'loading', 'spinner', 'placeholder', 'blank', 'spacer', 'gif',
]

function resolveUrl(src: string, base: string): string | null {
  if (!src) return null
  try {
    return new URL(src, base).href
  } catch {
    return null
  }
}

function isIconUrl(url: string): boolean {
  const u = url.toLowerCase()
  return ICON_KEYWORDS.some((kw) => u.includes(kw)) || u.includes('.svg') || u.startsWith('data:')
}

export async function scrapeSite(url: string): Promise<SiteScrapedData> {
  let html = ''
  let loadedSuccessfully = true

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-AR,es;q=0.9,en;q=0.8',
      },
      signal: AbortSignal.timeout(12000),
    })
    if (!res.ok) loadedSuccessfully = false
    html = await res.text()
  } catch {
    loadedSuccessfully = false
    return errorResult(url)
  }

  const $ = cheerio.load(html)

  // Eliminar scripts, estilos y elementos ocultos para el texto visible
  $('script, style, noscript, head').remove()

  // Título y meta
  const title = $('title').text().trim()
  const description = $('meta[name="description"]').attr('content')?.trim() ?? ''

  // Texto visible
  const visibleText = $('body')
    .text()
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 3000)

  // Links
  const allLinks: string[] = []
  $('a[href]').each((_, el) => {
    const resolved = resolveUrl($(el).attr('href') ?? '', url)
    if (resolved?.startsWith('http')) allLinks.push(resolved)
  })
  const links = [...new Set(allLinks)].slice(0, 30)

  // Logo
  let logoUrl: string | null = null
  const logoEl = $('img[src*="logo"], img[alt*="logo"], img[alt*="Logo"], header img, .logo img, #logo img').first()
  if (logoEl.length) {
    const src = logoEl.attr('src') ?? ''
    const resolved = resolveUrl(src, url)
    if (resolved?.startsWith('http')) logoUrl = resolved
  }

  // Imágenes reales (sin íconos, sin logos)
  const imageUrls: string[] = []
  $('img[src]').each((_, el) => {
    const src = $(el).attr('src') ?? ''
    const alt = ($(el).attr('alt') ?? '').toLowerCase()
    const resolved = resolveUrl(src, url)
    if (!resolved?.startsWith('http')) return
    if (isIconUrl(resolved)) return
    if (ICON_KEYWORDS.some((kw) => alt.includes(kw))) return
    if (resolved === logoUrl) return
    imageUrls.push(resolved)
  })
  const deduped = [...new Set(imageUrls)].slice(0, 12)

  // Teléfonos
  const phoneRegex = /(?:\+54|0)?\s*[\d\s\-().]{8,15}/g
  const phones = [...(visibleText.match(phoneRegex) ?? [])].slice(0, 3)

  // Emails
  const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g
  const emails = [...(visibleText.match(emailRegex) ?? [])].slice(0, 3)

  // Redes sociales
  const socialDomains: Record<string, string> = {
    instagram: 'instagram',
    facebook: 'facebook',
    twitter: 'twitter.com',
    tiktok: 'tiktok',
    youtube: 'youtube',
    linkedin: 'linkedin',
  }
  const socialLinks = links
    .filter((l) => Object.values(socialDomains).some((d) => l.includes(d)))
    .map((u) => {
      const platform = Object.keys(socialDomains).find((k) => u.includes(socialDomains[k])) ?? 'other'
      return { platform, url: u }
    })
    .slice(0, 5)

  const htmlSnippet = html.slice(0, 6000)
  const siteType = detectSiteType(url, links, visibleText, deduped.length)

  return {
    url,
    title,
    description,
    visibleText,
    links,
    imageUrls: deduped,
    logoUrl,
    phoneNumbers: phones,
    emails,
    socialLinks,
    siteType,
    screenshot: null, // no disponible sin browser
    loadedSuccessfully,
    detectedColors: [],
    htmlSnippet,
  }
}

function errorResult(url: string): SiteScrapedData {
  return {
    url, title: '', description: '', visibleText: '', links: [],
    imageUrls: [], logoUrl: null, phoneNumbers: [], emails: [],
    socialLinks: [], siteType: 'error', screenshot: null,
    loadedSuccessfully: false, detectedColors: [], htmlSnippet: '',
  }
}

function detectSiteType(
  url: string,
  links: string[],
  visibleText: string,
  imageCount: number
): SiteScrapedData['siteType'] {
  const urlLower = url.toLowerCase()

  if (
    urlLower.includes('bio.link') || urlLower.includes('linktree') ||
    urlLower.includes('linktr.ee') || urlLower.includes('beacons.ai') ||
    urlLower.includes('taplink') || urlLower.includes('direct.me')
  ) return 'link_in_bio'

  if (
    urlLower.includes('instagram.com') ||
    urlLower.includes('facebook.com') ||
    urlLower.includes('tiktok.com')
  ) return 'social_redirect'

  if (
    urlLower.includes('drive.google') || urlLower.includes('docs.google') ||
    links.some((l) => l.includes('drive.google') || l.includes('docs.google'))
  ) return 'menu_only'

  const internalLinks = links.filter((l) => {
    try { return new URL(l).hostname === new URL(url).hostname } catch { return false }
  })
  if (internalLinks.length <= 2 && visibleText.length < 300 && imageCount <= 3) return 'landing'

  return 'full_website'
}
