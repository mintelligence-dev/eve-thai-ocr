# @eve-thai-receipt-extension/extractor

Read **printed** Thai receipts, tax invoices and bank transfer slips into checked, editable data. A vision model (any `provider/model` on [Vercel AI Gateway](https://vercel.com/docs/ai-gateway)) only transcribes the text. Deterministic code then parses Thai digits, Buddhist Era dates and amounts (in integer satang), runs the checks, and exports JSON or CSV. A person reviews the result before it is used.

```ts
import { extractReceipt, DifferentDocumentsError, HandwritingNotSupportedError, toCSV } from "@eve-thai-receipt-extension/extractor";

try {
  const { receipt } = await extractReceipt({
    image: bytes,                     // Uint8Array of a JPEG, PNG or WebP
    mediaType: "image/jpeg",
    model: "google/gemini-2.5-flash", // any vision model on AI Gateway
    // A long receipt in up to 4 photos, top to bottom, instead of `image`:
    // images: [{ image: top, mediaType: "image/jpeg" }, { image: bottom, mediaType: "image/jpeg" }],
  });
  receipt.flags;                      // what a person should check (error = must fix, warning = please confirm)
  toCSV(receipt);
} catch (e) {
  if (e instanceof HandwritingNotSupportedError) { /* ask for a printed document */ }
  if (e instanceof DifferentDocumentsError) { /* the photos are not one receipt */ }
}
```

Browser-safe helpers with no model code (`normalizeExtraction`, `revalidate`, `toJSON`, `toCSV`, `sniffImageType` and the Thai parsers) are at `@eve-thai-receipt-extension/extractor/core`.

It needs Node 22 or newer and AI Gateway credentials (`AI_GATEWAY_API_KEY`, or Vercel OIDC). The extractor does not store images. Results can hold personal data (names, tax IDs), so treat exports accordingly. To use it in an [eve](https://eve.dev) agent, see [`@eve-thai-receipt-extension/eve`](https://www.npmjs.com/package/@eve-thai-receipt-extension/eve).

Docs, checks and privacy notes: [repository README](https://github.com/mintelligence-dev/eve-thai-receipt-extension#readme). Report security issues through [GitHub private vulnerability reporting](https://github.com/mintelligence-dev/eve-thai-receipt-extension/security/advisories/new), not in a public issue.

[MIT](LICENSE)
