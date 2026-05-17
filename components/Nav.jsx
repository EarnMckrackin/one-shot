"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";

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

function HamburgerIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <line x1="2" y1="4"  x2="16" y2="4"  stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <line x1="2" y1="9"  x2="16" y2="9"  stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <line x1="2" y1="14" x2="16" y2="14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <line x1="2" y1="2" x2="14" y2="14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <line x1="14" y1="2" x2="2" y2="14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}

function CollapseIcon({ collapsed }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <polyline
        points={collapsed ? "5,2 10,7 5,12" : "9,2 4,7 9,12"}
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  );
}

function SidebarContent({ pathname, onClose }) {
  return (
    <>
      <Link href="/library" style={s.brandWrap} onClick={onClose}>
        <div style={s.brandLockup}>
          <span style={s.brandOne}>ONE</span>
          <span style={s.brandShot}>SHOT</span>
        </div>
        <span style={s.brandSub}>ISSUE Nº 1 · COLLECTOR</span>
      </Link>

      <div style={s.links}>
        {LINKS.map(({ href, label }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              style={{ ...s.link, ...(active ? s.linkActive : {}) }}
              onClick={onClose}
            >
              {active && <span style={s.rail} />}
              {label}
            </Link>
          );
        })}
      </div>

      <div style={s.footer}>
        <Link href="/settings" style={s.footerSettings} onClick={onClose}>SETTINGS</Link>
        <span style={s.footerVersion}>v1.0</span>
      </div>
    </>
  );
}

export default function Nav() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed]   = useState(false);

  // Close mobile drawer on navigation
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  const sidebarWidth = collapsed ? 52 : 232;

  return (
    <>
      {/* ── Desktop sidebar ── */}
      <nav style={{ ...s.sidebar, width: sidebarWidth }} className="desktop-nav">
        {/* Collapse toggle */}
        <button
          style={s.collapseBtn}
          onClick={() => setCollapsed(c => !c)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand" : "Collapse"}
        >
          <CollapseIcon collapsed={collapsed} />
        </button>

        {/* Brand — hidden when collapsed */}
        {!collapsed && (
          <Link href="/library" style={s.brandWrap}>
            <div style={s.brandLockup}>
              <span style={s.brandOne}>ONE</span>
              <span style={s.brandShot}>SHOT</span>
            </div>
            <span style={s.brandSub}>ISSUE Nº 1 · COLLECTOR</span>
          </Link>
        )}

        {/* Nav links */}
        <div style={s.links}>
          {LINKS.map(({ href, label }) => {
            const active = pathname === href || pathname.startsWith(href + "/");
            if (collapsed) {
              return (
                <Link
                  key={href}
                  href={href}
                  style={{ ...s.link, ...s.linkCollapsed, ...(active ? s.linkActive : {}) }}
                  title={label}
                >
                  {active && <span style={s.rail} />}
                  <span style={s.linkDot} />
                </Link>
              );
            }
            return (
              <Link
                key={href}
                href={href}
                style={{ ...s.link, ...(active ? s.linkActive : {}) }}
              >
                {active && <span style={s.rail} />}
                {label}
              </Link>
            );
          })}
        </div>

        {/* Footer */}
        {!collapsed && (
          <div style={s.footer}>
            <Link href="/settings" style={s.footerSettings}>SETTINGS</Link>
            <span style={s.footerVersion}>v1.0</span>
          </div>
        )}
      </nav>

      {/* ── Mobile top bar ── */}
      <div style={s.topBar} className="mobile-topbar">
        <button style={s.hamburger} onClick={() => setMobileOpen(o => !o)} aria-label="Toggle menu">
          {mobileOpen ? <CloseIcon /> : <HamburgerIcon />}
        </button>
        <div style={s.topBrandLockup}>
          <span style={s.brandOne}>ONE</span>
          <span style={s.brandShot}>SHOT</span>
        </div>
      </div>

      {/* Mobile backdrop */}
      {mobileOpen && (
        <div style={s.backdrop} onClick={() => setMobileOpen(false)} />
      )}

      {/* Mobile drawer */}
      <nav
        style={{ ...s.drawer, transform: mobileOpen ? "translateX(0)" : "translateX(-100%)" }}
        className="mobile-drawer"
      >
        <SidebarContent pathname={pathname} onClose={() => setMobileOpen(false)} />
      </nav>

      <style>{`
        .desktop-nav   { display: none !important; }
        .mobile-topbar { display: flex !important; }
        .mobile-drawer { display: flex !important; }
        @media (min-width: 768px) {
          .mobile-topbar { display: none !important; }
          .mobile-drawer { display: none !important; }
          .desktop-nav   { display: flex !important; }
          .main-content  { margin-left: ${sidebarWidth}px !important; transition: margin-left 250ms ease; }
        }
        @media (max-width: 767px) {
          .main-content { padding-top: calc(60px + env(safe-area-inset-top, 0px)) !important; }
        }
      `}</style>
    </>
  );
}

