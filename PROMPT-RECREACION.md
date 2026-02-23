# Prompt para recrear Caffetones desde cero

> Este prompt contiene toda la especificacion necesaria para que un LLM reconstruya la aplicacion completa de Caffetones.

---

## CONTEXTO GENERAL

Construi una aplicacion SaaS web completa llamada **Caffetones** (dominio: caffetones.com). Es una plataforma de gestion integral para negocios gastronomicos (cafeterias, restaurantes, panaderias, bares, dark kitchens, food trucks, heladerias, hoteles, catering). El target principal son negocios en Latinoamerica (Argentina, Uruguay, Chile). El idioma principal de la UI y contenido de la landing es **español**.

---

## STACK TECNOLOGICO

- **Framework**: Next.js 15 (App Router) con Turbopack
- **Lenguaje**: TypeScript
- **Base de datos + Auth + Storage**: Supabase (PostgreSQL con RLS)
- **Styling**: Tailwind CSS 4 + shadcn/ui + Radix UI
- **Animaciones**: Framer Motion 12
- **Iconos**: Lucide React
- **Pagos**: Stripe (checkout, portal, webhooks)
- **IA**: OpenAI GPT-4 via AI SDK (Vercel)
- **Email**: Resend
- **QR**: qrcode.react
- **Markdown**: react-markdown + remark-gfm
- **State**: Zustand (minimo), React Context (principal)
- **Validacion**: Zod 4
- **Toasts**: Sonner
- **Deploy**: Vercel
- **React**: 19.1.0

### Package.json Dependencies
```json
{
  "@ai-sdk/openai": "^3.0.26",
  "@ai-sdk/react": "^3.0.79",
  "@radix-ui/react-checkbox": "^1.3.3",
  "@supabase/ssr": "^0.8.0",
  "@supabase/supabase-js": "^2.95.3",
  "ai": "^6.0.77",
  "class-variance-authority": "^0.7.1",
  "clsx": "^2.1.1",
  "framer-motion": "^12.34.0",
  "lucide-react": "^0.563.0",
  "next": "15.5.12",
  "next-themes": "^0.4.6",
  "qrcode.react": "^4.2.0",
  "radix-ui": "^1.4.3",
  "react": "19.1.0",
  "react-dom": "19.1.0",
  "react-intersection-observer": "^10.0.2",
  "react-markdown": "^9.1.0",
  "remark-gfm": "^4.0.1",
  "resend": "^6.9.1",
  "sonner": "^2.0.7",
  "stripe": "^20.3.1",
  "tailwind-merge": "^3.4.0",
  "zod": "^4.3.6",
  "zustand": "^5.0.11"
}
```

### next.config.ts
```typescript
{
  typescript: { ignoreBuildErrors: true },
  experimental: {
    optimizePackageImports: ['lucide-react', 'framer-motion', 'radix-ui', '@radix-ui/react-checkbox'],
  },
  images: { formats: ['image/avif', 'image/webp'] },
}
```

---

## VARIABLES DE ENTORNO

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
OPENAI_API_KEY
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
STRIPE_PRICE_STARTER_MONTHLY
STRIPE_PRICE_STARTER_ANNUAL
STRIPE_PRICE_PRO_MONTHLY
STRIPE_PRICE_PRO_ANNUAL
RESEND_API_KEY
EMAIL_FROM
NEXT_PUBLIC_APP_URL
CRON_SECRET
```

---

## ARQUITECTURA DE LA APLICACION

### Multi-Tenancy
Cada negocio es un "tenant" aislado. Todos los datos estan segregados por `tenant_id`. Supabase RLS (Row Level Security) se usa para aislar datos. Cada usuario pertenece a un tenant a traves de la tabla `tenant_users`.

### Layouts
1. **Root Layout** (`src/app/layout.tsx`): Metadata SEO, fuentes Geist, Sonner toast provider, dark mode
2. **Dashboard Layout** (`src/app/(dashboard)/layout.tsx`): Wraps con TenantProvider, DisplayModeProvider, ColorPaletteProvider, LocaleProvider. Sidebar + Header + Main + TrialBanner
3. **Auth Layout** (`src/app/(auth)/layout.tsx`): Minimal, solo LocaleProvider
4. **Admin Layout** (`src/app/(admin)/layout.tsx`): Verificacion de superadmin, sidebar admin

### Middleware
El middleware (`src/middleware.ts` → `src/lib/supabase/middleware.ts`) hace:
1. Deteccion de subdominio admin → rewrite a `/admin`
2. Manejo de sesion Supabase (actualiza cookies)
3. Proteccion de rutas: paths publicos vs protegidos
4. Si usuario autenticado va a `/login` → redirect a `/dashboard`
5. Gating de suscripcion: chequea cookie `_tenant_cache` (cache de 5 min) para status de subscripcion. Si trial expirado → redirect a `/subscription` (paywall). Si no hizo onboarding → redirect a `/onboarding`

---

## SCHEMA DE BASE DE DATOS (TIPOS TYPESCRIPT)

```typescript
// Enums
type SubscriptionStatus = 'active' | 'trial' | 'past_due' | 'cancelled' | 'suspended'
type UserRole = 'owner' | 'admin' | 'kitchen' | 'floor' | 'purchasing' | 'accounting' | 'auditor'
type StorageType = 'freezer' | 'fridge' | 'ambient'
type UnitType = 'g' | 'kg' | 'ml' | 'l' | 'unit' | 'pack'
type StockStatus = 'ok' | 'low' | 'critical' | 'out'
type TableStatus = 'free' | 'occupied' | 'ordering' | 'served' | 'closing' | 'closed'
type OrderStatus = 'pending' | 'sent_to_kitchen' | 'preparing' | 'ready' | 'served' | 'cancelled'
type PurchaseOrderStatus = 'draft' | 'sent' | 'partial' | 'received' | 'cancelled'
type BatchStatus = 'planned' | 'in_progress' | 'completed' | 'cancelled'
type PaymentMethod = 'cash' | 'card' | 'mixed'
type OrderOverallStatus = 'pending' | 'sent_to_kitchen' | 'preparing' | 'ready' | 'served' | 'cancelled' | 'closed' | 'refunded'
type TableShape = 'rectangle' | 'circle' | 'square'
type OrderItemStatus = 'pending' | 'sent_to_kitchen' | 'preparing' | 'ready' | 'served' | 'cancelled'
type ChatMessageRole = 'user' | 'assistant' | 'system'
type LoyaltyRuleType = 'product_count' | 'spend_threshold' | 'birthday'
type LoyaltyRewardType = 'free_product' | 'discount_percent' | 'discount_fixed'
type BillingPlan = 'free' | 'starter' | 'pro'
type BillingPeriod = 'monthly' | 'annual'
type ClockEventType = 'clock_in' | 'clock_out'

