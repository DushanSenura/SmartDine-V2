import { AnimatePresence, motion } from "motion/react";

export function FormError({ message }: { message?: string | null }) {
  return (
    <AnimatePresence>
      {message && (
        <motion.p
          role="alert"
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger"
        >
          {message}
        </motion.p>
      )}
    </AnimatePresence>
  );
}
