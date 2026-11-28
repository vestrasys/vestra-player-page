# Vestra Player download page

The single-page website for downloading Vestra Player:
a hero whose player windows stand fanned in depth and gather into one as the
page scrolls, with download buttons (the visitor's system first); the features as
three themes (each a window playing the theme's loop, the active feature's caption
and a rail of its features), open source, and the closing download buttons. Static output for
Cloudflare Pages; plain HTML, CSS and JavaScript built by a Node script with no
dependencies. English (`/`) and Simplified Chinese (`/zh-hans/`), each a
prerendered page.

## Preview

Node 20 or later.

```sh
npm run build            # fetches the latest release, writes dist/
npm run preview          # serves dist/ at http://127.0.0.1:4173/
```

`dist/index.html` also works when opened directly from disk (the language menu
then opens folders; use the preview). Builds without
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
| `src/i18n.json` | Every string, in each of the ten languages (the build fails if a string is missing in one); the build renders one page per language |
| `src/styles.css`, `src/main.js` | Styles and the page script (language, download buttons, platforms dialog, playing windows, stage parallax, plugin filter) |
| `media/slides.json` | The hero stage, the feature themes (copy, beat times, posters, video sources); the full clips were removed on 2026-11-12 |
| `media/themes/*.json` | How each theme's loop is composed from recordings and stills (`scripts/compose-theme.mjs`) |
| `media/CREDITS.md` | Third-party footage and games shown in the demos; the footer shows its "Footer" lines |
| `release.config.json` | Where release metadata comes from, asset name patterns, system requirements |
| `site.config.json` | The site's public `url` (see below), footer links and licence names |
| `public/` | Copied as is: favicons, Open Graph image, `_headers` for Cloudflare Pages |
| `scripts/build.mjs` | `npm run build` |
| `scripts/encode-clip.mjs` | Encodes a recording or window screenshot into the page's formats |
| `scripts/compose-theme.mjs` | Cuts a theme's beats into one loop with the punch at every beat (needs ffmpeg) |
| `scripts/make-assets.mjs` | Regenerates the icons and the placeholder media (needs ffmpeg) |

## Languages and search engines

Each language is its own page, built from the same template: `dist/index.html`
(English, also `x-default`) and `dist/<folder>/index.html` for Simplified and
Traditional Chinese (`zh-hans`, `zh-hant`), Japanese (`ja`), Korean (`ko`),
German (`de`), Spanish (`es`), French (`fr`), Brazilian Portuguese (`pt-br`)
and Russian (`ru`); `LANGS` and `PAGES` in `scripts/build.mjs` list them. Each
carries its
text, title, description, Open Graph and Twitter tags and a schema.org
`SoftwareApplication` (JSON-LD: free, Windows and macOS, the version and
download links when release metadata exists; no ratings, since none exist) in
the HTML itself, so nothing depends on script to be indexed. The header's
language menu (a `<details>`, so it works without script) links every page,
each language named in itself; a choice is saved in `localStorage`
(`vestra-lang`). Only the English root page redirects, from a small inline
script at the top of its `<head>`: to the saved choice if there is one,
otherwise to the first language in `navigator.languages` that has a page
(`zh-TW`/`zh-HK`/`zh-Hant`: Traditional Chinese, other `zh`: Simplified, any
`pt`: Brazilian Portuguese), stopping at English; with no preference list
(crawlers) it stays. The build adds that script's SHA-256 to the
Content-Security-Policy in `dist/_headers`, which allows no other inline
script. Translations follow the player's own terms (its `.po` files) where
they exist; `media/CREDITS.md` has a footer section per language.

`url` in `site.config.json` is the public address (ending in `/`). Search
engines need absolute addresses for canonical links, `hreflang` alternates,
`og:url` and the sitemap, so the build writes those only when it is set
(`SITE_URL=… npm run build` overrides it, for example to check the output
against the local preview). Without it the pages have no canonical or
`hreflang` links and `dist/robots.txt` (always written) has no `Sitemap`
line; with it the build also writes `dist/sitemap.xml` with every page and
their alternates (`lastmod`: the later of the release date and the last
commit), absolute `og:image` and structured data (`@graph`: the Organization,
the WebSite and the SoftwareApplication, linked by `@id`), and `dist/llms.txt`
(https://llmstxt.org): the page's facts, features and links as Markdown for
language models, built from the same configuration and strings.

## Release metadata

`npm run build` reads the latest release (at build time, never in the browser:
release downloads carry no CORS headers). It bakes the version, date, release
notes link and file sizes into the HTML; SHA-256 digests are left to the release
page, which the footer links.

- **`provider: "latest-json"`** (the default) reads the release's
  `latest.json` at `https://github.com/<github.owner>/<github.repo>/releases/latest/download/latest.json`:
  `{ "schema": 1, "version", "published", "notes", "downloads": { "windows-x64": { "file", "size", "sha256" }, "macos-arm64": { … } } }`.
  Unknown fields are ignored; another `schema` major fails the build. Each
  asset in `release.config.json` names its `downloads` key (`latestKey`).
  The build checks that `site.config.json` `downloads` (the buttons' fixed
  file names) equal latest.json's `file` for every button and fails when one
  differs or is missing, since that button would lead nowhere. When latest.json
  cannot be fetched (no release yet, a private repository, no network) it only
  warns and builds the fallback; the buttons still use their fixed links.
  `RELEASE_LATEST_JSON=path/to/latest.json npm run build` reads a local file
  instead (also with `build:offline`), to try the checks.
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
  button in the header leads to the visitor's download. "All downloads" in the
  header nav (kept on narrow screens, where the section links are hidden) opens
  a dialog with every enabled file and the full requirements.
- **The buttons** link straight to the latest installer, independent of the
  metadata: `https://github.com/<github.owner>/<github.repo>/releases/latest/download/<name>`,
  with the fixed names in `site.config.json` `downloads` (`windows`, `macos`,
  `linux`; every release must upload copies under these names). `linux: null`
  shows the disabled "coming soon" entry instead of a button. The metadata only
  adds the versioned files to the "All downloads" dialog (and the version to
  the structured data).
- **`stableAssetNames: true`** links to `…/releases/latest/download/<stableName>`
  (or `<stableName>` next to the manifest) instead of the versioned file. Turn
  it on only when every release uploads files under those names.
- **`releasesPage`** is the link when metadata is missing.

When the release cannot be read (no network, private repository without a
token, no stable release yet, API error), the build prints a warning and the
page links every download to `releasesPage` with "Not available" in place of
the version, size and digest. It never fails for this reason.

Release data is untrusted: asset, file and tag names must be plain file names
(letters, digits, `.` `_` `+` `-`; no `..`, slashes or leading dot), and every
URL taken from it must be https and stay under `github.com/<owner>/<repo>`
(the SHA256SUMS request, which carries `GITHUB_TOKEN`, under
`api.github.com/repos/<owner>/<repo>/releases/assets/`) or, for the url
provider, on the manifest's origin. Anything else fails the build with the
field and the reason.

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
  its credits line (marked "(hero backdrop)") is left out of the footer
  while `src/index.html` has no `{{slot:backdrop}}`.
- `stage` is the hero: `center` is the front window, whose clip plays,
  `near` the two windows beside it (left, right), and `far` two
  pre-blurred stills for the back row, made with
  `npm run encode -- --far <slide-id | media/posters/x.webp> [--id <name>]`
  (the page uses no live blur filter). A `center` or `near` entry is one of:
  - a slide id: that slide's clip plays there (its poster, sources and area,
    in a `<video>` of its own). A fullscreen
    slide (or a card with `"fullscreen": { "width", "height" }`) shows the
    picture alone in its own shape, with no window frame, and its poster
    becomes the preloaded LCP image;
  - a card of its own, `{ "poster", "sources" }` as `npm run encode` prints
    them, so the hero can show a cut of its own. The
    committed center is such a card: the whole fullscreen `adjust` take. (The
    former center, `hero-adjust`, still in `media/`, is a player 0.7.6 take of its own: the
    maximized window without the sidebar, the Adjustments and Effects column
    opened from the bottom bar's right side, saturation down to grey, Colour
    Original, column closed). It covers the frame's
    client area, or the `"area"` it names. The center uses the main
    frame (or none, when fullscreen). A `near` card for a cut without the playlist pane adds `"frame"`: a
    narrowed window made with `npm run encode -- --window <width> --id <name>`,
    where `<width>` is the frame's client height (1476) times the clip's
    width / height; the card takes that window's shape and its picture covers
    everything under the title bar;
  - (`near` only) a still: a `.webp` path (over the frame's client area), or
    a card without `"sources"` (its `"poster"`, and `"frame"` if any). The
    committed side windows are the poster of the hero cut `hero-ai` (the
    colour wheels) and, on the right, the Plugin Store (D10 of the launch v2
    spec): `hero-store`, since 2026-11-12 a frameless card (`"fullscreen": { 1728, 1080 }`) with the store
    loop's outro (the five plugin icons and names, "All from the Plugin Store."; the user found the store
    window's text too much to take in): ffmpeg `-ss 2.5 -i x-outro-p.mp4 -frames:v 1 -vf scale=1280:-2`, WebP quality 80, 23 KB.
    VestraNES moved to the far right (`nes-far`).

  Side clips (a near slide id or card with sources; none as committed)
  load only once the front window's clip is playing, only on wide screens (the
  side windows are hidden on phones, so nothing is downloaded there), and
  pause with the front window (scrolled away, background tab, pause button).
  On wide screens the hero shows the fan at rest (a short entrance on load)
  and a fine mouse pointer tilts it by up to 6°; the page scrolls straight on.
  Phones get one flat window; reduced motion gets the fan without the entrance
  or tilt, posters only.
- `frame.image` is the player window around every clip, at `frame.width` ×
  `frame.height` pixels. `frame.areas` are rectangles in that image's pixels:
  `client` is the window's client area, `video` only the video area. Each
  slide's `area` names the rectangle its video covers.
- Each slide has an `id`, `title` and `caption` in every language, an
  optional `icon`, a `poster` and `sources` (tried in order; AV1 WebM first,
  H.264 MP4 last). `"hidden": true` leaves a slide out of the page; its files
  need not exist.
- The slides were the full clips ("Watch the full clip"), removed on 2026-11-12;
  `slides` is now optional and only a stage entry may name one. Media files get
  content-hashed names in `dist/` (as the CSS and JS), so a re-encoded clip is
  never served from a browser cache under its old name.
- `themes` are the feature section: per theme `id` and `title`
  (every language in `LANGS`; no lede: the heading stands alone, user ruling 2026-11-12), `rail` (`icons`: each beat has an `icon`, the
  plugin's icon as 104 px WebP in `media/icons/`; `chips`: each beat has a
  `glyph` from `GLYPHS` in `scripts/build.mjs`), `duration`, `poster`
  and `sources` (a `"media": "(max-width: 640px)"` source first, for
  phones), and `beats`: `id`, `start`, `end`, `label`, `caption`, optional
  `fine` (fine print) and `clip` (a slide id). An optional `outro`
  (`start`, `end`, `name`, `caption`; `{n}` is the number of visible
  beats in words) lights every icon. `"hidden": true` leaves a beat out;
  its span must then be cut out of the video too. The build fails unless the
  visible beats and the outro tile `0`–`duration` (to 1/60 s) and every
  string exists in every language.
- Each theme's window loops its video; the script follows the video's clock
  (`requestVideoFrameCallback`) to ring the active rail item, fill its
  progress bar and change the caption. A click on an item seeks to its beat
  (a key frame). Without script, with reduced motion or Save-Data no video
  loads: the poster shows beside a list of every beat (also in the HTML for
  search engines).
- Of all the windows on screen (the stage's front window and the themes')
  only the most visible one plays (a theme's from 60 % visible; with the
  stage's side clips when it is the front window); a theme's video is
  fetched once its band is within one screen, the hero's when its window is
  first chosen. A pause
  button under each playing window stops every clip on the page, and nothing
  plays behind the full-clip dialog. With reduced motion, Save-Data or without script nothing loads or
  plays and the posters show.

### Feature themes

Each theme's video is one 60 fps loop of hard cuts, composed from a spec in
`media/themes/` (recordings with their spans and crops, stills,
the before/after wipe) and encoded with a key frame at every beat start:

```sh
node scripts/compose-theme.mjs media/themes/store.json     # prints the beat times and the encode line
npm run encode -- C:/vestra/rec/page-v2/store.mp4 --id theme-store --keyframes 0,5.6,8.8,12.2,15.2,18.2 \
  --sm 960x600 --poster-at 11.0 --crf-av1 46 --crf-sm 50 --crf-h264 28 --poster-quality 50
```

Copy the printed times into the theme's beats in `media/slides.json`.
Budget (launch v2 spec 3.9): AV1 at most 4.0 MB per 20 s, the phone copy
1.6 MB, the poster 60 KB. The encode's poster is quality 50 at most; when a
frame does not fit 60 KB (the store list's text does not), pick another beat's
frame and write the poster with ffmpeg (`-ss <s> -i media/clips/theme-<id>.mp4
-frames:v 1 -c:v libwebp -quality <q>`, and its half-width `.sm.webp`).

The themes as committed: the player 0.8.0 takes of 2026-11-12
(`C:/vestra/rec/v9/R*.mkv`, 2560x1600 screen captures at about 55 fps; the
real arrow tracked by `C:/vestra/rec/tools/track.mjs` and covered by the
brand pointer, `pointer.mjs draw`, into `C:/vestra/rec/v9/ptr/<take>-ptr.mkv`;
the tracks are `ptr/<take>.track.json`; R9's I-beam in the search field,
which track.mjs does not know, is covered by a pointer parked on it).

| Theme | Beats | Waiting for |
| --- | --- | --- |
| player | Picture (R1), Sound (R2, cropped to the equalizer), Seek preview (R4), Playlist (R5), Command Palette (explainer `palette`: R6 through a camera, "Reset: Picture" outlined, Enter on the whole picture). Subtitles left out (user ruling 2026-11-12: a basic feature) | |
| store | Clip Export (explainers `gif` and `reel`), VestraTube (R9: the sidebar with the search and about six result rows, centred on black, `"fit"`; the double-click; then 3.4 s of Spring from the middle of the film, R9b), Shader Upscale (explainer `shader`: Anime4K A+A off and on, two player captures of one frame of Morevna Episode 3 at 426x240), Auto Frame (explainer `autoframe`), VestraNES (`nes-td-cut`), outro (explainer `outro`: the five icons and names, "All from the Plugin Store.") | |
| ai | Ask Vestra (explainer `ask`: R15b through a camera, the sentence turned into the command), AI Upscaling (explainer `vsr`: AI Upscaling off and on, two player captures of the Caminandes 2 360p frame the Ask take R15b ends on), Vestra Player AI (explainer `build`, four captioned steps; Colour Wheels as a before/after) | Highlights hidden until the sound model (R18) |

Explainers (2026-11-12): motion graphics that explain what a feature does, with real frames, real data and real
player captures inside and no drawn player UI. They are the promo video's `main/explain.html` scenes
(`C:/vestra/marketing/video/v9/main/explain/explain.js`), rendered at 1728x1080 with
`node v9/tools/render2.mjs "v9/main/explain.html?s=<scene>&d=<seconds>" --size 1728x1080 --out v9/work/explain/x-<scene>-p.mp4`
from `C:/vestra/marketing/video` (delete the `.chunks` folder first when a scene changed), and used as whole-frame parts.

Full clips ("Watch the full clip") were removed on 2026-11-12 (user ruling): the link, the dialog, the
`slides` list and their media are gone, and the build refuses a beat's `"clip"`. Kept for the record, they were
the same takes at real pace, composed by
`compose-theme.mjs` from one-beat specs with `"punch": false` in
`C:/vestra/rec/page-v2/full/*.json`, then encoded:

```sh
npm run encode -- C:/vestra/rec/page-v2/full/picture-9.mp4 --id picture-9 --poster-at 4.5 --crf-av1 41 --crf-h264 30      # R1 + R2, fullscreen
npm run encode -- C:/vestra/rec/page-v2/full/palette-9.mp4 --id palette-9 --size 1874x1080 --poster-at 2.6 --crf-av1 41 --crf-h264 30
npm run encode -- C:/vestra/rec/page-v2/full/playlist-9.mp4 --id playlist-9 --size 1874x1080 --poster-at 2.4 --crf-av1 41 --crf-h264 30
npm run encode -- C:/vestra/rec/page-v2/full/vestratube-9.mp4 --id vestratube-9 --poster-at 5.5 --crf-av1 41 --crf-h264 30   # 1728x1080, D8 strip
npm run encode -- C:/vestra/rec/page-v2/full/clipexport-9.mp4 --id clipexport-9 --size 1874x1080 --poster-at 3.0 --crf-av1 41 --crf-h264 30
npm run encode -- C:/vestra/rec/page-v2/full/ask-9.mp4 --id ask-9 --size 1874x1080 --poster-at 4.2 --crf-av1 41 --crf-h264 30
```

Privacy: the Clip Export takes show "Clip exported as <the Windows user's
Videos folder>…" at the top left after an export (R7 23.9–27.9 s, R8
11.6–16.2 s); no cut uses those spans. Ask Vestra (R15, R16) was recorded on
the user's own profile: only the palette's command names and the approval
sheet are used.

### Commands

Rectangles are `x,y,w,h` in the recording's (or screenshot's) pixels; times are
seconds. Clips come out at 60 fps without audio, keep the crop's aspect ratio
and are scaled down (never up) to fit 1920×1080 (`--size` changes that).
`--start`/`--duration` trim the recording, `--poster-at` picks the poster in
the result, `--loop-fade <s>` blends the end into the start for clips that do
not loop by themselves (the result is that much shorter; needs `--duration`).

```sh
export FFMPEG=/path/to/ffmpeg        # PowerShell: $env:FFMPEG = 'C:\path\to\ffmpeg.exe'

# Player 0.7.6 takes (2026-11-08): the player's client area is 2560x1476 at
# (0,40) on the 2560x1600 screen, recorded with ddagrab (60 fps, cursor drawn,
# C:\vestra\rec\rec0776.ps1 Start-Capture); fullscreen takes are the whole
# 2560x1600 screen. Speed-segment edits with an eased camera are made by
# C:\vestra\rec\tools\edit.mjs from a spec in C:\vestra\rec\specs\ (the
# intermediate H.264 then goes through encode as below).
# adjust (the first slide, a fullscreen take: "fullscreen": {2560x1600} in the
# slide instead of "area", so the page shows it without the window frame):
# adjust-0776-rawC2.mkv cut by specs/adjust-2.json (the colour drag at 1x, the
# equalizer presets at 1.5x, the Subtitles and Playback tabs at 1.7x, the
# Command Palette "reset pic" + Enter at 1x) to 19.05 s, then:
npm run encode -- adjust-2-cut.mp4 --id adjust --duration 19.05 --loop-fade 0.5 --poster-at 4.6 --crf-av1 39 --crf-h264 27
# playlist (player 0.7.6, sidebar widened, the five open films with thumbnails; rows selected in turn, thumbnails
# hidden and shown again; camera pushes in on the list): C:/vestra/rec/specs/playlist-2.json -> playlist-2-cut.mp4
npm run encode -- playlist-2-cut.mp4 --id playlist --duration 11.37 --loop-fade 0.3 --poster-at 2.2
# store-3: store-0776-rawB.mkv cut by specs/store-3.json (the store-2 rhythm:
# waits at 1.4-2.5x, the playback wait cut, the same camera keys), 14.87 s:
npm run encode -- store-3-cut.mp4 --id store-3 --size 1874x1080 --crf-av1 41 --crf-h264 30 --poster-at 3.3
# ai-3 (the AI slide, player 0.7.6 / SDK 1.7.2 docs): three client-area takes
# cut by specs/ai-3.json: ai-0776-rawA3.mkv (new chat, the Colour Wheels prompt
# typed at 6x, sent), ai-0776-rawE2.mkv (the answer, Install at 4x, "Installed
# Colour Wheels 0.1.1"), ai-0776-rawF.mkv (the wheels: highlights to orange,
# shadows to teal); 0.3 s crossfades, eased camera (chat, input box, answer +
# Install, wheels window, full view), 17.6 s like ai-2:
npm run encode -- ai-3-cut.mp4 --id ai-3 --size 1874x1080 --crf-av1 41 --crf-h264 30 --poster-at 17.0
# The earlier takes, for the record: menus (player 0.5, recordings of a
# 2224x1392 rectangle around the window, client area 4,52,2216,1336):
#   npm run encode -- menus-raw.mkv --id menus --crop 4,52,2216,1336 --duration 13.9 --loop-fade 0.5 --poster-at 4.5
# store-2 (player 0.7.3, store073-raw.mkv) was the same kind of edit as store-3
# (waits at 2-4x, poster at 2.62 s).
# ai-2 (the AI slide) is an edit of the same kind from maximized-player takes
# (client area 0,40,2560,1476): wheels-rawA.mkv 19.5-25.6 s (prompt, first
# 3.5 s at 2x) and 37.1-39.2 s (sent), wheels-rawC.mkv 17.1-24.6 s (answer,
# Install; 19.2-23.4 s at 2x, "~15 min later" caption), 107.65-111.8 s (Colour
# Wheels window, highlights drag) and 145.7-148.5 s (Film Look), 0.3 s
# crossfades, eased camera (chat top, input box, answer + Install, wheels
# window, full view), scaled to 1874x1080, 17.6 s, no loop fade. The take's
# only shadows drag (103.1-105.6 s) plays over sky, so it is left out; the
# window opens with shadows already set.
npm run encode -- ai-cut.mp4 --id ai-2 --size 1874x1080 --crf-av1 41 --crf-h264 30 --poster-at 14.38
# nes-3 (Twin Dragons): nes-td-user.mkv is a 2240x1408 desktop capture from
# (0,0) with a variable frame rate and no seek index, so the try is cut first
# with decode-accurate trimming (input seeking lands on the wrong frames):
#   ffmpeg -i nes-td-user.mkv -vf "trim=start=26.333:end=41.5,setpts=PTS-STARTPTS,fps=60" -an -c:v libx264 -qp 0 nes-td-cut.mkv
# 26.333 s is the first castle (respawn) frame, 41.5 s is 1 s after the death in
# the spike pit (the respawn and a terminal window follow). Window border at
# x 10-11 and 2212-2213, title bar to row 51, bottom border at rows 1380-1381,
# so the client area is 12,52,2200,1328. The clip skips the idle start: it
# begins at 3.25 s in the cut (raw 29.583 s), 0.1 s before the dragon's first
# jump, and keeps the same out point; the poster is the dragon on the crates
# breathing fire at a slime (10.35 s in the cut).
npm run encode -- nes-td-cut.mkv --id nes-3 --crop 12,52,2200,1328 --start 3.25 --duration 11.917 --loop-fade 0.5 --poster-at 7.1
npm run encode -- --frame frame-still.png --id frame --crop 2,0,2220,1390 --client 2,52,2216,1336 --video 2,52,1654,1226

# The feature tour's re-cuts (2026-11-09; the hero keeps the whole adjust take).
# Specs in C:/vestra/rec/specs/ (C:/vestra/rec/tools/edit.mjs).
# adjust-short: rawC2 colour sliders 1.3-6.8 s, 0.3 s crossfade, Command Palette "reset pic"
#   + Enter 18.8-24.167 s, the playback stall after Enter (24.167-24.65 s) cut out, 24.65-25.6 s:
npm run encode -- adjust-short-cut.mp4 --id adjust-short --duration 11.517 --loop-fade 0.5 --poster-at 4.6 --crf-av1 39 --crf-h264 27
# playlist-short: the playlist-3 cut (specs/playlist-3.json) without the loop fade, so Sintel
#   plays its full 2 s after the double-click (the tour loops 1.5-5.8 s, slides.json "in"/"out"):
npm run encode -- C:/vestra/rec/playlist-3-cut.mp4 --id playlist-short --duration 5.837 --poster-at 4.9
# store-4 (specs/store-4a.json + store-4b.json, store-0776-rawC-ptr2.mkv): the Install click in a
#   close-up on the VestraTube block (name, Install 0.5.3, one-line description), the installed
#   state in the same close-up, then a 0.3 s cross-fade straight to the VestraTube tab (no store
#   close, no pointer to the tab): search, results, double-click, Spring. The two parts are
#   joined with ffmpeg xfade (0.3 s at 1.83, qp 4) into store-4-cut.mp4:
npm run encode -- store-4-cut.mp4 --id store-4 --size 1874x1080 --duration 7.383 --loop-fade 0.4 --poster-at 0.8 --crf-av1 41 --crf-h264 30
# ai-5 (specs/ai-5.json): the promo's AI shot (marketing/video main/shots/s6v7d.js, footage
#   s6c-*) with its source spans and order from the raw takes, without the promo's overlays:
#   prompt, the run as a time-lapse, "complete and verified", Install, Video > Colour Wheels,
#   the wheels grading the film; hard cuts, each beat framed on the promo's crop.
npm run encode -- ai-5-cut.mp4 --id ai-5 --size 1874x1080 --crf-av1 41 --crf-h264 30 --poster-at 11.0

# Hero stage cards (the tour keeps its own clips). hero-adjust is a plain
# (pointer: every take below goes through C:estraec	oolspointer.mjs; takes with the system
# arrow baked in are tracked by track.mjs first and use <take>-ptr.mkv)
# encode of its own take (player 0.7.6, maximized, no sidebar, 2560x1516 like the
# frame, captured as the client area 2560x1476): column opened, Saturation
# dragged to grey, Colour > Original, column closed; the fade joins the loop.
npm run encode -- hero-adjust-rawB-ptr.mkv --id hero-adjust --start 1.3 --duration 10.3 --loop-fade 0.4 --poster-at 2.3
# The side windows show only the hero-ai and hero-nes-2 posters. Each cut starts
# from an intermediate cut with plain ffmpeg, then goes through encode at a smaller size.
#  hero-ai: wheels-rawC.mkv 101.5-111.8 s and 145.7-148.5 s (0.3 s crossfade), each
#   cropped to the colour-wheels view 1700x980+100+120 -> ai-wheels.mkv (12.8 s).
#  hero-nes-2: nes-td-cut.mkv cropped to the client area left of the playlist
#   pane (splitter at x 1652-1656), 1640x1328+12+52; the VestraNES window sits
#   right of the splitter in this take, so nothing needs painting over (only
#   the poster is used; the clip files are not committed).
npm run encode -- ai-wheels.mkv  --id hero-ai  --size 1280x800 --duration 12.8 --loop-fade 0.5 --poster-at 9
npm run encode -- nes-td-cut.mkv --id hero-nes-2 --crop 12,52,1640,1328 --size 1280x800 --duration 15.167 --loop-fade 0.5 --poster-at 10.35
npm run encode -- --window 1823 --id frame-nes-2  # 1476 x 1640/1328: the NES card's window without the pane

# Theme loops (see "Feature themes"): --keyframes forces a key frame at each beat start (checked with
# ffprobe afterwards), --sm adds the phone copy <id>.sm.webm, --poster-quality lowers the poster's WebP quality.
# In general: crop = the player window's client area in the recording.
npm run encode -- <recording> --id <slide-id> --crop <x,y,w,h> --start <s> --duration <s> --loop-fade 0.5 --poster-at <s>
npm run encode -- --frame <window-screenshot.png> --id frame --crop <x,y,w,h> --client <x,y,w,h> [--video <x,y,w,h>]
npm run encode -- --far <slide-id>      # blurred still of that slide for stage.far (after its poster)
npm run encode -- --window <width> --id <name>   # the frame narrowed to <width> px, for a stage card's "frame"
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
- Footage and games visible in a recording need a row and a footer line in `media/CREDITS.md`.

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
