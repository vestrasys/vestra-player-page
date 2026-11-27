// npm run build: renders src/index.html into dist/ with the release metadata,
// the slide manifest and both languages baked in. No dependencies.
//
// Environment: GITHUB_TOKEN (optional, raises the API rate limit and reads a
// private release repository), RELEASE_OFFLINE=1 (skip the network; the page
// uses its fallback), RELEASE_INCLUDE_PRERELEASES=1 (preview with a prerelease; github
// provider), RELEASE_LATEST_JSON=<file> (read this latest.json instead of the release's).
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fail, fromRoot, kib, readJson, webpSize } from "./lib.mjs";
import { loadRelease } from "./release.mjs";

const LANGS = ["en", "zh-Hans"];
// One prerendered page per language (crawlable, linked with hreflang): its folder under dist/.
const PAGES = { en: "", "zh-Hans": "zh-hans/" };
const OG_LOCALE = { en: "en_US", "zh-Hans": "zh_CN" };
// Displayed widths (CSS px) for the srcset choice; they follow styles.css.
const SIZES = {
  hero: "(max-width: 860px) calc(100vw - 32px), min(605px, 45vw)",
  near: "(max-width: 860px) 1px, min(605px, 45vw)",
  // The themes' sticky window (styles.css .th-grid): 7/12 of the content width less the gap, 639px at most.
  theme: "(max-width: 860px) calc(100vw - 32px), min(640px, calc(55.42vw - 19px))",
};
// A theme's outro counts its visible beats in words ("Five plugins today").
const NUMBERS = {
  en: ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve"],
  "zh-Hans": ["零", "一", "两", "三", "四", "五", "六", "七", "八", "九", "十", "十一", "十二"],
};
// Line glyphs for the chip rails (24 x 24, stroked; styles.css .th-item svg).
const GLYPHS = {
  picture: '<path d="M4 7h10M18 7h2M4 12h3M11 12h9M4 17h12"/><circle cx="16" cy="7" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="18" cy="17" r="2"/>',
  sound: '<path d="M5 20V10M9.7 20V4M14.3 20v-8M19 20V7"/>',
  subtitles: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M7 14.5h4M13.5 14.5H17M7 11h2M11.5 11H17"/>',
  seek: '<path d="M3 18h18"/><rect x="8" y="5" width="9" height="7" rx="1.5"/><path d="M12.5 12v6"/><circle cx="12.5" cy="18" r="1.6"/>',
  playlist: '<rect x="3" y="4.5" width="6" height="4.5" rx="1"/><rect x="3" y="14.5" width="6" height="4.5" rx="1"/><path d="M12.5 6.7H21M12.5 16.7H21"/>',
  palette: '<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5.5 5.5"/>',
  ask: '<path d="M11 3.5l1.8 5.2 5.2 1.8-5.2 1.8L11 17.5l-1.8-5.2L4 10.5l5.2-1.8zM18.5 15l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/>',
  motion: '<rect x="2.5" y="6" width="6" height="12" rx="1.5" opacity=".45"/><rect x="9" y="6" width="6" height="12" rx="1.5" opacity=".7"/><rect x="15.5" y="6" width="6" height="12" rx="1.5"/>',
  upscale: '<rect x="3" y="12" width="9" height="9" rx="1.5"/><path d="M12 4h9v9M21 4l-7.5 7.5"/>',
  build: '<path d="M8.5 7L4 12l4.5 5M15.5 7L20 12l-4.5 5M13.3 5l-2.6 14"/>',
  highlights: '<path d="M3 18l3-6 3 3 3.5-9 3 7 2.5-3 3 8"/>',
};
const BUDGET = 150 * 1024; // HTML + CSS + JS, media and images excluded
const MAX_FILE = 25 * 1024 * 1024; // Cloudflare Pages per-file limit
const OS_NAMES = { windows: "Windows", macos: "macOS", linux: "Linux" };
// The developer, as structured data and llms.txt name it.
const ORG_NAME = "Vestra";
// The GitHub mark (Octicons mark-github, MIT).
const GITHUB_ICON = '<svg class="gh-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"/></svg>';

const dist = fromRoot("dist");
const site = readJson(fromRoot("site.config.json"));
const releaseConfig = readJson(fromRoot("release.config.json"));
if (process.env.RELEASE_INCLUDE_PRERELEASES === "1") releaseConfig.includePrereleases = true;
const manifest = readJson(fromRoot("media/slides.json"));
// Hidden slides (drafts such as a slide whose recording does not exist yet) stay out of the page.
manifest.slides = (manifest.slides ?? []).filter((slide) => !slide.hidden);
// Hidden beats (a feature whose footage or release is not there yet) are left out of the page and the video.
for (const theme of manifest.themes ?? []) theme.beats = (theme.beats ?? []).filter((beat) => !beat.hidden);
const i18n = readJson(fromRoot("src/i18n.json"));
const credits = parseCredits(readFileSync(fromRoot("media/CREDITS.md"), "utf8"));

checkManifest(manifest);
const release = await loadRelease(releaseConfig, {
  offline: process.env.RELEASE_OFFLINE === "1",
  latestFile: process.env.RELEASE_LATEST_JSON || null,
});
if (release.fatal) fail(release.reason);
if (release.ok) console.log(`release ${release.version} (${release.date ?? "no date"}), assets: ${Object.keys(release.assets).join(", ") || "none"}`);
else console.warn(`warning: no release metadata (${release.reason}); building the fallback`);

// Strings built from configuration join the dictionary, so the page switches them too.
const licences = {
  player: link(site.playerLicense.url, site.playerLicense.name),
  plugins: link(site.pluginsLicense.url, site.pluginsLicense.name),
};
const dict = structuredClone(i18n);
for (const lang of LANGS) {
  for (const slide of manifest.slides) {
    dict[lang][`slide.${slide.id}.title`] = slide.title[lang];
    dict[lang][`slide.${slide.id}.caption`] = slide.caption[lang];
  }
  for (const [os, text] of Object.entries(releaseConfig.requirements)) dict[lang][`req.${os}`] = text[lang];
  dict[lang]["frame.alt"] = manifest.frame.alt[lang];
  for (const key of ["ft.licence", "os.player.text", "os.sdk.text"]) dict[lang][key] = format(dict[lang][key], licences);
  const missing = Object.keys(dict.en).filter((key) => !(key in dict[lang]));
  if (missing.length) fail(`${lang} lacks strings: ${missing.join(", ")}`);
}
// The strings of the page being rendered (renderPage switches it per language).
let en = dict.en;

// Downloads: one primary file per system, every enabled file in the platforms dialog.
const enabled = releaseConfig.assets.filter((a) => a.enabled);
const primary = {
  windows: enabled.find((a) => a.id === "windows-setup") ?? enabled.find((a) => a.os === "windows") ?? null,
  macos: ["universal", "arm64", "x64"].map((arch) => enabled.find((a) => a.os === "macos" && a.arch === arch)).find(Boolean) ?? null,
};
const systems = Object.keys(primary).filter((os) => primary[os]);
if (!systems.length) fail("release.config.json: no enabled asset for Windows or macOS");

