import reactRefresh from "@vitejs/plugin-react-refresh";
import glsl from 'vite-plugin-glsl';
import { defineConfig } from "vite";

// console.log('glsl..........', glsl)
// https://vitejs.dev/config/
export default defineConfig({
  plugins: [glsl(), reactRefresh()],
  resolve: {
    dedupe: ["@galacean/engine"],
  },
  optimizeDeps: {
    exclude: [
      "@galacean/engine",
      "@oasis-engine/core",
      "@oasis-engine/lottie",
      "@oasis-engine/math",
      "@oasis-engine/rhi-webgl",
      "@oasis-engine/loader",
      "@galacean/engine-toolkit",
      "@oasis-engine/physics-physx",
    ],
  },
});
