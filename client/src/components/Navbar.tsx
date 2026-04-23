/*
 * DESIGN: Expressionnisme Tropical
 * Navbar transparente qui se solidifie au scroll
 * Couleurs: fond transparent → blanc/teal au scroll
 */

import { useState, useEffect } from "react";
import { Menu, X, Anchor } from "lucide-react";
import { withBasePath } from "@/lib/basePath";

const navLinks = [
  { label: "Accueil", href: "#accueil" },
  { label: "Destinations", href: "#destinations" },
  { label: "Nos Croisières", href: "#croisieres" },
  { label: "Le Catamaran", href: "#catamaran" },
  { label: "Témoignages", href: "#temoignages" },
  { label: "Contact", href: "#contact" },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 60);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleNavClick = (href: string) => {
    setMenuOpen(false);
    const el = document.querySelector(href);
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        scrolled
          ? "bg-white/95 backdrop-blur-md shadow-lg"
          : "bg-transparent"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 lg:h-20">
          {/* Logo */}
          <button
            onClick={() => handleNavClick("#accueil")}
            className="flex items-center gap-2 group"
          >
            <div
              className={`p-2 rounded-full transition-all duration-300 ${
                scrolled
                  ? "bg-[oklch(0.52_0.12_196)] text-white"
                  : "bg-white/20 text-white"
              }`}
            >
              <Anchor className="w-5 h-5" />
            </div>
            <div className="flex flex-col leading-none">
              <span
                className={`font-bold text-lg tracking-tight transition-colors duration-300 ${
                  scrolled ? "text-[oklch(0.22_0.07_230)]" : "text-white"
                }`}
                style={{ fontFamily: "Syne, sans-serif" }}
              >
                CataCroisières
              </span>
              <span
                className={`text-xs font-light tracking-widest uppercase transition-colors duration-300 ${
                  scrolled ? "text-[oklch(0.52_0.12_196)]" : "text-white/80"
                }`}
              >
                Méd. & Antilles
              </span>
            </div>
          </button>

          {/* Desktop nav */}
          <div className="hidden lg:flex items-center gap-1">
            {navLinks.map((link) => (
              <button
                key={link.href}
                onClick={() => handleNavClick(link.href)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 hover:bg-white/20 ${
                  scrolled
                    ? "text-[oklch(0.22_0.07_230)] hover:text-[oklch(0.52_0.12_196)] hover:bg-[oklch(0.94_0.04_196)]"
                    : "text-white hover:bg-white/20"
                }`}
              >
                {link.label}
              </button>
            ))}
            <a
              href={withBasePath("/admin/login")}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors duration-300 ${
                scrolled
                  ? "text-slate-500 hover:text-slate-700"
                  : "text-white/70 hover:text-white"
              }`}
            >
              Admin
            </a>
            <button
              onClick={() => handleNavClick("#contact")}
              className="ml-4 px-6 py-2.5 rounded-full text-sm font-semibold bg-[oklch(0.72_0.14_42)] text-white hover:bg-[oklch(0.65_0.16_42)] transition-all duration-300 shadow-lg hover:shadow-xl hover:-translate-y-0.5"
            >
              Réserver
            </button>
          </div>

          {/* Mobile menu button */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className={`lg:hidden p-2 rounded-lg transition-colors duration-300 ${
              scrolled ? "text-[oklch(0.22_0.07_230)]" : "text-white"
            }`}
          >
            {menuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      <div
        className={`lg:hidden transition-all duration-300 overflow-hidden ${
          menuOpen ? "max-h-screen opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="bg-white/98 backdrop-blur-md px-4 pb-6 pt-2 shadow-xl">
          {navLinks.map((link) => (
            <button
              key={link.href}
              onClick={() => handleNavClick(link.href)}
              className="block w-full text-left px-4 py-3 text-[oklch(0.22_0.07_230)] font-medium hover:text-[oklch(0.52_0.12_196)] hover:bg-[oklch(0.94_0.04_196)] rounded-lg transition-colors duration-200"
            >
              {link.label}
            </button>
          ))}
          <a href={withBasePath("/admin/login")} className="block w-full text-left px-4 py-3 text-[oklch(0.22_0.07_230)] font-medium hover:text-[oklch(0.52_0.12_196)] hover:bg-[oklch(0.94_0.04_196)] rounded-lg transition-colors duration-200 text-xs">
            Admin
          </a>
          <button
            onClick={() => handleNavClick("#contact")}
            className="mt-3 w-full px-6 py-3 rounded-full text-sm font-semibold bg-[oklch(0.72_0.14_42)] text-white hover:bg-[oklch(0.65_0.16_42)] transition-all duration-300"
          >
            Réserver maintenant
          </button>
        </div>
      </div>
    </nav>
  );
}
