// ============================================================
// Website Generator - Prompt Builder
// ============================================================
// Core module that transforms scraped website data into a
// structured prompt for LLM-based website generation.
// Adapted from the standalone website-generator project for
// use within LeadForge (no fs/path deps).
// ============================================================

import type {
  ScrapedWebsiteData,
  GeneratedPrompt,
  SectionType,
  GenerationConfig,
  ColorPalette,
} from './types'
import { SECTION_RULES } from './types'
import { SYSTEM_PROMPT_TEMPLATE } from './system-prompt-template'

// ============================================================
// Constants
// ============================================================

/** Canonical section ordering for the conversion funnel. */
const SECTION_ORDER: SectionType[] = [
  'navbar',
  'hero',
  'social_proof',
  'logo_marquee',
  'features_grid',
  'features_scroll',
  'tools_showcase',
  'before_after',
  'how_it_works',
  'stats_counter',
  'testimonials',
  'services',
  'ai_demo',
  'integrations_hub',
  'team',
  'gallery',
  'try_banner',
  'pricing',
  'faq',
  'blog_preview',
  'contact_form',
  'map',
  'final_cta',
  'footer',
]

/** Default generation config — tuned for LeadForge (HTML stack, Spanish, no dark mode). */
const DEFAULT_CONFIG: GenerationConfig = {
  stack: 'html',
  includeAnimations: true,
  includeDarkMode: false,
  language: 'es',
  style: 'premium',
  maxSections: 15,
}

// ============================================================
// Main Entry Point
// ============================================================

/**
 * Builds a complete generation prompt from scraped website data.
 */
export function buildPrompt(data: ScrapedWebsiteData): GeneratedPrompt {
  const config: GenerationConfig = { ...DEFAULT_CONFIG, ...data.config }

  // 1. Determine which sections the generated site should include
  const selectedSections = selectSections(data)

  // 2. Build the OKLCH color system from the scraped hex palette
  const colorSystem = buildColorSystem(data.colorPalette)

  // 3. Order sections for optimal conversion funnel
  const orderedSections = buildSectionOrder(selectedSections)

  // 4. Assemble the user-facing prompt body
  const userPrompt = buildUserPrompt(data, orderedSections, colorSystem)

  // 5. Load the system prompt template
  const systemPrompt = loadSystemPrompt()

  // 6. Combine into a single prompt string
  const fullPrompt = `${systemPrompt}\n\n---\n\n${userPrompt}`

  return {
    systemPrompt,
    userPrompt,
    fullPrompt,
    metadata: {
      selectedSections: orderedSections,
      estimatedTokens: estimateTokens(fullPrompt),
      stack: config.stack,
      style: config.style,
    },
  }
}

// ============================================================
// Section Selection
// ============================================================

export function selectSections(data: ScrapedWebsiteData): SectionType[] {
  const config: GenerationConfig = { ...DEFAULT_CONFIG, ...data.config }
  const maxSections = config.maxSections ?? DEFAULT_CONFIG.maxSections!
  const selected: SectionType[] = []

  const added = new Set<SectionType>()

  for (const rule of SECTION_RULES) {
    if (rule.type === 'features_grid' || rule.type === 'features_scroll') {
      continue
    }

    if (shouldIncludeSection(rule, data)) {
      if (!added.has(rule.type)) {
        selected.push(rule.type)
        added.add(rule.type)
      }
    }
  }

  // Handle features: choose grid vs scroll based on count
  const featureCount = data.features?.length ?? 0
  if (featureCount >= 3) {
    const featureSection: SectionType = featureCount > 6 ? 'features_scroll' : 'features_grid'
    if (!added.has(featureSection)) {
      selected.push(featureSection)
      added.add(featureSection)
    }
  }

  // Sort by priority
  const priorityMap = new Map(SECTION_RULES.map((r) => [r.type, r.priority]))
  selected.sort((a, b) => {
    const pa = priorityMap.get(a) ?? 99
    const pb = priorityMap.get(b) ?? 99
    return pa - pb
  })

  // Enforce maxSections
  if (selected.length > maxSections) {
    const alwaysIncluded = new Set(
      SECTION_RULES.filter((r) => r.alwaysInclude).map((r) => r.type)
    )
    const mandatory = selected.filter((s) => alwaysIncluded.has(s))
    const optional = selected.filter((s) => !alwaysIncluded.has(s))
    const slotsForOptional = maxSections - mandatory.length
    return [...mandatory, ...optional.slice(0, Math.max(0, slotsForOptional))]
  }

  return selected
}

