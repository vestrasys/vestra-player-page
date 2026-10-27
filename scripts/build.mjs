// npm run build: renders src/index.html into dist/ with the release metadata,
// the slide manifest and both languages baked in. No dependencies.
//
// Environment: GITHUB_TOKEN (optional, raises the API rate limit and reads a
// private release repository), RELEASE_OFFLINE=1 (skip the network; the page
// uses its fallback), RELEASE_INCLUDE_PRERELEASES=1 (preview with a prerelease).
import { createHash } from "node:crypto";
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fail, fromRoot, kib, readJson } from "./lib.mjs";
import { loadRelease } from "./release.mjs";

const LANGS = ["en", "zh-Hans"];
const BUDGET = 150 * 1024; // HTML + CSS + JS, media and images excluded
const MAX_FILE = 25 * 1024 * 1024; // Cloudflare Pages per-file limit

const dist = fromRoot("dist");
const site = readJson(fromRoot("site.config.json"));
const releaseConfig = readJson(fromRoot("release.config.json"));
if (process.env.RELEASE_INCLUDE_PRERELEASES === "1") releaseConfig.includePrereleases = true;
const manifest = readJson(fromRoot("media/slides.json"));
// Hidden slides (drafts such as a slide whose recording does not exist yet) stay out of the page.
manifest.slides = (manifest.slides ?? []).filter((slide) => !slide.hidden);
const i18n = readJson(fromRoot("src/i18n.json"));
const credits = parseCredits(readFileSync(fromRoot("media/CREDITS.md"), "utf8"));

checkManifest(manifest);
const release = await loadRelease(releaseConfig, { offline: process.env.RELEASE_OFFLINE === "1" });
if (release.ok) console.log(`release ${release.version} (${release.date}), assets: ${Object.keys(release.assets).join(", ") || "none"}`);
else console.warn(`warning: no release metadata (${release.reason}); building the fallback`);

// Strings built from configuration join the dictionary, so the page switches them too.
const dict = structuredClone(i18n);
for (const lang of LANGS) {
  for (const slide of manifest.slides) {
    dict[lang][`slide.${slide.id}.title`] = slide.title[lang];
    dict[lang][`slide.${slide.id}.caption`] = slide.caption[lang];
  }
  for (const [os, text] of Object.entries(releaseConfig.requirements)) dict[lang][`req.${os}`] = text[lang];
  dict[lang]["frame.alt"] = manifest.frame.alt[lang];
  dict[lang]["ft.licence"] = format(dict[lang]["ft.licence"], {
    player: link(site.playerLicense.url, site.playerLicense.name),
    plugins: link(site.pluginsLicense.url, site.pluginsLicense.name),
  });
  const missing = Object.keys(dict.en).filter((key) => !(key in dict[lang]));
  if (missing.length) fail(`${lang} lacks strings: ${missing.join(", ")}`);
}
const en = dict.en;

rmSync(dist, { recursive: true, force: true });
mkdirSync(join(dist, "assets"), { recursive: true });
cpSync(fromRoot("public"), dist, { recursive: true });
const css = hashed("src/styles.css", "site", "css");
const js = hashed("src/main.js", "site", "js");
const media = copyMedia();

const frame = manifest.frame;
const slots = {
  backdrop: renderBackdrop(),
  cta: renderCta(),
  slides: manifest.slides.map(renderSlide).join("\n"),
  caption: renderCaption(manifest.slides[0]),
  dots: manifest.slides.map(renderDot).join("\n"),
  downloads: renderDownloads(),
  requirements: renderRequirements(),
  links: renderLinks(),
  credits: renderCredits(),
  licence: en["ft.licence"],
  data: JSON.stringify({
    langs: LANGS,
    i18n: dict,
    slides: manifest.slides.map((s) => ({ id: s.id, icon: s.icon ?? null, poster: s.poster })),
  }).replace(/</g, "\\u003c"),
};
const vars = {
  css, js,
  firstPoster: manifest.slides[0].poster,
  backdropPoster: manifest.backdrop?.poster ?? manifest.slides[0].poster,
  frameImage: frame.image,
  frameWidth: frame.width,
  frameHeight: frame.height,
  frameRatio: `${frame.width} / ${frame.height}`,
  frameRatioNumber: (frame.width / frame.height).toFixed(4),
  frameAlt: en["frame.alt"],
};

