import {
  ArrowRight,
  ArrowUpRight,
  BedDouble,
  ChefHat,
  ChevronDown,
  Leaf,
  MapPin,
  Sparkles,
  Users2,
  UtensilsCrossed,
} from "lucide-react";
import { motion, useScroll, useTransform } from "motion/react";
import { Link } from "react-router-dom";

import { PROMOTION_TYPE_LABELS } from "@smartdine/shared";
import { usePublicOffers } from "@/features/promotions/api/promotionQueries";
import { GuestReviews } from "@/features/reviews/components/GuestReviews";
import { MenuCard } from "@/features/menu/components/MenuCard";
import { MenuItemDetail } from "@/features/menu/components/MenuItemDetail";
import { easeEmphasized, fadeUp, stagger } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { Fragment, useState } from "react";
import type { MenuItemDto } from "@smartdine/shared";

import { useGallery, usePublicMenu } from "../api/publicQueries";
import { Stagger, StaggerItem } from "../components/Reveal";
import { usePublicBranch } from "../hooks/usePublicBranch";
import { offerHeadline, offerWhen } from "../utils/offers";

const buttonBase =
  "inline-flex h-12 items-center justify-center gap-2 rounded-md px-6 text-base font-medium transition-colors";

const HEADLINE = "A table, a celebration, a room — all at".split(" ");

const word = {
  hidden: { opacity: 0, y: "0.6em", filter: "blur(8px)" },
  visible: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.6, ease: easeEmphasized },
  },
};

function Hero() {
  // Background elements drift at different speeds as the page scrolls: a cheap sense of depth.
  const { scrollY } = useScroll();
  const ringsY = useTransform(scrollY, [0, 600], [0, 120]);
  const textY = useTransform(scrollY, [0, 600], [0, 60]);
  const fade = useTransform(scrollY, [0, 450], [1, 0]);

  return (
    <section className="relative isolate overflow-hidden rounded-b-[2.5rem] bg-mesh text-white md:rounded-b-[4rem]">
      <motion.div aria-hidden style={{ y: ringsY }} className="absolute inset-0 -z-10">
        <div className="bg-grid absolute inset-0" />
        <motion.div
          className="absolute top-1/3 left-[8%] size-72 rounded-full bg-[oklch(0.6_0.2_262)]/30 blur-3xl"
          animate={{ x: [0, 40, 0], y: [0, -30, 0] }}
          transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute right-[12%] bottom-[12%] size-64 rounded-full bg-accent/30 blur-3xl"
          animate={{ x: [0, -50, 0], y: [0, 30, 0] }}
          transition={{ duration: 17, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute top-1/4 -right-32 hidden size-[34rem] rounded-full border border-white/15 lg:block"
          animate={{ rotate: 360 }}
          transition={{ duration: 90, repeat: Infinity, ease: "linear" }}
        >
          <span className="absolute -top-2 left-1/2 size-4 rounded-full bg-accent shadow-[0_0_30px] shadow-accent" />
          <span className="absolute inset-12 rounded-full border border-white/10" />
          <span className="absolute inset-28 rounded-full border border-white/10" />
        </motion.div>
      </motion.div>
      <motion.div
        style={{ y: textY, opacity: fade }}
        variants={stagger}
        initial="hidden"
        animate="visible"
        className="mx-auto flex min-h-[88vh] max-w-6xl flex-col justify-center gap-7 px-4 pt-32 pb-24 sm:px-6"
      >
        <motion.p
          variants={fadeUp}
          className="inline-flex w-fit items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-sm backdrop-blur"
        >
          <Sparkles className="size-4 text-accent" aria-hidden /> Dining · Private events · Stays
        </motion.p>
        <motion.h1
          variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.07 } } }}
          className="max-w-4xl font-display text-5xl leading-[1.05] font-semibold tracking-tight sm:text-7xl"
        >
          {HEADLINE.map((w, i) => (
            <Fragment key={i}>
              <motion.span variants={word} className="inline-block">
                {w}
              </motion.span>{" "}
            </Fragment>
          ))}
          <motion.span variants={word} className="text-gradient inline-block">
            SmartDine.
          </motion.span>
        </motion.h1>
        <motion.p variants={fadeUp} className="max-w-xl text-lg text-white/80">
          Seasonal food, thoughtful service and a place for every occasion.
        </motion.p>
        <motion.div variants={fadeUp} className="flex flex-wrap gap-3 pt-2">
          <Link
            to="/menu"
            className={cn(
              buttonBase,
              "group rounded-full bg-white text-slate-900 shadow-lg hover:scale-105",
            )}
          >
            View menu{" "}
            <ArrowRight
              className="size-4 transition-transform group-hover:translate-x-1"
              aria-hidden
            />
          </Link>
          <Link
            to="/reservations"
            className={cn(
              buttonBase,
              "rounded-full bg-accent text-accent-foreground hover:scale-105",
            )}
          >
            Reserve a table
          </Link>
          <Link
            to="/rooms"
            className={cn(
              buttonBase,
              "rounded-full border border-white/40 bg-white/5 backdrop-blur hover:bg-white/15",
            )}
          >
            Book a room
          </Link>
        </motion.div>
      </motion.div>
      <motion.a
        href="#featured"
        aria-label="Scroll to featured dishes"
        style={{ opacity: fade }}
        className="absolute bottom-8 left-1/2 hidden -translate-x-1/2 sm:block"
        animate={{ y: [0, 8, 0] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
      >
        <ChevronDown className="size-7 text-white/70" aria-hidden />
      </motion.a>
    </section>
  );
}