function shouldIncludeSection(
  rule: (typeof SECTION_RULES)[number],
  data: ScrapedWebsiteData
): boolean {
  if (rule.alwaysInclude) return true

  for (const field of rule.requiredData) {
    const value = data[field]
    if (value === undefined || value === null) return false
    if (Array.isArray(value)) {
      const threshold = rule.minItems ?? 1
      if (value.length < threshold) return false
    }
  }

  if (rule.requiredData.length === 0 && rule.minItems !== undefined) {
    return false
  }

  return true
}

// ============================================================
// Color System
// ============================================================

export function buildColorSystem(palette: ColorPalette): string {
  const primary = hexToOklch(palette.primary)
  const secondary = palette.secondary
    ? hexToOklch(palette.secondary)
    : { l: primary.l, c: primary.c * 0.6, h: (primary.h + 30) % 360 }
  const accent = palette.accent
    ? hexToOklch(palette.accent)
    : { l: Math.min(primary.l + 0.1, 0.95), c: primary.c * 1.2, h: (primary.h + 180) % 360 }

  const fmt = (v: { l: number; c: number; h: number }) =>
    `${v.l.toFixed(4)} ${v.c.toFixed(4)} ${v.h.toFixed(2)}`

  const lines: string[] = []

  // ---- Light mode ----
  lines.push('/* Light mode — OKLCH color system */')
  lines.push(':root {')
  lines.push(`  --primary: ${fmt(primary)};`)
  lines.push(`  --primary-foreground: ${fmt({ l: 0.98, c: 0.005, h: primary.h })};`)
  lines.push(`  --secondary: ${fmt(secondary)};`)
  lines.push(`  --secondary-foreground: ${fmt({ l: 0.15, c: 0.01, h: secondary.h })};`)
  lines.push(`  --accent: ${fmt(accent)};`)
  lines.push(`  --accent-foreground: ${fmt({ l: 0.15, c: 0.01, h: accent.h })};`)
  lines.push(`  --background: ${fmt({ l: 0.985, c: 0.002, h: primary.h })};`)
  lines.push(`  --foreground: ${fmt({ l: 0.145, c: 0.015, h: primary.h })};`)
  lines.push(`  --card: ${fmt({ l: 0.99, c: 0.001, h: primary.h })};`)
  lines.push(`  --card-foreground: ${fmt({ l: 0.145, c: 0.015, h: primary.h })};`)
  lines.push(`  --muted: ${fmt({ l: 0.94, c: 0.008, h: primary.h })};`)
  lines.push(`  --muted-foreground: ${fmt({ l: 0.55, c: 0.02, h: primary.h })};`)
  lines.push(`  --border: ${fmt({ l: 0.88, c: 0.01, h: primary.h })};`)
  lines.push(`  --ring: ${fmt({ l: primary.l, c: primary.c * 0.6, h: primary.h })};`)
  lines.push(`  --destructive: ${fmt({ l: 0.55, c: 0.22, h: 27 })};`)
  lines.push(`  --destructive-foreground: ${fmt({ l: 0.98, c: 0.005, h: 27 })};`)
  lines.push('}')
  lines.push('')

  // ---- Dark mode ----
  lines.push('/* Dark mode — OKLCH color system */')
  lines.push('.dark {')
  lines.push(
    `  --primary: ${fmt({ l: Math.min(primary.l + 0.15, 0.85), c: primary.c * 0.85, h: primary.h })};`
  )
  lines.push(`  --primary-foreground: ${fmt({ l: 0.12, c: 0.01, h: primary.h })};`)
  lines.push(
    `  --secondary: ${fmt({ l: Math.min(secondary.l + 0.1, 0.7), c: secondary.c * 0.7, h: secondary.h })};`
  )
  lines.push(`  --secondary-foreground: ${fmt({ l: 0.92, c: 0.008, h: secondary.h })};`)
  lines.push(
    `  --accent: ${fmt({ l: Math.min(accent.l + 0.1, 0.8), c: accent.c * 0.8, h: accent.h })};`
  )
  lines.push(`  --accent-foreground: ${fmt({ l: 0.92, c: 0.008, h: accent.h })};`)
  lines.push(`  --background: ${fmt({ l: 0.13, c: 0.008, h: primary.h })};`)
  lines.push(`  --foreground: ${fmt({ l: 0.93, c: 0.008, h: primary.h })};`)
  lines.push(`  --card: ${fmt({ l: 0.17, c: 0.01, h: primary.h })};`)
  lines.push(`  --card-foreground: ${fmt({ l: 0.93, c: 0.008, h: primary.h })};`)
  lines.push(`  --muted: ${fmt({ l: 0.22, c: 0.012, h: primary.h })};`)
  lines.push(`  --muted-foreground: ${fmt({ l: 0.6, c: 0.02, h: primary.h })};`)
  lines.push(`  --border: ${fmt({ l: 0.28, c: 0.015, h: primary.h })};`)
  lines.push(
    `  --ring: ${fmt({ l: Math.min(primary.l + 0.15, 0.85), c: primary.c * 0.5, h: primary.h })};`
  )
  lines.push(`  --destructive: ${fmt({ l: 0.65, c: 0.22, h: 27 })};`)
  lines.push(`  --destructive-foreground: ${fmt({ l: 0.98, c: 0.005, h: 27 })};`)
  lines.push('}')

  return lines.join('\n')
}

