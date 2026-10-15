# Model comparison

Runs the real extraction pipeline against several vision models through Vercel
AI Gateway and scores each result against ground truth you provide.

```bash
pnpm bench -- --dry-run     # plan + rough cost, no calls
pnpm bench                  # run (needs AI_GATEWAY_API_KEY in apps/web/.env.local)
pnpm bench -- --models google/gemini-2.5-flash,openai/gpt-4o-mini --runs 3
```

## Cases

Put each document in `bench/private/` (git-ignored, never commit real receipts):

```
bench/private/shop1.jpg
bench/private/shop1.expected.json
```

```jsonc
{
  "merchant": "ORCHID PHARMACY",            // substring match, case/punctuation ignored
  "date": null,                    // null = the model must NOT fill in a date
  "subtotal": [342, 319.6],        // number, list of acceptable numbers, or null
  "vat": 22.4,
  "total": 342,
  "lineItems": [{ "description": "290389 #LDCeraBRIntenMask", "amount": 19 }],
  "noQuantityOrUnitPrice": true    // receipt prints one price per line
}
```

Fields you leave out are not scored. Use synthetic documents for anything you
publish.

## Reading the table

- **accuracy**: share of field checks passed. **perfect**: runs with every check passed.
- **desc-sim**: similarity of item names to the printed text (OCR quality).
- **US¢/receipt**: reported tokens × Gateway list price.
- Run each model several times: output varies between runs of the same model.

Each call sends your image to that model's provider via AI Gateway and spends
credit (a few cents for the default list). Your Gateway budget still applies.
