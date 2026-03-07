// ============================================================
// Industry Design Database
// ============================================================
// Compiled from ui-ux-pro-max-skill color palettes, reasoning
// rules, and landing page patterns. Only the matched industry's
// data is injected into the prompt — never the full database.
// ============================================================

import type { SectionType } from './types'

// --- Types ---

export interface IndustryPalette {
  primary: string
  secondary: string
  cta: string
  background: string
  text: string
  border: string
}

export interface IndustryDesignRule {
  pattern: string
  stylePriority: string
  keyEffects: string
  antiPatterns: string
  mustHave: string
}

export interface IndustryFontPair {
  heading: string
  body: string
}

export interface IndustryDesign {
  name: string
  keywords: string[]
  palette: IndustryPalette
  rule: IndustryDesignRule
  fontPair: IndustryFontPair
  prioritySections: SectionType[]
}

// --- Font Pairs ---

const FONTS = {
  elegant: { heading: 'Playfair Display', body: 'Source Sans 3' },
  modern: { heading: 'Geist', body: 'Geist' },
  clean: { heading: 'Inter', body: 'Inter' },
  bold: { heading: 'Plus Jakarta Sans', body: 'Plus Jakarta Sans' },
  friendly: { heading: 'DM Sans', body: 'DM Sans' },
} as const

// --- Database ---