// The buttons: stable "latest" links to fixed asset names (site.config.json downloads), so they work
// without release metadata and never need a rebuild for a new version.
const releaseRepo = `${releaseConfig.github.owner}/${releaseConfig.github.repo}`;
function stableUrl(os) {
  const name = site.downloads?.[os];
  return name ? `https://github.com/${releaseRepo}/releases/latest/download/${encodeURIComponent(name)}` : null;
}
const buttonSystems = ["windows", "macos", "linux"].filter((os) => stableUrl(os));
if (!buttonSystems.some((os) => os !== "linux")) fail("site.config.json downloads: no Windows or macOS asset name");
// The buttons link to fixed names; latest.json says which files the release really has. A name
// that differs, or a platform latest.json does not list, would be a dead button: fail.
if (release.ok && release.latest) {
  for (const os of buttonSystems) {
    const asset = os === "windows" ? primary.windows : os === "macos" ? primary.macos : enabled.find((a) => a.os === os);
    const key = asset?.latestKey;
    if (!key) fail(`release.config.json: no enabled ${os} asset with a latestKey to check site.config.json downloads.${os}`);
    const listed = release.latest[key];
    if (!listed) fail(`latest.json lists no "${key}" download, but site.config.json downloads.${os} is set`);
    if (listed.file !== site.downloads[os])
      fail(`site.config.json downloads.${os} is "${site.downloads[os]}" but latest.json ${key}.file is "${listed.file}"`);
  }
}

rmSync(dist, { recursive: true, force: true });
mkdirSync(join(dist, "assets"), { recursive: true });
cpSync(fromRoot("public"), dist, { recursive: true });
const css = hashed("src/styles.css", "site", "css");
const js = hashed("src/main.js", "site", "js");
// The hashed name of every copied media file (copyMedia), for hashMedia.
const mediaNames = new Map();
const media = copyMedia();

const frame = manifest.frame;
const github = site.links.playerRepo ?? `https://github.com/${releaseConfig.github.owner}`;
// The site's public address ("https://…/"), if known: canonical, hreflang, og:url and the sitemap need it.
// SITE_URL overrides site.config.json's url (for example to check the output against a local preview).
const siteUrlSetting = process.env.SITE_URL || site.url;
const siteUrl = siteUrlSetting ? String(siteUrlSetting).replace(/\/?$/, "/") : null;
const template = readFileSync(fromRoot("src/index.html"), "utf8");
const sizes = { [css]: statSync(join(dist, css)).size, [js]: statSync(join(dist, js)).size };
for (const lang of LANGS) {
  const file = `${PAGES[lang]}index.html`;
  const html = renderPage(lang);
  mkdirSync(dirname(join(dist, file)), { recursive: true });
  writeFileSync(join(dist, file), html);
  sizes[file] = Buffer.byteLength(html);
}
writeSeoFiles();

// Budget and size report: one page load is one HTML file plus the CSS and JS.
const largest = Math.max(...LANGS.map((lang) => sizes[`${PAGES[lang]}index.html`]));
const total = largest + sizes[css] + sizes[js];
for (const [file, size] of Object.entries(sizes)) console.log(`  ${file.padEnd(28)} ${kib(size)}`);
console.log(`  HTML/CSS/JS per page         ${kib(total)} (budget ${kib(BUDGET)})`);
console.log(`  media copied                 ${media.count} files, ${kib(media.bytes)}`);
if (total > BUDGET) fail("HTML/CSS/JS over budget");
console.log(`built ${LANGS.map((l) => `dist/${PAGES[l]}index.html`).join(", ")}${release.ok ? "" : " (release fallback)"}${siteUrl ? "" : "; no site.url: no canonical, hreflang or sitemap"}`);

function renderPage(lang) {
  en = dict[lang];
  const other = LANGS.find((l) => l !== lang);
  const prefix = "../".repeat(PAGES[lang].split("/").filter(Boolean).length);
  const slots = {
    backdrop: renderBackdrop(),
    seo: renderSeo(lang),
    cta: renderCta("hero"),
    ctaEnd: renderCta("end"),
    heroSource: renderHeroSource(),
    githubIcon: GITHUB_ICON,
    stage: renderStage(),
    themes: renderThemes(lang),
    openSource: renderOpenSource(),
    platforms: renderPlatforms(),
    links: renderLinks(),
    credits: renderCredits(lang),
    licence: en["ft.licence"],
    // Only what the script needs at run time; every other string is in the HTML already.
    // Each theme's beat times (the captions are in the HTML).
    data: JSON.stringify({
      themes: manifest.themes.map((th) => ({
        beats: th.beats.map((b) => ({ start: b.start, end: b.end })),
        ...(th.outro ? { outro: { start: th.outro.start, end: th.outro.end } } : {}),
      })),
    }).replace(/</g, "\\u003c"),
  };
  // The front window's frame image (its poster for a fullscreen take, which has no frame) is the
  // largest paint (LCP) of the first screen: preloaded at high priority.
  const lcp = heroImage();
  const vars = {
    css, js, lang,
    lcpImage: lcp,
    lcpSrcset: srcset(lcp) ?? lcp,
    lcpSizes: SIZES.hero,
    github,
    navHref: stableUrl(buttonSystems[0]),
    releasesPage: releaseConfig.releasesPage,
    // "All downloads" in the nav: the platforms dialog with script, else the release page.
    allDownloadsHref: releasesPage(),
    otherLang: other,
    // The other language's page, relative to this one.
    otherHref: PAGES[other] ? prefix + PAGES[other] : prefix || "./",
  };
  const html = template.replace(/\{\{(t|h|var|slot):([\w.-]+)\}\}/g, (_, kind, key) => {
    if (kind === "slot") return key in slots ? slots[key] : fail(`unknown slot ${key}`);
    if (kind === "var") return key in vars ? escape(String(vars[key])) : fail(`unknown var ${key}`);
    if (!(key in en)) fail(`unknown string ${key}`);
    return kind === "h" ? en[key] : escape(en[key]);
  });
  const out = hashMedia(html);
  return prefix ? rebase(out, prefix) : out;
}

/** Prefixes the page's own relative URLs (assets, media, icons) for a page in a subfolder. */
function rebase(html, prefix) {
  const own = (url) => !/^(?:[a-z][a-z0-9+.-]*:|\/|#|\.|\?)/i.test(url) && url !== "";
  html = html.replace(/(\s(?:src|href|poster|data-src|content)=")([^"]*)"/g, (m, attr, url) =>
    (attr.includes("content") ? /\.(png|jpe?g|webp)$/.test(url) && own(url) : own(url)) ? `${attr}${prefix}${url}"` : m);
  return html.replace(/(\s(?:srcset|imagesrcset)=")([^"]*)"/g, (m, attr, list) =>
    `${attr}${list.split(",").map((part) => { const p = part.trim(); return own(p) ? prefix + p : p; }).join(", ")}"`);
}