const s = {
  sidebar: {
    position:        "fixed",
    top:             0, left: 0,
    height:          "100vh",
    background:      "var(--bg-surface)",
    backgroundImage: "var(--halftone-dots)",
    backgroundSize:  "var(--halftone-size)",
    borderRight:     "3px solid var(--ink-000)",
    flexDirection:   "column",
    zIndex:          100,
    transition:      "width 250ms ease",
    overflowX:       "hidden",
  },

  collapseBtn: {
    alignSelf:      "flex-end",
    margin:         "8px 8px 4px",
    width:          28, height: 28,
    display:        "flex",
    alignItems:     "center",
    justifyContent: "center",
    background:     "none",
    border:         "1px solid var(--border)",
    borderRadius:   4,
    color:          "var(--text-faint)",
    cursor:         "pointer",
    flexShrink:     0,
  },

  brandWrap: {
    display:      "block",
    padding:      "6px 10px 12px",
    margin:       "0 4px 18px",
    borderBottom: "2px solid var(--ink-000)",
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
    overflowX:     "hidden",
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
  linkCollapsed: {
    display:        "flex",
    alignItems:     "center",
    justifyContent: "center",
    padding:        "10px 0",
  },
  linkDot: {
    width:        6, height: 6,
    borderRadius: "50%",
    background:   "var(--text-faint)",
    display:      "block",
  },
  linkActive: {
    background:  "var(--ink-300)",
    color:       "var(--text)",
    paddingLeft: 16,
  },
  rail: {
    position:     "absolute",
    left:         0, top: 4, bottom: 4,
    width:        3,
    background:   "var(--accent)",
    borderRadius: "0 2px 2px 0",
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

  // Mobile top bar
  topBar: {
    position:        "fixed",
    top:             0, left: 0, right: 0,
    minHeight:       "calc(52px + env(safe-area-inset-top, 0px))",
    background:      "var(--bg-surface)",
    backgroundImage: "var(--halftone-dots)",
    backgroundSize:  "var(--halftone-size)",
    borderBottom:    "3px solid var(--ink-000)",
    alignItems:      "center",
    padding:         "env(safe-area-inset-top, 0px) max(16px, env(safe-area-inset-right, 0px)) 0 max(16px, env(safe-area-inset-left, 0px))",
    gap:             12,
    zIndex:          200,
  },
  hamburger: {
    width:          36, height: 36,
    display:        "flex",
    alignItems:     "center",
    justifyContent: "center",
    background:     "none",
    border:         "none",
    color:          "var(--text)",
    cursor:         "pointer",
    borderRadius:   4,
    padding:        0,
    flexShrink:     0,
  },
  topBrandLockup: {
    fontFamily:    "var(--font-display)",
    fontSize:      22,
    lineHeight:    1,
    letterSpacing: "-0.01em",
    textTransform: "uppercase",
  },

  // Mobile slide-in drawer
  drawer: {
    position:        "fixed",
    top:             0, left: 0,
    height:          "100vh",
    width:           232,
    background:      "var(--bg-surface)",
    backgroundImage: "var(--halftone-dots)",
    backgroundSize:  "var(--halftone-size)",
    borderRight:     "3px solid var(--ink-000)",
    flexDirection:   "column",
    zIndex:          300,
    transition:      "transform 250ms cubic-bezier(0.4, 0, 0.2, 1)",
    overflowY:       "auto",
    paddingTop:      "env(safe-area-inset-top, 0px)",
    paddingBottom:   "env(safe-area-inset-bottom, 0px)",
  },

  backdrop: {
    position:   "fixed",
    inset:      0,
    background: "rgba(0,0,0,0.45)",
    zIndex:     250,
  },
};
