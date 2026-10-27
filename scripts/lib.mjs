// Small helpers shared by the build and media scripts (no dependencies).
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const fromRoot = (...parts) => join(root, ...parts);
export const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

/** Parses `--name value` and `--flag` arguments; positional ones go to `_`. */
export function parseArgs(argv, flags = []) {
  const options = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) options._.push(arg);
    else if (flags.includes(arg.slice(2))) options[arg.slice(2)] = true;
    else options[arg.slice(2)] = argv[++i];
  }
  return options;
}

/** The ffmpeg executable: $FFMPEG, else `ffmpeg` on PATH. */
export function ffmpegPath() {
  const exe = process.env.FFMPEG || "ffmpeg";
  try {
    execFileSync(exe, ["-version"], { stdio: "ignore" });
  } catch {
    fail(`ffmpeg not found (set FFMPEG to its path or put it on PATH); tried "${exe}"`);
  }
  return exe;
}

export function ffmpeg(args) {
  execFileSync(ffmpegPath(), ["-hide_banner", "-v", "error", "-y", ...args], {
    stdio: "inherit",
    env: { SVT_LOG: "1", ...process.env },
  });
}

export function fail(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}

export const kib = (bytes) => `${(bytes / 1024).toFixed(1)} KiB`;
