import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  async redirects() {
    return [
      // El HTML canónico queda dentro del scope /eco/ del service worker.
      { source: "/eco", destination: "/eco/index.html", permanent: false },
    ];
  },
};

export default nextConfig;

