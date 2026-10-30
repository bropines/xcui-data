# xcui-data

The data the [Xray Config UI Editor](https://github.com/bropines/xray-config-ui-editor) reads, as plain JSON: which client app sends which User-Agent, what it can import, how a subscription page opens it, where to download it and its logo.

[Русский](README.ru.md)

## How it reaches the editor

- **Every change to `main`** that passes the checks is published to <https://bropines.github.io/xcui-data/data.json>. The editor downloads that file when it starts. A fix made here reaches every copy of the editor without a release of either.
- **Every version tag** (`v0.2.0`) attaches the package tarball to a GitHub Release. The editor installs it from there, and builds in the snapshot it carries. That snapshot is what the editor shows before the download arrives, or when it cannot reach Pages.
- The editor checks a downloaded copy against the same schema as CI. It takes the copy only when the copy is valid and no older than the snapshot it already has. A broken file on Pages cannot get past CI. Even if one did, the editor would keep what it had.

## Editing an app

Each app is one file: `clients/apps/<id>.json`. Edit it on GitHub (the pencil button) or locally. In VS Code the `$schema` line on top gives completion and checks as you type.

Every claim carries `src`: keys into the app's own `sources`, each saying where the fact was read (`{ "ref": "owner/repo@tag:path:lines", "kind": "source" }`). The kinds:

| kind | meaning |
| --- | --- |
| `source` | read in the app's code at the cited tag |
| `docs`, `release-notes` | the vendor says so |
| `remnawave` | Remnawave's own code or docs |
| `operator` | measured on a production panel (anonymised) |
| `third-party` | other projects' captures or tests |
| `inferred`, `unverified` | reasoned, not seen |

What else to know:

- **Regexes** (`uaPatterns[].regex`, `gates[].regex`) are written for a Remnawave Response Rule with *case sensitive* off. The panel lowercases the pattern too, so write them in lowercase and never use `\D \S \W \B`. Every pattern must match its own `example`.
- **`downloads`**: per platform (`ios`, `macos`, `tvos`, `android`, `androidtv`, `windows`, `linux`, `openwrt`), `https` only, and only links the vendor gives. Store pages are never guessed.
- **`brandIcon`**: the SVG-library key the logo is drawn under. That is Remnawave's default page config's own key (`Happ`, `Throne`…), or a file in `icons/` named `<key>.svg`.
- **`deepLinks[].template`**: `{URL}` is the raw subscription URL, `{URL_ENC}` its `encodeURIComponent`, `{NAME}` the display name, and `{B64:…}` base64 of what is inside.

### Adding an app

1. Create `clients/apps/<id>.json` (copy a similar app).
2. Add `<id>` to `clients/order.json` where the editor should list it.
3. Add a User-Agent the app really sends to `clients/samples.json`.
4. Add Russian words for its texts to `clients/i18n/ru.json` (CI names every missing one).

### Texts and translations

The data is written in English. `clients/i18n/ru.json` maps each English text to Russian. A text that is notation rather than words (`1|true`, `upload=; download=; total=; expire=`) goes in `clients/notation.json` instead and is shown as written. Edit a sentence, and its old translation stops matching: CI fails until the new sentence has its own.

## Checks

```bash
bun install
bun run check     # every file against the schema, in the repository's format
bun test          # sources cited, regexes, samples identified, translations complete
bun run format    # rewrite every JSON file in the repository's format
bun run build     # dist/ (package) and schema/client-app.schema.json
```

The checks list every problem at once, each with the file and the path inside it.

## Using it

```ts
import DATA from 'xcui-data/snapshot';          // the document this release was built from
import { parseData, type ClientApp } from 'xcui-data';

const response = await fetch('https://bropines.github.io/xcui-data/data.json');
const result = parseData(await response.json()); // { ok: true, data } | { ok: false, problems }
```

`zod` 4.4.3 is a peer dependency.

## License

MIT
