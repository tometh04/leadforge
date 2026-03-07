import * as cheerio from 'cheerio'
import type { AnyNode, Element } from 'domhandler'

const NAV_GUARD_STYLE_ID = 'leadforge-nav-guard'
const NAV_GUARD_SCRIPT_ID = 'leadforge-nav-guard-script'

const TOGGLE_HINT_RE = /\b(menu|menú|navigation|nav|hamburger|burger|toggle)\b/i
const PANEL_HINT_RE = /\b(menu|menú|mobile|drawer|panel|sheet|popover|dropdown|overlay)\b/i
const MOBILE_PANEL_CLASS_RE =
  /\b(?:sm|md|lg|xl):hidden\b|top-full|bottom-full|left-0|right-0|inset-x-|absolute|fixed|origin-top|translate-y|w-full/i
const DESKTOP_NAV_CLASS_RE = /\b(?:md|lg|xl):flex\b/

const NAV_GUARD_CSS = `
[hidden] {
  display: none !important;
}

nav [data-mobile-menu] {
  display: none;
}

nav [data-mobile-menu][data-open="true"] {
  display: block;
}

@media (min-width: 768px) {
  nav [data-mobile-menu] {
    display: none !important;
  }
}
`.trim()

const NAV_GUARD_SCRIPT = `
(() => {
  if (window.__leadforgeNavGuardInitialized) return;
  window.__leadforgeNavGuardInitialized = true;

  const desktopMedia = window.matchMedia('(min-width: 768px)');

  function setMenuState(toggle, panel, isOpen) {
    panel.hidden = !isOpen;
    panel.setAttribute('data-open', isOpen ? 'true' : 'false');
    panel.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
    toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  }

  function bindNav(nav) {
    const toggle = nav.querySelector('[data-menu-toggle]');
    const panel = nav.querySelector('[data-mobile-menu]');
    if (!toggle || !panel) return;

    setMenuState(toggle, panel, false);

    toggle.addEventListener('click', (event) => {
      if (desktopMedia.matches) {
        setMenuState(toggle, panel, false);
        return;
      }

      event.preventDefault();
      const isOpen = panel.getAttribute('data-open') === 'true';
      setMenuState(toggle, panel, !isOpen);
    });

    panel.querySelectorAll('a[href], button').forEach((element) => {
      element.addEventListener('click', () => {
        if (!desktopMedia.matches) {
          setMenuState(toggle, panel, false);
        }
      });
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        setMenuState(toggle, panel, false);
      }
    });

    const syncLayout = () => {
      if (desktopMedia.matches) {
        setMenuState(toggle, panel, false);
      }
    };

    if (typeof desktopMedia.addEventListener === 'function') {
      desktopMedia.addEventListener('change', syncLayout);
    } else if (typeof desktopMedia.addListener === 'function') {
      desktopMedia.addListener(syncLayout);
    }

    window.addEventListener('resize', syncLayout, { passive: true });
  }

  document.querySelectorAll('nav[data-nav-root]').forEach(bindNav);
})();
`.trim()

function signalText(node: cheerio.Cheerio<AnyNode>): string {
  return [
    node.attr('id') ?? '',
    node.attr('class') ?? '',
    node.attr('aria-label') ?? '',
    node.attr('data-state') ?? '',
    node.text(),
  ]
    .join(' ')
    .toLowerCase()
}

function scoreMenuToggle(button: cheerio.Cheerio<AnyNode>): number {
  const className = button.attr('class') ?? ''
  let score = 0

  if (button.is('button')) score += 1
  if (button.attr('aria-controls')) score += 5
  if (TOGGLE_HINT_RE.test(signalText(button))) score += 4
  if (/\b(?:sm|md|lg|xl):hidden\b|mobile/i.test(className)) score += 2
  if (button.find('svg').length > 0) score += 1

  return score
}

function findMenuToggle(
  $: cheerio.CheerioAPI,
  nav: cheerio.Cheerio<AnyNode>
): cheerio.Cheerio<AnyNode> | null {
  let bestScore = 0
  let bestToggle: cheerio.Cheerio<AnyNode> | null = null

  nav.find('button').each((_, element) => {
    const candidate = $(element)
    const score = scoreMenuToggle(candidate)
    if (score > bestScore) {
      bestScore = score
      bestToggle = candidate
    }
  })

  return bestScore >= 4 ? bestToggle : null
}

