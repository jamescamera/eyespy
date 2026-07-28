# Room Ranger

A mobile-first, camera-powered I-spy game for children. An adult scans a room, chooses recognised objects, then hands the phone to the child to find each object through the camera.

## What the prototype includes

- Short private room scan with an optional in-memory replay
- On-device object recognition using TensorFlow.js and COCO-SSD
- Adult review and manual addition of supported object classes
- Easy, Standard and Tricky modes
- Live object matching, points, timer, hints, skips and results
- Camera-free demo mode
- No account, backend, analytics or uploads

## Run locally

Camera APIs work on `localhost` or over HTTPS. Do not open `index.html` directly from the file system.

With Python:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## Publish on GitHub Pages

1. Create a GitHub repository.
2. Upload all files in this folder to the repository root.
3. Open **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Select `main` and `/ (root)`, then save.
6. Open the HTTPS Pages URL on a phone and allow camera access.

GitHub Pages serves static HTML, CSS and JavaScript and supports HTTPS, which is required for browser camera access.

## Privacy model

- The camera stream is processed inside the browser.
- The room scan is not uploaded by this code.
- If supported, the browser creates a temporary replay clip in memory.
- That replay is cleared before the child hunt starts or when the tab closes.
- The TensorFlow.js libraries and model files are loaded from third-party CDNs, so the first use needs an internet connection.

## Important prototype limitations

COCO-SSD recognises a fixed set of common object categories. It can miss objects, confuse similar items, or detect something that is not present. Lighting, camera angle, clutter and device speed affect accuracy. This is a playful prototype, not a safety system.

For a production version, consider a smaller custom model, local model hosting, parental controls, accessibility testing, child-safety review, and explicit consent/privacy copy.

## Files

- `index.html` — interface and screens
- `styles.css` — mobile UI and animations
- `app.js` — camera, scanning, recognition and game logic
- `manifest.webmanifest` — installable-site metadata
- `icon.svg` — app icon

## Licence

MIT. See `LICENSE`.
