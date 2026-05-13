import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: "/admin",
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
