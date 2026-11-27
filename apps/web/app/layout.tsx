import type { Metadata } from "next";
import { IBM_Plex_Sans_Thai, JetBrains_Mono, Manrope, Rubik } from "next/font/google";
import { cn } from "@/lib/utils";
import "./globals.css";

// Mintel UI fonts: Manrope for text, Rubik for headings, IBM Plex Sans Thai
// for Thai, JetBrains Mono for code. globals.css reads these variables.
const sans = Manrope({ variable: "--font-manrope", subsets: ["latin"], display: "swap" });
const heading = Rubik({ variable: "--font-rubik", subsets: ["latin"], display: "swap" });
const thai = IBM_Plex_Sans_Thai({
  variable: "--font-plex-thai",
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});
const mono = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: "Thai Receipt Reader",
  description: "อ่านใบเสร็จและสลิปโอนเงินภาษาไทยเป็นข้อมูล JSON/CSV ที่แก้ไขได้",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={cn(sans.variable, heading.variable, thai.variable, mono.variable)} suppressHydrationWarning>
      <head>
        {/* Apply a saved theme before first paint. Fixed string, no user input. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("trr-theme");if(t==="dark")document.documentElement.dataset.theme=t}catch(e){}`,
          }}
        />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
