// npm run build: renders src/index.html into dist/ with the release metadata,
// the slide manifest, the plugin wall and both languages baked in. No dependencies.
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
const OS_NAMES = { windows: "Windows", macos: "macOS" };
// The GitHub mark (Octicons mark-github, MIT).
const GITHUB_ICON = '<svg class="gh-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"/></svg>';

const dist = fromRoot("dist");
const site = readJson(fromRoot("site.config.json"));
const releaseConfig = readJson(fromRoot("release.config.json"));
if (process.env.RELEASE_INCLUDE_PRERELEASES === "1") releaseConfig.includePrereleases = true;
const manifest = readJson(fromRoot("media/slides.json"));
// Hidden slides (drafts such as a slide whose recording does not exist yet) stay out of the page.
manifest.slides = (manifest.slides ?? []).filter((slide) => !slide.hidden);
const plugins = readJson(fromRoot("src/plugins.json")).plugins ?? [];
const i18n = readJson(fromRoot("src/i18n.json"));
const credits = parseCredits(readFileSync(fromRoot("media/CREDITS.md"), "utf8"));

checkManifest(manifest);
checkPlugins(plugins);
const release = await loadRelease(releaseConfig, { offline: process.env.RELEASE_OFFLINE === "1" });
if (release.ok) console.log(`release ${release.version} (${release.date}), assets: ${Object.keys(release.assets).join(", ") || "none"}`);
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
  for (const plugin of plugins) {
    dict[lang][`plugin.${plugin.id}.name`] = plugin.name[lang];
    dict[lang][`plugin.${plugin.id}.text`] = plugin.text[lang];
  }
  for (const [os, text] of Object.entries(releaseConfig.requirements)) dict[lang][`req.${os}`] = text[lang];
  dict[lang]["frame.alt"] = manifest.frame.alt[lang];
  for (const key of ["ft.licence", "os.player.text", "os.sdk.text"]) dict[lang][key] = format(dict[lang][key], licences);
  const missing = Object.keys(dict.en).filter((key) => !(key in dict[lang]));
  if (missing.length) fail(`${lang} lacks strings: ${missing.join(", ")}`);
}
const en = dict.en;

// Downloads: one primary file per system, every enabled file in the platforms dialog.
const enabled = releaseConfig.assets.filter((a) => a.enabled);
const primary = {
  windows: enabled.find((a) => a.id === "windows-setup") ?? enabled.find((a) => a.os === "windows") ?? null,
  macos: ["universal", "arm64", "x64"].map((arch) => enabled.find((a) => a.os === "macos" && a.arch === arch)).find(Boolean) ?? null,
};
const systems = Object.keys(primary).filter((os) => primary[os]);
if (!systems.length) fail("release.config.json: no enabled asset for Windows or macOS");

rmSync(dist, { recursive: true, force: true });
mkdirSync(join(dist, "assets"), { recursive: true });
cpSync(fromRoot("public"), dist, { recursive: true });
const css = hashed("src/styles.css", "site", "css");
const js = hashed("src/main.js", "site", "js");
const media = copyMedia();

