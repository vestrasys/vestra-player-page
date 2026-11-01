// Encodes a raw recording into the page's video formats, or a window
// screenshot into the tour's frame image. Needs ffmpeg with libsvtav1, libx264
// and libwebp (libvpx-vp9 for --vp9); FFMPEG=path or on PATH.
//
// Clip (a tour slide or the hero backdrop):
//
//   node scripts/encode-clip.mjs <recording> --id <name>
//        [--crop x,y,w,h] [--start <s>] [--duration <s>] [--size 1920x1080]
//        [--loop-fade <s>] [--poster-at <s>] [--crf-av1 34] [--crf-h264 22] [--vp9]
//
//   Writes media/clips/<name>.webm (AV1), media/clips/<name>.mp4 (H.264),
//   optionally media/clips/<name>.vp9.webm, and media/posters/<name>.webp.
//   --crop is the rectangle to keep, in the recording's pixels; the result keeps
//   its aspect ratio and is scaled down (never up) to fit --size. 60 fps, no
//   audio. --start/--duration trim the recording (seconds). --loop-fade blends
//   the last <s> seconds into the first ones so a clip that does not start and
//   end on the same picture still loops without a jump (needs --duration; the
//   result is <s> seconds shorter). --poster-at is a time in the result.
//   Prints the "poster" and "sources" lines for media/slides.json.
//
// Frame (the player window around the tour):
//
//   node scripts/encode-clip.mjs --frame <screenshot> [--id frame]
//        [--crop x,y,w,h] [--client x,y,w,h] [--video x,y,w,h]
//
//   Writes media/frame/<name>.webp: the screenshot cut to --crop (the window's
//   client area), unscaled. --client and --video are rectangles in the result's
//   pixels (default: the whole image). Prints the "frame" block for
//   media/slides.json.
//
// Far card (the hero stage's back row, a blurred still):
//
//   node scripts/encode-clip.mjs --far <slide-id> [--id <name>]
//
//   Writes media/posters/<name>.webp (default <slide-id>-far): the slide's
//   poster in the frame's client area, scaled to 640 px wide and blurred, so
//   the page needs no live blur filter. Prints the line for "stage.far".
import { readFileSync, statSync } from "node:fs";
import { ffmpeg, fail, fromRoot, kib, parseArgs, readJson } from "./lib.mjs";

const options = parseArgs(process.argv.slice(2), ["vp9"]);
const id = options.id ?? (options.frame ? "frame" : typeof options.far === "string" ? `${options.far}-far` : undefined);
if (!id || !/^[a-z0-9-]+$/.test(id)) fail("--id <name> is required ([a-z0-9-]); see the top of scripts/encode-clip.mjs");

/** "x,y,w,h" (whole pixels) -> {x, y, w, h}. */
function rect(name) {
  const value = options[name];
  if (value === undefined) return null;
  const parts = String(value).split(",").map((v) => Number(v.trim()));
  if (parts.length !== 4 || parts.some((v) => !Number.isInteger(v) || v < 0) || !parts[2] || !parts[3])
    fail(`--${name} must be x,y,w,h in whole pixels, for example --${name} 120,80,1364,1176`);
  const [x, y, w, h] = parts;
  return { x, y, w, h };
}

function seconds(name, fallback) {
  const value = options[name] ?? fallback;
  if (value === undefined) return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) fail(`--${name} must be a number of seconds`);
  return n;
}

const rel = (file) => file.slice(fromRoot().length + 1).replace(/\\/g, "/");
const report = (file) => console.log(`${rel(file)}: ${kib(statSync(file).size)}`);

if (options.frame) encodeFrame(options.frame);
else if (options.far) encodeFar(options.far);
else encodeClip(options._[0]);

function encodeFar(slideId) {
  const { frame, slides } = readJson(fromRoot("media/slides.json"));
  const slide = slides.find((s) => s.id === slideId) ?? fail(`--far: no slide "${slideId}" in media/slides.json`);
  const a = frame.areas[slide.area];
  const out = fromRoot(`media/posters/${id}.webp`);
  ffmpeg(["-i", fromRoot(frame.image), "-i", fromRoot(slide.poster), "-filter_complex",
    `[1:v]scale=${a.width}:${a.height}[p];[0:v][p]overlay=${a.x}:${a.y},scale=640:-2:flags=lanczos,gblur=sigma=4`,
    "-frames:v", "1", "-c:v", "libwebp", "-quality", "70", out]);
  report(out);
  console.log(`
media/slides.json, "stage.far": "media/posters/${id}.webp"`);
}

