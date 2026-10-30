/**
 * What CI holds the client apps to beyond their shape (src/schema.ts): that
 * every claim cites a source the app has, that the regexes mean the same in
 * a case-insensitive Remnawave rule, that every pattern matches its own
 * example and every sample is named for the right app, and that every text
 * a person reads has Russian words or is notation — and no translation
 * outlives its text.
 */
import { describe, expect, it } from 'bun:test';
import { join } from 'node:path';
import { readSource } from '../src/source';
import type { ClientApp, UaPattern } from '../src/schema';

const data = readSource(join(import.meta.dir, '..'), { built: '2026-01-01T00:00:00.000Z' });
const apps = data.clients.apps;
const byId = new Map(apps.map(app => [app.id, app]));

/** Compiled the way a `caseSensitive: false` rule compiles: lowered, with `i`. */
const kbRegex = (source: string) => new RegExp(source.toLowerCase(), 'i');
/** An exact pattern outranks a prefix; past that, the longer source wins (the editor's identifyApp). */
const specificity = (pattern: UaPattern) => pattern.regex.length + (pattern.regex.endsWith('$') ? 1000 : 0);
const identify = (ua: string): string | undefined => {
    const lowered = ua.toLowerCase();
    const matches = apps.flatMap(app => {
        const hits = app.uaPatterns.filter(p => kbRegex(p.regex).test(lowered)).sort((a, b) => specificity(b) - specificity(a));
        return hits.length ? [{ app: app.id, score: specificity(hits[0]!) }] : [];
    });
    return matches.sort((a, b) => b.score - a.score)[0]?.app;
};

/** Every text the editor shows to people, as the editor's kb-prose.ts lists it. */
const saysMore = (value: string | undefined): value is string => !!value && /\s/.test(value.trim());
const prose = (app: ClientApp): string[] => {
    const out: (string | undefined)[] = [app.bestWhy.text];
    for (const gate of app.gates ?? []) out.push(gate.note);
    for (const link of app.deepLinks) out.push(link.note);
    for (const note of [...app.limits, ...app.pitfalls]) out.push(note.text);
    for (const core of app.cores) { out.push(core.note); if (saysMore(core.version)) out.push(core.version); }
    for (const release of app.latest) if (saysMore(release.version)) out.push(release.version);
    for (const pattern of app.uaPatterns) out.push(pattern.note);
    for (const read of app.headersRead) out.push(read.format, read.note);
    for (const header of app.requestHeaders) out.push(header.value);
    if (saysMore(app.repo)) out.push(app.repo);
    return out.filter((text): text is string => !!text);
};

describe('client apps', () => {
    it('cite a source they have for every claim', () => {
        const missing: string[] = [];
        for (const app of apps) {
            const cited = [
                ...app.cores, ...app.uaPatterns, ...app.requestHeaders, ...app.headersRead, ...app.deepLinks,
                ...app.limits, ...app.pitfalls, ...(app.gates ?? []), app.bestWhy,
            ].flatMap(entry => entry.src);
            for (const key of [...cited, ...app.capabilitiesSrc]) if (!(key in app.sources)) missing.push(`${app.id}: ${key}`);
        }
        expect(missing).toEqual([]);
    });

    it('accept their own best format and every gated one', () => {
        for (const app of apps) {
            expect(app.accepts, app.id).toContain(app.best);
            for (const gate of app.gates ?? []) expect(app.accepts, app.id).toContain(gate.type);
        }
    });

    it('write every regex so a case-insensitive rule means the same thing', () => {
        const bad: string[] = [];
        for (const app of apps) {
            for (const pattern of [...app.uaPatterns, ...(app.gates ?? [])]) {
                if (pattern.regex !== pattern.regex.toLowerCase()) bad.push(`${app.id}: ${pattern.regex} has capitals`);
                if (/(?<!\\)(?:\\\\)*\\[DSWB]/.test(pattern.regex)) bad.push(`${app.id}: ${pattern.regex} uses \\D \\S \\W or \\B, which mean something else once lowered`);
            }
        }
        expect(bad).toEqual([]);
    });

    it('match every pattern against its own example', () => {
        const bad = apps.flatMap(app => app.uaPatterns.filter(p => !kbRegex(p.regex).test(p.example)).map(p => `${app.id}: ${p.regex} does not match ${p.example}`));
        expect(bad).toEqual([]);
    });

    it('list downloads only for platforms they run on', () => {
        const bad = apps.flatMap(app => Object.keys(app.downloads ?? {}).filter(p => !app.platforms.includes(p as never)).map(p => `${app.id}: downloads for ${p}, which is not in platforms`));
        expect(bad).toEqual([]);
    });

    it('name a deep link for one of their own platforms', () => {
        const bad = apps.flatMap(app => app.deepLinks.flatMap(link => (link.platforms ?? []).filter(p => !app.platforms.includes(p)).map(p => `${app.id}: ${link.template} for ${p}`)));
        expect(bad).toEqual([]);
    });
});

describe('User-Agent samples', () => {
    it('name an app the data has', () => {
        expect(data.clients.samples.filter(s => !byId.has(s.app)).map(s => s.app)).toEqual([]);
    });

    it('are each identified as the app they name', () => {
        const wrong = data.clients.samples.map(s => ({ ua: s.ua, app: s.app, got: identify(s.ua) })).filter(s => s.got !== s.app);
        expect(wrong).toEqual([]);
    });
});

describe('texts', () => {
    const texts = [...new Set(apps.flatMap(prose))].sort();
    const notation = new Set(data.clients.notation);
    const ru = data.clients.i18n.ru ?? {};

    it('every text has Russian words or is notation', () => {
        // Printed as the lines to add to clients/i18n/ru.json.
        const missing = texts.filter(text => !notation.has(text) && !(text in ru)).map(text => `${JSON.stringify(text)}: "…"`);
        expect(missing).toEqual([]);
    });

    it('no translation or notation entry outlives its text', () => {
        const current = new Set(texts);
        expect(Object.keys(ru).filter(text => !current.has(text))).toEqual([]);
        expect([...notation].filter(text => !current.has(text))).toEqual([]);
    });

    it('a text is translated or notation, not both, and a translation reads in Russian', () => {
        expect(Object.keys(ru).filter(text => notation.has(text))).toEqual([]);
        expect(Object.entries(ru).filter(([en, said]) => said === en || !/[а-яё]/i.test(said)).map(([en]) => en)).toEqual([]);
    });
});

describe('icons', () => {
    it('every logo an app names in icons/ is one some app uses', () => {
        const used = new Set(apps.map(app => app.brandIcon).filter(Boolean));
        expect(Object.keys(data.icons).filter(key => !used.has(key))).toEqual([]);
    });
});
