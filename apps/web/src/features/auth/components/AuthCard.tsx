import { motion } from "motion/react";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

import { Brand } from "@/components/ui/Brand";
import { fadeUp } from "@/lib/motion";

export function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  const navigate = useNavigate();
  return (
    <main className="relative grid min-h-screen place-items-center px-4 py-12">
      <button
        type="button"
        onClick={() => (window.history.length > 1 ? navigate(-1) : navigate("/"))}
        className="group absolute top-4 left-4 inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-surface-muted sm:top-6 sm:left-6"
      >
        <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-1" aria-hidden />
        Back
      </button>
      <motion.div
        variants={fadeUp}
        initial="hidden"
        animate="visible"
        className="w-full max-w-md space-y-6 rounded-xl border border-border bg-surface p-6 shadow-lg sm:p-8"
      >
        <div className="space-y-2">
          <Link to="/" aria-label="SmartDine home">
            <Brand size="sm" />
          </Link>
          <h1 className="font-display text-3xl font-semibold">{title}</h1>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
        {children}
        <p className="text-center text-sm text-muted-foreground">{footer}</p>
      </motion.div>
    </main>
  );
}
