import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Forkcast", description: "Sealed AI forecasts for food ads, graded by the room." };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
