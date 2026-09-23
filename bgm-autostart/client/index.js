// bgm-autostart — background music: start it on the player's first
// interaction, and give the player an always-available mute button.
//
// Browsers refuse to play sound before the visitor has interacted with the
// page, so the login music the client starts on arrival is blocked. The
// client only logs that refusal and never retries, which leaves the login
// screen silent until something else happens to restart the music. This
// plugin notes every media element whose play() was refused for lack of a
// user gesture, and plays it again on the first click, tap or key press.
//
// The mute button only sets `muted` on music elements and keeps its own
// preference. It never changes the client's own music setting: the client
// keeps playing and loading tracks, so unmuting works at once, anywhere, with
// no reload. The client's in-game switch (Esc → sound) is left to the client.

const BGM_SOURCE = /\/BGM\/[^/]+\.mp3(?:$|[?#])/i;
const AUDIO_KEY = 'Audio';

const CSS = `
.bgm-toggle {
	position: fixed; top: 6px; left: 50%; transform: translateX(-50%); z-index: 99999;
	width: 36px; height: 36px; padding: 0;
	font-size: 18px; line-height: 36px; text-align: center; cursor: pointer;
	color: #fff; background: rgba(12, 16, 28, 0.7);
	border: 1px solid rgba(255, 255, 255, 0.45); border-radius: 50%;
	box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
}
.bgm-toggle:hover { filter: brightness(1.25); }
.bgm-toggle:focus-visible { outline: 2px solid #9fc0ff; outline-offset: 2px; }
`;

const isMusic = media => BGM_SOURCE.test(media.currentSrc || media.src || '');

// An earlier version of this plugin switched the client's own music setting
// off. Turn it back on once and express that choice as mute instead, so the
// music can be turned on again from the button.
function migrateClientSetting(preferences) {
	if (preferences.get('migrated', false)) return;
	try {
		const audio = JSON.parse(localStorage.getItem(AUDIO_KEY) || 'null');
		if (audio?.BGM?.play === false) {
			audio.BGM.play = true;
			localStorage.setItem(AUDIO_KEY, JSON.stringify(audio));
			preferences.set('muted', true);
		}
		preferences.set('migrated', true);
	} catch (_) { /* storage unavailable: nothing to migrate */ }
}

export default function initialize(parameters, api) {
	if (api?.version !== 1) throw new Error('bgm-autostart needs client API 1');
	const preferences = api.preferences;
	migrateClientSetting(preferences);
	let muted = preferences.get('muted', false);

	const blocked = new Set();
	const music = new Set();                 // music elements seen this session
	const original = HTMLMediaElement.prototype.play;
	const originalPause = HTMLMediaElement.prototype.pause;
	HTMLMediaElement.prototype.play = function play(...args) {
		if (isMusic(this)) {
			music.add(this);
			this.muted = muted;
		}
		const result = original.apply(this, args);
		blocked.delete(this);
		result?.catch?.(error => { if (error?.name === 'NotAllowedError') blocked.add(this); });
		return result;
	};
	// A deliberate pause (music turned off, map change) withdraws the retry.
	HTMLMediaElement.prototype.pause = function pause(...args) {
		blocked.delete(this);
		return originalPause.apply(this, args);
	};

	const events = ['pointerdown', 'keydown', 'touchend'];
	// Stays registered: with nothing blocked it does nothing, and a refused
	// retry is simply noted again and retried on the next interaction.
	function resume() {
		for (const media of [...blocked]) {
			blocked.delete(media);
			// Still wanted: it has a source and was not paused on purpose since.
			if (media.src && media.paused) media.play();
		}
	}
	for (const type of events) window.addEventListener(type, resume, true);

	// ---- mute button, always on screen --------------------------------------
	const style = document.createElement('style');
	style.textContent = CSS;
	document.head.append(style);
	const button = document.createElement('button');
	button.type = 'button';
	button.className = 'bgm-toggle';
	const render = () => {
		button.textContent = muted ? '🔇' : '🔊';
		button.title = muted ? '開啟背景音樂' : '關閉背景音樂';
		button.setAttribute('aria-label', button.title);
		button.setAttribute('aria-pressed', String(muted));
	};
	button.addEventListener('click', event => {
		event.stopPropagation();
		muted = !muted;
		try { preferences.set('muted', muted); } catch (_) { /* kept for this session only */ }
		for (const media of music) media.muted = muted;
		render();
	});
	// The game must not treat the button's clicks and keys as its own input.
	for (const type of ['keydown', 'keyup', 'mousedown', 'pointerdown']) {
		button.addEventListener(type, event => event.stopPropagation());
	}
	render();
	document.body.append(button);

	api.cleanup(() => {
		HTMLMediaElement.prototype.play = original;
		HTMLMediaElement.prototype.pause = originalPause;
		for (const type of events) window.removeEventListener(type, resume, true);
		for (const media of music) media.muted = false;
		blocked.clear();
		music.clear();
		button.remove();
		style.remove();
	});
}
