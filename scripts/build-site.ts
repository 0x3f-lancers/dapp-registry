import { promises as fs } from "fs";
import path from "path";
import logger from "../lib/logger";

async function ensureDir(dirPath: string) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function buildSite() {
  const rootDir = process.cwd();
  const sourceAppsDir = path.join(rootDir, "src", "apps");
  const buildDir = path.join(rootDir, "build");

  const appsMinRootPath = path.join(buildDir, "apps.min.json");
  const facetsRootPath = path.join(buildDir, "facets.index.json");

  const dappsDir = path.join(buildDir, "dapps");
  const facetsDir = path.join(buildDir, "facets");
  const docsDir = path.join(buildDir, "docs");
  const appsDir = path.join(buildDir, "apps");

  if (!(await fileExists(appsMinRootPath)) || !(await fileExists(facetsRootPath))) {
    throw new Error(
      "Missing build/apps.min.json or build/facets.index.json. Run distill first.",
    );
  }

  await ensureDir(dappsDir);
  await ensureDir(facetsDir);
  await ensureDir(docsDir);
  await ensureDir(appsDir);

  await fs.copyFile(appsMinRootPath, path.join(dappsDir, "apps.min.json"));
  await fs.copyFile(facetsRootPath, path.join(facetsDir, "facets.index.json"));

  const slugs = await fs.readdir(sourceAppsDir);
  for (const slug of slugs) {
    const sourceMeta = path.join(sourceAppsDir, slug, "meta.json");
    const targetDir = path.join(appsDir, slug);
    const targetMeta = path.join(targetDir, "meta.json");
    if (await fileExists(sourceMeta)) {
      await ensureDir(targetDir);
      await fs.copyFile(sourceMeta, targetMeta);
    }
  }

  const metaPatternDoc = {
    pattern: "/apps/{slug}/meta.json",
    sourcePath: "src/apps/<slug>/meta.json",
    requiredFields: [
      "slug",
      "name",
      "logoUrl",
      "category",
      "subcategory",
      "chains",
      "tags",
      "pricing",
      "content.short",
      "relations.alternatives",
      "relations.related",
    ],
  };

  await fs.writeFile(
    path.join(docsDir, "meta-pattern.json"),
    JSON.stringify(metaPatternDoc, null, 2),
    "utf-8",
  );

  const overview = {
    name: "Lancers Dapp Registry",
    version: "v1",
    updatedAt: new Date().toISOString(),
    endpoints: {
      appsIndex: "./dapps/apps.min.json",
      facetsIndex: "./facets/facets.index.json",
      metaPattern: "./apps/{slug}/meta.json",
      metaPatternDocs: "./docs/meta-pattern.json",
    },
  };

  await fs.writeFile(
    path.join(buildDir, "overview.json"),
    JSON.stringify(overview, null, 2),
    "utf-8",
  );

  const indexHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Lancers Dapp Registry</title>
    <style>
      body { font-family: Arial, sans-serif; max-width: 760px; margin: 2rem auto; padding: 0 1rem; line-height: 1.5; }
      h1 { margin-bottom: 0.5rem; }
      ul { padding-left: 1.2rem; }
      code { background: #f4f4f4; padding: 0.1rem 0.35rem; border-radius: 4px; }
    </style>
  </head>
  <body>
    <h1>Lancers Dapp Registry</h1>
    <p>Runtime-generated JSON endpoints:</p>
    <ul id="endpoints"></ul>
    <script>
      (function renderLinks() {
        var path = window.location.pathname;
        var basePath = path.replace(/\\/index\\.html$/, "").replace(/\\/$/, "");
        function fullPath(relativePath) {
          return (basePath + "/" + relativePath).replace(/\\/+/g, "/");
        }
        var endpointItems = [
          { relative: "overview.json", code: false },
          { relative: "dapps/apps.min.json", code: false },
          { relative: "facets/facets.index.json", code: false },
          { relative: "docs/meta-pattern.json", code: false },
          { relative: "apps/{slug}/meta.json", code: true }
        ];
        var list = document.getElementById("endpoints");
        endpointItems.forEach(function(item) {
          var li = document.createElement("li");
          var displayPath = fullPath(item.relative);
          if (item.code) {
            var code = document.createElement("code");
            code.textContent = displayPath;
            li.appendChild(code);
          } else {
            var a = document.createElement("a");
            a.href = displayPath;
            a.textContent = displayPath;
            li.appendChild(a);
          }
          list.appendChild(li);
        });
      })();
    </script>
  </body>
</html>
`;

  await fs.writeFile(path.join(buildDir, "index.html"), indexHtml, "utf-8");

  logger.info("Site build complete in build/ directory.");
}

buildSite().catch((error) => {
  logger.error({ error }, "Site build failed.");
  process.exit(1);
});
