import fs from "node:fs/promises";
import path from "node:path";
import { fromHtml } from "hast-util-from-html";
import sharp from "sharp";

/**
 * rehype 插件：Markdown 图片通用增强。
 *
 * 语法：`![图片描述 w-50%](图片链接 "图片标题")`
 * - `w-N%`（1~100）写在 alt 文本中，解析后从 alt 移除并作为显示宽度（居中）；
 * - `"图片标题"` 渲染为图片下方的可见图注；
 * - 正文图片保存为 `data-lazy-src`，进入视口附近后由共享运行时恢复，
 *   并输出 `<noscript>` 回退；未知尺寸图片先保留临时占位比例，加载完成
 *   后恢复原样式；不延迟 Markdown 文字。
 * - 独立成段的图片在带标题或宽度令牌时包装为 `<figure>`，并补齐
 *   `loading="lazy"` / `decoding="async"`。
 * - 原始 HTML `<img>` 使用同一套规则；匹配配置域名时补充
 *   `referrerpolicy="no-referrer"`。
 *
 * 跳过规则：画廊（.image-grid）与 Mermaid 容器内的图片不重复增强，
 * 携带 `data-no-enhance` 的节点同样跳过。
 * 必须注册在 rehypeComponents 之后，确保 :::grid 已渲染出跳过类名。
 */

const WIDTH_TOKEN = /(?:^|\s)w-(\d{1,3})%(?=\s|$)/g;
const SKIP_CLASSES = new Set(["image-grid", "markdown-mermaid"]);

function classNames(node) {
	const value = node?.properties?.className ?? node?.properties?.class;
	if (Array.isArray(value)) return value.map(String);
	return typeof value === "string" ? value.split(/\s+/).filter(Boolean) : [];
}

function hasNoEnhance(node) {
	const properties = node?.properties;
	return (
		properties &&
		("dataNoEnhance" in properties || "data-no-enhance" in properties)
	);
}

function cloneNode(node) {
	if (Array.isArray(node)) return node.map(cloneNode);
	if (!node || typeof node !== "object") return node;

	return {
		...node,
		...(node.properties
			? {
					properties: Object.fromEntries(
						Object.entries(node.properties).map(([key, value]) => [
							key,
							Array.isArray(value) ? [...value] : value,
						]),
					),
				}
			: {}),
		...(node.children ? { children: node.children.map(cloneNode) } : {}),
	};
}

function createNoScriptFallback(node) {
	const fallback = cloneNode(node);
	const restoreDeferredSources = (current) => {
		if (current?.type !== "element") return;
		current.properties ??= {};
		delete current.properties.id;
		for (const [dataProperty, sourceProperty] of [
			["dataLazySrc", "src"],
			["dataLazySrcset", "srcSet"],
			["dataLazyPoster", "poster"],
			["dataLazyData", "data"],
		]) {
			if (current.properties[dataProperty] == null) continue;
			current.properties[sourceProperty] = current.properties[dataProperty];
			delete current.properties[dataProperty];
		}
		if (current.properties.dataLazyPlaceholder != null) {
			const originalStyle = current.properties.dataLazyOriginalStyle;
			if (typeof originalStyle === "string" && originalStyle) {
				current.properties.style = originalStyle;
			} else {
				delete current.properties.style;
			}
			delete current.properties.dataLazyPlaceholder;
			delete current.properties.dataLazyOriginalStyle;
		}
		delete current.properties.dataLazyMedia;
		delete current.properties.dataLazyBound;
		for (const child of current.children ?? []) restoreDeferredSources(child);
	};
	const visit = (current) => {
		if (current?.type !== "element") return;
		if (current.tagName === "img") {
			current.properties ??= {};
			current.properties.loading ??= "lazy";
			current.properties.decoding ??= "async";
		}
		for (const child of current.children ?? []) visit(child);
	};
	restoreDeferredSources(fallback);
	visit(fallback);

	return {
		type: "element",
		tagName: "noscript",
		properties: { dataPagefindIgnore: true },
		children: [fallback],
	};
}

function movePropertyToData(properties, propertyName, dataPropertyName) {
	const propertyAliases =
		propertyName === "srcSet" ? ["srcSet", "srcset"] : [propertyName];
	const key = propertyAliases.find((candidate) => properties[candidate] != null);
	if (!key) return false;

	const value = properties[key];
	if (typeof value !== "string" || !value.trim()) return false;

	properties[dataPropertyName] = value;
	delete properties[key];
	return true;
}

function hasMediaSource(node) {
	if (node?.type !== "element") return false;
	const properties = node.properties ?? {};
	const ownSource = {
		img: ["src", "srcSet", "srcset"],
		iframe: ["src"],
		video: ["src", "poster"],
		audio: ["src"],
		source: ["src", "srcSet", "srcset"],
		track: ["src"],
		object: ["data"],
		embed: ["src"],
	}[node.tagName];
	if (
		ownSource?.some((property) => {
			const value = properties[property];
			return value != null && String(value).trim().length > 0;
		})
	) {
		return true;
	}
	return (node.children ?? []).some(hasMediaSource);
}

