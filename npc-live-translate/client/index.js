// npc-live-translate — translate English game text to Traditional Chinese
// (Taiwan) as it appears, using the local Qwen server at D:\LocalAI
// (llama-server, OpenAI-compatible, http://127.0.0.1:8080).
//
// The host's own browser loads the game from http://127.0.0.1:3338 and can
// reach that loopback port directly. A joined friend's browser cannot: their
// 127.0.0.1 is their own machine, not the host's. When loaded from anywhere
// else (the FriendGateway's https invitation origin), requests instead go to
// that same origin's `/_friend/translate/*` proxy, which the gateway forwards
// to the host's loopback AI on the host's own machine. See electron/sharing/
// gateway.js. A friend who joined via a bare LAN address (not the invitation
// link) bypasses that gateway entirely; live translation is simply
// unavailable for them and lines stay English, same as the AI-down case.
//
// Three routes, because roBrowser shows text three ways:
//   1. NpcBox / NpcMenu / ChatBox append one element per line into a
//      `.content` pane -> watched with MutationObserver, translated in place.
//   2. Announce (the red line at the top of the screen) draws on a canvas ->
//      CanvasRenderingContext2D.fillText is wrapped; a cached translation is
//      drawn instead, an uncached one is drawn in English, translated, and the
//      canvas is repainted when the answer arrives.
//   3. Every other window (popups, quest window, input boxes, ...) -> text
//      nodes with English are translated in place, leaving markup untouched.
//
// Windows are found two ways: the app's `ui:append` event, and — because that
// event never fired for NpcBox/NpcMenu on this client build — a MutationObserver
// on document.body plus a one-second sweep, so every shadow host is attached
// no matter how it was shown.
//
// Everything translated is cached in localStorage, so a sentence costs one
// request ever. If the local server is down the text stays English, the lines
// stay queued, and the mod retries every few seconds; a small badge at the
// bottom-left says what is going on.

const HOST_ORIGIN = 'http://127.0.0.1:3338';
const AI_BASE = null;
const ENDPOINT = AI_BASE && AI_BASE + '/v1/chat/completions';
const HEALTH = AI_BASE && AI_BASE + '/health';
const AI_STATUS = '此主機未接本地 AI';
const MODEL = 'qwen3.8-27b';
const CACHE_KEY = 'npc-live-translate.cache.v1';
const CACHE_LIMIT_CHARS = 3000000;
const BATCH_DELAY_MS = 60;
const BATCH_MAX = 40;
const REQUEST_TIMEOUT_MS = 90000;
const RETRY_MS = 8000;
const SWEEP_MS = 1000;

const PANE_COMPONENTS = ['NpcBox', 'NpcMenu', 'ChatBox'];
// Screens and HUD pieces that only show names, numbers or the mods' own
// controls: nothing worth a request, and some of them read their own text.
// `ragnarok-mobile`/`ragnarok-controls` used to be blanket-skipped here too,
// on the assumption they only ever show numbers, icons and their own control
// labels. They also hold the mobile HUD's #target panel — the name shown
// when a monster or NPC is selected — which needsTranslation() below already
// filters safely on its own (pure numbers, coordinates and single-token
// identifiers never qualify), so there is no need to skip the whole host.
const SKIP = /^(WinLogin|WinList|CharSelect|CharCreate|Intro|BasicInfo|MiniMap|ShortCut|StatusIcons|FPS|Emoticons|MobileUI|Joystick|CashShopIcon|ChatBoxSettings|Announce|Escape|WorldMap|Navigation|SkillList|Inventory|Equipment|Storage|Cart|Vending|ChangeCart|Guild|PartyFriends|Achievement|Reputation|CheckAttendance|Roulette|WinStats|ItemInfo|SkillDescription|PlayerViewEquip|ChatRoom|WinLoading|MapName|SwitchEquip)/;

const SYSTEM_PROMPT =
	'你是線上遊戲《仙境傳說 Ragnarok Online》的即時翻譯器。' +
	'把每一行英文遊戲文字翻成台灣繁體中文：NPC 對話用自然口語，選單選項、按鈕與系統訊息簡潔。' +
	'保留 [名稱] 方括號、數字、道具與地圖名稱的專有名詞（可加中文對照）。不要解釋、不要加註。' +
	'輸入是 JSON 字串陣列，輸出必須是同樣長度、同樣順序的 JSON 字串陣列，只輸出 JSON。' +
	'已經是中文或不含英文單字的項目原樣輸出。';

