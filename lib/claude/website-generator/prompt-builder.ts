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
import { findIndustryDesign, getDefaultIndustryDesign } from './industry-design-data'
import type { IndustryDesign } from './industry-design-data'

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

  // 3. Order sections using industry-aware ordering
  const design = findIndustryDesign(data.industry)
  const orderedSections = buildSectionOrder(selectedSections, design?.prioritySections)

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

  // Sort by priority — boost sections that appear in the industry's recommended list
  const design = findIndustryDesign(data.industry)
  const industryPriority = design?.prioritySections ?? []
  const industryBoost = new Map(industryPriority.map((s, i) => [s, i]))

  const priorityMap = new Map(SECTION_RULES.map((r) => [r.type, r.priority]))
  selected.sort((a, b) => {
    // Industry-recommended sections get a priority boost (lower = higher priority)
    const boostA = industryBoost.has(a) ? -1 : 0
    const boostB = industryBoost.has(b) ? -1 : 0
    const pa = (priorityMap.get(a) ?? 99) + boostA
    const pb = (priorityMap.get(b) ?? 99) + boostB
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

  // Check if section requires raw text content (context-generatable sections)
  if (rule.requiresTextContent) {
    const hasText =
      data.config?.customInstructions && data.config.customInstructions.length > 200
    if (!hasText) return false
  }

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

export function buildSectionOrder(
  sections: SectionType[],
  industryPriority?: SectionType[]
): SectionType[] {
  // If we have industry-specific section ordering, use it as the primary order
  // with the canonical SECTION_ORDER as fallback for sections not in the industry list
  const effectiveOrder = industryPriority
    ? buildMergedOrder(industryPriority)
    : SECTION_ORDER

  const orderIndex = new Map(effectiveOrder.map((s, i) => [s, i]))

  const known = sections.filter((s) => orderIndex.has(s)).sort((a, b) => orderIndex.get(a)! - orderIndex.get(b)!)

  const unknown = sections.filter((s) => !orderIndex.has(s))

  return [...known, ...unknown]
}

/**
 * Merges industry priority sections with the canonical order.
 * Industry sections come first (wrapped with navbar/footer), then remaining
 * canonical sections fill in gaps.
 */
function buildMergedOrder(industryPriority: SectionType[]): SectionType[] {
  const merged: SectionType[] = ['navbar']
  const added = new Set<SectionType>(['navbar', 'footer', 'final_cta'])

  // Add industry priority sections in their recommended order
  for (const s of industryPriority) {
    if (!added.has(s)) {
      merged.push(s)
      added.add(s)
    }
  }

  // Fill in remaining sections from canonical order
  for (const s of SECTION_ORDER) {
    if (!added.has(s)) {
      merged.push(s)
      added.add(s)
    }
  }

  // Always end with final_cta + footer
  merged.push('final_cta', 'footer')

  return merged
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
    '> **Note:** Generate ONLY these sections unless the Custom Instructions below contain concrete, extractable business data (specific service names, team member names, real prices, etc.) — in that case you may add sections for that data. Do NOT add sections with invented or placeholder content.'
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

export function generateIndustryContext(industry: string): string {
  const design = findIndustryDesign(industry) ?? getDefaultIndustryDesign()
  return formatDesignContext(design, industry)
}

function formatDesignContext(design: IndustryDesign, industry: string): string {
  const r = design.rule
  const lines: string[] = []

  lines.push(`**Industry Match:** ${design.name}`)
  lines.push(`**Recommended Pattern:** ${r.pattern}`)
  lines.push(`**Style Priority:** ${r.stylePriority}`)
  lines.push(`**Key Effects:** ${r.keyEffects}`)
  lines.push(`**Must-have elements:** ${r.mustHave}`)
  lines.push(`**Anti-patterns (AVOID):** ${r.antiPatterns}`)
  lines.push('')
  lines.push(`**Recommended section priority:** ${design.prioritySections.join(' > ')}`)

  return lines.join('\n')
}
