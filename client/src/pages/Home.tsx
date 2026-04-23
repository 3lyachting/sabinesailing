/*
 * DESIGN: Nautique premium (inspiration Izenah Sailing)
 * Page principale — Sabine Sailing
 * Couleurs: Bleu nuit + Ivoire + Laiton discret
 * Typo: Serif élégante (titres) + DM Sans (corps)
 */

import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { motion, useInView } from "framer-motion";
import { withBasePath } from "@/lib/basePath";
import {
  Anchor, Wind, Waves, Sun, MapPin, Users, Star,
  Phone, Mail, Instagram, Facebook, ChevronDown,
  Ship, Compass, Fish, Sunset, ArrowRight, Menu, X
} from "lucide-react";
const CalendrierDisponibilites = lazy(() => import("@/components/CalendrierDisponibilites"));
const AvisGoogle = lazy(() => import("@/components/AvisGoogle"));

// ── Navbar ────────────────────────────────────────────────────────────────────
function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const navLinks = [
    { href: "#catamaran", label: "Sabine" },
    { href: "#destinations", label: "Destinations" },
    { href: "#programme", label: "Programme" },
    { href: "#equipage", label: "Équipage" },
    { href: "#calendrier", label: "Calendrier & Tarifs" },
    { href: "#contact", label: "Contact" },
  ];

  const scrollTo = (id: string) => {
    document.querySelector(id)?.scrollIntoView({ behavior: "smooth" });
    setOpen(false);
  };

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        scrolled
          ? "bg-[oklch(0.98_0.01_90)]/95 backdrop-blur-md shadow-[0_8px_30px_rgba(10,25,45,0.08)] border-b border-[oklch(0.88_0.02_220)]"
          : "bg-transparent"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className={`flex items-center justify-between transition-all duration-500 ${scrolled ? "h-20 lg:h-20" : "h-32 lg:h-36"}`}>
          {/* Logo */}
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="flex items-center"
            aria-label="Retour en haut de la page d'accueil"
          >
            <img
              src="/logo-sabine.png"
              alt="Sabine Sailing"
              className={`w-auto transition-all duration-500 ease-out mix-blend-screen ${scrolled ? "h-16 lg:h-20" : "h-28 lg:h-32"}`}
            />
          </button>

          {/* Desktop links */}
          <div className="hidden lg:flex items-center gap-6">
            {navLinks.map(l => (
              <button
                key={l.href}
                onClick={() => scrollTo(l.href)}
                className={`${scrolled ? "text-[oklch(0.35_0.04_240)] hover:text-[oklch(0.2_0.06_240)]" : "text-white/80 hover:text-white"} text-sm font-medium transition-colors`}
              >
                {l.label}
              </button>
            ))}
            <button
              onClick={() => scrollTo("#calendrier")}
              className={`${scrolled ? "bg-[oklch(0.2_0.06_240)] text-white hover:bg-[oklch(0.16_0.05_240)]" : "bg-white text-[oklch(0.2_0.06_240)] hover:bg-[oklch(0.96_0.01_90)]"} ml-2 px-5 py-2 rounded-full text-sm font-bold transition-all hover:scale-105`}
            >
              Réserver
            </button>
            <a
              href={withBasePath("/espace-client")}
              className={`${scrolled ? "border border-[oklch(0.2_0.06_240)] text-[oklch(0.2_0.06_240)] hover:bg-[oklch(0.2_0.06_240)] hover:text-white" : "border border-white/70 text-white hover:bg-white hover:text-[oklch(0.2_0.06_240)]"} px-5 py-2 rounded-full text-sm font-bold transition-all`}
            >
              Espace client
            </a>
          </div>

          {/* Mobile burger */}
          <button
            className={`lg:hidden p-2 transition-colors ${scrolled ? "text-[oklch(0.25_0.04_240)]" : "text-white"}`}
            onClick={() => setOpen(!open)}
          >
            {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="lg:hidden bg-[oklch(0.15_0.05_220)]/98 backdrop-blur-md border-t border-white/10">
          <div className="px-4 py-4 space-y-2">
            {navLinks.map(l => (
              <button
                key={l.href}
                onClick={() => scrollTo(l.href)}
                className="block w-full text-left text-white/80 hover:text-white py-2 text-sm font-medium"
              >
                {l.label}
              </button>
            ))}
            <button
              onClick={() => scrollTo("#calendrier")}
              className="w-full mt-2 px-5 py-2.5 rounded-full bg-[oklch(0.72_0.11_85)] text-white text-sm font-bold"
            >
              Réserver
            </button>
            <a
              href={withBasePath("/espace-client")}
              onClick={() => setOpen(false)}
              className="block w-full mt-2 px-5 py-2.5 rounded-full border border-white/30 text-white text-center text-sm font-bold"
            >
              Espace client
            </a>
          </div>
        </div>
      )}
    </nav>
  );
}