const frame = manifest.frame;
const github = site.links.playerRepo ?? `https://github.com/${releaseConfig.github.owner}`;
const slots = {
  backdrop: renderBackdrop(),
  cta: renderCta("hero"),
  ctaLine: renderCtaLine(),
  ctaEnd: renderCta("end"),
  heroSource: renderHeroSource(),
  githubIcon: GITHUB_ICON,
  stage: renderStage(),
  chapters: manifest.slides.map(renderChapter).join("\n"),
  pauseHero: renderPause("hero"),
  plugins: plugins.map(renderPlugin).join("\n"),
  pluginLinks: renderPluginLinks(),
  openSource: renderOpenSource(),
  platforms: renderPlatforms(),
  links: renderLinks(),
  credits: renderCredits(),
  licence: en["ft.licence"],
  data: JSON.stringify({
    langs: LANGS,
    i18n: dict,
    slides: manifest.slides.map((s) => s.id),
  }).replace(/</g, "\\u003c"),
};
const vars = {
  css, js,
  stagePoster: stageSlide(manifest.stage.center).poster,
  frameImage: frame.image,
  frameWidth: frame.width,
  frameHeight: frame.height,
  frameRatio: `${frame.width} / ${frame.height}`,
  frameAlt: en["frame.alt"],
  github,
  navHref: downloadHref(primary[systems[0]]),
  releasesPage: releaseConfig.releasesPage,
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

/** Same, for strings that hold HTML (links, <b>, <code>). */
function h(key, tag = "span", attrs = "") {
  if (!(key in en)) fail(`unknown string ${key}`);
  return `<${tag} data-i18n-html="${key}"${attrs}>${en[key]}</${tag}>`;
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
    fail('media/slides.json stage: needs "center", two "near" slide ids and two "far" images');
  for (const id of [stage.center, ...stage.near])
    if (!slides.some((s) => s.id === id)) fail(`media/slides.json stage names slide "${id}", which is missing or hidden`);
  files.push(...stage.far);
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
  checkFiles(files, "media/slides.json");
}

function checkPlugins(list) {
  const ids = new Set();
  for (const plugin of list) {
    const where = `src/plugins.json plugin "${plugin.id}"`;
    if (!/^[a-z0-9-]+$/.test(plugin.id ?? "") || ids.has(plugin.id)) fail(`${where}: id must be unique [a-z0-9-]`);
    ids.add(plugin.id);
    if (!["builtin", "store"].includes(plugin.kind)) fail(`${where}: kind must be "builtin" or "store"`);
    if (!plugin.author) fail(`${where}: no author`);
    for (const lang of LANGS) if (!plugin.name?.[lang] || !plugin.text?.[lang]) fail(`${where}: name and text need "${lang}"`);
  }
  checkFiles(list.filter((p) => p.icon).map((p) => p.icon), "src/plugins.json");
}

/** Copies only the media the manifest and the plugin wall name (local paths). */
function copyMedia() {
  const files = new Set([manifest.frame.image, ...manifest.stage.far]);
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
  for (const p of plugins) if (p.icon) files.add(p.icon);
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

/** The download button for each system; the stylesheet shows the visitor's one only. */
function renderCta(where) {
  return systems.map((os) => {
    const asset = primary[os];
    const title = os === "windows" ? "hero.forWindows" : asset.arch === "x64" ? "hero.forMacIntel" : "hero.forMac";
    return `      <a class="cta-btn os-${os}" data-cta="${where}" href="${escape(downloadHref(asset))}">
        <svg class="cta-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5M5 19h14"/></svg>
        ${t(title, "span", ' class="cta-title"')}
      </a>`;
  }).join("\n");
}

/** The one grey line under the hero button, per system: version, requirements, other systems, release notes. */
function renderCtaLine() {
  return systems.map((os) => {
    const bits = [];
    if (release.ok) bits.push(`<span>v${escape(release.version)}</span>`);
    if (releaseConfig.requirements[os]) bits.push(t(`req.${os}`));
    bits.push(t("hero.unsigned"));
    // "Also for macOS" / "Also for Windows": opens the platforms dialog (the release page without script).
    if (enabled.some((a) => a !== primary[os])) {
      const other = systems.find((o) => o !== os);
      bits.push(t(other ? `hero.also.${other}` : "hero.allDownloads", "a", ` class="js-platforms" href="${escape(releasesPage())}"`));
    }
    if (release.ok) bits.push(t("hero.notes", "a", ` href="${escape(release.notesUrl)}"`));
    return `    <p class="cta-line os-${os}">${bits.join('<span class="sep" aria-hidden="true">·</span>')}</p>`;
  }).join("\n");
}

function renderHeroSource() {
  const key = site.links.playerRepo ? "hero.source" : "hero.github";
  return `      <a class="ghost-btn" href="${escape(github)}">${GITHUB_ICON}${t(key)}</a>`;
}

/** Every enabled file, opened from "Also for …"; checksums stay on the release page. */
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
  lines.push(`    </ul>`);
  if (systems.some((os) => releaseConfig.requirements[os])) {
    const req = systems
      .filter((os) => releaseConfig.requirements[os])
      .map((os) => t(`req.${os}`))
      .join('<span class="sep" aria-hidden="true">·</span>');
    lines.push(`    <p class="pf-req">${req}</p>`);
  }
  lines.push(`    <p class="pf-foot"><a href="${escape(releaseConfig.releasesPage)}">${t("ft.releases")} →</a></p>`);
  return lines.join("\n");
}

// ---- Hero stage and feature chapters: player windows ----

function stageSlide(id) {
  return manifest.slides.find((s) => s.id === id) ?? fail(`media/slides.json: no slide "${id}"`);
}

function size(slide) {
  return `width="${frame.areas[slide.area].width}" height="${frame.areas[slide.area].height}"`;
}

/** The clip over the window's client area: the poster underneath, the video on top once it plays (main.js). */
function renderShot(slide, { lazy }) {
  const load = lazy ? ' loading="lazy"' : ' fetchpriority="high"';
  const sources = slide.sources.map((s) => `<source data-src="${escape(s.src)}" type="${escape(s.type)}">`).join("");
  return `<div class="shot" style="${area(slide)}"><img src="${escape(slide.poster)}" ${size(slide)}${load} decoding="async" alt=""><video muted loop playsinline preload="none" aria-hidden="true" tabindex="-1">${sources}</video></div>`;
}

function renderChrome(lazy, alt) {
  const altAttr = alt ? ` alt="${escape(en["frame.alt"])}" data-i18n-attr="alt:frame.alt"` : ' alt=""';
  return `<img class="chrome" src="${escape(frame.image)}" width="${frame.width}" height="${frame.height}"${lazy ? ' loading="lazy"' : ""} decoding="async"${altAttr}>`;
}

/** The pause control beside every playing window (one state for the whole page; main.js shows it). */
function renderPause(where) {
  return `<button type="button" class="pp pp-${where}" hidden><svg viewBox="0 0 24 24" aria-hidden="true"><path class="i-pause" d="M8 5v14M16 5v14"/><path class="i-play" d="M7 4.5v15l12-7.5z"/></svg>${t("media.pause")}</button>`;
}

/** Five windows fanned in depth; the stylesheet gathers them into the front one as the page scrolls. */
function renderStage() {
  const st = manifest.stage;
  const near = st.near.map(stageSlide);
  const farH = Math.round((640 * frame.height) / frame.width);
  const far = (src, side) =>
    `          <div class="card card-far card-${side}" aria-hidden="true"><img src="${escape(src)}" width="640" height="${farH}" decoding="async" alt=""></div>`;
  const side = (slide, s) =>
    `          <div class="card card-near card-${s}" aria-hidden="true">${renderChrome(false, false)}<div class="shot" style="${area(slide)}"><img src="${escape(slide.poster)}" ${size(slide)} decoding="async" alt=""></div></div>`;
  return [
    far(st.far[0], "l"),
    far(st.far[1], "r"),
    side(near[0], "l"),
    side(near[1], "r"),
    `          <div class="card card-main" data-media="hero">${renderChrome(false, true)}${renderShot(stageSlide(st.center), { lazy: false })}</div>`,
  ].join("\n");
}

function renderChapter(slide, i) {
  const icon = slide.icon ? `<img class="ch-icon" src="${escape(slide.icon)}" width="40" height="40" alt="">` : "";
  const n = (k) => String(k).padStart(2, "0");
  return `      <article class="chapter${i % 2 ? " is-flip" : ""}">
        <div class="ch-copy">
          <p class="ch-num" aria-hidden="true">${n(i + 1)}<span>/${n(manifest.slides.length)}</span></p>
          <h3 class="ch-title">${icon}${t(`slide.${slide.id}.title`)}</h3>
          <p class="ch-text">${t(`slide.${slide.id}.caption`)}</p>
        </div>
        <figure class="window" data-media="${slide.id}">
          <div class="win">${renderChrome(true, false)}${renderShot(slide, { lazy: true })}</div>
          ${renderPause(slide.id)}
        </figure>
      </article>`;
}

// ---- Plugin wall ----

function renderPlugin(plugin) {
  const icon = plugin.icon
    ? `<img src="${escape(plugin.icon)}" width="44" height="44" alt="" loading="lazy">`
    : `<span aria-hidden="true">${escape(Array.from(plugin.name.en)[0] ?? "?")}</span>`;
  const badge = plugin.kind === "store" ? "pl.badge.store" : "pl.badge.builtin";
  return `      <li class="plugin reveal" data-kind="${plugin.kind}">
        <div class="plugin-icon">${icon}</div>
        <div class="plugin-body">
          <h3>${t(`plugin.${plugin.id}.name`)}</h3>
          <p class="plugin-by">${escape(plugin.author)}<span class="sep" aria-hidden="true">·</span>${t(badge, "span", ` class="badge badge-${plugin.kind}"`)}</p>
          <p class="plugin-text">${t(`plugin.${plugin.id}.text`)}</p>
        </div>
      </li>`;
}

function renderPluginLinks() {
  const links = [];
  if (site.links.pluginsRepo) links.push(`<a class="text-link" href="${escape(site.links.pluginsRepo)}">${t("pl.repo")} →</a>`);
  if (site.links.sdkDocs) links.push(`<a class="text-link" href="${escape(site.links.sdkDocs)}">${t("pl.sdk")} →</a>`);
  return links.join("\n      ");
}

// ---- Open source ----

function renderOpenSource() {
  const blocks = [
    ["player", site.links.playerRepo, "os.player.link"],
    ["sdk", site.links.sdkDocs, "os.sdk.link"],
    ["community", site.links.pluginsRepo, "os.community.link"],
  ];
  return blocks.map(([id, href, label]) => `      <li class="os-card reveal">
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
  // The footer lists only footage the page shows: the backdrop's row goes when the template has no backdrop.
  const backdropShown = readFileSync(fromRoot("src/index.html"), "utf8").includes("{{slot:backdrop}}");
  const rows = credits.filter((row) => row.title && (backdropShown || !/\(hero backdrop\)/i.test(row.title)));
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