function hasDeferredMediaSource(node) {
	if (node?.type !== "element") return false;
	const properties = node.properties ?? {};
	if (
		["dataLazySrc", "dataLazySrcset", "dataLazyPoster", "dataLazyData"].some(
			(property) => properties[property] != null,
		)
	) {
		return true;
	}
	return (node.children ?? []).some(hasDeferredMediaSource);
}

function hasEagerImage(node) {
	if (node?.type !== "element") return false;
	if (node.tagName === "img" && node.properties?.loading === "eager") {
		return true;
	}
	return (node.children ?? []).some(hasEagerImage);
}

function findFirstImage(node) {
	if (node?.type !== "element") return null;
	if (node.tagName === "img") return node;
	for (const child of node.children ?? []) {
		const image = findFirstImage(child);
		if (image) return image;
	}
	return null;
}

function hasReservedImageSpace(image, ancestors) {
	const properties = image.properties ?? {};
	if (Number(properties.width) > 0 && Number(properties.height) > 0) return true;

	return [...ancestors, image].some((node) => {
		if (classNames(node).includes("image-grid__link")) return true;
		return /(?:^|;)\s*aspect-ratio\s*:/i.test(
			String(node?.properties?.style ?? ""),
		);
	});
}

function reserveImageSpace(image, ancestors) {
	image.properties ??= {};
	if (
		image.properties.dataLazyPlaceholder != null ||
		hasReservedImageSpace(image, ancestors)
	) {
		return;
	}
	image.properties.dataLazyPlaceholder = "true";
	image.properties.dataLazyOriginalStyle =
		typeof image.properties.style === "string" ? image.properties.style : "";
	image.properties.style = appendStyle(
		appendStyle(image.properties.style, "width: 100%"),
		"aspect-ratio: 16 / 9",
	);
}

function clearImageSpacePlaceholder(image) {
	if (image.properties?.dataLazyPlaceholder == null) return;
	const originalStyle = image.properties.dataLazyOriginalStyle;
	if (typeof originalStyle === "string" && originalStyle) {
		image.properties.style = originalStyle;
	} else {
		delete image.properties.style;
	}
	delete image.properties.dataLazyPlaceholder;
	delete image.properties.dataLazyOriginalStyle;
}

function deferImageSource(image, ancestors) {
	image.properties ??= {};
	if (image.properties.loading === "eager") return false;
	const hasImageSource = ["src", "srcSet", "srcset"].some((property) => {
		const value = image.properties[property];
		return value != null && String(value).trim().length > 0;
	});
	if (!hasImageSource) return false;
	// A dimensionless image with no src collapses to zero height, causing every
	// later image to appear near the top of a long article. Reserve a temporary
	// frame so IntersectionObserver can load images progressively.
	reserveImageSpace(image, ancestors);
	const movedSrc = movePropertyToData(
		image.properties,
		"src",
		"dataLazySrc",
	);
	const movedSrcSet = movePropertyToData(
		image.properties,
		"srcSet",
		"dataLazySrcset",
	);
	if (movedSrc || movedSrcSet) image.properties.dataLazyMedia = "true";
	return movedSrc || movedSrcSet;
}

function deferMediaSource(node) {
	if (node?.type !== "element") return false;
	node.properties ??= {};
	const properties = node.properties;
	const tagName = node.tagName;
	let deferred = false;

	if (tagName === "iframe") {
		properties.loading ??= "lazy";
		if (properties.loading === "eager") return false;
		deferred = movePropertyToData(properties, "src", "dataLazySrc");
	} else if (tagName === "video" || tagName === "audio") {
		properties.preload ??= "none";
		deferred = movePropertyToData(properties, "src", "dataLazySrc");
		if (tagName === "video") {
			deferred =
				movePropertyToData(properties, "poster", "dataLazyPoster") || deferred;
		}
		deferred = hasMediaSource(node) || deferred;
	} else if (tagName === "object") {
		deferred = movePropertyToData(properties, "data", "dataLazyData");
	} else if (tagName === "embed") {
		deferred = movePropertyToData(properties, "src", "dataLazySrc");
	}

	if (deferred) properties.dataLazyMedia = "true";
	return deferred;
}

function shouldSkipEnhancement(ancestors, image) {
	return [...ancestors, image].some(
		(node) =>
			hasNoEnhance(node) ||
			node?.tagName === "figure" ||
			classNames(node).some((className) => SKIP_CLASSES.has(className)),
	);
}

