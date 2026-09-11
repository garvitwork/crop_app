# CropGuard — Frontend

## 1. Problem Statement

Farmers usually notice crop diseases or pest attacks only after visible damage has already spread. Extension officers cover large areas and cannot reach every farm quickly. Weather, soil, and local pest history all affect risk, but farmers rarely get this combined into one simple alert. Wrong self-diagnosis leads to wrong pesticide use, wasted money, and crop loss.

**Goal of the frontend:** give a farmer a simple screen where they take one photo of a leaf and instantly get — a disease/pest diagnosis, the current weather-based risk for their area, a plain-language treatment plan (in English and Marathi), and a way to reach expert help if needed. Also give agriculture officials a live dashboard to see risk and outbreaks across many districts at once.

## 2. Tech Stack

| Layer | Tool | Why |
|---|---|---|
| UI framework | React (Vite) | fast dev server, component-based UI |
| Styling | Plain inline CSS-in-JS + one global `<style>` block | no extra build tooling needed, full control over animations |
| Hosting | GitHub Pages | free, works well for a static Vite build |
| CI/CD | GitHub Actions | auto-builds and deploys on every push to `main` |
| Voice output | Browser's built-in Web Speech API | zero cost, no extra library, works offline once loaded |
| Maps | Folium-generated HTML (from backend), shown in an `<iframe>` | no map API key needed |
| Backend communication | `fetch()` calls to a FastAPI backend hosted on Render | simple REST calls, JSON in/out |

No component library, no CSS framework, no router library was used — everything is one `App.jsx` file with page sections toggled by React state. This kept the app light and easy to deploy as a single static site.

## 3. What the Frontend Actually Does

### Farmer-facing side
- **Photo capture** — two ways to give a photo: `Take Photo` (opens the phone camera directly using `capture="environment"`) or `Choose image` (gallery). The hero section's scanning animation is itself clickable and opens the camera.
- **Client-side image resize** — a big camera photo (often 5–15 MB) is automatically shrunk to a max of 1024px on a `<canvas>` before upload, so it doesn't crash low-memory phones.
- **Analyze flow** — sends the photo + selected crop + selected district to the backend `/analyze` endpoint, shows a loading state, then renders the result.
- **Result card** — a circular confidence ring (color changes red → gold → green based on confidence), the exact disease detected, a colored risk pill for the district's current weather risk, live temperature/humidity, and simulated sensor alerts.
- **Crop mismatch warning** — if the farmer selected "Tomato" but the AI thinks the photo is a "Potato" leaf, a clear warning banner appears so they don't blindly trust a wrong label.
- **Expert advisory cards** — the AI's advice text is automatically split into labeled cards (Diagnosis Validation, Management Recommendation, Local Support, Marathi Summary) with icons, instead of one wall of text.
- **Voice advisory** — two buttons, "Listen (English)" and "ऐका (मराठी)", read the advisory aloud using the browser's speech engine — built for farmers who may not read comfortably.
- **Image validation feedback** — if the backend says the photo isn't a valid leaf/crop image (or confidence is too low), the frontend shows a clear toast message asking for a retake, instead of showing a wrong result.
- **Wake API button** — since the free backend hosting sleeps when idle, this button pings the server to wake it up before the farmer scans, avoiding a confusing failed first request.

### Officials-facing side (separate "Officials Dashboard" view)
- **Live ticker bar** — a scrolling strip under the navbar showing real numbers (total scans processed, districts monitored, how many are at HIGH risk right now) pulled live from the backend, not fake placeholder numbers.
- **KPI summary strip** — total field scans logged, average model confidence, count of high-risk districts, most-detected disease.
- **Outbreak cluster panel** — the headline feature. It shows when 3 or more different farmers report the same disease in the same district within 6 hours, flagging it as an early outbreak signal. When nothing is active, it still shows a "monitoring" status so it's clear the feature is working, not missing.
- **District risk cards** — one card per district with live weather risk, temperature, humidity, and a trend arrow (↗ rising / ↘ falling) comparing this reading to the previous one.
- **Priority intervention zones** — districts that are simultaneously HIGH weather risk and have severe outbreak activity, called out separately so officials know where to act first.
- **Recent field submissions table** — a live, filterable, searchable, sortable table of every real analysis performed by any farmer, with a CSV export button for officials to download the data.
- **Hotspot map** — an embedded map (built by the backend with Folium) showing geographic disease hotspots, plus a ranked "Top 8 hotspots" card grid next to it.