// ============================================================
// Section Ordering
// ============================================================

export function buildSectionOrder(sections: SectionType[]): SectionType[] {
  const orderIndex = new Map(SECTION_ORDER.map((s, i) => [s, i]))

  const known = sections.filter((s) => orderIndex.has(s)).sort((a, b) => orderIndex.get(a)! - orderIndex.get(b)!)

  const unknown = sections.filter((s) => !orderIndex.has(s))

  return [...known, ...unknown]
}

// ============================================================
// User Prompt Assembly
// ============================================================

export function buildUserPrompt(
  data: ScrapedWebsiteData,
  sections: SectionType[],
  colorSystem: string
): string {
  const config: GenerationConfig = { ...DEFAULT_CONFIG, ...data.config }
  const parts: string[] = []

  // -- Header
  parts.push('# Website Generation Request')
  parts.push('')

  // -- Business info
  parts.push('## Business Information')
  parts.push(`- **Name:** ${data.businessName}`)
  parts.push(`- **Industry:** ${data.industry}`)
  parts.push(`- **Source URL:** ${data.url}`)
  if (data.tagline) parts.push(`- **Tagline:** ${data.tagline}`)
  if (data.metaTitle) parts.push(`- **Meta Title:** ${data.metaTitle}`)
  if (data.metaDescription) parts.push(`- **Meta Description:** ${data.metaDescription}`)
  if (data.keywords?.length) parts.push(`- **Keywords:** ${data.keywords.join(', ')}`)
  parts.push(`- **Scraper Quality Score:** ${data.score}/100`)
  parts.push('')

  // -- Industry context
  parts.push('## Industry Context')
  parts.push(generateIndustryContext(data.industry))
  parts.push('')

  // -- Generation config
  parts.push('## Generation Configuration')
  parts.push(`- **Stack:** ${config.stack}`)
  parts.push(`- **Style:** ${config.style}`)
  parts.push(`- **Language:** ${config.language}`)
  parts.push(`- **Animations:** ${config.includeAnimations ? 'yes' : 'no'}`)
  parts.push(`- **Dark Mode:** ${config.includeDarkMode ? 'yes' : 'no'}`)
  parts.push('')

  // -- Sections to generate
  parts.push('## Sections to Generate (in order)')
  sections.forEach((s, i) => {
    parts.push(`${i + 1}. ${s}`)
  })
  parts.push('')
  parts.push(
    '> **Note:** These are the *minimum* sections. If the Custom Instructions below contain raw text with additional business data (services, team members, FAQs, pricing, etc.), extract that data and add appropriate sections beyond this list. The goal is a complete, multi-section website — not a minimal stub.'
  )
  parts.push('')

  // -- Color system
  parts.push('## Color System (OKLCH CSS Variables)')
  parts.push('```css')
  parts.push(colorSystem)
  parts.push('```')
  parts.push('')

  // -- Font config
  if (data.fonts.heading || data.fonts.body) {
    parts.push('## Typography')
    if (data.fonts.heading) parts.push(`- **Heading Font:** ${data.fonts.heading}`)
    if (data.fonts.body) parts.push(`- **Body Font:** ${data.fonts.body}`)
    parts.push('')
  }

  // -- Content data
  parts.push('## Scraped Content Data')
  parts.push('')

  if (data.headlines.length > 0) {
    parts.push('### Headlines')
    parts.push('```json')
    parts.push(JSON.stringify(data.headlines, null, 2))
    parts.push('```')
    parts.push('')
  }

  if (data.descriptions.length > 0) {
    parts.push('### Descriptions')
    parts.push('```json')
    parts.push(JSON.stringify(data.descriptions, null, 2))
    parts.push('```')
    parts.push('')
  }

  if (data.ctas.length > 0) {
    parts.push('### Calls to Action')
    parts.push('```json')
    parts.push(JSON.stringify(data.ctas, null, 2))
    parts.push('```')
    parts.push('')
  }

  if (data.features.length > 0) {
    parts.push('### Features')
    parts.push('```json')
    parts.push(JSON.stringify(data.features, null, 2))
    parts.push('```')
    parts.push('')
  }

  if (data.testimonials.length > 0) {
    parts.push('### Testimonials')
    parts.push('```json')
    parts.push(JSON.stringify(data.testimonials, null, 2))
    parts.push('```')
    parts.push('')
  }

  if (data.pricing && data.pricing.length > 0) {
    parts.push('### Pricing')
    parts.push('```json')
    parts.push(JSON.stringify(data.pricing, null, 2))
    parts.push('```')
    parts.push('')
  }

  if (data.faqs.length > 0) {
    parts.push('### FAQs')
    parts.push('```json')
    parts.push(JSON.stringify(data.faqs, null, 2))
    parts.push('```')
    parts.push('')
  }

  if (data.stats.length > 0) {
    parts.push('### Stats')
    parts.push('```json')
    parts.push(JSON.stringify(data.stats, null, 2))
    parts.push('```')
    parts.push('')
  }

  if (data.team && data.team.length > 0) {
    parts.push('### Team')
    parts.push('```json')
    parts.push(JSON.stringify(data.team, null, 2))
    parts.push('```')
    parts.push('')
  }

  if (data.services && data.services.length > 0) {
    parts.push('### Services')
    parts.push('```json')
    parts.push(JSON.stringify(data.services, null, 2))
    parts.push('```')
    parts.push('')
  }

  if (data.gallery && data.gallery.length > 0) {
    parts.push('### Gallery')
    parts.push('```json')
    parts.push(JSON.stringify(data.gallery, null, 2))
    parts.push('```')
    parts.push('')
  }

  if (data.images.length > 0) {
    parts.push('### Images')
    parts.push('```json')
    parts.push(JSON.stringify(data.images, null, 2))
    parts.push('```')
    parts.push('')
  }

  if (data.contact) {
    parts.push('### Contact Information')
    parts.push('```json')
    parts.push(JSON.stringify(data.contact, null, 2))
    parts.push('```')
    parts.push('')
  }

  if (data.socials) {
    parts.push('### Social Links')
    parts.push('```json')
    parts.push(JSON.stringify(data.socials, null, 2))
    parts.push('```')
    parts.push('')
  }

  // -- Custom instructions
  if (config.customInstructions) {
    parts.push('## Custom Instructions')
    parts.push(config.customInstructions)
    parts.push('')
  }

  return parts.join('\n')
}

