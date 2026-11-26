import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  allowedDevOrigins: ["localhost", "127.0.0.1", "192.168.*.*", "10.*.*.*"],
};

export default nextConfig;
