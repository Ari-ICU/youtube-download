#!/usr/bin/env node
/**
 * check-deps.mjs
 *
 * Verifies that ffmpeg and yt-dlp are on PATH before the Next.js server starts.
 * Exits with code 1 and a helpful install message if either is missing.
 * Run automatically via the "predev" and "prestart" npm scripts.
 */

import { execFile } from "child_process";
import { promisify } from "util";

const exec = promisify(execFile);

const DEPS = [
  {
    bin: "ffmpeg",
    versionArgs: ["-version"],
    installHint: [
      "  macOS:   brew install ffmpeg",
      "  Ubuntu:  sudo apt install ffmpeg",
      "  Docker:  included in the provided Dockerfile",
    ],
  },
  {
    bin: "yt-dlp",
    versionArgs: ["--version"],
    installHint: [
      "  macOS:   brew install yt-dlp",
      "  Ubuntu:  sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && sudo chmod +x /usr/local/bin/yt-dlp",
      "  pip:     pip install yt-dlp",
    ],
  },
];

let allOk = true;

await Promise.all(
  DEPS.map(async ({ bin, versionArgs, installHint }) => {
    try {
      const { stdout } = await exec(bin, versionArgs);
      const version = stdout.split("\n")[0].trim();
      console.log(`  ✓  ${bin.padEnd(8)} ${version}`);
    } catch {
      console.error(`\n  ✗  ${bin} not found on PATH.`);
      console.error(`     Install it:\n${installHint.join("\n")}\n`);
      allOk = false;
    }
  })
);

if (!allOk) {
  console.error(
    "\n❌  Missing required binaries. The server cannot merge 4K video with audio.\n" +
    "    See the README for setup instructions or run via Docker:\n\n" +
    "        docker compose up --build\n"
  );
  process.exit(1);
}

console.log("\n✅  All dependencies found. Starting server…\n");
