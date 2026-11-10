// Browser-safe entry: everything except the model call (no `ai` import).
export * from "./schema.js";
export * from "./thai.js";
export * from "./validate.js";
export { normalizeExtraction, revalidate } from "./normalize.js";
export { toJSON, toCSV } from "./export.js";
export { SAMPLES } from "./samples.js";
export * from "./score.js";
export { isDiscountLabel } from "./discount.js";
export { isValidThaiTaxId, taxIdDigits } from "./taxid.js";
export { findImageConflicts, type ImageConflict, type ImageFact } from "./images.js";
export { parseSlipQr, crc16CcittFalse, verificationFlags, bangkokDay, type SlipQr } from "./slip.js";
export type { SlipCheck } from "./slip-verify.js";
