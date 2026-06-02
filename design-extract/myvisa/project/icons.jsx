/* icons.jsx — small, restrained stroke icon set + placeholders
   Exposed on window for cross-file use. */

function Icon({ name, size = 20, stroke = 1.6, style }) {
  const p = {
    width: size, height: size, viewBox: "0 0 24 24", fill: "none",
    stroke: "currentColor", strokeWidth: stroke,
    strokeLinecap: "round", strokeLinejoin: "round",
  };
  const paths = {
    arrowRight: <><path d="M5 12h14" /><path d="M13 6l6 6-6 6" /></>,
    arrowLeft: <><path d="M19 12H5" /><path d="M11 18l-6-6 6-6" /></>,
    check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
    chevron: <path d="M9 6l6 6-6 6" />,
    chevronDown: <path d="M6 9l6 6 6-6" />,
    shield: <><path d="M12 3l7 3v6c0 4.2-2.9 7.4-7 9-4.1-1.6-7-4.8-7-9V6z" /><path d="M9 12l2 2 4-4" /></>,
    clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
    spark: <><path d="M12 3v4" /><path d="M12 17v4" /><path d="M3 12h4" /><path d="M17 12h4" /><path d="M6.5 6.5l2.5 2.5" /><path d="M15 15l2.5 2.5" /><path d="M17.5 6.5L15 9" /><path d="M9 15l-2.5 2.5" /></>,
    award: <><circle cx="12" cy="9" r="5" /><path d="M9 13.5L7.5 21l4.5-2.5L16.5 21 15 13.5" /></>,
    match: <><path d="M12 21s-7-4.6-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.4-7 10-7 10z" /></>,
    guide: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3" /></>,
    doc: <><path d="M7 3h7l4 4v14H7z" /><path d="M14 3v4h4" /><path d="M9.5 13h5M9.5 16.5h5" /></>,
    map: <><path d="M9 4L4 6v14l5-2 6 2 5-2V4l-5 2-6-2z" /><path d="M9 4v14M15 6v14" /></>,
    moon: <path d="M20 14.5A8 8 0 0 1 9.5 4 7 7 0 1 0 20 14.5z" />,
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19" /></>,
    user: <><circle cx="12" cy="8" r="4" /><path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6" /></>,
    lock: <><rect x="5" y="10.5" width="14" height="10" rx="2" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></>,
    pin: <><path d="M12 21s-6-5.3-6-10a6 6 0 1 1 12 0c0 4.7-6 10-6 10z" /><circle cx="12" cy="11" r="2" /></>,
    coins: <><ellipse cx="9" cy="7" rx="5" ry="2.5" /><path d="M4 7v5c0 1.4 2.2 2.5 5 2.5s5-1.1 5-2.5V7" /><ellipse cx="15" cy="14" rx="5" ry="2.5" /><path d="M10 15v3c0 1.4 2.2 2.5 5 2.5s5-1.1 5-2.5v-4" /></>,
    briefcase: <><rect x="3" y="7.5" width="18" height="12" rx="2" /><path d="M8.5 7.5V6a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v1.5" /><path d="M3 12.5h18" /></>,
    send: <path d="M4 12l16-7-7 16-2.5-6.5L4 12z" />,
    external: <><path d="M14 5h5v5" /><path d="M19 5l-8 8" /><path d="M18 13.5V19H5V6h5.5" /></>,
    bell: <><path d="M6 9a6 6 0 1 1 12 0c0 4 1.5 6 1.5 6H4.5S6 13 6 9z" /><path d="M10 19a2 2 0 0 0 4 0" /></>,
    menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
    x: <path d="M6 6l12 12M18 6L6 18" />,
    refresh: <><path d="M4 12a8 8 0 0 1 13.7-5.6L20 8" /><path d="M20 4v4h-4" /><path d="M20 12a8 8 0 0 1-13.7 5.6L4 16" /><path d="M4 20v-4h4" /></>,
    cap: <><path d="M3 9l9-4 9 4-9 4-9-4z" /><path d="M7 11v4c0 1.1 2.2 2 5 2s5-.9 5-2v-4" /><path d="M21 9v5" /></>,
  };
  return <span className="icon" style={style}><svg {...p}>{paths[name] || null}</svg></span>;
}

/* striped placeholder for any imagery we don't have */
function Placeholder({ label, h = 160, style }) {
  return (
    <div className="ph" style={{ height: h, borderRadius: "var(--r-md)", ...style }}>
      <span>{label}</span>
    </div>
  );
}

Object.assign(window, { Icon, Placeholder });
