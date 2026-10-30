/**
 * xcui-data: the data the Xray Config UI Editor reads, as one checked
 * document. This entry point holds the schema, the types and `parseData`
 * (for a copy downloaded at run time); the copy built from this release is
 * `xcui-data/snapshot`, and the same document is published at
 * https://bropines.github.io/xcui-data/data.json on every change to main.
 */
import { DATA_FORMAT, XcuiDataSchema, type XcuiData } from './schema.js';

export * from './schema.js';

export type ParseResult = { ok: true; data: XcuiData } | { ok: false; problems: string[] };

/**
 * A document from anywhere — a download, a cache — checked against the
 * schema. A document of another `format` is refused before anything else is
 * read: its shape may have changed in ways this version cannot tell.
 */
export const parseData = (value: unknown): ParseResult => {
    const format = (value as { format?: unknown } | null)?.format;
    if (format !== DATA_FORMAT) return { ok: false, problems: [`format ${String(format)}, this version reads ${DATA_FORMAT}`] };
    const result = XcuiDataSchema.safeParse(value);
    if (result.success) return { ok: true, data: result.data };
    return { ok: false, problems: result.error.issues.slice(0, 20).map(issue => `${issue.path.join('.') || '(root)'}: ${issue.message}`) };
};
