import ocr from "@eve-thai-ocr/eve";

// Mounts the extension as "ocr": its tools become ocr__read_document,
// ocr__correct_document and ocr__export_document, and its instructions are added.
export default ocr({
  // Optional: the model that reads the document ("provider/model" on AI Gateway).
  model: process.env.RECEIPT_MODEL?.trim() || undefined,
});
