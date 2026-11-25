/** The court was framed for a 16:10 view with a 38° vertical field of view. */
export const BASE_FOV = 38;
export const BASE_ASPECT = 16 / 10;

/** A vertical field of view that keeps the 16:10 framing's width in a narrower (taller) view. */
export function fieldOfView(aspect: number): number {
  if (!(aspect > 0) || aspect >= BASE_ASPECT) return BASE_FOV;
  const halfWidth = Math.tan((BASE_FOV * Math.PI) / 360) * BASE_ASPECT;
  return (Math.atan(halfWidth / aspect) * 360) / Math.PI;
}
