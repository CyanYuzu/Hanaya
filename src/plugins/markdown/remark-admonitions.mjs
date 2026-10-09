export const ELEGANTBOOK_CALLOUT_TYPES = Object.freeze([
	"definition",
	"theorem",
	"lemma",
	"corollary",
	"proposition",
	"axiom",
	"postulate",
	"example",
	"exercise",
	"problem",
	"solution",
	"proof",
	"note",
	"remark",
	"assumption",
	"conclusion",
	"property",
	"custom",
	"introduction",
	"problemset",
]);

const ADMONITION_TYPE_NAMES = [
	"note",
	"info",
	"tip",
	"important",
	"warning",
	"caution",
	"details",
	...ELEGANTBOOK_CALLOUT_TYPES.map((type) => `eb-${type}`),
];
const ADMONITION_TYPES = ADMONITION_TYPE_NAMES.join("|");
const OBSIDIAN_CALLOUT =
	/^\s*\[!([A-Z][\w-]*)(?:\|([\w,-]+))?\]([+-])?(?:[\t ]+(.*))?\s*$/i;
const STANDARD_CALLOUT_TYPES = new Set([
	"note",
	"tip",
	"important",
	"warning",
	"caution",
]);
const ELEGANTBOOK_CALLOUT_NAMES = new Set(
	ELEGANTBOOK_CALLOUT_TYPES.map((type) => `eb-${type}`),
);
const CONTAINER_OPENER = new RegExp(
	`^([\\t ]{0,3})(:{3,})[\\t ]*(${ADMONITION_TYPES})(?![\\w-])(.*)$`,
	"i",
);
const FENCE_OPENER = /^[\t ]{0,3}(`{3,}|~{3,})/;

function escapeAttribute(value) {
	return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
}

function stripBlockquotePrefixes(line) {
	return line.replace(/^(?:[\t ]{0,3}>[\t ]?)+/, "");
}

/**
 * Obsidian accepts a display equation on one line (`$$x^2$$`). remark-math
 * parses that spelling as inline math, which puts large-operator limits beside
 * the operator. Expand only standalone, non-code lines into flow math syntax.
 */
function normalizeObsidianDisplayMath(source) {
	let fence = null;
	return source
		.split(/(\r?\n)/)
		.map((part) => {
			if (part === "\n" || part === "\r\n") return part;

			const markdownLine = stripBlockquotePrefixes(part);
			const fenceMatch = markdownLine.match(FENCE_OPENER);
			if (fence) {
				if (
					fenceMatch &&
					fenceMatch[1][0] === fence.character &&
					fenceMatch[1].length >= fence.length &&
					new RegExp(
						`^[\\t ]{0,3}${fence.character}{${fence.length},}[\\t ]*$`,
					).test(markdownLine)
				) {
					fence = null;
				}
				return part;
			}

			if (fenceMatch) {
				fence = {
					character: fenceMatch[1][0],
					length: fenceMatch[1].length,
				};
				return part;
			}

			const match = part.match(
				/^((?:[\t ]{0,3}>[\t ]?)*[\t ]{0,3})\$\$([^\r\n]+?)\$\$[\t ]*$/,
			);
			if (!match) return part;

			const [, prefix, expression] = match;
			const formula = expression.trim();
			if (!formula) return part;
			return `${prefix}$$\n${prefix}${formula}\n${prefix}$$`;
		})
		.join("");
}

/**
 * Normalizes Plume-style spaced container openers into remark-directive syntax.
 * Existing bracket labels and directive attributes pass through unchanged.
 */
export function rewriteAdmonitionContainers(source) {
	if (typeof source !== "string" || !source.includes(":::")) return source;

	let fence = null;
	return source
		.split(/(\r?\n)/)
		.map((part) => {
			if (part === "\n" || part === "\r\n") return part;

			const fenceMatch = part.match(FENCE_OPENER);
			if (fenceMatch) {
				const marker = fenceMatch[1];
				if (!fence) {
					fence = { character: marker[0], length: marker.length };
				} else if (
					marker[0] === fence.character &&
					marker.length >= fence.length &&
					new RegExp(
						`^[\\t ]{0,3}${fence.character}{${fence.length},}[\\t ]*$`,
					).test(part)
				) {
					fence = null;
				}
				return part;
			}

			if (fence) return part;
			const match = part.match(CONTAINER_OPENER);
			if (!match) return part;

			const [, indent, marker, rawType, rawSuffix] = match;
			const type = rawType.toLowerCase();
			const directiveName = type === "details" ? "admonition-details" : type;
			const suffix = rawSuffix.trim();
			if (!suffix) return `${indent}${marker}${directiveName}`;
			if (suffix.startsWith("[") || suffix.startsWith("{")) {
				return `${indent}${marker}${directiveName}${suffix}`;
			}
			if (!/^[\\t ]/.test(rawSuffix)) return part;
			return `${indent}${marker}${directiveName}{title="${escapeAttribute(suffix)}"}`;
		})
		.join("");
}

function normalizeObsidianCallout(node) {
	const [firstParagraph, ...remainingBlocks] = node.children;
	if (firstParagraph?.type !== "paragraph") return null;
	const [firstText, ...remainingInline] = firstParagraph.children;
	if (firstText?.type !== "text") return null;

	const [declaration, ...remainingLines] = firstText.value.split("\n");
	const match = declaration.match(OBSIDIAN_CALLOUT);
	if (!match) return null;

	const [, rawType, rawMetadata, fold, rawTitle = ""] = match;
	const type = rawType.toLowerCase();
	if (
		!STANDARD_CALLOUT_TYPES.has(type) &&
		!ELEGANTBOOK_CALLOUT_NAMES.has(type)
	) {
		return null;
	}

	const firstLine = remainingLines.join("\n");
	const paragraphChildren = [
		...(firstLine ? [{ ...firstText, value: firstLine }] : []),
		...remainingInline,
	];
	const alertChildren = [
		...(paragraphChildren.length > 0
			? [{ ...firstParagraph, children: paragraphChildren }]
			: []),
		...remainingBlocks,
	];

	const attributes = {};
	const title = rawTitle.trim();
	if (title) attributes.title = title;
	if (rawMetadata) attributes.metadata = rawMetadata.split(",").join(" ");
	if (fold) attributes.collapse = fold === "+" ? "open" : "closed";

	return {
		type: "containerDirective",
		name: type === "details" ? "admonition-details" : type,
		attributes,
		children: alertChildren,
		position: node.position,
	};
}

function normalizeObsidianCallouts(tree) {
	function visitChildren(node) {
		if (!Array.isArray(node.children)) return;

		for (let index = 0; index < node.children.length; index += 1) {
			const child = node.children[index];
			visitChildren(child);
			if (child.type !== "blockquote") continue;

			const callout = normalizeObsidianCallout(child);
			if (callout) node.children[index] = callout;
		}
	}

	visitChildren(tree);
}

export function remarkAdmonitions() {
	const parser = this.parser;
	if (typeof parser !== "function") {
		throw new TypeError(
			"remarkAdmonitions requires an initialized Markdown parser.",
		);
	}

	this.parser = function parseAdmonitions(source) {
		return parser(
			normalizeObsidianDisplayMath(rewriteAdmonitionContainers(source)),
		);
	};

	return normalizeObsidianCallouts;
}
