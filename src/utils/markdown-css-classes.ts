/** Normalize Obsidian's cssclass/cssclasses values before adding them to SSR HTML. */
export function normalizeMarkdownCssClasses(...values: unknown[]): string[] {
	const classes = new Set<string>();
	const pending = values.flatMap((value) =>
		Array.isArray(value) ? value : [value],
	);

	for (const value of pending) {
		if (typeof value !== "string") continue;
		for (const className of value.split(/\s+/)) {
			if (/^[A-Za-z_][A-Za-z0-9_-]*$/.test(className)) {
				classes.add(className);
			}
		}
	}

	return [...classes];
}
