# Vestra Player download page

The single-page website for downloading Vestra Player:
a hero whose player windows stand fanned in depth and gather into one as the
page scrolls, with download buttons (the visitor's system first); one feature
chapter per recording, the AI plugin workshop (an illustration
until a recording exists), open source, and the closing download buttons. Static output for
Cloudflare Pages; plain HTML, CSS and JavaScript built by a Node script with no
dependencies. English (`/`) and Simplified Chinese (`/zh-hans/`), each a
prerendered page.

## Preview

Node 20 or later.

```sh
npm run build            # fetches the latest release, writes dist/
npm run preview          # serves dist/ at http://127.0.0.1:4173/
```

`dist/index.html` also works when opened directly from disk (the language link
then opens the folder; use the preview). Builds without
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
| `src/i18n.json` | Every string, `en` and `zh-Hans` (the build fails if a key is missing in one); the build renders one page per language |
| `src/styles.css`, `src/main.js` | Styles and the page script (language, download buttons, platforms dialog, playing windows, stage parallax, plugin filter, AI workshop mock) |
| `media/slides.json` | The hero stage and the feature chapters: frame image, slides, posters and video sources |
| `media/CREDITS.md` | Third-party footage and games shown in the demos; the footer lists its table |
| `release.config.json` | Where release metadata comes from, asset name patterns, system requirements |
| `site.config.json` | The site's public `url` (see below), footer links and licence names |
| `public/` | Copied as is: favicons, Open Graph image, `_headers` for Cloudflare Pages |
| `scripts/build.mjs` | `npm run build` |
| `scripts/encode-clip.mjs` | Encodes a recording or window screenshot into the page's formats |
| `scripts/make-assets.mjs` | Regenerates the icons and the placeholder media (needs ffmpeg) |

## Languages and search engines

Each language is its own page, built from the same template: `dist/index.html`
(English, also `x-default`) and `dist/zh-hans/index.html`. Both carry their
text, title, description, Open Graph and Twitter tags and a schema.org
`SoftwareApplication` (JSON-LD: free, Windows and macOS, the version and
download links when release metadata exists; no ratings, since none exist) in
the HTML itself, so nothing depends on script to be indexed. The header's
language link goes to the other page; the page does not redirect by browser
language.

`url` in `site.config.json` is the public address (ending in `/`). Search
engines need absolute addresses for canonical links, `hreflang` alternates,
`og:url` and the sitemap, so the build writes those only when it is set
(`SITE_URL=… npm run build` overrides it, for example to check the output
against the local preview). Without it the pages have no canonical or
`hreflang` links and `dist/robots.txt` (always written) has no `Sitemap`
line; with it the build also writes `dist/sitemap.xml` with both pages and
their alternates.

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
  `macos-universal` until such builds exist). The hero and the closing
  section show a button per system, each with its short requirements: the
  visitor's system first as the primary button (macOS visitors get the
  universal, else Apple silicon, else Intel build; everyone else the Windows
  installer), the other one secondary, and a greyed, disabled Linux entry
  ("coming soon", not a link). While neither group is on screen a small
  button in the header leads to the visitor's download. One grey line under
  the hero buttons gives the version and "All downloads", which opens a dialog
  with every enabled file and the full requirements.
- **The buttons** link straight to the latest installer, independent of the
  metadata: `https://github.com/<github.owner>/<github.repo>/releases/latest/download/<name>`,
  with the fixed names in `site.config.json` `downloads` (`windows`, `macos`,
  `linux`; every release must upload copies under these names). `linux: null`
  shows the disabled "coming soon" entry instead of a button. The metadata only
  adds the version and release notes to the line under the buttons and the
  versioned files to the "All downloads" dialog.
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

- `backdrop` is a looping clip (the aurora) for templates that show one behind
  the hero. This template does not: its files are not copied into `dist/` and
  its credits row (Title ending in "(hero backdrop)") is left out of the footer
  while `src/index.html` has no `{{slot:backdrop}}`.
- `stage` is the hero: `center` names the slide whose clip plays in the front
  window, `near` the two slides shown as stills beside it (left, right), and
  `far` two pre-blurred stills for the back row, made with
  `npm run encode -- --far <slide-id>` (the page uses no live blur filter).
  On wide screens with scroll-driven animations the hero is a tall track: its
  viewport stays pinned while the fan gathers into the front window; a fine
  mouse pointer tilts the stage by up to 6°. Phones, browsers without
  scroll-driven animations and no script get one flat window; reduced motion
  gets the fan standing still, posters only.
- `frame.image` is the player window around every clip, at `frame.width` ×
  `frame.height` pixels. `frame.areas` are rectangles in that image's pixels:
  `client` is the window's client area, `video` only the video area. Each
  slide's `area` names the rectangle its video covers.
- Each slide has an `id`, `title` and `caption` in `en` and `zh-Hans`, an
  optional `icon`, a `poster` and `sources` (tried in order; AV1 WebM first,
  H.264 MP4 last). `"hidden": true` leaves a slide out of the page; its files
  need not exist (the `ai` slide waits like this for its recording).
- Each slide is a feature chapter: its text beside its window. Of all the
  windows on screen (the stage's front window included) only the most visible
  one plays, so one clip decodes at a time; a clip loads when its window is
  first chosen. A pause button beside each playing window stops every clip on
  the page. With reduced motion, Save-Data or without script nothing loads or
  plays and the posters show.

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
npm run encode -- --far <slide-id>      # blurred still of that slide for stage.far (after its poster)
npm run encode -- --small               # half-width .sm.webp copies of the frame and every poster (srcset)

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
- The clip and frame commands also write a half-width `<name>.sm.webp`; the
  page offers both through `srcset`, so 1× screens and phones fetch the small one.
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
