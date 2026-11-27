# Contributing

Thanks for helping. Issues and pull requests are welcome in English or Thai.

## Before you start

- **A bug or a small fix:** open a pull request directly.
- **A new feature or a change in behaviour:** open an issue first, so we can agree on the shape before you write it.
- **A security problem:** do not open an issue. See [SECURITY.md](SECURITY.md).

## What this project will not accept

The rules below are the point of the project. A change that weakens one will be declined, however useful it is otherwise.

- The model only transcribes. Code parses and checks every digit, date and amount; no figure comes from the
  model's arithmetic or from an eve agent reading the photo itself.
- A value that can't be read clearly is left empty and flagged. It is never guessed.
- A person reviews the result. Nothing is exported while an error flag remains.
- Documents are not stored, and nothing from a document is logged.
- Only printed documents are read. Handwritten ones are refused.
- Test and sample data are invented. Never commit a real receipt or slip, or values copied from one. Put your own
  documents in `bench/private/`, which git ignores.

## Set up

Needs Node 24 or newer and pnpm 10 (`corepack enable`, or run `npx pnpm@10.28.1` in place of `pnpm`).

```bash
git clone https://github.com/mintelligence-dev/eve-thai-receipt-extension.git
cd eve-thai-receipt-extension
pnpm install
pnpm build:eve
pnpm test
```

The repository is a pnpm workspace:

| Folder | What it is |
|---|---|
| `packages/extractor` | `@eve-thai-receipt-extension/extractor`: the model call, parsing, checks, export and scoring. `./core` is the browser-safe part. |
| `packages/eve` | `@eve-thai-receipt-extension/eve`: the eve extension (read, correct and export a document attached in a chat). |
| `examples/thai-receipt-agent` | The example app, one Next.js project: the web demo (upload, review, export, the optional bank check) and an eve agent that mounts the extension, with an eval. |
| `bench` | Compare models against documents with known values. |

Run the web demo and the agent with `pnpm dev`, or the agent alone in the eve terminal UI with `pnpm dev:agent`. Both need AI Gateway credentials; see the README.

## Before you open a pull request

```bash
pnpm build:eve
pnpm typecheck
pnpm test
```

- Add or update a test for any change to parsing, checks, export or the eve tools.
- If you change how a document is read, run `pnpm bench` on the synthetic cases (`--cases bench/cases`) and say
  in the pull request what changed.
- If you change how something behaves, update the README. `README.md` (English) and `README.th.md` (Thai) mirror each
  other section by section: update both, or say in the pull request that the Thai text needs doing.
- Say in the pull request what you tested and what you could not test.
- Never commit keys, `.env.local` or anything from `bench/private/`.

## Style

- Code, comments, commit messages and pull requests are in English.
- Text people see in the web app is in Thai and English (`examples/thai-receipt-agent/lib/i18n.ts`).
- Commit subjects are plain sentences that say what changes for the person using it, for example
  "Warn when the VAT is larger than the total". The body says why.
- Amounts are kept in integer satang while they are worked on, never as floating-point baht.

## Releases

Maintainers publish to npm with **pnpm**, not npm: `@eve-thai-receipt-extension/eve` depends on the extractor as
`workspace:*`, and `pnpm publish` writes the exact version into the published package, while `npm publish` would ship
the `workspace:` range as it is. Publish the extractor first:

```bash
pnpm --filter @eve-thai-receipt-extension/extractor publish
pnpm --filter @eve-thai-receipt-extension/eve publish
```

Each package builds itself before publishing (`prepublishOnly`). Then tag the commit `v<version>` and create a GitHub
Release. Versions follow [Semantic Versioning](https://semver.org); while they are below 1.0, a minor version may
change behaviour. The eve package pins the exact extractor version it was tested with.

## Conduct

Everyone taking part is expected to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
