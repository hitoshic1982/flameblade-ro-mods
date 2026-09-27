// login-box-contrast — make the login window readable on clients whose
// login_interface/bg_login.tga is (nearly) transparent, such as the Taiwan
// 20th-anniversary client. The inputs in WinLoginV2 are transparent and rely on
// that image; this adds a dark panel behind the window, white input boxes and a
// readable label for each field.

const CSS = `
#WinLogin .win_login {
	background: rgba(12, 16, 28, 0.82);
	border: 1px solid rgba(255, 255, 255, 0.35);
	border-radius: 8px;
	box-shadow: 0 6px 24px rgba(0, 0, 0, 0.6);
	box-sizing: border-box;
}
#WinLogin .win_login input {
	background-color: #ffffff !important;
	color: #111 !important;
	border: 1px solid #8a94a8 !important;
	border-radius: 3px;
	height: 18px;
	font-size: 12px;
	left: 60px !important;
	width: 127px !important;
}
#WinLogin .win_login::before,
#WinLogin .win_login::after {
	position: absolute;
	left: 14px;
	color: #f2f2f2;
	font: 12px/18px Arial, sans-serif;
	text-shadow: 0 1px 2px #000;
	pointer-events: none;
}
#WinLogin .win_login::before { content: "帳號"; top: 39px; }
#WinLogin .win_login::after  { content: "密碼"; top: 61px; }
#WinLogin .win_login .save { left: 100px !important; }
/* The Taiwan client has none of the bt_start / bt_join images, so the buttons
   were invisible. Draw them. */
#WinLogin .win_login .btn.connect,
#WinLogin .win_login .btn.signup,
#WinLogin .btn.replay,
#WinLogin .win_login .btn.exit {
	background-color: #2f5fa8 !important;
	border: 1px solid #9fc0ff !important;
	border-radius: 5px;
	color: #fff;
	font: bold 13px/1 Arial, "Microsoft JhengHei", sans-serif;
	cursor: pointer;
}
#WinLogin .win_login .btn.connect { width: 68px !important; height: 44px !important; right: 18px !important; bottom: 40px !important; }
#WinLogin .win_login .btn.connect::after { content: "登入"; font-size: 15px; }
#WinLogin .win_login .btn.signup, #WinLogin .btn.replay { font-size: 12px; color: #fff; background-color: #445 !important; border-color: #889 !important; }
#WinLogin .win_login .btn.exit { width: 22px !important; height: 20px !important; background-color: #833 !important; border-color: #daa !important; }
#WinLogin .win_login .btn.exit::after { content: "✕"; }
#WinLogin .win_login .btn:hover { filter: brightness(1.25); }
#WinLogin .win_login input:-webkit-autofill,
#WinLogin .win_login input:-webkit-autofill:hover,
#WinLogin .win_login input:-webkit-autofill:focus {
	-webkit-text-fill-color: #111;
	box-shadow: inset 0 0 20px 20px #ffffff !important;
}
`;

export default function initialize(parameters, api) {
	if (api?.version !== 1) throw new Error('login-box-contrast needs client API 1');
	const styles = new Map();
	function attach(component) {
		const name = component.name || (component.host && component.host.id) || '';
		if (!/^WinLogin/.test(name) || styles.has(component.host)) return;
		const style = document.createElement('style');
		style.textContent = CSS;
		component.root.append(style);
		styles.set(component.host, style);
	}
	function detach(component) {
		styles.get(component.host)?.remove();
		styles.delete(component.host);
	}
	api.on('ui:append', attach, { replay: true });
	api.on('ui:remove', detach);
	api.cleanup(() => { for (const style of styles.values()) style.remove(); styles.clear(); });
}
