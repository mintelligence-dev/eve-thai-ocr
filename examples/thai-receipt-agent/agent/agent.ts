import { defineAgent } from "eve";

// The agent's own model talks with the person and calls the tools. eve shows it the
// attached photos too, so pick a vision-capable model. The figures still come from the
// extension's read_document tool, never from this model (see the extension's instructions).
export default defineAgent({
  model: process.env.AI_MODEL?.trim() || "google/gemini-2.5-flash",
});