let html = readFileSync(fromRoot("src/index.html"), "utf8");
html = html.replace(/\{\{(t|h|var|slot):([\w.-]+)\}\}/g, (_, kind, key) => {
  if (kind === "slot") return key in slots ? slots[key] : fail(`unknown slot ${key}`);
  if (kind === "var") return key in vars ? escape(String(vars[key])) : fail(`unknown var ${key}`);
  if (!(key in en)) fail(`unknown string ${key}`);
  return kind === "h" ? en[key] : escape(en[key]);
});
writeFileSync(join(dist, "index.html"), html);

// Budget and size report.
const sizes = { "index.html": Buffer.byteLength(html), [css]: statSync(join(dist, css)).size, [js]: statSync(join(dist, js)).size };
const total = Object.values(sizes).reduce((a, b) => a + b, 0);
for (const [file, size] of Object.entries(sizes)) console.log(`  ${file.padEnd(28)} ${kib(size)}`);
console.log(`  HTML/CSS/JS total            ${kib(total)} (budget ${kib(BUDGET)})`);
console.log(`  media copied                 ${media.count} files, ${kib(media.bytes)}`);
if (total > BUDGET) fail("HTML/CSS/JS over budget");
console.log(`built dist/index.html${release.ok ? "" : " (release fallback)"}`);

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

/** A text node that the page re-translates: <tag data-i18n="key">English</tag>. */
function t(key, tag = "span", attrs = "") {
  if (!(key in en)) fail(`unknown string ${key}`);
  return `<${tag} data-i18n="${key}"${attrs}>${escape(en[key])}</${tag}>`;
}

function hashed(source, name, ext) {
  const data = readFileSync(fromRoot(source));
  const file = `assets/${name}.${createHash("sha256").update(data).digest("hex").slice(0, 10)}.${ext}`;
  writeFileSync(join(dist, file), data);
  return file;
}

function checkManifest({ backdrop, frame, slides }) {
  const files = [frame.image];
  if (backdrop) {
    if (!backdrop.poster || !backdrop.sources?.length) fail("media/slides.json backdrop: needs a poster and sources");
    files.push(backdrop.poster, ...backdrop.sources.map((s) => s.src));
  }
  if (!slides?.length) fail("media/slides.json: no slides");
  const ids = new Set();
  for (const slide of slides) {
    const where = `media/slides.json slide "${slide.id}"`;
    if (!/^[a-z0-9-]+$/.test(slide.id ?? "") || ids.has(slide.id)) fail(`${where}: id must be unique [a-z0-9-]`);
    ids.add(slide.id);
    if (!frame.areas[slide.area]) fail(`${where}: area "${slide.area}" is not in frame.areas`);
    for (const lang of LANGS)
      if (!slide.title?.[lang] || !slide.caption?.[lang]) fail(`${where}: title and caption need "${lang}"`);
    if (!slide.sources?.length) fail(`${where}: no sources`);
    files.push(slide.poster, ...slide.sources.map((s) => s.src), ...(slide.icon ? [slide.icon] : []));
  }
  for (const file of files) {
    if (/^https?:/.test(file)) continue;
    if (!existsSync(fromRoot(file))) fail(`media/slides.json names a missing file: ${file}`);
    if (statSync(fromRoot(file)).size > MAX_FILE) fail(`${file} is over 25 MiB (Cloudflare Pages limit)`);
  }
}

