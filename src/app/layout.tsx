import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter-tight";
import "@fontsource/instrument-serif/400.css";
import "@fontsource/instrument-serif/400-italic.css";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";


export const metadata: Metadata = {
  title: "Kladriva Post — Montre ce que tu apprends",
  description:
    "Le réseau des apprenants Kladriva : partage tes avancées, commente, rejoins des groupes et échange en privé.",
  openGraph: {
    title: "Kladriva Post",
    description: "Le réseau des apprenants Kladriva.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#0f0f12",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