export default function initialize(parameters, api) {
	if (api?.version !== 1) throw new Error('npc-live-translate needs client API 1');

	// ---- cache -------------------------------------------------------------
	let cache = new Map();
	try {
		cache = new Map(Object.entries(JSON.parse(localStorage.getItem(CACHE_KEY) || '{}')));
	} catch (_) { cache = new Map(); }
	let saveTimer = 0;
	function persist() {
		clearTimeout(saveTimer);
		saveTimer = setTimeout(() => {
			try {
				let body = JSON.stringify(Object.fromEntries(cache));
				if (body.length > CACHE_LIMIT_CHARS) {
					cache = new Map([...cache].slice(Math.floor(cache.size / 2)));
					body = JSON.stringify(Object.fromEntries(cache));
				}
				localStorage.setItem(CACHE_KEY, body);
			} catch (_) { /* storage unavailable: keep the in-memory cache */ }
		}, 1500);
	}

	// ---- bundled data files, kept in IndexedDB ---------------------------------
	// dict.json alone is ~10 MB and the server sends plugin files uncacheable,
	// so every session used to download all three again. data-version.json (a
	// few bytes, rewritten by publish.py on every deploy) names each file's
	// hash; a stored copy with the same hash is used without any download.
	// Without the manifest or IndexedDB this falls back to a plain fetch.
	const versions = fetch(new URL('./data-version.json', import.meta.url), { cache: 'no-store' })
		.then(response => response.ok ? response.json() : {})
		.catch(() => ({}));
	const store = new Promise(resolve => {
		try {
			const request = indexedDB.open('npc-live-translate', 1);
			request.onupgradeneeded = () => request.result.createObjectStore('files');
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => resolve(null);
		} catch (_) { resolve(null); }
	});
	const storeRequest = (db, mode, run) => new Promise(resolve => {
		try {
			const request = run(db.transaction('files', mode).objectStore('files'));
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => resolve(undefined);
		} catch (_) { resolve(undefined); }
	});
	async function loadJson(name) {
		const [version, db] = await Promise.all([versions.then(v => v[name]), store]);
		if (version && db) {
			const saved = await storeRequest(db, 'readonly', files => files.get(name));
			if (saved?.version === version) return JSON.parse(saved.text);
		}
		const url = new URL('./' + name, import.meta.url);
		if (version) url.searchParams.set('v', version);
		const response = await fetch(url);
		if (!response.ok) return {};
		const text = await response.text();
		if (version && db) storeRequest(db, 'readwrite', files => files.put({ version, text }, name));
		return JSON.parse(text);
	}

	// ---- bundled dictionary (pre-translated NPC text) -------------------------
	// dict.json sits beside this file and is looked up before the live server.
	const dictionary = new Map();
	// A unit name travels in a 24-byte field, so the client shows at most 23
	// bytes: "Advanced Potion Merchant" arrives as "Advanced Potion Merchan".
	// Every longer key shaped like a name (short, Title Case words, no colour
	// code or sentence punctuation) is also indexed by that cut; sentences are
	// left out so a short line never takes a long sentence's translation. A cut
	// shared by names with different translations is ambiguous and stored as
	// null (no answer).
	const NAME_BYTES = 23;
	const NAME_WORD = /^(?:[A-Z0-9][\w'\-&]*|of|the|and|de|du|la|le|von|van|in|on|at|for|to|a|\([^)]*\)?|\[[^\]]*\]?|#\S*|[-&'])$/;
	const NAME_SHAPE = {
		test: key => key.length <= 40 && !/[\^.,!?:;"~]/.test(key)
			&& key.split(/\s+/).filter(Boolean).every(word => NAME_WORD.test(word)),
	};
	const truncated = new Map();
	const utf8 = new TextEncoder(), utf8Loose = new TextDecoder('utf-8', { fatal: false });
	function cutToNameField(text) {
		const bytes = utf8.encode(text);
		if (bytes.length <= NAME_BYTES) return null;
		// a multi-byte character split by the cut is dropped, not shown as U+FFFD
		return utf8Loose.decode(bytes.subarray(0, NAME_BYTES)).replace(/�$/, '');
	}
	// names.json (optional) holds item and monster names a server builds from
	// its own client with tools/build_names.py; the public release ships
	// without them. It is read only when data-version.json lists it, and the
	// dictionary's own entries win over it.
	const namesLoaded = versions.then(v => (v['names.json'] ? loadJson('names.json') : {})).catch(() => ({}));
	const dictionaryLoaded = Promise.all([loadJson('dict.json'), namesLoaded])
		.then(([dictEntries, names]) => ({ ...names, ...dictEntries }))
		.then(entries => {
			for (const [key, value] of Object.entries(entries)) {
				dictionary.set(key, value);
				// Script text keeps its outer spaces (" ~ Done"), but the boxes
				// look up trimmed text; index the trimmed form too, unless it
				// has an entry of its own.
				const bare = key.trim();
				if (bare !== key && bare && !(bare in entries)) dictionary.set(bare, value.trim());
				const cut = NAME_SHAPE.test(key) ? cutToNameField(key) : null;
				if (cut === null) continue;
				truncated.set(cut, truncated.has(cut) && truncated.get(cut) !== value ? null : value);
			}
			console.log('[npc-live-translate] dictionary entries:', dictionary.size, 'truncated names:', truncated.size);
		})
		.catch(() => { /* no dictionary shipped: live translation only */ });

	// ---- sentence templates (script text joined with values at run time) ------
	// `mes "You need " + .@n + " coins."` never equals a dictionary key, because
	// the number is only known in play. templates.json maps the script's shape,
	// "You need {0} coins.", to its translation, "你需要 {0} 枚硬幣。"; a line the
	// dictionary misses is matched against these, and every captured value is
	// itself looked up (an item or monster name comes back translated).
	const templates = [];
	const HOLE = /\{(\d+)\}/g;
	const COLOR = /\^[0-9A-Fa-f]{6}/g;
	function compileTemplate(source, translated) {
		const literals = source.split(HOLE).filter((_, index) => index % 2 === 0);
		// nothing but holes and colour codes: it would match anything
		if (!literals.join('').replace(COLOR, '').trim()) return;
		// a shape with fewer than two literal words ("Hello, {0}!", "{0} ({1}z)")
		// is weak: on its own it could match an unrelated sentence, so it only
		// applies when every value it captures is a name we know (see below)
		const weak = (literals.join(' ').replace(COLOR, '').match(/[A-Za-z]{2,}/g) || []).length < 2;
		const order = [];
		const pattern = source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\{(\d+)\\\}/g, (_, index) => { order.push(Number(index)); return '(.+?)'; });
		const anchor = literals.reduce((longest, part) => part.length > longest.length ? part : longest, '');
		templates.push({ regex: new RegExp('^' + pattern + '$', 's'), order, anchor, weight: literals.join('').length, weak, translated });
	}
	const templatesLoaded = loadJson('templates.json')
		.then(entries => {
			for (const [source, translated] of Object.entries(entries)) {
				compileTemplate(source, translated);
				// same reason as the dictionary: boxes match trimmed text
				const bare = source.trim();
				if (bare !== source && bare && !(bare in entries)) compileTemplate(bare, translated.trim());
			}
			// most literal text first: the first shape that fits is the most specific
			templates.sort((a, b) => b.weight - a.weight);
			console.log('[npc-live-translate] sentence templates:', templates.length);
		})
		.catch(() => { /* no templates shipped: whole-sentence dictionary only */ });
	// ---- map codes (prontera, gef_fild01) -------------------------------------
	// Scripts sometimes show a raw map code in a menu or a line. maps.json is the
	// Taiwan client's own map name table (mapnametable.txt), code -> name.
	const mapNames = new Map();
	const mapsLoaded = loadJson('maps.json')
		.then(entries => { for (const [code, name] of Object.entries(entries)) mapNames.set(code, name); })
		.catch(() => { /* no map table shipped: codes stay as they are */ });
	const MAP_CODE = /^[a-z0-9@_]+(?:\.(?:gat|rsw))?$/;
	function mapName(text) {
		if (!MAP_CODE.test(text)) return undefined;
		return mapNames.get(text.replace(/\.(gat|rsw)$/, ''));
	}

	let dictionaryReady = Promise.all([dictionaryLoaded, templatesLoaded, mapsLoaded]);

	// Names a weak template may capture besides dictionary entries: the
	// player's own character name (shown in the Basic Info window) and the
	// name of the entity currently selected, usually the NPC being talked to.
	function playerName() {
		for (const host of document.body.children) {
			if (!/^BasicInfo/.test(host.id || '') || !host.shadowRoot) continue;
			const name = host.shadowRoot.querySelector('.name_value');
			if (name && name.textContent.trim()) return name.textContent.trim();
		}
		return '';
	}
	function targetName() {
		try { return api.snapshot?.()?.target?.name || ''; } catch (_) { return ''; }
	}
	// A captured value translated by whole-entry lookups only (never by another
	// template, so matching cannot recurse); undefined when it is no known name.
	function translateValue(value) {
		const known = lookup(value, false);
		if (known !== undefined) return known;
		// "5 Jellopy": a count in front of a name that is an entry itself
		const counted = /^([\d,.]+\s*(?:x\s*)?)(.+)$/.exec(value);
		if (counted) {
			const name = lookup(counted[2], false);
			if (name !== undefined) return counted[1] + name;
		}
		return undefined;
	}
	function isKnownValue(value) {
		const plain = value.replace(COLOR, '').trim();
		if (!/[A-Za-z]{2,}/.test(plain)) return true;          // numbers, symbols
		if (translateValue(value) !== undefined) return true;
		const player = playerName(), target = targetName();
		return (player && plain === player) || (target && plain === target);
	}

	function fillTemplate(text) {
		for (const template of templates) {
			if (!text.includes(template.anchor)) continue;
			const match = template.regex.exec(text);
			if (!match) continue;
			const captured = template.order.map((_, position) => match[position + 1]);
			if (template.weak && !captured.every(isKnownValue)) continue;
			const values = [];
			template.order.forEach((index, position) => {
				const known = translateValue(captured[position]);
				values[index] = known !== undefined ? known : captured[position];
			});
			return template.translated.replace(HOLE, (whole, index) => values[index] !== undefined ? values[index] : whole);
		}
		return undefined;
	}

	// ---- status badge -------------------------------------------------------
	const badge = document.createElement('output');
	badge.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:2000;pointer-events:none;' +
		'font:12px/1.4 "Microsoft JhengHei",Arial,sans-serif;color:#fff;background:#000a;padding:3px 8px;border-radius:4px;display:none';
	document.body.append(badge);
	let badgeTimer = 0;
	function status(text, sticky) {
		badge.textContent = text;
		badge.style.display = text ? 'block' : 'none';
		clearTimeout(badgeTimer);
		if (text && !sticky) badgeTimer = setTimeout(() => { badge.style.display = 'none'; }, 4000);
	}

	// ---- what deserves a request ------------------------------------------
	function needsTranslation(text) {
		if (!text || text.length < 2 || text.length > 600) return false;
		if (/[\u3400-\u9fff]/.test(text)) return false;      // already CJK
		if (!/[A-Za-z]{2,}/.test(text)) return false;         // numbers / symbols only
		// a lowercase token shaped like a map code is looked up in the map table
		// (a miss costs one Map lookup and leaves the text as it is)
		if (MAP_CODE.test(text) && /[a-z]{2}/.test(text)) return true;
		if (!/\s/.test(text)) {
			// a single token: map codes (tha_t01), identifiers, file names
			if (/[0-9_@#\/\\.]/.test(text)) return false;
			if (text.length < 4) return false;
		}
		if (/^[A-Za-z. ]{1,8}:$/.test(text)) return false;    // HUD labels like "Lv :"
		return true;
	}

	// ---- request queue -----------------------------------------------------
	// Each job: { original, apply(translated) }. Nothing is dropped on failure;
	// the queue is retried until the server answers or the page goes away.
	const pending = [];
	let flushTimer = 0;
	let busy = false;
	let disposed = false;
	let failures = 0;

	// One lookup for every route: the bundled dictionary first, then lines the
	// live server already answered. A speaker tag like "[Assistant Alonzo]" is
	// the NPC name in brackets, so it falls back to the bare name's entry.
	function lookup(text, withTemplates = true) {
		if (dictionary.has(text)) return dictionary.get(text);
		if (cache.has(text)) return cache.get(text);
		const map = mapName(text);
		if (map !== undefined) return map;
		// the exact dictionary entry wins over a cut, so this comes after it
		const cut = truncated.get(text);
		if (cut) return cut;
		// script lines sometimes carry stray outer spaces the box keeps
		if (text !== text.trim()) return lookup(text.trim(), withTemplates);
		const tag = /^\[([^\[\]]+)\]$/.exec(text);
		if (tag) {
			const name = lookup(tag[1].trim(), withTemplates);
			if (name !== undefined) return '[' + name + ']';
		}
		return withTemplates ? fillTemplate(text) : undefined;
	}

	function request(original, apply) {
		const known = lookup(original);
		if (known !== undefined) { apply(known); return; }
		// the dictionary may still be loading on the first lines of a session
		dictionaryReady.then(() => {
			const loaded = lookup(original);
			if (loaded !== undefined) { apply(loaded); return; }
			// No AI on this host: a dictionary miss stays English, never queued.
			if (!AI_BASE) return;
			pending.push({ original, apply });
			schedule(BATCH_DELAY_MS);
		});
	}
	function schedule(ms) {
		clearTimeout(flushTimer);
		flushTimer = setTimeout(flush, ms);
	}

	async function flush() {
		if (disposed) return;
		if (busy) { schedule(100); return; }
		if (!pending.length) return;
		busy = true;
		const batch = pending.slice(0, BATCH_MAX);
		try {
			const unique = [...new Set(batch.map(job => job.original))].filter(text => !cache.has(text));
			if (unique.length) {
				status('翻譯中… ' + unique.length + ' 句', true);
				const out = await translate(unique);
				if (out) {
					unique.forEach((text, index) => {
						const value = out[index];
						if (typeof value === 'string' && value.trim()) cache.set(text, value.trim());
					});
					persist();
				}
			}
			// only now leave the queue: a failed request keeps them for the retry
			pending.splice(0, batch.length);
			failures = 0;
			status('');
			for (const job of batch) {
				const translated = cache.get(job.original);
				if (translated) { try { job.apply(translated); } catch (error) { console.warn('[npc-live-translate] apply failed:', error); } }
			}
		} catch (error) {
			failures += 1;
			console.warn('[npc-live-translate] translation request failed (' + failures + '):', error && error.message ? error.message : error);
			const alive = AI_BASE && await healthy();
			status(alive ? '翻譯暫時失敗，稍後重試（' + pending.length + ' 句待翻）' : AI_STATUS + '— ' + pending.length + ' 句等待翻譯', true);
			schedule(RETRY_MS);
		} finally {
			busy = false;
			if (pending.length && failures === 0) schedule(0);
		}
	}

	async function healthy() {
		if (!AI_BASE) return false;
		try {
			const controller = new AbortController();
			const timer = setTimeout(() => controller.abort(), 3000);
			const response = await fetch(HEALTH, { signal: controller.signal });
			clearTimeout(timer);
			return response.ok;
		} catch (_) { return false; }
	}

	async function translate(lines) {
		if (!AI_BASE) throw new Error('no reachable translation endpoint from this origin');
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
		try {
			const response = await fetch(ENDPOINT, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				signal: controller.signal,
				body: JSON.stringify({
					model: MODEL,
					temperature: 0.2,
					max_tokens: 2048,
					chat_template_kwargs: { enable_thinking: false },
					messages: [
						{ role: 'system', content: SYSTEM_PROMPT },
						{ role: 'user', content: JSON.stringify(lines) },
					],
				}),
			});
			if (!response.ok) throw new Error('HTTP ' + response.status);
			const data = await response.json();
			const content = data?.choices?.[0]?.message?.content || '';
			const parsed = parseArray(content, lines.length);
			if (!parsed) throw new Error('unparseable reply');
			return parsed;
		} finally {
			clearTimeout(timer);
		}
	}

	function parseArray(content, expected) {
		const start = content.indexOf('[');
		const end = content.lastIndexOf(']');
		if (start < 0 || end <= start) return null;
		try {
			const parsed = JSON.parse(content.slice(start, end + 1));
			if (!Array.isArray(parsed)) return null;
			if (parsed.length !== expected) console.warn('[npc-live-translate] got', parsed.length, 'lines for', expected);
			return parsed;
		} catch (_) {
			return null;
		}
	}

	// ---- route 1: one element per line (NpcBox, NpcMenu, ChatBox) ---------
	// A box often groups several original script lines (each its own
	// dictionary key) into one paragraph, joined by <br> between text nodes
	// or a literal newline inside one. Looking the whole paragraph up as a
	// single combined string almost never matches a dictionary key, so it
	// fell through to the slower live-AI path -- and paid that delay -- even
	// though every individual line was already covered. Translating each
	// text node's own line(s) instead, the unit the dictionary keys actually
	// are, catches those as instant dictionary hits like everything else.
	function considerLine(node) {
		if (!(node instanceof HTMLElement) || node.dataset.nltOriginal) return;
		if (node.querySelector('input, textarea, ui-button, button, img, canvas, [contenteditable]')) return;
		const text = node.textContent.trim();
		if (!needsTranslation(text)) return;
		node.dataset.nltOriginal = text;
		node.dataset.nltDone = '1';
		node.title = text;
		if (node.querySelector('span[style*="color"]')) considerColoredLine(node);
		else considerTextNodes(node);
	}

	// A script line with ^RRGGBB colour codes reaches the box as nested
	// <span style="color:#rrggbb"> elements (the client never closes them;
	// ^000000 is just another span), so its words are split across several
	// text nodes and no single node equals the dictionary key. Walk the line in
	// document order, cut it at <br> into the original script lines, rebuild
	// each line's source text with its colour codes, and look that up whole.
	const COLOR_CODE = /\^([0-9A-Fa-f]{6})/g;
	function colorOf(span) {
		const match = /color\s*:\s*#([0-9A-Fa-f]{6})/.exec(span.getAttribute('style') || '');
		return match ? match[1] : null;
	}
	function coloredSegments(root) {
		const segments = [];
		let current = { source: '', events: [] };
		const walk = parent => {
			for (const child of parent.childNodes) {
				if (child.nodeType === Node.TEXT_NODE) {
					current.source += child.data;
					current.events.push(child);
				} else if (child instanceof HTMLBRElement) {
					segments.push(current);
					current = { source: '', events: [] };
				} else if (child instanceof HTMLElement) {
					const color = child.tagName === 'SPAN' ? colorOf(child) : null;
					if (color) { current.source += '^' + color; current.events.push(child); }
					walk(child);
				}
			}
		};
		walk(root);
		segments.push(current);
		return segments;
	}
	function renderColored(text) {
		// the same nesting the client builds, from DOM nodes only (no innerHTML)
		const fragment = document.createDocumentFragment();
		let parent = fragment, last = 0, match;
		COLOR_CODE.lastIndex = 0;
		while ((match = COLOR_CODE.exec(text))) {
			if (match.index > last) parent.append(text.slice(last, match.index));
			const span = document.createElement('span');
			span.style.color = '#' + match[1];
			parent.append(span);
			parent = span;
			last = COLOR_CODE.lastIndex;
		}
		if (last < text.length) parent.append(text.slice(last));
		return fragment;
	}
	function considerColoredLine(node) {
		for (const segment of coloredSegments(node)) {
			const source = segment.source;
			const texts = segment.events.filter(event => event.nodeType === Node.TEXT_NODE);
			if (!texts.length || !needsTranslation(source.replace(COLOR_CODE, ''))) continue;
			const colored = /\^[0-9A-Fa-f]{6}/.test(source);
			request(source, translated => {
				if (!texts.every(child => child.isConnected)) return;
				if (colored) {
					const first = segment.events[0];
					first.parentNode.insertBefore(renderColored(translated), first);
					for (const child of texts) child.data = '';
				} else {
					// a line of this box that carries no codes of its own keeps
					// the colour it inherits: its text goes in its first node
					texts.forEach((child, index) => { child.data = index ? '' : translated; });
				}
			});
		}
	}

	// ---- route 3: text nodes anywhere in a window --------------------------
	const NOT_TEXT = 'input, textarea, button, ui-button, script, style, [contenteditable]';
	function considerTextNodes(element) {
		if (!(element instanceof HTMLElement) || element.closest(NOT_TEXT)) return;
		for (const child of element.childNodes) {
			if (child.nodeType !== Node.TEXT_NODE) continue;
			const raw = child.data;
			if (!raw.includes('\n')) {
				const text = raw.trim();
				if (!needsTranslation(text)) continue;
				if (child.nltOriginal === text) continue;
				child.nltOriginal = text;
				request(text, translated => {
					if (!child.isConnected || child.data.trim() !== text) return;
					const lead = raw.match(/^\s*/)[0];
					const tail = raw.match(/\s*$/)[0];
					child.data = lead + translated + tail;
					if (element.isConnected && !element.title) element.title = text;
				});
				continue;
			}
			// Several original lines landed in one text node, joined by a
			// literal newline: translate each on its own -- so a line
			// already in the dictionary or cache never waits on a slower
			// sibling -- then reassemble once every line has an answer.
			if (child.nltOriginal === raw) continue;
			child.nltOriginal = raw;
			const lines = raw.split('\n');
			const results = new Array(lines.length);
			let remaining = lines.length;
			const apply = () => {
				if (!child.isConnected || child.data !== raw) return;
				child.data = results.join('\n');
				if (element.isConnected && !element.title) element.title = raw;
			};
			lines.forEach((line, i) => {
				const text = line.trim();
				if (!needsTranslation(text)) { results[i] = line; if (--remaining === 0) apply(); return; }
				request(text, translated => {
					const lead = line.match(/^\s*/)[0];
					const tail = line.match(/\s*$/)[0];
					results[i] = lead + translated + tail;
					if (--remaining === 0) apply();
				});
			});
		}
	}
	function scanTree(element) {
		considerTextNodes(element);
		if (element instanceof Element) for (const node of element.querySelectorAll('*')) considerTextNodes(node);
	}

	// ---- attaching to windows ---------------------------------------------
	const observers = new Map();   // host element -> MutationObserver

	function attach(host, name) {
		if (!host || !host.shadowRoot || observers.has(host) || !name || SKIP.test(name)) return;
		const root = host.shadowRoot;
		const pane = PANE_COMPONENTS.find(known => name.startsWith(known));
		let observer;
		if (pane) {
			// ChatBox has one .content per tab; NpcBox and NpcMenu have one.
			const panes = Array.from(root.querySelectorAll('.content'));
			if (!panes.length) return;
			observer = new MutationObserver(records => {
				for (const record of records) {
					for (const added of record.addedNodes) {
						if (!(added instanceof HTMLElement)) continue;
						considerLine(added.parentElement && added.parentElement.classList.contains('content') ? added : added.closest('.content > *'));
					}
				}
			});
			for (const each of panes) observer.observe(each, { childList: true });
			for (const each of panes) for (const child of each.children) considerLine(child);
		} else {
			observer = new MutationObserver(records => {
				for (const record of records) {
					if (record.type === 'characterData') {
						if (record.target.parentElement) considerTextNodes(record.target.parentElement);
						continue;
					}
					for (const added of record.addedNodes) {
						if (added.nodeType === Node.ELEMENT_NODE) scanTree(added);
						else if (added.nodeType === Node.TEXT_NODE && added.parentElement) considerTextNodes(added.parentElement);
					}
				}
			});
			observer.observe(root, { childList: true, subtree: true, characterData: true });
			scanTree(root);
		}
		observers.set(host, observer);
		console.debug('[npc-live-translate] watching', name, pane ? 'panes' : 'text nodes');
	}

	function detach(host) {
		observers.get(host)?.disconnect();
		observers.delete(host);
	}

	// The app's event, when it fires...
	api.on('ui:append', component => attach(component.host, component.name || (component.host && component.host.id) || ''), { replay: true });
	api.on('ui:remove', component => detach(component.host));

	// ...and the body itself, for the windows it never reports.
	function sweep() {
		for (const host of document.body.children) {
			if (host.shadowRoot && !observers.has(host)) attach(host, host.id || '');
		}
		for (const host of [...observers.keys()]) if (!host.isConnected) detach(host);
	}
	const bodyObserver = new MutationObserver(() => sweep());
	bodyObserver.observe(document.body, { childList: true });
	const sweepTimer = setInterval(sweep, SWEEP_MS);
	sweep();

	// ---- route 2: canvas-drawn text (the announcement banner, and every
	// floating NPC/monster/player name tag in the game world) ----------------
	// Announce.set resizes its canvas, paints a background and fillText()s each
	// wrapped line. Entity name tags work the same way, one small canvas per
	// visible entity (class `entity-display`, positioned by an `entity-overlay`
	// wrapper div outside any shadow root — unlike Announce, which lives inside
	// a shadow host named `Announce...`). Everything drawn on either kind of
	// canvas is recorded so it can be repainted with the translation once it
	// arrives; the per-canvas journal already keys off the canvas instance, so
	// many simultaneous entity tags don't interfere with each other.
	//
	// Caveat: an entity tag's canvas is sized to fit the original English text
	// before this hook ever sees it, so a longer Chinese translation can run
	// past the canvas edge. Still far better than staying in English.
	const proto = CanvasRenderingContext2D.prototype;
	const native = { fillText: proto.fillText, strokeText: proto.strokeText, fillRect: proto.fillRect, clearRect: proto.clearRect };
	const journals = new WeakMap();   // canvas -> [{ op, args, style }]
	let repainting = false;

	function isAnnounceCanvas(canvas) {
		const root = canvas.getRootNode && canvas.getRootNode();
		const host = root && root.host;
		return !!host && /^Announce/.test(host.id || '');
	}
	function isTranslatableCanvas(canvas) {
		return (canvas.classList && canvas.classList.contains('entity-display')) || isAnnounceCanvas(canvas);
	}
	function styleOf(ctx) {
		return { font: ctx.font, fillStyle: ctx.fillStyle, strokeStyle: ctx.strokeStyle, textAlign: ctx.textAlign, textBaseline: ctx.textBaseline, globalAlpha: ctx.globalAlpha, lineWidth: ctx.lineWidth };
	}
	function record(ctx, op, args) {
		const canvas = ctx.canvas;
		let journal = journals.get(canvas);
		// A full-size fillRect / clearRect is the start of a new announcement.
		const wipes = (op === 'fillRect' || op === 'clearRect') && args[0] === 0 && args[1] === 0 && args[2] >= canvas.width && args[3] >= canvas.height;
		if (!journal || wipes) { journal = []; journals.set(canvas, journal); wholeAnnounce.delete(canvas); }
		journal.push({ op, args: Array.from(args), style: styleOf(ctx) });
	}

	// Announce.set word-wraps a sentence into several fillText() lines before
	// drawing, so no single line equals a dictionary key. The lines of one
	// announcement are drawn in one synchronous call; once it returns, join
	// them back into the sentence, and on a hit redraw the whole banner in
	// Chinese, wrapped by character to the width the English was given.
	const wholeAnnounce = new WeakSet();   // canvases showing a whole-sentence translation
	const announceQueued = new WeakSet();
	function queueAnnounce(canvas) {
		if (announceQueued.has(canvas)) return;
		announceQueued.add(canvas);
		queueMicrotask(() => {
			announceQueued.delete(canvas);
			const journal = journals.get(canvas);
			if (!journal) return;
			const sentence = journal.filter(entry => entry.op === 'fillText').map(entry => String(entry.args[0]).trim()).join(' ');
			if (!needsTranslation(sentence)) return;
			const draw = () => {
				const translated = lookup(sentence);
				if (translated !== undefined && journals.get(canvas) === journal) drawAnnounce(canvas, journal, translated);
			};
			if (lookup(sentence) !== undefined) draw();
			else dictionaryReady.then(draw);
		});
	}
	function wrapByWidth(ctx, text, width) {
		// keep Latin words and numbers whole; break anywhere else
		const tokens = text.match(/[A-Za-z0-9'’.,\-]+|\s+|./gu) || [];
		const lines = [];
		let line = '';
		for (const token of tokens) {
			if (line && ctx.measureText(line + token).width > width) {
				lines.push(line.trim());
				line = /^\s+$/.test(token) ? '' : token;
			} else line += token;
		}
		if (line.trim()) lines.push(line.trim());
		return lines;
	}
	function drawAnnounce(canvas, journal, translated) {
		const background = journal.find(entry => entry.op === 'fillRect');
		const texts = journal.filter(entry => entry.op === 'fillText');
		if (!texts.length) return;
		const style = texts[0].style;
		const fontSize = parseInt(style.font, 10) || 12;
		const ctx = canvas.getContext('2d');
		ctx.font = style.font;
		const lines = wrapByWidth(ctx, translated, Math.max(canvas.width - 20, fontSize));
		const height = 10 + (fontSize + 5) * lines.length;
		repainting = true;
		try {
			if (height > canvas.height) canvas.height = height;   // resizing resets the context state
			native.clearRect.call(ctx, 0, 0, canvas.width, canvas.height);
			if (background) {
				Object.assign(ctx, background.style);
				native.fillRect.call(ctx, 0, 0, canvas.width, canvas.height);
			}
			Object.assign(ctx, style);
			const centered = style.textAlign === 'center';
			lines.forEach((line, index) => {
				if (centered) native.fillText.call(ctx, line, canvas.width / 2, canvas.height / 2 + (index - (lines.length - 1) / 2) * (fontSize + 5));
				else native.fillText.call(ctx, line, 10, 5 + fontSize + (fontSize + 5) * index);
			});
		} finally {
			repainting = false;
		}
		wholeAnnounce.add(canvas);
	}

	function repaint(canvas) {
		const journal = journals.get(canvas);
		if (!journal || wholeAnnounce.has(canvas)) return;
		const ctx = canvas.getContext('2d');
		repainting = true;
		try {
			native.clearRect.call(ctx, 0, 0, canvas.width, canvas.height);
			for (const entry of journal) {
				Object.assign(ctx, entry.style);
				const args = entry.args.slice();
				// a dictionary hit never enters `cache`, so repaint through lookup()
				const translated = (entry.op === 'fillText' || entry.op === 'strokeText') ? lookup(String(entry.args[0])) : undefined;
				if (translated !== undefined) args[0] = translated;
				native[entry.op].apply(ctx, args);
			}
		} finally {
			repainting = false;
		}
	}
	function wrapText(op) {
		return function (text, ...rest) {
			if (!repainting && isTranslatableCanvas(this.canvas)) {
				record(this, op, [text, ...rest]);
				if (op === 'fillText' && isAnnounceCanvas(this.canvas)) queueAnnounce(this.canvas);
				const original = String(text);
				if (needsTranslation(original)) {
					const known = lookup(original);
					if (known !== undefined) return native[op].call(this, known, ...rest);
					const canvas = this.canvas;
					request(original, () => { if (canvas.isConnected) repaint(canvas); });
				}
			}
			return native[op].call(this, text, ...rest);
		};
	}
	function wrapRect(op) {
		return function (...args) {
			if (!repainting && isTranslatableCanvas(this.canvas)) record(this, op, args);
			return native[op].apply(this, args);
		};
	}
	proto.fillText = wrapText('fillText');
	proto.strokeText = wrapText('strokeText');
	proto.fillRect = wrapRect('fillRect');
	proto.clearRect = wrapRect('clearRect');

	api.cleanup(() => {
		disposed = true;
		clearTimeout(flushTimer);
		clearInterval(sweepTimer);
		bodyObserver.disconnect();
		for (const observer of observers.values()) observer.disconnect();
		observers.clear();
		Object.assign(proto, native);
		badge.remove();
	});
	console.log('[npc-live-translate] ready, cached lines:', cache.size);
}
