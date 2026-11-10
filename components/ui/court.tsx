import type { ReactNode, SVGProps } from "react";

/*
 * A doubles badminton court seen from a raised broadcast camera behind one baseline.
 * Court units are decimetres: 61 wide (x) by 134 long (z); y is height above the floor.
 */
const WIDTH = 61;
const LENGTH = 134;
const CAMERA = { height: 140, distance: -260, focal: 1065.6, centerX: 200, horizon: -345.8 };

export function courtPoint(x: number, z: number, y = 0): [number, number] {
  const depth = z - CAMERA.distance;
  return [
    CAMERA.centerX + CAMERA.focal * (x - WIDTH / 2) / depth,
    CAMERA.horizon + CAMERA.focal * (CAMERA.height - y) / depth,
  ];
}

/** Apparent size of something at court depth z, relative to the near baseline. */
export function courtScale(z: number) {
  return -CAMERA.distance / (z - CAMERA.distance);
}

const fmt = ([x, y]: [number, number]) => `${x.toFixed(1)} ${y.toFixed(1)}`;
const segment = (x1: number, z1: number, x2: number, z2: number, y = 0) => `M${fmt(courtPoint(x1, z1, y))}L${fmt(courtPoint(x2, z2, y))}`;

const lines = [
  // Outer doubles boundary, singles sidelines, service lines, centre lines.
  `M${fmt(courtPoint(0, 0))}L${fmt(courtPoint(WIDTH, 0))}L${fmt(courtPoint(WIDTH, LENGTH))}L${fmt(courtPoint(0, LENGTH))}Z`,
  segment(4.6, 0, 4.6, LENGTH), segment(56.4, 0, 56.4, LENGTH),
  segment(0, 7.6, WIDTH, 7.6), segment(0, 126.4, WIDTH, 126.4),
  segment(0, 47.2, WIDTH, 47.2), segment(0, 86.8, WIDTH, 86.8),
  segment(30.5, 0, 30.5, 47.2), segment(30.5, 86.8, 30.5, LENGTH),
].join("");

const NET_Z = 67;
const NET_TOP = 15.5;
const net = `M${fmt(courtPoint(-1, NET_Z, 4))}L${fmt(courtPoint(WIDTH + 1, NET_Z, 4))}L${fmt(courtPoint(WIDTH + 1, NET_Z, NET_TOP))}L${fmt(courtPoint(-1, NET_Z, NET_TOP))}Z`;
const posts = `M${fmt(courtPoint(-1, NET_Z))}L${fmt(courtPoint(-1, NET_Z, NET_TOP))}M${fmt(courtPoint(WIDTH + 1, NET_Z))}L${fmt(courtPoint(WIDTH + 1, NET_Z, NET_TOP))}`;

export function BroadcastCourt({ children, ...props }: SVGProps<SVGSVGElement> & { children?: ReactNode }) {
  return (
    <svg viewBox="0 0 400 240" fill="none" aria-hidden="true" {...props}>
      <path d={`M${fmt(courtPoint(0, 0))}L${fmt(courtPoint(WIDTH, 0))}L${fmt(courtPoint(WIDTH, LENGTH))}L${fmt(courtPoint(0, LENGTH))}Z`} fill="currentColor" opacity={0.06} />
      <path d={lines} stroke="currentColor" strokeWidth={1.2} strokeLinejoin="round" />
      <path d={net} fill="currentColor" fillOpacity={0.08} stroke="currentColor" strokeWidth={1} strokeDasharray="2 2" />
      <path d={posts} stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
      {children}
    </svg>
  );
}
