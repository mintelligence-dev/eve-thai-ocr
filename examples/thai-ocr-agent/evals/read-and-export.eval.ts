import { resolve } from "node:path";
import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";

// A synthetic receipt kept in the repository (bench/cases); its values are invented. eve bundles
// eval files before running them, so the path is taken from the agent folder `eve eval` runs in.
const receipt = resolve(process.cwd(), "../../bench/cases/receipt-thai-clean.png");

export default defineEval({
  async test(t) {
    const session = await t.session();
    const read = await session.sendFile("ช่วยอ่านใบเสร็จนี้ให้หน่อย", receipt, "image/png");
    read.expectOk();
    // The figures must come from the tool, not from the agent's own look at the photo.
    read.calledTool("ocr__read_document", { count: 1 });
    t.check(read.reply, includes(/185/));

    // The person checks the paper and confirms the date. Whether or not the model misread it,
    // the correction goes through the tool, which parses the Buddhist Era date itself.
    const corrected = await read.session.send("วันที่บนใบเสร็จคือ 12/05/2568");
    corrected.expectOk();
    corrected.calledTool("ocr__correct_document");

    const exported = await corrected.session.send("ขอไฟล์ CSV");
    exported.expectOk();
    exported.calledTool("ocr__export_document");
    t.check(exported.reply, includes("2025-05-12"));
    t.succeeded();
  },
});
