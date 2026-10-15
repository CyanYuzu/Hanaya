<script lang="ts">
import { onMount, tick } from "svelte";
import Button from "@components/atoms/action/Button.svelte";
import Select from "@components/atoms/input/Select.svelte";
import TextField from "@components/atoms/input/TextField.svelte";
import {
	boundedJSON,
	parseCurrent,
	parseManifest,
	spreadIndices,
	viewportPages,
	type PublicManifest,
} from "@/utils/manga-reader";
let {
	currentURL,
	bookId,
	chapterId,
	labels,
	bookURL,
	previousChapter = "",
	nextChapter = "",
	imageOrigins = [],
}: {
	currentURL: string;
	bookId: string;
	chapterId: string;
	labels: Record<string, string>;
	bookURL: string;
	previousChapter?: string;
	nextChapter?: string;
	imageOrigins?: string[];
} = $props();
let manifest: PublicManifest | null = $state(null),
	error = $state(""),
	loading = $state(true),
	index = $state(0),
	mode = $state("single"),
	direction = $state("rtl"),
	fit = $state("width"),
	zoom = $state(1),
	hidden = $state(false),
	visiblePages: Set<number> = $state(new Set()),
	failed: Set<number> = $state(new Set());
let container: HTMLDivElement;
let observer: IntersectionObserver | undefined;
let controller: AbortController | undefined;
let generation = 0;
let prefetch: HTMLImageElement | undefined;
let pending: Promise<void> | undefined;
let cached = $state(false),
	frames = new Map<number, HTMLElement>(),
	near = new Set<number>(),
	scrollFrame = 0,
	pan = false;
let jumpText = $state("1"),
	jumpFocused = $state(false);
