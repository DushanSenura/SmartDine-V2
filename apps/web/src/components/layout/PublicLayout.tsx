import { WEEK_DAYS } from "@smartdine/shared";
import { AnimatePresence, motion, useScroll, useSpring } from "motion/react";
import { ArrowUpRight, Clock, Mail, MapPin, Menu, Phone, UserRound, X } from "lucide-react";
import { useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";

import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { ROLE_HOME } from "@/features/auth/utils/roleHome";
import { BranchPicker } from "@/features/public/components/BranchPicker";
import { usePublicBranch } from "@/features/public/hooks/usePublicBranch";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Home", end: true },
  { to: "/menu", label: "Menu" },
  { to: "/reservations", label: "Reservations" },
  { to: "/rooms", label: "Rooms" },
  { to: "/offers", label: "Offers" },
  { to: "/about", label: "About" },
  { to: "/gallery", label: "Gallery" },
  { to: "/contact", label: "Contact" },
] as const;

const linkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
    isActive
      ? "bg-primary/10 text-primary"
      : "text-muted-foreground hover:bg-surface-muted hover:text-foreground",
  );

function AccountLink({ onClick }: { onClick?: () => void }) {
  const { user, status } = useAuth();
  if (status === "loading") return <span className="h-9 w-20" aria-hidden />;
  return (
    <Link
      to={user ? ROLE_HOME[user.role] : "/login"}
      onClick={onClick}
      className="inline-flex h-9 items-center gap-2 rounded-full whitespace-nowrap bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-transform hover:scale-[1.03]"
    >
      <UserRound className="size-4" aria-hidden />
      {user ? (user.role === "CUSTOMER" ? "My account" : "Dashboard") : "Sign in"}
    </Link>
  );
}

/** A floating pill that hovers over the page; it takes no layout space of its own. */
function Header() {
  const [open, setOpen] = useState(false);
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 140, damping: 24 });
  return (
    <header className="sticky top-0 z-30 h-0">
      <motion.div
        aria-hidden
        style={{ scaleX: progress }}
        className="fixed inset-x-0 top-0 h-0.5 origin-left bg-gradient-to-r from-primary via-accent to-primary"
      />
      <div className="mx-auto max-w-6xl px-3 pt-3 sm:px-6">
        <div className="rounded-full border border-border bg-surface/90 shadow-lg backdrop-blur-xl">
          <div className="flex h-14 items-center justify-between gap-3 pr-2 pl-5">
            <Link to="/" className="font-display text-xl font-semibold tracking-tight text-primary">
              SmartDine
            </Link>
            <nav aria-label="Main" className="hidden items-center gap-0.5 lg:flex">
              {NAV.map(({ to, label, ...rest }) => (
                <NavLink key={to} to={to} end={"end" in rest} className={linkClass}>
                  {label}
                </NavLink>
              ))}
            </nav>
            <div className="flex items-center gap-2">
              <BranchPicker className="hidden md:flex" />
              <div className="hidden sm:block">
                <ThemeToggle />
              </div>
              <AccountLink />
              <button
                type="button"
                aria-label={open ? "Close menu" : "Open menu"}
                aria-expanded={open}
                aria-controls="mobile-nav"
                onClick={() => setOpen((v) => !v)}
                className="grid size-9 place-items-center rounded-full hover:bg-surface-muted lg:hidden"
              >
                {open ? (
                  <X className="size-5" aria-hidden />
                ) : (
                  <Menu className="size-5" aria-hidden />
                )}
              </button>
            </div>
          </div>
          <AnimatePresence>
            {open && (
              <motion.nav
                id="mobile-nav"
                aria-label="Mobile"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.22 }}
                className="overflow-hidden lg:hidden"
              >
                <div className="flex flex-col gap-1 border-t border-border px-4 py-3">
                  {NAV.map(({ to, label, ...rest }) => (
                    <NavLink
                      key={to}
                      to={to}
                      end={"end" in rest}
                      className={linkClass}
                      onClick={() => setOpen(false)}
                    >
                      {label}
                    </NavLink>
                  ))}
                  <div className="flex items-center justify-between pt-2">
                    <BranchPicker />
                    <ThemeToggle />
                  </div>
                </div>
              </motion.nav>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}

