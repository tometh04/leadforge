/**
 * E2E Test — Site Generation + HTML Validation
 *
 * Verifies that site generation produces complete, non-truncated HTML
 * for real leads in the database.
 *
 * Requires:
 *   - Dev server running: npm run dev
 *   - ADMIN_EMAIL / ADMIN_PASSWORD env vars (or in .env)
 *
 * Usage:
 *   npx tsx scripts/test-site-generation.ts
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

// Load .env file (script runs outside Next.js, so we parse it ourselves)
try {
  const __dirname = resolve(fileURLToPath(import.meta.url), '..');
  const envPath = resolve(__dirname, '..', '.env');
  const envContent = readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
} catch {
  // .env file not found — rely on env vars being set externally
}

const BASE = 'http://localhost:3000';
const MAX_LEADS = 3;

let sessionCookie = '';

// ─── Helpers ─────────────────────────────────────────────────────────

async function api<T = unknown>(
  method: 'GET' | 'POST',
  path: string,
  body?: unknown
): Promise<T> {
  const url = `${BASE}${path}`;
  console.log(`\n→ ${method} ${path}`);

  const headers: Record<string, string> = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (sessionCookie) headers['Cookie'] = sessionCookie;

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  });

  // Capture set-cookie for login
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) {
    const match = setCookie.match(/leadforge_session=[^;]+/);
    if (match) sessionCookie = match[0];
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }

  return (await res.json()) as T;
}

async function fetchHtml(path: string): Promise<string> {
  const url = `${BASE}${path}`;
  console.log(`→ GET ${path} (html)`);

  const res = await fetch(url, {
    headers: sessionCookie ? { Cookie: sessionCookie } : {},
  });

  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText} fetching ${path}`);
  }

  return res.text();
}

// ─── Validation ──────────────────────────────────────────────────────

interface ValidationResult {
  leadId: string;
  businessName: string;
  slug: string;
  previewUrl: string;
  passed: boolean;
  checks: { name: string; passed: boolean; detail?: string }[];
}

function validateHtml(
  html: string,
  businessName: string
): { passed: boolean; checks: ValidationResult['checks'] } {
  const checks: ValidationResult['checks'] = [];

  // 1. Contains <!DOCTYPE html
  const hasDoctype = /<!DOCTYPE html/i.test(html);
  checks.push({
    name: 'Has <!DOCTYPE html>',
    passed: hasDoctype,
    detail: hasDoctype ? undefined : `Start: "${html.slice(0, 80)}..."`,
  });

  // 2. Contains </html>
  const hasClosingHtml = /<\/html>/i.test(html);
  checks.push({
    name: 'Has </html> closing tag',
    passed: hasClosingHtml,
    detail: hasClosingHtml ? undefined : `End: "...${html.slice(-80)}"`,
  });

  // 3. Contains business name
  const hasBusinessName = html.toLowerCase().includes(businessName.toLowerCase());
  checks.push({
    name: `Contains business name ("${businessName}")`,
    passed: hasBusinessName,
  });

  // 4. HTML length > 5000 chars
  const isLongEnough = html.length > 5000;
  checks.push({
    name: 'HTML length > 5000 chars',
    passed: isLongEnough,
    detail: `${html.length} chars`,
  });

  return {
    passed: checks.every((c) => c.passed),
    checks,
  };
}

// ─── Main ────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Site Generation E2E Test ===\n');

  // 1. Login
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD env vars are required');
  }

  console.log('── Step 1: Login ──');
  await api('POST', '/api/auth/login', { email, password });
  console.log('  Authenticated ✓');

  // 2. Fetch leads
  console.log('\n── Step 2: Fetch leads ──');
  const { leads } = await api<{
    leads: Array<{
      id: string;
      business_name: string;
      status: string;
      website: string | null;
    }>;
    total: number;
  }>('GET', `/api/leads?limit=${MAX_LEADS}&status=all`);

  if (!leads.length) {
    throw new Error('No leads found in database. Import some leads first.');
  }

  console.log(`  Found ${leads.length} lead(s) to test`);
  for (const l of leads) {
    console.log(`    - ${l.business_name} (${l.status})`);
  }

  // 3. Generate site for each lead + validate
  console.log('\n── Step 3: Generate + Validate ──');
  const results: ValidationResult[] = [];

  for (const lead of leads) {
    console.log(`\n┌─ ${lead.business_name} (${lead.id}) ─`);

    try {
      // Generate site
      const site = await api<{ preview_url: string; slug: string }>(
        'POST',
        `/api/generate-site/${lead.id}`
      );
      console.log(`  slug: ${site.slug}`);
      console.log(`  preview_url: ${site.preview_url}`);

      // Fetch the preview HTML
      const html = await fetchHtml(`/preview/${site.slug}`);

      // Validate
      const { passed, checks } = validateHtml(html, lead.business_name);

      for (const check of checks) {
        const icon = check.passed ? '✓' : '✗';
        const detail = check.detail ? ` (${check.detail})` : '';
        console.log(`  ${icon} ${check.name}${detail}`);
      }

      results.push({
        leadId: lead.id,
        businessName: lead.business_name,
        slug: site.slug,
        previewUrl: site.preview_url,
        passed,
        checks,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(`  ✗ FAILED: ${message}`);
      results.push({
        leadId: lead.id,
        businessName: lead.business_name,
        slug: '',
        previewUrl: '',
        passed: false,
        checks: [{ name: 'API call', passed: false, detail: message }],
      });
    }

    console.log('└─');
  }

  // 4. Summary
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log('\n══════════════════════════════════════');
  console.log('           RESULTS SUMMARY');
  console.log('══════════════════════════════════════');

  for (const r of results) {
    const icon = r.passed ? '✓' : '✗';
    console.log(`${icon} ${r.businessName}`);
    if (r.previewUrl) console.log(`  ${r.previewUrl}`);
  }

  console.log(`\n${passed} passed, ${failed} failed out of ${results.length} lead(s)`);

  if (failed > 0) {
    console.log('\n✗ Some validations failed');
    process.exit(1);
  }

  console.log('\n✓ All validations passed');
}

main().catch((err) => {
  console.error('\n✗ TEST FAILED:', err.message || err);
  process.exit(1);
});
