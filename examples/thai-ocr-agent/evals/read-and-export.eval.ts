import { fileURLToPath } from "node:url";
import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";

// A synthetic receipt kept in the repository (bench/cases); its values are invented.
const receipt = fileURLToPath(new URL("../../../bench/cases/receipt-thai-clean.png", import.meta.url));

export default defineEval({
  async test(t) {
    const session = await t.session();
    const read = await session.sendFile("ช่วยอ่านใบเสร็จนี้ให้หน่อย", receipt, "image/png");
    read.expectOk();
    // The figures must come from the tool, not from the agent's own look at the photo.
    read.calledTool("ocr__read_document", { count: 1 });
    t.check(read.reply, includes(/185/));

    const exported = await read.session.send("ขอไฟล์ CSV");
    exported.expectOk();
    exported.calledTool("ocr__export_document");
    t.check(exported.reply, includes("ข้าวมันไก่ตัวอย่าง"));
    t.succeeded();
  },
});
