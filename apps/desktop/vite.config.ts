import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { copyFile, cp, mkdir, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { dirname, join, normalize, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { ServerResponse } from "node:http";
import type { Plugin } from "vite";

const host = process.env.TAURI_DEV_HOST;
const projectRoot = fileURLToPath(new URL(".", import.meta.url));
const pdfjsDistRoot = dirname(fileURLToPath(import.meta.resolve("pdfjs-dist/package.json")));
const pdfjsResourceDirectories = ["cmaps", "standard_fonts"] as const;
const pdfjsResourceRoute = "/pdfjs/";

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react(), pdfjsAssetsPlugin()],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));

function pdfjsAssetsPlugin(): Plugin {
  return {
    name: "reader-pdfjs-assets",
    configureServer(server) {
      server.middlewares.use(pdfjsResourceRoute, async (request, response, next) => {
        if (request.url === undefined) {
          next();
          return;
        }

        const requestedPath = decodeURIComponent(request.url.split("?")[0] ?? "");
        const resourcePath = resolvePdfjsResource(requestedPath);

        if (resourcePath === null) {
          next();
          return;
        }

        try {
          const resourceStat = await stat(resourcePath);

          if (!resourceStat.isFile()) {
            next();
            return;
          }

          response.statusCode = 200;
          response.setHeader("Cache-Control", "no-cache");
          setPdfjsResourceContentType(response, resourcePath);
          createReadStream(resourcePath).pipe(response);
        } catch {
          next();
        }
      });
    },
    async closeBundle() {
      const outputRoot = join(projectRoot, "dist", "pdfjs");
      await mkdir(outputRoot, { recursive: true });

      for (const directory of pdfjsResourceDirectories) {
        await cp(join(pdfjsDistRoot, directory), join(outputRoot, directory), {
          recursive: true,
        });
      }

      await copyFile(
        join(pdfjsDistRoot, "build", "pdf.worker.mjs"),
        join(outputRoot, "pdf.worker.mjs"),
      );
    },
  };
}

function resolvePdfjsResource(requestedPath: string): string | null {
  const [resourceDirectory, ...resourceSegments] = requestedPath
    .replace(/^\/+/, "")
    .split("/")
    .filter(Boolean);

  if (
    resourceDirectory === undefined ||
    resourceSegments.length === 0 ||
    !pdfjsResourceDirectories.includes(resourceDirectory as (typeof pdfjsResourceDirectories)[number])
  ) {
    return null;
  }

  const resolvedPath = resolve(pdfjsDistRoot, resourceDirectory, ...resourceSegments);
  const relativePath = normalize(relative(join(pdfjsDistRoot, resourceDirectory), resolvedPath));

  if (relativePath.startsWith("..") || relativePath.includes(`..${sep}`)) {
    return null;
  }

  return resolvedPath;
}

function setPdfjsResourceContentType(response: ServerResponse, resourcePath: string): void {
  if (resourcePath.endsWith(".bcmap")) {
    response.setHeader("Content-Type", "application/octet-stream");
    return;
  }

  if (resourcePath.endsWith(".ttf")) {
    response.setHeader("Content-Type", "font/ttf");
  }
}
