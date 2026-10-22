import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BillOps — Recurring Bill & Payment Management",
  description:
    "Track recurring bills, invoices, payments, reminders and notification history.",
};

const themeScript = `(function(){try{var s=localStorage.getItem('billops-theme');var d=s?s==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;var e=document.documentElement;e.classList.toggle('dark',d);e.dataset.theme=d?'dark':'light';}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
