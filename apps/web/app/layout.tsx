import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Thai Receipt Reader",
  description: "อ่านใบเสร็จและสลิปโอนเงินภาษาไทยเป็นข้อมูล JSON/CSV ที่แก้ไขได้",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
