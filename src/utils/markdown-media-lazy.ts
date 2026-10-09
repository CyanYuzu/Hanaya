const LAZY_MEDIA_SELECTOR = [
	"img[data-lazy-media]",
	"iframe[data-lazy-media]",
	"video[data-lazy-media]",
	"audio[data-lazy-media]",
	"object[data-lazy-media]",
	"embed[data-lazy-media]",
].join(", ");
const LAZY_RESOURCE_SELECTOR =
	"[data-lazy-src], [data-lazy-srcset], [data-lazy-poster], [data-lazy-data]";

type LazyMediaElement = HTMLElement & { dataset: DOMStringMap };

let observer: IntersectionObserver | null = null;
let scrollSettleTimer: number | undefined;
let isScrolling = false;
let lifecycleBound = false;
const observedMedia = new Set<LazyMediaElement>();

function getResources(media: LazyMediaElement): HTMLElement[] {
	const scope =
		media.tagName === "IMG" && media.parentElement?.tagName === "PICTURE"
			? media.parentElement
			: media;
	const resources = Array.from(
		scope.querySelectorAll<HTMLElement>(LAZY_RESOURCE_SELECTOR),
	);
	if (scope.matches(LAZY_RESOURCE_SELECTOR)) resources.unshift(scope);
	return resources;
}

function restoreAttribute(
	element: HTMLElement,
	dataAttribute: string,
	attribute: string,
): void {
	const value = element.getAttribute(dataAttribute);
	if (value !== null) element.setAttribute(attribute, value);
}

function restoreImagePlaceholderOnLoad(media: LazyMediaElement): void {
	if (
		media.tagName !== "IMG" ||
		!media.hasAttribute("data-lazy-placeholder")
	) {
		return;
	}

	media.addEventListener(
		"load",
		() => {
			const originalStyle = media.getAttribute("data-lazy-original-style");
			if (originalStyle) media.setAttribute("style", originalStyle);
			else media.removeAttribute("style");
			media.removeAttribute("data-lazy-placeholder");
			media.removeAttribute("data-lazy-original-style");
		},
		{ once: true },
	);
}

function loadMedia(media: LazyMediaElement): void {
	if (!media.hasAttribute("data-lazy-media")) return;

	restoreImagePlaceholderOnLoad(media);
	for (const resource of getResources(media)) {
		// Restore responsive sources before their owning image or media element.
		restoreAttribute(resource, "data-lazy-srcset", "srcset");
		restoreAttribute(resource, "data-lazy-poster", "poster");
		restoreAttribute(resource, "data-lazy-data", "data");
		restoreAttribute(resource, "data-lazy-src", "src");
	}

	if (media.tagName === "IMG" || media.tagName === "IFRAME") {
		media.setAttribute("loading", "eager");
	}
	media.removeAttribute("data-lazy-media");
	media.removeAttribute("data-lazy-bound");
}

function removeDetachedMedia(): void {
	for (const media of observedMedia) {
		if (media.isConnected) continue;
		observer?.unobserve(media);
		media.removeAttribute("data-lazy-bound");
		observedMedia.delete(media);
	}
}

function observeCurrentMedia(): void {
	if (!observer) return;
	removeDetachedMedia();
	observer.disconnect();
	for (const media of observedMedia) observer.observe(media);
}

function isNearCurrentViewport(media: LazyMediaElement): boolean {
	const rect = media.getBoundingClientRect();
	return (
		rect.bottom > 100 &&
		rect.top < window.innerHeight + 700 &&
		rect.right > 0 &&
		rect.left < window.innerWidth
	);
}

function onScroll(): void {
	if (!observer) return;
	isScrolling = true;
	if (scrollSettleTimer !== undefined) {
		window.clearTimeout(scrollSettleTimer);
	}
	scrollSettleTimer = window.setTimeout(() => {
		isScrolling = false;
		observeCurrentMedia();
	}, 160);
}

function ensureObserver(): IntersectionObserver | null {
	if (observer) return observer;
	if (!("IntersectionObserver" in window)) return null;

	observer = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				const target = entry.target as LazyMediaElement;
				if (!target.isConnected) {
					observer?.unobserve(target);
					observedMedia.delete(target);
					continue;
				}
				if (
					!entry.isIntersecting ||
					isScrolling ||
					!isNearCurrentViewport(target)
				) {
					continue;
				}
				observer?.unobserve(target);
				observedMedia.delete(target);
				loadMedia(target);
			}
		},
		// Don't preload above the viewport: media there can otherwise change the
		// measured position of an anchor heading immediately after TOC navigation.
		{ rootMargin: "-100px 0px 700px 0px" },
	);

	if (!lifecycleBound) {
		window.addEventListener("scroll", onScroll, { passive: true });
		document.addEventListener("swup:content:replace", removeDetachedMedia);
		lifecycleBound = true;
	}
	return observer;
}

/** Loads media in view or up to 700px below, after scrolling settles. */
export function initMarkdownMediaLazyLoading(root: ParentNode = document): void {
	if (typeof document === "undefined") return;

	const media = [
		...(root instanceof Element && root.matches(LAZY_MEDIA_SELECTOR)
			? [root as LazyMediaElement]
			: []),
		...root.querySelectorAll<LazyMediaElement>(LAZY_MEDIA_SELECTOR),
	].filter((element) => element.dataset.lazyBound !== "true");

	if (media.length === 0) return;

	const mediaObserver = ensureObserver();
	if (!mediaObserver) {
		media.forEach(loadMedia);
		return;
	}

	for (const element of media) {
		element.dataset.lazyBound = "true";
		observedMedia.add(element);
		mediaObserver.observe(element);
	}
}
