'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import type { Editor } from 'grapesjs'
import EditorTopbar from './EditorTopbar'
import 'grapesjs/dist/css/grapes.min.css'

interface SiteEditorProps {
  leadId: string
  businessName: string
  initialHtml: string
  previewUrl?: string
}

const stripNavGuard = (html: string) =>
  html
    .replace(/<style id="leadforge-nav-guard">[\s\S]*?<\/style>/gi, '')
    .replace(
      /<script id="leadforge-nav-guard-script">[\s\S]*?<\/script>/gi,
      ''
    )

/**
 * Parse the full HTML document and extract resources separately so we can
 * inject them into the GrapesJS canvas iframe using proper DOM methods
 * (createElement/appendChild) which — unlike innerHTML — actually execute
 * scripts and trigger stylesheet loading.
 */
function parseHtmlDocument(rawHtml: string) {
  const cleaned = stripNavGuard(rawHtml)
  const doc = new DOMParser().parseFromString(cleaned, 'text/html')

  // ── Head resources ──────────────────────────────────────────────
  const headMetas = Array.from(doc.head.querySelectorAll('meta'))
  const headTitle = doc.head.querySelector('title')
  const preconnectLinks = Array.from(
    doc.head.querySelectorAll(
      'link[rel="preconnect"], link[rel="dns-prefetch"], link[rel="icon"], link[rel="shortcut icon"]'
    )
  )
  const stylesheetLinks = Array.from(
    doc.head.querySelectorAll('link[rel="stylesheet"]')
  )
  const inlineStyles = Array.from(doc.head.querySelectorAll('style'))

  // Separate Tailwind CDN + config from other head scripts
  const headScripts = Array.from(doc.head.querySelectorAll('script'))
  let tailwindCdnSrc = ''
  let tailwindConfigCode = ''
  const otherHeadScripts: { src?: string; code?: string }[] = []

  for (const el of headScripts) {
    const src = el.getAttribute('src') || ''
    const code = el.textContent || ''
    if (src.includes('tailwindcss') || src.includes('tailwind')) {
      tailwindCdnSrc = src
    } else if (
      code.includes('tailwind.config') ||
      code.includes('tailwind')
    ) {
      tailwindConfigCode = code
    } else if (src || code.trim()) {
      otherHeadScripts.push(src ? { src } : { code })
    }
  }

  // Full head innerHTML preserved for save reconstruction
  const headInnerHTML = doc.head.innerHTML

  // ── Body ────────────────────────────────────────────────────────
  const bodyEl = doc.body

  // Save body attributes (class, style, data-*, etc.)
  const bodyAttrs: string[] = []
  for (let i = 0; i < bodyEl.attributes.length; i++) {
    const a = bodyEl.attributes[i]
    bodyAttrs.push(`${a.name}="${a.value}"`)
  }

  // Extract and remove scripts from body before GrapesJS parsing
  // (GrapesJS strips scripts; we save them to restore on save)
  const bodyScriptTags: string[] = []
  bodyEl.querySelectorAll('script').forEach((el) => {
    bodyScriptTags.push(el.outerHTML)
    el.remove()
  })

  const bodyContent = bodyEl.innerHTML

  return {
    headInnerHTML,
    headMetas,
    headTitle,
    preconnectLinks,
    stylesheetLinks,
    inlineStyles,
    tailwindCdnSrc,
    tailwindConfigCode,
    otherHeadScripts,
    bodyAttrsStr: bodyAttrs.join(' '),
    bodyScriptTags,
    bodyContent,
  }
}

