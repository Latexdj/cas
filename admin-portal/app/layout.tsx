import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "CAS Admin Portal",
  description: "Class Attendance System – School Admin Dashboard",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="h-full bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
