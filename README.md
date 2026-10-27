# Vestra Player download page

The single-page website for downloading [Vestra Player](https://github.com/vestrasys/vestra-player-plugins):
a hero with a download button for the visitor's system, a feature tour inside a
player window frame, highlights, and the download section. Static output for
Cloudflare Pages; plain HTML, CSS and JavaScript built by a Node script with no
dependencies. English and Simplified Chinese.

## Preview

Node 20 or later.

```sh
npm run build            # fetches the latest release, writes dist/
npm run preview          # serves dist/ at http://127.0.0.1:4173/
```

`dist/index.html` also works when opened directly from disk. Builds without
network access or release metadata still succeed (see below):

```sh
npm run build:offline                                    # no network at all
GITHUB_TOKEN=$(gh auth token) RELEASE_INCLUDE_PRERELEASES=1 npm run build
                                                         # preview with the latest test build
```

The build prints the size of the HTML, CSS and JS and fails above 150 KiB
(media and images not counted).

## Layout

| Path | Contents |
| --- | --- |
| `src/index.html` | Page template: `{{t:key}}` text, `{{h:key}}` HTML text, `{{var:…}}` values, `{{slot:…}}` sections rendered by the build |
| `src/i18n.json` | Every string, `en` and `zh-Hans` (the build fails if a key is missing in one) |
| `src/styles.css`, `src/main.js` | Styles and the page script (language, download button, feature tour) |
| `media/slides.json` | The feature tour: frame image, slides, posters and video sources |
| `media/CREDITS.md` | Third-party footage and games shown in the demos; the footer lists its table |
| `release.config.json` | Where release metadata comes from, asset name patterns, system requirements |
| `site.config.json` | Footer links and licence names |
| `public/` | Copied as is: favicons, Open Graph image, `_headers` for Cloudflare Pages |
| `scripts/build.mjs` | `npm run build` |
| `scripts/encode-clip.mjs` | Encodes a recording into the tour's formats |
| `scripts/make-assets.mjs` | Regenerates the icons and the placeholder media (needs ffmpeg) |

## Release metadata

`npm run build` reads the newest release that is not a draft and, unless
`includePrereleases` is true, not a prerelease. It bakes the version, date,
file sizes, SHA-256 digests and links into the HTML.

- **`provider: "github"`** reads `github.owner/repo` through the GitHub REST API.
  Set `GITHUB_TOKEN` to raise the rate limit or to read a private repository.
  Digests come from the API's `digest` field, else from the release's
  `SHA256SUMS` file.
- **`provider: "url"`** reads a JSON file at `url.manifest`, for downloads
  hosted elsewhere (see below).
- **`assets`**: one entry per download. `pattern` is a regular expression for
  the file name; `enabled: false` hides the entry (for example `macos-x64` or
  `macos-universal` until such builds exist). The hero shows one button for
  Windows and macOS visitors (an Intel button too when `macos-x64` is enabled),
  and every button for other systems.
- **`stableAssetNames: true`** links to `…/releases/latest/download/<stableName>`
  (or `<stableName>` next to the manifest) instead of the versioned file. Turn
  it on only when every release uploads files under those names.
- **`releasesPage`** is the link when metadata is missing.

When the release cannot be read (no network, private repository without a
token, no stable release yet, API error), the build prints a warning and the
page links every download to `releasesPage` with "Not available" in place of
the version, size and digest. It never fails for this reason.

The player repository is private for now, so the default configuration builds
the fallback. Point the configuration at the public location of the downloads
once there is one.

### The url provider

```json
{
  "version": "0.6.0",
  "date": "2026-11-20",
  "prerelease": false,
  "notesUrl": "https://…/releases/0.6.0",
  "assets": [
    { "name": "VestraPlayer-0.6.0-windows-x64-setup.exe", "url": "0.6.0/VestraPlayer-0.6.0-windows-x64-setup.exe", "size": 152652608, "sha256": "…" }
  ]
}
```

`url` may be relative to the manifest and defaults to `name`.

## Replacing media

The tour lives in `media/slides.json`; the page code does not need to change.

- `frame.image` is a screenshot of the player window (title bar, sidebar and
  bottom bar) at `frame.width` × `frame.height` pixels. `frame.areas` are
  rectangles in that image's pixels: `client` is everything below the title
  bar, `video` is only the video area. Each slide's `area` names the rectangle
  its video covers.
- Each slide has an `id`, `title` and `caption` in `en` and `zh-Hans`, an
  optional `icon`, a `poster` and `sources` (tried in order; list AV1 WebM
  first and H.264 MP4 last).
- Only the current slide's video is loaded. With autoplay the tour moves on
  when a clip ends; a clip that cannot play shows its poster for 8 seconds.

Files named `placeholder-*` are drafts cut from test screenshots. To replace a
slide:

```sh
FFMPEG=/path/to/ffmpeg npm run encode -- recording.mkv --id menus --duration 8 --poster-at 2
```

This writes `media/clips/menus.webm` (AV1), `media/clips/menus.mp4` (H.264)
and `media/posters/menus.webp`, 1920×1080 at 60 fps without audio, and prints
the `sources` entry to paste into `media/slides.json`. Add `--crop w:h:x:y` to
cut the window area out of a larger capture and `--vp9` for an extra VP9 file.
Aim for 2–5 MB per file (raise `--crf-av1` / `--crf-h264` if larger). Media are
cached for a day, so give a re-recorded clip a new file name. Delete the
placeholder files once nothing refers to them.

Recordings:

- Capture exactly the rectangle the slide's `area` covers, at 1920×1080 or
  larger with the same aspect ratio as the rectangle; record at 60 fps.
- 6–10 seconds, starting and ending on the same picture so the loop is seamless.
- Take the frame screenshot from the same window size, at 2× scale.
- Footage and games visible in a recording need a row in `media/CREDITS.md`.

## Deploying

Not deployed yet. `.github/workflows/pages.yml` is prepared but disabled: it
runs only by hand and only when the repository variable
`PAGES_DEPLOY_ENABLED` is `true`. The comments in the file list the secrets
and variables it needs. Cloudflare Pages can also build the site itself:
build command `npm run build`, output directory `dist`, and `GITHUB_TOKEN`
as an environment variable if needed. `public/_headers` sets the Content
Security Policy and caching; the page loads nothing from other hosts and sets
no cookies.

## Icons

```sh
FFMPEG=/path/to/ffmpeg npm run assets:icons -- --logo path/to/logo.png   # 1024×1024 V mark
```

`og-image.png` is a placeholder (the mark on the dark plate).

## Licence

Apache-2.0, see [LICENSE](LICENSE). Vestra Player itself is GPL-3.0-or-later.
