/**
 * Reads this repository's files into the published document. Bun/Node only
 * (it reads the file system); the editor gets the result, never this.
 *
 * Layout:
 *   clients/order.json        app ids, in the order the editor lists them
 *   clients/apps/<id>.json    one app each
 *   clients/samples.json      User-Agents seen in the wild
 *   clients/notation.json     KB texts that are notation, never translated
 *   clients/i18n/<lang>.json  translations of the KB's English texts
 *   icons/<Key>.svg           logos, by SVG-library key
 *   rules/blueprints.json     the Response Rules "Generate from KB" writes, in panel order
 *   rules/i18n/<lang>.json    translations of their descriptions
 *   geo/sources.json          where a page gets geoip / geosite lists
 *   subpage/base-texts.json   a subscription page's base translation texts
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import {
    ClientAppFileSchema, DATA_FORMAT, GeoSourceSchema, LocalizedTextSchema, RuleBlueprintSchema, UaSampleSchema, XcuiDataSchema,
    type ClientApp, type XcuiData,
} from './schema';

export class SourceError extends Error {
    constructor(readonly problems: string[]) {
        super(`${problems.length} problem(s):\n${problems.map(p => `  - ${p}`).join('\n')}`);
    }
}

const readJson = (path: string, problems: string[]): unknown => {
    try {
        return JSON.parse(readFileSync(path, 'utf8'));
    } catch (error) {
        problems.push(`${path}: ${(error as Error).message}`);
        return undefined;
    }
};

const zodProblems = (file: string, error: z.ZodError): string[] =>
    error.issues.map(issue => `${file}${issue.path.length ? ` at ${issue.path.join('.')}` : ''}: ${issue.message}`);

const isPlainObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

/**
 * Keys in `raw` that the schema dropped (they are not in `parsed`). The
 * schema strips unknown keys so an older editor can read a newer document;
 * here, in the repository, a key the schema does not name is a typo.
 */
export const unknownKeys = (raw: unknown, parsed: unknown, path: string[] = []): string[] => {
    if (Array.isArray(raw) && Array.isArray(parsed)) return raw.flatMap((item, i) => unknownKeys(item, parsed[i], [...path, String(i)]));
    if (!isPlainObject(raw) || !isPlainObject(parsed)) return [];
    return Object.keys(raw).flatMap(key => (key in parsed
        ? unknownKeys(raw[key], parsed[key], [...path, key])
        : [[...path, key].join('.')]));
};

/** Parse `value` with `schema`, or record why not; a key the schema does not name is a problem too. */
const check = <T>(file: string, schema: z.ZodType<T>, value: unknown, problems: string[]): T | undefined => {
    const result = schema.safeParse(value);
    if (!result.success) {
        problems.push(...zodProblems(file, result.error));
        return undefined;
    }
    for (const key of unknownKeys(value, result.data)) problems.push(`${file} at ${key}: not a field the schema knows (a typo?)`);
    return result.data;
};

const readDict = (dir: string, label: string, problems: string[]): Record<string, Record<string, string>> => {
    const out: Record<string, Record<string, string>> = {};
    for (const name of readdirSync(dir).filter(n => n.endsWith('.json')).sort()) {
        const dict = check(`${label}/${name}`, z.record(z.string(), z.string()), readJson(join(dir, name), problems), problems);
        if (dict) out[name.replace(/\.json$/, '')] = dict;
    }
    return out;
};

export interface ReadOptions {
    /** The build time to stamp; tests pass a fixed one. */
    built?: string;
}

/** Every file of the repository at `root`, checked and assembled. Throws `SourceError` with every problem found. */
export const readSource = (root: string, options: ReadOptions = {}): XcuiData => {
    const problems: string[] = [];
    const clients = join(root, 'clients');

    const order = check('clients/order.json', z.array(z.string()), readJson(join(clients, 'order.json'), problems), problems) ?? [];
    const files = readdirSync(join(clients, 'apps')).filter(name => name.endsWith('.json')).sort();
    const apps = new Map<string, ClientApp>();
    for (const name of files) {
        const file = `clients/apps/${name}`;
        const parsed = check(file, ClientAppFileSchema, readJson(join(clients, 'apps', name), problems), problems);
        if (!parsed) continue;
        const { $schema: _schema, ...app } = parsed;
        if (`${app.id}.json` !== name) problems.push(`${file}: id is "${app.id}", so the file must be clients/apps/${app.id}.json`);
        apps.set(app.id, app);
    }
    for (const id of order) if (!files.includes(`${id}.json`)) problems.push(`clients/order.json: "${id}" has no file clients/apps/${id}.json`);
    for (const name of files) {
        const id = name.replace(/\.json$/, '');
        if (!order.includes(id)) problems.push(`clients/order.json: add "${id}" (clients/apps/${name} is not listed)`);
    }
    if (new Set(order).size !== order.length) problems.push('clients/order.json: an id is listed twice');

    const samples = check('clients/samples.json', z.array(UaSampleSchema), readJson(join(clients, 'samples.json'), problems), problems) ?? [];
    const notation = check('clients/notation.json', z.array(z.string()), readJson(join(clients, 'notation.json'), problems), problems) ?? [];
    const i18n = readDict(join(clients, 'i18n'), 'clients/i18n', problems);
    const icons: Record<string, string> = {};
    for (const name of readdirSync(join(root, 'icons')).filter(n => n.endsWith('.svg')).sort()) {
        icons[name.replace(/\.svg$/, '')] = readFileSync(join(root, 'icons', name), 'utf8').trim();
    }

    const blueprints = check('rules/blueprints.json', z.array(RuleBlueprintSchema), readJson(join(root, 'rules', 'blueprints.json'), problems), problems) ?? [];
    const rulesI18n = readDict(join(root, 'rules', 'i18n'), 'rules/i18n', problems);
    const geoSources = check('geo/sources.json', z.array(GeoSourceSchema), readJson(join(root, 'geo', 'sources.json'), problems), problems) ?? [];
    const baseTexts = check('subpage/base-texts.json', z.record(z.string(), LocalizedTextSchema), readJson(join(root, 'subpage', 'base-texts.json'), problems), problems) ?? {};

    const content = {
        clients: { apps: order.flatMap(id => (apps.has(id) ? [apps.get(id)!] : [])), samples, notation, i18n },
        icons,
        rules: { blueprints, i18n: rulesI18n },
        geo: { sources: geoSources },
        subpage: { baseTexts },
    };
    const id = createHash('sha256').update(JSON.stringify(content)).digest('hex').slice(0, 16);
    const data = check('the assembled document', XcuiDataSchema, {
        format: DATA_FORMAT,
        built: options.built ?? new Date().toISOString(),
        id,
        ...content,
    }, problems);
    if (problems.length || !data) throw new SourceError(problems);
    return data;
};