function scoreMenuPanel(
  panel: cheerio.Cheerio<AnyNode>,
  toggle: cheerio.Cheerio<AnyNode>
): number {
  const toggleElement = toggle.get(0) as Element | undefined
  if (toggleElement) {
    if (panel.get(0) === toggleElement) return 0
    if (panel.find('button').toArray().some((element) => element === toggleElement)) return 0
  }

  const linkCount = panel.find('a[href]').length
  const buttonCount = panel.find('button').length
  if (linkCount + buttonCount < 2) return 0

  const className = panel.attr('class') ?? ''
  const attrs = [
    panel.attr('id') ?? '',
    className,
    panel.attr('aria-label') ?? '',
    panel.attr('role') ?? '',
  ]
    .join(' ')
    .toLowerCase()

  let score = 0

  if (PANEL_HINT_RE.test(attrs)) score += 6
  if (MOBILE_PANEL_CLASS_RE.test(className)) score += 4
  if ((panel.attr('role') ?? '').toLowerCase() === 'dialog') score += 2
  if (panel.parent().is('nav')) score += 2
  if (linkCount >= 3) score += 2
  if (buttonCount >= 1) score += 1
  if (!DESKTOP_NAV_CLASS_RE.test(className)) score += 1

  return score
}

function findMenuPanel(
  $: cheerio.CheerioAPI,
  nav: cheerio.Cheerio<AnyNode>,
  toggle: cheerio.Cheerio<AnyNode>
): cheerio.Cheerio<AnyNode> | null {
  const ariaControls = toggle.attr('aria-controls')
  if (ariaControls) {
    const safeId = ariaControls.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    const controlledPanel = nav.find(`[id="${safeId}"]`).first()
    if (controlledPanel.length > 0) return controlledPanel
  }

  let bestScore = 0
  let bestPanel: cheerio.Cheerio<AnyNode> | null = null

  nav.find('div, aside, section, ul').each((_, element) => {
    const candidate = $(element)
    const score = scoreMenuPanel(candidate, toggle)
    if (score > bestScore) {
      bestScore = score
      bestPanel = candidate
    }
  })

  if (bestScore >= 6 && bestPanel) {
    return bestPanel
  }

  const fallbackChildren = nav.children().toArray().slice(1)
  for (const element of fallbackChildren) {
    const candidate = $(element)
    if (scoreMenuPanel(candidate, toggle) >= 3) {
      return candidate
    }
  }

  return null
}

function annotateNavbar(
  $: cheerio.CheerioAPI,
  nav: cheerio.Cheerio<AnyNode>,
  index: number
): boolean {
  const toggle = findMenuToggle($, nav)
  if (!toggle) return false

  const panel = findMenuPanel($, nav, toggle)
  if (!panel) return false

  nav.attr('data-nav-root', '')

  const panelId = panel.attr('id') || `leadforge-mobile-menu-${index + 1}`
  panel.attr('id', panelId)
  panel.attr('data-mobile-menu', '')
  panel.attr('data-open', 'false')
  panel.attr('aria-hidden', 'true')
  panel.attr('hidden', 'hidden')
  panel.removeAttr('open')

  toggle.attr('type', toggle.attr('type') || 'button')
  toggle.attr('data-menu-toggle', '')
  toggle.attr('aria-controls', panelId)
  toggle.attr('aria-expanded', 'false')
  if (!toggle.attr('aria-label')) {
    toggle.attr('aria-label', 'Abrir menu')
  }

  return true
}

function ensureHead($: cheerio.CheerioAPI): cheerio.Cheerio<AnyNode> {
  let head = $('head').first()
  if (head.length > 0) return head

  const html = $('html').first()
  if (html.length === 0) {
    $.root().append('<html><head></head><body></body></html>')
    return $('head').first()
  }

  html.prepend('<head></head>')
  return $('head').first()
}

function ensureBody($: cheerio.CheerioAPI): cheerio.Cheerio<AnyNode> {
  let body = $('body').first()
  if (body.length > 0) return body

  const html = $('html').first()
  if (html.length === 0) {
    $.root().append('<html><head></head><body></body></html>')
    return $('body').first()
  }

  html.append('<body></body>')
  return $('body').first()
}

export function stabilizeGeneratedSiteHtml(html: string): string {
  const hasDoctype = /^\s*<!doctype html>/i.test(html)
  const $ = cheerio.load(html)

  const navbars = $('nav').toArray()
  if (navbars.length === 0) {
    return html
  }

  navbars.forEach((element, index) => {
    annotateNavbar($, $(element), index)
  })

  const head = ensureHead($)
  if (head.find(`#${NAV_GUARD_STYLE_ID}`).length === 0) {
    head.append(`<style id="${NAV_GUARD_STYLE_ID}">\n${NAV_GUARD_CSS}\n</style>`)
  }

  const body = ensureBody($)
  if (body.find(`#${NAV_GUARD_SCRIPT_ID}`).length === 0) {
    body.append(`<script id="${NAV_GUARD_SCRIPT_ID}">\n${NAV_GUARD_SCRIPT}\n</script>`)
  }

  const serialized = $.html()
  if (/^\s*<!doctype html>/i.test(serialized)) {
    return serialized
  }

  if (hasDoctype) {
    return `<!DOCTYPE html>\n${serialized}`
  }

  return serialized
}
