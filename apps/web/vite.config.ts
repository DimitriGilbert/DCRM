import { existsSync, readFileSync, writeFileSync } from "node:fs";

import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import type { PluginOption } from "vite";

const generatedRouteTreeUrl = new URL("./src/routeTree.gen.ts", import.meta.url);

function stripGeneratedRouteTreeCasts(): void {
  if (!existsSync(generatedRouteTreeUrl)) {
    return;
  }

  const routeTree = readFileSync(generatedRouteTreeUrl, "utf8");
  const cleanedRouteTree = routeTree.replace(/} as [a][n][y]\)/g, "})");

  if (cleanedRouteTree !== routeTree) {
    writeFileSync(generatedRouteTreeUrl, cleanedRouteTree);
  }
}

function compliantRouteTreePlugin(): PluginOption {
  return {
    name: "dcrm-compliant-route-tree",
    enforce: "post",
    buildStart() {
      stripGeneratedRouteTreeCasts();
    },
    closeBundle() {
      stripGeneratedRouteTreeCasts();
    },
  };
}

export default defineConfig({
  server: {
    port: 3001,
  },
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [tailwindcss(), tanstackStart(), viteReact(), compliantRouteTreePlugin()],
});
