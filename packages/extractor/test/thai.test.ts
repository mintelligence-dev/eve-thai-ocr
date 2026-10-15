import { describe, expect, it } from "vitest";
import {
  parseAmountToSatang,
  parseQuantity,
  parseThaiDate,
  parseTime,
  thaiDigitsToArabic,
} from "../src/thai.js";

const today = new Date("2025-10-14T00:00:00Z");

describe("thaiDigitsToArabic", () => {
  it("converts Thai digits and leaves other text alone", () => {
    expect(thaiDigitsToArabic("๐๑๒๓๔๕๖๗๘๙ abc 5")).toBe("0123456789 abc 5");
  });
});

describe("parseThaiDate", () => {
  it.each([
    ["12/05/2568", "2025-05-12", true],
    ["๑๒/๐๕/๒๕๖๘", "2025-05-12", true],
    ["12-05-2025", "2025-05-12", false],
    ["2025-05-12", "2025-05-12", false],
    ["12 พฤษภาคม 2568", "2025-05-12", true],
    ["12 พ.ค. 2568", "2025-05-12", true],
    ["๑๒ พ.ค. ๒๕๖๘", "2025-05-12", true],
    ["5 Jan 2025", "2025-01-05", false],
    ["5 January 2568", "2025-01-05", true],
    ["29/02/2567", "2024-02-29", true], // BE 2567 is a leap year
  ])("parses %s", (input, iso, be) => {
    const r = parseThaiDate(input, { today });
    expect(r?.iso).toBe(iso);
    expect(r?.buddhistEra).toBe(be);
    expect(r?.twoDigitYear).toBe(false);
  });

  it("resolves two-digit years to the closest plausible year and says so", () => {
    expect(parseThaiDate("3 ก.ย. 68", { today })).toEqual({
      iso: "2025-09-03", buddhistEra: true, twoDigitYear: true,
    });
    expect(parseThaiDate("03/09/25", { today })).toEqual({
      iso: "2025-09-03", buddhistEra: false, twoDigitYear: true,
    });
  });

  it.each(["", "hello", "32/01/2568", "12/13/2568", "29/02/2568", "12 xyz 2568"])(
    "rejects %j",
    (input) => {
      expect(parseThaiDate(input, { today })).toBeNull();
    },
  );
});

describe("parseTime", () => {
  it.each([
    ["14:35", "14:35"],
    ["๑๔.๓๕ น.", "14:35"],
    ["9:05:12", "09:05"],
  ])("parses %s", (input, expected) => expect(parseTime(input)).toBe(expected));

  it("rejects impossible times", () => {
    expect(parseTime("25:00")).toBeNull();
    expect(parseTime("nope")).toBeNull();
  });
});

describe("parseAmountToSatang", () => {
  it.each([
    ["1,234.50", 123450],
    ["฿๑,๒๓๔.๕๐", 123450],
    ["1234", 123400],
    ["1,070.00 THB", 107000],
    ["2,500.00 บาท", 250000],
    ["0.5", 50],
    ["12,50", 1250],
    ["1.234,50", 123450],
    ["1,234,567.89", 123456789],
    ["-50.00", -5000],
    ["(50.00)", -5000],
    ["@100.00", 10000],
    ["@ ๒๕.๐๐", 2500],
    ["48.75 N", 4875],
    ["59.00 P", 5900],
    ["19.00 T", 1900],
    ["-149.00", -14900],
    ["41.00 / ชิ้น", 4100],
    ["78.00 *", 7800],
    ["1,203.75 BHT", 120375],
  ])("parses %s", (input, expected) => expect(parseAmountToSatang(input)).toBe(expected));

  it.each(["", "abc", "1?4.4l", "12.345", "฿", "12 ab", "N"])("rejects %j", (input) => {
    expect(parseAmountToSatang(input)).toBeNull();
  });

  it("avoids floating point error", () => {
    expect(parseAmountToSatang("0.29")).toBe(29);
    expect(parseAmountToSatang("1.15")).toBe(115);
  });
});

describe("parseQuantity", () => {
  it("handles Thai digits and units", () => {
    expect(parseQuantity("๒")).toBe(2);
    expect(parseQuantity("1.5 kg")).toBe(1.5);
    expect(parseQuantity("-")).toBeNull();
  });
});
