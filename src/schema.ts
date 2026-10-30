/**
 * The shape of everything in this repository, as zod: CI checks every file
 * against it, the editor checks what it downloads against it, and the JSON
 * Schema in schema/ (for completion in an editor) is generated from it.
 *
 * Client apps — one per file in clients/apps — say which User-Agent an app
 * sends, what it can import, what it does with the answer, where to download
 * it and how a page opens it. Every claim carries `src`: keys into the app's
 * own `sources`, each saying where the fact was read and how (`Evidence`). A
 * fact with no source is a guess, and the data marks it as one (`inferred` /
 * `unverified`) rather than leaving the reader to assume it was checked.
 *
 * Objects are not strict here, so an editor reading a newer document drops
 * a field it does not know instead of refusing the whole document; CI fails
 * on any key the schema does not name (source.ts, unknownKeys), so a typo
 * still cannot get in.
 *
 * Regexes are written for Remnawave Response Rules with `caseSensitive: false`:
 * the panel lowercases the PATTERN as well as the value and compiles with `i`
 * (remnawave/backend@3.4.7 src/modules/subscription-response-rules/services/
 * response-rules-matcher.service.ts:92-95,150-166), so they are all lowercase
 * and never use `\D \S \W \B`.
 */
import { z } from 'zod';

/** Remnawave's six subscription formats (template-type.constant.ts:1-10 at 3.4.7). */
export const TEMPLATE_TYPES = ['XRAY_JSON', 'XRAY_BASE64', 'MIHOMO', 'STASH', 'CLASH', 'SINGBOX'] as const;
/** Where a client app runs. `androidtv`/`tvos` are separate because their apps and versions differ. */
export const PLATFORMS = ['ios', 'macos', 'tvos', 'android', 'androidtv', 'windows', 'linux', 'openwrt'] as const;
export const CORE_KINDS = ['xray', 'sing-box', 'mihomo', 'clash-premium', 'clash-rs', 'v2ray5', 'amneziawg', 'proprietary'] as const;
/**
 * How a fact is known.
 * - `source`: read in the app's code at the cited tag;
 * - `docs` / `release-notes`: the vendor says so;
 * - `remnawave`: Remnawave's own code or docs;
 * - `operator`: measured on a production panel (private, anonymised);
 * - `third-party`: other projects' captures or tests;
 * - `inferred` / `unverified`: reasoned, not seen.
 */
export const EVIDENCE = ['source', 'docs', 'release-notes', 'remnawave', 'operator', 'third-party', 'inferred', 'unverified'] as const;
export const FAMILIES = ['xray', 'mihomo', 'stash', 'sing-box', 'other'] as const;

const text = z.string().min(1);
const src = z.array(text).min(1).describe('Keys into this app\'s `sources`: where the fact was read.');
const platform = z.enum(PLATFORMS);
const templateType = z.enum(TEMPLATE_TYPES);
const tri = z.union([z.literal(true), z.literal(false), z.literal('partial'), z.literal('unknown')]);
/** A JS RegExp source that compiles. */
const regex = text.refine(value => { try { new RegExp(value, 'i'); return true; } catch { return false; } }, 'not a valid regular expression');

export const SourceSchema = z.object({ ref: text, kind: z.enum(EVIDENCE) });

export const UaPatternSchema = z.object({
    platform: z.array(platform).optional(),
    minVersion: text.optional(),
    maxVersion: text.optional(),
    regex: regex.describe('Lowercase-safe: identifies the app; version gates are separate entries.'),
    example: text.describe('A real (or, with a note saying so, illustrative) User-Agent this pattern matches.'),
    note: text.optional(),
    src,
});

export const RequestHeaderSchema = z.object({
    name: text,
    value: text,
    when: z.enum(['always', 'default-on', 'default-off', 'opt-in', 'unknown']),
    src,
});

export const HeaderReadSchema = z.object({ name: text, format: text.optional(), since: text.optional(), note: text.optional(), src });

export const DeepLinkSchema = z.object({
    template: text.describe('`{URL}` raw subscription URL, `{URL_ENC}` encodeURIComponent(URL), `{NAME}` display name, `{B64:x}` base64 of x.'),
    platforms: z.array(platform).optional(),
    note: text.optional(),
    src,
});

export const CoreInfoSchema = z.object({ kind: z.enum(CORE_KINDS), version: text.optional(), note: text.optional(), src });

export const CapabilitiesSchema = z.object({
    balancer: tri, observatory: tri, routing: tri, xhttp: tri, reality: tri, vision: tri, vlessEncryption: tri,
    hysteria2: tri, tuic: tri, wireguard: tri, anytls: tri, masque: tri, finalmask: tri, tun: tri,
}).partial();

