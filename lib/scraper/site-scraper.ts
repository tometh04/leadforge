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
  subPagesText: string
  subPagesCount: number
}

const ICON_KEYWORDS = [
  'icon', 'logo', 'sprite', 'pixel', '1x1', 'banner-ad',
  'whatsapp', 'facebook', 'instagram', 'twitter', 'tiktok', 'youtube', 'linkedin',
  'favicon', 'badge', 'btn', 'button', 'arrow', 'star', 'check', 'close', 'menu',
  'hamburger', 'loading', 'spinner', 'placeholder', 'blank', 'spacer', 'gif',
]

const SUB_PAGE_KEYWORDS = [
  'servicio', 'about', 'nosotros', 'menu', 'carta', 'contacto', 'equipo', 'team',
  'historia', 'galeria', 'prensa', 'noticias', 'blog', 'productos', 'tratamientos',
  'especialidades', 'quienes-somos', 'quien-somos', 'services', 'portfolio',
]

const FETCH_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'es-AR,es;q=0.9,en;q=0.8',
}

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

interface ParsedPageContent {
  visibleText: string
  imageUrls: string[]
  emails: string[]
  phoneNumbers: string[]
  links: string[]
}

function parsePageContent(html: string, baseUrl: string): ParsedPageContent {
  const $ = cheerio.load(html)
  $('script, style, noscript, head').remove()

  const visibleText = $('body')
    .text()
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 3000)

  // Links
  const allLinks: string[] = []
  $('a[href]').each((_, el) => {
    const resolved = resolveUrl($(el).attr('href') ?? '', baseUrl)
    if (resolved?.startsWith('http')) allLinks.push(resolved)
  })
  const links = [...new Set(allLinks)].slice(0, 30)

  // Imágenes reales (sin íconos)
  const imageUrls: string[] = []
  $('img[src]').each((_, el) => {
    const src = $(el).attr('src') ?? ''
    const alt = ($(el).attr('alt') ?? '').toLowerCase()
    const resolved = resolveUrl(src, baseUrl)
    if (!resolved?.startsWith('http')) return
    if (isIconUrl(resolved)) return
    if (ICON_KEYWORDS.some((kw) => alt.includes(kw))) return
    imageUrls.push(resolved)
  })

  // Teléfonos
  const phoneRegex = /(?:\+54|0)?\s*[\d\s\-().]{8,15}/g
  const phoneNumbers = [...(visibleText.match(phoneRegex) ?? [])].slice(0, 3)

  // Emails
  const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g
  const emails = [...(visibleText.match(emailRegex) ?? [])].slice(0, 3)

  return { visibleText, imageUrls: [...new Set(imageUrls)], emails, phoneNumbers, links }
}

