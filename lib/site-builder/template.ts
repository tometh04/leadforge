import { SiteContent } from '@/lib/claude/site-generator'

export function buildSiteHTML(params: {
  businessName: string
  category: string
  address: string
  phone: string
  website: string
  googleMapsUrl: string
  googleRating?: number | null
  googleReviews?: number | null
  openingHours?: string[] | null // weekdayDescriptions de Google Places
  content: SiteContent
}): string {
  const { businessName, address, phone, content } = params
  const rating = params.googleRating ? params.googleRating.toFixed(1) : '5.0'
  const reviews = params.googleReviews ? `+${params.googleReviews}` : '+50'
  const { tagline, hero_description, services, primary_color, secondary_color, cta_text, about_text, real_images, gallery_images, logo_url } = content

  const wp = phone.replace(/\D/g, '').replace(/^0/, '')
  const waLink = `https://wa.me/${wp}?text=${encodeURIComponent(`Hola ${businessName} 👋`)}`
  const mapsLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`

  // Hero image — primera foto real (ej: Google photo del local)
  const heroImg = real_images?.[0] ?? null
  // About images — segunda y tercera foto (distintas al hero)
  const aboutImg1 = real_images?.[1] ?? null
  const aboutImg2 = real_images?.[2] ?? null
  // Gallery — fotos dedicadas para galería (ya separadas del hero/about)
  const galleryImgs = (gallery_images ?? []).slice(0, 6)

  // Logo HTML
  const logoHTML = logo_url
    ? `<img src="${logo_url}" alt="${businessName}" style="height:36px;width:auto;object-fit:contain;display:block;">`
    : `<span style="font-size:1.1rem;font-weight:800;letter-spacing:-0.02em;color:var(--ink);">${businessName}</span>`

  // Services — máximo 3 para ser Jobsiano (menos es más)
  const topServices = services.slice(0, 3)

  // Horarios — de Google Places (weekdayDescriptions) o placeholder
  // weekdayDescriptions: ["Lunes: 9:00 a.m.–6:00 p.m.", "Martes: ...", ...]
  const hoursHTML = ((): string => {
    const rawHours = params.openingHours
    if (!rawHours || rawHours.length === 0) {
      // Fallback genérico cuando no hay datos reales
      return `<p style="color:var(--ink3);font-size:.85rem;">Consultá horarios actualizados por WhatsApp o Google Maps.</p>`
    }
    // Agrupar días consecutivos con mismo horario para mostrar más compacto
    // Formato de entrada: "Lunes: 9:00 a.m.–6:00 p.m." o "Lunes: Cerrado"
    const lines = rawHours.map((d) => {
      // Limpiar formato: "a.m." → "am", "p.m." → "pm", "–" → " – "
      return d
        .replace(/\u2013/g, ' – ')
        .replace(/a\.m\./g, 'am')
        .replace(/p\.m\./g, 'pm')
    })
    return lines
      .map((line) => {
        const colonIdx = line.indexOf(':')
        if (colonIdx === -1) return `<p>${line}</p>`
        const day = line.slice(0, colonIdx).trim()
        const time = line.slice(colonIdx + 1).trim()
        const isClosed = time.toLowerCase().includes('cerrado') || time.toLowerCase().includes('closed')
        return `<p style="display:flex;justify-content:space-between;gap:12px;font-size:.88rem;line-height:1.7">
          <span style="font-weight:600;color:var(--ink)">${day}</span>
          <span style="color:${isClosed ? 'var(--ink3)' : 'var(--ink2)'}">${time}</span>
        </p>`
      })
      .join('')
  })()

  const year = new Date().getFullYear()

  /* ─────────────────────────────────────────────────────────────────
     COLOR SYSTEM
     Derivamos todos los tonos del primary_color del negocio.
     Si no tenemos imagen de hero → fondo blanco puro, tipografía negra.
     Si tenemos imagen → hero con overlay y texto blanco.
  ───────────────────────────────────────────────────────────────── */

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${businessName}</title>
<meta name="description" content="${hero_description}"/>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap" rel="stylesheet"/>
<style>
/* ── RESET ── */
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
img{display:block;max-width:100%}
a{text-decoration:none;color:inherit}
button{cursor:pointer;border:none;background:none;font:inherit}

/* ── TOKENS ── */
:root{
  --c:${primary_color};
  --c2:${secondary_color};
  --ink:#0A0A0A;
  --ink2:#3C3C3C;
  --ink3:#8C8C8C;
  --white:#FFFFFF;
  --off:#F7F7F5;
  --border:rgba(0,0,0,0.07);
  --r:14px;
  --r2:24px;
  --ease:cubic-bezier(.16,1,.3,1);
  --dur:.65s;
}

/* ── BASE ── */
html{scroll-behavior:smooth;-webkit-font-smoothing:antialiased}
body{
  font-family:'Inter',system-ui,sans-serif;
  color:var(--ink);
  background:var(--white);
  line-height:1.6;
  overflow-x:hidden;
}

/* ── SCROLL REVEAL ── */
/* Los elementos arrancan visibles; JS agrega .js-sr para activar la animación */
.js-sr [data-sr]{
  opacity:0;
  transform:translateY(28px);
  transition:opacity var(--dur) var(--ease), transform var(--dur) var(--ease);
}
.js-sr [data-sr].in{opacity:1;transform:none}
.js-sr [data-sr][data-d="1"]{transition-delay:.1s}
.js-sr [data-sr][data-d="2"]{transition-delay:.2s}
.js-sr [data-sr][data-d="3"]{transition-delay:.32s}
.js-sr [data-sr][data-d="4"]{transition-delay:.45s}

/* ── NAV ── */
.nav{
  position:fixed;top:0;left:0;right:0;z-index:100;
  height:60px;
  padding:0 6%;
  display:flex;align-items:center;justify-content:space-between;
  transition:background .3s, box-shadow .3s;
}
.nav.s{
  background:rgba(255,255,255,.92);
  backdrop-filter:blur(20px);
  -webkit-backdrop-filter:blur(20px);
  box-shadow:0 1px 0 var(--border);
}
.nav-links{display:flex;align-items:center;gap:28px}
.nav-links a{
  font-size:.85rem;font-weight:500;color:var(--ink2);
  transition:color .2s;
}
.nav-links a:hover{color:var(--c)}
.nav-btn{
  height:38px;padding:0 20px;
  background:var(--c);color:#fff;
  border-radius:50px;
  font-size:.85rem;font-weight:600;
  transition:opacity .2s, transform .2s;
  display:inline-flex;align-items:center;gap:7px;
  box-shadow:0 4px 20px color-mix(in srgb,var(--c) 35%,transparent);
}
.nav-btn:hover{opacity:.88;transform:translateY(-1px)}

/* ── HERO ── */
.hero{
  min-height:100dvh;
  display:flex;flex-direction:column;align-items:flex-start;justify-content:flex-end;
  padding:0 6% 10vh;
  position:relative;
  overflow:hidden;
  ${heroImg
    ? `background:url('${heroImg}') center/cover no-repeat;`
    : `background:var(--off);`
  }
}
${heroImg ? `
.hero::before{
  content:'';position:absolute;inset:0;
  background:linear-gradient(
    to top,
    rgba(0,0,0,.82) 0%,
    rgba(0,0,0,.45) 45%,
    rgba(0,0,0,.1) 100%
  );
}
` : `
.hero::after{
  content:'';
  position:absolute;top:-30%;right:-10%;
  width:70vw;height:70vw;
  background:radial-gradient(circle,color-mix(in srgb,var(--c) 8%,transparent),transparent 70%);
  pointer-events:none;
}
`}
.hero-inner{
  position:relative;z-index:1;
  max-width:720px;
}
.hero-eyebrow{
  display:inline-block;
  font-size:.72rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;
  ${heroImg ? `color:rgba(255,255,255,.7);` : `color:var(--c);`}
  margin-bottom:20px;
}
.hero h1{
  font-size:clamp(3rem,7vw,6.5rem);
  font-weight:900;line-height:.97;
  letter-spacing:-.035em;
  ${heroImg ? `color:#fff;` : `color:var(--ink);`}
  margin-bottom:28px;
}
.hero h1 em{
  font-style:italic;font-weight:300;
  color:${heroImg ? 'rgba(255,255,255,.7)' : `var(--c)`};
}
.hero-sub{
  font-size:1.1rem;line-height:1.65;max-width:480px;
  ${heroImg ? `color:rgba(255,255,255,.8);` : `color:var(--ink2);`}
  margin-bottom:44px;
}
.hero-ctas{display:flex;gap:14px;flex-wrap:wrap;align-items:center}
.btn-hero{
  height:52px;padding:0 32px;border-radius:50px;
  font-size:1rem;font-weight:700;
  display:inline-flex;align-items:center;gap:9px;
  transition:transform .25s var(--ease), box-shadow .25s var(--ease);
}
.btn-hero.primary{
  background:var(--c);color:#fff;
  box-shadow:0 8px 40px color-mix(in srgb,var(--c) 50%,transparent);
}
.btn-hero.primary:hover{transform:translateY(-3px) scale(1.02);box-shadow:0 16px 50px color-mix(in srgb,var(--c) 55%,transparent)}
.btn-hero.ghost{
  ${heroImg
    ? `background:rgba(255,255,255,.12);color:#fff;border:1px solid rgba(255,255,255,.3);backdrop-filter:blur(8px);`
    : `background:transparent;color:var(--ink);border:1.5px solid var(--border);`
  }
}
.btn-hero.ghost:hover{
  ${heroImg
    ? `background:rgba(255,255,255,.22);`
    : `border-color:var(--c);color:var(--c);`
  }
  transform:translateY(-2px);
}
/* Scroll indicator */
.hero-scroll{
  position:absolute;bottom:36px;right:6%;z-index:1;
  display:flex;flex-direction:column;align-items:center;gap:6px;
  ${heroImg ? `color:rgba(255,255,255,.4);` : `color:var(--ink3);`}
  font-size:.7rem;letter-spacing:.1em;text-transform:uppercase;
  animation:scrollBob 2.4s ease-in-out infinite;
}
@keyframes scrollBob{0%,100%{transform:translateY(0)}50%{transform:translateY(6px)}}
.scroll-line{width:1px;height:40px;background:currentColor;opacity:.5}

