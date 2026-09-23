// easy-signup — create an account from the login window without the "_M"
// suffix trick.
//
// rAthena registers a new account when a login arrives for "name_M" or
// "name_F" and no such account exists. That is invisible and surprising, so
// the login window's Sign Up button opens a small form instead, and this
// plugin performs that login itself on a separate connection. The suffix only
// sets the account's sex, which this client (PACKETVER >= 20151001) never
// uses: every character picks its own sex at creation. "_M" is therefore
// always sent.
//
// On success the name and password are placed in the login window and the
// normal login proceeds, so the saved ID never contains the suffix.

const NAME = /^[A-Za-z0-9]{4,21}$/;          // 23-byte field minus "_M"
const PASS = /^[\x21-\x7e]{4,23}$/;           // printable ASCII, 24-byte field
const LOGIN_ACCEPTED = [0x0069, 0x0276, 0x0ac4];
const REFUSE_LOGIN = 0x006a, REFUSE_LOGIN_R2 = 0x083e;
const TIMEOUT_MS = 10000;

const REASONS = {
	1: '這個帳號名稱已經有人使用，請換一個。',
	3: '伺服器剛建立過帳號，請等 10 秒後再試。',
};

const CSS = `
.easy-signup-overlay {
	position: fixed; inset: 0; z-index: 100000;
	display: flex; align-items: center; justify-content: center;
	background: rgba(0, 0, 0, 0.45);
	font: 13px/1.5 Arial, "Microsoft JhengHei", sans-serif;
}
.easy-signup {
	width: min(300px, calc(100vw - 32px)); box-sizing: border-box; padding: 16px 18px;
	background: rgba(12, 16, 28, 0.95); color: #f2f2f2;
	border: 1px solid rgba(255, 255, 255, 0.35); border-radius: 8px;
	box-shadow: 0 6px 24px rgba(0, 0, 0, 0.6);
}
.easy-signup h2 { margin: 0 0 10px; font-size: 15px; }
.easy-signup label { display: block; margin-top: 8px; }
.easy-signup input {
	display: block; width: 100%; box-sizing: border-box; margin-top: 2px;
	padding: 4px 6px; font-size: 13px; color: #111; background: #fff;
	border: 1px solid #8a94a8; border-radius: 3px;
}
.easy-signup .hint { margin: 2px 0 0; font-size: 11px; color: #aab; }
.easy-signup .message { min-height: 1.5em; margin: 10px 0 0; color: #ffb4a8; }
.easy-signup .message.ok { color: #a8f0b4; }
.easy-signup .buttons { display: flex; gap: 8px; justify-content: flex-end; margin-top: 10px; }
.easy-signup button {
	padding: 5px 14px; font: bold 13px Arial, "Microsoft JhengHei", sans-serif; color: #fff;
	background: #2f5fa8; border: 1px solid #9fc0ff; border-radius: 5px; cursor: pointer;
}
.easy-signup button.cancel { background: #445; border-color: #889; }
.easy-signup button:disabled { opacity: 0.5; cursor: default; }
`;

function loginPacket(account, password, server) {
	const packet = new Uint8Array(55);
	const view = new DataView(packet.buffer);
	view.setUint16(0, 0x0064, true);
	view.setUint32(2, parseInt(server.version, 10) || 0, true);
	for (let i = 0; i < account.length; i++) packet[6 + i] = account.charCodeAt(i);
	for (let i = 0; i < password.length; i++) packet[30 + i] = password.charCodeAt(i);
	packet[54] = parseInt(server.langtype, 10) || 0;
	return packet;
}

// Resolves { ok: true } or { ok: false, code }.
function register(name, password, server) {
	return new Promise(resolve => {
		const socket = new WebSocket(server.socketProxy + server.address + ':' + server.port);
		socket.binaryType = 'arraybuffer';
		const done = result => { clearTimeout(timer); socket.onclose = null; socket.close(); resolve(result); };
		const timer = setTimeout(() => done({ ok: false, code: 'timeout' }), TIMEOUT_MS);
		socket.onopen = () => socket.send(loginPacket(name + '_M', password, server));
		socket.onerror = () => done({ ok: false, code: 'network' });
		socket.onclose = () => done({ ok: false, code: 'network' });
		socket.onmessage = event => {
			const view = new DataView(event.data);
			if (view.byteLength < 3) return done({ ok: false, code: 'network' });
			const id = view.getUint16(0, true);
			if (LOGIN_ACCEPTED.includes(id)) return done({ ok: true });
			if (id === REFUSE_LOGIN) return done({ ok: false, code: view.getUint8(2) });
			if (id === REFUSE_LOGIN_R2 && view.byteLength >= 6) return done({ ok: false, code: view.getUint32(2, true) });
			done({ ok: false, code: 'unexpected' });
		};
	});
}

