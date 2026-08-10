/**
 * Upload public/images/tours/ into the Supabase `tour-photos` bucket
 * ==================================================================
 * The Storage dashboard has no "upload folder" button, and the day photos are
 * 287 files across 9 folders. This does it in one command, preserving the
 * folder structure — which is the part that matters.
 *
 * WHY THE STRUCTURE MATTERS
 * -------------------------
 * q_package_docs stores photo paths relative to the bucket root, e.g.
 * "cairo-giza/sphinx-pyramids.jpeg". The website renderer
 * (functions/_lib/packageHtml.js) turns that into
 *   <SUPABASE_URL>/storage/v1/object/public/tour-photos/cairo-giza/sphinx-pyramids.jpeg
 * So the 9 folders must land at the BUCKET ROOT. One extra level of nesting —
 * a "tours/" prefix, say — breaks every referenced photo at once.
 *
 * USAGE (cmd.exe, from the etl-quotations folder)
 * -----------------------------------------------
 *   set SUPABASE_URL=https://yxgpjjwjgtgavfusurbi.supabase.co
 *   set SUPABASE_SERVICE_KEY=<the service_role key>
 *   node scripts\upload-tour-photos.mjs --dry-run
 *   node scripts\upload-tour-photos.mjs
 *
 * Run --dry-run first: it lists exactly what would be uploaded and to which
 * key, and touches nothing.
 *
 * The service_role key is required — uploading is not a public operation even
 * on a public bucket. Pass it via the environment as above; do NOT paste it
 * into this file, and do not commit it. `set` only affects that one cmd window
 * and is forgotten when you close it.
 *
 * Safe to re-run. Uploads are upserts, so a second run overwrites rather than
 * erroring, and adding new photos later is just another run.
 *
 * Each file is retried up to 3 times with backoff. Node's fetch throws a bare
 * "fetch failed" on a transient connection drop, and on a large batch a few
 * files will hit one; retrying is what makes a single run sufficient.
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, sep, extname } from 'node:path';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const BUCKET = 'tour-photos';
const SOURCE = 'public/images/tours';
const CONCURRENCY = 6;
const DRY_RUN = process.argv.includes('--dry-run');

const CONTENT_TYPES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
};

// manifest.json is a build artefact of the photo library, not an image.
const SKIP_NAMES = new Set(['manifest.json', '.DS_Store', 'Thumbs.db', 'desktop.ini']);

function die(msg) {
  console.error(`\n  ${msg}\n`);
  process.exit(1);
}

if (!SUPABASE_URL) die('SUPABASE_URL is not set. See the usage note at the top of this file.');
if (!SERVICE_KEY) die('SUPABASE_SERVICE_KEY is not set. It must be the service_role key, not the publishable one.');
if (/^sb_publishable_/.test(SERVICE_KEY)) {
  die('SUPABASE_SERVICE_KEY looks like the PUBLISHABLE key. Uploads need the service_role key.');
}

const base = String(SUPABASE_URL).replace(/\/+$/, '');

/** Every file under dir, as paths relative to dir, using forward slashes. */
async function walk(dir, root = dir, out = []) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    die(`Cannot read ${dir} — run this from the etl-quotations folder.\n  (${err.message})`);
  }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) await walk(full, root, out);
    else if (!SKIP_NAMES.has(e.name)) out.push(relative(root, full).split(sep).join('/'));
  }
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Upload with retries.
 *
 * Node's fetch throws a bare "fetch failed" on a transient connection drop —
 * no status, no detail. On a home connection pushing ~58 MB this happens to a
 * handful of files per run, and which files fail is random. Without retries you
 * are left re-running and manually comparing what stuck, which defeats the point
 * of the script. Three attempts with backoff clears it.
 */
async function uploadWithRetry(rel, attempts = 3) {
  let lastErr;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await upload(rel);
    } catch (err) {
      lastErr = err;
      if (i < attempts) await sleep(400 * i * i); // 400ms, 1.6s
    }
  }
  throw lastErr;
}

async function upload(rel) {
  const full = join(SOURCE, rel.split('/').join(sep));
  const body = await readFile(full);
  const type = CONTENT_TYPES[extname(rel).toLowerCase()] || 'application/octet-stream';

  // Each path segment is encoded separately so slashes survive as folder
  // separators while spaces and other characters in filenames are escaped.
  const key = rel.split('/').map(encodeURIComponent).join('/');

  const res = await fetch(`${base}/storage/v1/object/${BUCKET}/${key}`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': type,
      'x-upsert': 'true', // re-runnable: overwrite rather than 409
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${text.slice(0, 200)}`);
  }
  return body.length;
}

const files = await walk(SOURCE);
if (!files.length) die(`No files found under ${SOURCE}.`);

let bytes = 0;
for (const f of files) bytes += (await stat(join(SOURCE, f.split('/').join(sep)))).size;

const folders = [...new Set(files.map((f) => (f.includes('/') ? f.split('/')[0] : '(root)')))].sort();

console.log(`\n  source : ${SOURCE}`);
console.log(`  target : ${base}/storage/v1/object/public/${BUCKET}/`);
console.log(`  files  : ${files.length}  (${(bytes / 1048576).toFixed(1)} MB)`);
console.log(`  folders: ${folders.join(', ')}\n`);
console.log(`  example: ${files[0]}\n        -> ${base}/storage/v1/object/public/${BUCKET}/${files[0]}\n`);

if (DRY_RUN) {
  console.log('  --dry-run: nothing uploaded. Re-run without the flag to upload.\n');
  process.exit(0);
}

let done = 0;
const failures = [];
const queue = [...files];

async function worker() {
  while (queue.length) {
    const rel = queue.shift();
    try {
      await uploadWithRetry(rel);
      done++;
      if (done % 25 === 0 || done === files.length) {
        console.log(`  ${String(done).padStart(4)}/${files.length}`);
      }
    } catch (err) {
      failures.push({ rel, err: err.message });
      console.error(`  FAILED ${rel} :: ${err.message}`);
    }
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));

console.log(`\n  uploaded: ${done}/${files.length}`);
if (failures.length) {
  console.log(`  failed  : ${failures.length}`);
  console.log('  Re-run the script — it upserts, so successful files are simply overwritten.\n');
  process.exit(1);
}
console.log('  All files uploaded. Publish a package and check the day photos.\n');
