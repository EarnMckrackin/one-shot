"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { C } from "../lib/theme";

const LINKS = [
  { href: "/library",   label: "Library"       },
  { href: "/scan",      label: "Scan"          },
  { href: "/releases",  label: "Releases"      },
  { href: "/pull-list", label: "Pull List"     },
  { href: "/schedule",  label: "Schedule"      },
  { href: "/gaps",      label: "Gap Tracker"   },
  { href: "/arcs",      label: "Reading Order" },
  { href: "/stats",     label: "Stats"         },
  { href: "/compass",   label: "Compass"       },
];

export default function Nav() {
  const pathname = usePathname();

  return (
    <>
      {/* Desktop sidebar */}
      <nav style={s.sidebar} className="desktop-nav">
        {/* Brand plate */}
        <Link href="/library" style={s.brandWrap}>
          <div style={s.brandLockup}>
            <span style={s.brandOne}>ONE</span>
            <span style={s.brandShot}>SHOT</span>
          </div>
          <span style={s.brandSub}>ISSUE Nº 1 · COLLECTOR</span>
        </Link>

        {/* Nav links */}
        <div style={s.links}>
          {LINKS.map(({ href, label }) => {
            const active = pathname === href || pathname.startsWith(href + "/");
            return (
              <Link key={href} href={href} style={{ ...s.link, ...(active ? s.linkActive : {}) }}>
                {active && <span style={s.rail} />}
                {label}
              </Link>
            );
          })}
        </div>

        {/* Footer plate */}
        <div style={s.footer}>
          <Link href="/settings" style={s.footerSettings}>SETTINGS</Link>
          <span style={s.footerVersion}>v1.0</span>
        </div>
      </nav>

      {/* Mobile bottom bar */}
      <nav style={s.bottomBar} className="mobile-nav">
        {LINKS.map(({ href, label }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link key={href} href={href} style={{ ...s.bottomLink, ...(active ? s.bottomLinkActive : {}) }}>
              {label}
            </Link>
          );
        })}
      </nav>

      <style>{`
        .desktop-nav { display: none !important; }
        .mobile-nav  { display: flex !important; }
        @media (min-width: 768px) {
          .mobile-nav  { display: none !important; }
          .desktop-nav { display: flex !important; }
          .main-content { margin-left: 232px !important; }
        }
        @media (max-width: 767px) {
          .main-content { padding-bottom: 64px !important; }
        }
      `}</style>
    </>
  );
}

const s = {
  sidebar: {
    position:      "fixed",
    top:           0, left: 0,
    height:        "100vh",
    width:         232,
    background:    "var(--bg-surface)",
    backgroundImage: "var(--halftone-dots)",
    backgroundSize:  "var(--halftone-size)",
    borderRight:   "3px solid var(--ink-000)",
    flexDirection: "column",
    zIndex:        100,
  },

  brandWrap: {
    display:       "block",
    padding:       "6px 10px 12px",
    margin:        "0 4px 18px",
    borderBottom:  "2px solid var(--ink-000)",
  },
  brandLockup: {
    fontFamily:    "var(--font-display)",
    fontSize:      30,
    lineHeight:    1,
    letterSpacing: "-0.01em",
    textTransform: "uppercase",
  },
  brandOne:  { color: "var(--text)" },
  brandShot: { color: "var(--accent)", marginLeft: 6 },
  brandSub: {
    display:       "block",
    fontFamily:    "var(--font-burst)",
    fontSize:      9,
    letterSpacing: "0.18em",
    color:         "var(--hero-gold)",
    marginTop:     4,
    textTransform: "uppercase",
  },

  links: {
    display:       "flex",
    flexDirection: "column",
    gap:           1,
    flex:          1,
    overflowY:     "auto",
  },
  link: {
    position:      "relative",
    display:       "block",
    padding:       "8px 10px 6px 14px",
    fontFamily:    "var(--font-display)",
    fontSize:      15,
    letterSpacing: "0.01em",
    textTransform: "uppercase",
    color:         "var(--text-faint)",
    whiteSpace:    "nowrap",
    transition:    "color 120ms, background 120ms",
  },
  linkActive: {
    background:    "var(--ink-300)",
    color:         "var(--text)",
    paddingLeft:   16,
  },
  rail: {
    position:      "absolute",
    left:          0, top: 4, bottom: 4,
    width:         3,
    background:    "var(--accent)",
    borderRadius:  "0 2px 2px 0",
  },

  footer: {
    display:        "flex",
    justifyContent: "space-between",
    alignItems:     "center",
    padding:        "10px 12px",
    borderTop:      "1.5px solid var(--ink-000)",
  },
  footerSettings: {
    fontFamily:    "var(--font-burst)",
    fontSize:      12,
    letterSpacing: "0.12em",
    color:         "var(--text-soft)",
    textTransform: "uppercase",
  },
  footerVersion: {
    fontFamily: "var(--font-mono)",
    fontSize:   10,
    color:      "var(--text-faint)",
  },

  bottomBar: {
    position:   "fixed",
    bottom:     0, left: 0, right: 0,
    height:     58,
    background: "var(--bg-surface)",
    borderTop:  "1px solid var(--border)",
    zIndex:     100,
  },
  bottomLink: {
    flex:           1,
    display:        "flex",
    alignItems:     "center",
    justifyContent: "center",
    color:          C.textFaint,
    fontSize:       10,
    fontWeight:     500,
    padding:        "8px 2px",
    whiteSpace:     "nowrap",
    overflow:       "hidden",
    textOverflow:   "ellipsis",
  },
  bottomLinkActive: {
    color:      C.accent,
    fontWeight: 700,
  },
};