function domainPatternToRegExp(pattern) {
	const escaped = pattern
		.trim()
		.toLowerCase()
		.replace(/[.+?^${}()|[\]\\]/g, "\\$&")
		.replace(/\*/g, ".*");
	return escaped ? new RegExp(`^${escaped}$`, "i") : null;
}

/**
 * 判断 HTTP(S) 图片 URL 是否匹配精确域名或通配符域名。
 *
 * @param {unknown} url 图片 URL。
 * @param {unknown[]} patterns 域名模式列表。
 * @returns {boolean}
 */
export function matchesNoReferrerDomain(url, patterns = []) {
	if (
		typeof url !== "string" ||
		!/^https?:\/\//i.test(url) ||
		!Array.isArray(patterns) ||
		patterns.length === 0
	) {
		return false;
	}

	try {
		const hostname = new URL(url).hostname;
		return patterns.some((pattern) => {
			const matcher = domainPatternToRegExp(String(pattern));
			return matcher?.test(hostname) ?? false;
		});
	} catch {
		return false;
	}
}

/**
 * 解析可选的 `w-N%` 宽度令牌；非法值（越界/格式错误）保留在 alt 中。
 *
 * @param {unknown} value alt 原始值。
 * @returns {{ alt: string, width?: number }}
 */
export function parseMarkdownImageAlt(value) {
	const alt = typeof value === "string" ? value : String(value ?? "");
	let width;
	const cleaned = alt.replace(WIDTH_TOKEN, (token, rawWidth) => {
		const candidate = Number.parseInt(rawWidth, 10);
		if (width === undefined && candidate >= 1 && candidate <= 100) {
			width = candidate;
			return "";
		}
		return token;
	});

	return {
		alt: cleaned.replace(/\s{2,}/g, " ").trim(),
		width,
	};
}

function appendStyle(current, declaration) {
	const style = typeof current === "string" ? current.trim() : "";
	if (!style) return declaration;
	return `${style.replace(/;?$/, ";")} ${declaration}`;
}

function createFigure(image, title) {
	return {
		type: "element",
		tagName: "figure",
		properties: { className: ["markdown-image-figure"] },
		children: [
			image,
			...(title
				? [
						{
							type: "element",
							tagName: "figcaption",
							properties: { className: ["markdown-image-caption"] },
							children: [{ type: "text", value: title }],
						},
					]
				: []),
		],
	};
}

function isWhitespaceText(node) {
	return node?.type === "text" && !node.value.trim();
}

function onlyImageChild(node) {
	const meaningful = (node.children ?? []).filter(
		(child) => !isWhitespaceText(child),
	);
	return meaningful.length === 1 && meaningful[0]?.tagName === "img"
		? meaningful[0]
		: null;
}

async function readImageDimensions(src, filePath) {
	if (!src || /^(?:https?:|data:|\/\/)/i.test(src)) return undefined;
	const candidates = [];
	if (src.startsWith("/")) {
		candidates.push(path.join(process.cwd(), "public", src.slice(1)));
	} else if (filePath) {
		candidates.push(path.resolve(path.dirname(filePath), src));
	}
	for (const candidate of candidates) {
		try {
			await fs.access(candidate);
			const metadata = await sharp(candidate).metadata();
			if (metadata.width && metadata.height) {
				return { width: metadata.width, height: metadata.height };
			}
		} catch {
			// Missing or unsupported files are left untouched for runtime handling.
		}
	}
	return undefined;
}

async function enhanceImage(image, ancestors, allowFigure, options, filePath) {
	image.properties ??= {};
	const properties = image.properties;
	// 零额外负担：所有正文图片统一惰性加载与异步解码
	properties.loading ??= "lazy";
	properties.decoding ??= "async";
	if (properties.loading === "lazy") properties.fetchPriority ??= "low";
	if (properties.width == null || properties.height == null) {
		const dimensions = await readImageDimensions(
			String(properties.src ?? ""),
			filePath,
		);
		if (dimensions) {
			properties.width ??= dimensions.width;
			properties.height ??= dimensions.height;
			clearImageSpacePlaceholder(image);
		}
	}
	if (
		matchesNoReferrerDomain(
			String(properties.src ?? ""),
			options.noReferrerDomains,
		)
	) {
		properties.referrerPolicy = "no-referrer";
	}

	if (shouldSkipEnhancement(ancestors, image)) return image;

	const parsedAlt = parseMarkdownImageAlt(properties.alt);
	properties.alt = parsedAlt.alt;
	if (parsedAlt.width !== undefined) {
		properties.style = appendStyle(
			properties.style,
			`width: ${parsedAlt.width}%; display: block; margin-inline: auto;`,
		);
	}

	const title =
		typeof properties.title === "string" ? properties.title.trim() : "";
	// figure 包装仅限独立成段的图片；混排文本中的图片包 figure 会产生无效嵌套
	return allowFigure && (title || parsedAlt.width !== undefined)
		? createFigure(image, title)
		: image;
}

