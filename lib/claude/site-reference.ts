/**
 * Reference HTML template used as an example in the site generation prompt.
 * Generated with frontend-design best practices — demonstrates the structure,
 * styling patterns, and rendering guardrails we expect from Claude's output.
 */
export const SITE_REFERENCE_HTML = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Café Ejemplo — Tu rincón favorito</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
:root{--cream:#FAF7F2;--espresso:#2C1810;--terracotta:#C4613A;--warm-gray:#8C7B6B;--sand:#E8DFD3;--white:#FFFFFF}
html{scroll-behavior:smooth}
body{font-family:'DM Sans',sans-serif;color:var(--espresso);background:var(--cream);line-height:1.6;-webkit-font-smoothing:antialiased}
h1,h2,h3{font-family:'DM Serif Display',serif;font-weight:400;line-height:1.2}
img{max-width:100%;height:auto;display:block}
a{color:inherit;text-decoration:none}
.nav{position:sticky;top:0;background:var(--cream);border-bottom:1px solid var(--sand);padding:1rem 1.5rem;display:flex;justify-content:space-between;align-items:center;z-index:100}
.nav-brand{font-family:'DM Serif Display',serif;font-size:1.25rem}
.nav-links{display:flex;gap:1.5rem;font-size:.875rem;font-weight:500}
.nav-links a{color:var(--warm-gray);transition:color .2s}
.nav-links a:hover{color:var(--terracotta)}
.hero{padding:4rem 1.5rem;text-align:center;background:linear-gradient(180deg,var(--cream) 0%,var(--sand) 100%)}
.hero h1{font-size:clamp(2.5rem,6vw,4.5rem);margin-bottom:1rem;letter-spacing:-.02em}
.hero p{font-size:1.125rem;color:var(--warm-gray);max-width:520px;margin:0 auto 2rem}
.btn{display:inline-flex;align-items:center;gap:.5rem;padding:.875rem 2rem;border-radius:50px;font-weight:600;font-size:.9375rem;transition:all .25s ease;cursor:pointer;border:none}
.btn-primary{background:var(--terracotta);color:var(--white)}
.btn-primary:hover{background:var(--espresso);transform:translateY(-2px);box-shadow:0 6px 20px rgba(44,24,16,.2)}
section{padding:4rem 1.5rem}
.section-label{font-size:.75rem;text-transform:uppercase;letter-spacing:.15em;color:var(--terracotta);font-weight:600;margin-bottom:.5rem}
.section-title{font-size:clamp(1.75rem,4vw,2.75rem);margin-bottom:1.5rem}
.container{max-width:960px;margin:0 auto}
.services-grid{display:grid;grid-template-columns:1fr;gap:1.5rem;margin-top:2rem}
.service-card{background:var(--white);border-radius:12px;padding:2rem;border:1px solid var(--sand);transition:transform .25s,box-shadow .25s}
.service-card:hover{transform:translateY(-4px);box-shadow:0 12px 32px rgba(44,24,16,.08)}
.service-card h3{font-size:1.25rem;margin-bottom:.5rem}
.service-card p{color:var(--warm-gray);font-size:.9375rem}
.about{background:var(--white)}
.about-content{display:grid;grid-template-columns:1fr;gap:2rem;align-items:center}
.gallery-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:.75rem;margin-top:2rem}
.gallery-grid img{border-radius:8px;aspect-ratio:1;object-fit:cover;transition:transform .3s}
.gallery-grid img:hover{transform:scale(1.03)}
.testimonials{background:var(--white)}
.testimonial-card{background:var(--cream);border-radius:12px;padding:2rem;margin-top:1.5rem}
.stars{color:var(--terracotta);font-size:1.125rem;margin-bottom:.75rem}
.testimonial-card p{font-style:italic;margin-bottom:.75rem}
.testimonial-card .author{font-weight:600;font-size:.875rem}
.hours-table{width:100%;max-width:480px;border-collapse:collapse;margin-top:1.5rem}
.hours-table tr{border-bottom:1px solid var(--sand)}
.hours-table td{padding:.75rem 0;font-size:.9375rem}
.hours-table td:last-child{text-align:right;font-weight:500}
.faq{background:var(--white)}
details{border-bottom:1px solid var(--sand);padding:1.25rem 0}
summary{cursor:pointer;font-weight:600;font-size:1rem;list-style:none;display:flex;justify-content:space-between;align-items:center}
summary::after{content:'+';font-size:1.5rem;color:var(--terracotta);transition:transform .2s}
details[open] summary::after{transform:rotate(45deg)}
details p{margin-top:.75rem;color:var(--warm-gray);font-size:.9375rem}
.contact-grid{display:grid;grid-template-columns:1fr;gap:2rem;margin-top:2rem}
.contact-info p{margin-bottom:1rem;font-size:.9375rem}
.map-embed{width:100%;height:300px;border:0;border-radius:12px}
footer{background:var(--espresso);color:var(--sand);padding:2.5rem 1.5rem;text-align:center;font-size:.875rem}
.wa-fab{position:fixed;bottom:1.5rem;right:1.5rem;width:60px;height:60px;background:#25D366;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 16px rgba(37,211,102,.35);z-index:999;transition:transform .25s}
.wa-fab:hover{transform:scale(1.1)}
.wa-fab svg{width:32px;height:32px;fill:var(--white)}
@media(min-width:640px){
  .services-grid{grid-template-columns:repeat(2,1fr)}
  .gallery-grid{grid-template-columns:repeat(3,1fr)}
}
@media(min-width:768px){
  section{padding:5rem 2rem}
  .about-content{grid-template-columns:1fr 1fr}
  .contact-grid{grid-template-columns:1fr 1fr}
  .services-grid{grid-template-columns:repeat(3,1fr)}
}
@keyframes fadeUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
.hero h1,.hero p,.hero .btn{animation:fadeUp .6s ease both}
.hero p{animation-delay:.1s}
.hero .btn{animation-delay:.2s}
</style>
</head>
<body>
<nav class="nav">
  <div class="nav-brand">Café Ejemplo</div>
  <div class="nav-links">
    <a href="#servicios">Servicios</a>
    <a href="#nosotros">Nosotros</a>
    <a href="#contacto">Contacto</a>
  </div>
</nav>
<section class="hero">
  <div class="container">
    <p class="section-label">Cafetería de especialidad</p>
    <h1>Tu rincón favorito en Palermo</h1>
    <p>Café de especialidad, pastelería artesanal y un ambiente que te invita a quedarte.</p>
    <a href="#wa" class="btn btn-primary">Escribinos</a>
  </div>
</section>
<section id="servicios">
  <div class="container">
    <p class="section-label">Lo que ofrecemos</p>
    <h2 class="section-title">Nuestros Servicios</h2>
    <div class="services-grid">
      <div class="service-card">
        <h3>☕ Café de Especialidad</h3>
        <p>Granos seleccionados de origen, tostados artesanalmente.</p>
      </div>
      <div class="service-card">
        <h3>🥐 Pastelería Artesanal</h3>
        <p>Medialunas, tortas y delicias horneadas cada mañana.</p>
      </div>
      <div class="service-card">
        <h3>🍽️ Brunch & Almuerzo</h3>
        <p>Platos frescos y de estación para compartir.</p>
      </div>
    </div>
  </div>
</section>
<section id="nosotros" class="about">
  <div class="container">
    <div class="about-content">
      <div>
        <p class="section-label">Nuestra historia</p>
        <h2 class="section-title">Más que un café, un lugar para encontrarse</h2>
        <p>Desde 2018 en el corazón de Palermo, creamos un espacio donde cada taza cuenta una historia.</p>
      </div>
      <img class="about-img" src="IMAGEN" alt="Café Ejemplo">
    </div>
  </div>
</section>
<section class="testimonials">
  <div class="container">
    <p class="section-label">Opiniones</p>
    <h2 class="section-title">Lo que dicen nuestros clientes</h2>
    <p>⭐ 4.7 estrellas en Google (230 reseñas)</p>
    <div class="testimonial-card">
      <div class="stars">★★★★★</div>
      <p>"Excelente atención y el mejor café del barrio."</p>
      <span class="author">— Cliente verificado</span>
    </div>
  </div>
</section>
<section id="horarios">
  <div class="container">
    <p class="section-label">Horarios</p>
    <h2 class="section-title">¿Cuándo nos visitás?</h2>
    <table class="hours-table">
      <tr><td>Lunes a Viernes</td><td>8:00 – 20:00</td></tr>
      <tr><td>Sábados</td><td>9:00 – 21:00</td></tr>
      <tr><td>Domingos</td><td>9:00 – 18:00</td></tr>
    </table>
  </div>
</section>
<section class="faq">
  <div class="container">
    <p class="section-label">Preguntas frecuentes</p>
    <h2 class="section-title">¿Tenés dudas?</h2>
    <details>
      <summary>¿Aceptan reservas?</summary>
      <p>Sí, podés reservar por WhatsApp o acercarte directamente.</p>
    </details>
    <details>
      <summary>¿Tienen opciones veganas?</summary>
      <p>Sí, contamos con opciones para distintas necesidades alimentarias.</p>
    </details>
  </div>
</section>
<section id="contacto">
  <div class="container">
    <p class="section-label">Contacto</p>
    <h2 class="section-title">Vení a visitarnos</h2>
    <div class="contact-grid">
      <div class="contact-info">
        <p>📍 Av. Thames 1234, Palermo, CABA</p>
        <p>📞 11 5555-0000</p>
        <a href="#wa" class="btn btn-primary">Chateá por WhatsApp</a>
      </div>
      <iframe class="map-embed" src="about:blank" allowfullscreen loading="lazy"></iframe>
    </div>
  </div>
</section>
<footer>
  <div class="container">
    <p>© 2025 Café Ejemplo — Todos los derechos reservados</p>
  </div>
</footer>
<a href="#wa" class="wa-fab" aria-label="WhatsApp">
  <svg viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.492a.5.5 0 00.611.611l4.458-1.495A11.932 11.932 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-2.34 0-4.508-.654-6.363-1.787l-.362-.222-3.142 1.053 1.053-3.142-.222-.362A9.935 9.935 0 012 12C2 6.486 6.486 2 12 2s10 4.486 10 10-4.486 10-10 10z"/></svg>
</a>
</body>
</html>`
