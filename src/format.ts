/**
 * How every JSON file here is written, so a diff shows what changed and
 * nothing else: two-space indent, and an array or object of plain values on
 * one line when it fits in `width` columns (`"platforms": ["ios", "macos"]`).
 * `bun run format` rewrites the files; CI fails on a file written otherwise.
 */
const isPlain = (value: unknown): boolean => value === null || ['string', 'number', 'boolean'].includes(typeof value);

export const formatJson = (value: unknown, width = 120): string => {
    const write = (node: unknown, indent: string, prefix: number): string => {
        if (isPlain(node)) return JSON.stringify(node);
        const inner = indent + '  ';
        if (Array.isArray(node)) {
            if (node.length === 0) return '[]';
            const flat = `[${node.map(item => write(item, inner, 0)).join(', ')}]`;
            if (!flat.includes('\n') && prefix + flat.length <= width && node.every(item => isPlain(item) || isSmall(item))) return flat;
            return `[\n${node.map(item => inner + write(item, inner, inner.length)).join(',\n')}\n${indent}]`;
        }
        const entries = Object.entries(node as Record<string, unknown>).filter(([, v]) => v !== undefined);
        if (entries.length === 0) return '{}';
        const flat = `{ ${entries.map(([k, v]) => `${JSON.stringify(k)}: ${write(v, inner, 0)}`).join(', ')} }`;
        if (!flat.includes('\n') && prefix + flat.length <= width && entries.every(([, v]) => isPlain(v) || isSmall(v))) return flat;
        return `{\n${entries.map(([k, v]) => {
            const head = `${inner}${JSON.stringify(k)}: `;
            return head + write(v, inner, head.length);
        }).join(',\n')}\n${indent}}`;
    };
    /** An array of plain values: allowed inside a one-line object. */
    const isSmall = (node: unknown): boolean => Array.isArray(node) && node.every(isPlain);
    return write(value, '', 0) + '\n';
};
