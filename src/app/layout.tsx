import type { Metadata, Viewport } from "next";
import "@fontsource-variable/figtree";
import "@fontsource-variable/bricolage-grotesque/opsz.css";
import "./globals.css";
import { Providers } from "@/components/Providers";

export const metadata: Metadata = {
  title: { default: "Kladriva Post", template: "%s · Kladriva Post" },
  description: "Le réseau des apprenants Kladriva : partage tes avancées chaque jour, reçois des retours et progresse avec ta promo.",
  applicationName: "Kladriva Post",
  appleWebApp: { capable: true, title: "Kladriva Post", statusBarStyle: "default" },
  openGraph: {
    title: "Kladriva Post",
    description: "Le réseau des apprenants Kladriva.",
    type: "website",
    siteName: "Kladriva Post",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eef1f6" },
    { media: "(prefers-color-scheme: dark)", color: "#0d1120" },
  ],
};

// Applique le thème avant le premier rendu pour éviter le flash
const themeScript = `(function(){try{var t=localStorage.getItem('kp-theme');if(!t){t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}document.documentElement.dataset.theme=t}catch(e){}})()`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