export const NoteSchema = z.object({ text, src });

/**
 * A format the app only takes from some version on. A request whose UA does
 * not match `regex` gets a body the app cannot read when it is answered with
 * `type`. `severity`: `error` when the app's own code shows it, `warning`
 * when only an operator has seen it.
 */
export const TypeGateSchema = z.object({
    type: templateType,
    minVersion: text,
    regex: regex.describe('Lowercase-safe; matches exactly the UAs of the versions that take `type`.'),
    severity: z.enum(['error', 'warning']),
    note: text,
    src,
});

/** A download link a subscription page's install step gets. Store pages are never guessed. */
export const DownloadLinkSchema = z.object({
    label: text,
    url: z.url({ protocol: /^https$/ }),
});

export const ClientAppSchema = z.object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'lowercase letters, digits and dashes; the file is clients/apps/<id>.json'),
    name: text,
    vendor: text.optional(),
    family: z.enum(FAMILIES),
    platforms: z.array(platform).min(1),
    openSource: z.boolean(),
    repo: text.optional(),
    /** The SVG-library key a page draws the app's logo under: Remnawave's default page config's own key, or a file in icons/. */
    brandIcon: text.optional(),
    /** Download links per platform, for a subscription page's install step. */
    downloads: z.partialRecord(platform, z.array(DownloadLinkSchema).min(1)).optional(),
    latest: z.array(z.object({
        version: text,
        /** YYYY-MM-DD, YYYY-MM, or empty when the release date is not known. */
        date: z.string(),
        platform: z.array(platform).optional(),
        channel: z.enum(['stable', 'pre']).optional(),
    })),
    cores: z.array(CoreInfoSchema),
    uaPatterns: z.array(UaPatternSchema),
    uaOverridable: z.enum(['no', 'global', 'per-subscription', 'global+per-subscription', 'provider-header', 'unknown']),
    requestHeaders: z.array(RequestHeaderSchema),
    /** Formats the app can import at all. */
    accepts: z.array(templateType).min(1),
    /** The one that serves it best, and why. */
    best: templateType,
    bestWhy: NoteSchema,
    gates: z.array(TypeGateSchema).optional(),
    capabilities: CapabilitiesSchema,
    capabilitiesSrc: z.array(text),
    headersRead: z.array(HeaderReadSchema),
    deepLinks: z.array(DeepLinkSchema),
    limits: z.array(NoteSchema),
    pitfalls: z.array(NoteSchema),
    sources: z.record(text, SourceSchema),
});

/** A file in clients/apps: an app, plus the `$schema` line that gives an editor completion. */
export const ClientAppFileSchema = ClientAppSchema.extend({ $schema: z.string().optional() });

/**
 * A User-Agent seen in the wild, the app that sends it, and what the
 * editor's recommended Response Rules give it (Remnawave's matcher at 3.4.7).
 * `note` says when part of it is illustrative rather than captured.
 */
export const UaSampleSchema = z.object({ ua: text, app: text, expected: templateType, note: text.optional() });

/** An SVG logo: one <svg> root and nothing that runs. */
export const SvgSchema = text
    .refine(value => /^\s*<svg[\s>]/i.test(value) && /<\/svg>\s*$/i.test(value), 'not a single <svg> element')
    .refine(value => !/<script|<foreignObject|\son[a-z]+\s*=|javascript:/i.test(value), 'contains something that runs');

// ─── Response Rules blueprints (rules/) ────────────────────────────────────

/** A Remnawave Response Rule condition (remnawave/backend@3.4.7 response-rules contract). */
export const RuleConditionSchema = z.object({
    headerName: text,
    operator: z.enum(['EQUALS', 'NOT_EQUALS', 'CONTAINS', 'NOT_CONTAINS', 'STARTS_WITH', 'NOT_STARTS_WITH', 'ENDS_WITH', 'NOT_ENDS_WITH', 'REGEX', 'NOT_REGEX']),
    value: text,
    caseSensitive: z.boolean(),
});

/**
 * One rule "Generate from KB" writes, in panel order (most specific first).
 * It is generated when at least one of `apps` is targeted; `optional` rules
 * are opt-in. `device` adds the phone host exclusion (and on iOS the
 * no-limit header).
 */
export const RuleBlueprintSchema = z.object({
    key: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
    name: text,
    description: text,
    apps: z.array(text),
    regex: regex.optional().describe('A user-agent REGEX with caseSensitive: false; lowercase-safe like every KB regex.'),
    conditions: z.array(RuleConditionSchema).min(1).optional(),
    type: templateType,
    device: z.enum(['ios', 'android']).optional(),
    optional: z.string().regex(/^[a-z0-9][a-z0-9-]*$/).optional().describe('The key of an opt-in switch; the rule is off unless it is turned on.'),
}).refine(rule => (rule.regex === undefined) !== (rule.conditions === undefined), 'exactly one of regex and conditions');

