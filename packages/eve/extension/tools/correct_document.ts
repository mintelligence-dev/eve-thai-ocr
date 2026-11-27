import { defineTool } from "eve/tools";
import { z } from "zod";

import { CorrectionSchema, applyCorrection, findDocument, presentDocument, replaceDocument } from "../lib/documents";
import { documents } from "../lib/state";

export default defineTool({
  description:
    "Change values of a document read with read_document, after the person says what the paper shows. " +
    "Give only the fields that change, as the person typed them (amounts, dates and times are parsed by code; " +
    "do not convert or calculate them). Every check runs again; returns the document and what is still wrong.",
  inputSchema: CorrectionSchema.extend({
    documentId: z.string().describe("The documentId from read_document."),
  }),
  async execute({ documentId, ...correction }) {
    const store = documents.get();
    const receipt = applyCorrection(findDocument(store, documentId), correction);
    documents.update((current) => replaceDocument(current, documentId, receipt));
    return presentDocument(documentId, receipt);
  },
});
