// welcome-message — the server's welcome lines, placed in the chat box once
// the player is on a map.
//
// rAthena sends its MOTD while the first map is still loading, before the
// chat box exists, so the lines flash over the loading screen and are gone.
// This plugin waits for the first map of each login and appends the lines to
// every chat tab the way the client appends its own messages (one coloured
// <div> per line), where they stay and can be scrolled back to.
//
// The text is configuration: pars.lines in Config.local.js. pars.color is
// optional (default light green, the colour rAthena's motd_type 1 uses).

const DEFAULT_COLOR = '#88FF88';

export default function initialize(parameters, api) {
	if (api?.version !== 1) throw new Error('welcome-message needs client API 1');
	const lines = Array.isArray(parameters?.lines) ? parameters.lines.map(String).filter(Boolean) : [];
	if (!lines.length) return;
	const color = typeof parameters.color === 'string' ? parameters.color : DEFAULT_COLOR;

	let chatRoot = null;
	let shownThisLogin = false;
	let waitingForMap = false;

	function show() {
		const tabs = chatRoot?.querySelectorAll('.content[data-content]');
		if (!tabs?.length) return false;
		for (const content of tabs) {
			const atBottom = content.scrollTop + content.offsetHeight >= content.scrollHeight - 5;
			for (const line of lines) {
				const div = document.createElement('div');
				div.style.color = color;
				div.textContent = line;
				content.appendChild(div);
			}
			if (atBottom) content.scrollTop = content.scrollHeight;
		}
		return true;
	}

	function tryShow() {
		if (shownThisLogin || !waitingForMap) return;
		if (show()) {
			shownThisLogin = true;
			waitingForMap = false;
		}
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
		if (shownThisLogin) return;
		waitingForMap = true;
		tryShow();
	});
	// A new login (after a disconnect or returning to the login screen) greets again.
	api.on('connection', ({ status }) => {
		if (status !== 'connected') {
			shownThisLogin = false;
			waitingForMap = false;
		}
	});
}