$effect(() => {
	if (!jumpFocused) jumpText = String(index + 1);
});
const key = `cyanroaster:progress:${bookId}/${chapterId}`;
let shown = $derived(
	manifest
		? mode === "double"
			? spreadIndices(index, manifest.page_count)
			: [index]
		: [],
);
let ordered = $derived(direction === "rtl" ? [...shown].reverse() : shown);
function remember() {
	if (!manifest) return;
	try {
		localStorage.setItem(
			key,
			JSON.stringify({
				page_id: manifest.pages[index].page_id,
				index,
				mode,
				direction,
				fit,
			}),
		);
	} catch {
		/* Reading continues when browser storage is unavailable. */
	}
}
async function scrollToPage() {
	if (mode !== "scroll") return;
	await tick();
	frames.get(index)?.scrollIntoView({ block: "start", behavior: "instant" });
}
function select(value: number) {
	if (!manifest) return;
	index = Math.max(0, Math.min(manifest.page_count - 1, value));
	remember();
	preload();
	scrollToPage();
}
function step(delta: number) {
	if (!manifest) return;
	const current = shown;
	select(delta > 0 ? current.at(-1)! + 1 : current[0] - 1);
}
function preload() {
	if (!manifest || mode === "scroll") return;
	const next = shown.at(-1)! + 1;
	if (next < manifest.page_count) {
		if (prefetch) prefetch.src = "";
		prefetch = new Image();
		prefetch.src = manifest.pages[next].url;
	}
}
function classify(e: unknown) {
	const code = e instanceof Error ? e.message : "network";
	return labels[code] || labels.network;
}
async function load() {
	if (pending) return pending;
	const mine = ++generation;
	controller?.abort();
	controller = new AbortController();
	loading = true;
	error = "";
	cached = false;
	pending = (async () => {
		try {
			const base = new URL(currentURL, location.href).href;
			const signal = AbortSignal.any([
				controller!.signal,
				AbortSignal.timeout(8000),
			]);
			let value: PublicManifest;
			try {
				const current = parseCurrent(
					await boundedJSON(
						await fetch(base, {
							signal,
							cache: "no-cache",
							credentials: "omit",
						}),
					),
					base,
					chapterId,
				);
				value = parseManifest(
					await boundedJSON(
						await fetch(current.manifest, {
							signal,
							cache: "force-cache",
							credentials: "omit",
						}),
					),
					base,
					chapterId,
					current.release_id,
					imageOrigins,
				);
				try {
					const portable = {
						...value,
						pages: value.pages.map((p) => ({
							...p,
							url:
								new URL(p.url).origin === new URL(base).origin
									? new URL(p.url).pathname
									: p.url,
						})),
						...(value.cover
							? {
									cover:
										new URL(value.cover).origin === new URL(base).origin
											? new URL(value.cover).pathname
											: value.cover,
								}
							: {}),
					};
					localStorage.setItem(
						key + ":manifest",
						JSON.stringify({ base, current, manifest: portable }),
					);
				} catch {}
			} catch (e) {
				if (controller?.signal.aborted) throw e;
				const code = e instanceof Error ? e.message : "network";
				if (["schema", "permission", "missing"].includes(code)) throw e;
				let text: string | null = null;
				try {
					text = localStorage.getItem(key + ":manifest");
				} catch {}
				if (!text || text.length > 512 * 1024) throw e;
				const saved = JSON.parse(text);
				if (saved.base !== base) throw e;
				value = parseManifest(
					saved.manifest,
					base,
					chapterId,
					saved.current.release_id,
					imageOrigins,
				);
				cached = true;
			}
			if (mine !== generation) return;
			manifest = value;
			direction = value.reading_direction;
			try {
				const stored = JSON.parse(localStorage.getItem(key) || "null");
				if (stored) {
					const found = value.pages.findIndex(
						(p) => p.page_id === stored.page_id,
					);
					index =
						found >= 0
							? found
							: Math.min(
									value.page_count - 1,
									Math.max(0, Number(stored.index) || 0),
								);
					if (["single", "double", "scroll"].includes(stored.mode))
						mode = stored.mode;
					if (["rtl", "ltr"].includes(stored.direction))
						direction = stored.direction;
					if (["width", "height"].includes(stored.fit)) fit = stored.fit;
				}
			} catch {}
			preload();
		} catch (e) {
			if (mine === generation && !controller?.signal.aborted)
				error = classify(e);
		} finally {
			if (mine === generation) {
				loading = false;
				pending = undefined;
				await scrollToPage();
			}
		}
	})();
	return pending;
}
function updateViewport() {
	scrollFrame = 0;
	if (mode !== "scroll" || !manifest) return;
	let candidate = index,
		distance = Infinity;
	for (const [i, node] of frames) {
		const rect = node.getBoundingClientRect();
		if (rect.bottom > 0 && rect.top < innerHeight) {
			const d = Math.abs(rect.top);
			if (d < distance) {
				distance = d;
				candidate = i;
			}
		}
	}
	if (candidate !== index) {
		index = candidate;
		remember();
	}
	visiblePages = new Set(viewportPages(index, manifest.page_count, near));
}
function queueViewport() {
	if (!scrollFrame) scrollFrame = requestAnimationFrame(updateViewport);
}
function watch(node: HTMLElement, pageIndex: number) {
	frames.set(pageIndex, node);
	observer ??= new IntersectionObserver(
		(entries) => {
			for (const e of entries) {
				const i = Number((e.target as HTMLElement).dataset.pageIndex);
				if (e.isIntersecting) near.add(i);
				else near.delete(i);
			}
			queueViewport();
		},
		{ rootMargin: "500px 0px" },
	);
	node.dataset.pageIndex = String(pageIndex);
	observer.observe(node);
	return {
		destroy() {
			observer?.unobserve(node);
			frames.delete(pageIndex);
			near.delete(pageIndex);
		},
	};
}
function imageFailed(i: number) {
	failed = new Set([...failed, i]);
}
function retry(i: number) {
	failed = new Set([...failed].filter((v) => v !== i));
}
function keyboard(e: KeyboardEvent) {
	if (
		(e.target as HTMLElement)?.closest("input,textarea,select,button,a") ||
		e.ctrlKey ||
		e.metaKey ||
		e.altKey
	)
		return;
	if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
		e.preventDefault();
		step((e.key === "ArrowLeft") === (direction === "rtl") ? 1 : -1);
	} else if (e.key === "PageDown") {
		e.preventDefault();
		step(1);
	} else if (e.key === "PageUp") {
		e.preventDefault();
		step(-1);
	} else if (e.key === "+") zoom = Math.min(4, zoom + 0.2);
	else if (e.key === "-") zoom = Math.max(0.5, zoom - 0.2);
	else if (e.key === "Home") select(0);
	else if (e.key === "End" && manifest) select(manifest.page_count - 1);
}
let pointers = new Map<number, { x: number; y: number }>(),
	start: { x: number; y: number; time: number } | undefined,
	initialDistance = 0,
	initialZoom = 1;
