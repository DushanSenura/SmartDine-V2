import { motion } from "motion/react";
import type { ReactNode } from "react";

import { easeEmphasized } from "@/lib/motion";

const group = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.09 } },
};

const item = {
  hidden: { opacity: 0, y: 24, scale: 0.97 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.45, ease: easeEmphasized },
  },
};

/** A list whose children rise in one after another when it scrolls into view. Keep it short. */
export function Stagger({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <motion.ul
      className={className}
      variants={group}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-80px" }}
    >
      {children}
    </motion.ul>
  );
}

export function StaggerItem({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <motion.li className={className} variants={item}>
      {children}
    </motion.li>
  );
}