/** Copies only the media the manifest names (local paths). */
function copyMedia() {
  const files = new Set([manifest.frame.image]);
  if (manifest.backdrop) {
    files.add(manifest.backdrop.poster);
    for (const source of manifest.backdrop.sources) files.add(source.src);
  }
  for (const s of manifest.slides) {
    files.add(s.poster);
    if (s.icon) files.add(s.icon);
    for (const source of s.sources) files.add(source.src);
  }
  let bytes = 0;
  let count = 0;
  for (const file of files) {
    if (/^https?:/.test(file)) continue;
    mkdirSync(dirname(join(dist, file)), { recursive: true });
    copyFileSync(fromRoot(file), join(dist, file));
    bytes += statSync(fromRoot(file)).size;
    count++;
  }
  return { bytes, count };
}

function area(slide) {
  const a = manifest.frame.areas[slide.area];
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

function renderSlide(slide, i) {
  const first = i === 0;
  const sources = slide.sources
    .map((s) => `              <source ${first ? "src" : "data-src"}="${escape(s.src)}" type="${escape(s.type)}">`)
    .join("\n");
  return `          <div class="slide${first ? " is-active" : ""}" data-slide="${i}" style="${area(slide)}">
            <video muted loop playsinline preload="${first ? "metadata" : "none"}" ${first ? "poster" : "data-poster"}="${escape(slide.poster)}" aria-hidden="true" tabindex="-1">
${sources}
            </video>
          </div>`;
}

function renderCaption(slide) {
  const icon = slide.icon
    ? `<img class="slide-icon" src="${escape(slide.icon)}" width="28" height="28" alt="">`
    : `<img class="slide-icon" width="28" height="28" alt="" hidden>`;
  return `        <h2 class="slide-title">${icon}${t(`slide.${slide.id}.title`)}</h2>
        <p class="slide-text">${t(`slide.${slide.id}.caption`)}</p>`;
}

function renderDot(slide, i) {
  const label = format(en["tour.show"], { n: i + 1, title: slide.title.en });
  return `          <button type="button" class="dot-btn" data-go="${i}" aria-label="${escape(label)}"${i === 0 ? ' aria-current="true"' : ""}><span class="fill"></span></button>`;
}

function megabytes(bytes) {
  return bytes == null ? null : `${(bytes / 1e6).toFixed(1)} MB`;
}

function assetInfo(id) {
  return release.ok ? release.assets[id] ?? null : null;
}

function releasesPage() {
  return release.ok ? release.notesUrl : releaseConfig.releasesPage;
}

function renderCta() {
  const enabled = releaseConfig.assets.filter((a) => a.enabled);
  const buttons = [];
  const button = (asset, titleKey, subKey) => {
    const info = assetInfo(asset.id);
    const facts = info ? [release.version, megabytes(info.size)].filter(Boolean).join(" · ") : null;
    const href = info?.url ?? releasesPage();
    return `      <a class="cta-btn" data-os="${asset.os}" data-arch="${asset.arch}" href="${escape(href)}">
        ${t(titleKey, "span", ' class="cta-title"')}
        <span class="cta-sub">${t(subKey)}${facts ? ` · ${escape(facts)}` : ` · ${t("hero.allReleases")}`}</span>
      </a>`;
  };
  const setup = enabled.find((a) => a.id === "windows-setup") ?? enabled.find((a) => a.os === "windows");
  if (setup) buttons.push(button(setup, "hero.forWindows", "hero.subWindows"));
  for (const mac of enabled.filter((a) => a.os === "macos")) {
    if (mac.arch === "arm64") buttons.push(button(mac, "hero.forMac", "hero.subMac"));
    else if (mac.arch === "x64") buttons.push(button(mac, "hero.forMacIntel", "hero.subMacIntel"));
    else buttons.push(button(mac, "hero.forMac", "hero.subMacUniversal"));
  }
  return buttons.join("\n");
}

function renderDownloads() {
  const enabled = releaseConfig.assets.filter((a) => a.enabled);
  const lines = [];
  if (!release.ok) lines.push(`    <p class="fallback">${t("dl.fallback", "span")} <a href="${escape(releaseConfig.releasesPage)}">${t("hero.allReleases")}</a></p>`);
  lines.push(`    <div class="dl-grid">`);
  for (const asset of enabled) {
    const info = assetInfo(asset.id);
    const value = (text) => (text ? escape(text) : t("dl.unknown"));
    const sha = info?.sha256
      ? `<code class="hash">${escape(info.sha256)}</code><button type="button" class="copy js-only" data-copy="${escape(info.sha256)}" data-i18n="dl.copy">${escape(en["dl.copy"])}</button>`
      : t("dl.unknown");
    const kindKey = `dl.kind.${asset.kind}`;
    lines.push(`      <article class="dl-card" data-os="${asset.os}" id="dl-${asset.id}">
        <h3>${t(asset.os === "windows" ? "dl.windows" : "dl.macos")} <small>${t(kindKey)}${asset.os === "macos" ? ` · ${t(`dl.arch.${asset.arch}`)}` : ""}</small></h3>
        <dl class="meta">
          <div><dt data-i18n="dl.version">${escape(en["dl.version"])}</dt><dd>${value(release.ok ? release.version : releaseConfig.fallbackVersion)}</dd></div>
          <div><dt data-i18n="dl.released">${escape(en["dl.released"])}</dt><dd>${value(release.ok ? release.date : null)}</dd></div>
          <div><dt data-i18n="dl.size">${escape(en["dl.size"])}</dt><dd>${value(megabytes(info?.size))}</dd></div>
          <div class="sha"><dt data-i18n="dl.sha">${escape(en["dl.sha"])}</dt><dd>${sha}</dd></div>
        </dl>
        <a class="btn" href="${escape(info?.url ?? releasesPage())}"${info ? ` download="${escape(info.name)}"` : ""}>${info ? t("dl.get") : t("hero.allReleases")}</a>
        <p class="note" data-i18n-html="dl.note.${asset.kind}">${en[`dl.note.${asset.kind}`]}</p>
      </article>`);
  }
  lines.push(`    </div>`);
  return lines.join("\n");
}

function renderRequirements() {
  const items = Object.keys(releaseConfig.requirements)
    .map((os) => `        <li><b>${os === "windows" ? "Windows" : "macOS"}</b> ${t(`req.${os}`)}</li>`)
    .join("\n");
  return `      <h3 data-i18n="dl.req">${escape(en["dl.req"])}</h3>
      <ul class="req">
${items}
      </ul>
      <p><a href="${escape(releasesPage())}" data-i18n="dl.all">${escape(en["dl.all"])}</a></p>`;
}

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
    .map(([key, label]) => `        <li><a href="${escape(site.links[key])}" data-i18n="${label}">${escape(en[label])}</a></li>`)
    .join("\n");
}

/** media/CREDITS.md: the first Markdown table (Title | Author | Licence | Source | ...). */
function parseCredits(markdown) {
  const rows = markdown.split(/\r?\n/).filter((line) => line.trim().startsWith("|"));
  if (rows.length < 2) return [];
  // Cells split on unescaped pipes; `\|` is a literal pipe.
  const cells = (line) =>
    line.trim().replace(/^\||(?<!\\)\|$/g, "").split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|"));
  const header = cells(rows[0]).map((h) => h.toLowerCase());
  return rows.slice(2).map((row) => Object.fromEntries(cells(row).map((c, i) => [header[i], c])));
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

function renderCredits() {
  const rows = credits.filter((row) => row.title);
  if (!rows.length) return `      <p>—</p>`;
  const items = rows.map((row) => {
    const bits = [row.title, row.attribution || row.author, row.licence ?? row.license]
      .filter((cell) => cell && !/^[—–-]$/.test(cell))
      .map(inlineMarkdown);
    const source = row.source && !/^[—–-]$/.test(row.source) ? ` (${inlineMarkdown(row.source)})` : "";
    return `        <li>${bits.join(", ")}${source}</li>`;
  });
  return `      <ul class="credits">\n${items.join("\n")}\n      </ul>`;
}
