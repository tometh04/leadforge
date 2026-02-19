import puppeteer, { Browser } from 'puppeteer'

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
  screenshot: string | null // base64
  loadedSuccessfully: boolean
  detectedColors: string[]
  htmlSnippet: string
}

let browserInstance: Browser | null = null

async function getBrowser(): Promise<Browser> {
  if (browserInstance && browserInstance.connected) return browserInstance
  browserInstance = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-first-run',
    ],
  })
  return browserInstance
}

export async function scrapeSite(url: string): Promise<SiteScrapedData> {
  const browser = await getBrowser()
  const page = await browser.newPage()

  try {
    await page.setViewport({ width: 1280, height: 800 })
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    )

    // Bloquear recursos pesados que no necesitamos
    await page.setRequestInterception(true)
    page.on('request', (req) => {
      const rt = req.resourceType()
      if (['font', 'media'].includes(rt)) req.abort()
      else req.continue()
    })

    let loadedSuccessfully = true
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 })
      // Esperar un poco más para JS
      await new Promise((r) => setTimeout(r, 2000))
    } catch {
      loadedSuccessfully = false
    }

    // Screenshot en base64
    let screenshot: string | null = null
    try {
      const screenshotBuffer = await page.screenshot({ type: 'jpeg', quality: 60, fullPage: false })
      screenshot = Buffer.from(screenshotBuffer).toString('base64')
    } catch { /* ignorar */ }

    // Extraer todo el contenido visible
    const extracted = await page.evaluate(() => {
      // Textos visibles
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        null
      )
      const texts: string[] = []
      let node
      while ((node = walker.nextNode())) {
        const text = node.textContent?.trim()
        if (text && text.length > 2) texts.push(text)
      }
      const visibleText = texts.join(' ').replace(/\s+/g, ' ').slice(0, 3000)

      // Links
      const allLinks = Array.from(document.querySelectorAll('a[href]'))
        .map((a) => (a as HTMLAnchorElement).href)
        .filter((h) => h.startsWith('http'))
        .slice(0, 30)

      // Logo: buscar img con "logo" en src o alt, antes de filtrar imágenes
      const logoEl = document.querySelector('img[src*="logo"], img[alt*="logo"], img[alt*="Logo"], header img, .logo img, #logo img') as HTMLImageElement
      const logoUrl = logoEl?.src && logoEl.src.startsWith('http') ? logoEl.src : null

      // Imágenes — solo fotos reales (no íconos, no logos, mínimo 200px)
      // Excluir: iconos (<200px), SVGs de UI, íconos de redes sociales, sprites
      const ICON_KEYWORDS = ['icon', 'logo', 'sprite', 'pixel', '1x1', 'banner-ad',
        'whatsapp', 'facebook', 'instagram', 'twitter', 'tiktok', 'youtube', 'linkedin',
        'favicon', 'badge', 'btn', 'button', 'arrow', 'star', 'check', 'close', 'menu',
        'hamburger', 'loading', 'spinner', 'placeholder', 'blank', 'spacer', 'gif']

      const allImages = Array.from(document.querySelectorAll('img[src]'))
        .map((img) => {
          const el = img as HTMLImageElement
          return {
            src: el.src,
            w: el.naturalWidth || el.width || 0,
            h: el.naturalHeight || el.height || 0,
            srcLower: el.src.toLowerCase(),
            altLower: (el.alt || '').toLowerCase(),
          }
        })
        .filter(({ src, w, h, srcLower, altLower }) => {
          if (!src.startsWith('http')) return false
          // Descartar SVGs de UI y data URIs
          if (srcLower.includes('.svg') || src.startsWith('data:')) return false
          // Descartar si la URL contiene palabras de ícono
          if (ICON_KEYWORDS.some(kw => srcLower.includes(kw))) return false
          // Descartar si el alt contiene palabras de ícono
          if (ICON_KEYWORDS.some(kw => altLower.includes(kw))) return false
          // Descartar imágenes pequeñas (íconos, thumbnails menores a 200px)
          if (w > 0 && w < 200) return false
          if (h > 0 && h < 150) return false
          // Descartar PNGs cuadrados medianos (<= 600px) — suelen ser íconos/ilustraciones
          // Las fotos reales raramente son cuadradas perfectas
          if (srcLower.includes('.png') && w > 0 && h > 0) {
            const ratio = w / h
            const isSquarish = ratio > 0.85 && ratio < 1.18
            const isSmallSquare = Math.max(w, h) <= 600
            if (isSquarish && isSmallSquare) return false
          }
          // Descartar imágenes muy anchas y bajas (banners publicitarios)
          if (w > 0 && h > 0 && w / h > 5) return false
          return true
        })
        .sort((a, b) => (b.w * b.h) - (a.w * a.h)) // Ordenar por tamaño descendente
        .map(({ src }) => src)
        .filter((src, i, arr) => arr.indexOf(src) === i) // deduplicar
        .filter((src) => src !== logoUrl) // nunca incluir el logo en las fotos
        .slice(0, 12)

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
      const socialLinks = allLinks
        .filter((l) => Object.values(socialDomains).some((d) => l.includes(d)))
        .map((url) => {
          const platform = Object.keys(socialDomains).find((k) =>
            url.includes(socialDomains[k])
          ) ?? 'other'
          return { platform, url }
        })
        .slice(0, 5)

      // Título y meta description
      const title = document.title || ''
      const descMeta = document.querySelector('meta[name="description"]') as HTMLMetaElement
      const description = descMeta?.content ?? ''

      // HTML snippet (primeros 6000 chars del body)
      const htmlSnippet = document.body?.innerHTML?.slice(0, 6000) ?? ''

      return { visibleText, allLinks, allImages, logoUrl, phones, emails, socialLinks, title, description, htmlSnippet }
    })

    // Detectar tipo de sitio
    const siteType = detectSiteType(url, extracted.allLinks, extracted.visibleText, extracted.allImages.length)

    return {
      url,
      title: extracted.title,
      description: extracted.description,
      visibleText: extracted.visibleText,
      links: extracted.allLinks,
      imageUrls: extracted.allImages,
      logoUrl: extracted.logoUrl,
      phoneNumbers: extracted.phones,
      emails: extracted.emails,
      socialLinks: extracted.socialLinks,
      siteType,
      screenshot,
      loadedSuccessfully,
      detectedColors: [],
      htmlSnippet: extracted.htmlSnippet,
    }
  } finally {
    await page.close()
  }
}

