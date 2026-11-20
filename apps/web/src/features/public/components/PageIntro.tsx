import { motion } from "motion/react";
import type { ReactNode } from "react";

import { fadeUp, stagger } from "@/lib/motion";

/** Page title block for public pages: a soft tinted banner with a large display heading. */
export function PageIntro({
  eyebrow,
  title,
  text,
  children,
}: {
  eyebrow?: string;
  title: string;
  text?: string;
  children?: ReactNode;
}) {
  return (
    <section className="relative isolate mb-10 overflow-hidden">
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-gradient-to-b from-primary/10 via-primary/5 to-transparent"
      />
      <div
        aria-hidden
        className="absolute -top-24 right-0 -z-10 size-80 rounded-full bg-accent/25 blur-3xl"
      />
      <motion.div
        variants={stagger}
        initial="hidden"
        animate="visible"
        className="mx-auto max-w-6xl space-y-4 px-4 pt-14 pb-10 sm:px-6"
      >
        {eyebrow && (
          <motion.p
            variants={fadeUp}
            className="flex items-center gap-3 text-sm font-semibold tracking-widest text-primary uppercase"
          >
            <span aria-hidden className="h-px w-8 bg-primary/60" />
            {eyebrow}
          </motion.p>
        )}
        <motion.h1
          variants={fadeUp}
          className="max-w-3xl font-display text-5xl leading-[1.05] font-semibold tracking-tight sm:text-6xl"
        >
          {title}
        </motion.h1>
        {text && (
          <motion.p variants={fadeUp} className="max-w-2xl text-lg text-muted-foreground">
            {text}
          </motion.p>
        )}
        {children && <motion.div variants={fadeUp}>{children}</motion.div>}
      </motion.div>
    </section>
  );
}
