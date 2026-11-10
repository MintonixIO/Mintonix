import { SiteHeader } from "@/components/site/site-header";

/** Marketing and blog pages share the floating navigation; the match viewer does not. */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <div className="site-shell">{children}</div>
    </>
  );
}
