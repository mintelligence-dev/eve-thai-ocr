import receipt from "@eve-thai-receipt-extension/eve";

// Mounts the extension as "receipt": its tools become receipt__read_document,
// receipt__correct_document and receipt__export_document, and its instructions are added.
export default receipt({
  // Optional: the model that reads the document ("provider/model" on AI Gateway).
  model: process.env.RECEIPT_MODEL?.trim() || undefined,
});
