// Regenerates the committed image and placeholder media files. Needs ffmpeg
// (FFMPEG=path or on PATH); `npm run build` does not run this.
//
//   node scripts/make-assets.mjs icons --logo <logo.png 1024x1024>
//       public/favicon.ico (16/32/48), icon-32.png, apple-touch-icon.png (180),
//       icon-192.png, icon-512.png, logo-80.png (header), og-image.png (1200x630)
//   node scripts/make-assets.mjs placeholders --shots <folder of 1280x800 screenshots>
//       media/frame/placeholder-frame.webp and, per slide, placeholder posters
//       and clips (AV1 WebM + H.264 MP4) cut from the screenshots below.
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ffmpeg, fail, fromRoot, kib, parseArgs } from "./lib.mjs";

const options = parseArgs(process.argv.slice(2));
const [command] = options._;


function icons() {
  const logo = options.logo;
  if (!logo || !existsSync(logo)) fail("--logo <png> is required");
  const out = fromRoot("public");
  mkdirSync(out, { recursive: true });
  const png = (size, file, background) => {
    const target = join(out, file);
    const scale = `scale=${size}:${size}:flags=lanczos`;
    if (background) {
      // Opaque square for iOS: the mark at 80 % on the app's dark plate.
      const inner = Math.round(size * 0.8);
      ffmpeg([
        "-f", "lavfi", "-i", `color=c=${background}:s=${size}x${size}`,
        "-i", logo,
        "-filter_complex", `[1]scale=${inner}:${inner}:flags=lanczos[m];[0][m]overlay=(W-w)/2:(H-h)/2`,
        "-frames:v", "1", target,
      ]);
    } else {
      ffmpeg(["-i", logo, "-vf", scale, "-frames:v", "1", target]);
    }
    return target;
  };
  const sizes = [16, 32, 48];
  const tmp = join(tmpdir(), "vestra-page-icons");
  mkdirSync(tmp, { recursive: true });
  const entries = sizes.map((size) => {
    const file = join(tmp, `ico-${size}.png`);
    ffmpeg(["-i", logo, "-vf", `scale=${size}:${size}:flags=lanczos`, "-frames:v", "1", file]);
    return { size, data: readFileSync(file) };
  });
  writeFileSync(join(out, "favicon.ico"), ico(entries));
  png(32, "icon-32.png");
  png(192, "icon-192.png");
  png(512, "icon-512.png");
  png(80, "logo-80.png");
  png(180, "apple-touch-icon.png", "0x16141C");
  // Open Graph placeholder: the mark on the dark plate with a gradient rule.
  ffmpeg([
    "-f", "lavfi", "-i", "color=c=0x16141C:s=1200x630",
    "-f", "lavfi", "-i", "gradients=s=1200x8:c0=0xFFC400:c1=0xFF3D6E:c2=0xE81CD8:c3=0x7A2CFF:c4=0x00C8FF:nb_colors=5:x0=0:y0=0:x1=1199:y1=0:d=1",
    "-i", logo,
    "-filter_complex",
    "[2]scale=300:300:flags=lanczos[m];[0][m]overlay=(W-w)/2:(H-h)/2-20[a];[1]trim=end_frame=1[g];[a][g]overlay=0:H-h",
    "-frames:v", "1", join(out, "og-image.png"),
  ]);
  for (const file of ["favicon.ico", "icon-32.png", "icon-192.png", "icon-512.png", "logo-80.png", "apple-touch-icon.png", "og-image.png"])
    console.log(`public/${file}: ${kib(statSync(join(out, file)).size)}`);
}

/** An .ico file whose entries are PNG images (Windows Vista+ and every browser). */
function ico(entries) {
  const header = Buffer.alloc(6 + 16 * entries.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);
  let offset = header.length;
  entries.forEach(({ size, data }, i) => {
    const at = 6 + 16 * i;
    header.writeUInt8(size >= 256 ? 0 : size, at);
    header.writeUInt8(size >= 256 ? 0 : size, at + 1);
    header.writeUInt16LE(1, at + 4);
    header.writeUInt16LE(32, at + 6);
    header.writeUInt32LE(data.length, at + 8);
    header.writeUInt32LE(offset, at + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...entries.map((entry) => entry.data)]);
}

// Draft crops from the 1280x800 test screenshots (window at 27,22, 684x615).
const FRAME = { file: "ui-19.png", crop: [27, 22, 684, 615] };
const CLIENT = [28, 48, 682, 588];
const SLIDES = [
  { id: "menus", file: "ui-07-deint.png", crop: CLIENT },
  { id: "store", file: "ui-32-results.png", crop: CLIENT },
  { id: "nes", file: "nes-08-running.png", crop: CLIENT },
  { id: "ai", file: "ai-bump2.png", crop: [97, 100, 682, 588] },
];

function placeholders() {
  const shots = options.shots;
  if (!shots || !existsSync(shots)) fail("--shots <dir> is required");
  const crop = ([x, y, w, h]) => `crop=${w}:${h}:${x}:${y}`;
  for (const dir of ["media/frame", "media/posters", "media/clips"])
    mkdirSync(fromRoot(dir), { recursive: true });

  const frame = fromRoot("media/frame/placeholder-frame.webp");
  ffmpeg(["-i", join(shots, FRAME.file), "-vf", crop(FRAME.crop), "-c:v", "libwebp", "-quality", "90", "-frames:v", "1", frame]);
  console.log(`media/frame/placeholder-frame.webp: ${kib(statSync(frame).size)}`);

  const font = "C\\:/Windows/Fonts/segoeuib.ttf";
  const label = existsSync("C:/Windows/Fonts/segoeuib.ttf")
    ? `,drawtext=fontfile='${font}':text='PLACEHOLDER':x=24:y=24:fontsize=28:fontcolor=white:box=1:boxcolor=0x000000AA:boxborderw=10`
    : "";
  for (const slide of SLIDES) {
    const source = join(shots, slide.file);
    const poster = fromRoot(`media/posters/placeholder-${slide.id}.webp`);
    ffmpeg(["-i", source, "-vf", crop(slide.crop), "-c:v", "libwebp", "-quality", "80", "-frames:v", "1", poster]);
    // 6 s at 30 fps: a slow zoom on the poster so the loop is visibly a video.
    const motion =
      `${crop(slide.crop)},scale=1364:1176,zoompan=z='1+0.06*on/180':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=180:s=682x588:fps=30${label},format=yuv420p`;
    const webm = fromRoot(`media/clips/placeholder-${slide.id}.webm`);
    const mp4 = fromRoot(`media/clips/placeholder-${slide.id}.mp4`);
    ffmpeg(["-loop", "1", "-i", source, "-vf", motion, "-frames:v", "180", "-an",
      "-c:v", "libsvtav1", "-preset", "8", "-crf", "45", webm]);
    ffmpeg(["-loop", "1", "-i", source, "-vf", motion, "-frames:v", "180", "-an",
      "-c:v", "libx264", "-preset", "slow", "-crf", "30", "-profile:v", "high", "-movflags", "+faststart", mp4]);
    for (const file of [poster, webm, mp4])
      console.log(`${file.slice(fromRoot().length + 1)}: ${kib(statSync(file).size)}`);
  }
}

if (command === "icons") icons();
else if (command === "placeholders") placeholders();
else fail("usage: make-assets.mjs icons --logo <png> | placeholders --shots <dir>");
