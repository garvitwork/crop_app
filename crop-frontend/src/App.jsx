import { useState, useRef, useEffect } from "react";

/* ---- Design tokens (All-Green) ---- */
const C = {
  bg: "#07160F",
  surface: "#0F2419",
  surface2: "#153322",
  line: "#234A32",
  gold: "#5FCB6B",   // primary accent (bright green)
  cane: "#A9D97A",   // secondary accent (light leaf green)
  ivory: "#EFFBEF",  // text
  sand: "#8FB894",   // muted green-grey
  rust: "#1F7A45",   // alert tone, still green family
};

const serif = "'Iowan Old Style', 'Palatino Linotype', Georgia, serif";
const sans = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif";

const threats = [
  { crop: "Tomato", name: "Early Blight", desc: "Warm, humid conditions and prolonged leaf wetness invite this fungus.", prevent: "Remove infected leaves, avoid overhead watering, apply Mancozeb 2g/L as a preventive spray, rotate crops yearly.", accent: C.rust },
  { crop: "Rice", name: "Blast", desc: "High humidity, dense canopy and favourable weather raise pressure.", prevent: "Use resistant varieties, avoid excess nitrogen, apply Tricyclazole at first symptom, keep fields drained.", accent: C.gold },
  { crop: "Wheat", name: "Yellow Rust", desc: "Cool, humid conditions favour this rust's spread.", prevent: "Sow resistant varieties, monitor early, apply Propiconazole if pustules appear, avoid late sowing.", accent: C.cane },
  { crop: "Cotton", name: "Aphid Pressure", desc: "Aphids thrive under mild weather and tender new growth.", prevent: "Use yellow sticky traps, encourage ladybird beetles, spray neem oil, avoid excess nitrogen.", accent: C.rust },
];

const steps = [
  { n: "1", t: "Capture", d: "A guided upload for a leaf, fruit or crop symptom." },
  { n: "2", t: "Screen", d: "A trained vision model names the likely disease or pest, with a confidence score." },
  { n: "3", t: "Understand", d: "Weather risk and an AI advisory explain what it means, in plain language." },
  { n: "4", t: "Act locally", d: "A hotspot map and sensor readings help track spread and plan the response." },
];

// insights now fetched live from /hotspots

function cleanAdvisory(text) {
  return text.replace(/\*\*(.*?)\*\*/g, "$1").replace(/\*(.*?)\*/g, "$1").replace(/^-{3,}$/gm, "");
}

