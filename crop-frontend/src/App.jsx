import { useState, useRef } from "react";

const C = { bg: "#07140d", card: "#0e1f15", border: "#1a2e22", green: "#4ade80", muted: "#999" };

const threats = [
  { crop: "Tomato", name: "Early Blight", desc: "Warm, humid conditions and prolonged leaf wetness.", prevent: "Remove infected leaves, avoid overhead watering, apply Mancozeb 2g/L as preventive spray, rotate crops yearly." },
  { crop: "Rice", name: "Blast", desc: "High humidity, dense canopy and favourable weather.", prevent: "Use resistant varieties, avoid excess nitrogen, apply Tricyclazole at first symptom, maintain field drainage." },
  { crop: "Wheat", name: "Yellow Rust", desc: "Cool, humid conditions favour rust development.", prevent: "Sow resistant varieties, monitor early, apply Propiconazole if pustules appear, avoid late sowing." },
  { crop: "Cotton", name: "Aphid Pressure", desc: "Aphids thrive under suitable weather and tender growth.", prevent: "Use yellow sticky traps, encourage ladybird beetles, spray Neem oil, avoid excess nitrogen fertilizer." },
];

const steps = [
  { n: "01", t: "Capture", h: "Take a clear photo", d: "Guided upload for a leaf, fruit or crop symptom." },
  { n: "02", t: "Screen", h: "Detect the likely threat", d: "Trained vision model returns a disease/pest candidate with confidence." },
  { n: "03", t: "Explain", h: "Make it understandable", d: "Weather risk + Gemini-based advisory in simple language." },
  { n: "04", t: "Act", h: "Follow up locally", d: "Hotspot map and sensor data track and help prevent spread." },
];

const insights = [
  { region: "Uttar Pradesh", risk: "Leaf disease", pct: 74 },
  { region: "West Bengal", risk: "Rice blast", pct: 68 },
  { region: "Assam", risk: "Pest pressure", pct: 61 },
  { region: "Maharashtra", risk: "Fungal risk", pct: 47 },
  { region: "Karnataka", risk: "Water stress", pct: 29 },
];

