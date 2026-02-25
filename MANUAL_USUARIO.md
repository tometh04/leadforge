# Manual de Usuario — LeadForge v0.1 beta

## Índice

1. [Login](#1-login)
2. [Dashboard](#2-dashboard)
3. [Scraper](#3-scraper)
4. [Pipeline / Kanban](#4-pipeline--kanban)
5. [Modal de Detalle del Lead](#5-modal-de-detalle-del-lead)
6. [Análisis](#6-análisis)
7. [Generación de Sitio](#7-generación-de-sitio)
8. [WhatsApp — Envío de Mensajes](#8-whatsapp--envío-de-mensajes)
9. [Autopilot](#9-autopilot)
10. [Vinculación WhatsApp](#10-vinculación-whatsapp)
11. [Next Steps del Closer — Post-Cierre](#11-next-steps-del-closer--post-cierre)

---

## 1. Login

LeadForge es una aplicación de usuario único (MVP). El acceso se realiza con las credenciales de administrador configuradas en las variables de entorno (`ADMIN_EMAIL` y `ADMIN_PASSWORD`).

- Ingresá tu **email** y **contraseña** en la pantalla de login.
- La sesión se almacena en una cookie segura (`leadforge_session`) con duración de **7 días**.
- No hay registro de nuevos usuarios ni recuperación de contraseña — las credenciales se gestionan a nivel servidor.

---

## 2. Dashboard

**Ruta:** `/` (página principal tras el login)

El dashboard muestra 6 tarjetas de métricas en una grilla de 3 columnas:

| Métrica | Descripción |
|---|---|
| **Total leads** | Cantidad total de leads en el CRM |
| **Sitios generados** | Leads con propuesta de sitio creada (incluye sitio_generado, contactado, en_negociacion y cerrado) |
| **Contactados esta semana** | Mensajes de WhatsApp enviados en la semana en curso |
| **En negociación** | Leads actualmente en estado `en_negociacion` |
| **Score promedio** | Promedio del score de calidad web de todos los leads analizados |
| **Cerrados / Ganados** | Total histórico de leads con estado `cerrado` |

Si no hay leads cargados, se muestra un estado vacío con un enlace directo al módulo Scraper.

---

## 3. Scraper

**Ruta:** `/scraper`

El scraper busca negocios locales en Google Places y los importa al CRM. Tiene dos pestañas: **Buscar** e **Historial**.

### Pestaña "Buscar"

**Campos del formulario:**

- **Nicho** — Campo de texto con dropdown de 15 nichos predefinidos: Restaurantes, Dentistas, Gimnasios, Abogados, Contadores, Peluquerías, Hoteles, Farmacias, Veterinarias, Inmobiliarias, Constructoras, Spas, Cafeterías, Ferreterías, Clínicas.
- **Ciudad / Zona** — Texto libre (ej. "Córdoba Capital", "Palermo, Buenos Aires").
- **Máx. resultados** — Seleccioná entre 10, 20, 30 o 50 resultados.

Presioná **"Buscar leads"** o Enter para ejecutar la búsqueda.

**Tabla de resultados:**

| Columna | Detalle |
|---|---|
| ☑ | Checkbox para seleccionar (solo leads nuevos) |
| **Negocio** | Foto/avatar + nombre + dirección |
| **Categoría** | Badge con el tipo de negocio |
| **Teléfono** | Número del negocio |
| **Website** | Link externo al sitio web (muestra el dominio) |
| **Rating** | Calificación de Google (estrella + número) |
| **Estado** | "Nuevo" o "En CRM" |

- Solo se devuelven negocios que tengan **teléfono y sitio web**.
- Los leads ya importados aparecen atenuados con badge "En CRM" y no se pueden re-seleccionar.
- El checkbox "seleccionar todos" solo selecciona los leads nuevos.
- Se filtran automáticamente franquicias y cadenas conocidas (fast food, bancos, farmacias de cadena, etc.).

**Importación:** Seleccioná los leads deseados y hacé click en **"Importar X al CRM"**. Se muestra un toast de confirmación.

### Pestaña "Historial"

Tabla con las búsquedas anteriores:

| Columna | Detalle |
|---|---|
| **Fecha** | Cuándo se realizó |
| **Nicho** | Tipo de negocio buscado |
| **Ciudad** | Zona de búsqueda |
| **Encontrados** | Total de resultados |
| **Nuevos** | Leads que no estaban en el CRM |
| **Viables** | Leads con teléfono + web |

Cada registro tiene un botón **"Re-buscar"** que pre-carga los parámetros y ejecuta la búsqueda nuevamente.

---

## 4. Pipeline / Kanban

**Ruta:** `/kanban`

Vista de tablero Kanban con **8 columnas** que representan el ciclo de vida completo de un lead:

| Columna | Color | Significado |
|---|---|---|
| **Nuevo** | Gris | Recién importado, sin analizar |
| **Analizado** | Azul | Sitio web analizado, score ≥ 6 (sitio aceptable) |
| **Candidato** | Naranja | Score < 6 — oportunidad de venta |
| **Sitio generado** | Violeta | Se generó una propuesta de sitio web |
| **Contactado** | Cyan | Se envió mensaje por WhatsApp |
| **En negociación** | Amarillo | El lead respondió y hay conversación activa |
| **Cerrado** | Verde | Venta concretada |
| **Descartado** | Rojo | Lead descartado (no viable) |

### Funcionalidades

- **Drag & drop** — Arrastrá las tarjetas entre columnas para cambiar el estado. El cambio se aplica de forma optimista e inmediata.
- **Analizar pendientes** — Botón en el header que analiza masivamente todos los leads en estado "Nuevo" sin score.
- **Actualizar** — Refresca la lista de leads.

### Tarjetas del lead

Cada tarjeta muestra:
- Avatar (foto de Google o inicial del nombre)
- Nombre del negocio + categoría
- **Score badge** con color: 🔴 ≤ 4 | 🟡 5–6 | 🟢 ≥ 7
- Teléfono (si disponible)
- Dominio del sitio web (si disponible)
- Rating de Google (si disponible)
- Badge **"Sitio listo"** (violeta) si ya tiene sitio generado
- Spinner con texto "Analizando" o "Generando" durante procesamiento

**Click en una tarjeta** abre el modal de detalle completo.

---

## 5. Modal de Detalle del Lead

Se abre al hacer click en cualquier tarjeta del Kanban. Es un modal de pantalla casi completa (96% ancho × 92% alto).

### Barra superior

- Avatar + nombre del negocio
- Badge de estado actual
- Badge de categoría
- Rating de Google
- Teléfono, link al sitio web, dirección
- Botón ✕ para cerrar (también se cierra con Escape)

### Columna 1 — Score, Pipeline y Actividad (272px)

**Score:**
- Botón **"Analizar"** / **"Re-analizar"** para ejecutar o repetir el análisis
- Score badge grande con color
- Grilla de 2 columnas con los **8 criterios** de evaluación, cada uno con: nombre, puntuación numérica (coloreada), y barra de progreso
- Resumen de IA (2–3 oraciones)
- Panel colapsable **"X problemas detectados"** con lista de issues específicos

**Pipeline:**
- Dropdown para cambiar el estado del lead a cualquiera de los 8 estados

**Actividad:**
- Timeline cronológico con las últimas 8 acciones (tipo de acción + detalle + timestamp)

### Columna 2 — Preview del Sitio (flexible)

- **Si hay sitio generado:** Barra estilo navegador macOS con la URL, link "Abrir", y un iframe con la preview completa del sitio propuesto.
- **Si no hay sitio:** Fondo oscuro con ícono 🌐, descripción, y botón **"Generar sitio ahora"**.

### Columna 3 — Acciones y Notas (248px)

**Acciones:**
- **"Generar sitio"** / **"Regenerar sitio"** — Crea o recrea la propuesta web
- **"Ver sitio completo"** — Abre la preview en una pestaña nueva
- **"Enviar WhatsApp"** — Abre el modal de WhatsApp

**Notas:**
- Área de texto para notas internas sobre el lead
- Botón **"Guardar nota"** (se habilita solo cuando hay cambios)

**Tags:**
- Si el lead tiene tags, se muestran como badges

---

## 6. Análisis

El análisis evalúa la calidad del sitio web actual del lead usando inteligencia artificial (Claude AI).

### Proceso

1. Se scrapea el sitio web del lead con cheerio (sin navegador)
2. Se envía la información a Claude AI para evaluación
3. Se devuelve un score ponderado de 1 a 10 con desglose por dimensión

### Los 8 Criterios de Evaluación

| Criterio | Peso | Qué evalúa |
|---|---|---|
| **Diseño** | 20% | Estética visual general |
| **Responsive** | 20% | Adaptabilidad a móviles |
| **Velocidad** | 15% | Percepción de velocidad de carga |
| **Copy** | 15% | Claridad del mensaje y textos |
| **CTAs** | 10% | Presencia de llamados a la acción efectivos |
| **SEO** | 10% | SEO básico (title, meta, headings) |
| **HTTPS** | 5% | Seguridad del sitio |
| **Modernidad** | 5% | Antigüedad / modernidad del diseño |

### Clasificación Automática

- **Score < 6** → Estado pasa a `candidato` (oportunidad de venta — el negocio necesita un mejor sitio)
- **Score ≥ 6** → Estado pasa a `analizado` (sitio aceptable, menor oportunidad)
- Sitios tipo link-in-bio, menú digital o redirect a redes → score máximo 3/10
- Sitios que no cargan → score máximo 2/10

### Análisis Masivo

Desde el Kanban, el botón **"Analizar X pendientes"** ejecuta el análisis secuencial de todos los leads en estado "Nuevo" sin score.

---

## 7. Generación de Sitio

La generación de sitio crea una **propuesta/demo** de sitio web profesional para mostrarle al lead como argumento de venta.

### Proceso

1. Se recuperan los datos del lead y la información scrapeada durante el análisis
2. Si los datos son insuficientes, se re-scrapea el sitio web
3. Se obtienen horarios, rating y reseñas de Google Places
4. Se genera un sitio HTML completo usando IA (GPT-5 Codex por defecto o Claude como alternativa)
5. Se crea un slug único: `nombre-negocio-abc123`
6. El sitio se almacena y queda disponible en una **URL pública**

### URL de Preview

```
https://tu-dominio.com/preview/{slug}
```

Esta URL es pública y se puede compartir directamente con el lead. El sitio se cachea por 1 hora.

### Características del Sitio Generado

- HTML completo, standalone (no requiere hosting adicional)
- Diseño responsive y profesional
- Sistema de colores OKLCH con variantes light/dark
- Selección inteligente de secciones según los datos disponibles (21 tipos de sección)
- Contexto de diseño específico por industria (15 industrias)
- Animaciones y efectos visuales incluidos

### En la UI

- El sitio se previsualiza en el **iframe** de la Columna 2 del modal de detalle
- Link **"Ver sitio completo"** abre la preview en pestaña nueva
- Se puede **regenerar** el sitio en cualquier momento

### Timeout

La generación puede tomar hasta **5 minutos** (300 segundos) dependiendo del proveedor de IA configurado.

---

## 8. WhatsApp — Envío de Mensajes

### Abrir el Modal de WhatsApp

Se accede desde el botón **"Enviar WhatsApp"** en el modal de detalle del lead.

### Flujo

1. Al abrir el modal, se genera automáticamente un **mensaje personalizado** con IA
2. El mensaje se escribe en español argentino (voseo), con máximo 3 párrafos cortos
3. Si el lead tiene sitio generado, se incluye el link de la preview
4. El mensaje aparece en un área de texto **editable** — podés modificarlo antes de enviarlo
5. Se muestra un **contador de caracteres** (se pone rojo si supera los 1.000)

### Botones

- **"Regenerar"** — Genera un nuevo mensaje con IA
- **"Abrir en WhatsApp"** — Abre `wa.me` con el mensaje pre-cargado en una pestaña nueva

### Al Enviar

- Se abre WhatsApp Web/App con el mensaje listo para enviar
- El lead se marca automáticamente como `contactado`
- Se registra la fecha de contacto (`last_contacted_at`)
- Se muestra toast de confirmación

### Advertencia

Si el lead **no tiene sitio generado**, se muestra un aviso amarillo recomendando generar el sitio primero para poder incluir el link en el mensaje.

---

## 9. Autopilot

**Ruta:** `/autopilot`

El Autopilot ejecuta el **pipeline completo** de adquisición de leads de forma automatizada en un solo click.

### Etapas del Pipeline

| # | Etapa | Qué hace |
|---|---|---|
| 1 | **Buscar** | Busca negocios en Google Places |
| 2 | **Importar** | Importa los resultados al CRM |
| 3 | **Analizar** | Ejecuta el análisis IA de cada sitio web |
| 4 | **Generar sitios** | Crea propuestas de sitio para candidatos |
| 5 | **Generar mensajes** | Redacta mensajes personalizados con IA |
| 6 | **Enviar** | Envía los mensajes por WhatsApp |

### Configuración

- **Nicho** — Tipo de negocio (mismo selector que el Scraper con 15 opciones predefinidas)
- **Ciudad / Zona** — Ubicación geográfica
- **Máx. resultados** — 10, 20, 30 o 50

**Etapas opcionales (se pueden omitir individualmente):**
- ☐ Omitir análisis
- ☐ Omitir generación de sitios
- ☐ Omitir generación de mensajes
- ☐ Omitir envío WhatsApp

### Health Check del Generador

Antes de ejecutar, podés probar la conexión al modelo de IA con el botón **"Probar modelo"**. Muestra:
- Estado de conexión (OK / Error)
- Proveedor, modelo y latencia
- URL del endpoint
- Preview de respuesta

### Durante la Ejecución

- **Stepper de progreso** — Íconos circulares por etapa: gris (pendiente), azul girando (activa), verde (completada), rojo (error)
- **Contadores en tiempo real** — Importados, Analizados, Sitios, Mensajes, Enviados, Errores
- **Tabla de leads en vivo** — Negocio, Teléfono, Score, Sitio, Estado (con timer de tiempo transcurrido), Error
- **Log de errores** — Últimos 8 errores con detalle de etapa y negocio
- **Botón Cancelar** — Detiene la ejecución en curso
- Click en cualquier fila de la tabla abre el modal de detalle del lead

### Advertencia de WhatsApp

Si WhatsApp no está vinculado y no se marcó "Omitir envío", aparece un banner amarillo con link a la página de vinculación (`/whatsapp`).

### Historial de Ejecuciones

Debajo del formulario principal se muestra el historial de todas las ejecuciones anteriores:

| Columna | Detalle |
|---|---|
| **Fecha** | Cuándo se ejecutó |
| **Nicho** | Tipo de negocio |
| **Ciudad** | Zona de búsqueda |
| **Estado** | Completado / Cancelado / Error |
| **Leads** | Cantidad importada |
| **Analizados** | Cantidad analizada |
| **Sitios** | Sitios generados |
| **Mensajes** | Mensajes creados |
| **Duración** | Tiempo total |

Cada registro se puede expandir para ver la tabla detallada de leads de esa ejecución, y tiene un botón **"Re-ejecutar"** que pre-carga la configuración y lanza el pipeline nuevamente.

---

## 10. Vinculación WhatsApp

**Ruta:** `/whatsapp`

Esta página permite vincular tu cuenta de WhatsApp para el envío automático de mensajes desde el Autopilot.

### Estados de Conexión

| Estado | Lo que ves |
|---|---|
| **Sin vincular** | Placeholder de QR con borde punteado + botón "Vincular WhatsApp" |
| **Cargando** | Spinner + texto "Generando código QR..." |
| **Escaneando** | Código QR de 280×280px + instrucciones paso a paso |
| **Conectado** | Check verde grande + texto "Conectado" + botón "Desvincular" |
| **Error** | Círculo rojo + mensaje de error + botón "Reintentar" |

### Cómo Vincular

1. Hacé click en **"Vincular WhatsApp"**
2. Se genera un código QR en pantalla
3. En tu celular: abrí **WhatsApp → Dispositivos vinculados → Vincular dispositivo**
4. Escaneá el código QR con tu celular
5. Una vez escaneado, el estado cambia a **"Conectado"**

### Desvincular

Click en **"Desvincular"** para desconectar la cuenta de WhatsApp del sistema.

---

## 11. Next Steps del Closer — Post-Cierre

Guía operativa de acciones a seguir cuando un lead acepta la propuesta y se concreta la venta.

### Paso 1: Mover el Lead a "Cerrado"

- En el **Kanban**, arrastrá la tarjeta del lead a la columna **"Cerrado"** (verde).
- Alternativamente, cambiá el estado desde el **dropdown de Pipeline** en el modal de detalle.

### Paso 2: Registrar los Detalles del Acuerdo

En el campo de **Notas** del modal de detalle, documentá:
- Precio acordado
- Servicios incluidos (diseño web, dominio, hosting, mantenimiento, etc.)
- Fechas clave (entrega estimada, inicio del servicio)
- Método de pago y condiciones
- Cualquier acuerdo especial o descuento aplicado

### Paso 3: Recopilar Material del Cliente

Contactá al cliente para pedirle:
- **Logo en alta resolución** (PNG transparente o SVG, mínimo 1000px)
- **Fotos profesionales** del local, productos, equipo de trabajo
- **Textos actualizados** — descripción del negocio, servicios, horarios, precios
- **Accesos al dominio** — credenciales del registrador (GoDaddy, Namecheap, NIC Argentina, etc.)
- **Accesos al hosting** (si corresponde) — cPanel, panel de control, FTP
- **Redes sociales** — Links a Instagram, Facebook, Google Business, etc.
- **Información de contacto oficial** — Teléfonos, emails, dirección exacta

### Paso 4: Coordinar la Entrega del Sitio Final

El sitio generado por LeadForge es una **propuesta/demo** para cerrar la venta. El sitio final de producción requiere:

1. Revisar el sitio generado con el cliente y tomar nota de ajustes solicitados
2. Aplicar las modificaciones necesarias (textos, fotos, colores, secciones)
3. Integrar el material real del cliente (logo, fotos profesionales, contenido actualizado)
4. Hacer QA completo: responsive, velocidad, links, formularios, ortografía
5. Obtener aprobación final del cliente antes de publicar

### Paso 5: Configurar el Dominio del Cliente

1. Si el cliente **ya tiene dominio**: solicitar acceso al panel DNS y apuntar los registros al hosting
2. Si el cliente **no tiene dominio**: registrar uno nuevo a nombre del cliente
3. Configurar **SSL/HTTPS** (Let's Encrypt o similar)
4. Verificar que el sitio carga correctamente en el dominio final
5. Configurar redirección de `www` a raíz (o viceversa)

### Paso 6: Capacitación Básica al Cliente

Agendar una sesión breve (30–60 min) para:
- Mostrar cómo se ve el sitio publicado
- Explicar qué puede y qué no puede modificar por su cuenta
- Enseñar a actualizar contenido básico (si aplica — CMS, panel, etc.)
- Explicar cómo funciona Google Business y la importancia de mantenerlo actualizado
- Dejar un contacto claro para soporte futuro

### Paso 7: Definir Plan de Seguimiento

Establecer con el cliente:
- **Mantenimiento mensual** — Actualizaciones, backups, monitoreo de uptime
- **Frecuencia de actualizaciones** — De contenido, fotos, promociones
- **Soporte técnico** — Canales y tiempos de respuesta
- **Revisiones periódicas** — Reunión trimestral o semestral de resultados

### Paso 8: Solicitar Reseña / Testimonio

Una vez que el cliente esté satisfecho con la entrega:
- Pedir una **reseña en Google Business** de tu propio negocio/freelance
- Solicitar un **testimonio escrito** o en video para usar en tu portfolio
- Si corresponde, pedir permiso para **mostrar el sitio como caso de éxito**

### Paso 9: Explorar Upsells

Identificar oportunidades de servicios adicionales:

| Servicio | Descripción |
|---|---|
| **SEO local** | Optimización para aparecer en búsquedas locales de Google |
| **Google Ads** | Campañas de publicidad paga en Google |
| **Redes sociales** | Gestión de Instagram, Facebook, TikTok |
| **Mantenimiento mensual** | Plan recurrente de actualizaciones y soporte |
| **Email marketing** | Newsletters y campañas de email |
| **Fotografía profesional** | Sesión de fotos del local y productos |
| **Google Business** | Optimización y gestión del perfil de Google |
| **Chatbot / WhatsApp Business** | Automatización de atención al cliente |

**Tip:** El mejor momento para ofrecer servicios adicionales es **2–4 semanas después de la entrega**, cuando el cliente ya vio resultados y está satisfecho.

---

## Resumen del Flujo Completo

```
Scraper → Importar al CRM → Análisis IA → Generar Sitio Demo
→ Enviar WhatsApp con propuesta → Negociar → Cerrar venta
→ Recopilar material → Entregar sitio final → Seguimiento + Upsells
```

---

*LeadForge v0.1 beta — Manual de Usuario*
