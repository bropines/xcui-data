/**
 * bun scripts/check-links.ts — what the schema cannot see: whether the
 * addresses still answer.
 *
 *   - every geo file answers a page (Access-Control-Allow-Origin: *) and is
 *     about the size it says (a list that grew past jsDelivr's 50 MB stops
 *     being served there);
 *   - every app download link answers (after redirects) with a status below
 *     400. apps.apple.com answers any script 403, so its pages are not checked.
 *
 * Run weekly by .github/workflows/links.yml; it fails with every problem
 * listed, so a moved repository or a renamed asset shows up as a red run
 * rather than as a dead button on someone's subscription page.
 */
import { join } from 'node:path';
import { readSource } from '../src/source';

const data = readSource(join(import.meta.dir, '..'));
const problems: string[] = [];
const ORIGIN = 'https://bropines.github.io';

const head = async (url: string): Promise<Response | null> => {
    for (const method of ['HEAD', 'GET'] as const) {
        try {
            const response = await fetch(url, { method, redirect: 'follow', headers: { Origin: ORIGIN, 'User-Agent': 'xcui-data link check', 'Accept-Encoding': 'identity' } });
            if (method === 'GET') void response.body?.cancel();
            if (response.status !== 405) return response;
        } catch (error) {
            if (method === 'GET') { problems.push(`${url}: ${(error as Error).message}`); return null; }
        }
    }
    return null;
};

for (const source of data.geo.sources) {
    for (const [kind, file] of Object.entries(source.files)) {
        if (!file) continue;
        const response = await head(file.url);
        if (!response) continue;
        const where = `geo ${source.id} ${kind} (${file.url})`;
        if (!response.ok) { problems.push(`${where}: HTTP ${response.status}`); continue; }
        if (response.headers.get('access-control-allow-origin') !== '*') problems.push(`${where}: no Access-Control-Allow-Origin: * — a page cannot read it`);
        const length = Number(response.headers.get('content-length'));
        if (length > 0) {
            const mb = length / 1e6;
            if (Math.abs(mb - file.sizeMb) / file.sizeMb > 0.25) problems.push(`${where}: ${mb.toFixed(1)} MB, the data says ${file.sizeMb} — update sizeMb`);
            if (file.url.includes('cdn.jsdelivr.net') && mb >= 50) problems.push(`${where}: ${mb.toFixed(1)} MB is over jsDelivr's 50 MB limit — use raw.githubusercontent.com`);
        }
    }
}

for (const app of data.clients.apps) {
    for (const [platform, links] of Object.entries(app.downloads ?? {})) {
        for (const link of links ?? []) {
            if (new URL(link.url).hostname === 'apps.apple.com') continue;
            const response = await head(link.url);
            if (response && response.status >= 400) problems.push(`${app.id} ${platform} "${link.label}" (${link.url}): HTTP ${response.status}`);
        }
    }
}

if (problems.length) {
    console.error(`${problems.length} problem(s):\n${problems.map(p => `  - ${p}`).join('\n')}`);
    process.exit(1);
}
console.log('every link answers');
