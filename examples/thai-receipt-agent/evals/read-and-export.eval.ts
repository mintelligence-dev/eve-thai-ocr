import { resolve } from "node:path";
import { defineEval } from "eve/evals";
import { equals, includes } from "eve/evals/expect";

// A synthetic receipt kept in the repository (bench/cases); its values are invented. eve bundles
// eval files before running them, so the path is taken from the agent folder `eve eval` runs in.
const receipt = resolve(process.cwd(), "../../bench/cases/receipt-thai-clean.png");

export default defineEval({
  async test(t) {
    const session = await t.session();
    const read = await session.sendFile("ช่วยอ่านใบเสร็จนี้ให้หน่อย", receipt, "image/png");
    read.expectOk();
    // The figures must come from the tool, not from the agent's own look at the photo.
    read.calledTool("receipt__read_document", { count: 1 });
    t.check(read.reply, includes(/185/));

    // The reading model sometimes misreads a Thai digit (a date, a price). The extractor then
    // flags it and export is locked, so the agent may export or explain what must be fixed
    // first. What must hold either way: a CSV in the reply comes from export_document, and a
    // reply without one says why.
    const exported = await read.session.send("ขอไฟล์ CSV");
    exported.expectOk();
    const reply = exported.reply ?? "";
    const exportedByTool = exported.toolCalls.some(
      (call) => call.name === "receipt__export_document" && call.status === "completed",
    );
    const csvInReply = /document_type,/.test(reply);
    t.check(!csvInReply || exportedByTool, equals(true));
    t.check(exportedByTool || /แก้|ถูกต้อง|ตรวจ|ยืนยัน|fix|correct|check|confirm/i.test(reply), equals(true));
    t.succeeded();
  },
});
