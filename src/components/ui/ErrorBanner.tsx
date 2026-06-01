import { motion } from "framer-motion";
import { AlertCircle } from "lucide-react";

interface ErrorBannerProps {
  title: string;
  message: string;
}

/**
 * Animated error alert banner.
 * Render conditionally — only mount when an error exists.
 */
export default function ErrorBanner({ title, message }: ErrorBannerProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="w-full glass-panel border border-red-500/20 bg-red-950/20 p-4 rounded-2xl mt-6 flex items-start gap-3"
    >
      <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
      <div>
        <h4 className="text-red-400 font-bold text-sm">{title}</h4>
        <p className="text-zinc-400 text-xs mt-1">{message}</p>
      </div>
    </motion.div>
  );
}
