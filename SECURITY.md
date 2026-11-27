# Security policy

## Reporting a vulnerability

Please do not open a public issue for a security problem.

Report it privately through GitHub: on the repository's **Security** tab choose **Report a vulnerability**
([direct link](https://github.com/mintelligence-dev/eve-thai-ocr/security/advisories/new)).
Only the maintainers see the report. Include what is affected, how to reproduce it and what an attacker could do with it.
**Never attach a real receipt or transfer slip**: they hold names, tax IDs and payment details. Use a synthetic document
(see `bench/make-cases.py`) or describe the layout.

We aim to reply within 5 working days, and will keep you informed until a fix is released.

## What is in scope

- **Documents and images.** Anything that stores or logs a document, or sends it somewhere other than the configured
  model provider. The same goes for anything that sends a slip's QR text to a service other than the one configured.
- **Text printed on a document** (prompt injection) that gets the model or the eve agent to do more than transcribe.
  Examples: values that are not on the document, data from another document, calling a tool, or getting past a check.
- **Personal data the model must not output:** customers' ID numbers, card numbers, phone numbers or bank account numbers.
- **The export lock.** Exporting from the web app or through `export_document` while an error flag remains, or a CSV
  cell that runs as a spreadsheet formula.
- **The web app's API routes.** Getting past the file-type checks or the size limits on `/api/extract`, or using
  `/api/verify-slip` to spend a host's verification quota beyond the configured limit.
- **The eve extension.** Reading a file outside eve's attachments folder, or seeing or changing another session's documents.

Supported versions are the `main` branch and, once published, the latest release of each package on npm.

## Known and by design

- **The demo has no login.** Its rate limits are kept in memory for each server instance, so they are a guard against
  casual abuse, not a hard cap. See "Protect your demo" in the README.
- **The model provider receives the image.** On the eve path it receives it twice: the agent's model sees the
  attachment, and so does the reading model. There, the photo is not shrunk or stripped of EXIF data first.
- **A bank check sends the slip's QR text** (the bank code and transaction reference) to the verification service
  you set up. It keeps the names that service returns, and they appear in the export.
- **Nothing here proves a slip or receipt is genuine.** A bank check compares only the fields the bank reports.

## If you host your own copy

- Set an **AI Gateway budget** on the key, and add a **Vercel Firewall rate-limit rule** for `/api/extract`.
- Keep keys (`AI_GATEWAY_API_KEY`, `SLIP_VERIFY_API_KEY`) in environment variables, never in the repository.
- Leave `SLIP_VERIFY_CACHE_DIR` unset in production: it stores bank answers, names included, on disk.
- Tell the people whose documents you read what happens to them, and get consent where the law requires it (PDPA).