// Tablas principales
interface Tenant {
  id, name, slug, owner_user_id,
  subscription_status: SubscriptionStatus,
  trial_ends_at, stripe_customer_id, stripe_subscription_id, stripe_price_id,
  billing_plan: BillingPlan, billing_period: BillingPeriod,
  current_period_end, cancel_at_period_end,
  settings: { currency, timezone, locale, target_margin_default, low_margin_threshold, trap_margin_threshold },
  created_at, updated_at
}

interface TenantUser {
  id, auth_user_id, tenant_id, role: UserRole,
  full_name, email, phone, address, national_id, hire_date, notes,
  is_active, is_superadmin, invited_by, invited_at, accepted_at, created_at
}

interface Supplier {
  id, tenant_id, name, contact_name, phone, email, notes, is_active, created_at
}

interface Ingredient {
  id, tenant_id, name, category, unit: UnitType,
  pack_size, pack_unit: UnitType, cost_per_pack, cost_per_unit,
  supplier_id, min_stock, current_stock, storage_type: StorageType,
  shelf_life_days, allergens: string[], is_active, created_at, updated_at
}

interface Recipe {
  id, tenant_id, name, category,
  batch_size, batch_unit, yield_percentage,
  total_cost_batch, cost_per_portion, suggested_price,
  target_margin, selling_price, actual_margin,
  is_sub_recipe, prep_time_min, storage_type: StorageType,
  shelf_life_hours, is_active, photo_url, created_at, updated_at,
  recipe_ingredients?: RecipeIngredient[]
}

interface RecipeIngredient {
  id, recipe_id, ingredient_id, sub_recipe_id,
  quantity, unit: UnitType, cost_at_creation,
  ingredient?: Ingredient, sub_recipe?: Recipe
}

interface Product {
  id, tenant_id, name, category, recipe_id,
  selling_price, cost, margin, image_url, is_active,
  created_at, updated_at, recipe?: Recipe
}

interface CafeTable {
  id, tenant_id, location_id, name, capacity,
  status: TableStatus, current_order_id,
  position_x, position_y, shape: TableShape, width, height,
  is_active, created_at, updated_at,
  current_order?: Order
}

interface Order {
  id, tenant_id, table_id, customer_id, order_number,
  status: OrderOverallStatus, created_by,
  subtotal, discount_amount, tax_amount, total, tip_amount,
  payment_method: PaymentMethod, paid_at, cash_shift_id,
  refunded_at, refund_reason, notes, created_at, updated_at,
  table?: CafeTable, items?: OrderItem[], customer?: Customer
}

interface OrderItem {
  id, order_id, recipe_id, product_id,
  quantity, unit_price, notes,
  status: OrderItemStatus,
  sent_to_kitchen_at, ready_at, served_at, created_at,
  recipe?: Recipe, product?: Product
}

interface StockMovement {
  id, tenant_id, ingredient_id, recipe_id,
  quantity, // positivo = entrada, negativo = salida
  reason: 'purchase'|'production'|'sale'|'adjustment'|'waste'|'expired'|'correction',
  reference_id, reference_type, notes, created_by, created_at
}

interface PurchaseOrder {
  id, tenant_id, supplier_id, status: PurchaseOrderStatus,
  created_by, expected_delivery, total_estimated, total_actual, notes,
  created_at, updated_at,
  supplier?: Supplier, lines?: PurchaseOrderLine[]
}

interface PurchaseOrderLine {
  id, purchase_order_id, ingredient_id,
  quantity_ordered, quantity_received,
  unit_cost_estimated, unit_cost_actual,
  ingredient?: Ingredient
}

interface CashShift {
  id, tenant_id, opened_by, closed_by,
  opened_at, closed_at, opening_cash, closing_cash,
  expected_cash, cash_difference,
  total_cash, total_card, total_tips, total_discounts, total_tax, total_revenue,
  order_count, notes, is_active, created_at
}

interface Customer {
  id, tenant_id, name, phone, email, birthday, notes,
  total_spent, visit_count, created_at, updated_at
}

interface LoyaltyRule {
  id, tenant_id, name, type: LoyaltyRuleType,
  trigger_product_category, trigger_count, trigger_amount,
  reward_type: LoyaltyRewardType, reward_value, reward_product_category,
  is_active, created_at, updated_at
}

interface LoyaltyProgress {
  id, customer_id, rule_id, current_count, current_amount, created_at, updated_at
}

interface LoyaltyRedemption {
  id, customer_id, rule_id, order_id, reward_description, redeemed_at
}

interface ChatSession {
  id, tenant_id, user_id, title, created_at, updated_at
}

interface ChatMessage {
  id, session_id, role: ChatMessageRole, content, metadata, created_at
}

interface AuditLog {
  id, tenant_id, user_id, action, entity_type, entity_id,
  changes: Record<string, { old, new }>, created_at
}

interface EmployeeSchedule {
  id, tenant_id, employee_id, schedule_date,
  start_time, end_time, break_minutes, notes, created_by, created_at, updated_at
}