/* ── SECTION SHELL ── */
.sec{padding:96px 6%}
.sec-inner{max-width:1160px;margin:0 auto}
.sec-label{
  font-size:.72rem;font-weight:700;letter-spacing:.14em;text-transform:uppercase;
  color:var(--c);margin-bottom:16px;display:block;
}
.sec-h{
  font-size:clamp(2.2rem,4.5vw,4rem);
  font-weight:900;line-height:1.0;letter-spacing:-.03em;
  margin-bottom:64px;
}
.sec-h em{font-style:italic;font-weight:300;color:var(--c)}

/* ── SERVICES — big card layout ── */
.services-bg{background:var(--off)}
.svc-grid{
  display:grid;
  grid-template-columns:repeat(3,1fr);
  gap:16px;
}
@media(max-width:860px){.svc-grid{grid-template-columns:1fr}}
.svc-card{
  background:var(--white);border-radius:var(--r2);
  padding:40px 36px 44px;
  border:1px solid var(--border);
  transition:transform var(--dur) var(--ease), box-shadow var(--dur) var(--ease);
  position:relative;overflow:hidden;
}
.svc-card::before{
  content:'';position:absolute;inset:0;
  background:linear-gradient(135deg,color-mix(in srgb,var(--c) 4%,transparent),transparent 60%);
  opacity:0;transition:opacity .3s;
}
.svc-card:hover{transform:translateY(-10px);box-shadow:0 32px 80px rgba(0,0,0,.1)}
.svc-card:hover::before{opacity:1}
.svc-num{
  font-size:3.5rem;font-weight:900;line-height:1;
  color:color-mix(in srgb,var(--c) 12%,transparent);
  margin-bottom:24px;letter-spacing:-.04em;
  font-variant-numeric:tabular-nums;
}
.svc-card h3{
  font-size:1.25rem;font-weight:800;letter-spacing:-.02em;
  margin-bottom:12px;
}
.svc-card p{font-size:.9rem;color:var(--ink3);line-height:1.7}
.svc-arrow{
  position:absolute;bottom:36px;right:36px;
  width:36px;height:36px;border-radius:50%;
  background:color-mix(in srgb,var(--c) 10%,transparent);
  display:flex;align-items:center;justify-content:center;
  color:var(--c);font-size:1rem;
  transition:background .2s, transform .2s;
}
.svc-card:hover .svc-arrow{background:var(--c);color:#fff;transform:translate(2px,-2px)}

/* ── ABOUT — editorial layout ── */
.about-grid{
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:80px;
  align-items:center;
}
@media(max-width:860px){.about-grid{grid-template-columns:1fr;gap:48px}}
.about-visual{position:relative}
.about-img-stack{position:relative;aspect-ratio:3/4}
.about-img-main{
  width:90%;height:100%;
  border-radius:var(--r2);overflow:hidden;
  box-shadow:0 40px 100px rgba(0,0,0,.14);
}
.about-img-main img{width:100%;height:100%;object-fit:cover}
.about-img-sub{
  position:absolute;bottom:-32px;right:0;
  width:52%;aspect-ratio:1;
  border-radius:var(--r2);overflow:hidden;
  border:5px solid var(--white);
  box-shadow:0 20px 60px rgba(0,0,0,.12);
}
.about-img-sub img{width:100%;height:100%;object-fit:cover}
.about-placeholder{
  width:90%;aspect-ratio:3/4;
  border-radius:var(--r2);
  background:linear-gradient(135deg,color-mix(in srgb,var(--c) 18%,var(--off)) 0%,var(--off) 100%);
  display:flex;flex-direction:column;align-items:center;justify-content:center;
  gap:28px;padding:48px 36px;
  position:relative;overflow:hidden;
  border:1px solid var(--border);
}
.about-placeholder::before{
  content:'';position:absolute;
  bottom:-20%;right:-15%;
  width:70%;aspect-ratio:1;
  background:color-mix(in srgb,var(--c) 8%,transparent);
  border-radius:50%;
}
.about-stat{
  display:flex;flex-direction:column;align-items:center;gap:4px;
  position:relative;z-index:1;
}
.about-stat-n{
  font-size:3.2rem;font-weight:900;letter-spacing:-.04em;
  color:var(--c);line-height:1;
}
.about-stat-l{
  font-size:.82rem;font-weight:500;color:var(--ink3);
  text-transform:uppercase;letter-spacing:.06em;
  text-align:center;
}
.about-divider{
  width:1px;height:40px;
  background:var(--border);
}
.about-copy .sec-h{margin-bottom:28px}
.about-body{
  font-size:1.08rem;color:var(--ink2);line-height:1.8;
  margin-bottom:36px;
}
.about-list{display:flex;flex-direction:column;gap:10px;margin-bottom:40px}
.about-item{
  display:flex;align-items:center;gap:12px;
  font-size:.9rem;font-weight:500;color:var(--ink2);
}
.about-dot{
  width:6px;height:6px;border-radius:50%;
  background:var(--c);flex-shrink:0;
}

/* ── GALLERY ── */
.gallery-grid{
  display:grid;
  grid-template-columns:repeat(12,1fr);
  grid-auto-rows:220px;
  gap:12px;
}
.g-item{
  border-radius:var(--r);overflow:hidden;position:relative;
}
.g-item:nth-child(1){grid-column:span 7;grid-row:span 2}
.g-item:nth-child(2){grid-column:span 5}
.g-item:nth-child(3){grid-column:span 5}
.g-item:nth-child(4){grid-column:span 4}
.g-item:nth-child(5){grid-column:span 4}
.g-item:nth-child(6){grid-column:span 4}
.g-item img{
  width:100%;height:100%;object-fit:cover;
  transition:transform .7s var(--ease);
}
.g-item:hover img{transform:scale(1.06)}
.g-overlay{
  position:absolute;inset:0;
  background:linear-gradient(to top,rgba(0,0,0,.25),transparent);
  opacity:0;transition:opacity .3s;
}
.g-item:hover .g-overlay{opacity:1}
@media(max-width:860px){
  .gallery-grid{grid-template-columns:1fr 1fr;grid-auto-rows:180px}
  .g-item{grid-column:span 1 !important;grid-row:span 1 !important}
}

/* ── QUOTE / CTA STRIP ── */
.quote-strip{
  padding:100px 6%;
  background:var(--c);
  text-align:center;
  position:relative;overflow:hidden;
}
.quote-strip::before{
  content:'';position:absolute;
  top:-50%;left:50%;transform:translateX(-50%);
  width:140%;aspect-ratio:1;
  background:color-mix(in srgb,#fff 5%,transparent);
  border-radius:50%;
}
.quote-text{
  font-size:clamp(1.8rem,4vw,3.2rem);
  font-weight:900;line-height:1.1;letter-spacing:-.03em;
  color:#fff;max-width:900px;margin:0 auto 44px;
  position:relative;z-index:1;
}
.quote-text em{font-style:italic;font-weight:300;opacity:.75}
.btn-white{
  height:52px;padding:0 40px;border-radius:50px;
  background:#fff;color:var(--c);
  font-size:1rem;font-weight:800;
  display:inline-flex;align-items:center;gap:9px;
  box-shadow:0 8px 40px rgba(0,0,0,.2);
  transition:transform .25s, box-shadow .25s;
  position:relative;z-index:1;
}
.btn-white:hover{transform:translateY(-3px);box-shadow:0 16px 50px rgba(0,0,0,.25)}

/* ── CONTACT ── */
.contact-bg{background:var(--off)}
.contact-grid{
  display:grid;grid-template-columns:1fr 1fr;gap:60px;
  align-items:start;
}
@media(max-width:860px){.contact-grid{grid-template-columns:1fr}}
.contact-items{display:flex;flex-direction:column;gap:16px}
.c-item{
  padding:24px 28px;
  background:var(--white);border-radius:var(--r);
  border:1px solid var(--border);
  display:flex;align-items:flex-start;gap:16px;
  transition:box-shadow .25s, transform .25s;
}
.c-item:hover{box-shadow:0 16px 50px rgba(0,0,0,.07);transform:translateY(-2px)}
.c-icon{
  width:44px;height:44px;border-radius:10px;flex-shrink:0;
  background:color-mix(in srgb,var(--c) 10%,transparent);
  display:flex;align-items:center;justify-content:center;
  font-size:1.2rem;
}
.c-item h4{font-size:.85rem;font-weight:700;margin-bottom:4px;color:var(--ink)}
.c-item p,.c-item a{font-size:.9rem;color:var(--ink3)}
.c-item a:hover{color:var(--c)}
.cta-card{
  background:var(--ink);color:#fff;
  border-radius:var(--r2);padding:52px 44px;
  display:flex;flex-direction:column;gap:24px;
}
.cta-card-h{
  font-size:2.4rem;font-weight:900;line-height:1.05;letter-spacing:-.03em;
}
.cta-card-h em{font-style:italic;font-weight:300;color:color-mix(in srgb,var(--c) 80%,#fff)}
.cta-card p{font-size:1rem;color:rgba(255,255,255,.6);line-height:1.65}

/* ── FOOTER ── */
.footer{
  padding:28px 6%;
  display:flex;align-items:center;justify-content:space-between;
  border-top:1px solid var(--border);
  flex-wrap:wrap;gap:12px;
}
.footer p{font-size:.82rem;color:var(--ink3)}
.footer a{font-size:.82rem;font-weight:600;color:var(--c)}

/* ── FLOATING WA ── */
.wa{
  position:fixed;bottom:28px;right:28px;z-index:99;
  width:56px;height:56px;border-radius:50%;
  background:#25D366;color:#fff;
  display:flex;align-items:center;justify-content:center;
  box-shadow:0 8px 32px rgba(37,211,102,.5);
  font-size:1.5rem;
  transition:transform .25s, box-shadow .25s;
  animation:waPop .8s 1.2s var(--ease) both, waPulse 3s 2s ease-in-out infinite;
}
.wa:hover{transform:scale(1.12);box-shadow:0 12px 40px rgba(37,211,102,.65);animation:none}
@keyframes waPop{from{opacity:0;transform:scale(.5) translateY(20px)}to{opacity:1;transform:none}}
@keyframes waPulse{
  0%,100%{box-shadow:0 8px 32px rgba(37,211,102,.5)}
  50%{box-shadow:0 8px 48px rgba(37,211,102,.65),0 0 0 10px rgba(37,211,102,.08)}
}

/* ── RESPONSIVE ── */
@media(max-width:640px){
  .nav-links{display:none}
  .hero{padding:0 5% 12vh}
  .hero h1{font-size:clamp(2.8rem,12vw,4rem)}
  .sec{padding:80px 5%}
  .svc-grid{grid-template-columns:1fr}
  .footer{justify-content:center;text-align:center}
}
</style>
</head>
<body>

<!-- NAV -->
<nav class="nav" id="nav">
  ${logoHTML}
  <nav class="nav-links">
    <a href="#servicios">Servicios</a>
    <a href="#nosotros">Nosotros</a>
    <a href="#contacto">Contacto</a>
  </nav>
  <a href="${waLink}" target="_blank" rel="noopener" class="nav-btn">
    Escribinos →
  </a>
</nav>

<!-- HERO -->
<section class="hero" id="inicio">
  <div class="hero-inner">
    <div class="hero-eyebrow" data-sr>${params.category}</div>
    <h1 data-sr data-d="1">
      ${businessName.split(' ').length > 2
        ? businessName.split(' ').slice(0, -1).join(' ') + '<br><em>' + businessName.split(' ').slice(-1)[0] + '</em>'
        : businessName
      }
    </h1>
    <p class="hero-sub" data-sr data-d="2">${hero_description}</p>
    <div class="hero-ctas" data-sr data-d="3">
      <a href="${waLink}" target="_blank" rel="noopener" class="btn-hero primary">
        ${cta_text} →
      </a>
      <a href="#servicios" class="btn-hero ghost">
        Ver servicios
      </a>
    </div>
  </div>
  <div class="hero-scroll">
    <div class="scroll-line"></div>
    scroll
  </div>
</section>

<!-- SERVICES -->
<section class="sec services-bg" id="servicios">
  <div class="sec-inner">
    <div class="sec-label" data-sr>Lo que hacemos</div>
    <h2 class="sec-h" data-sr data-d="1">
      Nuestros<br><em>servicios</em>
    </h2>
    <div class="svc-grid">
      ${topServices.map((s, i) => `
      <div class="svc-card" data-sr data-d="${i + 1}">
        <div class="svc-num">0${i + 1}</div>
        <h3>${s.name}</h3>
        <p>${s.description}</p>
        <div class="svc-arrow">→</div>
      </div>`).join('')}
    </div>
  </div>
</section>

<!-- ABOUT -->
<section class="sec" id="nosotros">
  <div class="sec-inner">
    <div class="about-grid">
      <div class="about-visual" data-sr>
        ${aboutImg1 && aboutImg2 ? `
        <div class="about-img-stack">
          <div class="about-img-main">
            <img src="${aboutImg1}" alt="${businessName}" loading="lazy"/>
          </div>
          <div class="about-img-sub">
            <img src="${aboutImg2}" alt="${businessName}" loading="lazy"/>
          </div>
        </div>` : aboutImg1 ? `
        <div class="about-img-stack">
          <div class="about-img-main">
            <img src="${aboutImg1}" alt="${businessName}" loading="lazy"/>
          </div>
        </div>` : heroImg ? `
        <div class="about-img-stack">
          <div class="about-img-main">
            <img src="${heroImg}" alt="${businessName}" loading="lazy"/>
          </div>
        </div>` : `
        <div class="about-placeholder">
          <div class="about-stat">
            <div class="about-stat-n">${reviews}</div>
            <div class="about-stat-l">Reseñas en Google</div>
          </div>
          <div class="about-divider"></div>
          <div class="about-stat">
            <div class="about-stat-n">★ ${rating}</div>
            <div class="about-stat-l">Calificación Google</div>
          </div>
          <div class="about-divider"></div>
          <div class="about-stat">
            <div class="about-stat-n">100%</div>
            <div class="about-stat-l">Satisfacción garantizada</div>
          </div>
        </div>`}
      </div>
      <div class="about-copy">
        <div class="sec-label" data-sr>Quiénes somos</div>
        <h2 class="sec-h" data-sr data-d="1">
          Sobre<br><em>${businessName}</em>
        </h2>
        <p class="about-body" data-sr data-d="2">${about_text}</p>
        <ul class="about-list" data-sr data-d="3">
          ${topServices.map(s => `
          <li class="about-item">
            <span class="about-dot"></span>
            <span>${s.name}</span>
          </li>`).join('')}
        </ul>
        <a href="${waLink}" target="_blank" rel="noopener" class="btn-hero primary" data-sr data-d="4" style="width:fit-content">
          ${cta_text} →
        </a>
      </div>
    </div>
  </div>
</section>

<!-- GALLERY -->
${galleryImgs.length >= 3 ? `
<section class="sec" style="padding-top:0;background:var(--white)">
  <div class="sec-inner">
    <div class="sec-label" data-sr>Galería</div>
    <h2 class="sec-h" data-sr data-d="1">Nuestro<br><em>espacio</em></h2>
    <div class="gallery-grid" data-sr data-d="2">
      ${galleryImgs.map((img, i) => `
      <div class="g-item">
        <img src="${img}" alt="${businessName} ${i + 1}" loading="lazy"/>
        <div class="g-overlay"></div>
      </div>`).join('')}
    </div>
  </div>
</section>` : ''}

<!-- QUOTE STRIP -->
<section class="quote-strip">
  <p class="quote-text" data-sr>
    ¿Buscás <em>resultados reales?</em><br>
    Hablemos hoy.
  </p>
  <a href="${waLink}" target="_blank" rel="noopener" class="btn-white" data-sr data-d="1">
    💬 Contactar ahora
  </a>
</section>

<!-- CONTACT -->
<section class="sec contact-bg" id="contacto">
  <div class="sec-inner">
    <div class="sec-label" data-sr>Contacto</div>
    <h2 class="sec-h" data-sr data-d="1">
      Estamos<br><em>para vos</em>
    </h2>
    <div class="contact-grid">
      <div class="contact-items">
        ${address ? `
        <div class="c-item" data-sr>
          <div class="c-icon">📍</div>
          <div>
            <h4>Dónde estamos</h4>
            <p>${address}</p>
            <a href="${mapsLink}" target="_blank" rel="noopener" style="color:var(--c);font-size:.82rem;font-weight:600;display:inline-block;margin-top:6px">Ver en Google Maps →</a>
          </div>
        </div>` : ''}
        ${phone ? `
        <div class="c-item" data-sr data-d="1">
          <div class="c-icon">📞</div>
          <div>
            <h4>Teléfono & WhatsApp</h4>
            <a href="${waLink}" target="_blank" rel="noopener" style="color:var(--c);font-weight:600">${phone}</a>
          </div>
        </div>` : ''}
        <div class="c-item" data-sr data-d="2">
          <div class="c-icon">🕐</div>
          <div style="flex:1">
            <h4>Horarios</h4>
            <div style="margin-top:6px">${hoursHTML}</div>
          </div>
        </div>
      </div>
      <div class="cta-card" data-sr data-d="1">
        <div class="cta-card-h">¿Hablamos<br><em>hoy?</em></div>
        <p>Escribinos por WhatsApp y te respondemos en minutos. Sin formularios, sin esperas.</p>
        <a href="${waLink}" target="_blank" rel="noopener" class="btn-hero primary" style="width:fit-content">
          Abrir WhatsApp →
        </a>
      </div>
    </div>
  </div>
</section>

<!-- FOOTER -->
<footer class="footer">
  <p>© ${year} <strong>${businessName}</strong>. Todos los derechos reservados.</p>
  <a href="${waLink}" target="_blank" rel="noopener">WhatsApp</a>
</footer>

<!-- FLOATING WA -->
<a href="${waLink}" target="_blank" rel="noopener" class="wa" title="Escribinos">💬</a>

<script>
(function(){
  // Nav scroll
  var nav = document.getElementById('nav');
  var tick = false;
  window.addEventListener('scroll', function(){
    if(!tick){ requestAnimationFrame(function(){
      nav.classList.toggle('s', window.scrollY > 50);
      tick = false;
    }); tick = true; }
  },{passive:true});

  // Scroll reveal — robusto: sin flash invisible, sin contenido perdido
  var inIframe = (function(){ try{ return window.self !== window.top; }catch(e){ return true; } })();
  if(!inIframe){
    var els = document.querySelectorAll('[data-sr]');
    // 1. Marcar como .in todos los que ya están en viewport (o muy cerca)
    els.forEach(function(el){
      var rect = el.getBoundingClientRect();
      if(rect.top < window.innerHeight + 60){ el.classList.add('in'); }
    });
    // 2. Ahora activar animaciones para el resto (los que vienen al hacer scroll)
    document.body.classList.add('js-sr');
    // 3. Revelar al scrollear
    var pending = Array.from(els).filter(function(el){ return !el.classList.contains('in'); });
    if(pending.length){
      function onScroll(){
        pending = pending.filter(function(el){
          var rect = el.getBoundingClientRect();
          if(rect.top < window.innerHeight + 60){
            el.classList.add('in');
            return false; // sacar de pending
          }
          return true;
        });
        if(!pending.length) window.removeEventListener('scroll', onScroll);
      }
      window.addEventListener('scroll', onScroll, {passive:true});
    }
  }

  // Smooth scroll for anchor links
  document.querySelectorAll('a[href^="#"]').forEach(function(a){
    a.addEventListener('click',function(e){
      var t = document.querySelector(a.getAttribute('href'));
      if(t){ e.preventDefault(); t.scrollIntoView({behavior:'smooth'}); }
    });
  });

  // Service card 3D tilt
  document.querySelectorAll('.svc-card').forEach(function(card){
    card.addEventListener('mousemove',function(e){
      var r = card.getBoundingClientRect();
      var x = (e.clientX - r.left) / r.width - .5;
      var y = (e.clientY - r.top) / r.height - .5;
      card.style.transform = 'translateY(-10px) rotateX('+(-y*6)+'deg) rotateY('+(x*6)+'deg)';
    });
    card.addEventListener('mouseleave',function(){
      card.style.transform = '';
    });
  });
})();
</script>
</body>
</html>`
}
