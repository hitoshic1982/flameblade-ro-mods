// welcome-message — the server's welcome lines, placed in the chat box once
// the player is on a map.
//
// The client enters the map before it asks the server for the login
// messages, so anything placed in the chat box at map:enter is immediately
// followed by the server's own lines and scrolls out of a short chat box.
// This plugin waits SHOW_DELAY_MS after the first map of each login, then
// appends the lines to every chat tab the way the client appends its own
// messages (one coloured <div> per line) and scrolls each tab to the bottom,
// so the greeting is the last thing in the chat and can be scrolled back to.
//
// The text is configuration: pars.lines in Config.local.js. pars.color is
// optional (default light green, the colour rAthena's motd_type 1 uses).

const DEFAULT_COLOR = '#88FF88';
const SHOW_DELAY_MS = 2000;

export default function initialize(parameters, api) {
	if (api?.version !== 1) throw new Error('welcome-message needs client API 1');
	const lines = Array.isArray(parameters?.lines) ? parameters.lines.map(String).filter(Boolean) : [];
	if (!lines.length) return;
	const color = typeof parameters.color === 'string' ? parameters.color : DEFAULT_COLOR;

	let chatRoot = null;
	let shownThisLogin = false;
	let due = false;      // the delay after this login's first map has passed
	let timer = null;

	function show() {
		const tabs = chatRoot?.querySelectorAll('.content[data-content]');
		if (!tabs?.length) return false;
		for (const content of tabs) {
			for (const line of lines) {
				const div = document.createElement('div');
				div.style.color = color;
				div.textContent = line;
				content.appendChild(div);
			}
			content.scrollTop = content.scrollHeight;
		}
		return true;
	}

	function tryShow() {
		if (shownThisLogin || !due) return;
		if (show()) shownThisLogin = true;
	}

	function reset() {
		clearTimeout(timer);
		timer = null;
		shownThisLogin = false;
		due = false;
	}

	api.on('ui:append', component => {
		if ((component.name || component.host?.id) !== 'ChatBox') return;
		chatRoot = component.root;
		tryShow();
	}, { replay: true });
	api.on('ui:remove', component => {
		if (component.root === chatRoot) chatRoot = null;
	});
	api.on('map:enter', () => {
		if (shownThisLogin || timer) return;
		timer = setTimeout(() => {
			due = true;
			tryShow();
		}, SHOW_DELAY_MS);
	}, { replay: true });
	// A new login (after a disconnect or returning to the login screen) greets again.
	api.on('connection', ({ status }) => {
		if (status !== 'connected') reset();
	});
	api.cleanup(reset);
}