function down(e: PointerEvent) {
	if ((e.target as HTMLElement).closest("button,a")) return;
	pan = false;
	pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
	if (pointers.size === 1)
		start = { x: e.clientX, y: e.clientY, time: Date.now() };
	if (pointers.size === 2) {
		const [a, b] = [...pointers.values()];
		initialDistance = Math.hypot(a.x - b.x, a.y - b.y);
		initialZoom = zoom;
		start = undefined;
	}
	if (mode !== "scroll")
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
}
function move(e: PointerEvent) {
	const previous = pointers.get(e.pointerId);
	if (!previous) return;
	pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
	if (pointers.size === 2 && initialDistance) {
		const [a, b] = [...pointers.values()];
		zoom = Math.max(
			0.5,
			Math.min(
				4,
				(initialZoom * Math.hypot(a.x - b.x, a.y - b.y)) / initialDistance,
			),
		);
	} else if (
		start &&
		(zoom > 1.05 ||
			pan ||
			(mode !== "scroll" &&
				Math.abs(e.clientY - start.y) > 12 &&
				Math.abs(e.clientY - start.y) > Math.abs(e.clientX - start.x) * 1.5))
	) {
		pan = true;
		container.scrollLeft -= e.clientX - previous.x;
		if (mode !== "scroll") container.scrollTop -= e.clientY - previous.y;
	}
}
function up(e: PointerEvent) {
	pointers.delete(e.pointerId);
	const origin = start;
	start = undefined;
	if (!origin || pan || mode === "scroll" || zoom > 1.05) return;
	const dx = e.clientX - origin.x,
		dy = e.clientY - origin.y;
	const age = Date.now() - origin.time;
	if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5 && age < 1000)
		step(dx < 0 === (direction === "ltr") ? 1 : -1);
	else if (Math.abs(dx) < 10 && Math.abs(dy) < 10 && age < 400) {
		const rect = container.getBoundingClientRect(),
			area = (e.clientX - rect.left) / rect.width;
		if (area < 0.3) step(direction === "rtl" ? 1 : -1);
		else if (area > 0.7) step(direction === "rtl" ? -1 : 1);
		else hidden = !hidden;
	}
}
onMount(() => {
	load();
	document.addEventListener("keydown", keyboard);
	window.addEventListener("scroll", queueViewport, { passive: true });
	window.addEventListener("resize", queueViewport);
	let disposed = false;
	const cleanup = () => {
		if (disposed) return;
		disposed = true;
		++generation;
		controller?.abort();
		observer?.disconnect();
		cancelAnimationFrame(scrollFrame);
		frames.clear();
		near.clear();
		pointers.clear();
		document.removeEventListener("keydown", keyboard);
		window.removeEventListener("scroll", queueViewport);
		window.removeEventListener("resize", queueViewport);
		document.removeEventListener("astro:before-swap", cleanup);
		if (prefetch) prefetch.src = "";
	};
	document.addEventListener("astro:before-swap", cleanup);
	return cleanup;
});
</script>

