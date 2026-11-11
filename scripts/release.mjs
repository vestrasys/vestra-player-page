// Reads the latest release for the build. Never throws: on any failure it
// returns { ok: false, reason } and the page falls back to the release page.
// A latest.json that was fetched but is not one this build understands (unknown
// schema major, missing fields) also sets fatal: true, and the build fails.
//
// Result when ok: { ok, version, date, notesUrl, assets: { <config id>: { name, url, size, sha256 } },
// latest: latest.json's downloads (latest-json provider only) }
//
// Everything read from the network (asset and file names, tag names, versions,
// URLs) is untrusted. Names must be plain file names; URLs must be https and stay
// under the release repository (github.com/<owner>/<repo>, api.github.com for
// the SHA256SUMS request that carries GITHUB_TOKEN) or, for the url provider,
// on the manifest's origin. Anything else is refused with fatal: true
// and a reason naming the field, so the build fails instead of linking elsewhere.

const API = "https://api.github.com";

/** Untrusted release data that would leave the expected names or origin. */
export class UnsafeReleaseData extends Error {}

// A plain file name: no separators, no leading dot, no spaces, control or URL-special characters.
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,254}$/;
// A version or tag ("v1.2.3", "0.6.0-rc.1+build.5").
const SAFE_VERSION = /^v?[0-9A-Za-z][0-9A-Za-z.+-]{0,127}$/;
// A GitHub owner or repository name.
const SAFE_REPO_PART = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;

/** `name` when it is a plain file name, else throws (`what` names the field in the reason). */
export function safeName(name, what = "file name") {
  if (typeof name !== "string" || !SAFE_NAME.test(name) || name.includes(".."))
    throw new UnsafeReleaseData(`${what} ${JSON.stringify(name)} is not a plain file name`);
  return name;
}

/** `version` when it is a plain version or tag, else throws. */
export function safeVersion(version, what = "version") {
  if (typeof version !== "string" || !SAFE_VERSION.test(version) || version.includes(".."))
    throw new UnsafeReleaseData(`${what} ${JSON.stringify(version)} is not a plain version`);
  return version;
}

/**
 * `url` (normalized) when it is https, has no credentials, lies under `prefix` (origin plus a
 * path ending in "/"), and has no dot segment, backslash, encoded separator or whitespace; else throws.
 */