function App() {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [district, setDistrict] = useState("Pune");
  const [crop, setCrop] = useState("Tomato");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [modal, setModal] = useState(null);
  const [lang, setLang] = useState("English");
  const [toast, setToast] = useState(null);

  const scanRef = useRef(null);
  const howRef = useRef(null);
  const insightsRef = useRef(null);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const setImage = (f) => {
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
    showToast("Image loaded");
  };

  const analyze = async () => {
    if (!file) return showToast("Please upload an image first");
    setLoading(true);
    setResult(null);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("district", district);
    formData.append("crop", crop);
    try {
      const res = await fetch("http://127.0.0.1:8000/analyze", { method: "POST", body: formData });
      const data = await res.json();
      setResult(data);
      showToast("Analysis complete");
    } catch {
      showToast("Backend not reachable — run uvicorn app:app --reload");
    }
    setLoading(false);
  };

  const S = {
    page: { background: C.bg, color: "#fff", minHeight: "100vh", fontFamily: "Arial, sans-serif" },
    nav: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 60px", borderBottom: `1px solid ${C.border}`, position: "sticky", top: 0, background: C.bg, zIndex: 10 },
    navLink: { color: "#ccc", cursor: "pointer", fontSize: 14, transition: "color .2s" },
    btn: { background: C.green, color: C.bg, border: "none", padding: "10px 20px", borderRadius: 8, fontWeight: "bold", cursor: "pointer" },
    outlineBtn: { background: "transparent", border: `1px solid ${C.green}`, color: C.green, padding: "10px 20px", borderRadius: 8, cursor: "pointer", fontWeight: "bold" },
    section: { padding: "60px" },
    tag: { color: C.green, fontSize: 13, letterSpacing: 1, marginBottom: 8 },
    title: { fontSize: 36, fontWeight: "bold", marginBottom: 15 },
    desc: { color: "#aaa", maxWidth: 600, marginBottom: 30 },
    grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 20 },
    card: { background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, cursor: "pointer", transition: "transform .2s, border-color .2s" },
  };

  return (
    <div style={S.page}>
      {toast && (
        <div style={{ position: "fixed", bottom: 20, right: 20, background: C.green, color: C.bg, padding: "12px 20px", borderRadius: 8, fontWeight: "bold", zIndex: 100 }}>
          {toast}
        </div>
      )}

      {modal && (
        <div onClick={() => setModal(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 30, maxWidth: 400 }}>
            <div style={{ color: C.green, fontSize: 13 }}>{modal.crop}</div>
            <div style={{ fontSize: 24, fontWeight: "bold", margin: "8px 0" }}>{modal.name}</div>
            <div style={{ color: "#aaa", marginBottom: 15 }}>{modal.desc}</div>
            <div style={{ color: C.green, fontSize: 13, marginBottom: 6 }}>PREVENTION</div>
            <div style={{ color: "#ddd" }}>{modal.prevent}</div>
            <button style={{ ...S.outlineBtn, marginTop: 20, width: "100%" }} onClick={() => setModal(null)}>Close</button>
          </div>
        </div>
      )}

      {/* NAV */}
      <div style={S.nav}>
        <div style={{ fontSize: 22, fontWeight: "bold" }}>Crop<span style={{ color: C.green }}>Guard</span></div>
        <div style={{ display: "flex", gap: 30 }}>
          <span style={S.navLink} onClick={() => scanRef.current.scrollIntoView({ behavior: "smooth" })}>Scan</span>
          <span style={S.navLink} onClick={() => howRef.current.scrollIntoView({ behavior: "smooth" })}>How it works</span>
          <span style={S.navLink} onClick={() => insightsRef.current.scrollIntoView({ behavior: "smooth" })}>Insights</span>
          <span style={S.navLink} onClick={() => setLang(lang === "English" ? "मराठी" : "English")}>🌐 {lang}</span>
        </div>
        <button style={S.btn} onClick={() => scanRef.current.scrollIntoView({ behavior: "smooth" })}>📷 Scan a crop</button>
      </div>

      {/* HERO */}
      <div style={{ ...S.section, maxWidth: 700 }}>
        <div style={S.tag}>● SIH26131 · AGRICULTURE</div>
        <div style={{ fontSize: 48, fontWeight: "bold", lineHeight: 1.1 }}>Catch crop threats <span style={{ color: C.green }}>before they spread.</span></div>
        <div style={S.desc}>A farmer-first crop health assistant — photo diagnosis, weather risk, hotspot mapping and expert AI advisory, built for Maharashtra.</div>
        <div style={{ display: "flex", gap: 15 }}>
          <button style={S.btn} onClick={() => scanRef.current.scrollIntoView({ behavior: "smooth" })}>Scan a crop</button>
          <button style={S.outlineBtn} onClick={() => howRef.current.scrollIntoView({ behavior: "smooth" })}>Explore the workflow →</button>
        </div>
      </div>

      {/* THREATS */}
      <div style={S.section}>
        <div style={S.tag}>COMMON THREATS</div>
        <div style={S.title}>Common threats, explained simply.</div>
        <div style={S.grid}>
          {threats.map((t) => (
            <div key={t.name} style={S.card} onClick={() => setModal(t)}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = C.green)}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = C.border)}>
              <div style={{ color: "#888", fontSize: 12 }}>{t.crop}</div>
              <div style={{ fontWeight: "bold", fontSize: 18, margin: "6px 0" }}>{t.name}</div>
              <div style={{ color: "#999", fontSize: 14 }}>{t.desc}</div>
              <div style={{ color: C.green, fontSize: 13, marginTop: 10 }}>View prevention →</div>
            </div>
          ))}
        </div>
      </div>

      {/* HOW IT WORKS */}
      <div style={S.section} ref={howRef}>
        <div style={S.tag}>THE FARMER JOURNEY</div>
        <div style={S.title}>How CropGuard works</div>
        <div style={S.grid}>
          {steps.map((s) => (
            <div key={s.n} style={S.card}>
              <div style={{ color: C.green, fontSize: 12 }}>{s.n} · {s.t.toUpperCase()}</div>
              <div style={{ fontSize: 18, fontWeight: "bold", margin: "6px 0" }}>{s.h}</div>
              <div style={{ color: "#999", fontSize: 14 }}>{s.d}</div>
            </div>
          ))}
        </div>
      </div>

      {/* INSIGHTS */}
      <div style={S.section} ref={insightsRef}>
        <div style={S.tag}>FIELD INTELLIGENCE</div>
        <div style={S.title}>Disease activity across India</div>
        <div style={{ maxWidth: 500 }}>
          {insights.map((r) => (
            <div key={r.region} style={{ marginBottom: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                <span><b>{r.region}</b> <span style={{ color: "#888" }}>· {r.risk}</span></span>
                <span>{r.pct}%</span>
              </div>
              <div style={{ background: C.border, borderRadius: 6, height: 6, marginTop: 4 }}>
                <div style={{ background: r.pct > 60 ? "#f87171" : r.pct > 40 ? "#facc15" : C.green, height: 6, borderRadius: 6, width: `${r.pct}%`, transition: "width .6s" }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* SCAN / UPLOAD */}
      <div style={S.section} ref={scanRef}>
        <div style={S.tag}>LIVE PROTOTYPE</div>
        <div style={S.title}>Upload crop photo</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); setImage(e.dataTransfer.files[0]); }}
            style={{ background: C.card, border: `1px dashed ${dragOver ? C.green : "#2a4534"}`, borderRadius: 12, padding: 40, textAlign: "center", transition: "border-color .2s" }}>
            {preview ? <img src={preview} alt="preview" style={{ maxWidth: "100%", maxHeight: 200, borderRadius: 8 }} /> : <div style={{ fontSize: 30 }}>⬆️</div>}
            <div style={{ fontWeight: "bold", marginTop: 10 }}>{dragOver ? "Drop it here" : "Upload crop photo"}</div>
            <div style={{ color: "#888", fontSize: 13 }}>Drag & drop or click to choose</div>
            <input type="file" accept="image/*" onChange={(e) => setImage(e.target.files[0])} style={{ display: "none" }} id="fileInput" />
            <label htmlFor="fileInput" style={{ ...S.outlineBtn, display: "inline-block", marginTop: 10, cursor: "pointer" }}>Choose image</label>

            <div style={{ marginTop: 20, display: "flex", gap: 10, justifyContent: "center" }}>
              <select value={crop} onChange={(e) => setCrop(e.target.value)} style={{ background: C.card, color: "#fff", border: `1px solid ${C.border}`, padding: 8, borderRadius: 6 }}>
                <option>Tomato</option><option>Potato</option><option>Pepper</option>
              </select>
              <select value={district} onChange={(e) => setDistrict(e.target.value)} style={{ background: C.card, color: "#fff", border: `1px solid ${C.border}`, padding: 8, borderRadius: 6 }}>
                <option>Pune</option><option>Nashik</option><option>Nagpur</option><option>Aurangabad</option><option>Kolhapur</option>
              </select>
            </div>
            <button style={{ ...S.btn, width: "100%", marginTop: 20 }} onClick={analyze} disabled={loading}>
              {loading ? "Analyzing..." : "✨ Analyze photo"}
            </button>
          </div>

          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 30 }}>
            {!result && !loading && (
              <div style={{ textAlign: "center", color: "#777", marginTop: 60 }}>
                🍃<div style={{ fontWeight: "bold", color: "#fff", marginTop: 10 }}>Awaiting a field image</div>
                <div>Diagnosis, weather risk and advisory will appear here.</div>
              </div>
            )}
            {loading && <div style={{ textAlign: "center", marginTop: 60, color: C.green }}>Analyzing image...</div>}
            {result && (
              <div>
                <div style={{ color: C.green, fontSize: 12 }}>● AI SCREENING · RESULT</div>
                <div style={{ fontSize: 22, fontWeight: "bold", margin: "8px 0" }}>{crop} · {result.prediction.class}</div>
                <div style={{ color: "#aaa", fontSize: 13 }}>Confidence</div>
                <div style={{ background: C.border, borderRadius: 6, height: 8, margin: "6px 0" }}>
                  <div style={{ background: C.green, height: 8, borderRadius: 6, width: `${result.prediction.confidence * 100}%`, transition: "width .6s" }} />
                </div>
                <div style={{ fontSize: 13, marginBottom: 15 }}>{(result.prediction.confidence * 100).toFixed(1)}%</div>

                <div style={{ color: "#aaa", fontSize: 13 }}>Weather Risk ({district})</div>
                <div style={{ fontWeight: "bold", marginBottom: 15 }}>{result.weather.pest_disease_risk} — {result.weather.temperature_C}°C, {result.weather.humidity_percent}% humidity</div>

                <div style={{ color: "#aaa", fontSize: 13 }}>Sensor Alerts</div>
                <div style={{ marginBottom: 15 }}>{result.sensor.alerts.join(", ")}</div>

                <div style={{ color: "#aaa", fontSize: 13 }}>Expert Advisory</div>
                <div style={{ whiteSpace: "pre-wrap", fontSize: 14, color: "#ddd" }}>{result.advisory}</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;