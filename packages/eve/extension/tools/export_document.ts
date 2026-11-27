import { defineTool } from "eve/tools";
import { z } from "zod";

import { exportDocument, findDocument } from "../lib/documents";
import { documents } from "../lib/state";

export default defineTool({
  description:
    "Export a checked document as CSV (one row per line item, opens in Excel) or JSON (the full structure). " +
    "Refused while anything must still be fixed. Only call it when the person asks for the file.",
  inputSchema: z.object({
    documentId: z.string().describe("The documentId from read_document."),
    format: z.enum(["csv", "json"]).default("csv"),
  }),
  async execute({ documentId, format }) {
    return exportDocument(documentId, findDocument(documents.get(), documentId), format);
  },
});
