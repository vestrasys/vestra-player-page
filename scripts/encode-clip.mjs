// Encodes one demo recording into the page's formats. Needs ffmpeg with
// libsvtav1 and libx264 (libvpx-vp9 for --vp9); FFMPEG=path or on PATH.
//
//   node scripts/encode-clip.mjs <recording> --id <slide id>
//        [--start <s>] [--duration <s>] [--crop <w:h:x:y>] [--poster-at <s>]
//        [--crf-av1 34] [--crf-h264 22] [--vp9]
//
// Writes media/clips/<id>.webm (AV1), media/clips/<id>.mp4 (H.264),
// optionally media/clips/<id>.vp9.webm, and media/posters/<id>.webp; all are
// 1920x1080, 60 fps, no audio. Prints the "sources" entry for media/slides.json.
import { statSync } from "node:fs";
import { ffmpeg, fail, fromRoot, kib, parseArgs } from "./lib.mjs";

const options = parseArgs(process.argv.slice(2), ["vp9"]);
const [input] = options._;
const id = options.id;
if (!input || !id || !/^[a-z0-9-]+$/.test(id)) fail("usage: encode-clip.mjs <recording> --id <slide id> [options]");

const trim = [
  ...(options.start ? ["-ss", options.start] : []),
  ...(options.duration ? ["-t", options.duration] : []),
];
const filters = [
  options.crop ? `crop=${options.crop}` : null,
  "scale=1920:1080:flags=lanczos:force_original_aspect_ratio=decrease",
  "pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black",
  "fps=60",
  "format=yuv420p",
].filter(Boolean).join(",");
const common = [...trim, "-i", input, "-vf", filters, "-an", "-g", "120"];

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
ffmpeg([...(options.start ? ["-ss", String(Number(options.start) + Number(options["poster-at"] ?? 0))] : ["-ss", options["poster-at"] ?? "0"]),
  "-i", input, "-vf", filters.replace(",fps=60", ""), "-frames:v", "1", "-c:v", "libwebp", "-quality", "82", outputs.poster]);

const report = (file) => `${file.slice(fromRoot().length + 1)}: ${kib(statSync(file).size)}`;
for (const key of ["av1", "h264", ...(options.vp9 ? ["vp9"] : []), "poster"]) console.log(report(outputs[key]));
const mb = (file) => statSync(file).size / 1e6;
if (mb(outputs.av1) > 5 || mb(outputs.h264) > 5)
  console.warn("warning: over 5 MB; raise --crf-av1 / --crf-h264 or shorten the clip");

const sources = [
  { src: `media/clips/${id}.webm`, type: "video/webm; codecs=av01.0.09M.08" },
  ...(options.vp9 ? [{ src: `media/clips/${id}.vp9.webm`, type: "video/webm; codecs=vp09.00.41.08" }] : []),
  { src: `media/clips/${id}.mp4`, type: "video/mp4; codecs=avc1.64002A" },
];
console.log(`\nmedia/slides.json, slide "${id}":\n"poster": "media/posters/${id}.webp",\n"sources": ${JSON.stringify(sources, null, 2)}`);
