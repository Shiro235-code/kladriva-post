import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Kladriva Post",
    short_name: "Kladriva Post",
    description: "Le réseau des apprenants Kladriva.",
    start_url: "/feed",
    display: "standalone",
    background_color: "#eef1f6",
    theme_color: "#2f4bff",
    lang: "fr",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
