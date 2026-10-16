<script lang="ts">
import { onMount, tick, untrack } from "svelte";
import Button from "@components/atoms/action/Button.svelte";
import Select from "@components/atoms/input/Select.svelte";
import TextField from "@components/atoms/input/TextField.svelte";
import {
	createReaderChapter,
	spreadIndices,
	viewportPages,
	type ReaderChapter,
	type MangaSourcePage,
} from "@/utils/manga-reader";
let {
	pages,
	readingDirection,
	title,
	bookId,
	chapterId,
	labels,
	bookURL,
	previousChapter = "",
	nextChapter = "",
}: {
	pages: MangaSourcePage[];
	readingDirection: "rtl" | "ltr";
	title: string;
	bookId: string;
	chapterId: string;
	labels: Record<string, string>;
	bookURL: string;
	previousChapter?: string;
	nextChapter?: string;
} = $props();
let manifest: ReaderChapter = $state(
		untrack(() => createReaderChapter(pages, readingDirection)),
	),
	loading = $state(true),
	index = $state(0),
	mode = $state("single"),
	direction = $state("rtl"),
	fit = $state("height"),
	zoom = $state(1),
	hidden = $state(false),
	visiblePages: Set<number> = $state(new Set()),
	failed: Set<number> = $state(new Set());
let container: HTMLDivElement;
let observer: IntersectionObserver | undefined;
let prefetch: HTMLImageElement | undefined;
let settings = $state(false),
	fullscreen = $state(false),
	canFullscreen = $state(false),
	frames = new Map<number, HTMLElement>(),
	near = new Set<number>(),
	scrollFrame = 0,
	pan = false;
let jumpText = $state("1"),
	jumpFocused = $state(false);
