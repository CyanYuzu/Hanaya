import type { MangaConfig } from "../types/mangaConfig";
import { withUserConfig } from "../utils/config-overlay";
export const mangaConfig: MangaConfig = withUserConfig("manga", {enable:false,title:"$t:manga",description:"$t:mangaDescription"});
