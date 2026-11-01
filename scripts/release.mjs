// Reads the latest release for the build. Never throws: on any failure it
// returns { ok: false, reason } and the page falls back to the release page.
// A latest.json that was fetched but is not one this build understands (unknown
// schema major, missing fields) also sets fatal: true, and the build fails.
//
// Result when ok: { ok, version, date, notesUrl, assets: { <config id>: { name, url, size, sha256 } },
// latest: latest.json's downloads (latest-json provider only) }

const API = "https://api.github.com";

export async function loadRelease(config, { offline = false, latestFile = null } = {}) {
  // A local latest.json (RELEASE_LATEST_JSON) is read even offline: it tests the checks.
  if (config.provider === "latest-json" && latestFile) return fromLatestJson(config, { file: latestFile });
  if (offline) return { ok: false, reason: "offline build (RELEASE_OFFLINE)" };
  try {
    if (config.provider === "latest-json") return await fromLatestJson(config);
    if (config.provider === "github") return await fromGitHub(config);
    if (config.provider === "url") return await fromManifest(config);
    return { ok: false, reason: `unknown provider "${config.provider}"` };
  } catch (error) {
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
  const { owner, repo } = config.github;
  const releases = await get(`${API}/repos/${owner}/${repo}/releases?per_page=30`, githubHeaders());
  const release = releases
    .filter((r) => !r.draft && (config.includePrereleases || !r.prerelease))
    .sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at))[0];
  if (!release)
    return { ok: false, reason: `no ${config.includePrereleases ? "" : "stable "}release in ${owner}/${repo}` };

  // Digests: the API's `digest` field, else the release's SHA256SUMS file.
  let sums = {};
  const sumsAsset = release.assets.find((a) => a.name === "SHA256SUMS");
  if (sumsAsset && release.assets.some((a) => !a.digest)) {
    try {
      sums = parseSums(await get(sumsAsset.url, githubHeaders("application/octet-stream"), "text"));
    } catch (error) {
      console.warn(`warning: SHA256SUMS: ${error.message}`);
    }
  }
  // releases/latest/download/<name> only points at this release when it is
  // GitHub's "latest" one, i.e. not a prerelease.
  const stable = config.stableAssetNames && !release.prerelease;
  const assets = {};
  for (const wanted of config.assets.filter((a) => a.enabled)) {
    const asset = release.assets.find((a) => new RegExp(wanted.pattern).test(a.name));
    if (!asset) continue;
    assets[wanted.id] = {
      name: asset.name,
      url: stable
        ? `https://github.com/${owner}/${repo}/releases/latest/download/${wanted.stableName}`
        : asset.browser_download_url,
      size: asset.size,
      sha256: asset.digest?.startsWith("sha256:") ? asset.digest.slice(7) : (sums[asset.name] ?? null),
    };
  }
  return {
    ok: true,
    version: release.tag_name.replace(/^v/, ""),
    date: release.published_at.slice(0, 10),
    notesUrl: release.html_url,
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
  const manifest = await get(manifestUrl, { Accept: "application/json" });
  if (!config.includePrereleases && manifest.prerelease)
    return { ok: false, reason: "the manifest names a prerelease" };
  const assets = {};
  for (const wanted of config.assets.filter((a) => a.enabled)) {
    const asset = manifest.assets?.find((a) => new RegExp(wanted.pattern).test(a.name));
    if (!asset) continue;
    const name = config.stableAssetNames ? wanted.stableName : asset.name;
    assets[wanted.id] = {
      name: asset.name,
      url: new URL(config.stableAssetNames ? name : (asset.url ?? asset.name), manifestUrl).href,
      size: asset.size ?? null,
      sha256: asset.sha256 ?? null,
    };
  }
  return {
    ok: true,
    version: String(manifest.version).replace(/^v/, ""),
    date: manifest.date ?? null,
    notesUrl: manifest.notesUrl ?? config.releasesPage,
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
  const { owner, repo } = config.github;
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
  const version = data.version.replace(/^v/, "");
  const published = typeof data.published === "string" && !Number.isNaN(Date.parse(data.published)) ? data.published : null;
  const notesUrl = typeof data.notes === "string" && /^https:\/\//.test(data.notes) ? data.notes : `${base}/tag/v${version}`;
  const latest = {};
  for (const [key, entry] of Object.entries(data.downloads)) {
    if (!entry || typeof entry.file !== "string" || !entry.file) return bad(`downloads.${key} has no file`);
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
