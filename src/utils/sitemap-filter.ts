export interface SitemapRouteFilterOptions {
	siteUrl: string;
	basePath?: string;
	disabledPages?: readonly string[];
}

function decodeSegment(segment: string): string {
	try {
		return decodeURIComponent(segment);
	} catch {
		return segment;
	}
}

function getPathSegments(pathname: string): string[] {
	return pathname.split("/").filter(Boolean).map(decodeSegment);
}

/** Filters status-code pages and disabled top-level routes from the sitemap. */
export function isSitemapRouteAllowed(
	pageUrl: string,
	options: SitemapRouteFilterOptions,
): boolean {
	let site: URL;
	let candidate: URL;
	let base: URL;
	try {
		site = new URL(options.siteUrl);
		candidate = new URL(pageUrl, site);
		base = new URL(options.basePath ?? "/", site);
	} catch {
		return false;
	}

	// Only filter this site's routes. A custom sitemap entry on another host
	// must not be removed just because its path happens to share a page slug.
	if (candidate.origin !== site.origin) return true;
	if (base.origin !== site.origin) return false;

	const pathSegments = getPathSegments(candidate.pathname);
	const baseSegments = getPathSegments(base.pathname);
	const isUnderSiteBase = baseSegments.every(
		(segment, index) => pathSegments[index] === segment,
	);
	if (!isUnderSiteBase) return false;

	const routeSegments = pathSegments.slice(baseSegments.length);
	const firstRouteSegment = routeSegments[0]?.toLowerCase();
	if (["404", "404.html", "500", "500.html"].includes(firstRouteSegment ?? "")) {
		return false;
	}

	// Disabled pages are top-level routes (for example /skills/ and
	// /albums/{id}/). Match the first route segment exactly so an article such
	// as /posts/skills-guide/ remains eligible for indexing.
	return !(options.disabledPages ?? []).includes(routeSegments[0] ?? "");
}
