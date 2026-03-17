import { promises as fs } from "fs";
import path from "path";
import logger from "../lib/logger";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderRegistryPage(registry: {
  taxonomy: {
    categories: string[];
    subcategories: string[];
    category_to_subcategories: Record<string, string[]>;
  };
  chains: {
    chains: Array<{ name: string; slug: string; logoUrl?: string }>;
  };
}) {
  const categorySections = registry.taxonomy.categories
    .map((category) => {
      const subcategories = registry.taxonomy.category_to_subcategories[category] ?? [];
      const subcategoryItems = subcategories.length
        ? subcategories
            .map(
              (subcategory) =>
                `<li class="token">${escapeHtml(subcategory)}</li>`,
            )
            .join("")
        : '<li class="empty-state">No subcategories defined.</li>';

      return `
        <details class="category-block" open data-searchable="${escapeHtml(
          `${category} ${subcategories.join(" ")}`.toLowerCase(),
        )}">
          <summary>
            <span class="category-name">${escapeHtml(category)}</span>
            <span class="category-count">${subcategories.length} subcategories</span>
          </summary>
          <ul class="token-list">
            ${subcategoryItems}
          </ul>
        </details>
      `;
    })
    .join("");

  const chainRows = registry.chains.chains
    .map((chain) => {
      const logo = chain.logoUrl
        ? `<img src="${escapeHtml(chain.logoUrl)}" alt="${escapeHtml(chain.name)} logo" class="chain-logo" loading="lazy" />`
        : `<div class="chain-logo chain-logo--placeholder" aria-hidden="true">${escapeHtml(chain.name.slice(0, 1))}</div>`;

      return `
        <tr data-searchable="${escapeHtml(
          `${chain.name} ${chain.slug}`.toLowerCase(),
        )}">
          <td class="chain-name-cell">
            ${logo}
            <span>${escapeHtml(chain.name)}</span>
          </td>
          <td><code>${escapeHtml(chain.slug)}</code></td>
          <td>${chain.logoUrl ? "Available" : "Missing"}</td>
        </tr>
      `;
    })
    .join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Registry Reference | Lancers Dapp Registry</title>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;600;700&display=swap');
      :root {
        --bg: #f5efe5;
        --panel: rgba(255, 252, 246, 0.92);
        --panel-strong: #fffaf0;
        --text: #1f2937;
        --muted: #5b6472;
        --line: rgba(104, 83, 55, 0.18);
        --accent: #0f172a;
        --accent-soft: rgba(15, 23, 42, 0.08);
        --shadow: 0 18px 40px rgba(15, 23, 42, 0.10);
      }

      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
        color: var(--text);
        background:
          radial-gradient(circle at top left, rgba(15, 23, 42, 0.10), transparent 28%),
          radial-gradient(circle at right, rgba(30, 41, 59, 0.08), transparent 25%),
          linear-gradient(180deg, #f7f1e8 0%, var(--bg) 100%);
      }

      .shell {
        max-width: 1180px;
        margin: 0 auto;
        padding: 32px 20px 56px;
      }

      .hero {
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 24px;
        padding: 28px;
        box-shadow: var(--shadow);
        backdrop-filter: blur(8px);
      }

      .eyebrow {
        margin: 0 0 8px;
        color: var(--accent);
        font-size: 0.84rem;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      h1 {
        margin: 0;
        font-size: clamp(2rem, 4vw, 3.6rem);
        line-height: 0.96;
        letter-spacing: -0.04em;
      }

      .hero p {
        max-width: 780px;
        margin: 16px 0 0;
        color: var(--muted);
        font-size: 1rem;
      }

      .meta-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
        gap: 12px;
        margin-top: 24px;
      }

      .meta-card {
        background: var(--panel-strong);
        border: 1px solid var(--line);
        border-radius: 18px;
        padding: 14px 16px;
      }

      .meta-card strong {
        display: block;
        font-size: 1.4rem;
      }

      .meta-card span {
        color: var(--muted);
        font-size: 0.9rem;
      }

      .toolbar {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        align-items: center;
        justify-content: space-between;
        margin: 20px 0 0;
      }

      .toolbar a {
        color: var(--accent);
        text-decoration: none;
        font-weight: 600;
      }

      .search {
        width: min(420px, 100%);
        padding: 13px 15px;
        border-radius: 14px;
        border: 1px solid var(--line);
        background: rgba(255, 255, 255, 0.82);
        color: var(--text);
        font: inherit;
      }

      .grid {
        display: grid;
        grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr);
        gap: 20px;
        margin-top: 22px;
      }

      .panel {
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 22px;
        padding: 22px;
        box-shadow: var(--shadow);
      }

      .panel h2 {
        margin: 0 0 8px;
        font-size: 1.2rem;
      }

      .panel-intro {
        margin: 0 0 18px;
        color: var(--muted);
      }

      .category-stack {
        display: grid;
        gap: 12px;
      }

      .category-block {
        border: 1px solid var(--line);
        border-radius: 18px;
        background: rgba(255, 255, 255, 0.6);
        overflow: hidden;
      }

      .category-block summary {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 16px 18px;
        cursor: pointer;
        list-style: none;
      }

      .category-block summary::-webkit-details-marker { display: none; }

      .category-name {
        font-weight: 700;
      }

      .category-count {
        color: var(--muted);
        font-size: 0.9rem;
      }

      .token-list {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin: 0;
        padding: 0 18px 18px;
        list-style: none;
      }

      .token {
        padding: 9px 12px;
        border-radius: 999px;
        background: var(--accent-soft);
        border: 1px solid rgba(15, 23, 42, 0.15);
        font-size: 0.92rem;
      }

      .empty-state {
        color: var(--muted);
      }

      table {
        width: 100%;
        border-collapse: collapse;
      }

      th, td {
        padding: 14px 10px;
        border-bottom: 1px solid var(--line);
        text-align: left;
        vertical-align: middle;
      }

      th {
        color: var(--muted);
        font-size: 0.82rem;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }

      .chain-name-cell {
        display: flex;
        align-items: center;
        gap: 12px;
        font-weight: 600;
      }

      .chain-logo {
        width: 28px;
        height: 28px;
        object-fit: contain;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.9);
        padding: 3px;
        border: 1px solid var(--line);
      }

      .chain-logo--placeholder {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 0.9rem;
        font-weight: 700;
        color: var(--accent);
        background: var(--accent-soft);
      }

      .hidden { display: none !important; }

      .hint {
        margin-top: 16px;
        color: var(--muted);
        font-size: 0.92rem;
      }

      @media (max-width: 920px) {
        .grid {
          grid-template-columns: 1fr;
        }
      }

      @media (max-width: 640px) {
        .shell {
          padding: 18px 14px 38px;
        }

        .hero,
        .panel {
          padding: 18px;
          border-radius: 18px;
        }

        .toolbar {
          align-items: stretch;
        }

        .search {
          width: 100%;
        }

        th:nth-child(3),
        td:nth-child(3) {
          display: none;
        }
      }
    </style>
  </head>
  <body>
    <main class="shell">
      <section class="hero">
        <p class="eyebrow">Contributor Reference</p>
        <h1>Registry Browser</h1>
        <p>
          Use this page to pick valid categories, subcategories, and chains before editing
          <code>meta.json</code>. The JSON registry still exists for tooling, but this view is optimized for humans.
        </p>
        <div class="meta-grid">
          <div class="meta-card">
            <strong>${registry.taxonomy.categories.length}</strong>
            <span>Categories</span>
          </div>
          <div class="meta-card">
            <strong>${registry.taxonomy.subcategories.length}</strong>
            <span>Subcategories</span>
          </div>
          <div class="meta-card">
            <strong>${registry.chains.chains.length}</strong>
            <span>Chains</span>
          </div>
        </div>
        <div class="toolbar">
          <input id="registry-search" class="search" type="search" placeholder="Search category, subcategory, chain, or slug" />
          <a href="./registry.json">Open raw registry JSON</a>
        </div>
      </section>

      <section class="grid">
        <article class="panel">
          <h2>Taxonomy</h2>
          <p class="panel-intro">Pick an existing category first, then choose one of its allowed subcategories.</p>
          <div id="category-stack" class="category-stack">
            ${categorySections}
          </div>
          <p id="taxonomy-empty" class="hint hidden">No taxonomy matches this search.</p>
        </article>

        <article class="panel">
          <h2>Chains</h2>
          <p class="panel-intro">These are the canonical chain values accepted by validation. Logos here reflect what the frontend can consume.</p>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Slug</th>
                  <th>Logo</th>
                </tr>
              </thead>
              <tbody id="chains-table-body">
                ${chainRows}
              </tbody>
            </table>
          </div>
          <p id="chains-empty" class="hint hidden">No chains match this search.</p>
        </article>
      </section>
    </main>

    <script>
      (function () {
        var searchInput = document.getElementById("registry-search");
        var categoryBlocks = Array.prototype.slice.call(document.querySelectorAll("[data-searchable]"));
        var taxonomyEmpty = document.getElementById("taxonomy-empty");
        var chainsTableBody = document.getElementById("chains-table-body");
        var chainRows = Array.prototype.slice.call(chainsTableBody.querySelectorAll("tr"));
        var chainsEmpty = document.getElementById("chains-empty");
        var categoryStack = document.getElementById("category-stack");

        function applyFilter() {
          var query = (searchInput.value || "").trim().toLowerCase();
          var taxonomyMatches = 0;
          var chainMatches = 0;

          categoryBlocks.forEach(function (element) {
            if (element.tagName !== "DETAILS") return;
            var haystack = element.getAttribute("data-searchable") || "";
            var visible = !query || haystack.indexOf(query) !== -1;
            element.classList.toggle("hidden", !visible);
            if (visible) taxonomyMatches += 1;
          });

          chainRows.forEach(function (row) {
            var haystack = row.getAttribute("data-searchable") || "";
            var visible = !query || haystack.indexOf(query) !== -1;
            row.classList.toggle("hidden", !visible);
            if (visible) chainMatches += 1;
          });

          taxonomyEmpty.classList.toggle("hidden", taxonomyMatches !== 0);
          chainsEmpty.classList.toggle("hidden", chainMatches !== 0);
          categoryStack.classList.toggle("hidden", taxonomyMatches === 0);
          chainsTableBody.parentElement.classList.toggle("hidden", chainMatches === 0);
        }

        searchInput.addEventListener("input", applyFilter);
      })();
    </script>
  </body>
