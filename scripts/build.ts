/**
 * bun scripts/build.ts [--check] [--site <dir>]
 *
 * Reads every file (src/source.ts), and:
 *   - writes dist/data.json and dist/snapshot.js (+ .d.ts): the document
 *     this release ships, which the editor bundles;
 *   - writes schema/client-app.schema.json, the JSON Schema an editor uses
 *     for completion in clients/apps/*.json;
 *   - with --site <dir>: lays out the GitHub Pages site (data.json, the
 *     schema, a short index.html);
 *   - with --check: writes nothing, and fails when a JSON file is not in the
 *     repository's format or the committed JSON Schema is stale.
 * Any problem in the data fails the build with every problem listed.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { z } from 'zod';
import { formatJson } from '../src/format';
import { ClientAppFileSchema } from '../src/schema';
import { readSource, SourceError } from '../src/source';

const root = join(import.meta.dir, '..');
const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const siteAt = args.indexOf('--site');
const site = siteAt >= 0 ? args[siteAt + 1] : undefined;

const jsonSchema = () => formatJson({
    ...z.toJSONSchema(ClientAppFileSchema, { target: 'draft-2020-12', unrepresentable: 'any' }),
    title: 'A client app in xcui-data (clients/apps/<id>.json)',
});

/** Every JSON file a person edits. */
const sourceFiles = (): string[] => {
    const out: string[] = [];
    const walk = (dir: string) => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const path = join(dir, entry.name);
            if (entry.isDirectory()) walk(path);
            else if (entry.name.endsWith('.json')) out.push(path);
        }
    };
    for (const dir of ['clients', 'rules', 'geo', 'subpage', 'bypass']) walk(join(root, dir));
    return out.sort();
};

let data;
try {
    data = readSource(root);
} catch (error) {
    if (error instanceof SourceError) {
        console.error(error.message);
        process.exit(1);
    }
    throw error;
}

if (checkOnly) {
    const wrong: string[] = [];
    for (const file of sourceFiles()) {
        const text = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
        if (text !== formatJson(JSON.parse(text))) wrong.push(relative(root, file));
    }
    const schemaPath = join(root, 'schema', 'client-app.schema.json');
    let committed = '';
    try { committed = readFileSync(schemaPath, 'utf8').replace(/\r\n/g, '\n'); } catch { /* missing */ }
    if (committed !== jsonSchema()) wrong.push('schema/client-app.schema.json (run `bun run build`)');
    if (wrong.length) {
        console.error(`Not in the repository's format (run \`bun run format\`):\n${wrong.map(w => `  - ${w}`).join('\n')}`);
        process.exit(1);
    }
    console.log(`ok: ${data.clients.apps.length} apps, ${data.clients.samples.length} samples, ${Object.keys(data.icons).length} icons (${data.id})`);
    process.exit(0);
}

mkdirSync(join(root, 'schema'), { recursive: true });
writeFileSync(join(root, 'schema', 'client-app.schema.json'), jsonSchema());

const dist = join(root, 'dist');
mkdirSync(dist, { recursive: true });
writeFileSync(join(dist, 'data.json'), JSON.stringify(data));
writeFileSync(join(dist, 'snapshot.js'), `// Built ${data.built} from xcui-data (${data.id}).\nexport default ${JSON.stringify(data)};\n`);
writeFileSync(join(dist, 'snapshot.d.ts'), `import type { XcuiData } from './index.js';\n/** The document this release of xcui-data was built from. */\ndeclare const DATA: XcuiData;\nexport default DATA;\n`);

if (site) {
    mkdirSync(site, { recursive: true });
    writeFileSync(join(site, 'data.json'), JSON.stringify(data));
    writeFileSync(join(site, 'client-app.schema.json'), jsonSchema());
    writeFileSync(join(site, 'index.html'), `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>xcui-data</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:40rem;margin:3rem auto;padding:0 1rem;color:#18181b;background:#fff}@media(prefers-color-scheme:dark){body{color:#e4e4e7;background:#09090b}a{color:#93c5fd}}code{font-size:.9em}</style></head>
<body><h1>xcui-data</h1>
<p>The data the <a href="https://github.com/bropines/xray-config-ui-editor">Xray Config UI Editor</a> reads, published from <a href="https://github.com/bropines/xcui-data">bropines/xcui-data</a>.</p>
<ul><li><a href="data.json"><code>data.json</code></a> — ${data.clients.apps.length} client apps, ${data.clients.samples.length} User-Agent samples, ${Object.keys(data.icons).length} logos</li>
<li><a href="client-app.schema.json"><code>client-app.schema.json</code></a> — the JSON Schema of one app</li></ul>
<p>Built ${data.built} · <code>${data.id}</code></p></body></html>
`);
}

console.log(`built ${data.clients.apps.length} apps, ${data.clients.samples.length} samples, ${Object.keys(data.icons).length} icons (${data.id})${site ? ` and the site in ${site}` : ''}`);
