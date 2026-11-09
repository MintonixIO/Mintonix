"use client";

import { useSearchParams } from "next/navigation";
import { formatShotParam, parseShotParam, type ShotRef } from "./analysis/shots";

export type View = "watch" | "analyze";

/** The watch page's view lives in the URL (?view=analyze) so it can be shared. */
export function useView(available: boolean): View {
  const params = useSearchParams();
  return available && params.get("view") === "analyze" ? "analyze" : "watch";
}

/** The shot open in the 3D replay (?shot=<rallyId>.<n>), so a replay can be shared too. */
export function useOpenShot(): ShotRef | null {
  return parseShotParam(useSearchParams().get("shot"));
}

/** Change the URL without a server round trip, so the embedded video keeps playing. */
function pushParams(update: (params: URLSearchParams) => void) {
  const params = new URLSearchParams(window.location.search);
  update(params);
  const query = params.toString();
  window.history.pushState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
}

export function setView(view: View) {
  pushParams((params) => {
    if (view === "analyze") params.set("view", "analyze");
    else {
      params.delete("view");
      params.delete("shot");
    }
  });
}

export function setOpenShot(ref: ShotRef | null) {
  pushParams((params) => {
    if (ref) params.set("shot", formatShotParam(ref));
    else params.delete("shot");
  });
}
