import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep module resolution anchored to this Next.js app when the repository is
  // opened from a parent directory (as happens in some Vercel configurations).
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
