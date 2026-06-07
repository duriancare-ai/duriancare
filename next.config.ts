import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  cacheOnFrontEndNav: false,
  aggressiveFrontEndNavCaching: false,
  reloadOnOnline: true,
  disable: false,
  workboxOptions: {
    disableDevLogs: true,
    // This is the KEY fix: exclude matching entries from the precache manifest.
    // Without this, all .tflite and /tflite/ files end up in sw.js precacheAndRoute()
    // and cause "Cache.put() NetworkError" when the SW tries to store 350MB of AI binaries.
    exclude: [
      /\.tflite$/i,
      /\/tflite\//i,
      /\.wasm$/i,
    ],
  },
  // publicExcludes uses minimatch globs - these patterns tell the plugin
  // to skip these files when scanning the public/ directory for the manifest
  publicExcludes: [
    "tflite/**/*",
    "*.tflite",
    "fusion_model_float32.tflite",
    "durian_*.tflite",
  ],
});

const nextConfig: NextConfig = {
  webpack: (config) => {
    return config;
  },
};

export default withPWA(nextConfig);
