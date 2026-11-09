"use client";

import { useSearchParams } from "next/navigation";

export type View = "watch" | "analyze";

/** The watch page's view lives in the URL (?view=analyze) so it can be shared. */
export function useView(available: boolean): View {
  const params = useSearchParams();
  return available && params.get("view") === "analyze" ? "analyze" : "watch";
}

/** Switch views without a server round trip, so the embedded video keeps playing. */
export function setView(view: View) {
  const params = new URLSearchParams(window.location.search);
  if (view === "analyze") params.set("view", "analyze");
  else params.delete("view");
  const query = params.toString();
  window.history.pushState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
}