export function safeUrl(url, prefix, what = "URL") {
  const fail = (why) => new UnsafeReleaseData(`${what} ${JSON.stringify(url)} ${why}`);
  if (typeof url !== "string") throw fail("is not a string");
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw fail("is not a URL");
  }
  const expected = new URL(prefix);
  if (parsed.protocol !== "https:") throw fail("is not https");
  if (parsed.username || parsed.password) throw fail("carries credentials");
  // new URL() resolves "." and ".." away, so these checks look at the text as given.
  if (/[\s\\]/.test(url) || /%(2e|2f|5c)/i.test(url) || /\/\.{1,2}(?=[/?#]|$)/.test(url))
    throw fail("has a dot segment, a backslash, an encoded separator or whitespace");
  if (parsed.origin !== expected.origin || !parsed.pathname.startsWith(expected.pathname))
    throw fail(`is not under ${prefix}`);
  return parsed.href;
}

function repoOf(config) {
  const { owner, repo } = config.github ?? {};
  for (const [key, value] of [["owner", owner], ["repo", repo]])
    if (typeof value !== "string" || !SAFE_REPO_PART.test(value) || value.includes(".."))
      throw new UnsafeReleaseData(`release.config.json github.${key} ${JSON.stringify(value)} is not a GitHub name`);
  return { owner, repo };
}

/** Runs `check`; an UnsafeReleaseData becomes the result of `bad`. */
function guarded(bad, check) {
  try {
    check();
    return null;
  } catch (error) {
    if (error instanceof UnsafeReleaseData) return bad(error.message);
    throw error;
  }
}

export async function loadRelease(config, { offline = false, latestFile = null } = {}) {
  try {
    // A local latest.json (RELEASE_LATEST_JSON) is read even offline: it tests the checks.
    if (config.provider === "latest-json" && latestFile) return await fromLatestJson(config, { file: latestFile });
    if (offline) return { ok: false, reason: "offline build (RELEASE_OFFLINE)" };
    if (config.provider === "latest-json") return await fromLatestJson(config);
    if (config.provider === "github") return await fromGitHub(config);
    if (config.provider === "url") return await fromManifest(config);
    return { ok: false, reason: `unknown provider "${config.provider}"` };
  } catch (error) {
    if (error instanceof UnsafeReleaseData) return { ok: false, fatal: true, reason: error.message };
    return { ok: false, reason: error.message };
  }
}

function githubHeaders(accept = "application/vnd.github+json") {
  const headers = {
    Accept: accept,
    "User-Agent": "vestra-player-page-build",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return headers;
}

async function get(url, headers, as = "json") {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return as === "json" ? response.json() : response.text();
}

async function fromGitHub(config) {
  const { owner, repo } = repoOf(config);
  const releases = await get(`${API}/repos/${owner}/${repo}/releases?per_page=30`, githubHeaders());
  const release = releases
    .filter((r) => !r.draft && (config.includePrereleases || !r.prerelease))
    .sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at))[0];
  if (!release)
    return { ok: false, reason: `no ${config.includePrereleases ? "" : "stable "}release in ${owner}/${repo}` };
  const tag = safeVersion(release.tag_name, "release tag_name");
  const where = `release ${tag}`;

  // Digests: the API's `digest` field, else the release's SHA256SUMS file.
  let sums = {};
  const sumsAsset = release.assets.find((a) => a.name === "SHA256SUMS");
  if (sumsAsset && release.assets.some((a) => !a.digest)) {
    // This request carries GITHUB_TOKEN: only to this repository's asset endpoint.
    const sumsUrl = safeUrl(sumsAsset.url, `${API}/repos/${owner}/${repo}/releases/assets/`, `${where} SHA256SUMS url`);
    try {
      sums = parseSums(await get(sumsUrl, githubHeaders("application/octet-stream"), "text"));
    } catch (error) {
      console.warn(`warning: SHA256SUMS: ${error.message}`);
    }
  }
  // releases/latest/download/<name> only points at this release when it is
  // GitHub's "latest" one, i.e. not a prerelease.
  const stable = config.stableAssetNames && !release.prerelease;
  const assets = {};
  for (const wanted of config.assets.filter((a) => a.enabled)) {
    const asset = release.assets.find((a) => typeof a.name === "string" && new RegExp(wanted.pattern).test(a.name));
    if (!asset) continue;
    const name = safeName(asset.name, `${where} asset name`);
    assets[wanted.id] = {
      name,
      url: stable
        ? `https://github.com/${owner}/${repo}/releases/latest/download/${safeName(wanted.stableName, `release.config.json ${wanted.id}.stableName`)}`
        : safeUrl(asset.browser_download_url, `https://github.com/${owner}/${repo}/releases/download/`, `${where} ${name} browser_download_url`),
      size: asset.size,
      sha256: asset.digest?.startsWith("sha256:") ? asset.digest.slice(7) : (sums[name] ?? null),
    };
  }
  return {
    ok: true,
    version: tag.replace(/^v/, ""),
    date: release.published_at.slice(0, 10),
    notesUrl: safeUrl(release.html_url, `https://github.com/${owner}/${repo}/releases/`, `${where} html_url`),
    prerelease: release.prerelease,
    assets,
  };
}

/** `sha256  name` lines (sha256sum / shasum format). */
function parseSums(text) {
  const sums = {};
  for (const line of text.split(/\r?\n/)) {
    const match = /^([0-9a-f]{64})\s+\*?(.+)$/i.exec(line.trim());
    if (match) sums[match[2]] = match[1].toLowerCase();
  }
  return sums;
}

async function fromManifest(config) {
  const manifestUrl = config.url?.manifest;
  if (!manifestUrl) return { ok: false, reason: "provider url without url.manifest" };
  // Asset URLs stay on the manifest's origin (the configured host); the notes link may also point at the release repository.
  const origin = new URL("/", manifestUrl).href;
  const manifest = await get(manifestUrl, { Accept: "application/json" });
  if (!config.includePrereleases && manifest.prerelease)
    return { ok: false, reason: "the manifest names a prerelease" };
  const assets = {};
  for (const wanted of config.assets.filter((a) => a.enabled)) {
    const asset = manifest.assets?.find((a) => typeof a?.name === "string" && new RegExp(wanted.pattern).test(a.name));
    if (!asset) continue;
    const name = safeName(asset.name, "manifest asset name");
    const target = config.stableAssetNames
      ? safeName(wanted.stableName, `release.config.json ${wanted.id}.stableName`)
      : (asset.url ?? name);
    if (typeof target !== "string") throw new UnsafeReleaseData(`manifest ${name} url is not a string`);
    assets[wanted.id] = {
      name,
      url: safeUrl(new URL(target, manifestUrl).href, origin, `manifest ${name} url`),
      size: asset.size ?? null,
      sha256: asset.sha256 ?? null,
    };
  }
  let notesUrl = config.releasesPage;
  if (manifest.notesUrl != null) {
    const github = config.github ? `https://github.com/${repoOf(config).owner}/${repoOf(config).repo}/` : null;
    const underRepo = github && typeof manifest.notesUrl === "string" && manifest.notesUrl.startsWith(github);
    notesUrl = safeUrl(manifest.notesUrl, underRepo ? github : origin, "manifest notesUrl");
  }
  return {
    ok: true,
    version: safeVersion(String(manifest.version), "manifest version").replace(/^v/, ""),
    date: manifest.date ?? null,
    notesUrl,
    prerelease: Boolean(manifest.prerelease),
    assets,
  };
}

/**
 * latest.json, published with every release at releases/latest/download/latest.json:
 * { schema: 1, version, published, notes, downloads: { "<os>-<arch>": { file, size, sha256 } } }.
 * Unknown fields are ignored; another schema major is refused. Read at build time only:
 * release asset downloads generally carry no CORS headers for a browser.
 */
async function fromLatestJson(config, { file = null } = {}) {
  const { owner, repo } = repoOf(config);
  const base = `https://github.com/${owner}/${repo}/releases`;
  const where = file ?? `${base}/latest/download/latest.json`;
  let data;
  try {
    if (file) {
      const { readFileSync } = await import("node:fs");
      data = JSON.parse(readFileSync(file, "utf8"));
    } else data = await get(where, { Accept: "application/json", "User-Agent": "vestra-player-page-build" });
  } catch (error) {
    // Not reachable (no release yet, a private repository, no network): the fallback, a warning only.
    return { ok: false, reason: `latest.json: ${error.message}` };
  }
  const bad = (why) => ({ ok: false, fatal: true, reason: `${where}: ${why}` });
  if (!data || typeof data !== "object") return bad("not a JSON object");
  const major = typeof data.schema === "number" ? Math.floor(data.schema) : Number.parseInt(String(data.schema ?? ""), 10);
  if (major !== 1) return bad(`schema ${JSON.stringify(data.schema)} is not supported (this build reads schema 1)`);
  if (typeof data.version !== "string" || !data.version) return bad("no version");
  if (!data.downloads || typeof data.downloads !== "object") return bad("no downloads");
  const badVersion = guarded(bad, () => safeVersion(data.version));
  if (badVersion) return badVersion;
  const version = data.version.replace(/^v/, "");
  const published = typeof data.published === "string" && !Number.isNaN(Date.parse(data.published)) ? data.published : null;
  let notesUrl = `${base}/tag/v${version}`;
  if (typeof data.notes === "string" && /^https:\/\//.test(data.notes)) {
    const badNotes = guarded(bad, () => (notesUrl = safeUrl(data.notes, `https://github.com/${owner}/${repo}/`, "notes")));
    if (badNotes) return badNotes;
  }
  const latest = {};
  for (const [key, entry] of Object.entries(data.downloads)) {
    if (!entry || typeof entry.file !== "string" || !entry.file) return bad(`downloads.${key} has no file`);
    const badFile = guarded(bad, () => safeName(entry.file, `downloads.${key}.file`));
    if (badFile) return badFile;
    latest[key] = {
      file: entry.file,
      size: Number.isFinite(entry.size) ? entry.size : null,
      sha256: typeof entry.sha256 === "string" && /^[0-9a-f]{64}$/i.test(entry.sha256) ? entry.sha256.toLowerCase() : null,
    };
  }
  const assets = {};
  for (const wanted of config.assets.filter((a) => a.enabled && a.latestKey)) {
    const entry = latest[wanted.latestKey];
    if (!entry) continue;
    assets[wanted.id] = { name: entry.file, url: `${base}/latest/download/${encodeURIComponent(entry.file)}`, size: entry.size, sha256: entry.sha256 };
  }
  return { ok: true, version, date: published ? published.slice(0, 10) : null, notesUrl, prerelease: false, assets, latest };
}