// ============================================================
// System Prompt Loader
// ============================================================

export function loadSystemPrompt(): string {
  return SYSTEM_PROMPT_TEMPLATE.trim()
}

// ============================================================
// Token Estimation
// ============================================================

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

// ============================================================
// Hex → OKLCH Conversion
// ============================================================

export function hexToOklch(hex: string): { l: number; c: number; h: number } {
  let cleaned = hex.replace(/^#/, '')

  if (cleaned.length === 3) {
    cleaned = cleaned
      .split('')
      .map((c) => c + c)
      .join('')
  }

  if (cleaned.length !== 6) {
    return { l: 0.5, c: 0, h: 0 }
  }

  const r8 = parseInt(cleaned.slice(0, 2), 16)
  const g8 = parseInt(cleaned.slice(2, 4), 16)
  const b8 = parseInt(cleaned.slice(4, 6), 16)

  if (isNaN(r8) || isNaN(g8) || isNaN(b8)) {
    return { l: 0.5, c: 0, h: 0 }
  }

  const linearize = (v: number): number => {
    const s = v / 255
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }

  const rl = linearize(r8)
  const gl = linearize(g8)
  const bl = linearize(b8)

  const x = 0.4124564 * rl + 0.3575761 * gl + 0.1804375 * bl
  const y = 0.2126729 * rl + 0.7151522 * gl + 0.072175 * bl
  const z = 0.0193339 * rl + 0.119192 * gl + 0.9503041 * bl

  const l_ = 0.8189330101 * x + 0.3618667424 * y - 0.1288597137 * z
  const m_ = 0.0329845436 * x + 0.9293118715 * y + 0.0361456387 * z
  const s_ = 0.0482003018 * x + 0.2643662691 * y + 0.633851707 * z

  const l_cr = Math.cbrt(l_)
  const m_cr = Math.cbrt(m_)
  const s_cr = Math.cbrt(s_)

  const L = 0.2104542553 * l_cr + 0.793617785 * m_cr - 0.0040720468 * s_cr
  const a = 1.9779984951 * l_cr - 2.428592205 * m_cr + 0.4505937099 * s_cr
  const b = 0.0259040371 * l_cr + 0.7827717662 * m_cr - 0.808675766 * s_cr

  const c = Math.sqrt(a * a + b * b)
  let h = (Math.atan2(b, a) * 180) / Math.PI
  if (h < 0) h += 360

  return {
    l: Math.max(0, Math.min(1, L)),
    c: Math.max(0, Math.min(0.4, c)),
    h: c < 0.0001 ? 0 : h % 360,
  }
}

// ============================================================
// Industry Context Generator
// ============================================================

const INDUSTRY_CONTEXT: Record<string, string> = {
  restaurant: [
    'This is a restaurant website. Prioritize high-quality food photography, the menu,',
    'and reservation/ordering CTAs. Use warm, appetizing color tones. The hero should',
    'feature a signature dish or the restaurant ambiance. Include operating hours',
    'prominently. Testimonials should emphasize the dining experience. If there are',
    'stats, focus on years of service, dishes served, or happy customers. The overall',
    'feel should be inviting and sensory — the visitor should almost taste the food.',
  ].join(' '),

  cafe: [
    'This is a cafe/coffee shop website. Emphasize a cozy, relaxed atmosphere with',
    'warm earth tones. Feature specialty drinks and the cafe space prominently in the',
    'hero. Include the menu with clear categories (coffee, pastries, meals). Highlight',
    'the social/community aspect. Operating hours and location should be easy to find.',
    'WiFi availability, ambiance photos, and loyalty programs are strong differentiators.',
  ].join(' '),

  dental_clinic: [
    'This is a dental clinic website. Trust and professionalism are paramount. Use',
    'clean whites and blues. Feature the dental team with credentials. Emphasize',
    'patient comfort, modern equipment, and pain-free procedures. Include insurance',
    'information and appointment booking as a primary CTA. Testimonials should focus',
    'on patient satisfaction and anxiety reduction. Before/after galleries are highly',
    'effective for cosmetic dentistry services.',
  ].join(' '),

  medical: [
    'This is a medical/healthcare website. Prioritize trust, credibility, and',
    'accessibility. Use clean, calming colors (blues, greens, whites). Feature doctor',
    'credentials and specializations prominently. Make appointment booking the primary',
    'CTA. Include accepted insurance, emergency contact info, and operating hours.',
    'Ensure WCAG accessibility compliance. Patient testimonials should emphasize care',
    'quality and professionalism.',
  ].join(' '),

  gym: [
    'This is a gym/fitness center website. Use energetic, bold design with strong',
    'contrasts. Feature action shots of the facility, equipment, and group classes.',
    'Membership plans should be front and center with clear pricing comparison.',
    'Include class schedules, trainer profiles, and transformation stories.',
    'The hero should be motivational. CTAs should push free trials or membership signup.',
    'Stats work well here: members, classes per week, years open.',
  ].join(' '),

  fitness: [
    'This is a fitness/personal training website. Emphasize transformation, results,',
    'and expertise. Feature trainer certifications and specializations. Before/after',
    'sections are highly effective. Include program details, pricing, and scheduling.',
    'Testimonials should focus on measurable results. Use dynamic, energetic imagery.',
    'The hero should convey empowerment and capability. Free consultation should be',
    'the primary CTA.',
  ].join(' '),

  saas: [
    'This is a SaaS product website. Focus on the value proposition and product demo',
    'in the hero. Use social proof heavily — logos, testimonials, stats. Feature an',
    'interactive or visual product showcase. Pricing should be transparent with clear',
    'tier differentiation. Include a FAQ section addressing common objections.',
    'Integration logos build trust. The design should be modern, clean, and tech-forward.',
    'CTAs should push free trial or demo signup.',
  ].join(' '),

  tech: [
    'This is a technology company website. Emphasize innovation, expertise, and',
    'cutting-edge solutions. Use a modern, minimal design with strong typography.',
    'Feature case studies or product showcases. Include the tech stack or methodology.',
    'Team section should highlight expertise and credentials. Stats should demonstrate',
    'impact (clients served, uptime, projects delivered). The hero should communicate',
    'the core value proposition in under 6 words.',
  ].join(' '),

  ecommerce: [
    'This is an e-commerce website. Product presentation is everything. Use high-quality',
    'product photography with clean backgrounds. Feature bestsellers or new arrivals in',
    'the hero. Include trust badges, shipping info, and return policy prominently.',
    'Testimonials should include product-specific reviews. Categories should be clear',
    'and browsable. The gallery section should showcase products in context/lifestyle.',
    'CTAs push toward browsing or featured product purchase.',
  ].join(' '),

  real_estate: [
    'This is a real estate website. High-quality property photography is essential.',
    'The hero should feature a stunning property or the brand promise. Include property',
    'search/filtering prominently. Agent profiles with credentials build trust.',
    'Testimonials from satisfied buyers/sellers are powerful. Stats should show',
    'properties sold, years of experience, and average sale time. Neighborhood guides',
    'and market insights add value. Contact/scheduling should be readily accessible.',
  ].join(' '),

  education: [
    'This is an education/learning website. Trust and credibility are key. Feature',
    'course offerings, instructor credentials, and student success stories. The hero',
    'should communicate the transformational outcome of the education. Include curriculum',
    'details, pricing/enrollment info, and accreditations. Testimonials from graduates',
    'carry strong weight. Stats should highlight graduation rates, student count, and',
    'career placement. FAQ should address admissions, schedule, and prerequisites.',
  ].join(' '),

  legal: [
    'This is a legal services website. Professionalism and authority are paramount.',
    'Use a conservative, trustworthy color palette (navy, charcoal, burgundy). Feature',
    'attorney profiles with bar admissions, specializations, and case experience.',
    'Practice areas should be clearly organized. Testimonials must demonstrate results',
    'while maintaining client confidentiality. The hero should convey strength and',
    'reliability. Free consultation should be the primary CTA. Include awards,',
    'memberships, and media mentions.',
  ].join(' '),

  beauty_salon: [
    'This is a beauty salon/spa website. Aesthetics and visual appeal are everything.',
    'Use elegant, refined design with the brand\'s signature colors. Feature stunning',
    'before/after transformations and service showcases. Include the full service menu',
    'with pricing. Team profiles should highlight stylist specializations and portfolios.',
    'The gallery should showcase best work. Booking should be the primary CTA with',
    'online scheduling. Testimonials should include photos when possible.',
  ].join(' '),

  hotel: [
    'This is a hotel/hospitality website. Immersive visuals are critical — feature',
    'room interiors, amenities, views, and the property exterior. The hero should be',
    'a full-bleed atmospheric shot. Include room types with clear pricing, amenity',
    'lists, and location highlights. Guest testimonials should emphasize the experience.',
    'Nearby attractions and dining options add value. Booking/reservation should be',
    'the primary CTA with date selection. Stats can show guest count, rating, or awards.',
  ].join(' '),

  construction: [
    'This is a construction/contracting website. Showcase completed projects with',
    'high-quality photography. Before/after sections are highly effective here.',
    'Feature services offered, project types, and geographic coverage. Team section',
    'should highlight certifications, licensing, and years of experience. Testimonials',
    'from property owners and developers build trust. Stats should show projects',
    'completed, years in business, and team size. The hero should feature an impressive',
    'completed project. Free estimate should be the primary CTA.',
  ].join(' '),
}

export function generateIndustryContext(industry: string): string {
  const normalized = industry.toLowerCase().trim().replace(/[\s-]+/g, '_')

  if (INDUSTRY_CONTEXT[normalized]) {
    return INDUSTRY_CONTEXT[normalized]
  }

  return [
    `This is a ${industry} business website. Focus on clearly communicating the`,
    'core value proposition in the hero section. Build trust through social proof,',
    'testimonials, and professional presentation. Make the primary call-to-action',
    'prominent and accessible throughout the page. Use the brand\'s color palette',
    'consistently. Ensure the design is modern, clean, and mobile-responsive.',
    'Highlight what differentiates this business from competitors. Include all',
    'relevant contact information and make it easy for visitors to take the next step.',
  ].join(' ')
}
