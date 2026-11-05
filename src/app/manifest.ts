import type { MetadataRoute } from "next";

/** Install as an app ("Add to Home screen"): standalone window, Atrazo icon and colours. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Atrazo — utang ledger",
    short_name: "Atrazo",
    description:
      "The utang ledger for sari-sari stores and anyone who lends. Write the utang; Atrazo adds it up.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#1C2024",
    theme_color: "#1C2024",
    lang: "en-PH",
    categories: ["business", "finance", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