async function transformChildren(
	parent,
	ancestors,
	options,
	filePath,
	allowFigure = true,
) {
	const nextChildren = [];
	const canWrapChildImage =
		allowFigure && parent.tagName !== "p" && parent.tagName !== "picture";

	for (const child of parent.children ?? []) {
		if (
			child.type === "raw" &&
			/<(?:img|picture|iframe|video|audio|source|track|object|embed)\b/i.test(
				child.value ?? "",
			)
		) {
			const fragment = fromHtml(child.value, { fragment: true });
			await transformChildren(
				fragment,
				ancestors,
				options,
				filePath,
				canWrapChildImage,
			);
			nextChildren.push(...fragment.children);
			continue;
		}

		if (child.type !== "element") {
			nextChildren.push(child);
			continue;
		}

		if (child.tagName === "picture") {
			const hasFallback = hasMediaSource(child);
			await transformChildren(
				child,
				[...ancestors, child],
				options,
				filePath,
				false,
			);
			nextChildren.push(child);
			if (hasFallback && hasDeferredMediaSource(child)) {
				nextChildren.push(createNoScriptFallback(child));
			}
			continue;
		}

		if (child.tagName === "p") {
			const image = onlyImageChild(child);
			if (image) {
				const insidePicture = ancestors.some(
					(node) => node.tagName === "picture",
				);
				const enhancedImage = await enhanceImage(
					image,
					[...ancestors, child],
					true,
					options,
					filePath,
				);
				const deferred = deferImageSource(image, [
					...ancestors,
					child,
				]);
				nextChildren.push(enhancedImage);
				if (deferred && !insidePicture) {
					nextChildren.push(createNoScriptFallback(image));
				}
				continue;
			}
		}

		if (child.tagName === "img") {
			const insidePicture = ancestors.some(
				(node) => node.tagName === "picture",
			);
			const enhancedImage = await enhanceImage(
				child,
				ancestors,
				canWrapChildImage,
				options,
				filePath,
			);
			const deferred = deferImageSource(child, ancestors);
			nextChildren.push(enhancedImage);
			if (deferred && !insidePicture) {
				nextChildren.push(createNoScriptFallback(child));
			}
			continue;
		}

		if (
			child.tagName === "source" &&
			ancestors.some((node) => node.tagName === "picture")
		) {
			const picture = ancestors.find((node) => node.tagName === "picture");
			if (picture && hasEagerImage(picture)) {
				nextChildren.push(child);
				continue;
			}
			const image = picture ? findFirstImage(picture) : null;
			child.properties ??= {};
			const deferred = movePropertyToData(
				child.properties,
				"srcSet",
				"dataLazySrcset",
			);
			if (deferred && picture) {
				if (image) {
					image.properties ??= {};
					reserveImageSpace(image, ancestors);
					image.properties.loading ??= "lazy";
					image.properties.decoding ??= "async";
					image.properties.dataLazyMedia = "true";
				}
			}
			nextChildren.push(child);
			continue;
		}

		if (
			(child.tagName === "source" || child.tagName === "track") &&
			ancestors.some((node) => node.tagName === "video" || node.tagName === "audio") &&
			!ancestors.some(
				(node) =>
				node.tagName === "audio" && node.properties?.hidden != null,
			)
		) {
			child.properties ??= {};
			movePropertyToData(child.properties, "src", "dataLazySrc");
			nextChildren.push(child);
			continue;
		}

		if (["iframe", "video", "audio", "object", "embed"].includes(child.tagName)) {
			const hasFallback = hasMediaSource(child);
			const hiddenAudio =
				child.tagName === "audio" && child.properties?.hidden != null;
			const deferred = hiddenAudio
				? false
				: deferMediaSource(child);
			if (hiddenAudio) child.properties.preload ??= "none";
			await transformChildren(
				child,
				[...ancestors, child],
				options,
				filePath,
				canWrapChildImage,
			);
			nextChildren.push(child);
			if (deferred && hasFallback) {
				nextChildren.push(createNoScriptFallback(child));
			}
			continue;
		}

		await transformChildren(
			child,
			[...ancestors, child],
			options,
			filePath,
			canWrapChildImage,
		);
		nextChildren.push(child);
	}

	parent.children = nextChildren;
}

/**
 * 对 Markdown 中的图片和嵌入媒体应用统一增强与视口附近加载规则。
 */
export function rehypeMarkdownImages(options = {}) {
	const normalizedOptions = {
		noReferrerDomains: Array.isArray(options.noReferrerDomains)
			? options.noReferrerDomains
			: [],
	};

	return async (tree, file) => {
		await transformChildren(tree, [], normalizedOptions, file?.path, true);
	};
}
