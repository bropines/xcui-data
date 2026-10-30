/**
 * bun scripts/format.ts — rewrites every JSON file under clients/ in the
 * repository's format (src/format.ts). `bun run build -- --check` is what CI
 * runs to fail on a file written otherwise.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { formatJson } from '../src/format';

const root = join(import.meta.dir, '..');
let changed = 0;
const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) { walk(path); continue; }
        if (!entry.name.endsWith('.json')) continue;
        const text = readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
        let parsed: unknown;
        try { parsed = JSON.parse(text); } catch (error) {
            console.error(`${relative(root, path)}: ${(error as Error).message}`);
            process.exitCode = 1;
            continue;
        }
        const next = formatJson(parsed);
        if (next !== text) { writeFileSync(path, next); changed++; console.log(`formatted ${relative(root, path)}`); }
    }
};
for (const dir of ['clients', 'rules', 'geo', 'subpage']) walk(join(root, dir));
console.log(changed ? `${changed} file(s) rewritten` : 'every file already in format');