function reasonText(code) {
	if (REASONS[code]) return REASONS[code];
	if (code === 'timeout' || code === 'network') return '連不上伺服器，請稍後再試。';
	return `建立失敗（代碼 ${code}），請稍後再試或聯絡管理員。`;
}

export default function initialize(parameters, api) {
	if (api?.version !== 1) throw new Error('easy-signup needs client API 1');
	const server = window.ROConfigLocal?.servers?.[0];
	if (!server?.socketProxy) throw new Error('easy-signup needs a server with socketProxy');

	const style = document.createElement('style');
	style.textContent = CSS;
	document.head.append(style);
	let overlay = null;
	const bound = new Map();

	function close() {
		overlay?.remove();
		overlay = null;
	}

	function open(loginRoot) {
		if (overlay) return;
		overlay = document.createElement('div');
		overlay.className = 'easy-signup-overlay';
		overlay.innerHTML = `
			<form class="easy-signup" autocomplete="off">
				<h2>建立新帳號</h2>
				<label>帳號<input name="account" maxlength="21" autocapitalize="off" spellcheck="false"></label>
				<p class="hint">4～21 個英文字母或數字</p>
				<label>密碼<input name="pass" type="password" maxlength="23"></label>
				<p class="hint">4～23 個字元（英數與符號）</p>
				<label>再輸入一次密碼<input name="again" type="password" maxlength="23"></label>
				<p class="message" role="status"></p>
				<div class="buttons">
					<button type="button" class="cancel">取消</button>
					<button type="submit" class="create">建立帳號</button>
				</div>
			</form>`;
		// Keys typed here must not reach the game (Enter would log in, Esc
		// would quit), so they stop at the overlay.
		for (const type of ['keydown', 'keyup', 'keypress', 'mousedown']) {
			overlay.addEventListener(type, event => event.stopPropagation());
		}
		const form = overlay.querySelector('form');
		const message = overlay.querySelector('.message');
		const create = overlay.querySelector('.create');
		const say = (text, ok = false) => { message.textContent = text; message.classList.toggle('ok', ok); };
		overlay.querySelector('.cancel').addEventListener('click', close);
		overlay.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
		form.addEventListener('submit', async event => {
			event.preventDefault();
			const fields = form.elements;
			const name = fields.account.value.trim(), pass = fields.pass.value, again = fields.again.value;
			if (!NAME.test(name)) return say('帳號要 4～21 個英文字母或數字。');
			if (!PASS.test(pass)) return say('密碼要 4～23 個字元，只能用英數與符號。');
			if (pass !== again) return say('兩次輸入的密碼不一樣。');
			create.disabled = true;
			say('建立中……', true);
			const result = await register(name, pass, server);
			create.disabled = false;
			if (!result.ok) return say(reasonText(result.code));
			say('帳號建立成功！正在登入……', true);
			const user = loginRoot.querySelector('.user'), password = loginRoot.querySelector('.pass');
			if (user && password) {
				user.value = name;
				password.value = pass;
			}
			setTimeout(() => { close(); loginRoot.querySelector('.connect')?.click(); }, 800);
		});
		document.body.append(overlay);
		form.elements.account.focus();
	}

	function attach(component) {
		const name = component.name || component.host?.id || '';
		if (!/^WinLogin/.test(name) || bound.has(component.host)) return;
		const button = component.root.querySelector('.signup');
		if (!button) return;
		// Capture phase, so the client's own "No registration URL" prompt
		// never opens.
		const onClick = event => { event.stopImmediatePropagation(); open(component.root); };
		button.addEventListener('click', onClick, true);
		const label = button.textContent;
		if (label.trim()) button.textContent = '建立帳號';
		bound.set(component.host, () => {
			button.removeEventListener('click', onClick, true);
			if (label.trim()) button.textContent = label;
		});
	}

	function detach(component) {
		bound.get(component.host)?.();
		bound.delete(component.host);
		close();
	}

	api.on('ui:append', attach, { replay: true });
	api.on('ui:remove', detach);
	api.cleanup(() => { for (const undo of bound.values()) undo(); bound.clear(); close(); style.remove(); });
}
