// webkit-canvas-fix — draw 2D sprite layers correctly on iPhone and iPad.
//
// The client draws a character on a 2D canvas (the character-select slots)
// one layer at a time: each layer is written into one shared scratch canvas
// with putImageData, then copied onto the slot with drawImage. On iOS WebKit
// (every iOS browser) that copy can pick up the scratch canvas's previous
// content, so a later layer is drawn with an earlier layer's pixels: Mohan's
// staff was drawn as a second head. Desktop browsers and the WebGL map are
// not affected.
//
// On iOS only, a canvas written with putImageData and not shown on the page
// is remembered with that image; when it is used as a drawImage source, the
// image is put into a fresh canvas from a ring and that one is drawn instead,
// so no canvas is read back right after being rewritten. Any other drawing
// into the scratch canvas forgets the remembered image, so the plugin never
// replaces content it did not see being written.
//
// pars.force (optional, for testing) turns it on outside iOS.

const RING = 64;          // more than the layers drawn in one frame
const IOS = /iP(hone|ad|od)/.test(navigator.userAgent) ||
	(navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export default function initialize(parameters, api) {
	if (api?.version !== 1) throw new Error('webkit-canvas-fix needs client API 1');
	if (!IOS && parameters?.force !== true) return;

	const proto = CanvasRenderingContext2D.prototype;
	const original = {
		putImageData: proto.putImageData,
		drawImage: proto.drawImage,
		clearRect: proto.clearRect,
		fillRect: proto.fillRect,
	};
	const written = new WeakMap();     // hidden canvas -> [imageData, ...dirty rect]
	const ring = Array.from({ length: RING }, () => document.createElement('canvas'));
	let next = 0;

	proto.putImageData = function (imageData, ...rest) {
		original.putImageData.call(this, imageData, ...rest);
		if (!this.canvas.isConnected) written.set(this.canvas, [imageData, ...rest]);
		else written.delete(this.canvas);
	};
	proto.drawImage = function (source, ...rest) {
		written.delete(this.canvas);   // this canvas now holds pixels we did not record
		const image = source instanceof HTMLCanvasElement ? written.get(source) : undefined;
		if (!image) return original.drawImage.call(this, source, ...rest);
		const copy = ring[next];
		next = (next + 1) % RING;
		copy.width = source.width;       // also clears it
		copy.height = source.height;
		original.putImageData.call(copy.getContext('2d'), ...image);
		return original.drawImage.call(this, copy, ...rest);
	};
	for (const name of ['clearRect', 'fillRect'])
		proto[name] = function (...args) {
			written.delete(this.canvas);
			return original[name].apply(this, args);
		};

	api.cleanup(() => Object.assign(proto, original));
}