function Section({
  title,
  eyebrow,
  children,
  id,
}: {
  title: string;
  eyebrow?: string;
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <motion.section
      id={id}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.34 }}
      className="mx-auto max-w-6xl space-y-10 px-4 pt-24 sm:px-6"
    >
      <div className="max-w-2xl space-y-3">
        {eyebrow && (
          <p className="flex items-center gap-3 text-sm font-semibold tracking-widest text-primary uppercase">
            <span aria-hidden className="h-px w-8 bg-primary/60" />
            {eyebrow}
          </p>
        )}
        <h2 className="font-display text-4xl leading-tight font-semibold tracking-tight sm:text-5xl">
          {title}
        </h2>
      </div>
      {children}
    </motion.section>
  );
}

function FeaturedMenu() {
  const { branch, currency } = usePublicBranch();
  const { data } = usePublicMenu(branch?.id, { featured: true });
  const [selected, setSelected] = useState<MenuItemDto | null>(null);
  const all = (data?.items ?? []).slice(0, 6);
  // Whole rows only: a lone card in the last row looks like something is missing.
  const items = all.length >= 3 ? all.slice(0, all.length - (all.length % 3)) : all;
  if (!items.length || !branch) return null;
  return (
    <Section id="featured" eyebrow="From the kitchen" title="Featured dishes">
      <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <MenuCard
            key={item.id}
            item={item}
            currency={currency}
            onOpen={() => setSelected(item)}
          />
        ))}
      </ul>
      <Link
        to="/menu"
        className="group inline-flex items-center gap-2 rounded-full border border-border px-5 py-2.5 text-sm font-medium transition-colors hover:bg-surface-muted"
      >
        See the full menu
        <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden />
      </Link>
      {selected && (
        <MenuItemDetail
          branchId={branch.id}
          initial={selected}
          currency={currency}
          onClose={() => setSelected(null)}
        />
      )}
    </Section>
  );
}

const EXPERIENCE = [
  {
    icon: UtensilsCrossed,
    title: "The dining experience",
    text: "Relaxed tables, unhurried courses and food made to share.",
  },
  {
    icon: ChefHat,
    title: "Our kitchen",
    text: "A team that cooks from scratch and changes the specials with the day.",
  },
  {
    icon: Leaf,
    title: "Ingredients",
    text: "Seasonal produce and honest sourcing, with allergens clearly listed on every dish.",
  },
  {
    icon: Sparkles,
    title: "Atmosphere & service",
    text: "Warm, attentive and never in your way — from a quick lunch to a long celebration.",
  },
];

function Experience() {
  return (
    <Section eyebrow="Why SmartDine" title="The restaurant experience">
      <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {EXPERIENCE.map(({ icon: Icon, title, text }, i) => (
          <StaggerItem
            key={title}
            className="group relative space-y-3 overflow-hidden rounded-3xl border border-border bg-surface p-6 transition-all hover:-translate-y-1 hover:shadow-lg"
          >
            {/* Purely decorative numeral, drawn as generated content so it isn't page text. */}
            <span
              aria-hidden
              data-n={String(i + 1).padStart(2, "0")}
              className="absolute top-3 right-5 font-display text-6xl font-semibold text-primary/10 transition-colors before:content-[attr(data-n)] group-hover:text-primary/20"
            />
            <span className="grid size-12 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-md">
              <Icon className="size-5" aria-hidden />
            </span>
            <h3 className="font-display text-xl font-semibold">{title}</h3>
            <p className="text-sm text-muted-foreground">{text}</p>
          </StaggerItem>
        ))}
      </Stagger>
    </Section>
  );
}

const OPTIONS = [
  {
    to: "/reservations",
    icon: UtensilsCrossed,
    title: "Standard dining",
    text: "Reserve a table in the dining area you prefer.",
    tint: "from-[oklch(0.45_0.18_262)] to-[oklch(0.3_0.12_270)]",
  },
  {
    to: "/reservations?tab=private",
    icon: Users2,
    title: "Private dining",
    text: "Birthdays, business dinners and celebrations in your own room.",
    tint: "from-[oklch(0.45_0.17_305)] to-[oklch(0.3_0.1_290)]",
  },
  {
    to: "/rooms",
    icon: BedDouble,
    title: "Accommodation",
    text: "Comfortable rooms with breakfast and room service. Book online.",
    tint: "from-[oklch(0.5_0.12_75)] to-[oklch(0.33_0.08_60)]",
  },
];

