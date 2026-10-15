import type { PageMeta } from "./pageMeta";
export interface MangaConfig extends PageMeta {
	enable: boolean;
	/** 允许读取正式成品图片的 HTTPS origin；默认仅站点同源。 */
	imageOrigins?: string[];
}