// ─── Geo files (geo/) ─────────────────────────────────────────────────────

/** Hosts a geo file may come from: each answers a page with Access-Control-Allow-Origin: *. */
export const GEO_HOSTS = ['cdn.jsdelivr.net', 'raw.githubusercontent.com'] as const;
const geoUrl = z.url({ protocol: /^https$/ }).refine(url => (GEO_HOSTS as readonly string[]).includes(new URL(url).hostname), `host must be one of ${GEO_HOSTS.join(', ')} (they send Access-Control-Allow-Origin: *)`);
export const GeoFileSchema = z.object({ url: geoUrl, sizeMb: z.number().positive() });

/**
 * Where a page gets geoip / geosite lists: the real-core check (`check`,
 * which needs both files) and the list viewer (`viewer`). jsDelivr refuses
 * files over 50 MB; take those from raw.githubusercontent.com.
 */
export const GeoSourceSchema = z.object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
    name: text,
    home: z.url({ protocol: /^https$/ }),
    note: text.optional(),
    files: z.object({ geoip: GeoFileSchema.optional(), geosite: GeoFileSchema.optional() }),
    uses: z.array(z.enum(['check', 'viewer'])).min(1),
    viewerDefault: z.boolean().optional(),
});

// ─── Subscription page (subpage/) ─────────────────────────────────────────

/** A text in each language it has; `en` is required, other locales start as a copy of it. */
export const LocalizedTextSchema = z.record(z.string().regex(/^[a-z]{2}$/), text).refine(value => 'en' in value, 'needs en');

/** The current format of the published document. A change the editor cannot read raises it. */
export const DATA_FORMAT = 1;

export const XcuiDataSchema = z.object({
    format: z.literal(DATA_FORMAT),
    /** When this document was built (ISO 8601): the editor takes a downloaded copy only when it is not older than its own. */
    built: z.iso.datetime(),
    /** A hash of the content, to tell two copies apart. */
    id: text,
    clients: z.object({
        apps: z.array(ClientAppSchema),
        samples: z.array(UaSampleSchema),
        /** KB texts that are notation (header syntax, literal values) and stay as written in every language. */
        notation: z.array(text),
        /** Translations of the KB's English texts, by language, keyed by the English. */
        i18n: z.record(text, z.record(text, text)),
    }),
    /** SVG logos by library key. */
    icons: z.record(text, SvgSchema),
    rules: z.object({
        blueprints: z.array(RuleBlueprintSchema),
        /** Translations of the blueprints' descriptions, by language, keyed by the English. */
        i18n: z.record(text, z.record(text, text)),
    }),
    geo: z.object({ sources: z.array(GeoSourceSchema) }),
    subpage: z.object({
        /** The page's base translation texts (keys are Remnawave's; the editor checks it knows each one). */
        baseTexts: z.record(text, LocalizedTextSchema),
    }),
});

export type TemplateType = (typeof TEMPLATE_TYPES)[number];
export type Platform = (typeof PLATFORMS)[number];
export type CoreKind = (typeof CORE_KINDS)[number];
export type Evidence = (typeof EVIDENCE)[number];
export type Tri = z.infer<typeof tri>;
export type Source = z.infer<typeof SourceSchema>;
export type UaPattern = z.infer<typeof UaPatternSchema>;
export type RequestHeader = z.infer<typeof RequestHeaderSchema>;
export type HeaderRead = z.infer<typeof HeaderReadSchema>;
export type DeepLink = z.infer<typeof DeepLinkSchema>;
export type CoreInfo = z.infer<typeof CoreInfoSchema>;
export type Capabilities = z.infer<typeof CapabilitiesSchema>;
export type Capability = keyof Capabilities;
export type Note = z.infer<typeof NoteSchema>;
export type TypeGate = z.infer<typeof TypeGateSchema>;
export type DownloadLink = z.infer<typeof DownloadLinkSchema>;
export type ClientApp = z.infer<typeof ClientAppSchema>;
export type UaSample = z.infer<typeof UaSampleSchema>;
export type RuleCondition = z.infer<typeof RuleConditionSchema>;
export type RuleBlueprint = z.infer<typeof RuleBlueprintSchema>;
export type GeoFile = z.infer<typeof GeoFileSchema>;
export type GeoSource = z.infer<typeof GeoSourceSchema>;
export type LocalizedText = z.infer<typeof LocalizedTextSchema>;
export type XcuiData = z.infer<typeof XcuiDataSchema>;