interface EmployeeClockEvent {
  id, tenant_id, employee_id, event_type: ClockEventType,
  event_time, notes, created_at
}

interface EmployeeWeeklyTemplate {
  id, tenant_id, employee_id, day_of_week,
  start_time, end_time, break_minutes, is_active, created_by, created_at, updated_at
}

interface EmployeeDocument {
  id, tenant_id, employee_id, name, file_url, file_type,
  category: 'contract'|'payslip'|'id_document'|'certificate'|'other',
  uploaded_by, created_at
}

interface Location {
  id, tenant_id, name, address, is_active, created_at
}
```

---

## SISTEMA DE PERMISOS (RBAC)

### 7 roles con 22 permisos granulares:

```typescript
type Permission =
  | 'recipes.view' | 'recipes.create' | 'recipes.edit' | 'recipes.delete'
  | 'ingredients.view' | 'ingredients.create' | 'ingredients.edit' | 'ingredients.delete'
  | 'stock.view' | 'stock.create'
  | 'purchases.view' | 'purchases.create' | 'purchases.receive'
  | 'suppliers.view' | 'suppliers.create' | 'suppliers.edit' | 'suppliers.delete'
  | 'settings.view' | 'settings.edit'
  | 'team.view' | 'team.manage'
  | 'reports.view'
  | 'orders.view' | 'orders.create' | 'orders.manage'
  | 'tables.view' | 'tables.manage'
  | 'pos.checkout'
  | 'menu.view' | 'menu.edit'
  | 'chat.use'
  | 'simulator.view'
  | 'sales.view' | 'sales.manage'
  | 'customers.view' | 'customers.manage'
  | 'floor_plan.edit'
  | 'employees.view' | 'employees.manage'

