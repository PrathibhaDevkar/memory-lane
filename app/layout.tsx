import type { Metadata } from "next";
import { Fraunces, Geist } from "next/font/google";
import { TEXT_SIZE_SCRIPT } from "@/lib/text-size";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

// Serif for headings: gives the kit the feel of a memory book rather than a dashboard.
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Memory Lane",
  description:
    "Helps caregivers put together personal reminiscence sessions, using Qloo's taste graph to find music, films, food and places from a person's formative years.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The head script may set data-text-size before React starts, hence suppressHydrationWarning.
    <html lang="en" suppressHydrationWarning className={`${geistSans.variable} ${fraunces.variable} h-full antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: TEXT_SIZE_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