const DAY_NAMES = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
} as const;

const FOOTER_LINKS = [
  { to: "/menu", label: "Menu" },
  { to: "/reservations", label: "Reserve a table" },
  { to: "/rooms", label: "Book a room" },
  { to: "/offers", label: "Offers" },
  { to: "/gallery", label: "Gallery" },
  { to: "/about", label: "About" },
] as const;

/** Always dark, whatever the theme: it closes the page with a strong base. */
function Footer() {
  const { branch, company } = usePublicBranch();
  const hours = branch?.openingHours;
  const name = company?.name ?? "SmartDine";
  return (
    <footer className="relative mt-28 overflow-hidden bg-mesh text-white">
      <div aria-hidden className="bg-grid absolute inset-0 opacity-60" />
      <div className="relative mx-auto max-w-6xl px-4 pt-16 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-6 border-b border-white/15 pb-10">
          <h2 className="max-w-xl font-display text-3xl leading-tight font-semibold sm:text-5xl">
            Your table is <span className="text-gradient">waiting.</span>
          </h2>
          <Link
            to="/reservations"
            className="inline-flex h-12 items-center gap-2 rounded-full bg-white px-6 font-medium text-slate-900 transition-transform hover:scale-105"
          >
            Reserve now <ArrowUpRight className="size-4" aria-hidden />
          </Link>
        </div>
        <div className="grid gap-10 py-12 md:grid-cols-4">
          <div className="space-y-3 md:col-span-1">
            <p className="font-display text-2xl font-semibold">{name}</p>
            <p className="max-w-xs text-sm text-white/70">
              Seasonal food, warm service and a table or a room whenever you need one.
            </p>
          </div>
          <nav aria-label="Footer" className="space-y-3 text-sm">
            <p className="font-semibold">Explore</p>
            <ul className="space-y-2 text-white/70">
              {FOOTER_LINKS.map(({ to, label }) => (
                <li key={to}>
                  <Link className="transition-colors hover:text-white" to={to}>
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <div className="space-y-3 text-sm">
            <p className="font-semibold">Visit {branch?.name}</p>
            <ul className="space-y-2 text-white/70">
              {branch?.address && (
                <li className="flex gap-2">
                  <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
                  {branch.address}
                </li>
              )}
              {branch?.phone && (
                <li className="flex gap-2">
                  <Phone className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <a className="hover:text-white" href={`tel:${branch.phone.replaceAll(" ", "")}`}>
                    {branch.phone}
                  </a>
                </li>
              )}
              {branch?.email && (
                <li className="flex gap-2">
                  <Mail className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <a className="hover:text-white" href={`mailto:${branch.email}`}>
                    {branch.email}
                  </a>
                </li>
              )}
            </ul>
          </div>
          <div className="space-y-3 text-sm">
            <p className="flex items-center gap-2 font-semibold">
              <Clock className="size-4" aria-hidden /> Opening hours
            </p>
            {hours ? (
              <dl className="grid grid-cols-[3rem_1fr] gap-x-3 gap-y-1 text-white/70">
                {WEEK_DAYS.map((day) => {
                  const h = hours[day];
                  return (
                    <div key={day} className="contents">
                      <dt>{DAY_NAMES[day]}</dt>
                      <dd>{h ? `${h.open} – ${h.close}` : "Closed"}</dd>
                    </div>
                  );
                })}
              </dl>
            ) : (
              <p className="text-white/70">Please call for opening hours.</p>
            )}
          </div>
        </div>
        <div className="border-t border-white/15 py-5 text-center text-xs text-white/60">
          © {new Date().getFullYear()} {name}
        </div>
      </div>
    </footer>
  );
}

/** Shell for every customer-facing page. */
export function PublicLayout() {
  const { pathname } = useLocation();
  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
      >
        Skip to content
      </a>
      <Header />
      {/* The home hero slides under the floating header; every other page clears it. */}
      <main id="content" className={cn("flex-1", pathname !== "/" && "pt-20")}>
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