// owner & admin: TODOS los permisos
// kitchen: recipes (view/create/edit), ingredients (view), stock (view/create), orders (view), tables (view)
// floor: recipes (view), orders (all), tables (all), pos.checkout, sales (view), customers (all)
// purchasing: ingredients (view), stock (all), purchases (all), suppliers (view/create/edit)
// accounting: recipes (view), ingredients (view), purchases (view), reports (view), settings (view), orders (view), simulator (view), sales (view), customers (view)
// auditor: recipes (view), ingredients (view), stock (view), purchases (view), reports (view), orders (view), sales (view), customers (view)
```

Se implementa con:
- `hasPermission(role, permission)` — funcion helper
- `<PermissionGate permission="xxx">` — wrapper de componentes
- `usePermission()` hook → `{ can }` funcion
- `NAV_PERMISSIONS` map para visibilidad del sidebar

---

## SISTEMA DE BILLING (STRIPE)

### 2 planes:

**Starter** — $29/mes o $290/año
- Hasta 3 miembros del equipo
- 1 local
- 50 recetas
- 100 queries IA/mes
- Features: Recetas, Stock, POS, Reportes, Menu QR, Soporte email

**Pro** — $59/mes o $590/año (badge "Popular")
- Miembros ilimitados
- 5 locales
- Recetas ilimitadas
- IA ilimitada
- Features: Todo de Starter + Simulador avanzado, Produccion, Exportacion, Soporte prioritario

### Trial
- 14 dias gratis, sin tarjeta de credito
- Progress bar en la UI mostrando dias restantes
- Cron job envia email de aviso antes de expirar
- Al expirar → paywall `/subscription`

### Webhook events manejados:
- `checkout.session.completed` → Activar suscripcion
- `customer.subscription.updated` → Actualizar plan/status/periodo
- `customer.subscription.deleted` → Marcar como cancelled
- `invoice.payment_failed` → Set status past_due

### Endpoints Stripe:
- `POST /api/stripe/checkout` — Crear sesion de checkout
- `POST /api/stripe/portal` — Portal de billing del cliente
- `POST /api/stripe/change-plan` — Upgrade/downgrade
- `POST /api/stripe/cancel` — Cancelar suscripcion
- `POST /api/stripe/reactivate` — Reactivar suscripcion cancelada
- `POST /api/stripe/webhook` — Webhook handler

---

## INTERNACIONALIZACION (i18n)

- 3 idiomas: Español (es, default), English (en), Catalan (ca)
- Storage: localStorage key `caffetones-locale`
- Carga dinamica de traducciones
- Hook: `useTranslation()` → `{ locale, setLocale, t }`
- Formato de keys: `section.subsection.key` (ej: `nav.sales.pos`)
- Soporte para parametros: `{variable}` reemplazado con `params.variable`
- Fallback a español si no hay traduccion

---

## PAGINAS Y RUTAS COMPLETAS

### Auth (`/app/(auth)/`)
- `/login` — Email/password + Google OAuth
- `/register` — Registro
- `/forgot-password` — Recuperar contraseña
- `/reset-password` — Confirmar reset
- `/verify-email` — Verificar email

### Dashboard (`/app/(dashboard)/`)

**Ventas & POS:**
- `/dashboard` — Dashboard principal con KPIs
- `/sales` — Analytics de ventas diarias/semanales/mensuales
- `/pos` — POS con mesas (vista grid + floor plan)
- `/pos/quick` — Barra rapida para mostrador/takeout
- `/pos/kitchen` — Pantalla de cocina (KDS)

**Catalogo & Inventario:**
- `/products` — Gestion de productos
- `/recipes` — Listado de recetas
- `/recipes/new` — Crear receta
- `/recipes/[id]` — Ver/editar receta
- `/recipes/[id]/edit` — Editor de receta
- `/recipes/import` — Importar recetas desde menu
- `/ingredients` — Ingredientes
- `/stock` — Movimientos de stock
- `/stock/receipt-scanner` — Recibir compras
- `/purchases` — Ordenes de compra
- `/purchases/[id]` — Detalle de orden de compra
- `/suppliers` — Directorio de proveedores
- `/production` — Planificacion de produccion & mise en place

**Clientes:**
- `/customers` — CRM de clientes
- `/customers/[id]` — Perfil de cliente e historial
- `/customers/loyalty` — Reglas de lealtad

**Empleados:**
- `/employees` — Overview del equipo
- `/employees/schedule` — Sistema de turnos
- `/employees/attendance` — Control de asistencia (clock in/out)
- `/employees/team` — Gestion de equipo

**Analytics & Reportes:**
- `/reports` — Reportes completos (food cost, margenes, stock value, tendencias)
- `/simulator` — Simulador de precios y calculadora de margenes
- `/accounting` — Vista contable
- `/alerts` — Alertas de negocio

**IA:**
- `/ai` — Hub central de IA
- `/ai/brain` — Chat de inteligencia de negocio
- `/ai/invoice-scanner` — Escaneo OCR de facturas
- `/ai/recipe-from-photo` — Generar receta desde foto
- `/ai/menu-optimizer` — Optimizador de menu IA
- `/ai/sales-forecast` — Pronostico de ventas
- `/ai/smart-insights` — Insights inteligentes

**Configuracion:**
- `/settings` — Configuracion del workspace, equipo, lealtad, QR
- `/profile` — Perfil de usuario
- `/subscription` — Gestion de suscripcion
- `/onboarding` — Wizard de primera vez (4 pasos)
- `/help` — Ayuda y documentacion
- `/help/[section]` — Secciones de ayuda

### Admin (`/app/(admin)/`)
- `/admin` — Dashboard admin con MRR, metricas, churn
- `/admin/login` — Login admin
- `/admin/tenants` — Gestion de tenants
- `/admin/tenants/[id]` — Detalle de tenant
- `/admin/leads` — CRM de leads
- `/admin/leads/[id]` — Detalle de lead con emails y notas
- `/admin/activity` — Log de actividad
- `/admin/email-templates` — Templates de email
- `/admin/revenue` — Analytics de revenue
- `/admin/scraper` — Gestion de scraper web

### Publicas
- `/` — Landing page
- `/pricing` — Pagina de precios
- `/paywall` — Paywall para trial/suscripcion expirada
- `/menu/[slug]` — Menu publico con QR
- `/privacy` — Politica de privacidad
- `/terms` — Terminos de servicio

---

## COMPONENTES (114 totales)

### Landing Page (17 componentes en `/components/landing/`)
hero.tsx, navbar.tsx, social-proof.tsx, features-scroll.tsx, tools-showcase.tsx, before-after.tsx, how-it-works.tsx, ai-demo.tsx, ai-vision.tsx, integrations.tsx, stats-counter.tsx, testimonials.tsx, try-banner.tsx, pricing-section.tsx, faq-section.tsx, final-cta.tsx, footer.tsx

### POS (10 componentes en `/components/pos/`)
order-panel.tsx, floor-plan.tsx, floor-table.tsx, table-card.tsx, table-form.tsx, quick-pos.tsx, recipe-selector.tsx, checkout-dialog.tsx, transfer-table-dialog.tsx, kds-order-card.tsx

### Recipes (4 componentes en `/components/recipes/`)
recipe-form.tsx, recipe-tech-sheet.tsx, ai-measure-helper.tsx, import-menu-table.tsx

### Sales (9 componentes en `/components/sales/`)
sales-reports.tsx, daily-sales.tsx, order-history.tsx, order-receipt.tsx, cash-shift.tsx, close-shift-dialog.tsx, channel-report.tsx, manual-sale.tsx, refund-dialog.tsx

### Reports (4 componentes)
food-cost-report.tsx, margin-report.tsx, cost-trends-report.tsx, stock-value-report.tsx

### Customers (4 componentes)
customer-form.tsx, customer-search.tsx, loyalty-alert.tsx, loyalty-rule-form.tsx

### Stock (4 componentes)
stock-movement-form.tsx, waste-form.tsx, waste-report.tsx, receipt-scanner.tsx

### Employees (4 componentes)
employees-overview.tsx, employees-schedule.tsx, employees-attendance.tsx, employees-team.tsx

### Settings (3 componentes)
invite-user-form.tsx, loyalty-settings-card.tsx, qr-generator.tsx

### Admin (10 componentes)
leads-table.tsx, leads-kanban.tsx, lead-panel.tsx, lead-notes.tsx, lead-email-dialog.tsx, email-composer.tsx, whatsapp-dialog.tsx, activity-timeline.tsx, mrr-chart.tsx

### Otros componentes de feature
ingredient-form.tsx, product-form.tsx, purchase-orders-list.tsx, single-recipe-simulator.tsx, bulk-simulator.tsx, margin-target-calculator.tsx, production-planner.tsx, chat-widget.tsx, chat-message.tsx, app-sidebar.tsx, admin-sidebar.tsx, admin-layout-shell.tsx, menu-item-card.tsx, menu-category.tsx, allergen-badge.tsx, alerts-panel.tsx, trial-banner.tsx

### UI (shadcn/Radix)
avatar, badge, button, card, checkbox, dialog, dropdown-menu, image-upload, input, label, popover, progress, select, separator, sheet, sidebar, skeleton, sonner, table, tabs, textarea, tooltip

### Utilidades
permission-gate.tsx, bulk-action-bar.tsx, bulk-price-editor.tsx, notification-bell.tsx, help-layout.tsx, caffe-iso.tsx (logo)

---

## API ROUTES (40+ endpoints)

### Auth
- `POST /api/auth/callback` — OAuth callback

### AI & Chat
- `POST /api/chat` — AI Brain streaming (GPT-4, rate limit 20/min, con contexto de negocio real)
- `POST /api/ai/recipe-from-photo` — Foto → receta con costos
- `POST /api/ai/invoice-scan` — OCR de facturas → items
- `POST /api/ai/menu-optimizer` — Optimizar menu
- `POST /api/ai/sales-forecast` — Pronostico de ventas
- `POST /api/ai/smart-insights` — Insights de negocio
- `POST /api/ai/generate-product-image` — Generar imagen de producto

### Utilidades
- `POST /api/receipt` — Procesamiento de recibos
- `POST /api/convert-measure` — Conversion de unidades
- `POST /api/import-menu` — Importar menu masivo

### Stripe (6 endpoints ya detallados arriba)

### Admin (20+ endpoints)
- CRUD de tenants, leads, activity, stats, metrics, MRR, revenue
- Email: templates, bulk-email, tracking
- Scraper: CRUD + ejecucion

### Cron Jobs
- `POST /api/cron/mrr-snapshot` — Calculo diario de MRR
- `POST /api/cron/scraper` — Ejecucion programada del scraper
- `POST /api/cron/trial-expiring` — Notificaciones de trial por expirar

---

## SISTEMA DE IA

### AI Brain (Chat)
- Modelo: GPT-4 via Vercel AI SDK
- Rate limit: 20 requests/min por usuario
- Streaming de respuestas
- System prompt en español, persona de consultor de negocios gastronimicos experto
- Contexto inyectado: datos reales del negocio (ventas, recetas, stock, clientes, costos, proveedores, alertas, tendencias)

### Context Queries (`src/lib/ai/context-queries.ts`)
Funciones que fetchean y formatean para el prompt:
- Resumen de ingredientes, recetas, stock, compras, ordenes
- Tendencias de ventas, top productos, alertas de negocio
- Items vendidos hoy, analisis de profit, resumen de clientes
- Resumen de proveedores, ventas por hora, resumen de waste, rentabilidad de recetas

### AI Vision
- **Recipe from Photo**: Subir foto de comida → GPT-4 Vision → nombre, categoria, dificultad, tiempo, ingredientes con costos, instrucciones, margen estimado
- **Invoice Scanner**: Escanear factura → extraer items → auto-popular ordenes de compra

### Otros tools IA
- Menu Optimizer, Sales Forecast, Smart Insights, Generate Product Image

---

## SISTEMA DE LEALTAD

### Reglas de Lealtad
- 3 tipos: `product_count` (compra N items), `spend_threshold` (gasta $X), `birthday`
- 3 tipos de recompensa: `free_product`, `discount_percent`, `discount_fixed`
- Progreso trackeado por cliente + regla
- Al cumplir trigger → descuento automatico + registro de redencion + reset de progreso

### Funciones
- `checkBenefits()` — Chequear si cliente califica
- `applyBenefit()` — Aplicar descuento a la orden
- `updateProgress()` — Incrementar contador despues de cada compra

---

## SISTEMA DE ALERTAS

### Tipos de alerta
- **Stock**: Sin stock (critical), stock bajo (warning), por vencer (info)
- **Margenes**: Margen bajo <40% (warning), margen trampa <25% (critical)
- **Ventas**: Ventas debajo del promedio (info), sin ventas hoy (critical)
- **Costos**: Aumento de precio de proveedor (warning), waste inusual (warning)
- **Vencimiento**: Ingrediente por vencer (warning)

Cache de 30 segundos. Traducibles. Filtradas por rol.

---

## SISTEMA DE EMAILS

- Provider: Resend
- Templates: layout base, welcome, trial-expiring, team-invite
- Admin: bulk email, templates custom, tracking de email, WhatsApp

---

## CURRENCY & FORMATTING

- Hook `useCurrency()` → `fc()` (formatCurrency)
- Soporte multi-moneda via Intl API
- Monedas: ARS, USD, EUR, MXN, COP, PEN, CLP, UYU, etc.
- Funciones: formatCurrency, formatCostPerUnit, formatUnit, formatBatchUnit, translateUnit, getCompatibleUnits, packSizeInBaseUnit

---

## STOCK MANAGEMENT

- `stock-check.ts` — Verificar disponibilidad antes de orden
- `stock-deduction.ts` — Deducir del inventario al completar orden
- `stock-refund.ts` — Devolver stock al cancelar/reembolsar

---

## DISPLAY MODES & RESPONSIVE

- Modos: 'pc' | 'tablet' (guardado en localStorage)
- En tablet: touch targets minimos de 44px, inputs de 44px, checkboxes 24x24, fuentes mas grandes
- Atributo HTML: `data-display-mode="tablet"`
- Mobile-first approach

---

## ONBOARDING (4 pasos)

**Paso 0 — Bienvenida**: Nombre del negocio + seleccion de moneda (EUR default)
**Paso 1 — Primer ingrediente**: Nombre, categoria (13 opciones), unidad, pack size, costo, storage type
**Paso 2 — Primera receta**: Nombre, categoria, porciones, ingrediente con cantidad, precio de venta. Calculo en tiempo real de costo y margen
**Paso 3 — Completado**: Resumen con receta creada, costo, precio, margen. CTA "Ir al Dashboard"

Indicador de progreso: 4 circulos numerados

---

## LANDING PAGE COMPLETA

### Estructura de secciones (en orden):
```
1. Navbar
2. Hero
3. SocialProof
4. FeaturesScroll
5. ToolsShowcase
6. BeforeAfter
7. HowItWorks
8. AIDemo
9. AIVision
10. Integrations
11. StatsCounter
12. Testimonials
13. TryBanner
14. PricingSection
15. FAQSection
16. FinalCTA
17. Footer
```

### NAVBAR
- Desktop: Logo (izq), Links centro (Funcionalidades, Precios, FAQ), CTAs derecha ("Ingresar" ghost, "Empezar gratis" primary)
- Mobile: Logo + menu hamburguesa colapsable
- Scroll state: bg/border/shadow despues de 20px de scroll
- Animacion slide-in desde arriba

### HERO
- **Badge**: "Plataforma todo-en-uno para gastronomia" con borde glow animado
- **Headline** (animada word-by-word, 0.08s delay): "Controla los costos de tu negocio gastronomico" — ultimas 3 palabras en color primary
- **Subtitulo** (2 lineas):
  - "Recetas, stock, POS, cocina, reportes y IA. Todo integrado."
  - "Deja las planillas de Excel. Toma decisiones con datos reales."
- **CTAs**:
  - Primary: "Empezar gratis" + arrow + shimmer effect
  - Secondary: "Ver funcionalidades" + chevron
- **Trust text**: "14 dias gratis. Sin tarjeta de credito."
- **Mock Dashboard** (card animado):
  - "Ventas hoy": $48,250 (counter animado)
  - "Food cost": 28.4% (counter)
  - "Pedidos": 127 (counter)
  - "Items bajos": 3 (counter)
  - Grafico de barras: 12 barras con animacion escalonada
  - Top Product: "Latte" - 42 vendidos con progress bar (78%)
- **Efectos**: Gradient background shift (8s), floating shapes (6s-10s), scroll indicator bounce

### SOCIAL PROOF
- Stack de 5 avatares con iniciales (LM, MR, VS, JC, AP)
- "+100"
- 5 estrellas amarillas + "4.9"
- "Confiado por +100 negocios en Argentina, Uruguay y Chile"

### FEATURES SCROLL (9 cards)

| # | Icono | Titulo | Descripcion | Gradiente |
|---|-------|--------|-------------|-----------|
| 1 | UtensilsCrossed | Costeo real por receta | Calcula el costo real de cada porcion con merma, sub-recetas y conversion de unidades automatica. | orange→red |
| 2 | Package | Stock con alertas | Sabes que te falta antes de que se acabe. Minimos, alertas y lista de compra por proveedor. | blue→cyan |
| 3 | TrendingUp | Margenes claros | Ve el margen real de cada producto. Detecta productos trampa que te hacen perder plata. | green→emerald |
| 4 | Armchair | POS con mesas | Toma pedidos por mesa, envia a cocina, cobra y cierra turno de caja. Todo desde el navegador. | purple→pink |
| 5 | Zap | Barra rapida | Para el mostrador: selecciona productos, cobra y listo. Perfecto para cafes de alto volumen. | yellow→orange |
| 6 | ChefHat | Pantalla de cocina (KDS) | Tu equipo de cocina ve los pedidos en tiempo real. Sin papelitos ni confusiones. | red→rose |
| 7 | ShoppingCart | Compras inteligentes | Genera ordenes de compra desde el stock bajo. Agrupa por proveedor y trackea entregas. | teal→cyan |
| 8 | BarChart3 | Reportes y food cost | Food cost real vs teorico, tendencias de costos, valor de inventario y mas. | indigo→blue |
| 9 | Brain | Cerebro IA | Preguntale a la IA sobre tu negocio: stock, recetas, costos. Responde con tus datos reales. | violet→purple |

Desktop: scroll horizontal con indicador de progreso. Mobile: grid vertical.

### TOOLS SHOWCASE (6 modulos interactivos)
Cada uno muestra un mockup animado:
1. **Costeo**: Receta "Latte doble" con 3 ingredientes, breakdown de costos, total/precio/margen
2. **Stock**: 4 ingredientes con niveles (critico rojo, bajo naranja, ok verde)
3. **POS**: 6 mesas en grid 3x2 con estados (ocupada con $total, pidiendo cuenta, libre)
4. **KDS**: 3 ordenes con timestamps y badges de estado (Nuevo azul, Preparando naranja, Listo verde)
5. **Reportes**: 4 metricas (food cost real/teorico, ventas del mes, ticket promedio) + grafico de barras
6. **Compras**: 3 ordenes de compra con proveedores y estados

Navegacion: Mobile grid 3x2 tabs, Desktop sidebar izquierdo tabs

### BEFORE/AFTER (6 pares)

| Antes (X rojo) | Despues (✓ verde) |
|-----------------|-------------------|
| Costos en Excel (o en la cabeza) | Costeo automatico por receta |
| Stock a ojo, te enteras cuando falta | Alertas de stock minimo en tiempo real |
| No sabes cuanto ganas por producto | Margenes claros por cada producto |
| Papelitos en cocina que se pierden | Pantalla de cocina digital (KDS) |
| Pedidos anotados en cuaderno | POS con mesas, barra y cierre de caja |
| Compras por intuicion | Ordenes de compra desde stock bajo |

Stagger 0.1s entre filas

### HOW IT WORKS (3 pasos)

**01** (UserPlus) "Crea tu cuenta gratis"
→ "Registrate en 30 segundos. 14 dias de prueba gratuita, sin tarjeta de credito."

**02** (BookOpen) "Carga ingredientes y recetas"
→ "El wizard te guia paso a paso. En minutos tenes tu primer costo calculado."

**03** (Rocket) "Controla tu negocio"
→ "Ventas, stock, margenes y compras. Todo en un solo lugar, desde cualquier dispositivo."

Linea conectora animada, numeros con spring physics

### AI DEMO (4 conversaciones interactivas)

4 tabs/topics con chat simulado (typing animation 12ms/char):

**Topic 1 — Costos**: "Cuanto me cuesta producir 100 medialunas?" → Respuesta con breakdown de costo por unidad, top ingredientes, margenes
**Topic 2 — Stock**: "Que ingredientes tengo bajos de stock?" → 3 items debajo del minimo con indicadores de urgencia
**Topic 3 — Ventas**: "Cual es mi producto mas rentable del mes?" → Latte doble, 842 ventas, $404,160 revenue, 71.9% margen
**Topic 4 — Precios**: "Si la harina sube un 15%, como me afecta?" → 23 recetas afectadas, food cost 28.4% → 30.1%

Chat window con header "Cerebro IA" + status online, mensajes user (derecha, primary bg) / AI (izquierda, muted bg), dots de typing animados

### AI VISION (2 demos interactivos)

**Demo 1 — Foto → Receta**:
Upload → Analisis (2.5s, scan lines + detection boxes) → Resultado:
- Receta: "Tarta de Ricota y Espinaca", 8 porciones
- 6 ingredientes con costos
- Costo total: $3,625, por porcion: $453, precio sugerido: $1,800, margen: 74.8%

**Demo 2 — Factura → Stock**:
Upload → Escaneo (3s) → Resultado:
- Factura: "Distribuidora Lacteos del Sur", FC-A 0004-00012847
- 4 items procesados con actualizacion de stock
- Badges resumen: "4 stocks" (verde), "4 costos" (azul)

3 pasos de progreso visual

### INTEGRATIONS (Hub-and-spoke)
Centro: Logo Caffetones en circulo primary con sombra
8 modulos conectados con lineas SVG animadas (pathLength):
POS, Cocina, Stock, Reportes, IA, Compras, Menu QR, Multi-local
Cada uno con icono y gradiente unico

### STATS COUNTER (4 metricas animadas)

| Icono | Numero | Sufijo | Label | Gradiente |
|-------|--------|--------|-------|-----------|
| UtensilsCrossed | 500 | + | Recetas calculadas | orange→red |
| Store | 100 | + | Negocios activos | blue→cyan |
| PiggyBank | 30 | % | Ahorro promedio | green→emerald |
| Shield | 99.9 | % | Uptime garantizado | purple→pink |

Animacion counter al entrar en viewport (2000ms, easeOut cubic)

### TESTIMONIALS (5, carousel)

**1. Lucia M.** — Cafe del Parque, Buenos Aires, Duena de Cafe
"Antes tenia todo en Excel y nunca sabia cuanto me costaba cada cafe. Con Caffetones calculo los costos en segundos y ya se exactamente cuanto gano por cada taza."

**2. Martin R.** — Pan & Co, Rosario, Chef
"La pantalla de cocina cambio todo. Los pedidos llegan directo, sin papelitos que se pierden. Y el control de stock me ahorra horas cada semana."

**3. Valeria S.** — La Tostadora, Cordoba, Gerente
"El POS es increiblemente rapido. En horas pico mis empleados toman pedidos sin demora. Y los reportes de food cost me ayudaron a bajar costos un 20%."

**4. Diego F.** — Masa Madre, Mendoza, Dueno
"La IA es lo mejor. Le pregunto cuanto me cuesta producir 100 medialunas y me responde al instante con datos reales de mi negocio. Increible."

**5. Carolina P.** — Brew Lab, Montevideo, Fundadora
"Gestionamos 3 locales desde una sola cuenta. Las alertas de stock y las ordenes de compra automaticas nos cambiaron la vida."

4.9★ rating cada uno. Desktop: 3 cards, auto-advance 5s. Mobile: 1 card. Pause on hover. Navegacion prev/next + 5 dots.

### TRY BANNER
- "Probalo gratis por 14 dias"
- "Sin tarjeta de credito. Cancela cuando quieras. Todos los modulos incluidos."
- Background gradient con iconos de cafe flotando animados
- CTA primary con shimmer

### PRICING (2 planes, toggle mensual/anual)
Ya detallado arriba. Toggle con badge "-17%" en anual. Footer: "Ahorra 2 meses con el plan anual."

### FAQ (8 accordions)

1. "Necesito instalar algo?" → No. 100% en navegador. Cualquier dispositivo.
2. "Que pasa cuando termina mi trial?" → Cuenta se pausa. Datos guardados. Reactivar cuando quieras.
3. "Puedo cambiar de plan despues?" → Si. Upgrade/downgrade en cualquier momento. Prorrateado.
4. "Mis datos estan seguros?" → Si. Espacio aislado con RLS. Nadie mas ve tus datos.
5. "Sirve para restaurantes o solo cafeterias?" → Cualquier negocio gastronomico.
6. "Tienen app mobile?" → PWA. Agregar a pantalla de inicio.
7. "Como funciona la IA?" → Analiza datos reales y responde en lenguaje natural.
8. "Puedo importar datos desde Excel?" → Si. CSV/Excel + IA escanea facturas.

### FINAL CTA
- Background: gradient animado con glow
- "Listo para controlar tus costos?"
- "Unite a Caffetones y empieza a tomar decisiones con datos reales."
- "14 dias gratis. Sin tarjeta de credito."
- Boton blanco con shimmer

### FOOTER
- **Brand**: Logo, descripcion, links sociales (Instagram, X)
- **Producto**: Funcionalidades, Precios, FAQ
- **Recursos**: Soporte (mailto), Estado del servicio
- **Legal**: Privacidad, Terminos
- "© {year} Caffetones. Todos los derechos reservados."
- "Hecho con cafe en Argentina"

### LOGO MARQUEE (scrolling horizontal)
"Para todo tipo de negocio gastronomico"
Badges: Cafeterias de especialidad, Panaderias artesanales, Restaurantes, Bares y pubs, Dark kitchens, Heladerias, Food trucks, Hoteles, Catering, Comedores

---

## SIDEBAR NAVIGATION (Dashboard)

### Grupos principales:
1. **Dashboard** (LayoutDashboard)
2. **Ventas** (DollarSign): Resumen ventas, POS (Armchair), Barra Rapida (Zap), Cocina (ChefHat)
3. **Clientes** (Users)
4. **Empleados** (Clock): Overview, Turnos (CalendarDays), Asistencia (ClipboardCheck), Equipo (Users)
5. **Catalogo** (ShoppingBag): Productos, Recetas (UtensilsCrossed), Ingredientes (Package)
6. **Inventario** (Warehouse): Stock, Produccion (ClipboardList), Compras (ShoppingCart), Proveedores (Truck)
7. **Analytics** (BarChart3): Reportes, Contabilidad (ClipboardList), Simulador (Calculator), Alertas (Bell)
8. **IA** (Brain): Brain (chat), Scanner de Facturas (ScanLine), Receta desde Foto (Camera), Optimizador de Menu (BarChart3), Pronostico de Ventas (TrendingUp), Smart Insights (Lightbulb)

### Footer del sidebar:
- Avatar con iniciales del usuario
- Nombre + email
- Dropdown: Cuenta, Configuracion, Suscripcion, Ayuda, Cerrar sesion (rojo)

Grupos colapsables con chevron animado. Highlighting de ruta activa. Visibilidad basada en permisos. Auto-close en mobile.

---

## ESTILOS Y ANIMACIONES

### Sistema de colores (OKLCH)
**Light mode:**
- primary: oklch(0.42 0.08 55) — Coffee brown
- background: oklch(0.988 0.002 75)
- foreground: oklch(0.175 0.012 75)
- success: oklch(0.55 0.15 145)
- warning: oklch(0.75 0.15 75)
- destructive: oklch(0.577 0.245 27.325)

**Dark mode:**
- primary: oklch(0.65 0.1 55)
- background: oklch(0.15 0.008 75)
- foreground: oklch(0.93 0.005 75)

### 5 paletas seleccionables:
Cafe (default), Rosa, Lavanda, Menta, Cielo

### Animaciones CSS custom:
- `gradient-shift` (8s): Background-position
- `marquee` (30s linear): Scroll horizontal
- `float` (6s ease-in-out): Bobbing vertical
- `glow-rotate` (3s linear): Rotating conic gradient
- `shimmer` (2.5s ease-in-out): Button shine

### Clases CSS:
- `.hero-gradient`: Radial gradient bg
- `.cta-gradient`: Linear gradient 135deg animado
- `.glass-card`: Backdrop blur + border (deshabilitado en mobile)
- `.dot-pattern`: Radial gradient repeating dots
- `.marquee-fade`: Mask gradient
- `.btn-shimmer`: Shimmer overlay en botones
- `.glow-border`: Rotating border effect

### Responsive (tablet mode):
- Buttons: min 44px touch targets
- Inputs: min 44px height
- Checkboxes: 24x24px
- Table rows: 12px top/bottom padding
- Font sizes: 15-16px

---

## BRAND ASSETS

### CaffeIso (Isotype)
- Coffee cup con diseño de steam "FF"
- Variants: `light` (white on transparent), `dark` (dark on transparent)
- Default: h-5 w-5

### CaffeLogo (Full Logo)
- Cup icon + "Caffetones" text horizontal lockup
- Mismas variants que isotype
- Default: h-8

### Image Assets
- `/iso-white.png`, `/iso.png`, `/logo-white.png`, `/logo-dark.png`
- `/demo-tarta.jpg` (foto para demo AI Vision)

---

## HOOKS PRINCIPALES

### Context
- `useTenant()` — Workspace/usuario actual
- `usePermission()` — Acceso por rol
- `useTranslation()` — i18n
- `useDisplayMode()` — PC/tablet

### Utility
- `useCurrency()` — Formateo de moneda
- `useMobile()` — Deteccion mobile
- `useColorPalette()` — Colores de tema
- `useDismissedAlerts()` — Estado de dismissal de alertas

---

## FLOOR PLAN (POS)

- Canvas grid-based (1200x700px)
- Grid snapping de 20px
- Drag-to-move mesas
- Toggle Edit/Move mode
- Boton Save con contador de cambios
- Touch-friendly en tablet (500-100vh height)
- Cards de mesa con: numero, status (colores), total $, cantidad items

---

## CHAT WIDGET (AI Brain)

- Sheet (panel lateral derecho)
- Header: Brain icon + "Cerebro IA" + "Conectado a tus datos en tiempo real" + dot pulsante verde
- Empty state: Brain icon 30% opacity + 6 preguntas rapidas sugeridas
- Mensajes: User (derecha, primary bg) / AI (izquierda, muted bg, typing animation)
- Typing dots: 3 dots bouncing con delays escalonados
- Input: "Preguntale algo a la IA..."

---

## SUBSCRIPTION PAGE

- Status actual del plan con badge
- Progress bar de trial (14 dias)
- Grid de 2 planes con toggle mensual/anual
- Manage billing / View invoices (Stripe portal)
- Cancel / Downgrade con dialogo de confirmacion

---

## METRICAS DEL CODIGO

- ~50,500 lineas totales
- 114 componentes
- 62 paginas
- 40+ API routes
- 200+ translation keys
- 3 locales
- 7 roles, 22 permisos
- Fully typed con TypeScript

---

## INSTRUCCIONES DE RECONSTRUCCION

Para recrear esta app, segui este orden:

1. **Setup proyecto**: Next.js 15, instalar todas las dependencias del package.json
2. **Configurar Supabase**: Crear proyecto, configurar auth (email + Google OAuth), crear todas las tablas segun el schema
3. **Implementar tipos**: `src/types/database.ts` con todos los tipos
4. **Auth flow**: Login, register, forgot-password, callback, middleware
5. **Multi-tenancy**: TenantProvider, useTenant hook, RLS policies
6. **Permisos**: Sistema RBAC completo
7. **Dashboard layout**: Sidebar, header, providers
8. **Landing page**: Todas las 17 secciones con animaciones Framer Motion
9. **Onboarding**: Wizard de 4 pasos
10. **Core features**: Recetas → Ingredientes → Productos → Stock
11. **POS system**: Mesas, floor plan, order panel, checkout, KDS
12. **Ventas**: Manual sale, quick POS, cash shifts, reportes
13. **Compras**: Ordenes de compra, proveedores, receipt scanner
14. **Clientes**: CRM, loyalty system
15. **Empleados**: Schedule, attendance, team
16. **Reportes**: Food cost, margenes, tendencias, stock value
17. **IA**: Chat brain con contexto, invoice scanner, recipe from photo, menu optimizer, sales forecast, smart insights
18. **Billing**: Stripe integration completa
19. **i18n**: 3 idiomas
20. **Admin panel**: Dashboard, tenants, leads, metrics
21. **Alertas**: Alert engine
22. **Email**: Templates con Resend
23. **Settings**: Workspace config, QR, loyalty
24. **Paginas publicas**: Menu QR, pricing, privacy, terms
25. **Polish**: Animaciones, responsive, dark mode, paletas de color, loading skeletons
