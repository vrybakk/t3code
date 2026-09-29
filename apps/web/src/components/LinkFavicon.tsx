import { faviconUrlForOrigin } from "@t3tools/shared/favicon";
import { GlobeIcon } from "lucide-react";
import { memo, useState } from "react";

import { cn } from "~/lib/utils";

import { GitHubIcon } from "./Icons";

const LINK_FAVICON_CLASS_NAME = "block size-full shrink-0 select-none";

/** Hosts whose favicon request already failed this session — skip straight to the globe. */
const failedFaviconHosts = new Set<string>();

/** Sites whose brand mark (drawn in `currentColor`) replaces the fetched favicon so it follows the theme. */
function brandLinkIcon(host: string): typeof GitHubIcon | null {
  const hostname = host.toLowerCase();
  if (hostname === "github.com" || hostname.endsWith(".github.com")) return GitHubIcon;
  return null;
}

/** The site icon placed before an external link's text, sized to the surrounding line. */
export const LinkFavicon = memo(function LinkFavicon({ host }: { host: string }) {
  const [failedHost, setFailedHost] = useState<string | null>(null);
  const BrandIcon = brandLinkIcon(host);
  const faviconUrl = BrandIcon ? null : faviconUrlForOrigin(`https://${host}`);
  return (
    <span
      className="ms-[0.25em] me-[0.2em] inline-flex size-[14px] [vertical-align:-0.125em]"
      aria-hidden
    >
      {BrandIcon ? (
        <BrandIcon className={LINK_FAVICON_CLASS_NAME} />
      ) : faviconUrl === null || failedHost === host || failedFaviconHosts.has(host) ? (
        <GlobeIcon className={LINK_FAVICON_CLASS_NAME} />
      ) : (
        <img
          src={faviconUrl}
          alt=""
          loading="lazy"
          draggable={false}
          className={cn(LINK_FAVICON_CLASS_NAME, "rounded-sm")}
          onError={() => {
            failedFaviconHosts.add(host);
            setFailedHost(host);
          }}
        />
      )}
    </span>
  );
});