const INDUSTRY_DATABASE: IndustryDesign[] = [
  // ---- FOOD & DRINK ----
  {
    name: 'Restaurant / Food Service',
    keywords: [
      'restaurant', 'restaurante', 'food', 'comida', 'parrilla', 'asador',
      'pizzeria', 'sushi', 'burger', 'hamburgues', 'grill', 'trattoria',
      'bistro', 'cocina', 'gastronomia', 'rotiseria', 'empanada',
    ],
    palette: { primary: '#DC2626', secondary: '#F87171', cta: '#CA8A04', background: '#FEF2F2', text: '#450A0A', border: '#FECACA' },
    rule: {
      pattern: 'Hero-Centric + Conversion',
      stylePriority: 'Vibrant & Block-based + Motion-Driven',
      keyEffects: 'Food image reveal + Menu hover effects + warm transitions (200-300ms)',
      antiPatterns: 'Low-quality imagery, outdated hours, dark mode default',
      mustHave: 'high-quality food images, menu display, ordering/reservation CTA, operating hours',
    },
    fontPair: FONTS.elegant,
    prioritySections: ['hero', 'services', 'gallery', 'testimonials', 'stats_counter', 'faq', 'contact_form', 'map'],
  },
  {
    name: 'Bakery / Cafe',
    keywords: [
      'bakery', 'panaderia', 'cafe', 'cafeteria', 'coffee', 'pasteleria',
      'confiteria', 'medialunas', 'facturas', 'tortas', 'reposteria',
    ],
    palette: { primary: '#92400E', secondary: '#B45309', cta: '#FBBF24', background: '#FEF3C7', text: '#78350F', border: '#FDE68A' },
    rule: {
      pattern: 'Hero-Centric + Conversion',
      stylePriority: 'Vibrant & Block-based + Soft UI Evolution',
      keyEffects: 'Menu hover + Order animations + warm transitions',
      antiPatterns: 'Poor food photos, hidden hours, generic design',
      mustHave: 'menu display, online ordering, warm atmosphere photos, operating hours',
    },
    fontPair: FONTS.elegant,
    prioritySections: ['hero', 'services', 'gallery', 'stats_counter', 'testimonials', 'faq', 'contact_form', 'map'],
  },
  {
    name: 'Coffee Shop',
    keywords: ['coffee shop', 'cafe de especialidad', 'barista', 'espresso', 'latte'],
    palette: { primary: '#78350F', secondary: '#92400E', cta: '#FBBF24', background: '#FEF3C7', text: '#451A03', border: '#FDE68A' },
    rule: {
      pattern: 'Hero-Centric + Minimal',
      stylePriority: 'Minimalism + Organic Biophilic',
      keyEffects: 'Menu transitions + Loyalty animations + cozy atmosphere',
      antiPatterns: 'Generic design, no atmosphere, cold colors',
      mustHave: 'menu, cozy atmosphere, specialty coffee highlights',
    },
    fontPair: FONTS.elegant,
    prioritySections: ['hero', 'services', 'gallery', 'testimonials', 'contact_form', 'map'],
  },
  {
    name: 'Brewery / Winery',
    keywords: [
      'brewery', 'cerveceria', 'winery', 'bodega', 'vino', 'wine',
      'craft beer', 'cerveza artesanal', 'vinoteca',
    ],
    palette: { primary: '#7C2D12', secondary: '#B91C1C', cta: '#CA8A04', background: '#FEF2F2', text: '#450A0A', border: '#FECACA' },
    rule: {
      pattern: 'Storytelling + Hero-Centric',
      stylePriority: 'Motion-Driven + Storytelling-Driven',
      keyEffects: 'Tasting note reveals + Heritage timeline + warm palette',
      antiPatterns: 'Generic product pages, no story, cold aesthetic',
      mustHave: 'product showcase, heritage story, tasting experiences',
    },
    fontPair: FONTS.elegant,
    prioritySections: ['hero', 'services', 'gallery', 'how_it_works', 'testimonials', 'contact_form', 'map'],
  },
  {
    name: 'Ice Cream / Heladeria',
    keywords: ['heladeria', 'ice cream', 'helado', 'gelato', 'frozen yogurt'],
    palette: { primary: '#EC4899', secondary: '#F9A8D4', cta: '#FBBF24', background: '#FDF2F8', text: '#831843', border: '#FBCFE8' },
    rule: {
      pattern: 'Hero-Centric + Conversion',
      stylePriority: 'Vibrant & Block-based + Claymorphism',
      keyEffects: 'Playful animations + flavor showcase + bright transitions',
      antiPatterns: 'Dark mode, corporate feel, dull colors',
      mustHave: 'flavor menu, location, operating hours, playful imagery',
    },
    fontPair: FONTS.friendly,
    prioritySections: ['hero', 'services', 'gallery', 'stats_counter', 'contact_form', 'map'],
  },

  // ---- HEALTH & MEDICAL ----
  {
    name: 'Dental Practice',
    keywords: [
      'dental', 'dentist', 'dentista', 'odontolog', 'ortodoncia',
      'implante dental', 'blanqueamiento', 'teeth', 'clinica dental',
    ],
    palette: { primary: '#0EA5E9', secondary: '#38BDF8', cta: '#FBBF24', background: '#F0F9FF', text: '#0C4A6E', border: '#BAE6FD' },
    rule: {
      pattern: 'Social Proof-Focused + Conversion',
      stylePriority: 'Soft UI Evolution + Minimalism',
      keyEffects: 'Before/after gallery + Patient testimonial carousel + smooth transitions',
      antiPatterns: 'Poor imagery, no testimonials, cold clinical feel',
      mustHave: 'before-after gallery, appointment system, team credentials, patient reviews',
    },
    fontPair: FONTS.friendly,
    prioritySections: ['hero', 'services', 'before_after', 'team', 'testimonials', 'stats_counter', 'faq', 'contact_form', 'map'],
  },
  {
    name: 'Medical Clinic',
    keywords: [
      'medical', 'medic', 'clinic', 'clinica', 'doctor', 'hospital',
      'salud', 'health', 'consultorio', 'centro medico', 'sanatorio',
    ],
    palette: { primary: '#0891B2', secondary: '#22D3EE', cta: '#22C55E', background: '#F0FDFA', text: '#134E4A', border: '#CCFBF1' },
    rule: {
      pattern: 'Trust & Authority + Conversion',
      stylePriority: 'Accessible & Ethical + Minimalism',
      keyEffects: 'Online booking flow + Doctor profile reveals + calm transitions',
      antiPatterns: 'Outdated interface, confusing booking, bright neon, AI purple/pink',
      mustHave: 'appointment booking, insurance info, doctor credentials, patient trust signals',
    },
    fontPair: FONTS.friendly,
    prioritySections: ['hero', 'services', 'team', 'testimonials', 'stats_counter', 'faq', 'contact_form', 'map'],
  },
  {
    name: 'Pharmacy',
    keywords: ['pharmacy', 'farmacia', 'drug store', 'drogueria', 'medicamento'],
    palette: { primary: '#15803D', secondary: '#22C55E', cta: '#0369A1', background: '#F0FDF4', text: '#14532D', border: '#BBF7D0' },
    rule: {
      pattern: 'Conversion-Optimized + Trust',
      stylePriority: 'Flat Design + Accessible & Ethical',
      keyEffects: 'Clean layout + product search + trust badges',
      antiPatterns: 'Confusing layout, privacy concerns, flashy animations',
      mustHave: 'product categories, operating hours, location, trust badges',
    },
    fontPair: FONTS.clean,
    prioritySections: ['hero', 'services', 'stats_counter', 'faq', 'contact_form', 'map'],
  },
  {
    name: 'Veterinary Clinic',
    keywords: [
      'veterinar', 'vet', 'animal', 'mascota', 'pet', 'perro', 'gato',
      'clinica veterinaria', 'pet shop', 'petshop',
    ],
    palette: { primary: '#0D9488', secondary: '#14B8A6', cta: '#F97316', background: '#F0FDFA', text: '#134E4A', border: '#99F6E4' },
    rule: {
      pattern: 'Social Proof-Focused + Trust',
      stylePriority: 'Claymorphism + Accessible & Ethical',
      keyEffects: 'Pet profile management + Service animations + friendly UI',
      antiPatterns: 'Generic design, hidden services, cold clinical aesthetic',
      mustHave: 'services list, emergency contact, caring tone, pet-friendly imagery',
    },
    fontPair: FONTS.friendly,
    prioritySections: ['hero', 'services', 'team', 'testimonials', 'stats_counter', 'faq', 'contact_form', 'map'],
  },
  {
    name: 'Mental Health / Psychology',
    keywords: [
      'psicolog', 'psiquiatr', 'terapeut', 'terapia', 'mental health',
      'counseling', 'bienestar', 'wellness', 'mindfulness', 'coaching de vida',
    ],
    palette: { primary: '#8B5CF6', secondary: '#C4B5FD', cta: '#10B981', background: '#FAF5FF', text: '#4C1D95', border: '#EDE9FE' },
    rule: {
      pattern: 'Social Proof-Focused + Trust',
      stylePriority: 'Neumorphism + Accessible & Ethical',
      keyEffects: 'Soft press + Breathing animations + calming transitions',
      antiPatterns: 'Bright neon, motion overload, aggressive CTAs',
      mustHave: 'privacy-first messaging, calm aesthetic, appointment booking, professional credentials',
    },
    fontPair: FONTS.friendly,
    prioritySections: ['hero', 'services', 'how_it_works', 'testimonials', 'faq', 'contact_form'],
  },

  // ---- BEAUTY & WELLNESS ----
  {
    name: 'Beauty Salon / Spa',
    keywords: [
      'beauty', 'salon', 'spa', 'peluqueria', 'estetica', 'belleza',
      'hair', 'cabello', 'nails', 'unas', 'manicur', 'pedicur',
      'facial', 'masaje', 'massage', 'depilacion', 'barberia', 'barber',
    ],
    palette: { primary: '#EC4899', secondary: '#F9A8D4', cta: '#8B5CF6', background: '#FDF2F8', text: '#831843', border: '#FBCFE8' },
    rule: {
      pattern: 'Hero-Centric + Social Proof',
      stylePriority: 'Soft UI Evolution + Neumorphism',
      keyEffects: 'Soft shadows + Smooth transitions (200-300ms) + Gentle hover + before/after reveals',
      antiPatterns: 'Bright neon, harsh animations, dark mode, masculine aesthetic',
      mustHave: 'booking system, before-after gallery, service menu with prices, luxury/gold accents',
    },
    fontPair: FONTS.elegant,
    prioritySections: ['hero', 'services', 'before_after', 'gallery', 'team', 'testimonials', 'stats_counter', 'faq', 'contact_form', 'map'],
  },

  // ---- FITNESS ----
  {
    name: 'Gym / Fitness',
    keywords: [
      'gym', 'gimnasio', 'fitness', 'crossfit', 'yoga', 'pilates',
      'entrenamiento', 'training', 'workout', 'box', 'martial arts',
      'artes marciales', 'funcional', 'spinning', 'deportivo',
    ],
    palette: { primary: '#F97316', secondary: '#FB923C', cta: '#22C55E', background: '#1F2937', text: '#F8FAFC', border: '#374151' },
    rule: {
      pattern: 'Feature-Rich + Data',
      stylePriority: 'Vibrant & Block-based + Dark Mode (OLED)',
      keyEffects: 'Progress ring animations + Achievement unlocks + energetic transitions',
      antiPatterns: 'Static design, no gamification, passive tone, soft colors',
      mustHave: 'class schedule, membership pricing, trainer profiles, facility photos, transformation stories',
    },
    fontPair: FONTS.bold,
    prioritySections: ['hero', 'services', 'stats_counter', 'testimonials', 'team', 'gallery', 'how_it_works', 'faq', 'contact_form', 'map'],
  },

  // ---- PROFESSIONAL SERVICES ----
  {
    name: 'Legal Services',
    keywords: [
      'legal', 'lawyer', 'abogad', 'law', 'derecho', 'estudio juridico',
      'notari', 'attorney', 'bufete', 'escriban',
    ],
    palette: { primary: '#1E3A8A', secondary: '#1E40AF', cta: '#B45309', background: '#F8FAFC', text: '#0F172A', border: '#CBD5E1' },
    rule: {
      pattern: 'Trust & Authority + Minimal',
      stylePriority: 'Trust & Authority + Minimalism',
      keyEffects: 'Practice area reveal + Attorney profile animations + subtle transitions',
      antiPatterns: 'Outdated design, hidden credentials, playful colors, AI purple/pink',
      mustHave: 'case results, credential display, practice areas, professional authority',
    },
    fontPair: FONTS.clean,
    prioritySections: ['hero', 'services', 'team', 'testimonials', 'stats_counter', 'faq', 'contact_form'],
  },
  {
    name: 'Consulting Firm',
    keywords: [
      'consulting', 'consultora', 'consultor', 'asesoria', 'asesor',
      'advisory', 'management', 'estrategia', 'strategy',
    ],
    palette: { primary: '#0F172A', secondary: '#334155', cta: '#CA8A04', background: '#F8FAFC', text: '#020617', border: '#E2E8F0' },
    rule: {
      pattern: 'Trust & Authority + Minimal',
      stylePriority: 'Trust & Authority + Minimalism',
      keyEffects: 'Case study reveals + Team profiles + elegant transitions',
      antiPatterns: 'Generic content, no credentials, playful design, AI purple/pink',
      mustHave: 'case studies, thought leadership, team credentials, professional tone',
    },
    fontPair: FONTS.clean,
    prioritySections: ['hero', 'services', 'how_it_works', 'team', 'testimonials', 'stats_counter', 'faq', 'contact_form'],
  },
  {
    name: 'Accounting / Finance',
    keywords: [
      'contad', 'accounting', 'accountant', 'financ', 'impuesto', 'tax',
      'contabilidad', 'contador publico', 'auditoria', 'bookkeeping',
    ],
    palette: { primary: '#0F172A', secondary: '#1E3A8A', cta: '#CA8A04', background: '#F8FAFC', text: '#020617', border: '#E2E8F0' },
    rule: {
      pattern: 'Trust & Authority + Feature',
      stylePriority: 'Minimalism + Accessible & Ethical',
      keyEffects: 'Smooth number animations + Security indicators + professional transitions',
      antiPatterns: 'Playful design, poor security UX, hidden fees, AI purple/pink',
      mustHave: 'service listing, credentials, trust signals, consultation CTA',
    },
    fontPair: FONTS.clean,
    prioritySections: ['hero', 'services', 'how_it_works', 'stats_counter', 'testimonials', 'faq', 'contact_form'],
  },
  {
    name: 'Insurance',
    keywords: ['insurance', 'seguro', 'asegurador', 'poliza', 'cobertura'],
    palette: { primary: '#0369A1', secondary: '#0EA5E9', cta: '#22C55E', background: '#F0F9FF', text: '#0C4A6E', border: '#BAE6FD' },
    rule: {
      pattern: 'Conversion + Trust',
      stylePriority: 'Trust & Authority + Flat Design',
      keyEffects: 'Quote calculator animations + Policy comparison + trust transitions',
      antiPatterns: 'Confusing pricing, no trust signals, AI purple/pink',
      mustHave: 'service comparison, trust badges, clear pricing, consultation CTA',
    },
    fontPair: FONTS.clean,
    prioritySections: ['hero', 'services', 'how_it_works', 'stats_counter', 'testimonials', 'faq', 'contact_form'],
  },
  {
    name: 'Marketing Agency',
    keywords: [
      'marketing', 'agencia', 'agency', 'publicidad', 'advertising',
      'digital marketing', 'social media', 'branding', 'diseno grafico',
      'community manager',
    ],
    palette: { primary: '#EC4899', secondary: '#F472B6', cta: '#06B6D4', background: '#FDF2F8', text: '#831843', border: '#FBCFE8' },
    rule: {
      pattern: 'Storytelling + Feature-Rich',
      stylePriority: 'Brutalism + Motion-Driven',
      keyEffects: 'Portfolio reveals + Results animations + bold creative transitions',
      antiPatterns: 'Boring design, hidden work, corporate blandness',
      mustHave: 'portfolio showcase, results/metrics, case studies, creative authority',
    },
    fontPair: FONTS.bold,
    prioritySections: ['hero', 'services', 'gallery', 'stats_counter', 'testimonials', 'how_it_works', 'faq', 'contact_form'],
  },

  // ---- REAL ESTATE & PROPERTY ----
  {
    name: 'Real Estate',
    keywords: [
      'real estate', 'inmobiliaria', 'inmueble', 'propiedad', 'property',
      'bienes raices', 'departamento', 'alquiler', 'venta de casas',
      'corredor inmobiliario',
    ],
    palette: { primary: '#0F766E', secondary: '#14B8A6', cta: '#0369A1', background: '#F0FDFA', text: '#134E4A', border: '#99F6E4' },
    rule: {
      pattern: 'Hero-Centric + Feature-Rich',
      stylePriority: 'Glassmorphism + Minimalism',
      keyEffects: '3D property tour zoom + Map hover + elegant gallery transitions',
      antiPatterns: 'Poor photos, no virtual tours, cluttered layout',
      mustHave: 'property showcase, agent credentials, client testimonials, map integration',
    },
    fontPair: FONTS.elegant,
    prioritySections: ['hero', 'services', 'gallery', 'team', 'testimonials', 'stats_counter', 'faq', 'contact_form', 'map'],
  },

  // ---- CONSTRUCTION & HOME ----
  {
    name: 'Construction / Architecture',
    keywords: [
      'construction', 'construccion', 'architect', 'arquitect', 'builder',
      'obra', 'remodelacion', 'reforma', 'contractor', 'albani',
      'carpinter', 'herreria', 'pintura de obra',
    ],
    palette: { primary: '#64748B', secondary: '#94A3B8', cta: '#F97316', background: '#F8FAFC', text: '#334155', border: '#E2E8F0' },
    rule: {
      pattern: 'Hero-Centric + Feature-Rich',
      stylePriority: 'Minimalism + 3D & Hyperrealism',
      keyEffects: '3D model viewer + Timeline animations + project portfolio reveals',
      antiPatterns: '2D-only layouts, poor image quality, AI purple/pink',
      mustHave: 'project portfolio, services breakdown, team expertise, free estimate CTA',
    },
    fontPair: FONTS.bold,
    prioritySections: ['hero', 'services', 'before_after', 'gallery', 'how_it_works', 'testimonials', 'stats_counter', 'faq', 'contact_form', 'map'],
  },
  {
    name: 'Home Services',
    keywords: [
      'plumber', 'plomero', 'electrician', 'electricista', 'home service',
      'mantenimiento', 'reparacion', 'instalacion', 'gasista', 'cerrajero',
      'locksmith', 'handyman', 'aire acondicionado', 'hvac', 'fumigacion',
      'pest control', 'techista', 'vidrier',
    ],
    palette: { primary: '#1E40AF', secondary: '#3B82F6', cta: '#F97316', background: '#EFF6FF', text: '#1E3A8A', border: '#BFDBFE' },
    rule: {
      pattern: 'Conversion-Optimized + Trust',
      stylePriority: 'Flat Design + Trust & Authority',
      keyEffects: 'Emergency contact highlight + Service menu animations + trust badges',
      antiPatterns: 'Hidden contact info, no certifications, poor emergency visibility',
      mustHave: 'emergency contact prominent, certifications display, service areas, quick quote CTA',
    },
    fontPair: FONTS.clean,
    prioritySections: ['hero', 'services', 'how_it_works', 'testimonials', 'stats_counter', 'faq', 'contact_form', 'map'],
  },
  {
    name: 'Cleaning Service',
    keywords: [
      'cleaning', 'limpieza', 'clean', 'lavadero', 'lavanderia',
      'laundry', 'dry cleaning', 'tintoreria', 'desinfeccion',
    ],
    palette: { primary: '#0891B2', secondary: '#22D3EE', cta: '#22C55E', background: '#ECFEFF', text: '#164E63', border: '#A5F3FC' },
    rule: {
      pattern: 'Conversion-Optimized + Trust',
      stylePriority: 'Soft UI Evolution + Flat Design',
      keyEffects: 'Before/after gallery + Service package reveal + fresh clean aesthetic',
      antiPatterns: 'Poor before/after imagery, hidden pricing, cluttered design',
      mustHave: 'price transparency, trust badges, before/after photos, booking CTA',
    },
    fontPair: FONTS.friendly,
    prioritySections: ['hero', 'services', 'before_after', 'how_it_works', 'testimonials', 'stats_counter', 'faq', 'contact_form', 'map'],
  },

  // ---- EDUCATION ----
  {
    name: 'Education / Courses',
    keywords: [
      'education', 'educacion', 'school', 'escuela', 'colegio', 'curso',
      'course', 'academia', 'institute', 'instituto', 'capacitacion',
      'training', 'taller', 'workshop', 'clases particulares', 'tutor',
      'universidad', 'jardin de infantes', 'guarderia',
    ],
    palette: { primary: '#4F46E5', secondary: '#818CF8', cta: '#F97316', background: '#EEF2FF', text: '#1E1B4B', border: '#C7D2FE' },
    rule: {
      pattern: 'Feature-Rich + Social Proof',
      stylePriority: 'Claymorphism + Vibrant & Block-based',
      keyEffects: 'Progress bar animations + Certificate reveals + engaging transitions',
      antiPatterns: 'Boring design, no gamification, dark modes, complex jargon',
      mustHave: 'curriculum overview, instructor bios, progress tracking, enrollment CTA',
    },
    fontPair: FONTS.friendly,
    prioritySections: ['hero', 'services', 'how_it_works', 'team', 'testimonials', 'stats_counter', 'faq', 'contact_form'],
  },
  {
    name: 'Childcare / Daycare',
    keywords: [
      'childcare', 'daycare', 'guarderia', 'jardin maternal', 'jardin de infantes',
      'nursery', 'ninos', 'kids', 'infantil',
    ],
    palette: { primary: '#F472B6', secondary: '#FBCFE8', cta: '#22C55E', background: '#FDF2F8', text: '#9D174D', border: '#FCE7F3' },
    rule: {
      pattern: 'Social Proof-Focused + Trust',
      stylePriority: 'Claymorphism + Vibrant & Block-based',
      keyEffects: 'Parent portal animations + Activity gallery reveal + playful transitions',
      antiPatterns: 'Generic design, hidden safety info, dark themes',
      mustHave: 'parent communication info, safety certifications, activity photos, warm caring tone',
    },
    fontPair: FONTS.friendly,
    prioritySections: ['hero', 'services', 'gallery', 'team', 'testimonials', 'faq', 'contact_form', 'map'],
  },

  // ---- RETAIL & COMMERCE ----
  {
    name: 'E-commerce / Retail',
    keywords: [
      'ecommerce', 'tienda', 'shop', 'store', 'retail', 'boutique',
      'venta', 'negocio', 'bazar', 'mayorista', 'minorista', 'comercio',
    ],
    palette: { primary: '#059669', secondary: '#10B981', cta: '#F97316', background: '#ECFDF5', text: '#064E3B', border: '#A7F3D0' },
    rule: {
      pattern: 'Feature-Rich Showcase',
      stylePriority: 'Vibrant & Block-based',
      keyEffects: 'Card hover lift (200ms) + Scale effect + product showcase transitions',
      antiPatterns: 'Flat design without depth, text-heavy pages, no trust signals',
      mustHave: 'product highlights, shipping/return info, trust badges, customer reviews',
    },
    fontPair: FONTS.clean,
    prioritySections: ['hero', 'services', 'gallery', 'testimonials', 'stats_counter', 'faq', 'contact_form'],
  },
  {
    name: 'Florist / Plant Shop',
    keywords: [
      'florist', 'floreria', 'flores', 'flower', 'plant', 'vivero',
      'jardineria', 'garden', 'plantas', 'ramo',
    ],
    palette: { primary: '#15803D', secondary: '#22C55E', cta: '#EC4899', background: '#F0FDF4', text: '#14532D', border: '#BBF7D0' },
    rule: {
      pattern: 'Hero-Centric + Conversion',
      stylePriority: 'Organic Biophilic + Vibrant & Block-based',
      keyEffects: 'Product reveal + Seasonal transitions + natural color palette',
      antiPatterns: 'Poor imagery, no seasonal content, cold aesthetic',
      mustHave: 'delivery scheduling, care guides, product showcase, seasonal highlights',
    },
    fontPair: FONTS.elegant,
    prioritySections: ['hero', 'services', 'gallery', 'testimonials', 'how_it_works', 'faq', 'contact_form', 'map'],
  },
  {
    name: 'Clothing / Fashion',
    keywords: [
      'clothing', 'ropa', 'fashion', 'moda', 'indumentaria', 'textil',
      'remera', 'vestido', 'calzado', 'zapateria', 'shoe',
    ],
    palette: { primary: '#18181B', secondary: '#3F3F46', cta: '#EC4899', background: '#FAFAFA', text: '#09090B', border: '#E4E4E7' },
    rule: {
      pattern: 'Hero-Centric + Feature-Rich',
      stylePriority: 'Minimalism + Motion-Driven',
      keyEffects: 'Product gallery + Collection reveals + editorial transitions',
      antiPatterns: 'Cluttered layout, poor imagery, generic templates',
      mustHave: 'product showcase, brand story, size guides, style inspiration',
    },
    fontPair: FONTS.elegant,
    prioritySections: ['hero', 'services', 'gallery', 'testimonials', 'stats_counter', 'faq', 'contact_form'],
  },

  // ---- AUTOMOTIVE ----
  {
    name: 'Automotive / Car',
    keywords: [
      'automotive', 'auto', 'car', 'vehicle', 'mecanico', 'mechanic',
      'taller mecanico', 'concesionaria', 'dealership', 'autopart',
      'repuesto', 'gomeria', 'tire', 'lavadero de autos',
    ],
    palette: { primary: '#1E293B', secondary: '#334155', cta: '#DC2626', background: '#F8FAFC', text: '#0F172A', border: '#E2E8F0' },
    rule: {
      pattern: 'Hero-Centric + Feature-Rich',
      stylePriority: 'Motion-Driven + 3D & Hyperrealism',
      keyEffects: '360 product view + Configurator animations + bold transitions',
      antiPatterns: 'Static product pages, poor UX, dated design',
      mustHave: 'vehicle/service showcase, financing calculator, comparison tools, test drive CTA',
    },
    fontPair: FONTS.bold,
    prioritySections: ['hero', 'services', 'gallery', 'testimonials', 'stats_counter', 'faq', 'contact_form', 'map'],
  },

  // ---- HOSPITALITY & TRAVEL ----
  {
    name: 'Hotel / Hospitality',
    keywords: [
      'hotel', 'hostel', 'apart', 'alojamiento', 'lodging', 'hospedaje',
      'posada', 'cabana', 'cabin', 'resort', 'bed and breakfast', 'b&b',
    ],
    palette: { primary: '#1E3A8A', secondary: '#3B82F6', cta: '#CA8A04', background: '#F8FAFC', text: '#1E40AF', border: '#BFDBFE' },
    rule: {
      pattern: 'Hero-Centric + Social Proof',
      stylePriority: 'Liquid Glass + Minimalism',
      keyEffects: 'Room gallery + Amenity reveals + warm welcoming transitions',
      antiPatterns: 'Poor photos, complex booking, cold aesthetic',
      mustHave: 'room photography, amenity list, location/map, booking CTA, guest reviews',
    },
    fontPair: FONTS.elegant,
    prioritySections: ['hero', 'services', 'gallery', 'testimonials', 'stats_counter', 'faq', 'contact_form', 'map'],
  },
  {
    name: 'Travel / Tourism',
    keywords: [
      'travel', 'turismo', 'tourism', 'agencia de viajes', 'excursion',
      'tour', 'adventure', 'aventura', 'destino', 'vacacion',
    ],
    palette: { primary: '#0EA5E9', secondary: '#38BDF8', cta: '#F97316', background: '#F0F9FF', text: '#0C4A6E', border: '#BAE6FD' },
    rule: {
      pattern: 'Storytelling-Driven + Hero',
      stylePriority: 'Aurora UI + Motion-Driven',
      keyEffects: 'Destination parallax + Itinerary animations + immersive visuals',
      antiPatterns: 'Generic photos, complex booking, static design',
      mustHave: 'destination showcase, itineraries, mobile booking, social proof',
    },
    fontPair: FONTS.bold,
    prioritySections: ['hero', 'services', 'gallery', 'how_it_works', 'testimonials', 'stats_counter', 'faq', 'contact_form'],
  },

  // ---- EVENTS & CELEBRATIONS ----
  {
    name: 'Wedding / Event Planning',
    keywords: [
      'wedding', 'boda', 'casamiento', 'event', 'evento', 'fiesta',
      'party', 'salon de fiestas', 'catering', 'organizador', 'planificador',
      'quinceaner', 'celebracion',
    ],
    palette: { primary: '#DB2777', secondary: '#F472B6', cta: '#CA8A04', background: '#FDF2F8', text: '#831843', border: '#FBCFE8' },
    rule: {
      pattern: 'Storytelling + Social Proof',
      stylePriority: 'Soft UI Evolution + Aurora UI',
      keyEffects: 'Gallery reveals + Timeline animations + elegant romantic transitions',
      antiPatterns: 'Generic templates, no portfolio, masculine design',
      mustHave: 'portfolio gallery, planning tools, testimonials, elegant aesthetic',
    },
    fontPair: FONTS.elegant,
    prioritySections: ['hero', 'services', 'gallery', 'how_it_works', 'testimonials', 'stats_counter', 'faq', 'contact_form'],
  },

  // ---- PHOTOGRAPHY & CREATIVE ----
  {
    name: 'Photography Studio',
    keywords: [
      'photo', 'fotograf', 'photography', 'studio', 'estudio fotografico',
      'video', 'videograph', 'film', 'produccion audiovisual',
    ],
    palette: { primary: '#18181B', secondary: '#27272A', cta: '#F8FAFC', background: '#000000', text: '#FAFAFA', border: '#3F3F46' },
    rule: {
      pattern: 'Storytelling-Driven + Hero-Centric',
      stylePriority: 'Motion-Driven + Minimalism',
      keyEffects: 'Full-bleed gallery + Before/after reveal + cinematic transitions',
      antiPatterns: 'Heavy text, poor image showcase, cluttered layout',
      mustHave: 'portfolio showcase, full-bleed imagery, booking calendar, minimal UI',
    },
    fontPair: FONTS.elegant,
    prioritySections: ['hero', 'gallery', 'services', 'testimonials', 'stats_counter', 'contact_form'],
  },

  // ---- COWORKING & WORKSPACE ----
  {
    name: 'Coworking Space',
    keywords: [
      'coworking', 'workspace', 'oficina compartida', 'shared office',
      'espacio de trabajo', 'office',
    ],
    palette: { primary: '#F59E0B', secondary: '#FBBF24', cta: '#2563EB', background: '#FFFBEB', text: '#78350F', border: '#FDE68A' },
    rule: {
      pattern: 'Hero-Centric + Feature-Rich',
      stylePriority: 'Vibrant & Block-based + Glassmorphism',
      keyEffects: 'Space tour video + Amenity reveal animations + modern transitions',
      antiPatterns: 'Outdated photos, confusing layout, dated aesthetic',
      mustHave: 'virtual tour, booking system, amenity showcase, pricing plans',
    },
    fontPair: FONTS.modern,
    prioritySections: ['hero', 'services', 'gallery', 'stats_counter', 'testimonials', 'faq', 'contact_form', 'map'],
  },

  // ---- TECH & SAAS ----
  {
    name: 'SaaS / Tech',
    keywords: [
      'saas', 'software', 'tech', 'tecnologia', 'platform', 'plataforma',
      'app', 'aplicacion', 'startup', 'sistema', 'cloud', 'nube',
    ],
    palette: { primary: '#6366F1', secondary: '#818CF8', cta: '#10B981', background: '#F5F3FF', text: '#1E1B4B', border: '#E0E7FF' },
    rule: {
      pattern: 'Hero + Features + CTA',
      stylePriority: 'Glassmorphism + Flat Design',
      keyEffects: 'Subtle hover (200-250ms) + Smooth transitions + feature card animations',
      antiPatterns: 'Excessive animation, dark mode by default, cluttered layout',
      mustHave: 'product demo, feature comparison, pricing tiers, social proof metrics, free trial CTA',
    },
    fontPair: FONTS.modern,
    prioritySections: ['hero', 'features_grid', 'how_it_works', 'stats_counter', 'testimonials', 'faq', 'contact_form'],
  },

  // ---- SENIOR CARE ----
  {
    name: 'Senior Care',
    keywords: [
      'senior care', 'elderly', 'geriatric', 'geriatr', 'residencia',
      'hogar de ancianos', 'adulto mayor', 'cuidado domiciliario',
    ],
    palette: { primary: '#0369A1', secondary: '#38BDF8', cta: '#22C55E', background: '#F0F9FF', text: '#0C4A6E', border: '#E0F2FE' },
    rule: {
      pattern: 'Trust & Authority + Accessible',
      stylePriority: 'Accessible & Ethical + Soft UI Evolution',
      keyEffects: 'Large touch targets + Clear navigation + calm transitions (18px+ text)',
      antiPatterns: 'Small text, complex navigation, AI purple/pink, flashy animations',
      mustHave: 'WCAG AAA compliance, family portal info, large readable text, trust signals',
    },
    fontPair: FONTS.friendly,
    prioritySections: ['hero', 'services', 'team', 'testimonials', 'faq', 'contact_form', 'map'],
  },

  // ---- GENERIC SERVICE ----
  {
    name: 'Service Landing Page',
    keywords: [
      'service', 'servicio', 'professional', 'profesional', 'empresa',
      'company', 'negocio', 'business',
    ],
    palette: { primary: '#0EA5E9', secondary: '#38BDF8', cta: '#F97316', background: '#F0F9FF', text: '#0C4A6E', border: '#BAE6FD' },
    rule: {
      pattern: 'Hero-Centric + Trust & Authority',
      stylePriority: 'Minimalism + Social Proof-Focused',
      keyEffects: 'Testimonial carousel + CTA hover (200ms) + professional transitions',
      antiPatterns: 'Complex navigation, hidden contact info, generic copy',
      mustHave: 'social proof, clear CTA, service overview, trust signals',
    },
    fontPair: FONTS.clean,
    prioritySections: ['hero', 'services', 'how_it_works', 'testimonials', 'stats_counter', 'faq', 'contact_form', 'map'],
  },
]

// ============================================================
// Lookup Functions
// ============================================================

/**
 * Find the best matching industry design for a given category string.
 * Uses keyword matching with scoring. Returns undefined if no match.
 */
export function findIndustryDesign(category: string): IndustryDesign | undefined {
  if (!category) return undefined

  const normalized = category.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()

  let bestMatch: IndustryDesign | undefined
  let bestScore = 0

  for (const entry of INDUSTRY_DATABASE) {
    let score = 0
    for (const keyword of entry.keywords) {
      const normalizedKeyword = keyword.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      if (normalized.includes(normalizedKeyword) || normalizedKeyword.includes(normalized)) {
        // Exact match or containment — weight by keyword length (longer = more specific)
        const matchScore = normalizedKeyword.length
        score = Math.max(score, matchScore)
      }
    }

    if (score > bestScore) {
      bestScore = score
      bestMatch = entry
    }
  }

  return bestMatch
}

/**
 * Get the default design for when no industry match is found.
 * Returns the generic "Service Landing Page" entry.
 */
export function getDefaultIndustryDesign(): IndustryDesign {
  return INDUSTRY_DATABASE[INDUSTRY_DATABASE.length - 1]
}
