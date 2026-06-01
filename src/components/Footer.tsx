/**
 * App footer — copyright and usage disclaimer.
 * Pure presentational; no props required.
 */
export default function Footer() {
  return (
    <footer className="text-center text-zinc-600 text-[10px] mt-16 pt-8 border-t border-white/[0.02]">
      <p>© {new Date().getFullYear()} VibeTube Engine. Built with Next.js App Router and Tailwind CSS.</p>
      <p className="mt-1">For private and educational backups only. Respect copyright terms.</p>
    </footer>
  );
}
