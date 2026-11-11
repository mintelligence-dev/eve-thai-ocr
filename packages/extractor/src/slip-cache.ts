import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { BankSlipSchema } from "./schema.js";
import type { SlipVerifier } from "./slip-verify.js";

/**
 * For development and testing only: keep the bank's answer for a slip in a folder, and give
 * that answer again next time instead of asking the service, so trying the app out does
 * not spend the service's quota. Turned on by SLIP_VERIFY_CACHE_DIR (see slipVerifierFromEnv).
 *
 * Only a confirmed transfer is kept ("verified"). A transfer that is confirmed stays confirmed,
 * but "not found", "pending" and "could not answer" can change within minutes, so those are
 * asked again every time. The file holds the figures and the two names the bank gave, so keep
 * the folder out of version control; the QR text itself is not stored, only a hash of it.
 */
export function cachedVerifier(inner: SlipVerifier, dir: string): SlipVerifier {
  return {
    name: inner.name,
    async verify(request) {
      const key = createHash("sha256").update(`${inner.name}\n${request.payload}`).digest("hex").slice(0, 32);
      const file = join(dir, `${key}.json`);

      try {
        const saved = JSON.parse(await readFile(file, "utf-8")) as { check?: { status?: string; bank?: unknown } };
        const bank = BankSlipSchema.safeParse(saved.check?.bank);
        if (saved.check?.status === "verified" && bank.success) return { status: "verified", bank: bank.data };
      } catch {
        // no file, or one that is not readable: ask the service
      }

      const check = await inner.verify(request);
      if (check.status === "verified") {
        try {
          await mkdir(dir, { recursive: true });
          await writeFile(file, JSON.stringify({ provider: inner.name, savedAt: new Date().toISOString(), check }, null, 2) + "\n");
        } catch {
          // a folder that cannot be written to only means no saving
        }
      }
      return check;
    },
  };
}
