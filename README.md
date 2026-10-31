# Vestra Player download page

The single-page website for downloading Vestra Player:
a hero over a looping backdrop with one download button for the visitor's
system, a feature tour in a pinned player window whose clip follows the text
steps scrolling past, a plugin wall, the AI plugin workshop (an illustration
until a recording exists), open source, and a closing download button. Static output for
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
| `src/styles.css`, `src/main.js` | Styles and the page script (language, download buttons, platforms dialog, feature tour, plugin filter, AI workshop mock) |
| `src/plugins.json` | The plugin wall: name, author, kind (built in or store), one line in `en` and `zh-Hans`, optional icon |
| `media/slides.json` | The hero backdrop and the feature tour: frame image, slides, posters and video sources |
| `media/CREDITS.md` | Third-party footage and games shown in the demos; the footer lists its table |
| `release.config.json` | Where release metadata comes from, asset name patterns, system requirements |
| `site.config.json` | Footer links and licence names |
| `public/` | Copied as is: favicons, Open Graph image, `_headers` for Cloudflare Pages |
| `scripts/build.mjs` | `npm run build` |
| `scripts/encode-clip.mjs` | Encodes a recording or window screenshot into the page's formats |
| `scripts/make-assets.mjs` | Regenerates the icons and the placeholder media (needs ffmpeg) |

## Release metadata

`npm run build` reads the newest release that is not a draft and, unless
`includePrereleases` is true, not a prerelease. It bakes the version, file
sizes and links into the HTML; file names and SHA-256 digests are left to the
release page, which the footer links.

- **`provider: "github"`** reads `github.owner/repo` through the GitHub REST API.
  Set `GITHUB_TOKEN` to raise the rate limit or to read a private repository.
  Digests come from the API's `digest` field, else from the release's
  `SHA256SUMS` file.
- **`provider: "url"`** reads a JSON file at `url.manifest`, for downloads
  hosted elsewhere (see below).
- **`assets`**: one entry per download. `pattern` is a regular expression for
  the file name; `enabled: false` hides the entry (for example `macos-x64` or
  `macos-universal` until such builds exist). The page shows exactly one
  download button at a time: the hero's (macOS visitors get the universal,
  else Apple silicon, else Intel build; everyone else the Windows installer),
  the closing section's, or, while neither is on screen, a small one in the
  header. One grey line under the hero button gives the version,
  requirements and "Also for …", which opens a dialog with every enabled file.
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

Everything the page shows lives in `media/slides.json`; the page code does not
need to change. `npm run encode` (`scripts/encode-clip.mjs`, needs ffmpeg with
libsvtav1, libx264 and libwebp; `FFMPEG=path` or ffmpeg on `PATH`) turns a raw
recording or a screenshot into the page's files, and prints the lines to paste
into `media/slides.json`. Replacing one item is one command plus that edit.

- `backdrop` is the looping clip behind the header and hero text (the aurora).
  It plays only while visible and never with reduced motion or Save-Data; the
  poster shows otherwise.
- `frame.image` is the player window around the tour, at `frame.width` ×
  `frame.height` pixels. `frame.areas` are rectangles in that image's pixels:
  `client` is the window's client area, `video` only the video area. Each
  slide's `area` names the rectangle its video covers.
- Each slide has an `id`, `title` and `caption` in `en` and `zh-Hans`, an
  optional `icon`, a `poster` and `sources` (tried in order; AV1 WebM first,
  H.264 MP4 last). `"hidden": true` leaves a slide out of the page; its files
  need not exist (the `ai` slide waits like this for its recording).
- The tour pins the window (`position: sticky`) while one text step per
  slide scrolls past; the step crossing the middle of the screen (lower on
  narrow screens) picks the clip. A clip loads when its step is first reached
  and plays only while the window is on screen; with reduced motion, Save-Data
  or without script nothing plays (reduced motion and no script also show each
  step's poster under its text instead of the pinned window).

### Commands

Rectangles are `x,y,w,h` in the recording's (or screenshot's) pixels; times are
seconds. Clips come out at 60 fps without audio, keep the crop's aspect ratio
and are scaled down (never up) to fit 1920×1080 (`--size` changes that).
`--start`/`--duration` trim the recording, `--poster-at` picks the poster in
the result, `--loop-fade <s>` blends the end into the start for clips that do
not loop by themselves (the result is that much shorter; needs `--duration`).

```sh
export FFMPEG=/path/to/ffmpeg        # PowerShell: $env:FFMPEG = 'C:\path\to\ffmpeg.exe'

# As committed: recordings of a 2224x1392 rectangle around the window (2 px
# border, title bar rows 2-51), so the client area is 4,52,2216,1336 in every
# recording and 2,52,2216,1336 in the frame cut at 2,0,2220,1390.
npm run encode -- menus-raw.mkv --id menus --crop 4,52,2216,1336 --duration 13.9 --loop-fade 0.5 --poster-at 4.5
npm run encode -- store-cut2.mkv --id store --crop 4,52,2216,1336 --start 1 --duration 18.8 --loop-fade 0.5 --poster-at 16.5
npm run encode -- nes-raw2.mkv  --id nes   --crop 4,52,2216,1336 --duration 12.5 --loop-fade 0.5 --poster-at 2
npm run encode -- --frame frame-still.png --id frame --crop 2,0,2220,1390 --client 2,52,2216,1336 --video 2,52,1654,1226

# In general: crop = the player window's client area in the recording.
npm run encode -- <recording> --id <slide-id> --crop <x,y,w,h> --start <s> --duration <s> --loop-fade 0.5 --poster-at <s>
npm run encode -- --frame <window-screenshot.png> --id frame --crop <x,y,w,h> --client <x,y,w,h> [--video <x,y,w,h>]

# Backdrop (as committed; the source is kept outside the repository).
npm run encode -- pexels_aurora_timelapse_28889010_2160p60.mp4 --id aurora --duration 8.4 --loop-fade 1 --crf-av1 36 --crf-h264 26
```

A slide command writes `media/clips/<id>.webm` (AV1), `media/clips/<id>.mp4`
(H.264) and `media/posters/<id>.webp`; copy the printed `poster` and `sources`
into the slide. The frame command writes `media/frame/<id>.webp` and prints a
`frame` block (`image`, `width`, `height`, `areas`; keep `alt`): `client` is the
whole image unless `--client` says otherwise, `video` defaults to `client`.
Then:

- Use the same crop for the frame screenshot and the slide recordings (same
  window size and scale), so the slides fit `areas.client` exactly.
- Aim for 2–5 MB per file (raise `--crf-av1` / `--crf-h264` if larger; the
  script warns above 5 MB). `--vp9` adds a VP9 file.
- Media are cached for a day: give a re-recorded clip a new id (`menus-2`).
- Delete files that `media/slides.json` no longer names.
- Footage and games visible in a recording need a row in `media/CREDITS.md`.

Recordings:

- Record at 60 fps, at least the size of the client area at 2× scale.
- 6–10 seconds that start and end on the same picture, so the loop is
  seamless (or use `--loop-fade`).
- `npm run assets:placeholders` can still cut draft `placeholder-*` media
  from test screenshots for a new slide.

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