export default function SiteEditor({
  leadId,
  businessName,
  initialHtml,
  previewUrl,
}: SiteEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<Editor | null>(null)
  const headContentRef = useRef('')
  const bodyAttrsRef = useRef('')
  const bodyScriptsRef = useRef<string[]>([])
  const [editor, setEditor] = useState<Editor | null>(null)
  const [saving, setSaving] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [activeDevice, setActiveDevice] = useState('Desktop')

  // Warn on unload if unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) e.preventDefault()
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [hasUnsavedChanges])

  // Initialize GrapesJS
  useEffect(() => {
    if (!containerRef.current || editorRef.current) return

    const parsed = parseHtmlDocument(initialHtml)

    // Persist for save reconstruction
    headContentRef.current = parsed.headInnerHTML
    bodyAttrsRef.current = parsed.bodyAttrsStr
    bodyScriptsRef.current = parsed.bodyScriptTags

    // Extract external stylesheet URLs for canvas.styles (loads early)
    const externalCssUrls = parsed.stylesheetLinks
      .map((el) => el.getAttribute('href'))
      .filter(Boolean) as string[]

    // Build frameContent: full <head> with Tailwind CDN + config + styles,
    // empty body. document.write() executes scripts synchronously in order,
    // so Tailwind CDN loads → config applies → CSS vars/animations ready.
    const frameContent = `<!DOCTYPE html>
<html lang="es">
<head>${parsed.headInnerHTML}</head>
<body></body>
</html>`

    // Collect inline style text for fallback re-injection
    const parsedInlineStyles = parsed.inlineStyles
      .map((el) => el.textContent || '')
      .filter(Boolean)

    let destroyed = false

    ;(async () => {
      const grapesjs = (await import('grapesjs')).default
      const presetWebpage = (await import('grapesjs-preset-webpage')).default

      if (destroyed || !containerRef.current) return

      const ed = grapesjs.init({
        container: containerRef.current,
        storageManager: false,
        height: '100%',
        width: 'auto',
        canvas: {
          frameContent,
          // Backup: GrapesJS re-injects these during renderHead()
          scripts: parsed.tailwindCdnSrc ? [parsed.tailwindCdnSrc] : [],
          styles: externalCssUrls,
        },
        parser: {
          optionsHtml: {
            allowScripts: true,
            allowUnsafeAttr: true,
            allowUnsafeAttrValue: true,
          },
        },
        deviceManager: {
          devices: [
            { name: 'Desktop', width: '' },
            { name: 'Tablet', width: '768px', widthMedia: '992px' },
            { name: 'Mobile', width: '375px', widthMedia: '480px' },
          ],
        },
        plugins: [presetWebpage],
      } as Parameters<typeof grapesjs.init>[0])

      if (destroyed) {
        ed.destroy()
        return
      }

      ed.on('load', () => {
        const canvasDoc = ed.Canvas.getDocument()

        // Fallback: if renderHead() cleared inline styles, re-inject them
        if (canvasDoc && !canvasDoc.querySelector('style:not([id*="gjs"])')) {
          for (const css of parsedInlineStyles) {
            const s = canvasDoc.createElement('style')
            s.textContent = css
            canvasDoc.head.appendChild(s)
          }
        }

        // Fallback: canvas.scripts doesn't support inline scripts,
        // so re-inject Tailwind config if needed
        if (canvasDoc && parsed.tailwindConfigCode) {
          const s = canvasDoc.createElement('script')
          s.textContent = parsed.tailwindConfigCode
          canvasDoc.head.appendChild(s)
        }

        // Load body content — Tailwind's MutationObserver is now active
        // and will generate CSS for all Tailwind classes as they appear
        ed.setComponents(parsed.bodyContent)

        // Override scroll-animation initial states: the body <script> with
        // IntersectionObserver is stripped, so [data-animate] elements stay
        // hidden (opacity:0 / translateY). Force them visible in the editor.
        if (canvasDoc) {
          const overrides = canvasDoc.createElement('style')
          overrides.id = 'gjs-editor-overrides'
          overrides.textContent = `
            [data-animate] {
              opacity: 1 !important;
              transform: none !important;
              transition: none !important;
            }
          `
          canvasDoc.head.appendChild(overrides)
        }

        // Apply body attributes (class, style, etc.) to wrapper
        if (parsed.bodyAttrsStr) {
          const wrapper = ed.DomComponents.getWrapper()
          if (wrapper) {
            const tmpDoc = new DOMParser().parseFromString(
              `<body ${parsed.bodyAttrsStr}></body>`,
              'text/html'
            )
            for (let i = 0; i < tmpDoc.body.attributes.length; i++) {
              const attr = tmpDoc.body.attributes[i]
              wrapper.addAttributes({ [attr.name]: attr.value })
            }
          }
        }

        // Track changes
        const markDirty = () => setHasUnsavedChanges(true)
        ed.on('component:update', markDirty)
        ed.on('component:add', markDirty)
        ed.on('component:remove', markDirty)
        ed.on('style:change', markDirty)

        ed.UndoManager.clear()
      })

      editorRef.current = ed
      setEditor(ed)
    })()

    return () => {
      destroyed = true
      if (editorRef.current) {
        editorRef.current.destroy()
        editorRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const buildFullHtml = useCallback((ed: Editor) => {
    const bodyInner = ed.getHtml()
    const editorCss = ed.getCss({ avoidProtected: true }) ?? ''
    const bodyScripts = bodyScriptsRef.current.join('\n')
    return `<!DOCTYPE html>
<html lang="es">
<head>
${headContentRef.current}
${editorCss ? `<style data-gjs-editor>\n${editorCss}\n</style>` : ''}
</head>
<body${bodyAttrsRef.current ? ' ' + bodyAttrsRef.current : ''}>
${bodyInner}
${bodyScripts}
</body>
</html>`
  }, [])

  const handleSave = useCallback(async () => {
    if (!editor) return
    setSaving(true)
    try {
      const html = buildFullHtml(editor)
      const res = await fetch(`/api/leads/${leadId}/site-html`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ site_html: html }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Error al guardar')
      }
      setHasUnsavedChanges(false)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }, [editor, buildFullHtml, leadId])

  const handleDeviceChange = useCallback(
    (device: string) => {
      editor?.setDevice(device)
      setActiveDevice(device)
    },
    [editor]
  )

  return (
    <div className="flex flex-col h-screen" style={{ background: '#13132b' }}>
      <EditorTopbar
        editor={editor}
        businessName={businessName}
        previewUrl={previewUrl}
        saving={saving}
        hasUnsavedChanges={hasUnsavedChanges}
        activeDevice={activeDevice}
        onSave={handleSave}
        onDeviceChange={handleDeviceChange}
      />
      <div ref={containerRef} className="gjs-editor-cont flex-1 min-h-0" />
      <style jsx global>{`
        .gjs-editor-cont .gjs-editor {
          height: 100% !important;
        }
        .gjs-editor-cont .gjs-cv-canvas {
          top: 0;
          width: calc(100% - 240px);
          height: 100%;
        }
        .gjs-editor-cont .gjs-pn-views-container {
          width: 240px;
          padding: 0;
        }
      `}</style>
    </div>
  )
}