// ── Section Reveal ────────────────────────────────────────────────────────────
function Reveal({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 40 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ── Wave Divider ──────────────────────────────────────────────────────────────
function WaveDivider({ fill = "#fff", flip = false }: { fill?: string; flip?: boolean }) {
  return (
    <div className={`w-full overflow-hidden leading-none ${flip ? "rotate-180" : ""}`} style={{ height: 60 }}>
      <svg viewBox="0 0 1440 60" preserveAspectRatio="none" className="w-full h-full">
        <path
          d="M0,30 C360,60 720,0 1080,30 C1260,45 1380,20 1440,30 L1440,60 L0,60 Z"
          fill={fill}
        />
      </svg>
    </div>
  );
}

// ── Hero ──────────────────────────────────────────────────────────────────────
function Hero() {
  return (
    <section className="relative min-h-screen flex items-center overflow-hidden">
      {/* Hero photo */}
      <div className="absolute inset-0 w-full h-full overflow-hidden">
        <img
          src="/photos/IMG_4507.jpeg"
          alt="Sabine Sailing en navigation"
          className="w-full h-full object-cover"
          fetchPriority="high"
          decoding="async"
        />
      </div>
      {/* Overlay gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-[oklch(0.08_0.03_240)]/70 via-[oklch(0.15_0.05_240)]/40 to-[oklch(0.08_0.03_240)]/80" />

      {/* Animated waves overlay */}
      <div className="absolute bottom-0 left-0 right-0">
        <svg viewBox="0 0 1440 120" preserveAspectRatio="none" className="w-full" style={{ height: 80 }}>
          <motion.path
            d="M0,60 C240,100 480,20 720,60 C960,100 1200,20 1440,60 L1440,120 L0,120 Z"
            fill="white"
            animate={{ d: [
              "M0,60 C240,100 480,20 720,60 C960,100 1200,20 1440,60 L1440,120 L0,120 Z",
              "M0,40 C240,80 480,0 720,40 C960,80 1200,0 1440,40 L1440,120 L0,120 Z",
              "M0,60 C240,100 480,20 720,60 C960,100 1200,20 1440,60 L1440,120 L0,120 Z",
            ]}}
            transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
          />
        </svg>
      </div>

      {/* Content */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-24">
        <div className="max-w-3xl">
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/12 backdrop-blur-sm border border-white/25 text-white/90 text-sm font-medium mb-6"
          >
            <Anchor className="w-4 h-4 text-[oklch(0.88_0.03_95)]" />
            Catamaran Lagoon 570 · Pavillon Français
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.1 }}
            className="text-5xl sm:text-6xl lg:text-7xl font-extrabold text-white leading-[1.05] mb-6"
            style={{ fontFamily: "Syne, sans-serif" }}
          >
            Votre croisière
            <br />
            <span className="text-[oklch(0.92_0.02_95)]">Méditerranée</span>
            <br />
            <span className="text-[oklch(0.84_0.05_80)]">& Antilles</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.25 }}
            className="text-white/80 text-lg sm:text-xl leading-relaxed mb-8 max-w-xl"
          >
            Naviguez à bord de <strong className="text-white">« Sabine »</strong>, un Lagoon 570 
            fraîchement restauré, avec Victor et son équipage — capitaines professionnels passionnés.
            Corse & Sardaigne l'été, Martinique & Grenadines l'hiver.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.4 }}
            className="flex flex-wrap gap-4"
          >
            <button
              onClick={() => document.querySelector("#calendrier")?.scrollIntoView({ behavior: "smooth" })}
              className="px-7 py-3.5 rounded-full bg-white text-[oklch(0.2_0.06_240)] font-bold text-base hover:bg-[oklch(0.96_0.01_90)] transition-all hover:scale-105 shadow-lg"
            >
              Voir les disponibilités
            </button>
            <button
              onClick={() => document.querySelector("#destinations")?.scrollIntoView({ behavior: "smooth" })}
              className="px-7 py-3.5 rounded-full bg-transparent backdrop-blur-sm border border-white/45 text-white font-semibold text-base hover:bg-white/15 transition-all"
            >
              Découvrir les destinations
            </button>
          </motion.div>

          {/* Stats */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.7 }}
            className="flex flex-wrap gap-6 mt-12"
          >
            {[
              { val: "17m", label: "Lagoon 570" },
              { val: "8", label: "Passagers max" },
              { val: "10+", label: "Ans d'expérience" },
              { val: "3", label: "Univers de croisière" },
            ].map(s => (
              <div key={s.label} className="text-center">
                <div className="text-2xl font-extrabold text-white" style={{ fontFamily: "Syne, sans-serif" }}>{s.val}</div>
                <div className="text-white/50 text-xs mt-0.5">{s.label}</div>
              </div>
            ))}
          </motion.div>
        </div>
      </div>

      {/* Scroll indicator */}
      <motion.div
        className="absolute bottom-24 right-8 text-white/40 flex flex-col items-center gap-1"
        animate={{ y: [0, 8, 0] }}
        transition={{ duration: 2, repeat: Infinity }}
      >
        <span className="text-xs tracking-widest uppercase" style={{ writingMode: "vertical-rl" }}>Défiler</span>
        <ChevronDown className="w-4 h-4" />
      </motion.div>
    </section>
  );
}

