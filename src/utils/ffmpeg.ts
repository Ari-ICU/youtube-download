import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

let hasHevcVideotoolbox: boolean | null = null;

/**
 * Checks if the system's ffmpeg binary supports the hardware-accelerated
 * Apple Silicon/macOS encoder `hevc_videotoolbox`. Caches the result.
 */
export async function checkHevcVideotoolbox(): Promise<boolean> {
  if (hasHevcVideotoolbox !== null) {
    return hasHevcVideotoolbox;
  }
  try {
    const { stdout } = await execAsync("ffmpeg -encoders");
    hasHevcVideotoolbox = stdout.includes("hevc_videotoolbox");
  } catch (err) {
    console.error("[checkHevcVideotoolbox] Failed to check ffmpeg encoders:", err);
    hasHevcVideotoolbox = false;
  }
  return hasHevcVideotoolbox;
}
