// Composes a feature theme's loop (media/themes/<id>.json) into one 60 fps
// intermediate video: every beat cut to its length, hard cuts between beats,
// and the incoming beat's punch (scale 0.955 -> 1 in 0.35 s, outExpo; never
// above 1:1). Needs ffmpeg (FFMPEG=path or on PATH). The result then goes
// through `npm run encode -- <result> --id theme-<id> --keyframes <beat starts>`,
// whose line this script prints, together with the beat times for
// media/slides.json.
//
//   node scripts/compose-theme.mjs media/themes/<id>.json [--print]
//
// A spec: { "size": [1728, 1080], "fps": 60, "work": "<folder for the
// intermediates>", "font": "<a .ttf for the wipe labels>", "punch"?: false
// (no punch: for footage that a host scene punches itself, such as the promo
// video's cards), "out"?: "<result path>", "beats": [ { "id",
// "dur" (s), "hidden"?, "parts": [...] } ] }. A hidden beat is left out of the
// video (and the page). A beat's parts play in order, hard cuts between them:
//
//   { "src", "in", "out", "crop": [x, y, w, h], "speed"?, "fit"? }  a span of a
//       recording; the crop has the size's aspect and is scaled to it. Parts
//       without "speed" share one speed so the beat lasts "dur". "fit": <width>
//       takes a crop of any shape instead (a strip that must leave out what is
//       around it), scaled to that width and centred on black.
//   { "image", "dur" }        a still (a placeholder frame), the size's pixels
//   { "wipe": { "a", "b", "crop", "from", "to", "at", "move", "labels"? }, "dur" }
//       two captures of the same frame, b revealed right of a divider that moves
//       from "from" to "to" (fractions of the width) between "at" and
//       "at" + "move" seconds (cubic-bezier(0.65, 0, 0.35, 1)); labels: [left, right].
//
// Beat lengths are rounded to whole frames; the printed times are the frame
// times, so they tile the video exactly.
import { mkdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { ffmpeg, fail, parseArgs, readJson } from "./lib.mjs";

const options = parseArgs(process.argv.slice(2), ["print"]);
const specPath = options._[0] ?? fail("usage: compose-theme.mjs media/themes/<id>.json [--print]");
const spec = readJson(specPath);
const id = basename(specPath, ".json");
const fps = spec.fps ?? 60;
const [W, H] = spec.size ?? [1728, 1080];
const work = spec.work ?? fail(`${specPath}: "work" (a folder for the intermediates) is required`);
const f = (n) => Number(n).toFixed(4);
const PUNCH = { from: 0.955, dur: 0.35 };
const punchOn = spec.punch !== false;

// Beat table in whole frames.
const beats = spec.beats.filter((b) => !b.hidden);
let frame = 0;
const table = beats.map((b) => {
  const frames = Math.round(b.dur * fps);
  if (frames < 1) fail(`beat "${b.id}": "dur" must be positive`);
  const row = { id: b.id, start: frame / fps, end: (frame + frames) / fps, frames };
  frame += frames;
  return row;
});
const total = frame / fps;
for (const r of table) console.log(`${r.id.padEnd(14)} ${f(r.start)}-${f(r.end)} (${r.frames} frames)`);
console.log(`total ${f(total)} s, ${frame} frames`);
if (options.print) process.exit(0);

mkdirSync(work, { recursive: true });
const segments = beats.map((beat, i) => composeBeat(beat, table[i]));
const list = join(work, `${id}.concat.txt`);
writeFileSync(list, segments.map((s) => `file '${s.replace(/\\/g, "/")}'`).join("\n") + "\n");
const result = spec.out ?? join(work, `${id}.mp4`);
ffmpeg(["-f", "concat", "-safe", "0", "-i", list, "-c", "copy", result]);
console.log(`\nwrote ${result}`);
const starts = table.map((r) => Number(r.start.toFixed(4)));
console.log(`\nnpm run encode -- ${result.replace(/\\/g, "/")} --id theme-${id} --keyframes ${starts.join(",")} --sm 960x600 --poster-at <s>`);
console.log(`\nmedia/slides.json beat times (theme "${id}", ${f(total)} s):`);
for (const r of table) console.log(`  "${r.id}": "start": ${Number(r.start.toFixed(4))}, "end": ${Number(r.end.toFixed(4))}`);

function composeBeat(beat, row) {
  const inputs = [];
  const chains = [];
  const labels = [];
  const fixed = beat.parts.reduce((sum, p) => sum + (p.src ? (p.speed ? (p.out - p.in) / p.speed : 0) : p.dur), 0);
  const free = beat.parts.filter((p) => p.src && !p.speed).reduce((sum, p) => sum + (p.out - p.in), 0);
  const shared = free ? free / (beat.dur - fixed) : 1;
  if (free && !(beat.dur - fixed > 0)) fail(`beat "${beat.id}": no time left for the parts without "speed"`);
  beat.parts.forEach((p, k) => {
    const out = `p${k}`;
    if (p.src) {
      const [x, y, w, h] = p.crop;
      if (!p.fit && Math.abs(w / h - W / H) > 0.01) fail(`beat "${beat.id}" part ${k}: the crop ${w}x${h} is not ${W}:${H}`);
      const speed = p.speed ?? shared;
      inputs.push("-i", p.src);
      const fw = p.fit ? Math.min(W, 2 * Math.round(p.fit / 2)) : W, fh = p.fit ? Math.min(H, 2 * Math.round(fw * h / w / 2)) : H;
      const size = p.fit ? `scale=${fw}:${fh}:flags=lanczos,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:black` : `scale=${W}:${H}:flags=lanczos`;
      chains.push(`[${countInputs(inputs) - 1}:v]trim=start=${f(p.in)}:end=${f(p.out)},setpts=(PTS-STARTPTS)/${f(speed)},fps=${fps},crop=${w}:${h}:${x}:${y},${size},setsar=1,format=yuv420p[${out}]`);
    } else if (p.image) {
      inputs.push("-loop", "1", "-framerate", String(fps), "-t", f(p.dur), "-i", p.image);
      chains.push(`[${countInputs(inputs) - 1}:v]scale=${W}:${H}:flags=lanczos,setsar=1,format=yuv420p[${out}]`);
    } else if (p.wipe) {
      chains.push(wipe(p.wipe, p.dur, inputs, out));
    } else fail(`beat "${beat.id}" part ${k}: needs "src", "image" or "wipe"`);
    labels.push(`[${out}]`);
  });
  // Hard cuts between the parts; exactly the beat's frames (the last frame held if a part runs short).
  const body = labels.length > 1 ? `${labels.join("")}concat=n=${labels.length}:v=1:a=0,` : `${labels[0]}null,`;
  // The punch: the picture padded so that zoom 1 shows it at 0.955 of the frame, zoomed to 1:1 over 0.35 s.
  const PW = 2 * Math.round(W / PUNCH.from / 2), PH = 2 * Math.round(H / PUNCH.from / 2);
  const zMax = PW / W;
  const p = `min(on/${fps}/${PUNCH.dur},1)`;
  const z = `1+${f(zMax - 1)}*(1-pow(2,-10*${p}))`;
  chains.push(`${body}tpad=stop_mode=clone:stop_duration=1,trim=end_frame=${row.frames},setpts=PTS-STARTPTS,` +
    (punchOn ? `pad=${PW}:${PH}:(ow-iw)/2:(oh-ih)/2:black,zoompan=z='${z}':x='(iw-iw/zoom)/2':y='(ih-ih/zoom)/2':d=1:s=${W}x${H}:fps=${fps},` : "") +
    `trim=end_frame=${row.frames},format=yuv420p[v]`);
  const graph = join(work, `${id}-${beat.id}.filter.txt`);
  writeFileSync(graph, chains.join(";\n"));
  const out = join(work, `${id}-${beat.id}.mp4`);
  ffmpeg([...inputs, "-/filter_complex", graph, "-map", "[v]", "-an", "-c:v", "libx264", "-preset", "fast", "-qp", "4", "-r", String(fps), out]);
  console.log(`wrote ${out}`);
  return out;
}

/** Two captures of one frame and a moving divider (4 px brand gradient, 24 px magenta glow). */
function wipe(w, dur, inputs, out) {
  const [cx, cy, cw, ch] = w.crop;
  inputs.push("-loop", "1", "-framerate", String(fps), "-t", f(dur), "-i", w.a);
  inputs.push("-loop", "1", "-framerate", String(fps), "-t", f(dur), "-i", w.b);
  const b = countInputs(inputs) - 1, a = b - 1;
  // Divider position in px: from -> to with cubic-bezier(0.65, 0, 0.35, 1) (approximated by easeInOutCubic).
  const q = `clip((t-${f(w.at)})/${f(w.move)},0,1)`;
  const e = `if(lt(${q},0.5),4*pow(${q},3),1-pow(-2*${q}+2,3)/2)`;
  const X = `(${f(W * w.from)}+(${f(W * (w.to - w.from))})*${e})`;
  const G = 32; // half the divider image's width
  const stops = [[0, [252, 196, 2]], [0.2, [251, 90, 53]], [0.45, [250, 10, 168]], [0.72, [122, 10, 250]], [1, [16, 168, 252]]];
  const channel = (c) => {
    let expr = `${stops.at(-1)[1][c]}`;
    for (let i = stops.length - 2; i >= 0; i--) {
      const [y0, c0] = stops[i];
      const [y1, c1] = stops[i + 1];
      expr = `if(lt(Y/H,${y1}),${c0[c]}+(${c1[c] - c0[c]})*(Y/H-${y0})/${f(y1 - y0)},${expr})`;
    }
    return expr;
  };
  const core = `lt(abs(X-${G}),2)`;
  const glowA = `255*0.55*exp(-pow(X-${G},2)/(2*64))`;
  const lines = [
    `[${a}:v]crop=${cw}:${ch}:${cx}:${cy},scale=${W}:${H}:flags=lanczos,setsar=1,format=rgba[wa]`,
    `[${b}:v]crop=${cw}:${ch}:${cx}:${cy},scale=${W}:${H}:flags=lanczos,setsar=1,format=rgba,pad=${2 * W}:${H}:0:0:black@0[wbp]`,
    // b from the divider on: the crop window follows the divider, so b's pixels stay where they are.
    `[wbp]crop=${W}:${H}:x='${X}':y=0[wb]`,
    `[wa][wb]overlay=x='${X}':y=0:eval=frame[w1]`,
    `color=c=black@0:s=${2 * G}x${H}:r=${fps}:d=${f(dur)},format=rgba,geq=r='if(${core},${channel(0)},250)':g='if(${core},${channel(1)},10)':b='if(${core},${channel(2)},168)':a='if(${core},255,${glowA})'[dv]`,
    `[w1][dv]overlay=x='${X}-${G}':y=0:eval=frame[w2]`,
  ];
  let last = "w2";
  if (w.labels && spec.font) {
    const font = spec.font.replace(/\\/g, "/").replace(/:/g, "\\:");
    const text = (s) => s.toUpperCase().replace(/[\\':]/g, (c) => `\\${c}`);
    const size = Math.round(W * 0.0125 * 1.6);
    const m = Math.round(W * 0.022);
    const style = `fontfile='${font}':fontsize=${size}:fontcolor=0xff9ad6:box=1:boxcolor=0x09080d@0.8:boxborderw=${Math.round(size * 0.6)}`;
    lines.push(`[w2]drawtext=${style}:text='${text(w.labels[0])}':x=${m}:y=${m},drawtext=${style}:text='${text(w.labels[1])}':x=w-tw-${m}:y=${m}[w3]`);
    last = "w3";
  }
  lines.push(`[${last}]format=yuv420p[${out}]`);
  return lines.join(";\n");
}

function countInputs(args) {
  return args.filter((a) => a === "-i").length;
}

