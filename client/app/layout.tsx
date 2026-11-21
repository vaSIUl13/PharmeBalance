import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PharmaBalance",
  description: "Управління запасами аптечної мережі",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="uk">
      <body>{children}</body>
    </html>
  );
}
