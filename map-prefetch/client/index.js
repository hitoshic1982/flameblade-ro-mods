// map-prefetch — load the maps next door while the player is still here.
//
// The client loads a map with at most six downloads at a time, in stages
// (world, ground, ground textures, models, model textures), so a town of a
// few hundred files spends seconds just waiting on round trips. That limit
// lives in the loader's worker, out of a plugin's reach. What a plugin can do
// is fill the browser's HTTP cache ahead of time: the worker's requests for
// the same URLs are then answered locally.
//
// data/neighbors.json lists the maps one warp away and data/files/<map>.json
// the URLs a map load requests (both built by build_manifests.py on the
// server, spelled exactly as the client spells them). After the player has
// been on a map for a while, the neighbours' files are fetched quietly: few
// at a time, at low priority, stopped the moment a map change starts, never
// twice in a session, not at all on metered or slow connections, and within
// a per-session budget.

const START_DELAY_MS = 8000;       // let the current map finish loading first
const PARALLEL = 4;
const MAX_NEIGHBORS = 8;
const BUDGET_BYTES = 300 * 1024 * 1024;

function connectionAllows() {
	const connection = navigator.connection;
	if (!connection) return true;
	if (connection.saveData) return false;
	if (connection.type === 'cellular') return false;
	return !['slow-2g', '2g', '3g'].includes(connection.effectiveType);
}

export default function initialize(parameters, api) {
	if (api?.version !== 1) throw new Error('map-prefetch needs client API 1');
	const base = new URL('./data/', import.meta.url);
	const fetched = new Set();              // URLs already in the cache this session
	const prefetchedMaps = new Set();
	let spent = 0;
	let run = null;                         // { controller, timer } of the current map
	let neighborsLoaded = null;

	const neighborsOf = name => {
		neighborsLoaded ??= fetch(new URL('neighbors.json', base))
			.then(response => response.ok ? response.json() : {})
			.catch(() => ({}));
		return neighborsLoaded.then(graph => (graph[name] || []).slice(0, MAX_NEIGHBORS));
	};

	async function fillCache(urls, signal) {
		const queue = urls.filter(url => !fetched.has(url));
		const worker = async () => {
			while (queue.length && !signal.aborted && spent < BUDGET_BYTES) {
				const url = queue.shift();
				fetched.add(url);
				try {
					const response = await fetch(url, { signal, priority: 'low' });
					// read to the end: only a complete body is kept in the cache
					spent += (await response.arrayBuffer()).byteLength;
				} catch (_) {
					// failed or cut off by a map change: not cached, so try again later
					fetched.delete(url);
					if (signal.aborted) return;
				}
			}
		};
		await Promise.all(Array.from({ length: PARALLEL }, worker));
	}

	async function prefetchAround(name, signal) {
		for (const neighbor of await neighborsOf(name)) {
			if (signal.aborted || spent >= BUDGET_BYTES) return;
			if (prefetchedMaps.has(neighbor)) continue;
			try {
				const response = await fetch(new URL(`files/${encodeURIComponent(neighbor)}.json`, base), { signal });
				if (!response.ok) continue;
				await fillCache(await response.json(), signal);
				if (!signal.aborted) prefetchedMaps.add(neighbor);
			} catch (_) {
				if (signal.aborted) return;       // map change: stop quietly
			}
		}
		console.log('[map-prefetch] around', name, '— cached', Math.round(spent / 1048576), 'MB this session');
	}

	function stop() {
		if (!run) return;
		clearTimeout(run.timer);
		run.controller.abort();
		run = null;
	}

	api.on('map:enter', ({ name }) => {
		stop();
		if (!connectionAllows()) return;
		const map = String(name || '').replace(/\.(gat|rsw)$/i, '');
		prefetchedMaps.add(map);                // the map just loaded is cached already
		const controller = new AbortController();
		run = { controller, timer: setTimeout(() => prefetchAround(map, controller.signal), START_DELAY_MS) };
	});
	api.on('map:leave', stop);
	api.cleanup(stop);
}
