import { AnimatePresence, motion, useMotionValue, useSpring } from "motion/react";
import { useEffect, useState } from "react";

const INTERACTIVE =
  "a[href], button, summary, label[for], select, [role='button'], [role='tab'], [role='link']";
const TEXT_FIELD =
  "input:not([type=checkbox]):not([type=radio]):not([type=range]), textarea, [contenteditable='true']";

type Mode = "idle" | "link" | "text";

/**
 * A custom pointer: a small gold dot that tracks the mouse exactly, and a blue ring that trails it
 * on a spring. The ring swells over links and buttons, shrinks while pressed and sends out a ripple
 * on click. Over text fields the real I-beam is restored. Fine pointers only, and off when the
 * visitor prefers reduced motion, so touch screens and accessibility settings are untouched.
 */
export function CustomCursor() {
  const [enabled, setEnabled] = useState(false);
  const [mode, setMode] = useState<Mode>("idle");
  const [pressed, setPressed] = useState(false);
  const [visible, setVisible] = useState(false);
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number }[]>([]);

  const x = useMotionValue(-100);
  const y = useMotionValue(-100);
  const ringX = useSpring(x, { stiffness: 260, damping: 24, mass: 0.6 });
  const ringY = useSpring(y, { stiffness: 260, damping: 24, mass: 0.6 });

  useEffect(() => {
    const fine = window.matchMedia("(pointer: fine)");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setEnabled(fine.matches && !reduce.matches);
    sync();
    fine.addEventListener("change", sync);
    reduce.addEventListener("change", sync);
    return () => {
      fine.removeEventListener("change", sync);
      reduce.removeEventListener("change", sync);
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    document.documentElement.classList.add("custom-cursor");
    let rippleId = 0;

    const move = (e: PointerEvent) => {
      x.set(e.clientX);
      y.set(e.clientY);
      setVisible(true);
      const target = e.target instanceof Element ? e.target : null;
      setMode(
        target?.closest(TEXT_FIELD) ? "text" : target?.closest(INTERACTIVE) ? "link" : "idle",
      );
    };
    const down = (e: PointerEvent) => {
      setPressed(true);
      const id = ++rippleId;
      setRipples((r) => [...r, { id, x: e.clientX, y: e.clientY }]);
      window.setTimeout(() => setRipples((r) => r.filter((p) => p.id !== id)), 600);
    };
    const up = () => setPressed(false);
    const leave = () => setVisible(false);

    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerdown", down, { passive: true });
    window.addEventListener("pointerup", up, { passive: true });
    document.documentElement.addEventListener("pointerleave", leave);
    return () => {
      document.documentElement.classList.remove("custom-cursor");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerdown", down);
      window.removeEventListener("pointerup", up);
      document.documentElement.removeEventListener("pointerleave", leave);
    };
  }, [enabled, x, y]);

  if (!enabled) return null;

  const show = visible && mode !== "text";
  const ringScale = pressed ? 0.7 : mode === "link" ? 1.9 : 1;

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[9999] overflow-hidden">
      <motion.div
        style={{ x: ringX, y: ringY }}
        className="absolute top-0 left-0"
        animate={{ opacity: show ? 1 : 0 }}
        transition={{ duration: 0.15 }}
      >
        <motion.div
          className="-ml-4 -mt-4 size-8 rounded-full border-2 border-primary/70 dark:border-white/70"
          animate={{
            scale: ringScale,
            backgroundColor:
              mode === "link" ? "oklch(0.8 0.14 80 / 0.28)" : "oklch(0.8 0.14 80 / 0)",
          }}
          transition={{ type: "spring", stiffness: 400, damping: 22 }}
        />
      </motion.div>
      <motion.div
        style={{ x, y }}
        className="absolute top-0 left-0"
        animate={{ opacity: show ? 1 : 0 }}
        transition={{ duration: 0.1 }}
      >
        <motion.div
          className="-ml-1 -mt-1 size-2 rounded-full bg-accent shadow-[0_0_10px] shadow-accent"
          animate={{ scale: mode === "link" ? 0.5 : pressed ? 1.8 : 1 }}
          transition={{ type: "spring", stiffness: 500, damping: 25 }}
        />
      </motion.div>
      <AnimatePresence>
        {ripples.map((r) => (
          <motion.span
            key={r.id}
            className="absolute -ml-5 -mt-5 size-10 rounded-full border-2 border-accent"
            style={{ left: r.x, top: r.y }}
            initial={{ scale: 0.3, opacity: 0.9 }}
            animate={{ scale: 2.2, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.55, ease: "easeOut" }}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}
