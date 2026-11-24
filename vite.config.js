import { defineConfig } from "vite";
import { createReadStream, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Keep restricted models outside public/: only the localhost dev server serves them.
const localFiles = new Map(
  ["mirror", "muzi"].map((id) => [
    `/local-models/${id}.vrm`,
    fileURLToPath(new URL(`./local-assets/fish/${id}.vrm`, import.meta.url)),
  ]),
);

export default defineConfig({
  base: "./",
  plugins: [
    {
      name: "private-local-comparison-assets",
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          const path = new URL(request.url, "http://localhost").pathname;
          const file = localFiles.get(path);
          if (!file) return next();
          if (!existsSync(file)) {
            response.statusCode = 404;
            response.end("Local-only comparison model is unavailable.");
            return;
          }
          response.setHeader("Content-Type", "model/gltf-binary");
          response.setHeader("Content-Length", statSync(file).size);
          response.setHeader("Cache-Control", "private, max-age=3600");
          if (request.method === "HEAD") return response.end();
          createReadStream(file).pipe(response);
        });
      },
    },
  ],
});