async function scrapeSubPages(
  baseUrl: string,
  links: string[]
): Promise<{ texts: string[]; imageUrls: string[]; emails: string[] }> {
  let baseHostname: string
  try {
    baseHostname = new URL(baseUrl).hostname
  } catch {
    return { texts: [], imageUrls: [], emails: [] }
  }

  // Filter internal links only
  const internalLinks = links.filter((l) => {
    try {
      return new URL(l).hostname === baseHostname
    } catch {
      return false
    }
  })

  // Dedupe and remove the base URL itself
  const normalizedBase = baseUrl.replace(/\/$/, '')
  const uniqueLinks = [...new Set(internalLinks)]
    .filter((l) => l.replace(/\/$/, '') !== normalizedBase)

  // Prioritize links with relevant keywords
  const prioritized = uniqueLinks.sort((a, b) => {
    const aLower = a.toLowerCase()
    const bLower = b.toLowerCase()
    const aHasKeyword = SUB_PAGE_KEYWORDS.some((kw) => aLower.includes(kw))
    const bHasKeyword = SUB_PAGE_KEYWORDS.some((kw) => bLower.includes(kw))
    if (aHasKeyword && !bHasKeyword) return -1
    if (!aHasKeyword && bHasKeyword) return 1
    return 0
  })

  // Cap at 5 sub-pages
  const toFetch = prioritized.slice(0, 5)
  if (toFetch.length === 0) return { texts: [], imageUrls: [], emails: [] }

  const results = await Promise.allSettled(
    toFetch.map(async (link) => {
      const res = await fetch(link, {
        headers: FETCH_HEADERS,
        signal: AbortSignal.timeout(8000),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const html = await res.text()
      return parsePageContent(html, link)
    })
  )

  const texts: string[] = []
  const allImages: string[] = []
  const allEmails: string[] = []

  for (const result of results) {
    if (result.status === 'fulfilled') {
      if (result.value.visibleText) texts.push(result.value.visibleText)
      allImages.push(...result.value.imageUrls)
      allEmails.push(...result.value.emails)
    }
  }

  return {
    texts,
    imageUrls: [...new Set(allImages)],
    emails: [...new Set(allEmails)],
  }
}

export async function scrapeSite(url: string): Promise<SiteScrapedData> {
  let html = ''
  let loadedSuccessfully = true

  try {
    const res = await fetch(url, {
      headers: FETCH_HEADERS,
      signal: AbortSignal.timeout(12000),
    })
    if (!res.ok) loadedSuccessfully = false
    html = await res.text()
  } catch {
    loadedSuccessfully = false
    return errorResult(url)
  }

  const $ = cheerio.load(html)

  // Título y meta (antes de remover head)
  const title = $('title').text().trim()
  const description = $('meta[name="description"]').attr('content')?.trim() ?? ''

  // Parse homepage content
  const homeContent = parsePageContent(html, url)

  // Logo (needs the original $ with full HTML)
  const $full = cheerio.load(html)
  let logoUrl: string | null = null
  const logoEl = $full(
    'img[src*="logo"], img[alt*="logo"], img[alt*="Logo"], header img, .logo img, #logo img'
  ).first()
  if (logoEl.length) {
    const src = logoEl.attr('src') ?? ''
    const resolved = resolveUrl(src, url)
    if (resolved?.startsWith('http')) logoUrl = resolved
  }

  // Filter logo from images
  const deduped = homeContent.imageUrls.filter((u) => u !== logoUrl).slice(0, 12)

  // Redes sociales
  const socialDomains: Record<string, string> = {
    instagram: 'instagram',
    facebook: 'facebook',
    twitter: 'twitter.com',
    tiktok: 'tiktok',
    youtube: 'youtube',
    linkedin: 'linkedin',
  }
  const socialLinks = homeContent.links
    .filter((l) => Object.values(socialDomains).some((d) => l.includes(d)))
    .map((u) => {
      const platform = Object.keys(socialDomains).find((k) => u.includes(socialDomains[k])) ?? 'other'
      return { platform, url: u }
    })
    .slice(0, 5)

  const htmlSnippet = html.slice(0, 6000)
  const siteType = detectSiteType(url, homeContent.links, homeContent.visibleText, deduped.length)

  // Crawl sub-pages
  let subPagesText = ''
  let subPagesCount = 0
  const allImages = [...deduped]
  const allEmails = [...homeContent.emails]

  if (loadedSuccessfully && homeContent.links.length > 0) {
    try {
      const subPages = await scrapeSubPages(url, homeContent.links)
      subPagesCount = subPages.texts.length
      subPagesText = subPages.texts.join('\n---\n').slice(0, 6000)

      // Accumulate images from sub-pages (no duplicates, respect cap)
      for (const img of subPages.imageUrls) {
        if (!allImages.includes(img) && img !== logoUrl && allImages.length < 20) {
          allImages.push(img)
        }
      }
      // Accumulate emails from sub-pages (no duplicates)
      for (const email of subPages.emails) {
        if (!allEmails.includes(email) && allEmails.length < 5) {
          allEmails.push(email)
        }
      }
    } catch (e) {
      console.warn('[scraper] Sub-page crawl failed:', e)
    }
  }

  return {
    url,
    title,
    description,
    visibleText: homeContent.visibleText,
    links: homeContent.links,
    imageUrls: allImages.slice(0, 12),
    logoUrl,
    phoneNumbers: homeContent.phoneNumbers,
    emails: allEmails,
    socialLinks,
    siteType,
    screenshot: null,
    loadedSuccessfully,
    detectedColors: [],
    htmlSnippet,
    subPagesText,
    subPagesCount,
  }
}

function errorResult(url: string): SiteScrapedData {
  return {
    url, title: '', description: '', visibleText: '', links: [],
    imageUrls: [], logoUrl: null, phoneNumbers: [], emails: [],
    socialLinks: [], siteType: 'error', screenshot: null,
    loadedSuccessfully: false, detectedColors: [], htmlSnippet: '',
    subPagesText: '', subPagesCount: 0,
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
