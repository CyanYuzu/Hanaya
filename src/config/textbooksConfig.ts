import type { TextbooksConfig } from "../types/textbooksConfig.ts";
import { withUserConfig } from "../utils/config-overlay.ts";

export const textbooksConfig: TextbooksConfig = withUserConfig("textbooks", {
	enable: true,
	title: "$t:textbooks",
	description: "$t:textbooksBanner",
});
