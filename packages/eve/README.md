# @eve-thai-ocr/eve

[eve](https://www.npmjs.com/package/eve) extension that reads **printed** Thai receipts, tax invoices and bank transfer slips from photos attached in a chat, lets the person correct the result in their own words, and exports CSV or JSON. The reading, parsing and checks are [`@eve-thai-ocr/extractor`](../extractor), the same code as the web app in this repository.

```ts
// agent/extensions/ocr.ts
import ocr from "@eve-thai-ocr/eve";

export default ocr({
  model: "google/gemini-2.5-flash", // optional: the model that reads documents, via AI Gateway
  maxBytes: 10 * 1024 * 1024,       // optional: all photos of one document together
});
```

Tools (prefixed with the mount name, e.g. `ocr__read_document`):

- `read_document`: one document from up to 4 attached photos (JPEG, PNG, WebP), in order from top to bottom. PDF and HEIC are refused with what to send instead.
- `correct_document`: changes as the person typed them; amounts, dates and times are parsed by code and every check runs again.
- `export_document`: CSV or JSON, refused while anything must still be fixed.

Not in this version: reading PDFs and checking a slip with the bank. See the [repository README](https://github.com/mintelligence-dev/eve-thai-ocr#use-with-eve) for privacy notes: photos are not shrunk or stripped of EXIF data, and the image reaches both the agent's model and the reading model.

Report security issues through [GitHub private vulnerability reporting](https://github.com/mintelligence-dev/eve-thai-ocr/security/advisories/new), not in a public issue.

[MIT](LICENSE)
