/**
 * bun scripts/check-history.ts — a bypass list may change, but never by
 * forgetting what it was.
 *
 * A config or template written with a list is recognised later only when it
 * holds a whole version of it (the editor's splitBypassDomains and the
 * template parsers). So, against the document published on Pages:
 *   - a list whose `domains` changed must have the published `domains` as its
 *     newest `previous` entry;
 *   - every published `previous` version is still there, in order;
 *   - no published list is gone.
 * The first publish (nothing on Pages yet) passes. Run by CI and by the Pages
 * workflow before it publishes.
 */
import { join } from 'node:path';
import { readSource } from '../src/source';

const PUBLISHED = process.env.XCUI_DATA_PUBLISHED ?? 'https://bropines.github.io/xcui-data/data.json';
const data = readSource(join(import.meta.dir, '..'));

let published: { bypass?: { lists?: { id: string; domains: string[]; previous: string[][] }[] } } | null = null;
try {
    const response = await fetch(PUBLISHED, { cache: 'no-store' });
    if (response.ok) published = await response.json();
    else if (response.status !== 404) throw new Error(`HTTP ${response.status}`);
} catch (error) {
    console.error(`Could not read the published document (${PUBLISHED}): ${(error as Error).message}`);
    process.exit(1);
}

const before = published?.bypass?.lists ?? [];
if (!before.length) {
    console.log('nothing published to compare with');
    process.exit(0);
}

const same = (a: string[], b: string[] | undefined) => !!b && a.length === b.length && a.every((v, i) => v === b[i]);
const problems: string[] = [];
for (const old of before) {
    const now = data.bypass.lists.find(list => list.id === old.id);
    if (!now) { problems.push(`bypass list "${old.id}" is gone: configs built with it would show it switched off. Keep it.`); continue; }
    const expectedPrevious = same(now.domains, old.domains) ? old.previous : [old.domains, ...old.previous];
    const kept = expectedPrevious.every((version, i) => same(version, now.previous[i]));
    if (!kept) {
        problems.push(same(now.domains, old.domains)
            ? `bypass list "${old.id}": "previous" lost or reordered a published version.`
            : `bypass list "${old.id}" changed: put the published list first in "previous" (newest first), keeping the older ones after it.`);
    }
}
if (problems.length) {
    console.error(`${problems.length} problem(s):\n${problems.map(p => `  - ${p}`).join('\n')}`);
    process.exit(1);
}
console.log('every bypass list keeps its published versions');
