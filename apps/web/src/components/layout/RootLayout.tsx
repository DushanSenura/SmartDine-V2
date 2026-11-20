import { AnimatePresence, motion } from "motion/react";
import { useLocation, useOutlet } from "react-router-dom";

import { Toaster } from "@/components/feedback/Toaster";
import { useConnectionToasts } from "@/hooks/useConnectionToasts";
import { baseTransition } from "@/lib/motion";

/** Wraps routed pages in a subtle fade + 8px rise transition. */
export function RootLayout() {
  const location = useLocation();
  const outlet = useOutlet();
  useConnectionToasts();

  return (
    <>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={baseTransition}
        >
          {outlet}
        </motion.div>
      </AnimatePresence>
      <Toaster />
    </>
  );
}
