# Model comparison

Runs the real extraction pipeline against several vision models through Vercel
AI Gateway and scores each result against ground truth you provide.

```bash
pnpm bench -- --dry-run                       # plan + rough cost, no calls
pnpm bench                                    # run (needs AI_GATEWAY_API_KEY in examples/thai-ocr-agent/.env.local)
pnpm bench -- --models google/gemini-2.5-flash,openai/gpt-4.1-mini --runs 3
pnpm bench -- --only slip,tops                # only cases whose name contains one of these
pnpm bench -- --cases bench/cases             # only the synthetic cases in the repo
pnpm bench -- --concurrency 2                 # fewer parallel calls (the free AI Gateway tier rate-limits)
pnpm bench -- --thinking 0                    # Gemini thinking budget in tokens (0 = off); default is the library's 1024
```

## Cases

- `bench/cases/` holds **synthetic** documents kept in the repo (blank page, noise, a notes page that mentions money, a clean and a blurred Thai receipt). Regenerate them with `python3 bench/make-cases.py` (needs Pillow and a Thai font).
- A long receipt photographed in several parts is one case: name the files `NAME.1.jpg`, `NAME.2.jpg`, ... (in order, top to bottom) with one `NAME.expected.json`. Two photos that must be refused as different documents use `{ "different": true }` (refusing is a pass, merging them is a failure). `long-receipt`, `different-shops` and `different-days` in `bench/cases/` are examples.
- Put **your own** documents in `bench/private/` (git-ignored; never commit real receipts or slips):

```
bench/private/shop1.jpg
bench/private/shop1.expected.json
```

```jsonc
{
  "merchant": "ORCHID PHARMACY",            // substring match, case/punctuation ignored (the shop, or the payee on a slip)
  "payer": "SAMPLE PAYER",               // slips: the sender
  "recipientName": null,           // slips: the account holder's name when a shop name is shown too (null = must stay empty)
  "strictNames": true,             // merchant, payer and recipientName must match as WHOLE names (default: containing the expected text is enough, so extra text such as a bank name passes)
  "taxId": "5566778899006",        // the shop's tax ID (digits)
  "reference": "20261003114",      // a string, a list of acceptable ones, or null = none is printed
  "date": null,                    // null = the model must NOT fill in a date
  "subtotal": [342, 319.6],        // number, list of acceptable numbers, or null
  "vat": 22.4,
  "total": 342,
  "fee": 0,                        // slips
  "lineItems": [{ "description": "290389 #LDCeraBRIntenMask", "amount": 19 }],
  "noQuantityOrUnitPrice": true,   // the model must not invent quantity / unit price (values the app fills in itself are marked "assumed" and ignored)
  "empty": true,                   // not a receipt: nothing may be extracted
  "handwritten": true,             // handwritten: the document must be refused (counts as a pass)
  "different": true                // several photos that are NOT one document: they must be refused
}
```

Fields you leave out are not scored. Use synthetic documents for anything you
publish.

## Reading the table

- **accuracy**: share of field checks passed. **perfect**: runs with every check passed.
- **desc-sim**: similarity of item names to the printed text (OCR quality).
- **US¢/receipt**: reported tokens × Gateway list price.
- **invented**: runs on non-receipt images where the model still returned a shop, amounts or items (lower is better).
- A document that is wrongly refused as handwriting, or a call that fails, shows up as an error in the model's row.
- Run each model several times: output varies between runs of the same model.

Each call sends your image to that model's provider via AI Gateway and spends
credit (a few cents for the default list). Your Gateway budget still applies.

## Experiments

- [`experiments/`](experiments/README.md): does straightening or enhancing the photo before reading help? (Short answer: not enough yet to add a library; faded paper is the one clear gain.)