function detectSiteType(
  url: string,
  links: string[],
  visibleText: string,
  imageCount: number
): SiteScrapedData['siteType'] {
  const urlLower = url.toLowerCase()
  const textLower = visibleText.toLowerCase()

  // Link-in-bio platforms
  if (
    urlLower.includes('bio.link') ||
    urlLower.includes('linktree') ||
    urlLower.includes('linktr.ee') ||
    urlLower.includes('beacons.ai') ||
    urlLower.includes('taplink') ||
    urlLower.includes('direct.me')
  ) return 'link_in_bio'

  // Redes sociales directas
  if (
    urlLower.includes('instagram.com') ||
    urlLower.includes('facebook.com') ||
    urlLower.includes('tiktok.com')
  ) return 'social_redirect'

  // Carta/menú en Drive o similar
  if (
    urlLower.includes('drive.google') ||
    urlLower.includes('docs.google') ||
    links.some((l) => l.includes('drive.google') || l.includes('docs.google'))
  ) return 'menu_only'

  // Landing minimalista: pocos links, poco texto, pocas imágenes
  const internalLinks = links.filter((l) => {
    try { return new URL(l).hostname === new URL(url).hostname } catch { return false }
  })
  if (
    internalLinks.length <= 2 &&
    visibleText.length < 300 &&
    imageCount <= 3
  ) return 'landing'

  return 'full_website'
}