<section class="manga-reader" aria-label={labels.reader}>
    <div class:reader-hidden={hidden} class="reader-toolbar">
        <Button label={labels.previous} ariaLabel={labels.previous} variant="tonal" size="medium" disabled={!manifest||index===0} onclick={()=>step(-1)}/>
        <Select bind:value={mode} label={labels.mode} items={[{value:"single",label:labels.single},{value:"double",label:labels.double},{value:"scroll",label:labels.scroll}]} onchange={()=>{remember();preload();scrollToPage();}}/>
        <Select bind:value={direction} label={labels.direction} items={[{value:"rtl",label:labels.rtl},{value:"ltr",label:labels.ltr}]} onchange={remember}/>
        <Button label={labels.next} ariaLabel={labels.next} variant="tonal" size="medium" disabled={!manifest||index>=manifest.page_count-1} onclick={()=>step(1)}/>
        <div class="reader-jump"><TextField type="number" label={labels.page} bind:value={jumpText} onfocus={()=>jumpFocused=true} onblur={()=>{jumpFocused=false;select((Number(jumpText)||1)-1);}}/><span>/ {manifest?.page_count||0}</span></div>
        <Button label={labels.fitWidth} variant="text" size="medium" onclick={()=>{fit="width";zoom=1;remember();}}/>
        <Button label={labels.fitHeight} variant="text" size="medium" onclick={()=>{fit="height";zoom=1;remember();}}/>
        <Button label={labels.zoomIn} ariaLabel={labels.zoomIn} variant="text" size="medium" onclick={()=>zoom=Math.min(4,zoom+.2)}/>
        <Button label={labels.zoomOut} ariaLabel={labels.zoomOut} variant="text" size="medium" onclick={()=>zoom=Math.max(.5,zoom-.2)}/>
    </div>
    {#if loading}<div class="reader-state" role="status">{labels.loading}</div>
    {:else if error}<div class="reader-state" role="alert">{error}<Button label={labels.retry} onclick={load}/></div>
    {:else if manifest}
        {#if cached}<p class="reader-cache-notice" role="status">{labels.cached}</p>{/if}
        <div class="reader-canvas" role="region" aria-label={labels.pageAlt.replace("{page}",String(index+1))} tabindex="0" class:continuous={mode==="scroll"} class:fit-height={fit==="height"} bind:this={container} style={`--reader-zoom:${zoom}`} onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={e=>{pointers.delete(e.pointerId);start=undefined;}}>
            {#if mode==="scroll"}
                {#each manifest.pages as p,i (p.page_id)}
                    <div class="reader-frame" style={`aspect-ratio:${p.width}/${p.height}`} use:watch={i}>
                        {#if failed.has(i)}<div class="reader-state" role="alert">{labels.imageError}<Button label={labels.retry} onclick={()=>retry(i)}/></div>
                        {:else if visiblePages.has(i)}<img src={p.url} alt={labels.pageAlt.replace("{page}",String(i+1))} width={p.width} height={p.height} loading="lazy" decoding="async" onerror={()=>imageFailed(i)}/>{/if}
                    </div>
                {/each}
            {:else}
                <div class="reader-spread">
                    {#each ordered as i (manifest.pages[i].page_id)}
                        {@const p=manifest.pages[i]}
                        <div class="reader-frame" style={`aspect-ratio:${p.width}/${p.height}`}>
                            {#if failed.has(i)}<div class="reader-state" role="alert">{labels.imageError}<Button label={labels.retry} onclick={()=>retry(i)}/></div>
                            {:else}<img src={p.url} alt={labels.pageAlt.replace("{page}",String(i+1))} width={p.width} height={p.height} decoding="async" onerror={()=>imageFailed(i)}/>{/if}
                        </div>
                    {/each}
                </div>
            {/if}
        </div>
        <progress value={index+1} max={manifest.page_count} aria-label={labels.progress}></progress>
        <nav class="reader-chapters" aria-label={labels.chapters}>
            {#if previousChapter}<Button href={previousChapter} label={labels.previousChapter} variant="tonal" size="medium"/>{/if}
            <Button href={bookURL} label={labels.chapters} variant="text" size="medium"/>
            {#if nextChapter}<Button href={nextChapter} label={labels.nextChapter} variant="tonal" size="medium"/>{/if}
        </nav>
    {/if}
</section>
<style>
.manga-reader{color:var(--mc-on-surface);font:var(--m3e-type-body-lg);padding:var(--m3e-space-4);border-radius:var(--shape-corner-l);background:var(--mc-surface-container-low)}
.reader-toolbar,.reader-chapters{display:flex;flex-wrap:wrap;align-items:center;gap:var(--m3e-space-2);margin-block-end:var(--m3e-space-3)}
.reader-toolbar label{display:flex;align-items:center;gap:var(--m3e-space-2)}
.reader-jump{display:flex;align-items:center;gap:var(--m3e-space-2);max-width:10rem}.reader-hidden{visibility:hidden;pointer-events:none}
.reader-canvas{overflow:auto;touch-action:none;min-height:40dvh;max-height:calc(100dvh - 12rem);background:var(--mc-surface-container)}
.reader-canvas:focus-visible{outline:2px solid var(--mc-primary);outline-offset:var(--m3e-space-1)}
.reader-canvas.continuous{touch-action:pan-y;max-height:none}.reader-spread{display:flex;align-items:flex-start;justify-content:center;width:calc(100% * var(--reader-zoom));margin-inline:auto}
.reader-frame{position:relative;flex:1;min-width:0;background:var(--mc-surface-container-high)}
.continuous .reader-frame{width:calc(100% * var(--reader-zoom));margin-block-end:var(--m3e-space-2);margin-inline:auto;scroll-margin-block-start:var(--m3e-space-4)}
.reader-frame img{width:100%;height:auto;display:block;user-select:none}
.fit-height .reader-spread{width:max-content;margin-inline:auto}.fit-height .reader-frame img{max-height:calc((100dvh - 15rem) * var(--reader-zoom));width:auto;max-width:none}
.reader-state{display:flex;gap:var(--m3e-space-3);flex-direction:column;align-items:center;justify-content:center;min-height:60dvh;padding:var(--m3e-space-4)}
progress{display:block;width:100%;accent-color:var(--mc-primary);margin-block:var(--m3e-space-3)}
@media(prefers-reduced-motion:reduce){.reader-canvas{scroll-behavior:auto}}
</style>
