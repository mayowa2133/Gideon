import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "Gideon · Product capture",
  description: "Discover, review, and record approved product flows."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