/** <head> lines for search engines and link previews. */
function renderSeo(lang) {
  const lines = [];
  const pageUrl = (l) => siteUrl && siteUrl + PAGES[l];
  if (siteUrl) {
    lines.push(`<link rel="canonical" href="${escape(pageUrl(lang))}">`);
    for (const l of LANGS) lines.push(`<link rel="alternate" hreflang="${l}" href="${escape(pageUrl(l))}">`);
    lines.push(`<link rel="alternate" hreflang="x-default" href="${escape(pageUrl("en"))}">`);
  }
  const image = siteUrl ? `${siteUrl}og-image.png` : "og-image.png";
  lines.push(
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="Vestra Player">`,
    `<meta property="og:title" content="${escape(en["meta.title"])}">`,
    `<meta property="og:description" content="${escape(en["meta.description"])}">`,
    `<meta property="og:locale" content="${OG_LOCALE[lang]}">`,
    ...LANGS.filter((l) => l !== lang).map((l) => `<meta property="og:locale:alternate" content="${OG_LOCALE[l]}">`),
    ...(siteUrl ? [`<meta property="og:url" content="${escape(pageUrl(lang))}">`] : []),
    `<meta property="og:image" content="${escape(image)}">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta property="og:image:alt" content="Vestra Player">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${escape(en["meta.title"])}">`,
    `<meta name="twitter:description" content="${escape(en["meta.description"])}">`,
    `<meta name="twitter:image" content="${escape(image)}">`,
  );
  // schema.org: the developer, the site and the application, linked by @id (with site.url). Facts only:
  // no ratings or reviews exist, so none are claimed; no FAQPage, since the page shows no FAQ.
  const id = (path, name) => (siteUrl ? { "@id": `${path}#${name}` } : {});
  const org = {
    "@type": "Organization",
    ...id(siteUrl, "organization"),
    name: ORG_NAME,
    ...(siteUrl ? { url: siteUrl, logo: `${siteUrl}icon-512.png` } : {}),
    ...(repoLinks().length ? { sameAs: repoLinks() } : {}),
  };
  const orgRef = siteUrl ? { "@id": org["@id"] } : org;
  const website = {
    "@type": "WebSite",
    ...id(pageUrl(lang), "website"),
    name: "Vestra Player",
    ...(siteUrl ? { url: pageUrl(lang) } : {}),
    inLanguage: lang,
    publisher: orgRef,
  };
  const screenshot = siteUrl && absoluteMedia(heroImage());
  const app = {
    "@type": "SoftwareApplication",
    ...id(pageUrl(lang), "software"),
    name: "Vestra Player",
    description: en["meta.description"],
    applicationCategory: "MultimediaApplication",
    applicationSubCategory: "Video player",
    operatingSystem: buttonSystems.map((os) => OS_NAMES[os]).join(", "),
    inLanguage: lang,
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    license: site.playerLicense.url,
    ...(release.ok ? { softwareVersion: release.version, ...(release.date ? { datePublished: release.date } : {}) } : {}),
    releaseNotes: `${releaseConfig.releasesPage.replace(/\/$/, "")}/latest`,
    downloadUrl: buttonSystems.map(stableUrl),
    featureList: featureNames(lang),
    ...(siteUrl ? { url: pageUrl(lang), image, screenshot } : {}),
    author: orgRef,
    publisher: orgRef,
    ...(site.links.playerRepo ? { sameAs: [site.links.playerRepo] } : {}),
  };
  const graph = { "@context": "https://schema.org", "@graph": [org, website, app] };
  lines.push(`<script type="application/ld+json">${JSON.stringify(graph).replace(/</g, "\\u003c")}</script>`);
  return lines.join("\n");
}

/** The repositories the developer is known by (site.config.json links). */
function repoLinks() {
  return [site.links.playerRepo, site.links.pluginsRepo].filter(Boolean);
}

/** The front window's picture (the LCP image): the frame screenshot, or a fullscreen take's poster. */
function heroImage() {
  const front = stageCard(manifest.stage.center);
  return front.fullscreen ? front.poster : frame.image;
}

/** A copied media file's absolute URL under its content-hashed name (siteUrl must be set). */
function absoluteMedia(path) {
  return siteUrl + (mediaNames.get(path) ?? path);
}

/** The feature names the themes show (their beats and extra plugins), once each, in the page's language. */
function featureNames(lang) {
  const names = manifest.themes.flatMap((th) => [...th.beats, ...(th.more ?? [])].map((b) => b.label[lang]));
  return [...new Set(names)];
}

