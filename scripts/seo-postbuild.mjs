// SEO post-processing for the prerendered static site.
//
// Webstudio regenerates pages/, app/__generated__/, renderer/ and package.json
// on every `webstudio build`, so these fixes live here and run from the deploy
// workflow after `npm run build`:
//
//   node scripts/seo-postbuild.mjs dist/client
//
// - Absolute URLs: prerendering has no Host header, so the generated og:url
//   and page context use the placeholder origin "https://url". Swap in SITE.
// - <link rel="canonical"> on every indexable page.
// - JSON-LD: give the WebSite node a url, and describe the Organization on
//   the home page.
// - Flatten /foo/index.html to /foo.html so GitHub Pages serves /foo with a
//   200 instead of a 301 to /foo/ (internal links have no trailing slash).
//   This also puts the static 404 page at /404.html, where Pages expects it.
// - sitemap.xml (indexable pages only) and robots.txt.

import { readFile, writeFile, readdir, rename, rmdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";

const SITE = (process.env.SITE_URL ?? "https://calltwyne.com").replace(/\/$/, "");
const PLACEHOLDER_ORIGIN = "https://url";
const CONTACT_EMAIL = "hello@calltwyne.com";
const LOGO_ASSET = "blue-can_4GFNX2etHc-RTCzqGdBE3.png";

const root = process.argv[2];
if (!root) {
  console.error("usage: node scripts/seo-postbuild.mjs <dist/client>");
  process.exit(1);
}

const findIndexFiles = async (dir) => {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "assets") out.push(...(await findIndexFiles(path)));
    } else if (entry.name === "index.html") {
      out.push(path);
    }
  }
  return out;
};

// dist/client/privacy/index.html -> "/privacy"; dist/client/index.html -> "/"
const toRoutePath = (file) => {
  const dir = relative(root, file).split(sep).slice(0, -1).join("/");
  return `/${dir}`;
};

const escapeAttr = (value) =>
  value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

const rewriteJsonLd = (html, routePath) =>
  html.replace(
    /(<script type="application\/ld\+json">)([\s\S]*?)(<\/script>)/,
    (match, open, body, close) => {
      let data;
      try {
        data = JSON.parse(body);
      } catch {
        return match;
      }
      if (data["@type"] !== "WebSite") return match;
      const website = { "@type": "WebSite", name: data.name, url: `${SITE}/` };
      const graph = [website];
      if (routePath === "/") {
        graph.push({
          "@type": "Organization",
          name: data.name,
          url: `${SITE}/`,
          logo: `${SITE}/assets/${LOGO_ASSET}`,
          email: CONTACT_EMAIL,
        });
      }
      const json = JSON.stringify(
        { "@context": "https://schema.org", "@graph": graph },
        null,
        2
      ).replace(/</g, "\\u003c");
      return `${open}${json}${close}`;
    }
  );

const files = await findIndexFiles(root);
const indexable = new Set();

for (const file of files) {
  const routePath = toRoutePath(file);
  let html = await readFile(file, "utf8");

  html = html.replaceAll(PLACEHOLDER_ORIGIN, SITE);

  const noindex = /<meta name="robots" content="[^"]*noindex/.test(html);
  if (!noindex) {
    indexable.add(routePath);
    if (!html.includes('rel="canonical"')) {
      const canonical = `<link rel="canonical" href="${escapeAttr(SITE + routePath)}"/>`;
      html = html.replace("</head>", `${canonical}</head>`);
    }
  }

  html = rewriteJsonLd(html, routePath);
  await writeFile(file, html);

  if (routePath !== "/") {
    const dir = join(file, "..");
    await rename(file, `${dir}.html`);
    await rmdir(dir).catch(() => {}); // leave it if anything else lives there
  }
}

// Webstudio's own sitemap list carries each page's last-modified date.
const sitemapSource = await readFile(
  new URL("../app/__generated__/$resources.sitemap.xml.ts", import.meta.url),
  "utf8"
);
const entries = JSON.parse(sitemapSource.slice(sitemapSource.indexOf("["), sitemapSource.lastIndexOf("]") + 1));
const urls = entries
  .filter(({ path }) => indexable.has(path))
  .map(
    ({ path, lastModified }) =>
      `  <url>\n    <loc>${SITE}${path}</loc>\n    <lastmod>${lastModified}</lastmod>\n  </url>`
  );
const missing = [...indexable].filter((p) => !entries.some((e) => e.path === p));
if (missing.length > 0) {
  console.warn(`seo-postbuild: indexable pages missing from sitemap: ${missing.join(", ")}`);
}

await writeFile(
  join(root, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`
);
await writeFile(
  join(root, "robots.txt"),
  `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`
);

console.log(
  `seo-postbuild: ${files.length} pages, ${urls.length} in sitemap, site ${SITE}`
);