function encodeFrame(input) {
  if (input === true || !input) fail("--frame <screenshot> is required");
  const crop = rect("crop");
  const out = fromRoot(`media/frame/${id}.webp`);
  ffmpeg(["-i", input, ...(crop ? ["-vf", `crop=${crop.w}:${crop.h}:${crop.x}:${crop.y}`] : []),
    "-frames:v", "1", "-c:v", "libwebp", "-quality", "90", out]);
  report(out);
  // The image's size, read back from the file (WebP VP8/VP8L/VP8X headers).
  const { width, height } = webpSize(out);
  const area = (r) => (r ? { x: r.x, y: r.y, width: r.w, height: r.h } : { x: 0, y: 0, width, height });
  const client = area(rect("client"));
  const video = area(rect("video") ?? rect("client"));
  for (const [name, r] of Object.entries({ client, video }))
    if (r.x + r.width > width || r.y + r.height > height) fail(`--${name} is outside the ${width}x${height} image`);
  const frame = { image: `media/frame/${id}.webp`, width, height, areas: { client, video } };
  console.log(`\nmedia/slides.json, "frame" (keep "alt"):\n${JSON.stringify(frame, null, 2)}`);
}

function webpSize(file) {
  const data = readFileSync(file);
  const chunk = data.toString("ascii", 12, 16);
  if (chunk === "VP8X") return { width: 1 + data.readUIntLE(24, 3), height: 1 + data.readUIntLE(27, 3) };
  if (chunk === "VP8L") {
    const bits = data.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  return { width: data.readUInt16LE(26) & 0x3fff, height: data.readUInt16LE(28) & 0x3fff };
}

function encodeClip(input) {
  if (!input) fail("usage: encode-clip.mjs <recording> --id <name> [options]; see the top of the script");
  const crop = rect("crop");
  const start = seconds("start");
  const duration = seconds("duration");
  const fade = seconds("loop-fade");
  const posterAt = seconds("poster-at", 0);
  const size = /^(\d+)x(\d+)$/.exec(options.size ?? "1920x1080");
  if (!size) fail("--size must be WIDTHxHEIGHT, for example 1280x720");
  const [, maxW, maxH] = size;
  if (fade !== undefined && (duration === undefined || fade <= 0 || 2 * fade >= duration))
    fail("--loop-fade needs --duration, and twice the fade must be shorter than the duration");

  const trim = [...(start ? ["-ss", String(start)] : []), ...(duration ? ["-t", String(duration)] : [])];
  const base = [
    crop ? `crop=${crop.w}:${crop.h}:${crop.x}:${crop.y}` : null,
    `scale=w='min(${maxW},iw)':h='min(${maxH},ih)':force_original_aspect_ratio=decrease:force_divisible_by=2:flags=lanczos`,
    "fps=60",
    "setsar=1",
  ].filter(Boolean).join(",");
  const graph = fade
    ? `[0:v]${base},split[a][b];[a]trim=start=${fade},setpts=PTS-STARTPTS[m];[b]trim=end=${fade},setpts=PTS-STARTPTS[h];` +
      `[m][h]xfade=transition=fade:duration=${fade}:offset=${(duration - 2 * fade).toFixed(3)},format=yuv420p[v]`
    : `[0:v]${base},format=yuv420p[v]`;
  const common = [...trim, "-i", input, "-filter_complex", graph, "-map", "[v]", "-an", "-g", "120"];

  const outputs = {
    av1: fromRoot(`media/clips/${id}.webm`),
    h264: fromRoot(`media/clips/${id}.mp4`),
    vp9: fromRoot(`media/clips/${id}.vp9.webm`),
    poster: fromRoot(`media/posters/${id}.webp`),
  };

  ffmpeg([...common, "-c:v", "libsvtav1", "-preset", "4", "-crf", options["crf-av1"] ?? "34",
    "-svtav1-params", "tune=0", outputs.av1]);
  ffmpeg([...common, "-c:v", "libx264", "-preset", "slower", "-crf", options["crf-h264"] ?? "22",
    "-profile:v", "high", "-level", "4.2", "-movflags", "+faststart", outputs.h264]);
  if (options.vp9)
    ffmpeg([...common, "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "34", "-row-mt", "1",
      "-deadline", "good", "-cpu-used", "2", outputs.vp9]);
  // The poster is a frame of the finished clip, so it matches the video exactly
  // (crop, trim and loop fade included).
  ffmpeg(["-ss", String(posterAt), "-i", outputs.h264, "-frames:v", "1", "-c:v", "libwebp", "-quality", "82", outputs.poster]);

  for (const key of ["av1", "h264", ...(options.vp9 ? ["vp9"] : []), "poster"]) report(outputs[key]);
  const mb = (file) => statSync(file).size / 1e6;
  if (mb(outputs.av1) > 5 || mb(outputs.h264) > 5)
    console.warn("warning: over 5 MB; raise --crf-av1 / --crf-h264 or shorten the clip");

  const sources = [
    { src: `media/clips/${id}.webm`, type: "video/webm; codecs=av01.0.09M.08" },
    ...(options.vp9 ? [{ src: `media/clips/${id}.vp9.webm`, type: "video/webm; codecs=vp09.00.41.08" }] : []),
    { src: `media/clips/${id}.mp4`, type: "video/mp4; codecs=avc1.64002A" },
  ];
  console.log(`\nmedia/slides.json:\n"poster": "media/posters/${id}.webp",\n"sources": ${JSON.stringify(sources, null, 2)}`);
}
