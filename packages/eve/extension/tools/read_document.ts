import { defineTool } from "eve/tools";
import { z } from "zod";

import extension from "../extension";
import { ATTACHMENTS_DIR, addDocument, presentDocument, readDocument } from "../lib/documents";
import { documents } from "../lib/state";

export default defineTool({
  description:
    "Read a printed Thai receipt, tax invoice or bank transfer slip from attached photos into checked data. " +
    "Pass the path from each photo's `Attached file` label. Several photos of ONE long receipt go in one call, " +
    "top to bottom (up to 4); different receipts need one call each. Returns a documentId, the values read, " +
    "and what must be fixed or checked. Every figure you tell the person must come from this result.",
  inputSchema: z.object({
    paths: z
      .array(z.string().describe(`Attachment path under ${ATTACHMENTS_DIR}`))
      .min(1)
      .max(4)
      .describe("Photos of one document, in order from top to bottom."),
  }),
  async execute({ paths }, ctx) {
    const sandbox = await ctx.getSandbox();
    const receipt = await readDocument({
      paths,
      readFile: (path) => Promise.resolve(sandbox.readBinaryFile({ path, signal: ctx.abortSignal })),
      model: extension.config.model,
      maxBytes: extension.config.maxBytes,
      abortSignal: ctx.abortSignal,
    });
    const { store, id } = addDocument(documents.get(), receipt);
    documents.update(() => store);
    return presentDocument(id, receipt);
  },
});
