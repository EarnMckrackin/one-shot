"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { C } from "../lib/theme";

const LINKS = [
  { href: "/library",   label: "Library"   },
  { href: "/scan",      label: "Scan"      },
  { href: "/releases",  label: "Releases"  },
  { href: "/pull-list", label: "Pull List" },
  { href: "/schedule",  label: "Schedule"  },
  { href: "/gaps",      label: "Gap Tracker" },
  { href: "/arcs",      label: "Reading Order" },
  { href: "/stats",     label: "Stats"     },
  { href: "/compass",   label: "Compass"   },
];

export default function Nav() {
  const pathname = usePathname();

  return (
    <>
      {/* Desktop sidebar */}
      <nav style={s.sidebar}>
        <Link href="/library" style={s.brand}>
          One<span style={{ color: C.accent }}>Shot</span>
        </Link>
        <div style={s.links}>
          {LINKS.map(({ href, label }) => {
            const active = pathname === href || pathname.startsWith(href + "/");
            return (
              <Link key={href} href={href} style={{ ...s.link, ...(active ? s.linkActive : {}) }}>
                {label}
              </Link>
            );
          })}
        </div>
        <Link href="/settings" style={s.settings}>Settings</Link>
      </nav>

      {/* Mobile bottom bar */}
      <nav style={s.bottomBar}>
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
        @media (min-width: 768px) {
          .mobile-nav { display: none !important; }
          .desktop-nav { display: flex !important; }
          .main-content { margin-left: 220px !important; }
        }
        @media (max-width: 767px) {
          .desktop-nav { display: none !important; }
          .main-content { padding-bottom: 64px !important; }
        }
      `}</style>
    </>
  );
}

const s = {
  sidebar: {
    display:         "none",
    position:        "fixed",
    top:             0,
    left:            0,
    height:          "100vh",
    width:           220,
    background:      C.surface,
    borderRight:     `1px solid ${C.border}`,
    flexDirection:   "column",
    padding:         "28px 16px",
    zIndex:          100,
    className:       "desktop-nav",
  },
  brand: {
    fontSize:    28,
    fontFamily:  "Georgia, serif",
    fontWeight:  700,
    letterSpacing: -0.5,
    display:     "block",
    marginBottom: 32,
    color:       C.text,
  },
  links: {
    display:       "flex",
    flexDirection: "column",
    gap:           4,
    flex:          1,
  },
  link: {
    display:      "block",
    padding:      "10px 14px",
    borderRadius: 10,
    color:        C.textSoft,
    fontWeight:   500,
    fontSize:     15,
    transition:   "background 0.15s",
  },
  linkActive: {
    background: C.card,
    color:      C.text,
    fontWeight: 600,
  },
  settings: {
    display:  "block",
    padding:  "10px 14px",
    color:    C.textFaint,
    fontSize: 14,
  },
  bottomBar: {
    display:         "flex",
    position:        "fixed",
    bottom:          0,
    left:            0,
    right:           0,
    height:          58,
    background:      C.surface,
    borderTop:       `1px solid ${C.border}`,
    zIndex:          100,
    className:       "mobile-nav",
  },
  bottomLink: {
    flex:           1,
    display:        "flex",
    alignItems:     "center",
    justifyContent: "center",
    color:          C.textFaint,
    fontSize:       11,
    fontWeight:     500,
    padding:        "8px 4px",
  },
  bottomLinkActive: {
    color:      C.accent,
    fontWeight: 700,
  },
};
