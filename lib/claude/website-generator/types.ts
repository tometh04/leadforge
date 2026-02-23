// ============================================================
// Website Generator - Type Definitions
// ============================================================
// Schema for scraped website data that feeds into the prompt builder
// ============================================================

export interface ScrapedWebsiteData {
  // --- Metadata ---
  url: string
  industry: string // e.g. "dental_clinic", "restaurant", "gym", "saas", "ecommerce"
  businessName: string
  tagline?: string
  score: number // Scraper quality score (0-100)

  // --- Content ---
  headlines: string[]
  descriptions: string[]
  ctas: string[]

  testimonials: Testimonial[]
  features: Feature[]
  pricing?: PricingTier[]
  faqs: FAQ[]
  stats: Stat[]
  team?: TeamMember[]
  services?: Service[]
  gallery?: GalleryItem[]

  // --- Visual Analysis ---
  colorPalette: ColorPalette
  fonts: FontConfig
  images: ScrapedImage[]

  // --- Structure Analysis ---
  sections: DetectedSection[]

  // --- SEO ---
  metaTitle?: string
  metaDescription?: string
  keywords?: string[]

  // --- Contact Info ---
  contact?: ContactInfo

  // --- Social Media ---
  socials?: SocialLinks

  // --- Generation Config (user overrides) ---
  config?: GenerationConfig
}

// --- Sub-types ---

export interface Testimonial {
  quote: string
  author: string
  role?: string
  company?: string
  location?: string
  rating?: number // 1-5
  avatarUrl?: string
}

export interface Feature {
  title: string
  description: string
  icon?: string // lucide icon name
  category?: string
}

export interface PricingTier {
  planName: string
  price: string
  period?: string // "month", "year", "one-time"
  description?: string
  features: string[]
  isPopular?: boolean
  ctaText?: string
}

export interface FAQ {
  question: string
  answer: string
}

export interface Stat {
  value: string // "500+", "99.9%", "24/7"
  label: string
  icon?: string
  suffix?: string
}

export interface TeamMember {
  name: string
  role: string
  bio?: string
  imageUrl?: string
  socials?: Partial<SocialLinks>
}

export interface Service {
  title: string
  description: string
  icon?: string
  price?: string
  imageUrl?: string
}

export interface GalleryItem {
  imageUrl: string
  alt: string
  caption?: string
  category?: string
}

export interface ColorPalette {
  primary: string // hex e.g. "#8B4513"
  secondary?: string
  accent?: string
  background?: string
  foreground?: string
  muted?: string
}

export interface FontConfig {
  heading?: string // e.g. "Geist", "Inter", "Playfair Display"
  body?: string
}

export interface ScrapedImage {
  url: string
  alt: string
  context:
    | 'hero'
    | 'feature'
    | 'team'
    | 'gallery'
    | 'logo'
    | 'background'
    | 'product'
    | 'other'
  width?: number
  height?: number
}

export interface DetectedSection {
  type: SectionType
  position: number
  hasContent: boolean
  content?: Record<string, unknown>
}

export interface ContactInfo {
  email?: string
  phone?: string
  address?: string
  city?: string
  country?: string
  mapUrl?: string
}

export interface SocialLinks {
  instagram?: string
  twitter?: string
  facebook?: string
  linkedin?: string
  youtube?: string
  tiktok?: string
  whatsapp?: string
}

export interface GenerationConfig {
  stack: 'nextjs' | 'html' | 'astro'
  includeAnimations: boolean
  includeDarkMode: boolean
  language: 'es' | 'en'
  style: 'premium' | 'professional' | 'minimal'
  maxSections?: number
  customInstructions?: string
}

// --- Section Types ---

export type SectionType =
  | 'navbar'
  | 'hero'
  | 'social_proof'
  | 'features_grid'
  | 'features_scroll'
  | 'tools_showcase'
  | 'before_after'
  | 'how_it_works'
  | 'stats_counter'
  | 'testimonials'
  | 'ai_demo'
  | 'integrations_hub'
  | 'try_banner'
  | 'pricing'
  | 'faq'
  | 'team'
  | 'gallery'
  | 'contact_form'
  | 'map'
  | 'blog_preview'
  | 'logo_marquee'
  | 'services'
  | 'final_cta'
  | 'footer'

// --- Output Types ---

export interface GeneratedPrompt {
  systemPrompt: string
  userPrompt: string
  fullPrompt: string
  metadata: {
    selectedSections: SectionType[]
    estimatedTokens: number
    stack: string
    style: string
  }
}

// --- Section Selection Config ---

export interface SectionSelectionRule {
  type: SectionType
  requiredData: (keyof ScrapedWebsiteData)[]
  minItems?: number // minimum items in array to include section
  alwaysInclude?: boolean
  priority: number // 1 = highest
}

export const SECTION_RULES: SectionSelectionRule[] = [
  // Always included
  { type: 'navbar', requiredData: [], alwaysInclude: true, priority: 1 },
  { type: 'hero', requiredData: ['headlines'], alwaysInclude: true, priority: 1 },
  { type: 'footer', requiredData: [], alwaysInclude: true, priority: 1 },
  { type: 'final_cta', requiredData: ['ctas'], alwaysInclude: true, priority: 2 },

  // Content-dependent
  { type: 'features_grid', requiredData: ['features'], minItems: 3, priority: 3 },
  { type: 'testimonials', requiredData: ['testimonials'], minItems: 2, priority: 3 },
  { type: 'pricing', requiredData: ['pricing'], minItems: 1, priority: 3 },
  { type: 'faq', requiredData: ['faqs'], minItems: 3, priority: 4 },
  { type: 'stats_counter', requiredData: ['stats'], minItems: 3, priority: 4 },
  { type: 'team', requiredData: ['team'], minItems: 2, priority: 5 },
  { type: 'services', requiredData: ['services'], minItems: 2, priority: 4 },
  { type: 'gallery', requiredData: ['gallery'], minItems: 3, priority: 5 },

  // Enhancement sections (no required data, added for quality)
  { type: 'social_proof', requiredData: ['testimonials'], minItems: 1, priority: 4 },
  { type: 'how_it_works', requiredData: [], priority: 5 },
  { type: 'before_after', requiredData: ['features'], minItems: 4, priority: 6 },
  { type: 'try_banner', requiredData: ['ctas'], minItems: 1, priority: 6 },
  { type: 'logo_marquee', requiredData: [], priority: 7 },
  { type: 'contact_form', requiredData: ['contact'], priority: 5 },
]