function parseAdvisory(raw) {
  let text = cleanAdvisory(raw).trim();
  // break inline "1. Title:" / "2. Title:" style sub-headers onto their own lines
  text = text.replace(/(^|\s)(\d{1,2}\.\s+[A-Za-zऀ-ॿ][A-Za-z0-9ऀ-ॿ /'&-]{2,40}:)/g, "\n$2");
  const lines = text.split("\n");
  const sections = [];
  let current = null;
  const headerRe = /^(?:\d{1,2}\.\s*)?([A-Za-zऀ-ॿ][A-Za-z0-9ऀ-ॿ '()/&-]{2,50}):\s*(.*)$/;
  for (const rawLine of lines) {
    const t = rawLine.trim();
    if (!t) continue;
    const m = t.match(headerRe);
    if (m && m[1].split(" ").length <= 6) {
      current = { title: m[1].trim(), lines: m[2] ? [m[2].trim()] : [] };
      sections.push(current);
    } else if (current) {
      current.lines.push(t);
    } else {
      current = { title: "Advisory", lines: [t] };
      sections.push(current);
    }
  }
  return sections.map((s) => ({ title: s.title, body: s.lines.join(" ").replace(/^\*\s*/, "").replace(/\s\*\s*/g, " · ") }));
}

const iconFor = (title) => {
  const t = title.toLowerCase();
  if (t.includes("valid")) return "🔍";
  if (t.includes("management") || t.includes("recommend")) return "🛠️";
  if (t.includes("kvk") || t.includes("reference") || t.includes("lab")) return "🏢";
  if (t.includes("marathi") || t.includes("सारांश")) return "🗣️";
  return "📋";
};

const riskStyle = (risk, C) => {
  const r = (risk || "").toLowerCase();
  if (r.includes("high")) return { color: C.rust, icon: "🔥" };
  if (r.includes("med")) return { color: C.gold, icon: "⚠️" };
  return { color: C.cane, icon: "✅" };
};

const confColor = (pct, C) => (pct < 45 ? C.rust : pct < 70 ? C.gold : C.cane);

function Reveal({ children, delay = 0, style, className }) {
  const ref = useRef(null);
  const [vis, setVis] = useState(false);
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVis(true); obs.disconnect(); } }, { threshold: 0.15 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  return (
    <div ref={ref} className={className} style={{ opacity: vis ? 1 : 0, transform: vis ? "translateY(0)" : "translateY(26px)", transition: `opacity .6s ease-out ${delay}s, transform .6s ease-out ${delay}s`, ...style }}>
      {children}
    </div>
  );
}

function App() {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [district, setDistrict] = useState("Pune");
  const [crop, setCrop] = useState("Tomato");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState(null);
  const [insights, setInsights] = useState([]);
  const [view, setView] = useState("farmer");
  const [districtsData, setDistrictsData] = useState([]);

  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const scanRef = useRef(null);
  const howRef = useRef(null);
  const insightsRef = useRef(null);

  useEffect(() => {
    fetch("https://crop-app-jhi8.onrender.com/hotspots")
      .then((r) => r.json())
      .then(setInsights)
      .catch(() => setInsights([]));
  }, []);

  useEffect(() => {
    if (view !== "dashboard") return;
    fetch("https://crop-app-jhi8.onrender.com/districts-weather")
      .then((r) => r.json())
      .then(setDistrictsData)
      .catch(() => setDistrictsData([]));
  }, [view]);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3000); };
  const [waking, setWaking] = useState(false);
  const wakeApi = async () => {
    setWaking(true);
    try {
      await fetch("https://crop-app-jhi8.onrender.com/health");
      showToast("Server is awake ✅");
    } catch {
      showToast("Waking… try again in a few seconds");
    }
    setWaking(false);
  };

  const setImage = (f) => {
    if (!f) return;
    const img = new Image();
    const url = URL.createObjectURL(f);
    img.onload = () => {
      const maxDim = 1024;
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      if (scale === 1) {
        setFile(f);
        setPreview(url);
        return;
      }
      const canvas = document.createElement("canvas");
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        const resized = new File([blob], f.name, { type: "image/jpeg" });
        setFile(resized);
        setPreview(URL.createObjectURL(resized));
        URL.revokeObjectURL(url);
      }, "image/jpeg", 0.85);
    };
    img.src = url;
  };

  const analyze = async () => {
    if (!file) return showToast("Add a photo before analyzing");
    setLoading(true);
    setResult(null);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("district", district);
    formData.append("crop", crop);
    try {
      const res = await fetch("https://crop-app-jhi8.onrender.com/analyze", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok || data.error) {
        showToast(data.error || `Server error (${res.status}). Try again.`);
        setLoading(false);
        return;
      }
      setResult(data);
    } catch {
      showToast("Backend not reachable — check server status");
    }
    setLoading(false);
  };

  const glow = (color) => `0 0 14px ${color}55, 0 0 2px ${color}88 inset`;

  const S = {
    page: { background: C.bg, color: C.ivory, minHeight: "100vh", width: "100%", fontFamily: sans, lineHeight: 1.5, overflowX: "hidden", position: "relative" },
    content: { position: "relative", zIndex: 1 },
    nav: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "22px 4vw", borderBottom: `1px solid ${C.line}`, position: "sticky", top: 0, background: `${C.bg}cc`, backdropFilter: "blur(10px)", zIndex: 20 },
    logo: { fontFamily: serif, fontSize: 24, letterSpacing: 0.3, color: C.gold, textShadow: `0 0 10px ${C.gold}66` },
    navLink: { color: C.sand, cursor: "pointer", fontSize: 14.5, transition: "color .15s" },
    primaryBtn: { background: C.gold, color: C.bg, border: "none", padding: "11px 22px", borderRadius: 4, fontWeight: 600, fontSize: 14.5, cursor: "pointer", boxShadow: glow(C.gold) },
    ghostBtn: { background: "transparent", border: `1px solid ${C.line}`, color: C.ivory, padding: "11px 22px", borderRadius: 4, cursor: "pointer", fontSize: 14.5 },
    section: { padding: "clamp(40px, 8vw, 72px) 4vw", width: "100%", maxWidth: "100%", margin: "0 auto", boxSizing: "border-box" },
    kicker: { color: C.cane, fontSize: 14, marginBottom: 10, fontFamily: serif, fontStyle: "italic" },
    h2: { fontFamily: serif, fontSize: "clamp(24px, 4vw, 34px)", fontWeight: 500, marginBottom: 14, maxWidth: 640 },
    body: { color: C.sand, maxWidth: 600, marginBottom: 36, fontSize: 15.5 },
    glowBox: { background: C.surface, border: `1px solid ${C.line}`, borderRadius: 10, boxShadow: `0 0 0 1px ${C.line}, 0 8px 30px -10px ${C.gold}33` },
  };

  return (
    <div style={S.page}>
      {/* Animation keyframes */}
      <style>{`
        html, body, #root { margin: 0; padding: 0; width: 100%; max-width: 100%; text-align: left; scroll-behavior: smooth; }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 10px; }
        ::-webkit-scrollbar-track { background: ${C.bg}; }
        ::-webkit-scrollbar-thumb { background: ${C.line}; border-radius: 6px; }
        ::-webkit-scrollbar-thumb:hover { background: ${C.gold}88; }
        .nav-link { position: relative; }
        .nav-link::after { content: ""; position: absolute; left: 0; bottom: -6px; width: 0; height: 2px; background: ${C.gold}; box-shadow: 0 0 8px ${C.gold}; transition: width .25s ease; }
        .nav-link:hover { color: ${C.gold}; }
        .nav-link:hover::after { width: 100%; }
        .btn-primary { transition: transform .18s ease, box-shadow .18s ease; }
        .btn-primary:hover { transform: translateY(-2px) scale(1.03); box-shadow: 0 0 22px ${C.gold}88; }
        .btn-ghost { transition: all .18s ease; }
        .btn-ghost:hover { border-color: ${C.gold}; color: ${C.gold}; box-shadow: 0 0 14px ${C.gold}33; }
        .threat-card { transition: transform .25s ease, box-shadow .25s ease, background .2s ease; }
        .threat-card:hover { transform: translateY(-5px); }
        .step-box:hover .step-num { text-shadow: 0 0 16px ${C.gold}; transform: scale(1.1); }
        .step-num { transition: transform .2s, text-shadow .2s; display: inline-block; }
        .blob { position: fixed; border-radius: 50%; filter: blur(70px); opacity: .18; pointer-events: none; z-index: 0; }
        @keyframes drift1 { 0%,100% { transform: translate(0,0); } 50% { transform: translate(60px,40px); } }
        @keyframes drift2 { 0%,100% { transform: translate(0,0); } 50% { transform: translate(-50px,-30px); } }
        @keyframes scanMove { 0% { top: 4%; opacity: .2; } 45% { opacity: 1; } 50% { top: 92%; opacity: 1; } 55% { opacity: .2; } 100% { top: 4%; opacity: .2; } }
        @keyframes pulseGlow { 0%,100% { box-shadow: 0 0 12px ${C.gold}33; } 50% { box-shadow: 0 0 26px ${C.gold}77; } }
        @keyframes framePulse { 0%,100% { border-color: ${C.gold}66; } 50% { border-color: ${C.cane}; } }
        @keyframes floatIcon { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
        @keyframes barFill { from { width: 0; } }
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes borderSweep { 0% { background-position: 0% 0; } 100% { background-position: 200% 0; } }
        @keyframes popIn { from { opacity: 0; transform: scale(.85); } to { opacity: 1; transform: scale(1); } }
        @keyframes chipPulse { 0%,100% { box-shadow: 0 0 0px transparent; } 50% { box-shadow: 0 0 10px currentColor; } }
        @keyframes ringSpin { to { transform: rotate(360deg); } }
        @media (max-width: 760px) {
          .hero-grid, .insights-wrap, .scan-grid { grid-template-columns: 1fr !important; }
          .insights-grid { grid-template-columns: 1fr !important; }
          .nav-links { display: none !important; }
          .map-frame { height: 260px !important; }
        }
      `}</style>

      <div className="blob" style={{ width: 320, height: 320, top: -80, left: -80, background: C.gold, animation: "drift1 14s ease-in-out infinite" }} />
      <div className="blob" style={{ width: 280, height: 280, bottom: -90, right: -80, background: C.cane, animation: "drift2 16s ease-in-out infinite" }} />

      <div style={S.content}>
      {toast && (
        <div style={{ position: "fixed", bottom: 24, right: 24, background: C.surface2, border: `1px solid ${C.gold}`, color: C.ivory, padding: "13px 22px", borderRadius: 6, fontSize: 14, zIndex: 100, maxWidth: 320, boxShadow: glow(C.gold) }}>
          {toast}
        </div>
      )}

      {modal && (
        <div onClick={() => setModal(null)} style={{ position: "fixed", inset: 0, background: "rgba(4,10,7,.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: C.surface, border: `1px solid ${C.line}`, borderTop: `3px solid ${modal.accent}`, borderRadius: 8, padding: 36, maxWidth: 420, boxShadow: glow(modal.accent) }}>
            <div style={{ color: C.sand, fontSize: 13 }}>{modal.crop}</div>
            <div style={{ fontFamily: serif, fontSize: 26, margin: "6px 0 14px" }}>{modal.name}</div>
            <div style={{ color: C.sand, marginBottom: 18, fontSize: 14.5 }}>{modal.desc}</div>
            <div style={{ height: 1, background: C.line, marginBottom: 18 }} />
            <div style={{ fontSize: 13, color: modal.accent, marginBottom: 8, fontWeight: 600 }}>How to prevent it</div>
            <div style={{ color: C.ivory, fontSize: 14.5 }}>{modal.prevent}</div>
            <button style={{ ...S.ghostBtn, marginTop: 24, width: "100%" }} onClick={() => setModal(null)}>Close</button>
          </div>
        </div>
      )}

      {/* NAV */}
      <div style={{ ...S.nav, flexWrap: "wrap", gap: 12 }}>
        <div style={{ ...S.logo, animation: "floatIcon 3s ease-in-out infinite" }}>CropGuard</div>
        <div className="nav-links" style={{ display: "flex", gap: 34 }}>
          <span className="nav-link" style={S.navLink} onClick={() => scanRef.current.scrollIntoView({ behavior: "smooth" })}>Scan</span>
          <span className="nav-link" style={S.navLink} onClick={() => howRef.current.scrollIntoView({ behavior: "smooth" })}>How it works</span>
          <span className="nav-link" style={S.navLink} onClick={() => insightsRef.current.scrollIntoView({ behavior: "smooth" })}>Insights</span>
          <span className="nav-link" style={S.navLink} onClick={() => setView(view === "dashboard" ? "farmer" : "dashboard")}>{view === "dashboard" ? "Farmer view" : "Officials Dashboard"}</span>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn-ghost" style={S.ghostBtn} onClick={wakeApi} disabled={waking}>{waking ? "Waking…" : "Wake API"}</button>
          <button className="btn-primary" style={S.primaryBtn} onClick={() => scanRef.current.scrollIntoView({ behavior: "smooth" })}>Scan a crop</button>
        </div>
      </div>

      {view === "dashboard" ? (
        <div style={S.section}>
          <div style={S.kicker}>For agriculture officials</div>
          <div style={S.h2}>Regional risk dashboard</div>
          <div style={S.body}>Live weather-based risk across all tracked districts, plus current top disease hotspots — for planning extension visits and preventive interventions.</div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, marginBottom: 40 }}>
            {districtsData.length === 0 && <div style={{ color: C.sand }}>Loading district data…</div>}
            {districtsData.map((d, i) => {
              const risk = riskStyle(d.pest_disease_risk, C);
              return (
                <Reveal key={d.district} delay={i * 0.05}>
                  <div style={{ ...S.glowBox, padding: 18, borderLeft: `3px solid ${risk.color}` }}>
                    <div style={{ fontFamily: serif, fontSize: 19, marginBottom: 6 }}>{d.district}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, color: risk.color, fontWeight: 700, fontSize: 13.5, marginBottom: 8 }}>
                      <span>{risk.icon}</span>{d.pest_disease_risk} risk
                    </div>
                    <div style={{ color: C.sand, fontSize: 13 }}>
                      {d.temperature_C != null ? `🌡️ ${d.temperature_C}°C · 💧 ${d.humidity_percent}%` : "Weather unavailable"}
                    </div>
                  </div>
                </Reveal>
              );
            })}
          </div>

          <div style={S.kicker}>Current top hotspots</div>
          <div style={{ ...S.glowBox, padding: 20 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
              {insights.map((r, i) => {
                const col = r.pct > 70 ? C.rust : r.pct > 40 ? C.gold : C.cane;
                return (
                  <div key={r.region} style={{ background: C.surface2, border: `1px solid ${C.line}`, borderRadius: 8, padding: "12px 14px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{r.region}</span>
                      <span style={{ color: col, fontWeight: 700, fontSize: 13 }}>{r.pct}%</span>
                    </div>
                    <div style={{ color: C.sand, fontSize: 12.5 }}>{r.risk}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
      <>

      {/* HERO */}
      <Reveal className="hero-grid" style={{ ...S.section, display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 60, alignItems: "center", paddingTop: 100, paddingBottom: 100 }}>
        <div>
          <div style={S.kicker}>Smart Advisory Council for Agriculture, Maharashtra</div>
          <div style={{ fontFamily: serif, fontSize: "clamp(32px, 6vw, 56px)", lineHeight: 1.08, fontWeight: 500, marginBottom: 22 }}>
            A second opinion for every field, before the damage spreads
          </div>
          <div style={{ color: C.sand, fontSize: 17, maxWidth: 460, marginBottom: 30 }}>
            Photograph a leaf. Get a diagnosis, the local weather risk, and a plain-language advisory — built for farmers and extension workers across Maharashtra.
          </div>
          <div style={{ display: "flex", gap: 14 }}>
            <button className="btn-primary" style={S.primaryBtn} onClick={() => scanRef.current.scrollIntoView({ behavior: "smooth" })}>Scan a crop</button>
            <button className="btn-ghost" style={S.ghostBtn} onClick={() => howRef.current.scrollIntoView({ behavior: "smooth" })}>See how it works</button>
          </div>
        </div>

        {/* Phone-scanning-crop animation — click to upload */}
        <div
          onClick={() => { scanRef.current.scrollIntoView({ behavior: "smooth" }); setTimeout(() => cameraInputRef.current.click(), 450); }}
          title="Click to upload a crop photo"
          style={{ ...S.glowBox, padding: 28, animation: "pulseGlow 3.2s ease-in-out infinite", cursor: "pointer", transition: "transform .15s" }}
          onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.015)")}
          onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}>
          <div style={{ position: "relative", width: "100%", aspectRatio: "4/3", borderRadius: 6, overflow: "hidden", background: `linear-gradient(160deg, ${C.cane}33, ${C.surface2})`, border: `2px solid ${C.gold}66`, animation: "framePulse 3.2s ease-in-out infinite" }}>
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 54, animation: "floatIcon 2.6s ease-in-out infinite" }}>🌿</div>
            {/* phone corner marks */}
            {["0,0", "1,0", "0,1", "1,1"].map((pos, i) => {
              const [x, y] = pos.split(",");
              return (
                <div key={i} style={{
                  position: "absolute",
                  top: y === "0" ? 10 : "auto", bottom: y === "1" ? 10 : "auto",
                  left: x === "0" ? 10 : "auto", right: x === "1" ? 10 : "auto",
                  width: 18, height: 18,
                  borderTop: y === "0" ? `2px solid ${C.gold}` : "none",
                  borderBottom: y === "1" ? `2px solid ${C.gold}` : "none",
                  borderLeft: x === "0" ? `2px solid ${C.gold}` : "none",
                  borderRight: x === "1" ? `2px solid ${C.gold}` : "none",
                }} />
              );
            })}
            {/* scanning beam */}
            <div style={{ position: "absolute", left: 0, right: 0, height: 2, background: `linear-gradient(90deg, transparent, ${C.gold}, transparent)`, boxShadow: `0 0 12px 3px ${C.gold}`, animation: "scanMove 2.4s ease-in-out infinite" }} />
          </div>
          <div style={{ marginTop: 18, display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
            <div>
              <div style={{ fontSize: 12, color: C.sand }}>Sample screening</div>
              <div style={{ fontFamily: serif, fontSize: 20, marginTop: 2 }}>Tomato · Early Blight</div>
            </div>
            <div style={{ color: C.gold, fontFamily: serif, fontSize: 22, textShadow: `0 0 10px ${C.gold}88` }}>92%</div>
          </div>
        </div>
      </Reveal>

      {/* THREATS */}
      <Reveal style={S.section}>
        <div style={S.kicker}>What the model watches for</div>
        <div style={S.h2}>Common threats, explained simply</div>
        <div style={S.body}>Reference conditions the model is trained to recognize, drawn from the current crop-disease dataset.</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 20 }}>
          {threats.map((t, i) => (
            <Reveal key={t.name} delay={i * 0.08}>
              <div className="threat-card" onClick={() => setModal(t)}
                style={{ ...S.glowBox, borderLeft: `3px solid ${t.accent}`, borderRadius: "0 8px 8px 0", padding: "22px 24px", cursor: "pointer" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = C.surface2; e.currentTarget.style.boxShadow = glow(t.accent); }}
                onMouseLeave={(e) => { e.currentTarget.style.background = C.surface; e.currentTarget.style.boxShadow = S.glowBox.boxShadow; }}>
                <div style={{ color: C.sand, fontSize: 12.5 }}>{t.crop}</div>
                <div style={{ fontFamily: serif, fontSize: 20, margin: "5px 0 10px" }}>{t.name}</div>
                <div style={{ color: C.sand, fontSize: 14 }}>{t.desc}</div>
                <div style={{ color: t.accent, fontSize: 13.5, marginTop: 14, fontWeight: 600 }}>See prevention steps →</div>
              </div>
            </Reveal>
          ))}
        </div>
      </Reveal>

      {/* HOW IT WORKS */}
      <Reveal style={S.section}>
       <div ref={howRef}>
        <div style={S.kicker}>The path from photo to plan</div>
        <div style={S.h2}>How CropGuard works</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 0, borderTop: `1px solid ${C.line}` }}>
          {steps.map((s, i) => (
            <div key={s.n} className="step-box" style={{ padding: "28px 24px 28px 0", borderRight: i < 3 ? `1px solid ${C.line}` : "none", paddingLeft: i === 0 ? 0 : 24 }}>
              <div className="step-num" style={{ fontFamily: serif, fontSize: 30, color: C.gold, textShadow: `0 0 10px ${C.gold}55` }}>{s.n}</div>
              <div style={{ fontSize: 17, fontWeight: 600, margin: "10px 0 8px" }}>{s.t}</div>
              <div style={{ color: C.sand, fontSize: 14 }}>{s.d}</div>
            </div>
          ))}
        </div>
       </div>
      </Reveal>

      {/* INSIGHTS + MAP */}
      <Reveal style={S.section}>
       <div ref={insightsRef}>
        <div style={S.kicker}>Field intelligence</div>
        <div style={S.h2}>Disease activity, reported and mapped</div>
        <div style={S.body}>Farmer-submitted reports plotted across Maharashtra, alongside a national comparison. Demo data for this prototype.</div>
        <div className="insights-wrap" style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 28 }}>
          <iframe
            src="https://garvitwork.github.io/crop_app/hotspot_map.html"
            title="Hotspot Map"
            className="map-frame"
            style={{ width: "100%", height: 420, border: `1px solid ${C.line}`, borderRadius: 8, boxShadow: S.glowBox.boxShadow }}
          />
          <div style={{ ...S.glowBox, padding: 20 }}>
            {insights.length === 0 && <div style={{ color: C.sand, fontSize: 14, padding: 8 }}>Loading top hotspots…</div>}
            <div className="insights-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {insights.map((r, i) => {
                const col = r.pct > 70 ? C.rust : r.pct > 40 ? C.gold : C.cane;
                return (
                  <Reveal key={r.region} delay={i * 0.06}>
                    <div className="threat-card" style={{ background: C.surface2, border: `1px solid ${C.line}`, borderRadius: 8, padding: "14px 16px", position: "relative", overflow: "hidden" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ width: 20, height: 20, borderRadius: "50%", background: `${col}22`, border: `1px solid ${col}`, color: col, fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{i + 1}</span>
                          <span style={{ fontWeight: 600, fontSize: 14.5 }}>{r.region}</span>
                        </div>
                        <span style={{ color: col, fontWeight: 700, fontSize: 13, textShadow: `0 0 8px ${col}66` }}>{r.pct}%</span>
                      </div>
                      <div style={{ color: C.sand, fontSize: 12.5, marginBottom: 8 }}>{r.risk}</div>
                      <div style={{ background: C.line, borderRadius: 3, height: 5 }}>
                        <div style={{ background: col, height: 5, borderRadius: 3, width: `${r.pct}%`, transition: "width 1s ease-out", boxShadow: `0 0 6px ${col}77` }} />
                      </div>
                    </div>
                  </Reveal>
                );
              })}
            </div>
          </div>
        </div>
       </div>
      </Reveal>

      {/* SCAN / UPLOAD */}
      <Reveal style={S.section}>
       <div ref={scanRef}>
        <div style={S.kicker}>Try it now</div>
        <div style={S.h2}>Upload a crop photo</div>
        <div style={S.body}>Upload a real leaf or fruit image. The trained model, weather engine and AI advisory run together for one combined result.</div>

        <div className="scan-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); setImage(e.dataTransfer.files[0]); }}
            style={{ ...S.glowBox, border: `1px dashed ${dragOver ? C.gold : C.line}`, padding: 36, textAlign: "center", transition: "border-color .15s", boxShadow: dragOver ? glow(C.gold) : S.glowBox.boxShadow, position: "relative", overflow: "hidden" }}>
            {loading && (
              <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 2, background: `linear-gradient(90deg, transparent, ${C.gold}, transparent)`, boxShadow: `0 0 12px 3px ${C.gold}`, animation: "scanMove 1.6s ease-in-out infinite" }} />
            )}
            {preview ? <img src={preview} alt="preview" style={{ maxWidth: "100%", maxHeight: 190, borderRadius: 6, boxShadow: `0 0 16px ${C.gold}44` }} /> : <div style={{ fontSize: 32, animation: "floatIcon 2.6s ease-in-out infinite" }}>🌾</div>}
            <div style={{ fontWeight: 600, marginTop: 14 }}>{dragOver ? "Drop it here" : "Drag a photo here"}</div>
            <div style={{ color: C.sand, fontSize: 13.5, marginTop: 4 }}>or choose a file from your device</div>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={(e) => setImage(e.target.files[0])} style={{ display: "none" }} id="fileInput" />
            <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={(e) => setImage(e.target.files[0])} style={{ display: "none" }} id="cameraInput" />
            <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 16, flexWrap: "wrap" }}>
              <label htmlFor="cameraInput" className="btn-primary" style={{ ...S.primaryBtn, display: "inline-block", cursor: "pointer" }}>📷 Take Photo</label>
              <label htmlFor="fileInput" className="btn-ghost" style={{ ...S.ghostBtn, display: "inline-block", cursor: "pointer" }}>Choose image</label>
            </div>

            <div style={{ marginTop: 24, display: "flex", gap: 10, justifyContent: "center" }}>
              <select value={crop} onChange={(e) => setCrop(e.target.value)} style={{ background: C.bg, color: C.ivory, border: `1px solid ${C.line}`, padding: "9px 12px", borderRadius: 4, fontSize: 14 }}>
                <option>Tomato</option><option>Potato</option><option>Pepper</option>
              </select>
              <select value={district} onChange={(e) => setDistrict(e.target.value)} style={{ background: C.bg, color: C.ivory, border: `1px solid ${C.line}`, padding: "9px 12px", borderRadius: 4, fontSize: 14 }}>
                <option>Pune</option><option>Nashik</option><option>Nagpur</option><option>Aurangabad</option><option>Kolhapur</option>
              </select>
            </div>
            <button className="btn-primary" style={{ ...S.primaryBtn, width: "100%", marginTop: 22 }} onClick={analyze} disabled={loading}>
              {loading ? "Analyzing…" : "Analyze photo"}
            </button>
          </div>

          <div style={{ ...S.glowBox, padding: 30, textAlign: "left" }}>
            {!result && !loading && (
              <div style={{ textAlign: "center", color: C.sand, marginTop: 56 }}>
                <div style={{ fontSize: 30, animation: "floatIcon 2.6s ease-in-out infinite" }}>🍃</div>
                <div style={{ fontFamily: serif, fontSize: 19, color: C.ivory, margin: "12px 0 6px" }}>Waiting for a photo</div>
                <div style={{ fontSize: 14 }}>The diagnosis, weather risk and advisory will appear here.</div>
              </div>
            )}
            {loading && <div style={{ textAlign: "center", marginTop: 56, color: C.gold, fontFamily: serif, fontSize: 18, textShadow: `0 0 12px ${C.gold}66` }}>Analyzing image…</div>}
            {result && (() => {
              const pct = result.prediction.confidence * 100;
              const cCol = confColor(pct, C);
              const risk = riskStyle(result.weather.pest_disease_risk, C);
              const alerts = result.sensor.alerts;
              const detectedCrop = result.prediction.class.split(/[_ ]/)[0];
              const mismatch = detectedCrop.toLowerCase() !== crop.toLowerCase();
              return (
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 14, animation: "fadeInUp .45s ease-out both" }}>
                    <div style={{ position: "relative", width: 64, height: 64, flexShrink: 0 }}>
                      <svg width="64" height="64" style={{ transform: "rotate(-90deg)" }}>
                        <circle cx="32" cy="32" r="27" fill="none" stroke={C.line} strokeWidth="6" />
                        <circle cx="32" cy="32" r="27" fill="none" stroke={cCol} strokeWidth="6" strokeLinecap="round"
                          strokeDasharray={2 * Math.PI * 27} strokeDashoffset={2 * Math.PI * 27 * (1 - pct / 100)}
                          style={{ transition: "stroke-dashoffset 1s ease-out", filter: `drop-shadow(0 0 6px ${cCol})` }} />
                      </svg>
                      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: cCol }}>{pct.toFixed(0)}%</div>
                    </div>
                    <div>
                      <div style={{ color: C.sand, fontSize: 12.5 }}>Result</div>
                      <div style={{ fontFamily: serif, fontSize: 23 }}>{result.prediction.class.replace(/_/g, " ")}</div>
                    </div>
                  </div>

                  {mismatch && (
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 8, background: `${C.rust}1a`, border: `1px solid ${C.rust}66`, color: C.rust, borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: 18, lineHeight: 1.5 }}>
                      <span>⚠️</span>
                      <span>You selected <b>{crop}</b>, but the photo looks like a <b>{detectedCrop}</b> leaf — advisory below uses the selected crop, double-check before applying treatment.</span>
                    </div>
                  )}

                  <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap", animation: "fadeInUp .45s ease-out .1s both" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, background: `${risk.color}1a`, border: `1px solid ${risk.color}66`, color: risk.color, borderRadius: 20, padding: "6px 14px", fontSize: 13, fontWeight: 700, animation: "chipPulse 2.4s ease-in-out infinite" }}>
                      <span>{risk.icon}</span>{result.weather.pest_disease_risk} risk · {district}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, background: C.surface2, border: `1px solid ${C.line}`, borderRadius: 20, padding: "6px 14px", fontSize: 13, color: C.sand }}>
                      🌡️ {result.weather.temperature_C}°C · 💧 {result.weather.humidity_percent}%
                    </div>
                  </div>

                  <div style={{ marginBottom: 22, animation: "fadeInUp .45s ease-out .18s both" }}>
                    <div style={{ color: C.sand, fontSize: 12.5, marginBottom: 8 }}>Sensor alerts</div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {alerts.map((a, i) => {
                        const ok = /normal|no action/i.test(a);
                        const col = ok ? C.cane : C.rust;
                        return (
                          <span key={i} style={{ background: `${col}1a`, border: `1px solid ${col}55`, color: col, borderRadius: 20, padding: "5px 12px", fontSize: 12.5, animation: `popIn .35s ease-out ${i * 0.08}s both` }}>
                            {ok ? "✅" : "⚠️"} {a}
                          </span>
                        );
                      })}
                    </div>
                  </div>

                  <div style={{ height: 1, background: C.line, margin: "18px 0" }} />

                  <div style={{ color: C.sand, fontSize: 13, marginBottom: 10 }}>Expert advisory</div>
                  <div>
                    {parseAdvisory(result.advisory).map((s, i) => (
                      <div key={i}
                        style={{
                          background: C.surface2, border: `1px solid ${C.line}`, borderLeft: `3px solid ${C.gold}`, borderRadius: 8,
                          padding: "14px 16px", marginBottom: 12,
                          animation: `fadeInUp .5s ease-out ${0.25 + i * 0.15}s both`,
                          boxShadow: `0 0 0 1px ${C.line}, 0 6px 18px -8px ${C.gold}44`,
                          transition: "transform .2s, box-shadow .2s",
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.transform = "translateX(4px)"; e.currentTarget.style.boxShadow = `0 0 0 1px ${C.gold}55, 0 8px 22px -6px ${C.gold}66`; }}
                        onMouseLeave={(e) => { e.currentTarget.style.transform = "translateX(0)"; e.currentTarget.style.boxShadow = `0 0 0 1px ${C.line}, 0 6px 18px -8px ${C.gold}44`; }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                          <span style={{ fontSize: 16 }}>{iconFor(s.title)}</span>
                          <span style={{ color: C.gold, fontWeight: 700, fontSize: 13.5, letterSpacing: 0.3, textShadow: `0 0 8px ${C.gold}55` }}>{s.title}</span>
                        </div>
                        <div style={{ fontSize: 14.5, color: C.ivory, lineHeight: 1.55 }}>{s.body}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
       </div>
      </Reveal>

      </>
      )}

      <div style={{ borderTop: `1px solid ${C.line}`, padding: "28px 4vw", textAlign: "center", color: C.sand, fontSize: 13 }}>
        CropGuard — a crop health prototype for Maharashtra
      </div>
      </div>
    </div>
  );
}

export default App;