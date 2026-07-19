/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  turbopack: {
    root: process.cwd(),
  },
  allowedDevOrigins: ["local-example.wterm.localhost"],
  transpilePackages: ["@wterm/core", "@wterm/dom", "@wterm/react"],
  serverExternalPackages: ["node-pty"],
};

export default nextConfig;
