import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CCF Eastwood Admin",
    short_name: "CCF Eastwood",
    description: "Church management for administrators",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#18181b",
    orientation: "portrait",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  }
}