$effect(() => {
	if (!jumpFocused) jumpText = String(index + 1);
});
const key = untrack(() => `shirone:manga:progress:${bookId}/${chapterId}`);
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
		prefetch.referrerPolicy = "no-referrer";
		prefetch.src = manifest.pages[next].url;
	}
}
function load() {
	direction = readingDirection;
	try {
		const stored = JSON.parse(localStorage.getItem(key) || "null");
		if (stored) {
			index = Math.min(
				manifest.page_count - 1,
				Math.max(0, Math.floor(Number(stored.index) || 0)),
			);
			if (["single", "double", "scroll"].includes(stored.mode))
				mode = stored.mode;
			if (["rtl", "ltr"].includes(stored.direction))
				direction = stored.direction;
			if (["width", "height"].includes(stored.fit)) fit = stored.fit;
		}
	} catch {
		/* Storage is optional. */
	}
	loading = false;
	preload();
	scrollToPage();
}
async function toggleFullscreen() {
	try {
		if (document.fullscreenElement) await document.exitFullscreen();
		else await document.documentElement.requestFullscreen();
	} catch {
		/* Browser policy may deny fullscreen; viewport reading continues. */
	}
}
function fullscreenChanged() {
	fullscreen = Boolean(document.fullscreenElement);
}
function imageLoaded(event: Event, i: number) {
	const img = event.currentTarget as HTMLImageElement;
	if (manifest.pages[i].estimated && img.naturalWidth && img.naturalHeight) {
		manifest.pages[i].width = img.naturalWidth;
		manifest.pages[i].height = img.naturalHeight;
		manifest.pages[i].estimated = false;
		queueViewport();
	}
}
function updateViewport() {
	scrollFrame = 0;
	if (mode !== "scroll" || !manifest) return;
	let candidate = index,
		distance = Infinity;
	for (const [i, node] of frames) {
		const rect = node.getBoundingClientRect();
		const bounds = container.getBoundingClientRect();
		if (rect.bottom > bounds.top && rect.top < bounds.bottom) {
			const d = Math.abs(rect.top - bounds.top);
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
		{ root: container, rootMargin: "500px 0px" },
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
	if (e.key === "Escape") {
		hidden = false;
		settings = false;
	} else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
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
	canFullscreen = Boolean(document.fullscreenEnabled);
	document.addEventListener("fullscreenchange", fullscreenChanged);
	load();
	document.addEventListener("keydown", keyboard);
	window.addEventListener("scroll", queueViewport, { passive: true });
	window.addEventListener("resize", queueViewport);
	let disposed = false;
	const cleanup = () => {
		if (disposed) return;
		disposed = true;
		document.removeEventListener("fullscreenchange", fullscreenChanged);
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

<section class="manga-reader" data-manga-reader aria-label={labels.reader}>
    <header class:reader-hidden={hidden} inert={hidden}>
        <Button href={bookURL} label={labels.chapters} variant="tonal" size="small"/>
        <h1>{title}</h1>
        <button type="button" class="reader-action m3-state-layer" aria-expanded={settings} aria-controls="manga-reader-settings" onclick={()=>settings=!settings}>{labels.settings}</button>
        {#if canFullscreen}<Button label={fullscreen?labels.exitFullscreen:labels.fullscreen} variant="text" onclick={toggleFullscreen}/>{/if}
    </header>
    <div id="manga-reader-settings" class="reader-settings" hidden={!settings||hidden} inert={!settings||hidden}>
        <Select bind:value={mode} label={labels.mode} items={[{value:"single",label:labels.single},{value:"double",label:labels.double},{value:"scroll",label:labels.scroll}]} onchange={()=>{remember();preload();scrollToPage();}}/>
        <Select bind:value={direction} label={labels.direction} items={[{value:"rtl",label:labels.rtl},{value:"ltr",label:labels.ltr}]} onchange={remember}/>
        <Button label={labels.fitWidth} variant={fit==="width"?"tonal":"text"} onclick={()=>{fit="width";zoom=1;remember();}}/>
        <Button label={labels.fitHeight} variant={fit==="height"?"tonal":"text"} onclick={()=>{fit="height";zoom=1;remember();}}/>
        <Button label={labels.zoomOut} variant="text" onclick={()=>zoom=Math.max(.5,zoom-.2)}/>
        <Button label={labels.zoomIn} variant="text" onclick={()=>zoom=Math.min(4,zoom+.2)}/>
    </div>
    {#if loading}
        <div class="reader-state" role="status">{labels.loading}</div>
    {:else}
        <div class="reader-canvas" class:continuous={mode==="scroll"} class:fit-height={fit==="height"} role="region" aria-label={labels.reader} tabindex="0" bind:this={container} style={`--reader-zoom:${zoom}`} onscroll={queueViewport} onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={(e)=>{pointers.delete(e.pointerId);start=undefined;}}>
            {#if mode==="scroll"}
                {#each manifest.pages as page,i (page.page_id)}
                    <div class="reader-frame" style={`aspect-ratio:${page.width}/${page.height}`} use:watch={i}>
                        {#if failed.has(i)}<div class="reader-state" role="alert">{labels.imageError}<Button label={labels.retry} onclick={()=>retry(i)}/></div>
                        {:else if visiblePages.has(i)}<img src={page.url} alt={labels.pageAlt.replace("{page}",String(i+1))} width={page.width} height={page.height} loading="lazy" decoding="async" referrerpolicy="no-referrer" onload={(e)=>imageLoaded(e,i)} onerror={()=>imageFailed(i)}/>{/if}
                    </div>
                {/each}
            {:else}
                <div class="reader-spread" style={`--reader-pages:${ordered.length}`}>
                    {#each ordered as i (manifest.pages[i].page_id)}
                        <div class="reader-frame">
                            {#if failed.has(i)}<div class="reader-state" role="alert">{labels.imageError}<Button label={labels.retry} onclick={()=>retry(i)}/></div>
                            {:else}<img src={manifest.pages[i].url} alt={labels.pageAlt.replace("{page}",String(i+1))} width={manifest.pages[i].width} height={manifest.pages[i].height} loading="lazy" decoding="async" referrerpolicy="no-referrer" onload={(e)=>imageLoaded(e,i)} onerror={()=>imageFailed(i)}/>{/if}
                        </div>
                    {/each}
                </div>
            {/if}
        </div>
    {/if}
    <footer class:reader-hidden={hidden} inert={hidden}>
        <progress max={manifest.page_count} value={index+1} aria-label={labels.progress}></progress>
        <nav aria-label={labels.chapters}>
            {#if previousChapter}<Button href={previousChapter} label={labels.previousChapter} variant="text"/>{/if}
            <Button label={labels.previous} variant="tonal" disabled={index===0} onclick={()=>step(-1)}/>
            <div class="reader-jump"><TextField type="number" label={labels.page} bind:value={jumpText} onfocus={()=>jumpFocused=true} onblur={()=>{jumpFocused=false;select((Number(jumpText)||1)-1);}} onkeydown={(e)=>{if(e.key==="Enter"){jumpFocused=false;select((Number(jumpText)||1)-1);}}}/><span aria-hidden="true">/ {manifest.page_count}</span></div>
            <Button label={labels.next} variant="tonal" disabled={shown.at(-1)===manifest.page_count-1} onclick={()=>step(1)}/>
            {#if nextChapter}<Button href={nextChapter} label={labels.nextChapter} variant="text"/>{/if}
        </nav>
    </footer>
</section>
<style>
.manga-reader{height:100%;display:flex;flex-direction:column;position:relative;background:var(--mc-surface);color:var(--mc-on-surface);isolation:isolate}
header{display:flex;align-items:center;gap:var(--m3e-space-2);padding:var(--m3e-space-2);padding-top:max(var(--m3e-space-2),env(safe-area-inset-top));background:var(--mc-surface-container);z-index:2;min-width:0}
h1{font:var(--m3e-type-title-md);margin:0;min-width:0;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.reader-action{min-height:48px;padding:var(--m3e-space-3);border-radius:var(--shape-corner-m);color:var(--mc-primary);font:var(--m3e-type-label-lg);cursor:pointer}
.reader-settings{position:absolute;top:4.5rem;inset-inline:var(--m3e-space-3);z-index:3;display:flex;flex-wrap:wrap;align-items:center;gap:var(--m3e-space-3);max-height:60%;overflow:auto;padding:var(--m3e-space-4);background:var(--mc-surface-container-high);border:1px solid var(--mc-outline-variant);border-radius:var(--shape-corner-l);box-shadow:var(--elevation-2)}
.reader-settings[hidden]{display:none}
.reader-hidden{display:none}
.reader-canvas{flex:1;min-height:0;overflow:auto;touch-action:none;overscroll-behavior:contain;outline-offset:-3px;background:var(--mc-surface-container-lowest)}
.reader-canvas:focus-visible{outline:3px solid var(--mc-primary)}
.reader-canvas.continuous{touch-action:pan-y pinch-zoom}
.reader-spread{display:flex;align-items:center;justify-content:center;width:calc(100% * var(--reader-zoom));min-height:100%}
.reader-spread .reader-frame{min-width:0;flex:1;align-self:center}
.reader-frame img{width:100%;height:auto;display:block;user-select:none;object-fit:contain}
.fit-height:not(.continuous) .reader-spread{height:calc(100% * var(--reader-zoom));width:max-content;min-width:100%;margin-inline:auto}
.fit-height:not(.continuous) .reader-frame{height:100%;flex:0 1 auto}
.fit-height:not(.continuous) .reader-frame img{height:100%;width:auto;max-width:calc(100dvw / var(--reader-pages) * var(--reader-zoom));object-fit:contain}
.continuous .reader-frame{width:calc(min(100%, 70rem) * var(--reader-zoom));margin-inline:auto;margin-block-end:var(--m3e-space-2);scroll-margin-block-start:0}
.reader-state{display:flex;flex:1;gap:var(--m3e-space-3);flex-direction:column;align-items:center;justify-content:center;min-height:12rem;padding:var(--m3e-space-4)}
footer{background:var(--mc-surface-container);padding:var(--m3e-space-2);padding-bottom:max(var(--m3e-space-2),env(safe-area-inset-bottom))}
nav{display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:var(--m3e-space-2)}
progress{display:block;width:100%;height:.25rem;accent-color:var(--mc-primary);margin-block-end:var(--m3e-space-2)}
.reader-jump{display:flex;align-items:center;gap:var(--m3e-space-2);width:8rem}.reader-jump :global(.m3-text-field){min-width:0}
.reader-jump span{white-space:nowrap}
@media(max-width:600px){h1{font:var(--m3e-type-title-sm)}header{flex-wrap:wrap}header h1{order:-1;flex-basis:100%;text-align:center}.reader-settings{top:8rem}.reader-jump{width:7rem}}
@media(prefers-reduced-motion:reduce){.reader-canvas{scroll-behavior:auto}}
</style>