</html>`;
}

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
  const dataDir = path.join(rootDir, "data");
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

  const taxonomyPath = path.join(dataDir, "taxonomy.json");
  const chainsPath = path.join(dataDir, "chains.json");
  if ((await fileExists(taxonomyPath)) && (await fileExists(chainsPath))) {
    const [taxonomyContent, chainsContent] = await Promise.all([
      fs.readFile(taxonomyPath, "utf-8"),
      fs.readFile(chainsPath, "utf-8"),
    ]);
    const registryDoc = {
      taxonomy: JSON.parse(taxonomyContent),
      chains: JSON.parse(chainsContent),
    };

    await fs.writeFile(
      path.join(docsDir, "registry.json"),
      JSON.stringify(registryDoc, null, 2),
      "utf-8",
    );

    await fs.writeFile(
      path.join(docsDir, "registry.html"),
      renderRegistryPage(registryDoc),
      "utf-8",
    );
  }

  const overview = {
    name: "Lancers Dapp Registry",
    version: "v1",
    updatedAt: new Date().toISOString(),
    endpoints: {
      appsIndex: "./dapps/apps.min.json",
      facetsIndex: "./facets/facets.index.json",
      metaPattern: "./apps/{slug}/meta.json",
      metaPatternDocs: "./docs/meta-pattern.json",
      registryDocs: "./docs/registry.json",
      registryBrowser: "./docs/registry.html",
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
      @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;600;700&display=swap');
      :root {
        --bg: #f4eee4;
        --panel: rgba(255, 251, 245, 0.92);
        --panel-strong: #fff8ef;
        --text: #1f2937;
        --muted: #5f6775;
        --line: rgba(97, 72, 44, 0.16);
        --accent: #0f172a;
        --accent-deep: #1e293b;
        --accent-soft: rgba(15, 23, 42, 0.08);
        --shadow: 0 22px 45px rgba(15, 23, 42, 0.10);
      }

      * { box-sizing: border-box; }

      body {
        margin: 0;
        color: var(--text);
        font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
        background:
          radial-gradient(circle at top left, rgba(15, 23, 42, 0.10), transparent 28%),
          radial-gradient(circle at right, rgba(30, 41, 59, 0.08), transparent 24%),
          linear-gradient(180deg, #f7f1e9 0%, var(--bg) 100%);
      }

      .shell {
        max-width: 1180px;
        margin: 0 auto;
        padding: 30px 20px 56px;
      }

      .hero {
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 28px;
        padding: 30px;
        box-shadow: var(--shadow);
        backdrop-filter: blur(8px);
      }

      .eyebrow {
        margin: 0 0 10px;
        color: var(--accent);
        font-size: 0.84rem;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      h1 {
        margin: 0;
        max-width: 760px;
        font-size: clamp(2.2rem, 5vw, 4.6rem);
        line-height: 0.94;
        letter-spacing: -0.05em;
      }

      .hero-copy {
        max-width: 760px;
        margin: 18px 0 0;
        color: var(--muted);
        font-size: 1.04rem;
        line-height: 1.65;
      }

      .hero-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        margin-top: 24px;
      }

      .button,
      .button-secondary {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 46px;
        padding: 0 18px;
        border-radius: 999px;
        text-decoration: none;
        font-weight: 700;
      }

      .button {
        color: white;
        background: linear-gradient(135deg, var(--accent) 0%, var(--accent-deep) 100%);
        box-shadow: 0 14px 30px rgba(15, 23, 42, 0.22);
      }

      .button-secondary {
        color: var(--accent-deep);
        background: rgba(255, 255, 255, 0.75);
        border: 1px solid var(--line);
      }

      .metrics {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
        gap: 12px;
        margin-top: 24px;
      }

      .metric {
        padding: 15px 16px;
        border-radius: 18px;
        background: var(--panel-strong);
        border: 1px solid var(--line);
      }

      .metric strong {
        display: block;
        font-size: 1.45rem;
      }

      .metric span {
        color: var(--muted);
        font-size: 0.9rem;
      }

      .grid {
        display: grid;
        grid-template-columns: minmax(0, 1.2fr) minmax(0, 0.8fr);
        gap: 20px;
        margin-top: 22px;
      }

      .panel {
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 24px;
        padding: 24px;
        box-shadow: var(--shadow);
      }

      .panel h2 {
        margin: 0 0 8px;
        font-size: 1.2rem;
      }

      .panel p {
        margin: 0 0 18px;
        color: var(--muted);
      }

      .endpoint-list,
      .workflow-list {
        display: grid;
        gap: 12px;
      }

      .endpoint-card {
        display: grid;
        gap: 6px;
        padding: 16px;
        border-radius: 18px;
        background: rgba(255, 255, 255, 0.68);
        border: 1px solid var(--line);
      }

      .endpoint-card a {
        color: var(--accent-deep);
        font-weight: 700;
        text-decoration: none;
        word-break: break-word;
      }

      .endpoint-card code {
        display: inline-block;
        width: fit-content;
        padding: 4px 8px;
        border-radius: 999px;
        background: var(--accent-soft);
        font-size: 0.82rem;
      }

      .endpoint-card p,
      .workflow-step p {
        margin: 0;
        color: var(--muted);
        font-size: 0.95rem;
        line-height: 1.55;
      }

      .workflow-step {
        padding: 16px;
        border-radius: 18px;
        background: rgba(255, 255, 255, 0.68);
        border: 1px solid var(--line);
      }

      .workflow-step strong {
        display: block;
        margin-bottom: 6px;
      }

      .note {
        margin-top: 24px;
        padding-top: 18px;
        border-top: 1px solid var(--line);
        color: var(--muted);
        font-size: 0.92rem;
      }

      @media (max-width: 920px) {
        .grid {
          grid-template-columns: 1fr;
        }
      }

      @media (max-width: 640px) {
        .shell {
          padding: 18px 14px 36px;
        }

        .hero,
        .panel {
          padding: 18px;
          border-radius: 20px;
        }
      }
    </style>
  </head>
  <body>
    <main class="shell">
      <section class="hero">
        <p class="eyebrow">Lancers Technology</p>
        <h1>The open registry for Web3 apps, chains, and taxonomy.</h1>
        <p class="hero-copy">
          This registry publishes stable JSON indexes for apps and facets, while also exposing contributor-facing
          documentation for valid taxonomy and chain values. Use the JSON endpoints for integrations and the registry browser
          when editing <code>meta.json</code> files.
        </p>
        <div class="hero-actions">
          <a class="button" href="./docs/registry.html">Browse Registry</a>
          <a class="button-secondary" href="./dapps/apps.min.json">Open Apps Index</a>
          <a class="button-secondary" href="./facets/facets.index.json">Open Facets Index</a>
        </div>
        <div class="metrics">
          <div class="metric">
            <strong>2 core indexes</strong>
            <span><code>apps.min.json</code> and <code>facets.index.json</code></span>
          </div>
          <div class="metric">
            <strong>1 source format</strong>
            <span>Per-app <code>meta.json</code> files in the repo</span>
          </div>
          <div class="metric">
            <strong>Contributor docs</strong>
            <span>Registry browser plus raw registry JSON</span>
          </div>
        </div>
      </section>

      <section class="grid">
        <article class="panel">
          <h2>Endpoints</h2>
          <p>These are the primary outputs exposed by the registry build.</p>
          <div id="endpoint-list" class="endpoint-list"></div>
        </article>

        <aside class="panel">
          <h2>Contribution Flow</h2>
          <p>Use the browser page before editing metadata so contributors stay inside the canonical taxonomy and chain list.</p>
          <div class="workflow-list">
            <div class="workflow-step">
              <strong>1. Browse allowed values</strong>
              <p>Open <code>docs/registry.html</code> to find valid categories, subcategories, and chains.</p>
            </div>
            <div class="workflow-step">
              <strong>2. Edit app metadata</strong>
              <p>Update <code>apps/{slug}/meta.json</code> using existing values whenever they already fit.</p>
            </div>
            <div class="workflow-step">
              <strong>3. Validate and build</strong>
              <p>Run validation first, then rebuild the generated indexes and static site output.</p>
            </div>
          </div>
          <p class="note">If you introduce a genuinely new chain or taxonomy value, add it to the canonical registry first so validation and frontend outputs remain consistent.</p>
        </aside>
      </section>
    </main>

    <script>
      (function renderLinks() {
        var path = window.location.pathname;
        var basePath = path.replace(/\\/index\\.html$/, "").replace(/\\/$/, "");
        function fullPath(relativePath) {
          return (basePath + "/" + relativePath).replace(/\\/+/g, "/");
        }
        var endpointItems = [
          {
            relative: "overview.json",
            badge: "Overview",
            description: "Top-level metadata and a machine-readable map of the published endpoints."
          },
          {
            relative: "dapps/apps.min.json",
            badge: "Apps Index",
            description: "Condensed app records for listings, search, and integrations."
          },
          {
            relative: "facets/facets.index.json",
            badge: "Facets Index",
            description: "Filter buckets, labels, taxonomy, and network logos used by the frontend."
          },
          {
            relative: "docs/meta-pattern.json",
            badge: "Meta Pattern",
            description: "Reference for the expected meta.json structure."
          },
          {
            relative: "docs/registry.json",
            badge: "Registry JSON",
            description: "Canonical machine-readable taxonomy and chain registry."
          },
          {
            relative: "docs/registry.html",
            badge: "Registry Browser",
            description: "Human-friendly explorer for categories, subcategories, chains, and logos."
          },
          {
            relative: "apps/{slug}/meta.json",
            badge: "Per-App Meta",
            description: "Source metadata pattern for an individual app record.",
            code: true
          }
        ];
        var list = document.getElementById("endpoint-list");
        endpointItems.forEach(function(item) {
          var card = document.createElement("article");
          card.className = "endpoint-card";

          var badge = document.createElement("code");
          badge.textContent = item.badge;
          card.appendChild(badge);

          var displayPath = fullPath(item.relative);
          if (item.code) {
            var code = document.createElement("code");
            code.textContent = displayPath;
            card.appendChild(code);
          } else {
            var link = document.createElement("a");
            link.href = displayPath;
            link.textContent = displayPath;
            card.appendChild(link);
          }

          var description = document.createElement("p");
          description.textContent = item.description;
          card.appendChild(description);

          list.appendChild(card);
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