/** robots.txt always; sitemap.xml (with hreflang alternates) only when site.url is set. */
function writeSeoFiles() {
  const robots = ["User-agent: *", "Allow: /"];
  if (siteUrl) robots.push("", `Sitemap: ${siteUrl}sitemap.xml`);
  writeFileSync(join(dist, "robots.txt"), robots.join("\n") + "\n");
  if (!siteUrl) return;
  writeFileSync(join(dist, "llms.txt"), renderLlms());
  const alternates = LANGS.map((l) => `    <xhtml:link rel="alternate" hreflang="${l}" href="${escape(siteUrl + PAGES[l])}"/>`)
    .concat(`    <xhtml:link rel="alternate" hreflang="x-default" href="${escape(siteUrl)}"/>`).join("\n");
  const modified = lastModified();
  const urls = LANGS.map((l) => `  <url>\n    <loc>${escape(siteUrl + PAGES[l])}</loc>${modified ? `\n    <lastmod>${modified}</lastmod>` : ""}\n${alternates}\n  </url>`);
  writeFileSync(join(dist, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.join("\n")}
</urlset>
`);
}

/**
 * The pages' last change for the sitemap: the later of the release date (the page shows the release)
 * and the page repository's last commit (its content). null when neither is known.
 */
function lastModified() {
  const dates = release.ok && release.date ? [release.date] : [];
  try {
    const commit = execFileSync("git", ["log", "-1", "--format=%cs"], { cwd: fromRoot(), encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    dates.push(commit);
  } catch {
    // Not a git checkout: the release date alone.
  }
  return dates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort().at(-1) ?? null;
}

/**
 * dist/llms.txt (https://llmstxt.org): what the page says, as plain Markdown for language models and
 * AI search. Built from the same configuration and strings as the page; English only.
 */
function renderLlms() {
  const text = dict.en;
  const words = (s, where) => {
    const n = s.split(/\s+/).filter(Boolean).length;
    if (n < 10 || n > 30) fail(`llms.txt: the description of ${where} has ${n} words (10 to 30)`);
    return s;
  };
  const item = (title, url, description) => url && `- [${title}](${url}): ${words(description, title)}`;
  const list = (items) => items.filter(Boolean).join("\n");
  const summary = text["meta.description"];
  if (summary.length >= 200) fail(`llms.txt: the summary (meta.description) is ${summary.length} characters (under 200)`);

  const req = (os) => releaseConfig.requirements[os]?.en;
  const platforms = systems.map((os) => req(os) ?? OS_NAMES[os]).join("; ");
  const noLinux = stableUrl("linux") ? "" : " There is no Linux build yet; one is in progress.";
  const player = site.playerLicense.name;
  const sdk = site.pluginsLicense.name;
  const repos = [
    ["the player", site.links.playerRepo], ["the plugins", site.links.pluginsRepo],
    ["the plugin SDK", site.links.sdkRepo], ["the download page", site.links.pageRepo],
  ].filter(([, url]) => url);
  const ai = manifest.themes.find((th) => th.id === "ai");
  const features = new Map();
  for (const th of manifest.themes) for (const b of [...th.beats, ...(th.more ?? [])]) if (!features.has(b.label.en)) features.set(b.label.en, b.caption.en);
  const latest = `${releaseConfig.releasesPage.replace(/\/$/, "")}/latest`;
  const architecture = site.links.playerRepo && `${site.links.playerRepo}/blob/main/doc/architecture.md`;
  const download = { windows: "installer", macos: "disk image" };

  const qa = [
    ["Is Vestra Player free?", `Yes. It is free and open source: the player is licensed under ${player}, the plugin SDK and the plugin repository under ${sdk}.`],
    ["Which systems does it run on?", `${platforms}.${noLinux}`],
    ["How is it related to mpv?", "Vestra Player plays video with libmpv, the playback library of mpv. Every feature beyond playback is a plugin."],
    ["What are plugins?", `Plugins are TypeScript on the public API of the plugin SDK (${sdk}). They are installed and updated from the Plugin Store inside the player; third-party plugins are reviewed as pull requests in the plugin repository, and anyone can run their own plugin store.`],
    ...(ai ? [["How does Vestra Player use AI?", ai.beats.map((b) => `${b.label.en}: ${b.caption.en}`).join(" ")]] : []),
    ...(repos.length ? [["Where is the source code?", `On GitHub: ${repos.map(([what, url]) => `${what} at ${url}`).join(", ")}.`]] : []),
  ];

  return `# Vestra Player

> ${summary}

## Key facts

- Developer: ${ORG_NAME}
- Platforms: ${systems.map((os) => `${OS_NAMES[os]} ${primary[os].arch}`).join(", ")} (${platforms}).${noLinux}
- License: the player is ${player}; the plugin SDK and the plugin repository are ${sdk}.
- Price: free.
- Open source: ${repos.map(([what]) => what).join(", ").replace(/, ([^,]*)$/, " and $1")}, all on GitHub.
- Playback: libmpv plays the video; every feature beyond playback is a plugin.
- Plugin Store: plugins install and update from the store inside the player; anyone can host their own store.
- AI: ${ai ? ai.beats.map((b) => b.label.en).join(", ") : "Ask Vestra"} (see the answers below).${site.links.playerRepo ? `\n- Contact: ${site.links.playerRepo}` : ""}

## Features

${[...features].map(([label, caption]) => `- ${label}: ${caption}`).join("\n")}

## Download

${list([
  item("Download page", siteUrl, "The official Vestra Player download page in English, with the installers for Windows and macOS, the feature tour and links to the source code."),
  item("Download page (Simplified Chinese)", siteUrl + PAGES["zh-Hans"], "The same download page in Simplified Chinese, with the same downloads, feature tour and links to the source code and plugin SDK."),
  item("Latest release", latest, "Release notes and every download of the newest Vestra Player version on GitHub, including the portable Windows build and the checksums."),
  ...buttonSystems.filter((os) => os !== "linux").map((os) =>
    item(`${OS_NAMES[os]} ${download[os] ?? "download"}`, stableUrl(os), `A direct link to the latest Vestra Player ${download[os] ?? "download"} for ${req(os) ?? OS_NAMES[os]}, always the newest release.`)),
])}

## Source and documentation

${list([
  item("Player source code", site.links.playerRepo, `The Vestra Player repository on GitHub: the player itself, which plays video with libmpv and runs every other feature as a plugin, licensed under ${player}.`),
  item("Architecture", architecture, "The architecture document in the player repository: how the player, its plugins and the public plugin API fit together."),
  item("Plugin repository", site.links.pluginsRepo, `The source of the plugins in the Plugin Store, where third-party plugins are reviewed as pull requests before they reach the signed store index; ${sdk}.`),
  item("Plugin SDK", site.links.sdkRepo, `The plugin SDK repository: the public TypeScript API that every Vestra Player plugin is written against, with tested examples, licensed under ${sdk}.`),
  item("SDK documentation", site.links.sdkDocs, "Guides, the API reference and tested examples for writing Vestra Player plugins in TypeScript with the plugin SDK."),
])}

## Questions and answers

${qa.map(([q, a]) => `### ${q}\n\n${a}`).join("\n\n")}

## Optional

${list([
  item("Host your own plugin store", site.links.sdkOwnStore, "How to run your own Vestra Player plugin store, even on GitHub, so the player installs and updates your plugins without anyone's approval."),
  item("Website source", site.links.pageRepo, "The source of this download page: a static site built with plain Node from the release metadata and the feature tour's media."),
])}
`;
}

// ---------------------------------------------------------------------------

function escape(text) {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function link(href, text) {
  return `<a href="${escape(href)}">${escape(text)}</a>`;
}

function format(template, args) {
  return template.replace(/\{(\w+)\}/g, (match, key) => args[key] ?? match);
}

/** A string of the page's language as an element: <tag>text</tag>. */
function t(key, tag = "span", attrs = "") {
  if (!(key in en)) fail(`unknown string ${key}`);
  return `<${tag}${attrs}>${escape(en[key])}</${tag}>`;
}

/** Same, for strings that hold HTML (links, <b>, <code>). */
function h(key, tag = "span", attrs = "") {
  if (!(key in en)) fail(`unknown string ${key}`);
  return `<${tag}${attrs}>${en[key]}</${tag}>`;
}

function hashed(source, name, ext) {
  const data = readFileSync(fromRoot(source));
  const file = `assets/${name}.${createHash("sha256").update(data).digest("hex").slice(0, 10)}.${ext}`;
  writeFileSync(join(dist, file), data);
  return file;
}

function checkFiles(files, where) {
  for (const file of files) {
    if (/^https?:/.test(file)) continue;
    if (!existsSync(fromRoot(file))) fail(`${where} names a missing file: ${file}`);
    if (statSync(fromRoot(file)).size > MAX_FILE) fail(`${file} is over 25 MiB (Cloudflare Pages limit)`);
  }
}

function checkManifest({ backdrop, frame, slides, stage }) {
  const files = [frame.image];
  if (!stage?.center || stage.near?.length !== 2 || stage.far?.length !== 2)
    fail('media/slides.json stage: needs "center", two "near" entries (slide ids, .webp stills or cards) and two "far" images');
  for (const entry of [stage.center, ...stage.near]) {
    if (typeof entry === "string") {
      if (!isStill(entry) && !slides.some((s) => s.id === entry)) fail(`media/slides.json stage names slide "${entry}", which is missing or hidden`);
      continue;
    }
    const where = `media/slides.json stage card ${JSON.stringify(entry.poster)}`;
    if (!entry.poster) fail(`${where}: a card needs a "poster"`);
    if (entry === stage.center && !entry.sources?.length) fail(`${where}: the center card needs "sources"`);
    if (entry === stage.center && entry.frame) fail(`${where}: the center card uses the main frame ("frame" is for near cards)`);
    if (entry.area && !frame.areas[entry.area]) fail(`${where}: area "${entry.area}" is not in frame.areas`);
    if (entry.frame && entry.area) fail(`${where}: "frame" and "area" exclude each other (a card frame's clip covers it under the title bar)`);
    if (entry.fullscreen && (entry.frame || entry.area)) fail(`${where}: a "fullscreen" card has no "frame" or "area" (the take is the whole screen)`);
    if (entry.fullscreen && !(entry.fullscreen.width > 0 && entry.fullscreen.height > 0)) fail(`${where}: "fullscreen" needs { "width", "height" } of the recording`);
  }
  if (typeof stage.center === "string" && isStill(stage.center)) fail("media/slides.json stage.center must play a clip (a slide id or a card)");
  files.push(...stage.far, ...stageFiles(stage));
  if (backdrop) {
    if (!backdrop.poster || !backdrop.sources?.length) fail("media/slides.json backdrop: needs a poster and sources");
    files.push(backdrop.poster, ...backdrop.sources.map((s) => s.src));
  }
  const ids = new Set();
  for (const slide of slides) {
    const where = `media/slides.json slide "${slide.id}"`;
    if (!/^[a-z0-9-]+$/.test(slide.id ?? "") || ids.has(slide.id)) fail(`${where}: id must be unique [a-z0-9-]`);
    ids.add(slide.id);
    // A fullscreen slide (the player's whole screen, no window frame) names its recording's size instead of an area.
    if (slide.fullscreen) {
      if (!(slide.fullscreen.width > 0 && slide.fullscreen.height > 0)) fail(`${where}: "fullscreen" needs { "width", "height" } of the recording`);
    } else if (!frame.areas[slide.area]) fail(`${where}: area "${slide.area}" is not in frame.areas`);
    for (const lang of LANGS)
      if (!slide.title?.[lang] || !slide.caption?.[lang]) fail(`${where}: title and caption need "${lang}"`);
    if (!slide.sources?.length) fail(`${where}: no sources`);
    files.push(slide.poster, ...slide.sources.map((s) => s.src), ...(slide.icon ? [slide.icon] : []));
  }
  files.push(...checkThemes(manifest.themes, ids));
  checkFiles(files, "media/slides.json");
}

/**
 * The feature themes: copy in every language, a known rail and glyph, full clips that exist, and
 * visible beats (and the outro) that tile the theme's video from 0 to its "duration" with no gap or
 * overlap (to 1/60 s), so the rail always follows the picture. Returns the files the themes name.
 */
function checkThemes(themes, slideIds) {
  if (!themes?.length) fail('media/slides.json: no "themes"');
  const files = [];
  const ids = new Set();
  const frame = 1 / 60 + 1e-6;
  for (const th of themes) {
    const where = `media/slides.json theme "${th.id}"`;
    if (!/^[a-z0-9-]+$/.test(th.id ?? "") || ids.has(th.id)) fail(`${where}: id must be unique [a-z0-9-]`);
    ids.add(th.id);
    for (const lang of LANGS) if (!th.title?.[lang]) fail(`${where}: title needs "${lang}"`);
    if (th.rail !== "icons" && th.rail !== "chips") fail(`${where}: "rail" must be "icons" or "chips"`);
    if (!th.poster || !th.sources?.length) fail(`${where}: needs a "poster" and "sources"`);
    if (!(th.duration > 0)) fail(`${where}: "duration" (seconds, the length of its video) is required`);
    if (!th.beats.length) fail(`${where}: no visible beats`);
    files.push(th.poster, ...th.sources.map((s) => s.src));
    let t = 0;
    for (const beat of th.beats) {
      const at = `${where} beat "${beat.id}"`;
      for (const lang of LANGS) {
        if (!beat.label?.[lang] || !beat.caption?.[lang]) fail(`${at}: label and caption need "${lang}"`);
        if (beat.fine && !beat.fine[lang]) fail(`${at}: fine print needs "${lang}"`);
      }
      if (th.rail === "icons" ? !beat.icon : !GLYPHS[beat.glyph]) fail(`${at}: needs ${th.rail === "icons" ? 'an "icon"' : `a "glyph" (${Object.keys(GLYPHS).join(", ")})`}`);
      if (beat.icon) files.push(beat.icon);
      if (beat.clip) fail(`${at}: "clip" is no longer supported (the full clips were removed on 2026-11-12)`);
      if (Math.abs(beat.start - t) > frame || !(beat.end > beat.start)) fail(`${at}: starts at ${beat.start} s, expected ${t} s (visible beats tile the video; a hidden beat's span must be cut out of it)`);
      t = beat.end;
    }
    for (const p of th.more ?? []) {
      for (const lang of LANGS) if (!p.label?.[lang] || !p.caption?.[lang]) fail(`${where} more "${p.id}": label and caption need "${lang}"`);
      if (!p.icon) fail(`${where} more "${p.id}": needs an "icon"`);
      files.push(p.icon);
    }
    if (th.outro) {
      for (const lang of LANGS) if (!th.outro.name?.[lang] || !th.outro.caption?.[lang]) fail(`${where} outro: name and caption need "${lang}"`);
      if (Math.abs(th.outro.start - t) > frame || !(th.outro.end > th.outro.start)) fail(`${where} outro: starts at ${th.outro.start} s, expected ${t} s`);
      t = th.outro.end;
    }
    if (Math.abs(t - th.duration) > frame) fail(`${where}: the beats end at ${t} s, the video lasts ${th.duration} s`);
  }
  return files;
}

/** Copies only the media the manifest names (local paths). */
/** Rewrites the page's references to copied media to their content-hashed names. */
function hashMedia(html) {
  const keys = [...mediaNames.keys()].sort((a, b) => b.length - a.length);
  if (!keys.length) return html;
  const esc = (k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(?<=["' ,(])(${keys.map(esc).join("|")})(?=["' ,)])`, "g");
  return html.replace(re, (m) => mediaNames.get(m));
}

function copyMedia() {
  const files = new Set([manifest.frame.image, ...manifest.stage.far, ...stageFiles(manifest.stage)]);
  // The backdrop clip ships only while the template shows it.
  if (manifest.backdrop && readFileSync(fromRoot("src/index.html"), "utf8").includes("{{slot:backdrop}}")) {
    files.add(manifest.backdrop.poster);
    for (const source of manifest.backdrop.sources) files.add(source.src);
  }
  for (const s of manifest.slides) {
    files.add(s.poster);
    if (s.icon) files.add(s.icon);
    for (const source of s.sources) files.add(source.src);
  }
  for (const th of manifest.themes) {
    files.add(th.poster);
    for (const source of th.sources) files.add(source.src);
    for (const beat of [...th.beats, ...(th.more ?? [])]) if (beat.icon) files.add(beat.icon);
  }
  for (const file of [...files]) {
    const smallCopy = file.replace(/\.webp$/, ".sm.webp");
    if (smallCopy !== file && existsSync(fromRoot(smallCopy))) files.add(smallCopy);
  }
  let bytes = 0;
  let count = 0;
  for (const file of files) {
    if (/^https?:/.test(file)) continue;
    // Content-hashed file names (as the CSS and JS), so a re-encoded clip or poster is never served
    // from a browser's cache under its old name; the page's references are rewritten (hashMedia).
    const data = readFileSync(fromRoot(file));
    const out = file.replace(/(\.[a-z0-9]+)$/i, `.${createHash("sha256").update(data).digest("hex").slice(0, 10)}$1`);
    mediaNames.set(file, out);
    mkdirSync(dirname(join(dist, out)), { recursive: true });
    writeFileSync(join(dist, out), data);
    bytes += statSync(fromRoot(file)).size;
    count++;
  }
  return { bytes, count };
}

function area(slide) {
  if (slide.fullscreen) return "left:0;top:0;width:100%;height:100%";
  const f = slide.frame;
  const a = f ? { x: 0, y: f.bar, width: f.width, height: f.height - f.bar } : manifest.frame.areas[slide.area];
  const frame = f ?? manifest.frame;
  const pct = (v, of) => `${((v / of) * 100).toFixed(4)}%`;
  return `left:${pct(a.x, frame.width)};top:${pct(a.y, frame.height)};width:${pct(a.width, frame.width)};height:${pct(a.height, frame.height)}`;
}

/** The looping video behind the hero; main.js starts it (never with reduced motion or Save-Data). */
function renderBackdrop() {
  const b = manifest.backdrop;
  if (!b) return "";
  const sources = b.sources.map((s) => `    <source src="${escape(s.src)}" type="${escape(s.type)}">`).join("\n");
  return `<div class="backdrop" aria-hidden="true">
  <video muted loop playsinline preload="none" poster="${escape(b.poster)}" tabindex="-1">
${sources}
  </video>
</div>`;
}

// ---- Download ----

function megabytes(bytes) {
  return bytes == null ? null : `${(bytes / 1e6).toFixed(1)} MB`;
}

function assetInfo(asset) {
  return release.ok ? release.assets[asset.id] ?? null : null;
}

function releasesPage() {
  return release.ok ? release.notesUrl : releaseConfig.releasesPage;
}

function downloadHref(asset) {
  return assetInfo(asset)?.url ?? releasesPage();
}

/**
 * The download buttons: one per configured system, each a direct link to the latest installer
 * (styles.css puts the visitor's first and makes it the primary one; the others are secondary).
 * Linux without an asset name is a disabled entry (no link, not focusable, aria-disabled).
 */
function renderCta(where) {
  const titles = { windows: "hero.forWindows", macos: /x64|intel/i.test(site.downloads?.macos ?? "") ? "hero.forMacIntel" : "hero.forMac", linux: "hero.forLinux" };
  const buttons = buttonSystems.map((os) => {
    const title = titles[os];
    return `      <a class="cta-btn os-${os}" data-cta="${where}" href="${escape(stableUrl(os))}">
        <svg class="cta-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5M5 19h14"/></svg>
        <span class="cta-text">${t(title, "span", ' class="cta-title"')}${t(`hero.sub.${os}`, "small", ' class="cta-sub"')}</span>
      </a>`;
  });
  if (!stableUrl("linux")) buttons.push(`      <span class="cta-btn cta-soon" role="link" aria-disabled="true">
        <span class="cta-text">${t("hero.linux", "span", ' class="cta-title"')}${t("hero.linuxSoon", "small", ' class="cta-sub"')}</span>
      </span>`);
  return buttons.join("\n");
}

function renderHeroSource() {
  const key = site.links.playerRepo ? "hero.source" : "hero.github";
  return `      <a class="ghost-btn" href="${escape(github)}">${GITHUB_ICON}${t(key)}</a>`;
}

/** Every enabled file, opened from "All downloads"; checksums stay on the release page. Linux: not yet. */
function renderPlatforms() {
  const lines = [];
  if (!release.ok) lines.push(`    <p class="pf-fallback">${t("dl.fallback")}</p>`);
  lines.push(`    <ul class="pf-list">`);
  for (const asset of enabled) {
    const info = assetInfo(asset);
    const facts = [t(`dl.kind.${asset.kind}`), t(`dl.arch.${asset.arch}`)];
    if (info?.size) facts.push(`<span>${escape(megabytes(info.size))}</span>`);
    lines.push(`      <li class="pf-item">
        <div class="pf-text">
          <p class="pf-name"><b>${OS_NAMES[asset.os] ?? asset.os}</b> ${facts.join('<span class="sep" aria-hidden="true">·</span>')}</p>
          ${h(`dl.note.${asset.kind}`, "p", ' class="pf-note"')}
        </div>
        <a class="pf-get" href="${escape(downloadHref(asset))}">${info ? t("dl.get") : t("hero.allReleases")}</a>
      </li>`);
  }
  if (!stableUrl("linux")) lines.push(`      <li class="pf-item pf-soon">
        <div class="pf-text">
          <p class="pf-name"><b>Linux</b> ${t("hero.linuxSoon")}</p>
        </div>
      </li>`);
  lines.push(`    </ul>`);
  if (systems.some((os) => releaseConfig.requirements[os])) {
    const req = systems
      .filter((os) => releaseConfig.requirements[os])
      .map((os) => t(`req.${os}`))
      .join('<span class="sep" aria-hidden="true">·</span>');
    lines.push(`    <p class="pf-req">${req}</p>`);
  }
  return lines.join("\n");
}

// ---- Hero stage and feature chapters: player windows ----

function stageSlide(id) {
  return manifest.slides.find((s) => s.id === id) ?? fail(`media/slides.json: no slide "${id}"`);
}

/** A "near" entry that is an image path (a screenshot over the client area) rather than a slide id. */
function isStill(entry) {
  return /\.webp$/.test(entry);
}

/**
 * A stage window: a slide id (that slide's clip, poster and area), a .webp still (an image over
 * the client area) or a card of its own: { poster, sources, area? } in the main frame, or
 * { poster, sources, frame } in a narrowed window (encode-clip --window), its clip under the title bar,
 * or { poster, sources, fullscreen: { width, height } }: a fullscreen take, the picture alone with no
 * window frame (like a fullscreen slide). Without "sources" a card is a still (near only).
 */
function stageCard(entry) {
  if (typeof entry === "string") return isStill(entry) ? { area: "client", poster: entry } : stageSlide(entry);
  const card = { area: entry.area ?? "client", poster: entry.poster, sources: entry.sources };
  if (entry.fullscreen) card.fullscreen = entry.fullscreen;
  if (entry.frame) {
    const { width, height } = webpSize(fromRoot(entry.frame));
    card.frame = { image: entry.frame, width, height, bar: manifest.frame.areas.client.y };
  }
  return card;
}

/** The files a stage card names beyond its slide's (slides copy their own). */
function stageFiles(stage) {
  return [stage.center, ...stage.near].flatMap((entry) =>
    typeof entry === "string" ? (isStill(entry) ? [entry] : []) : [entry.poster, ...(entry.sources ?? []).map((s) => s.src), ...(entry.frame ? [entry.frame] : [])]);
}

/** "small.webp 896w, full.webp 1792w" when the half-width copy exists (encode-clip --small), else null. */
function srcset(path) {
  const smallPath = path.replace(/\.webp$/, ".sm.webp");
  if (smallPath === path || !existsSync(fromRoot(smallPath))) return null;
  return `${smallPath} ${webpSize(fromRoot(smallPath)).width}w, ${path} ${webpSize(fromRoot(path)).width}w`;
}

function imgSrc(path, sizesKey) {
  const set = srcset(path);
  return set ? `src="${escape(path)}" srcset="${escape(set)}" sizes="${SIZES[sizesKey]}"` : `src="${escape(path)}"`;
}

function size(slide) {
  if (slide.fullscreen) return `width="${slide.fullscreen.width}" height="${slide.fullscreen.height}"`;
  if (slide.frame) return `width="${slide.frame.width}" height="${slide.frame.height - slide.frame.bar}"`;
  return `width="${frame.areas[slide.area].width}" height="${frame.areas[slide.area].height}"`;
}

/** The clip over the window's client area: the poster underneath, the video on top once it plays (main.js). */
function renderShot(slide, { lazy, sizes, alt = "", loop = true }) {
  const load = lazy ? ' loading="lazy"' : ' fetchpriority="high"';
  const sources = slide.sources.map((s) => `<source data-src="${escape(s.src)}" type="${escape(s.type)}">`).join("");
  return `<div class="shot" style="${area(slide)}"><img ${imgSrc(slide.poster, sizes)} ${size(slide)}${load} decoding="async" alt="${escape(alt)}"><video muted${loop ? " loop" : ""} playsinline preload="none" aria-hidden="true" tabindex="-1">${sources}</video></div>`;
}

function renderChrome(lazy, alt, sizes, f = frame) {
  const altAttr = alt ? ` alt="${escape(en["frame.alt"])}"` : ' alt=""';
  const load = lazy ? ' loading="lazy"' : alt ? ' fetchpriority="high"' : "";
  return `<img class="chrome" ${imgSrc(f.image, sizes)} width="${f.width}" height="${f.height}"${load} decoding="async"${altAttr}>`;
}

/** A card in a narrowed window, or a fullscreen take, takes that shape (styles.css: --ar). */
function cardShape(slide) {
  const s = slide.fullscreen ?? slide.frame;
  return s ? ` style="--ar:${(s.width / s.height).toFixed(4)}"` : "";
}

/** The window frame over a stage card; a fullscreen take has none. */
function cardChrome(slide, lazy, alt, sizes) {
  return slide.fullscreen ? "" : renderChrome(lazy, alt, sizes, slide.frame);
}

/** The card's classes: "is-full" for a fullscreen take (styles.css). */
function cardClass(base, slide) {
  return `card ${base}${slide.fullscreen ? " is-full" : ""}`;
}

/** Five windows fanned in depth, standing still (a short entrance on load, a mouse tilt). */
function renderStage() {
  const st = manifest.stage;
  const near = st.near.map(stageCard);
  const center = stageCard(st.center);
  const farH = Math.round((640 * frame.height) / frame.width);
  const far = (src, side) =>
    `          <div class="card card-far card-${side}" aria-hidden="true"><img src="${escape(src)}" width="640" height="${farH}" loading="lazy" decoding="async" alt=""></div>`;
  // A still is its image only. A slide plays its clip (its poster and sources, the same files as
  // its tour feature but its own <video>): main.js starts it after the front window's clip, on wide
  // screens only, and pauses it with the front window.
  const side = (slide, s) => slide.sources
    ? `          <div class="${cardClass(`card-near card-${s}`, slide)}" aria-hidden="true" data-companion="hero"${cardShape(slide)}>${cardChrome(slide, true, false, "near")}${renderShot(slide, { lazy: true, sizes: "near" })}</div>`
    : `          <div class="${cardClass(`card-near card-${s}`, slide)}" aria-hidden="true"${cardShape(slide)}>${cardChrome(slide, true, false, "near")}<div class="shot" style="${area(slide)}"><img ${imgSrc(slide.poster, "near")} ${size(slide)} loading="lazy" decoding="async" alt=""></div></div>`;
  return [
    far(st.far[0], "l"),
    far(st.far[1], "r"),
    side(near[0], "l"),
    side(near[1], "r"),
    `          <div class="${cardClass("card-main", center)}" data-media="hero"${cardShape(center)}>${cardChrome(center, false, true, "hero")}${renderShot(center, { lazy: false, sizes: "hero", alt: center.fullscreen ? en["frame.alt"] : "" })}</div>`,
  ].join("\n");
}

/**
 * The feature themes as a sticky scroll showcase (the layout of 1d56f43; user request 2026-11-13):
 * the three themes scroll on the left, one entry each: a head (number and title; no lede, user ruling
 * 2026-11-12), the active beat's caption and a rail of the beats (plugin icons or chips) whose
 * progress follows the video's clock (main.js). One sticky window on the right holds a layer per
 * theme and shows the theme at the reading line, playing its pre-composited loop (its beats in
 * sequence). Only the themes scroll, not the beats (user, 2026-11-13). Phones: the window sticks
 * under the header, the themes scroll beneath. Without script, with reduced motion or Save-Data the
 * poster stays and a list of every beat (icon, name, sentence) replaces the caption and the rail;
 * the list is in the HTML either way, for search engines.
 */
function renderThemes(lang) {
  const n = (k) => String(k).padStart(2, "0");
  const count = manifest.themes.length;
  const L = (o) => o[lang];
  const icon = (th, beat) => th.rail === "icons"
    ? `<img src="${escape(beat.icon)}" width="52" height="52" loading="lazy" decoding="async" alt="">`
    : `<svg viewBox="0 0 24 24" aria-hidden="true">${GLYPHS[beat.glyph]}</svg>`;
  const fine = (beat) => (beat.fine ? ` <small class="th-fine">${escape(L(beat.fine))}</small>` : "");
  const layers = manifest.themes.map((th, i) => {
    const sources = th.sources.map((s) => `<source data-src="${escape(s.src)}" type="${escape(s.type)}"${s.media ? ` media="${escape(s.media)}"` : ""}>`).join("");
    return `<div class="th-frame" data-theme="${i}"${i === 0 ? " data-on" : ""}><img ${imgSrc(th.poster, "theme")} width="1728" height="1080" loading="lazy" decoding="async" alt=""><video muted loop playsinline preload="none" aria-hidden="true" tabindex="-1">${sources}</video></div>`;
  }).join("\n            ");
  const entries = manifest.themes.map((th, i) => {
    const first = th.beats[0];
    // outro.plugins: the store's plugin count when tiles and plugins differ (one Motion Smoothing tile stands for two
    // plugins, 2026-11-27); otherwise every tile is one plugin.
    const plugins = th.outro?.plugins ?? th.beats.length + (th.more?.length ?? 0);
    const outro = th.outro && {
      name: L(th.outro.name),
      caption: format(L(th.outro.caption), { n: NUMBERS[lang][plugins] ?? String(plugins) }),
    };
    const items = th.beats.map((beat, k) =>
      `<button type="button" class="th-item" data-k="${k}" style="--k:${k}" aria-label="${escape(L(beat.label))}"${k === 0 ? ' aria-current="true"' : ""}><span class="ic">${icon(th, beat)}</span>${th.rail === "icons" ? "" : `<span class="lb">${escape(L(beat.label))}</span>`}<i class="pg"><b></b></i></button>`).join("");
    // Plugins a theme lists without a beat ("more", 2026-11-23): the same icon at the same size in the rail, not a
    // button (they have no part of the video); in the list for no-motion visitors like the beats.
    const more = (th.more ?? []).map((p) =>
      `<span class="th-item th-xtra" title="${escape(L(p.label))}"><span class="ic">${icon(th, p)}</span><i class="pg"><b></b></i></span>`).join("");
    const list = [...th.beats, ...(th.more ?? [])].map((beat) =>
      `          <li><span class="ic">${icon(th, beat)}</span><span class="tx"><b>${escape(L(beat.label))}</b> <span>${escape(L(beat.caption))}</span>${fine(beat)}</span></li>`).join("\n");
    return `        <article class="theme th-${th.rail}${th.beats.length > 4 ? " th-many" : ""}${th.beats.length + (th.more?.length ?? 0) > 6 ? " th-rows" : ""}" id="theme-${th.id}" data-theme="${i}"${i === 0 ? " data-on" : ""} aria-labelledby="theme-${th.id}-title">
          <div class="th-head">
            <p class="ch-num" aria-hidden="true">${n(i + 1)}<span>/${n(count)}</span></p><h3 id="theme-${th.id}-title">${escape(L(th.title))}</h3>
          </div>
          <div class="th-live js-only">
            <p class="th-cap"><b class="th-name">${escape(L(first.label))}</b> <span class="th-text">${escape(L(first.caption))}${fine(first)}</span></p>
            <div class="th-rail"><div class="th-items" role="group" aria-label="${escape(L(th.title))}">${items}${more}</div></div>
          </div>
          <div class="th-static">
            <ul class="th-list">
${list}
            </ul>${outro ? `\n            <p class="th-outro"><b>${escape(outro.name)}</b> <span>${escape(outro.caption)}</span></p>` : ""}
          </div>
        </article>`;
  }).join("\n");
  return `    <div class="th-grid">
      <div class="th-steps">
${entries}
      </div>
      <div class="th-media">
        <div class="th-sticky">
          <div class="th-window">
            ${layers}
          </div>
        </div>
      </div>
    </div>`;
}

// ---- Open source ----

function renderOpenSource() {
  const blocks = [
    ["player", site.links.playerRepo, "os.player.link"],
    ["sdk", site.links.sdkDocs, "os.sdk.link"],
    ["community", site.links.pluginsRepo, "os.community.link"],
    // Anyone's own store (a third-party repository in the Plugin Store).
    ["stores", site.links.sdkOwnStore, "os.stores.link"],
  ];
  return blocks.map(([id, href, label]) => `      <li class="os-card">
        <h3>${t(`os.${id}.title`)}</h3>
        ${h(`os.${id}.text`, "p")}
        ${href ? `<a class="text-link" href="${escape(href)}">${t(label)} →</a>` : ""}
      </li>`).join("\n");
}

// ---- Footer ----

function renderLinks() {
  const entries = [
    ["playerRepo", "ft.player"],
    ["pluginsRepo", "ft.plugins"],
    ["sdkRepo", "ft.sdk"],
    ["sdkDocs", "ft.sdkDocs"],
    ["pageRepo", "ft.page"],
  ];
  return entries
    .filter(([key]) => site.links[key])
    .map(([key, label]) => `        <li><a href="${escape(site.links[key])}">${escape(en[label])}</a></li>`)
    .join("\n");
}

/** media/CREDITS.md: the bullet lines of its "## Footer" (English) and "## Footer (<lang>)" sections, by language; the record table is not shown. */
function parseCredits(markdown) {
  const byLang = {};
  let lang = null;
  for (const line of markdown.split(/\r?\n/)) {
    const heading = line.match(/^##\s+(.*?)\s*$/);
    if (heading) {
      const footer = heading[1].match(/^Footer(?:\s+\(([^)]+)\))?$/i);
      lang = footer ? footer[1] ?? "en" : null;
      continue;
    }
    if (lang && /^[-*]\s/.test(line)) (byLang[lang] ??= []).push(line.replace(/^[-*]\s+/, "").trim());
  }
  return byLang;
}

function inlineMarkdown(text = "") {
  const parts = [];
  let last = 0;
  for (const match of text.matchAll(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g)) {
    parts.push(escape(text.slice(last, match.index)), link(match[2], match[1]));
    last = match.index + match[0].length;
  }
  parts.push(escape(text.slice(last)));
  return parts.join("").replace(/`([^`]+)`/g, "<code>$1</code>");
}

function renderCredits(lang) {
  // The footer lists only footage the page shows: a backdrop line goes when the template has no backdrop.
  const backdropShown = readFileSync(fromRoot("src/index.html"), "utf8").includes("{{slot:backdrop}}");
  const lines = (credits[lang] ?? credits.en ?? [])
    .filter((line) => backdropShown || !/\(hero backdrop\)/i.test(line))
    .map((line) => line.replace(/\s*\(hero backdrop\)\s*/i, " ").trim());
  if (!lines.length) return `      <p>—</p>`;
  const items = lines.map((line) => `        <li>${inlineMarkdown(line)}</li>`);
  return `      <ul class="credits">\n${items.join("\n")}\n      </ul>`;
}