### General polish
- Fully green theme, page stretched edge-to-edge (fixed an early bug where Vite's default `#root` CSS was centering and capping the page width).
- Scroll-reveal animations (`Reveal` component using `IntersectionObserver`) so sections fade in as the user scrolls.
- Ambient drifting glow blobs in the background for atmosphere (kept lightweight after they caused a mobile memory warning).
- Responsive layout — grids collapse to a single column under 760px, font sizes use `clamp()` so they scale smoothly instead of jumping at breakpoints, nav links hide on small screens.
- Custom scrollbar, hover glow effects on buttons and cards, pulsing "live" indicators.

## 4. Challenges Faced and How They Were Solved

| Challenge | Fix |
|---|---|
| Page content was narrow with big empty margins | Vite's default `index.css` had `#root { max-width: 1280px; margin: 0 auto }` — overrode it globally in the app's own `<style>` tag. |
| Blank white/black screen crash on the deployed site | A JS error (`insights.map is not a function`) from an API call pointing to the wrong URL — fixed the endpoint and added safe fallbacks (`.catch(() => setX([]))`) everywhere data is fetched. |
| Backend "Analyze" button did nothing on the live site | The code was still calling `127.0.0.1:8000` (localhost) — had to be updated to the real deployed backend URL after each redeploy. |
| Camera photo upload crashed with "low memory" on some phones | Large camera images (multi-MB) plus heavy background blur effects were too much for weak devices — added canvas-based image downscaling before upload and reduced the blur/blob sizes. |
| Advisory sometimes showed as one unformatted paragraph | The AI (Gemini/Groq) didn't always format its answer the same way — wrote a text parser (`parseAdvisory`) that recognizes section headings in multiple formats, with a raw-text fallback so nothing ever renders blank. |
| Voice button pressed but no sound | Chrome loads its voice list asynchronously and has a known bug when `cancel()` and `speak()` are called back-to-back — fixed by waiting for voices to load and adding a small delay before speaking. |
| Wrong crop label shown for a correct AI diagnosis | The UI was displaying the farmer's manually selected crop instead of what the AI actually detected — fixed by showing the AI's real detected class and adding a separate mismatch warning when the two disagree. |
| Nothing visible in the Officials Dashboard for new/first-time judges | The outbreak-cluster feature only appears once enough real data exists — added an always-visible "monitoring" status state so the feature is provably working even with zero clusters yet. |
| Mobile layout unusable (fixed grid columns, huge headline text) | Added responsive CSS: grid columns collapse to one column under 760px via a media query, and headline/section font sizes use `clamp()` to scale with screen width. |
| GitHub Pages deploying the wrong content (old map instead of the new app) | The Pages source was set to "Deploy from a branch" pointing at the auto-generated `gh-pages` branch, but the custom GitHub Actions workflow hadn't actually committed/pushed correctly the first few times — fixed by confirming the workflow file's exact path (`.github/workflows/deploy.yml`) and re-pushing. |

## 5. Running Locally

```
cd crop-frontend
npm install
npm run dev
```
Opens at `http://localhost:5173`. The backend must also be running separately (`uvicorn app:app --host 0.0.0.0 --port 8000` from the project root) for the Analyze feature to work.

## 6. Deployment

Every push to `main` triggers a GitHub Actions workflow that builds the Vite app and publishes it to the `gh-pages` branch, which GitHub Pages serves automatically. No manual deploy step needed.
