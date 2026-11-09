# Recording plan (page re-recording for player 0.6.0)

## Player README feature images (user ruling 2026-11-01)

Captured together with the page recordings, at the end:

- Top of the player repository's README: one banner, the page's hero (the
  five-card fan) captured from the page, in `<picture>` so a light variant can
  be added later.
- Below it, a two-column table of feature images (about 400 px wide each,
  one-line caption, each linking to the full image or the page section):
  picture adjustments, Plugin Store, VestraTube, VestraNES, seek-bar preview,
  AI Workshop, RTX Upscale, Auto Frame. Capture them from the page with the
  headless-browser script, so they can be regenerated when the page changes.
- Optionally one short video (uploaded through GitHub so it plays inline),
  below the grid or in a `<details>` block.
- Images live in the player repository under `.github/readme/`, compressed
  (WebP or PNG). The same images go to Product Hunt.

Decisions for the next round of recordings. The recordings replace the clips in
`media/` (see `slides.json`); encode them with `npm run encode` as before.

## Menus clip

- **Feature: picture adjustments** (user ruling 2026-11-01). The previous clip
  rotated the picture by 180°, which looked odd. Picture adjustments change the
  picture clearly and show how deep the Video menu goes.
- Path: right-click ▸ Video ▸ Picture Adjustments…, or the Brightness /
  Contrast / Saturation ±1% items directly in the Video menu.
- The clip must loop: end with Video ▸ Reset (Q) so the picture returns to how
  it started.

## Store clip (user ruling 2026-11-01)

- Before recording (user ruling 2026-11-01): uninstall every plugin that isn't
  built in, so the Available tab lists all hosted plugins (VestraTube,
  VestraBili, VestraNES, RTX Upscale, Auto Frame). This also applies to the
  Available-tab screenshot for the hero store card. Hide built-in plugins stays
  on, as the default.
- Keep the flow: open the Plugin Store, install VestraTube.
- Then show VestraTube in full, so viewers see how capable a plugin can be:
  search for a Blender Studio open movie in its sidebar (for example "Sintel"
  or "Spring Blender") and play the official Blender Studio upload. No captions
  explaining it; the picture speaks for itself.
- Not lofi live streams (user ruling 2026-11-01): their pictures and music
  belong to the channels. Blender Studio films are CC BY, so they may appear in
  the clip; credit the film in the page's credits, as for the other footage.

## Hero stage: the store card

- The first card on the left of the hero fan shows the store. Its poster must
  be a screenshot of the Plugin Store's **Available** tab, taken before
  VestraTube is installed, so the list shows the hosted plugins (VestraTube,
  VestraBili, VestraNES, RTX Upscale, Auto Frame). Viewers see at a glance that
  features like RTX Upscale exist; no captions explaining them.
- The current poster is not the Available tab; replace it.
- The far-right card keeps the current VestraNES screenshot; its clip stays.
- The far-left card shows the seek-bar thumbnail preview (user ruling
  2026-11-01): the pointer hovering over the seek bar with the preview picture
  and time shown above it. The far cards are small, pre-blurred and fade out
  when the fan gathers, so make the preview read at that size: capture the
  player in a smaller window (the preview keeps its size, so it fills more of
  the frame), pick a colourful frame of an open movie for the preview, and
  check the card's blurred poster before keeping it.
- The first card on the right shows the AI Workshop: a screenshot of the
  Workshop (pi) window with a new, empty conversation. No clip is recorded for
  it; the AI feature (03) further down shows it playing.

## Re-recording after player 0.7.6 (user rulings 2026-11-08, late evening)

Trigger: the user says "开始" (start); nothing is recorded before that.

- **Slogan stays** ("The open-source video player that grows with its community — and with AI"). No "best": the user asked, the coordinator explained that superlatives do not help SEO or GEO; facts and structure do.
- **Copy style**: keep the page's current (poetic) voice; change only what the product change forces.
- **Clip lengths and zoom timing stay as they are** in the current clips, so the page's rhythm does not change.
- **Adjustments clip** (replaces "menus"): shot in **fullscreen**. First frame: the video alone. The pointer slides to the right edge; the Adjustments and Effects column appears (viewers learn the gesture). Colour sliders first (clear picture change, loop back with Reset), then the other panels: Audio with a few equalizer presets switched, then Subtitles / Playback briefly.
- **New clip: Playlist** (its own slide). Shows the playlist with thumbnails ("独此一家"). Same video family as the other clips: download several open films (Blender Studio, CC BY) into one folder with related names so the list looks good; the item played is the same video the other clips use.
- **Store clip**: re-record (list changed: no RTX Upscale, Shader Upscale present); flow unchanged.
- **AI clip**: keep, but re-run the same Colour Wheels prompt against the new SDK 1.7.2 docs and record it; the user set the AI key in the locally installed player (real profile: back up `%APPDATA%\Vestra` first, launch with no file argument, or copy the key to the recording profile if the secret store allows).
- **Promo video (marketing/video)**: same shots re-recorded (s4 adjustments, s5 store, s7 panel cut); the RTX upscale comparison footage stays, only its label changes to "AI Upscaling".
- **Command Palette** (user, 2026-11-08 late): fold it into the first feature (adjustments clip and promo s4), not a separate slide: open the palette, type a few letters, matching commands filter live with their key hints, Enter runs one with a visible effect. 3–5 s. The first slide's copy covers "adjust + find any command" with minimal wording change.
- **Capture setup** (measured 2026-11-09): record with ddagrab + **h264_nvenc** (constqp 16, preset p4). libx264/ddagrab-only/gfxcapture make the CPU-rendered player stall ~450 ms every ~10 s; the "Reset hitch" in the 0.7.6 takes was this capture stall, not the player.
