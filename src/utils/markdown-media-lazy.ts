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

/** Loads Markdown media only when it is within 700px of the viewport. */
export function initMarkdownMediaLazyLoading(root: ParentNode = document): void {
	if (typeof document === "undefined") return;

	const media = [
		...(root instanceof Element && root.matches(LAZY_MEDIA_SELECTOR)
			? [root as LazyMediaElement]
			: []),
		...root.querySelectorAll<LazyMediaElement>(LAZY_MEDIA_SELECTOR),
	].filter((element) => element.dataset.lazyBound !== "true");

	if (media.length === 0) return;

	if (!("IntersectionObserver" in window)) {
		media.forEach(loadMedia);
		return;
	}

	const observer = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				if (!entry.isIntersecting) continue;
				const target = entry.target as LazyMediaElement;
				observer.unobserve(target);
				loadMedia(target);
			}
		},
		{ rootMargin: "700px 0px" },
	);

	for (const element of media) {
		element.dataset.lazyBound = "true";
		observer.observe(element);
	}
}
