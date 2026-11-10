/**
 * App footer — copyright and supported platform overview.
 */
export default function Footer() {
  return (
    <footer className="w-full text-center text-zinc-500 text-xs mt-16 pt-6 border-t border-white/[0.05] flex flex-col sm:flex-row items-center justify-between gap-2">
      <p>© {new Date().getFullYear()} Anivora Media Studio. For personal & public media use.</p>
      <p className="text-[11px] text-zinc-600">
        Powered by <span className="text-zinc-400 font-semibold">yt-dlp</span> &{" "}
        <span className="text-zinc-400 font-semibold">FFmpeg</span>
      </p>
    </footer>
  );
}