function DiningOptions() {
  return (
    <Section eyebrow="Choose your evening" title="Ways to dine with us">
      <Stagger className="grid gap-4 md:grid-cols-3">
        {OPTIONS.map(({ to, icon: Icon, title, text, tint }) => (
          <StaggerItem key={title}>
            <Link
              to={to}
              className={cn(
                "group relative flex h-full min-h-72 flex-col justify-between overflow-hidden rounded-3xl bg-gradient-to-br p-7 text-white shadow-md transition-all hover:-translate-y-1 hover:shadow-xl",
                tint,
              )}
            >
              <Icon
                aria-hidden
                className="absolute -right-6 -bottom-6 size-44 text-white/10 transition-transform duration-500 group-hover:scale-110 group-hover:-rotate-6"
              />
              <span className="grid size-12 place-items-center rounded-2xl bg-white/15 backdrop-blur">
                <Icon className="size-6" aria-hidden />
              </span>
              <div className="relative space-y-2">
                <h3 className="font-display text-2xl font-semibold">{title}</h3>
                <p className="text-sm text-white/80">{text}</p>
                <span className="inline-flex items-center gap-1 pt-1 text-sm font-medium">
                  Explore <ArrowUpRight className="size-4" aria-hidden />
                </span>
              </div>
            </Link>
          </StaggerItem>
        ))}
      </Stagger>
    </Section>
  );
}

function GalleryStrip() {
  const { branch } = usePublicBranch();
  const { data } = useGallery(branch?.id);
  if (!data?.length) return null;
  return (
    <Section eyebrow="Gallery" title="A taste of SmartDine">
      <Stagger className="grid auto-rows-[11rem] grid-cols-2 gap-3 md:grid-cols-4">
        {data.slice(0, 6).map((image, i) => (
          <StaggerItem
            key={image.src}
            className={cn("overflow-hidden rounded-3xl", i === 0 && "col-span-2 row-span-2")}
          >
            <img
              src={image.src}
              alt={image.caption}
              loading="lazy"
              className="size-full object-cover transition-transform duration-500 hover:scale-105"
            />
          </StaggerItem>
        ))}
      </Stagger>
    </Section>
  );
}

function Branches() {
  const { branches, select } = usePublicBranch();
  if (!branches.length) return null;
  return (
    <Section eyebrow="Find us" title={branches.length > 1 ? "Our locations" : "Our location"}>
      <Stagger className="grid gap-4 md:grid-cols-2">
        {branches.map((b) => (
          <StaggerItem
            key={b.id}
            className="space-y-3 rounded-3xl border border-border bg-surface p-6 transition-shadow hover:shadow-lg"
          >
            <h3 className="font-display text-xl font-semibold">{b.name}</h3>
            <p className="flex items-start gap-2 text-sm text-muted-foreground">
              <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
              {[b.address, b.city].filter(Boolean).join(", ") || "Address coming soon"}
            </p>
            <div className="flex gap-4 text-sm font-medium">
              <Link
                to="/reservations"
                onClick={() => select(b.id)}
                className="text-primary hover:underline"
              >
                Reserve here
              </Link>
              <Link
                to="/contact"
                onClick={() => select(b.id)}
                className="text-primary hover:underline"
              >
                Hours & contact
              </Link>
            </div>
          </StaggerItem>
        ))}
      </Stagger>
    </Section>
  );
}

function SpecialOffers() {
  const { branch, currency } = usePublicBranch();
  const { data } = usePublicOffers(branch?.id);
  if (!data?.length) return null;
  return (
    <Section eyebrow="Offers" title="Special offers">
      <Stagger className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {data.slice(0, 3).map((o) => (
          <StaggerItem
            key={o.id}
            className="space-y-2 rounded-3xl border border-dashed border-primary/40 bg-gradient-to-br from-primary/10 to-accent/10 p-6 transition-shadow hover:shadow-lg"
          >
            <p className="text-xs font-semibold tracking-wide text-primary uppercase">
              {PROMOTION_TYPE_LABELS[o.type]}
            </p>
            <h3 className="font-display text-xl font-semibold">{o.name}</h3>
            {offerHeadline(o, currency) && (
              <p className="font-display text-3xl font-semibold text-primary">
                {offerHeadline(o, currency)}
              </p>
            )}
            {o.description && <p className="text-sm text-muted-foreground">{o.description}</p>}
            {offerWhen(o) && <p className="text-xs text-muted-foreground">{offerWhen(o)}</p>}
          </StaggerItem>
        ))}
      </Stagger>
      <Link to="/offers" className="inline-block text-sm font-medium text-primary hover:underline">
        See all offers
      </Link>
    </Section>
  );
}

export function HomePage() {
  return (
    <>
      <Hero />
      <FeaturedMenu />
      <Experience />
      <DiningOptions />
      <SpecialOffers />
      <GalleryStrip />
      <GuestReviews />
      <Branches />
    </>
  );
}
