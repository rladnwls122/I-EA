/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    // vega-canvas optionally requires the native `canvas` package for
    // node-side rendering; we only render Vega client-side (ssr: false),
    // so stub it out to avoid a webpack module-not-found build failure.
    config.resolve.alias.canvas = false;
    return config;
  },
};

export default nextConfig;
