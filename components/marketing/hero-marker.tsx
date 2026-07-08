/** The hand-drawn hero highlight (spec §4.1). Purely presentational; the
 *  #hero-rough SVG filter is emitted once by the page. Server component. */
export function HeroMarker({ children }: { children: React.ReactNode }) {
  return <span className="accent hand">{children}</span>;
}
