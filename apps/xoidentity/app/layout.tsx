import type { Metadata } from "next";
import { Logo } from "@/components/Logo";
import "./globals.css";

export const metadata: Metadata = {
  title: "XOIdentity",
  description: "Commit a binding and pay the bound Bitcoin Cash address.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <main className="mx-auto max-w-xl px-6 py-16">
          <header className="border-b border-ink pb-8">
            <Logo className="h-12 w-12" />
            <p className="mt-5 text-sm font-medium tracking-tight">XOIdentity</p>
          </header>
          <div className="pt-8">{children}</div>
        </main>
      </body>
    </html>
  );
}