// ── Section Catamaran ─────────────────────────────────────────────────────────
function SectionCatamaran() {
  const specs = [
    { label: "Longueur", val: "17,06 m" },
    { label: "Largeur", val: "9,15 m" },
    { label: "Tirant d'eau", val: "1,4 m" },
    { label: "Déplacement", val: "18 tonnes" },
    { label: "Voilure", val: "200 m²" },
    { label: "Cabines", val: "4 doubles" },
    { label: "Passagers", val: "8 (croisière)" },
    { label: "Capacité max", val: "8 passagers" },
  ];

  return (
    <section id="catamaran" className="py-20 lg:py-28 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <Reveal>
          <div className="text-center mb-16">
            <h2 className="text-5xl lg:text-6xl font-extrabold text-[oklch(0.15_0.05_220)]" style={{ fontFamily: "Cormorant Garamond, Times New Roman, serif" }}>
              Sabine
            </h2>
            <p className="mt-4 text-[oklch(0.45_0.04_220)] max-w-2xl mx-auto text-lg">
              Un Lagoon 570 entièrement rénové en 2025, conçu et fabriqué en France par le Chantier Naval Bordelais. 
              Confort, performance et respect de l'environnement.
            </p>
          </div>
        </Reveal>

        <div className="grid lg:grid-cols-2 gap-12 items-center mb-16">
          {/* Photo principale */}
          <Reveal>
            <div className="relative">
              <img
                src="/photos/IMG_4409.jpeg"
                alt="Catamaran Sabine Lagoon 570"
                className="w-full h-80 lg:h-96 object-cover rounded-3xl shadow-xl"
              />
              <div className="absolute -bottom-4 -right-4 bg-[oklch(0.28_0.08_240)] text-white rounded-2xl px-5 py-3 shadow-lg">
                <div className="text-2xl font-extrabold" style={{ fontFamily: "Syne, sans-serif" }}>Lagoon 570</div>
                <div className="text-white/80 text-xs">Rénové 2025</div>
              </div>
            </div>
          </Reveal>

          {/* Specs */}
          <Reveal delay={0.15}>
            <div>
              <h3 className="text-2xl font-bold text-[oklch(0.15_0.05_220)] mb-6" style={{ fontFamily: "Syne, sans-serif" }}>
                Caractéristiques techniques
              </h3>
              <div className="grid grid-cols-2 gap-3">
                {specs.map(s => (
                  <div key={s.label} className="bg-[oklch(0.97_0.02_220)] rounded-xl p-3">
                    <div className="text-xs text-[oklch(0.55_0.04_220)] font-medium">{s.label}</div>
                    <div className="text-base font-bold text-[oklch(0.22_0.07_220)] mt-0.5" style={{ fontFamily: "Syne, sans-serif" }}>{s.val}</div>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        </div>

        {/* Intérieur / Extérieur / Équipements */}
          <div className="grid md:grid-cols-3 gap-6">
          {[
            {
              title: "Intérieur",
              icon: <Ship className="w-6 h-6" />,
              img: "/photos/IMG_4477.jpeg",
              items: [
                "4 cabines doubles climatisées avec salle de bain privée",
                "Salon panoramique avec Smart TV 43\" & HiFi",
                "Cuisine équipée : expresso, dessalinisateur 160L/h, congélateur",
                "WiFi Starlink, lave-linge, prises 220V & USB dans chaque cabine",
              ],
            },
            {
              title: "Extérieur",
              icon: <Sun className="w-6 h-6" />,
              img: "/photos/IMG_4485.jpeg",
              items: [
                "2 trampolines avant pour bronzer & observer les dauphins",
                "Bain de soleil sur le bimini avec vue 360°",
                "Cockpit arrière ombragé pour 10 personnes",
                "Jupes arrières en teck avec douches & échelles de bain",
              ],
            },
            {
              title: "Équipements sportifs",
              icon: <Waves className="w-6 h-6" />,
              img: "/photos/IMG_4517.jpeg",
              items: [
                "2 Stand Up Paddles 10,6 pieds",
                "1 canoë-kayak rigide 2 places",
                "Palmes, masques, tubas pour tous",
                "Annexe semi-rigide 4,5m / 25cv",
              ],
            },
          ].map((card, i) => (
            <Reveal key={card.title} delay={i * 0.12}>
              <div className="bg-white rounded-3xl shadow-md overflow-hidden border border-[oklch(0.9_0.02_220)] hover:shadow-xl transition-shadow duration-300">
                <div className="relative h-44 overflow-hidden">
                  <img src={card.img} alt={card.title} className="w-full h-full object-cover" loading="lazy" decoding="async" />
                  <div className="absolute inset-0 bg-gradient-to-t from-[oklch(0.15_0.05_220)]/60 to-transparent" />
                  <div className="absolute bottom-3 left-4 flex items-center gap-2 text-white">
                    <div className="w-8 h-8 rounded-full bg-[oklch(0.28_0.08_240)] flex items-center justify-center">
                      {card.icon}
                    </div>
                    <span className="font-bold text-lg" style={{ fontFamily: "Syne, sans-serif" }}>{card.title}</span>
                  </div>
                </div>
                <div className="p-5">
                  <ul className="space-y-2">
                    {card.items.map(item => (
                      <li key={item} className="flex items-start gap-2 text-sm text-[oklch(0.4_0.04_220)]">
                        <div className="w-1.5 h-1.5 rounded-full bg-[oklch(0.28_0.08_240)] mt-2 flex-shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Section Destinations ──────────────────────────────────────────────────────
function SectionDestinations() {
  const [active, setActive] = useState(0);

  const destinations = [
    {
      id: "med",
      label: "Méditerranée",
      saison: "Été (Juin → Octobre)",
      emoji: "🌊",
      color: "oklch(0.28_0.08_240)",
      colorLight: "oklch(0.92_0.04_220)",
      img: "/photos/IMG_4414.jpeg",
      titre: "Corse & Sardaigne",
      depart: "La Ciotat / Ajaccio",
      description: "Naviguez entre les calanques turquoise de Corse et les criques sauvages de Sardaigne. Des mouillages secrets, des villages perchés, une nature préservée et des eaux cristallines — la Méditerranée dans toute sa splendeur.",
      points: [
        "Calanques des Calanques de Piana (Corse)",
        "Bonifacio & ses falaises blanches",
        "Archipel de La Maddalena (Sardaigne)",
        "Golfe de Porto & réserve naturelle",
        "Plages de Palombaggia",
      ],
    },
    {
      id: "traversee",
      label: "Traversée Atlantique",
      saison: "Octobre / Novembre",
      emoji: "⚓",
      color: "oklch(0.38_0.1_220)",
      colorLight: "oklch(0.92_0.04_220)",
      img: "/photos/IMG_4255.jpeg",
      titre: "La Grande Traversée",
      depart: "La Ciotat → Fort-de-France",
      description: "Une aventure unique : rejoindre les Antilles depuis la Méditerranée à la voile. Via le Cap Vert, vous vivrez 3 semaines d'océan, de navigation hauturière, de nuits étoilées et de rencontres inoubliables.",
      points: [
        "La Ciotat → Gibraltar → Cap Vert",
        "Cap Vert → Fort-de-France (traversée)",
        "Navigation hauturière jour & nuit",
        "Observation des cétacés & oiseaux de mer",
        "Arrivée aux Antilles à la voile",
      ],
    },
    {
      id: "antilles",
      label: "Caraïbes",
      saison: "Hiver (Novembre → Avril)",
      emoji: "🌴",
      color: "oklch(0.72_0.11_85)",
      colorLight: "oklch(0.95_0.04_85)",
      img: "/photos/IMG_4449.jpeg",
      titre: "Martinique & Grenadines",
      depart: "Fort-de-France / Pointe-à-Pitre",
      description: "Sous les alizés des Caraïbes, explorez les Grenadines depuis la Martinique. Des îles paradisiaques, des eaux turquoise, des récifs coralliens et une culture créole vibrante vous attendent pour une croisière inoubliable.",
      points: [
        "Les Saintes & Marie-Galante",
        "Tobago Cays (réserve marine)",
        "Bequia & Mustique",
        "Carriacou & Petite Martinique",
        "Saint-Vincent & Grenadines",
      ],
    },
  ];

  const dest = destinations[active];

  return (
    <section id="destinations" className="py-20 lg:py-28 bg-[oklch(0.97_0.02_220)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <Reveal>
          <div className="text-center mb-12">
            <h2 className="text-4xl lg:text-5xl font-extrabold text-[oklch(0.15_0.05_220)]" style={{ fontFamily: "Cormorant Garamond, Times New Roman, serif" }}>
              Destinations
            </h2>
          </div>
        </Reveal>

        {/* Tabs */}
        <Reveal delay={0.1}>
          <div className="flex flex-wrap justify-center gap-3 mb-10">
            {destinations.map((d, i) => (
              <button
                key={d.id}
                onClick={() => setActive(i)}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-full font-semibold text-sm transition-all duration-300 ${
                  active === i
                    ? "text-[oklch(0.15_0.05_220)] shadow-lg scale-105 border border-black/10"
                    : "bg-white text-[oklch(0.45_0.04_220)] hover:bg-[oklch(0.92_0.04_220)]"
                }`}
                style={active === i ? { backgroundColor: d.color } : {}}
              >
                <span>{d.emoji}</span>
                {d.label}
              </button>
            ))}
          </div>
        </Reveal>

        {/* Destination card */}
        <motion.div
          key={active}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="grid lg:grid-cols-2 gap-8 items-center"
        >
          {/* Image */}
          <div className="relative rounded-3xl overflow-hidden shadow-2xl">
            <img
              src={dest.img}
              alt={dest.titre}
              className="w-full h-72 lg:h-96 object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
            <div className="absolute bottom-5 left-5 text-white">
              <div className="text-xs font-bold tracking-widest uppercase opacity-80 mb-1">{dest.saison}</div>
              <div className="text-2xl font-extrabold" style={{ fontFamily: "Syne, sans-serif" }}>{dest.titre}</div>
            </div>
          </div>

          {/* Info */}
          <div>
            <div
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold mb-4"
              style={{ backgroundColor: dest.colorLight, color: dest.color }}
            >
              <MapPin className="w-4 h-4" />
              Départ : {dest.depart}
            </div>
            <h3 className="text-3xl font-extrabold text-[oklch(0.15_0.05_220)] mb-4" style={{ fontFamily: "Syne, sans-serif" }}>
              {dest.titre}
            </h3>
            <p className="text-[oklch(0.4_0.04_220)] leading-relaxed mb-6">{dest.description}</p>
            <ul className="space-y-2.5">
              {dest.points.map(p => (
                <li key={p} className="flex items-start gap-3 text-sm text-[oklch(0.35_0.04_220)]">
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                    style={{ backgroundColor: dest.colorLight }}
                  >
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: dest.color }} />
                  </div>
                  {p}
                </li>
              ))}
            </ul>
            <button
              onClick={() => document.querySelector("#calendrier")?.scrollIntoView({ behavior: "smooth" })}
              className="mt-6 flex items-center gap-2 text-sm font-bold transition-colors"
              style={{ color: dest.color }}
            >
              Voir les disponibilités <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

// ── Section Programme ─────────────────────────────────────────────────────────
function SectionProgramme() {
  const activites = [
    { icon: <Wind className="w-7 h-7" />, titre: "Navigation à la voile", desc: "Prenez la barre ou laissez-vous porter. Victor et son équipage s'adaptent à votre niveau et vos envies." },
    { icon: <Waves className="w-7 h-7" />, titre: "Paddle & Kayak", desc: "Explorez les criques et mouillages à votre rythme avec nos 2 SUP et notre kayak 2 places." },
    { icon: <Fish className="w-7 h-7" />, titre: "Snorkeling", desc: "Masques, palmes et tubas pour tous. Plongez dans des eaux cristallines et découvrez les fonds marins." },
    { icon: <Sun className="w-7 h-7" />, titre: "Bronzette & Apéro", desc: "Trampolines avant, bains de soleil, cocktails au coucher du soleil — la dolce vita en mer." },
    { icon: <Compass className="w-7 h-7" />, titre: "Découverte culturelle", desc: "Villages, marchés locaux, restaurants de port — chaque escale est une nouvelle aventure." },
    { icon: <Sunset className="w-7 h-7" />, titre: "Couchers de soleil", desc: "Les plus beaux couchers de soleil de Méditerranée et des Caraïbes, depuis le cockpit avec un verre à la main." },
  ];

  return (
    <section id="programme" className="py-20 lg:py-28 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <Reveal>
          <div className="text-center mb-16">
            <span className="inline-block text-[oklch(0.28_0.08_240)] text-sm font-bold tracking-widest uppercase mb-3">Au programme</span>
            <h2 className="text-4xl lg:text-5xl font-extrabold text-[oklch(0.15_0.05_220)]" style={{ fontFamily: "Syne, sans-serif" }}>
              Votre semaine à bord
            </h2>
            <p className="mt-4 text-[oklch(0.45_0.04_220)] max-w-xl mx-auto">
              Pas de programme imposé — on navigue au gré du vent et de vos envies. Voici ce qui vous attend.
            </p>
          </div>
        </Reveal>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {activites.map((a, i) => (
            <Reveal key={a.titre} delay={i * 0.08}>
              <div className="group p-6 rounded-3xl border-2 border-[oklch(0.92_0.04_220)] hover:border-[oklch(0.28_0.08_240)] hover:shadow-lg transition-all duration-300">
                <div className="w-12 h-12 rounded-2xl bg-[oklch(0.94_0.04_220)] flex items-center justify-center text-[oklch(0.28_0.08_240)] mb-4 group-hover:bg-[oklch(0.28_0.08_240)] group-hover:text-white transition-colors duration-300">
                  {a.icon}
                </div>
                <h3 className="text-lg font-bold text-[oklch(0.15_0.05_220)] mb-2" style={{ fontFamily: "Syne, sans-serif" }}>{a.titre}</h3>
                <p className="text-sm text-[oklch(0.5_0.04_220)] leading-relaxed">{a.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>

        {/* Formules */}
        <Reveal delay={0.2}>
          <div className="mt-16 grid md:grid-cols-3 gap-6">
            {[
              {
                titre: "Semaine Méditerranée",
                prix: "Sur devis",
                desc: "Cabine ou privatisation",
                color: "oklch(0.28_0.08_240)",
                items: ["Départ le samedi", "Corse / Sardaigne", "Équipage professionnel", "Tarifs modulables selon période"],
              },
              {
                titre: "Transatlantique",
                prix: "Sur devis",
                desc: "Jusqu'à 8 personnes",
                color: "oklch(0.2_0.06_240)",
                items: ["Traversées océan", "Cabine ou place", "Navigation hauturière", "Accompagnement équipage"],
                featured: true,
              },
              {
                titre: "Semaine Caraïbes",
                prix: "Sur devis",
                desc: "1 à 3 semaines",
                color: "oklch(0.38_0.1_220)",
                items: ["Départ samedi", "Grenadines", "Cabine ou privatisation", "Itinéraire sur mesure"],
              },
            ].map(f => (
              <div
                key={f.titre}
                className={`relative p-6 rounded-3xl ${f.featured ? "shadow-2xl scale-105" : "border-2 border-[oklch(0.92_0.04_220)]"}`}
                style={f.featured ? { backgroundColor: f.color } : {}}
              >
                {f.featured && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[oklch(0.84_0.05_80)] text-[oklch(0.15_0.05_240)] text-xs font-bold px-4 py-1 rounded-full">
                    ⭐ Le plus populaire
                  </div>
                )}
                <div className={`text-sm font-bold tracking-widest uppercase mb-2 ${f.featured ? "text-white/70" : ""}`}
                  style={!f.featured ? { color: f.color } : {}}>
                  {f.titre}
                </div>
                <div className={`text-2xl font-extrabold mb-1 ${f.featured ? "text-white" : "text-[oklch(0.15_0.05_220)]"}`}
                  style={{ fontFamily: "Syne, sans-serif" }}>
                  {f.prix}
                </div>
                <div className={`text-sm mb-4 ${f.featured ? "text-white/70" : "text-[oklch(0.55_0.04_220)]"}`}>{f.desc}</div>
                <ul className="space-y-2">
                  {f.items.map(item => (
                    <li key={item} className={`flex items-center gap-2 text-sm ${f.featured ? "text-white/90" : "text-[oklch(0.4_0.04_220)]"}`}>
                      <div className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 ${f.featured ? "bg-white/20" : "bg-[oklch(0.92_0.04_220)]"}`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${f.featured ? "bg-white" : ""}`}
                          style={!f.featured ? { backgroundColor: f.color } : {}} />
                      </div>
                      {item}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => document.querySelector("#contact")?.scrollIntoView({ behavior: "smooth" })}
                  className={`mt-5 w-full py-2.5 rounded-full text-sm font-bold transition-all ${
                    f.featured
                      ? "bg-white text-[oklch(0.2_0.06_240)] hover:bg-white/90"
                      : "border-2 hover:text-white"
                  }`}
                  style={!f.featured ? { borderColor: f.color, color: f.color } : {}}
                  onMouseEnter={e => { if (!f.featured) (e.currentTarget as HTMLButtonElement).style.backgroundColor = f.color; }}
                  onMouseLeave={e => { if (!f.featured) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent"; }}
                >
                  Nous contacter
                </button>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

// ── Section Équipage ──────────────────────────────────────────────────────────
function SectionEquipage() {
  return (
    <section id="equipage" className="py-20 lg:py-28 bg-[oklch(0.12_0.05_220)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <Reveal>
          <div className="text-center mb-16">
            <span className="inline-block text-[oklch(0.75_0.1_220)] text-sm font-bold tracking-widest uppercase mb-3">L'Équipage</span>
            <h2 className="text-4xl lg:text-5xl font-extrabold text-white" style={{ fontFamily: "Syne, sans-serif" }}>
              Victor & l'équipage
            </h2>
            <p className="mt-4 text-white/60 max-w-xl mx-auto">
              Deux passionnés de mer, forts de plus de 10 ans d'expérience en Méditerranée, Atlantique et Caraïbes.
            </p>
          </div>
        </Reveal>

        <div className="grid lg:grid-cols-2 gap-8 mb-12">
          {[
            {
              nom: "Victor",
              age: "34 ans",
              titre: "Capitaine 500 · Skipper hauturier",
              desc: "Victor est le capitaine de Sabine. Titulaire du brevet capitaine 500, il a navigué sur tous les océans et traversé l'Atlantique plusieurs fois. Passionné de météo et de navigation hauturière, il assure la sécurité et le confort de tous à bord avec calme et professionnalisme.",
              color: "oklch(0.72_0.11_85)",
              img: "/photos/IMG_4385.jpeg",
            },
          ].map((p, i) => (
            <Reveal key={p.nom} delay={i * 0.15}>
              <div className="bg-white/5 backdrop-blur-sm rounded-3xl overflow-hidden border border-white/10 hover:border-white/20 transition-all duration-300">
                <div className="relative h-52 overflow-hidden">
                  <img src={p.img} alt={p.nom} className="w-full h-full object-cover" loading="lazy" decoding="async" />
                  <div className="absolute inset-0 bg-gradient-to-t from-[oklch(0.12_0.05_220)] to-transparent" />
                </div>
                <div className="p-6">
                  <div className="flex items-center gap-3 mb-3">
                    <div>
                      <div className="text-2xl font-extrabold text-white" style={{ fontFamily: "Syne, sans-serif" }}>{p.nom}</div>
                      <div className="text-xs font-semibold" style={{ color: p.color }}>{p.age} · {p.titre}</div>
                    </div>
                  </div>
                  <p className="text-white/60 text-sm leading-relaxed">{p.desc}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>

        {/* Valeurs */}
        <Reveal delay={0.2}>
          <div className="grid sm:grid-cols-3 gap-4">
            {[
              { icon: <Star className="w-5 h-5" />, titre: "Expérience", desc: "10+ ans de navigation professionnelle en Méditerranée, Atlantique et Caraïbes" },
              { icon: <Anchor className="w-5 h-5" />, titre: "Sécurité", desc: "Brevets professionnels, équipements de sécurité homologués, navire sous pavillon français" },
              { icon: <Wind className="w-5 h-5" />, titre: "Passion", desc: "Une équipe familiale indépendante qui partage son amour de la mer avec authenticité" },
            ].map(v => (
              <div key={v.titre} className="bg-white/5 rounded-2xl p-5 border border-white/10">
                <div className="w-10 h-10 rounded-xl bg-[oklch(0.28_0.08_240)]/20 flex items-center justify-center text-[oklch(0.75_0.1_220)] mb-3">
                  {v.icon}
                </div>
                <div className="text-white font-bold mb-1" style={{ fontFamily: "Syne, sans-serif" }}>{v.titre}</div>
                <div className="text-white/50 text-sm">{v.desc}</div>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

// ── Section Calendrier ────────────────────────────────────────────────────────
function SectionCalendrier() {
  return (
    <section id="calendrier" className="editorial-section bg-[oklch(0.985_0.004_95)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <Reveal>
          <div className="text-center mb-14">
            <span className="editorial-kicker">Disponibilités & Tarifs</span>
            <h2 className="editorial-title editorial-title-centered mt-4" style={{ fontFamily: "Syne, sans-serif" }}>
              Calendrier 2025-2026
            </h2>
            <p className="editorial-lead max-w-2xl">
              Consultez les disponibilités et tarifs semaine par semaine. Cliquez sur une semaine pour voir les détails.
            </p>
          </div>
        </Reveal>

        <Reveal delay={0.1}>
          <div className="max-w-6xl mx-auto">
            <Suspense fallback={<div className="text-center text-sm text-[oklch(0.45_0.04_220)] py-10">Chargement du calendrier...</div>}>
              <CalendrierDisponibilites />
            </Suspense>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

// ── Section Galerie ───────────────────────────────────────────────────────────
function SectionGalerie() {
  const photos = [
    { src: "/photos/IMG_4405.jpeg", alt: "Sabine en navigation" },
    { src: "/photos/IMG_4406.jpeg", alt: "Mouillage et navigation" },
    { src: "/photos/IMG_4412.jpeg", alt: "Vie à bord" },
    { src: "/photos/IMG_4422.jpeg", alt: "Pont et extérieur" },
    { src: "/photos/IMG_4483.jpeg", alt: "Ambiance croisière" },
    { src: "/photos/IMG_4504.jpeg", alt: "Détails de navigation" },
  ];

  return (
    <section className="py-20 lg:py-28 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <Reveal>
          <div className="text-center mb-12">
            <span className="inline-block text-[oklch(0.28_0.08_240)] text-sm font-bold tracking-widest uppercase mb-3">Galerie</span>
            <h2 className="text-4xl lg:text-5xl font-extrabold text-[oklch(0.15_0.05_220)]" style={{ fontFamily: "Syne, sans-serif" }}>
              À bord de Sabine
            </h2>
          </div>
        </Reveal>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 lg:gap-4">
          {photos.map((p, i) => (
            <Reveal key={p.alt} delay={i * 0.07}>
              <div className={`relative overflow-hidden rounded-2xl ${i === 0 ? "md:col-span-2 md:row-span-2" : ""}`}>
                <img
                  src={p.src}
                  alt={p.alt}
                  className={`w-full object-cover hover:scale-105 transition-transform duration-500 ${i === 0 ? "h-64 md:h-80" : "h-40 md:h-44"}`}
                  loading="lazy"
                  decoding="async"
                />
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Section Contact ───────────────────────────────────────────────────────────
function SectionContact() {
  const [form, setForm] = useState({ nom: "", email: "", tel: "", message: "", formule: "semaine" });
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);
    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Impossible d'envoyer le message.");
      }
      setSent(true);
      setForm({ nom: "", email: "", tel: "", message: "", formule: "semaine" });
    } catch (error: any) {
      setSubmitError(error?.message || "Erreur lors de l'envoi du message.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section id="contact" className="editorial-section bg-[oklch(0.93_0.01_230)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-start">
          {/* Info */}
          <Reveal>
            <div>
              <span className="editorial-kicker">Contact</span>
              <h2 className="editorial-title mt-4 mb-6" style={{ fontFamily: "Syne, sans-serif" }}>
                Organisons votre voyage
              </h2>
              <p className="text-[oklch(0.4_0.03_240)] text-lg leading-relaxed mb-10">
                Vous avez un projet de croisière ? Une question sur les disponibilités ou les tarifs ? 
                Victor et son équipage vous répondent personnellement dans les 24h.
              </p>
              <div className="mb-6 rounded-xl border border-[oklch(0.88_0.02_220)] bg-white px-4 py-3 text-sm text-[oklch(0.35_0.03_240)]">
                Pour toute demande, merci d'utiliser le formulaire ci-contre.
              </div>

              <div className="space-y-4 mb-10">
                {[
                  { icon: <Phone className="w-5 h-5" />, label: "Téléphone", val: "+33 6 52 00 43 42" },
                  { icon: <Mail className="w-5 h-5" />, label: "Email", val: "contact@sabine-sailing.com" },
                  { icon: <MapPin className="w-5 h-5" />, label: "Base principale", val: "La Ciotat, Parc National des Calanques" },
                ].map(c => (
                  <div key={c.label} className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-[oklch(0.2_0.06_240)]/10 flex items-center justify-center text-[oklch(0.2_0.06_240)] flex-shrink-0">
                      {c.icon}
                    </div>
                    <div>
                      <div className="text-[oklch(0.48_0.03_240)] text-xs uppercase tracking-[0.08em]">{c.label}</div>
                      <div className="text-[oklch(0.2_0.06_240)] font-medium">{c.val}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex gap-3">
                {[
                  { icon: <Instagram className="w-5 h-5" />, href: "https://www.instagram.com/sabine.sailing/", label: "Instagram" },
                  { icon: <Facebook className="w-5 h-5" />, href: "https://www.facebook.com/sabinesailing/", label: "Facebook" },
                ].map(s => (
                  <a
                    key={s.label}
                    href={s.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white text-[oklch(0.28_0.06_240)] hover:bg-[oklch(0.97_0.004_95)] border border-[oklch(0.9_0.02_220)] transition-all text-sm font-medium"
                  >
                    {s.icon} {s.label}
                  </a>
                ))}
              </div>

              {/* Photo CTA */}
              <div className="mt-8 relative rounded-2xl overflow-hidden">
                <img
                  src="/photos/IMG_4515.jpeg"
                  alt="Coucher de soleil en mer"
                  className="w-full h-40 object-cover"
                  loading="lazy"
                  decoding="async"
                />
                <div className="absolute inset-0 bg-gradient-to-r from-[oklch(0.2_0.06_240)]/70 to-transparent flex items-center px-6">
                  <div>
                    <div className="text-white font-extrabold text-xl" style={{ fontFamily: "Syne, sans-serif" }}>Embarquez pour</div>
                    <div className="text-[oklch(0.9_0.02_95)] font-extrabold text-xl" style={{ fontFamily: "Syne, sans-serif" }}>l'aventure !</div>
                  </div>
                </div>
              </div>
            </div>
          </Reveal>

          {/* Formulaire */}
          <Reveal delay={0.15}>
            <div className="editorial-panel p-6 lg:p-8">
              {sent ? (
                <div className="text-center py-8">
                  <div className="w-16 h-16 rounded-full bg-[oklch(0.2_0.06_240)]/10 flex items-center justify-center mx-auto mb-4">
                    <Anchor className="w-8 h-8 text-[oklch(0.2_0.06_240)]" />
                  </div>
                  <h3 className="text-xl font-bold text-[oklch(0.2_0.06_240)] mb-2" style={{ fontFamily: "Syne, sans-serif" }}>Message envoyé !</h3>
                  <p className="text-[oklch(0.45_0.03_240)] text-sm">Victor et son équipage vous répondront dans les 24h. Bon vent !</p>
                  <button onClick={() => setSent(false)} className="mt-4 text-[oklch(0.2_0.06_240)] text-sm hover:underline">
                    Envoyer un autre message
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <h3 className="text-xl font-bold text-[oklch(0.2_0.06_240)] mb-2" style={{ fontFamily: "Syne, sans-serif" }}>Demande de réservation</h3>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[oklch(0.5_0.03_240)] text-xs mb-1 block">Nom *</label>
                      <input
                        required
                        value={form.nom}
                        onChange={e => setForm(f => ({ ...f, nom: e.target.value }))}
                        className="w-full bg-[oklch(0.99_0.004_95)] border border-[oklch(0.88_0.02_220)] rounded-xl px-4 py-2.5 text-[oklch(0.2_0.06_240)] placeholder-[oklch(0.65_0.02_240)] text-sm focus:outline-none focus:border-[oklch(0.2_0.06_240)]"
                        placeholder="Votre nom"
                      />
                    </div>
                    <div>
                      <label className="text-[oklch(0.5_0.03_240)] text-xs mb-1 block">Téléphone</label>
                      <input
                        value={form.tel}
                        onChange={e => setForm(f => ({ ...f, tel: e.target.value }))}
                        className="w-full bg-[oklch(0.99_0.004_95)] border border-[oklch(0.88_0.02_220)] rounded-xl px-4 py-2.5 text-[oklch(0.2_0.06_240)] placeholder-[oklch(0.65_0.02_240)] text-sm focus:outline-none focus:border-[oklch(0.2_0.06_240)]"
                        placeholder="+33 6 ..."
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[oklch(0.5_0.03_240)] text-xs mb-1 block">Email *</label>
                    <input
                      required
                      type="email"
                      value={form.email}
                      onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                      className="w-full bg-[oklch(0.99_0.004_95)] border border-[oklch(0.88_0.02_220)] rounded-xl px-4 py-2.5 text-[oklch(0.2_0.06_240)] placeholder-[oklch(0.65_0.02_240)] text-sm focus:outline-none focus:border-[oklch(0.2_0.06_240)]"
                      placeholder="votre@email.com"
                    />
                  </div>

                  <div>
                    <label className="text-[oklch(0.5_0.03_240)] text-xs mb-1 block">Formule souhaitée</label>
                    <select
                      value={form.formule}
                      onChange={e => setForm(f => ({ ...f, formule: e.target.value }))}
                      className="w-full bg-[oklch(0.99_0.004_95)] border border-[oklch(0.88_0.02_220)] rounded-xl px-4 py-2.5 text-[oklch(0.2_0.06_240)] text-sm focus:outline-none focus:border-[oklch(0.2_0.06_240)]"
                    >
                      <option value="croisiere_mediterranee">Semaine Méditerranée</option>
                      <option value="transatlantique">Transatlantique</option>
                      <option value="croisiere_caraibes">Semaine Caraïbes</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[oklch(0.5_0.03_240)] text-xs mb-1 block">Votre message *</label>
                    <textarea
                      required
                      rows={4}
                      value={form.message}
                      onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                      className="w-full bg-[oklch(0.99_0.004_95)] border border-[oklch(0.88_0.02_220)] rounded-xl px-4 py-2.5 text-[oklch(0.2_0.06_240)] placeholder-[oklch(0.65_0.02_240)] text-sm focus:outline-none focus:border-[oklch(0.2_0.06_240)] resize-none"
                      placeholder="Dates souhaitées, nombre de personnes, questions..."
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-3.5 rounded-xl bg-[oklch(0.2_0.06_240)] text-white font-bold text-sm hover:bg-[oklch(0.16_0.05_240)] transition-all hover:scale-[1.01] shadow-lg"
                  >
                    {submitting ? "Envoi en cours..." : "Envoyer ma demande →"}
                  </button>

                  {submitError && (
                    <p className="text-red-600 text-xs text-center">{submitError}</p>
                  )}

                  <p className="text-[oklch(0.5_0.03_240)] text-xs text-center">
                    Réponse garantie sous 24h · Aucun engagement
                  </p>
                </form>
              )}
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

// ── Footer ──────────────────────────────────────────────────────────────────────
function Footer() {
  return (
    <footer className="bg-[oklch(0.98_0.004_95)] border-t border-[oklch(0.9_0.02_220)] py-14">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid md:grid-cols-3 gap-8 items-center">
          <div className="flex items-center gap-3 md:justify-start justify-center">
            <img src="/logo-sabine.png" alt="Sabine Sailing" className="h-14 w-auto rounded-full" />
          </div>
          <div className="text-[oklch(0.48_0.03_240)] text-xs text-center leading-relaxed">
            © 2026 Sabine Sailing · La Ciotat · Pavillon Français<br />
            contact@sabine-sailing.com · +33 6 52 00 43 42
          </div>
          <div className="flex gap-3 md:justify-end justify-center">
            <a href="https://www.instagram.com/sabinesailing/" target="_blank" rel="noopener noreferrer"
              className="w-9 h-9 rounded-full bg-white border border-[oklch(0.9_0.02_220)] flex items-center justify-center text-[oklch(0.45_0.03_240)] hover:text-[oklch(0.2_0.06_240)] hover:bg-[oklch(0.99_0.004_95)] transition-all">
              <Instagram className="w-4 h-4" />
            </a>
            <a href="https://www.facebook.com/profile.php?id=61585814663028" target="_blank" rel="noopener noreferrer"
              className="w-9 h-9 rounded-full bg-white border border-[oklch(0.9_0.02_220)] flex items-center justify-center text-[oklch(0.45_0.03_240)] hover:text-[oklch(0.2_0.06_240)] hover:bg-[oklch(0.99_0.004_95)] transition-all">
              <Facebook className="w-4 h-4" />
            </a>
          </div>
        </div>
        <div className="mt-10 pt-7 border-t border-[oklch(0.9_0.02_220)]">
          <div className="text-center mb-3 text-[oklch(0.4_0.03_240)] text-xs uppercase tracking-[0.14em]">
            Position du bateau en direct (AIS)
          </div>
          <div className="rounded-2xl overflow-hidden border border-[oklch(0.9_0.02_220)] bg-white">
            <iframe
              src="/marinetraffic-embed.html"
              title="MarineTraffic AIS"
              className="w-full h-[450px] border-0"
              loading="lazy"
            />
          </div>
          <div className="mt-2 text-center">
            <a
              href="https://www.marinetraffic.com/en/ais/details/ships/mmsi:228090960"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[oklch(0.45_0.03_240)] hover:text-[oklch(0.2_0.06_240)] text-xs underline"
            >
              Ouvrir MarineTraffic (MMSI 228090960)
            </a>
          </div>
        </div>
        {/* Bouton Admin discret */}
        <div className="mt-8 flex justify-center">
          <div className="flex items-center gap-6">
            <a
              href={withBasePath("/espace-client")}
              className="text-[oklch(0.55_0.03_240)] hover:text-[oklch(0.2_0.06_240)] text-[10px] uppercase tracking-[0.2em] transition-colors"
            >
              Espace client
            </a>
            <a
              href={withBasePath("/admin/login")}
              className="text-[oklch(0.55_0.03_240)] hover:text-[oklch(0.2_0.06_240)] text-[10px] uppercase tracking-[0.2em] transition-colors"
            >
              Espace administrateur
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}

// ── Page principale ───────────────────────────────────────────────────────────
export default function Home() {
  useEffect(() => {
    const schema = {
      "@context": "https://schema.org",
      "@type": "LocalBusiness",
      name: "Sabine Sailing",
      url: "https://sabine-sailing.com/home/",
      telephone: "+33652004342",
      email: "contact@sabine-sailing.com",
      address: {
        "@type": "PostalAddress",
        addressLocality: "La Ciotat",
        addressCountry: "FR",
      },
      areaServed: ["Mediterranee", "Caraibes", "Atlantique"],
      makesOffer: {
        "@type": "OfferCatalog",
        name: "Croisieres catamaran",
      },
    };
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.text = JSON.stringify(schema);
    document.head.appendChild(script);
    return () => {
      document.head.removeChild(script);
    };
  }, []);

  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      <Hero />
      <SectionCatamaran />
      <SectionDestinations />
      <SectionProgramme />
      <SectionEquipage />
      <SectionCalendrier />
      <SectionGalerie />
      <Suspense fallback={<div className="py-10 text-center text-sm text-[oklch(0.45_0.04_220)]">Chargement des avis...</div>}>
        <AvisGoogle />
      </Suspense>
      <SectionContact />
      <Footer />
    </div>
  );
}
