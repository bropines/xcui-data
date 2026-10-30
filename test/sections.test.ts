/**
 * The sections beside the client apps: the Response Rules blueprints, the
 * geo file sources and the subscription page's base texts — what CI holds
 * each to beyond its shape.
 */
import { describe, expect, it } from 'bun:test';
import { join } from 'node:path';
import { readSource, unknownKeys } from '../src/source';

const data = readSource(join(import.meta.dir, '..'), { built: '2026-01-01T00:00:00.000Z' });
const appIds = new Set(data.clients.apps.map(app => app.id));
const blueprints = data.rules.blueprints;

/**
 * What the blueprints with their default options answer a User-Agent, as
 * Remnawave's matcher would (3.4.7: a caseSensitive: false REGEX lowers the
 * value and the pattern, the first enabled match wins, Fallback is
 * XRAY_BASE64). Opt-in rules are generated disabled, so they never match.
 */
const answer = (ua: string): string => {
    for (const rule of blueprints) {
        if (rule.optional) continue;
        const conditions = rule.conditions ?? [{ headerName: 'user-agent', operator: 'REGEX' as const, value: rule.regex!, caseSensitive: false }];
        const matches = conditions.every(condition => {
            if (condition.headerName !== 'user-agent' || condition.operator !== 'REGEX') return false;
            const flags = condition.caseSensitive ? '' : 'i';
            const value = condition.caseSensitive ? ua : ua.toLowerCase();
            const pattern = condition.caseSensitive ? condition.value : condition.value.toLowerCase();
            return new RegExp(pattern, flags).test(value);
        });
        if (matches) return rule.type;
    }
    return 'XRAY_BASE64';
};

describe('Response Rules blueprints', () => {
    it('have unique keys and names', () => {
        expect(new Set(blueprints.map(b => b.key)).size).toBe(blueprints.length);
        expect(new Set(blueprints.map(b => b.name)).size).toBe(blueprints.length);
    });

    it('name only apps the data has, and every non-optional rule serves at least one', () => {
        expect(blueprints.flatMap(b => b.apps.filter(id => !appIds.has(id)).map(id => `${b.key}: ${id}`))).toEqual([]);
        expect(blueprints.filter(b => !b.optional && b.apps.length === 0).map(b => b.key)).toEqual([]);
    });

    it('write every regex so a case-insensitive rule means the same thing', () => {
        const regexes = blueprints.flatMap(b => [b.regex, ...(b.conditions ?? []).filter(c => c.operator.endsWith('REGEX') && !c.caseSensitive).map(c => c.value)]).filter((r): r is string => !!r);
        expect(regexes.filter(r => r !== r.toLowerCase() || /(?<!\\)(?:\\\\)*\\[DSWB]/.test(r))).toEqual([]);
    });

    it('give every User-Agent sample what the sample says', () => {
        const wrong = data.clients.samples.map(s => ({ ua: s.ua, expected: s.expected, got: answer(s.ua) })).filter(s => s.got !== s.expected);
        expect(wrong).toEqual([]);
    });

    it('have Russian words for every description, and no stale translation', () => {
        const ru = data.rules.i18n.ru ?? {};
        const descriptions = new Set(blueprints.map(b => b.description));
        expect([...descriptions].filter(d => !(d in ru))).toEqual([]);
        expect(Object.keys(ru).filter(d => !descriptions.has(d))).toEqual([]);
        expect(Object.entries(ru).filter(([en, said]) => said === en || !/[а-яё]/i.test(said)).map(([en]) => en)).toEqual([]);
    });
});

describe('geo sources', () => {
    const sources = data.geo.sources;

    it('have unique ids, and exactly one is the viewer\'s default', () => {
        expect(new Set(sources.map(s => s.id)).size).toBe(sources.length);
        expect(sources.filter(s => s.viewerDefault).length).toBe(1);
    });

    it('offer the real-core check only with both files', () => {
        expect(sources.filter(s => s.uses.includes('check') && !(s.files.geoip && s.files.geosite)).map(s => s.id)).toEqual([]);
    });

    it('keep every file under jsDelivr\'s 50 MB limit when it comes from jsDelivr', () => {
        const files = sources.flatMap(s => [s.files.geoip, s.files.geosite]).filter(f => !!f);
        expect(files.filter(f => f!.url.includes('cdn.jsdelivr.net') && f!.sizeMb >= 50).map(f => f!.url)).toEqual([]);
    });
});

describe('subscription page base texts', () => {
    it('have English and Russian for every key', () => {
        const texts = data.subpage.baseTexts;
        expect(Object.keys(texts).length).toBeGreaterThan(0);
        expect(Object.entries(texts).filter(([, text]) => !text.en || !text.ru).map(([key]) => key)).toEqual([]);
    });
});

describe('unknownKeys', () => {
    it('names a key the schema dropped, with its path', () => {
        expect(unknownKeys({ a: 1, b: { c: 2, typo: 3 }, list: [{ ok: 1, extra: 2 }] }, { a: 1, b: { c: 2 }, list: [{ ok: 1 }] }))
            .toEqual(['b.typo', 'list.0.extra']);
    });
});

describe('bypass lists', () => {
    const lists = data.bypass.lists;

    it('have unique ids and no entry in two lists', () => {
        expect(new Set(lists.map(l => l.id)).size).toBe(lists.length);
        const seen = new Map<string, string>();
        const twice: string[] = [];
        for (const list of lists) for (const entry of list.domains) {
            if (seen.has(entry)) twice.push(`${entry}: ${seen.get(entry)} and ${list.id}`);
            seen.set(entry, list.id);
        }
        expect(twice).toEqual([]);
    });

    it('have English and Russian words, and no repeated entry or earlier version', () => {
        for (const list of lists) {
            expect(list.label.ru && list.description.ru).toBeTruthy();
            expect(new Set(list.domains).size).toBe(list.domains.length);
            const versions = [list.domains, ...list.previous].map(v => JSON.stringify(v));
            expect(new Set(versions).size).toBe(versions.length);
        }
    });

    it('take only entries that name a site or a whole zone', async () => {
        const { BypassEntrySchema } = await import('../src/schema');
        const ok = (value: string) => BypassEntrySchema.safeParse(value).success;
        for (const good of ['domain:yandex.ru', 'full:checkip.amazonaws.com', 'domain:кц.рф', 'regexp:.+\\.ru$', 'regexp:.+\\.рф$']) expect([good, ok(good)]).toEqual([good, true]);
        for (const bad of ['keyword:ru', 'regexp:.*', 'regexp:.+ru$', 'regexp:^.*$', 'regexp:.+.ru$', 'domain:ru', 'domain:Yandex.ru', '1.1.1.1', 'geosite:ru', 'domain:yandex.ru ', 'full:*.ru', 'regexp:.+\\.ru']) expect([bad, ok(bad)]).toEqual([bad, false]);
    });
});
