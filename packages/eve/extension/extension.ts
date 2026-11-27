import { DEFAULT_MODEL } from "@eve-thai-ocr/extractor";
import { defineExtension } from "eve/extension";
import { z } from "zod";

import { DEFAULT_MAX_BYTES } from "./lib/documents";

export default defineExtension({
  config: z
    .object({
      /**
       * The vision model that reads the document, as "provider/model" on Vercel AI Gateway. It
       * uses the agent's AI Gateway credentials. This is separate from the agent's own model.
       */
      model: z.string().min(1).default(DEFAULT_MODEL),
      /** Largest size of all the photos of one document together, in bytes. */
      maxBytes: z.number().int().positive().default(DEFAULT_MAX_BYTES),
    })
    .default({ model: DEFAULT_MODEL, maxBytes: DEFAULT_MAX_BYTES }),
});
