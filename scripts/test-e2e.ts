/**
 * E2E Test Script — Scrape + Analyze + Generate Site + Send WhatsApp
 *
 * Requires:
 *   - Dev server running: npm run dev
 *   - WhatsApp linked (creds in whatsapp_auth/)
 *
 * Usage:
 *   npx tsx scripts/test-e2e.ts
 */

import * as readline from 'readline';

const BASE = 'http://localhost:3000';
const TARGET_PHONE = '5491123963042';

// ─── Helpers ─────────────────────────────────────────────────────────

async function api<T = unknown>(
  method: 'GET' | 'POST',
  path: string,
  body?: unknown
): Promise<T> {
  const url = `${BASE}${path}`;
  console.log(`\n→ ${method} ${path}`);

  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }

  const data = (await res.json()) as T;
  return data;
}

function ask(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

function log(label: string, value: unknown) {
  console.log(`  ${label}:`, typeof value === 'object' ? JSON.stringify(value, null, 2) : value);
}

// ─── Main ────────────────────────────────────────────────────────────

async function main() {
  console.log('=== LeadForge E2E Test ===');
  console.log(`Target phone: ${TARGET_PHONE}\n`);

  // 1. Search
  console.log('── Step 1: Search ──');
  const search = await api<{
    results: Array<{
      place_id: string;
      business_name: string;
      address: string;
      phone: string;
      website: string;
      rating: number;
      category: string;
      google_photo_url: string | null;
      viable: boolean;
    }>;
    total: number;
    viable: number;
  }>('POST', '/api/scraper/search', {
    niche: 'peluquería',
    city: 'Buenos Aires',
    maxResults: 1,
  });

  log('Total results', search.total);
  log('Viable', search.viable);

  if (!search.results.length) {
    throw new Error('No results returned from search');
  }

  const result = search.results[0];
  log('Business', result.business_name);
  log('Website', result.website);
  log('Phone', result.phone);

  // 2. Import
  console.log('\n── Step 2: Import ──');
  const imp = await api<{ imported: number; message: string }>('POST', '/api/scraper/import', {
    leads: [result],
    niche: 'peluquería',
    city: 'Buenos Aires',
  });
  log('Imported', imp.imported);
  log('Message', imp.message);

  // 3. Get lead ID
  console.log('\n── Step 3: Get Lead ──');
  // Try nuevo first; if already imported, find it in any status
  let leadsRes = await api<{
    leads: Array<{ id: string; business_name: string; status: string; score: number | null }>;
    total: number;
  }>('GET', '/api/leads?niche=peluquer%C3%ADa&city=Buenos+Aires&status=nuevo&limit=1');

  if (!leadsRes.leads.length) {
    console.log('  No lead with status "nuevo", searching all statuses...');
    leadsRes = await api<{
      leads: Array<{ id: string; business_name: string; status: string; score: number | null }>;
      total: number;
    }>('GET', `/api/leads?search=${encodeURIComponent(result.business_name)}&status=all&limit=1`);
  }

  if (!leadsRes.leads.length) {
    throw new Error('No lead found after import');
  }

  const lead = leadsRes.leads[0];
  const leadId = lead.id;
  log('Lead ID', leadId);
  log('Business', lead.business_name);
  log('Status', lead.status);

  // 4. Analyze
  console.log('\n── Step 4: Analyze ──');
  const analysis = await api<{
    score: number;
    details: unknown;
    status: string;
    site_type: string;
  }>('POST', `/api/analyze/${leadId}`);
  log('Score', analysis.score);
  log('Status', analysis.status);
  log('Site type', analysis.site_type);

  // 5. Generate site
  console.log('\n── Step 5: Generate Site ──');
  const site = await api<{ preview_url: string; slug: string }>(
    'POST',
    `/api/generate-site/${leadId}`
  );
  log('Preview URL', site.preview_url);
  log('Slug', site.slug);

  // 6. Generate message
  console.log('\n── Step 6: Generate Message ──');
  const outreach = await api<{ message: string; usedAI: boolean; phone: string }>(
    'POST',
    `/api/outreach/generate-message/${leadId}`
  );
  log('Used AI', outreach.usedAI);
  log('Original phone', outreach.phone);

  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║        MENSAJE A ENVIAR POR WHATSAPP     ║');
  console.log('╠══════════════════════════════════════════╣');
  console.log(outreach.message);
  console.log('╚══════════════════════════════════════════╝');
  console.log(`\nDestinatario: ${TARGET_PHONE}`);

  const confirm = await ask('\n¿Enviar este mensaje por WhatsApp? (y/n): ');
  if (confirm !== 'y') {
    console.log('Envío cancelado.');
    process.exit(0);
  }

  // 7. Send WhatsApp
  console.log('\n── Step 7: Send WhatsApp ──');
  console.log(`→ POST /api/whatsapp/send-batch`);

  const sendRes = await fetch(`${BASE}/api/whatsapp/send-batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      leads: [{ leadId, phone: TARGET_PHONE, message: outreach.message }],
    }),
  });

  if (!sendRes.ok) {
    const text = await sendRes.text();
    throw new Error(`${sendRes.status} ${sendRes.statusText}: ${text}`);
  }

  // Read SSE stream
  const reader = sendRes.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop()!; // keep incomplete line in buffer

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const json = line.slice(6);
      try {
        const event = JSON.parse(json);
        console.log(`  SSE [${event.type}]`, event);

        if (event.type === 'fatal') {
          throw new Error(`WhatsApp fatal: ${event.error}`);
        }
        if (event.type === 'done') {
          console.log('\n=== E2E Test Complete ===');
          process.exit(0);
        }
      } catch (e) {
        if (e instanceof SyntaxError) continue; // skip malformed lines
        throw e;
      }
    }
  }

  console.log('\n=== E2E Test Complete ===');
}

main().catch((err) => {
  console.error('\n✗ E2E FAILED:', err.message || err);
  process.exit(1);
});
