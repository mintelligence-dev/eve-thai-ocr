import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Thai Receipt Reader",
  description: "อ่านใบเสร็จและสลิปโอนเงินภาษาไทยเป็นข้อมูล JSON/CSV ที่แก้ไขได้",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" suppressHydrationWarning>
      <head>
        {/* Apply a saved theme before first paint. Fixed string, no user input. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("trr-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
