import { useState, useRef, useEffect, useMemo } from "react";

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

const API = "https://crop-app-jhi8.onrender.com";
const DASHBOARD_REFRESH_MS = 30000;

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

function cleanAdvisory(text) {
  return text.replace(/\*\*(.*?)\*\*/g, "$1").replace(/\*(.*?)\*/g, "$1").replace(/^-{3,}$/gm, "");
}

function parseAdvisory(raw) {
  let text = cleanAdvisory(raw).trim();
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
  if (t.includes("valid")) return "";
  if (t.includes("management") || t.includes("recommend")) return "";
  if (t.includes("kvk") || t.includes("reference") || t.includes("lab")) return "";
  if (t.includes("marathi") || t.includes("सारांश")) return "";
  return "";
};

const riskStyle = (risk, C) => {
  const r = (risk || "").toLowerCase();
  if (r.includes("high")) return { color: C.rust, icon: "🔥", weight: 3 };
  if (r.includes("med") || r.includes("moderate")) return { color: C.gold, icon: "⚠️", weight: 2 };
  if (r === "n/a" || r === "") return { color: C.sand, icon: "•", weight: 0 };
  return { color: C.cane, icon: "✅", weight: 1 };
};

const confColor = (pct, C) => (pct < 45 ? C.rust : pct < 70 ? C.gold : C.cane);

function speakText(text, lang) {
  if (!window.speechSynthesis || !text || !text.trim()) return false;
  const doSpeak = () => {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = lang;
    utter.rate = 0.95;
    const voices = window.speechSynthesis.getVoices();
    const match = voices.find((v) => v.lang === lang) || voices.find((v) => v.lang.startsWith(lang.split("-")[0]));
    if (match) utter.voice = match;
    setTimeout(() => window.speechSynthesis.speak(utter), 60); // avoids Chrome cancel+speak race
  };
  if (window.speechSynthesis.getVoices().length === 0) {
    window.speechSynthesis.onvoiceschanged = doSpeak;
  } else {
    doSpeak();
  }
  return true;
}

function timeAgo(iso) {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function downloadCSV(rows, filename) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [headers.join(",")]
    .concat(rows.map((r) => headers.map((h) => `"${String(r[h]).replace(/"/g, '""')}"`).join(",")))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

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

/* ---------- Small chart primitives, built from real fetched data only ---------- */

function Donut({ segments, size = 108, thickness = 14 }) {
  // segments: [{ value, color, label }]
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const r = (size - thickness) / 2;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={C.line} strokeWidth={thickness} />
        {segments.map((s, i) => {
          const frac = s.value / total;
          const dash = frac * circ;
          const circle = (
            <circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={thickness}
              strokeDasharray={`${dash} ${circ - dash}`}
              strokeDashoffset={-offset}
              strokeLinecap="butt"
              style={{ transition: "stroke-dasharray 1s ease-out", filter: s.value > 0 ? `drop-shadow(0 0 6px ${s.color})` : "none" }}
            />
          );
          offset += dash;
          return circle;
        })}
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 700, color: C.ivory }}>
        {total}
      </div>
    </div>
  );
}

function HBar({ label, value, max, color, suffix = "" }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 4 }}>
        <span style={{ color: C.ivory }}>{label}</span>
        <span style={{ color, fontWeight: 700 }}>{value}{suffix}</span>
      </div>
      <div style={{ background: C.line, borderRadius: 3, height: 7 }}>
        <div style={{ background: color, height: 7, borderRadius: 3, width: `${pct}%`, transition: "width .8s ease-out", boxShadow: `0 0 6px ${color}66` }} />
      </div>
    </div>
  );
}

function Sparkline({ points, color, width = 190, height = 52 }) {
  if (!points.length) return <div style={{ color: C.sand, fontSize: 12.5 }}>Not enough data yet</div>;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = max - min || 1;
  const stepX = points.length > 1 ? width / (points.length - 1) : width;
  const coords = points.map((p, i) => {
    const x = i * stepX;
    const y = 8 + (1 - (p - min) / range) * (height - 16);
    return [x, y];
  });
  const path = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const last = coords[coords.length - 1];
  return (
    <svg width={width + 40} height={height}>
      <text x={width + 8} y={12} fontSize="10" fill={C.sand}>{max.toFixed(0)}%</text>
      <text x={width + 8} y={height - 6} fontSize="10" fill={C.sand}>{min.toFixed(0)}%</text>
      <path d={path} fill="none" stroke={color} strokeWidth={2} style={{ filter: `drop-shadow(0 0 4px ${color}88)` }} />
      <circle cx={last[0]} cy={last[1]} r={3.5} fill={color} />
    </svg>
  );
}

/* ---------- District detail modal ---------- */

function DistrictModal({ district, recentScans, insights, onClose }) {
  const risk = riskStyle(district.pest_disease_risk, C);
  const scans = recentScans.filter((s) => s.district === district.district);
  const hotspot = insights.find((h) => h.region === district.district);
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(4,10,7,.82)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.surface, border: `1px solid ${C.line}`, borderTop: `3px solid ${risk.color}`, borderRadius: 8, padding: 32, maxWidth: 480, width: "100%", maxHeight: "80vh", overflowY: "auto", boxShadow: `0 0 14px ${risk.color}55` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ color: C.sand, fontSize: 13 }}>District briefing</div>
            <div style={{ fontFamily: serif, fontSize: 27 }}>{district.district}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, color: risk.color, fontWeight: 700, fontSize: 13.5 }}>
            <span>{risk.icon}</span>{district.pest_disease_risk} risk
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, margin: "18px 0", flexWrap: "wrap" }}>
          <div style={{ background: C.surface2, border: `1px solid ${C.line}`, borderRadius: 8, padding: "10px 14px", flex: 1, minWidth: 110 }}>
            <div style={{ color: C.sand, fontSize: 11.5 }}>Temperature</div>
            <div style={{ fontSize: 18, fontFamily: serif }}>{district.temperature_C != null ? `${district.temperature_C}°C` : "—"}</div>
          </div>
          <div style={{ background: C.surface2, border: `1px solid ${C.line}`, borderRadius: 8, padding: "10px 14px", flex: 1, minWidth: 110 }}>
            <div style={{ color: C.sand, fontSize: 11.5 }}>Humidity</div>
            <div style={{ fontSize: 18, fontFamily: serif }}>{district.humidity_percent != null ? `${district.humidity_percent}%` : "—"}</div>
          </div>
          {hotspot && (
            <div style={{ background: C.surface2, border: `1px solid ${C.line}`, borderRadius: 8, padding: "10px 14px", flex: 1, minWidth: 110 }}>
              <div style={{ color: C.sand, fontSize: 11.5 }}>Hotspot severity</div>
              <div style={{ fontSize: 18, fontFamily: serif, color: hotspot.pct > 70 ? C.rust : hotspot.pct > 40 ? C.gold : C.cane }}>{hotspot.pct}%</div>
            </div>
          )}
        </div>

        {hotspot && (
          <div style={{ color: C.sand, fontSize: 13.5, marginBottom: 18 }}>
            Reported condition: <span style={{ color: C.ivory }}>{hotspot.risk}</span>
          </div>
        )}

        <div style={{ height: 1, background: C.line, margin: "6px 0 16px" }} />
        <div style={{ fontSize: 13, color: C.sand, marginBottom: 10 }}>
          Farmer submissions from {district.district} ({scans.length})
        </div>
        {scans.length === 0 && (
          <div style={{ color: C.sand, fontSize: 13.5 }}>No submissions logged from this district yet.</div>
        )}
        {scans.map((s, i) => {
          const sr = riskStyle(s.risk, C);
          const conf = s.confidence * 100;
          return (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderBottom: i < scans.length - 1 ? `1px solid ${C.line}` : "none" }}>
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>{s.crop}</div>
                <div style={{ fontSize: 12, color: C.sand }}>{s.predicted_class.replace(/_/g, " ")}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 12.5, color: confColor(conf, C), fontWeight: 700 }}>{conf.toFixed(0)}%</div>
                <div style={{ fontSize: 11, color: sr.color }}>{sr.icon} {s.risk}</div>
              </div>
            </div>
          );
        })}

        <button style={{ background: "transparent", border: `1px solid ${C.line}`, color: C.ivory, padding: "11px 22px", borderRadius: 4, cursor: "pointer", fontSize: 14.5, width: "100%", marginTop: 22 }} onClick={onClose}>Close</button>
      </div>
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
  const [recentScans, setRecentScans] = useState([]);

  // ---- dashboard-only state ----
  const [dashLoading, setDashLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [districtModal, setDistrictModal] = useState(null);
  const [scanSearch, setScanSearch] = useState("");
  const [scanCropFilter, setScanCropFilter] = useState("All");
  const [scanRiskFilter, setScanRiskFilter] = useState("All");
  const [scanSort, setScanSort] = useState("newest");
  const [districtSort, setDistrictSort] = useState("risk");
  const [clusters, setClusters] = useState([]);

  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const scanRef = useRef(null);
  const howRef = useRef(null);
  const insightsRef = useRef(null);

  useEffect(() => {
    fetch(`${API}/hotspots`)
      .then((r) => r.json())
      .then(setInsights)
      .catch(() => setInsights([]));
    fetch(`${API}/recent-scans`)
      .then((r) => r.json())
      .then(setRecentScans)
      .catch(() => {});
    fetch(`${API}/districts-weather`)
      .then((r) => r.json())
      .then(setDistrictsData)
      .catch(() => {});
  }, []);

  // rotating crop word for the hero headline
  const rotatingCrops = ["Tomato", "Potato", "Pepper", "Rice", "Wheat", "Cotton"];
  const [cropWordIdx, setCropWordIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setCropWordIdx((i) => (i + 1) % rotatingCrops.length), 2200);
    return () => clearInterval(id);
  }, []);

  // mouse-follow spotlight on hero
  const heroRef = useRef(null);
  const onHeroMouseMove = (e) => {
    if (!heroRef.current) return;
    const rect = heroRef.current.getBoundingClientRect();
    heroRef.current.style.setProperty("--mx", `${e.clientX - rect.left}px`);
    heroRef.current.style.setProperty("--my", `${e.clientY - rect.top}px`);
  };

  const liveTotalScans = recentScans.length;
  const liveHighRisk = districtsData.filter((d) => d.pest_disease_risk === "HIGH").length;

  const loadDashboard = () => {
    setDashLoading(true);
    Promise.allSettled([
      fetch(`${API}/districts-weather`).then((r) => r.json()),
      fetch(`${API}/recent-scans`).then((r) => r.json()),
      fetch(`${API}/hotspots`).then((r) => r.json()),
      fetch(`${API}/clusters`).then((r) => r.json()),
    ]).then(([d, s, h, c]) => {
      if (d.status === "fulfilled") setDistrictsData(d.value);
      if (s.status === "fulfilled") setRecentScans(s.value);
      if (h.status === "fulfilled") setInsights(h.value);
      if (c.status === "fulfilled") setClusters(c.value);
      setLastUpdated(new Date());
      setDashLoading(false);
    });
  };

  useEffect(() => {
    if (view !== "dashboard") return;
    loadDashboard();
    if (!autoRefresh) return;
    const id = setInterval(loadDashboard, DASHBOARD_REFRESH_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, autoRefresh]);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3000); };
  const [waking, setWaking] = useState(false);
  const wakeApi = async () => {
    setWaking(true);
    try {
      await fetch(`${API}/health`);
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
      const res = await fetch(`${API}/analyze`, { method: "POST", body: formData });
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

  /* ---------------- Dashboard derived data (all computed from real fetched state) ---------------- */

  const summary = useMemo(() => {
    const highRiskDistricts = districtsData.filter((d) => riskStyle(d.pest_disease_risk, C).weight === 3).length;
    const severeHotspots = insights.filter((h) => h.pct > 70).length;
    const totalScans = recentScans.length;
    const avgConfidence = totalScans ? (recentScans.reduce((s, r) => s + r.confidence, 0) / totalScans) * 100 : null;
    return { highRiskDistricts, severeHotspots, totalScans, avgConfidence, districtsTracked: districtsData.length };
  }, [districtsData, insights, recentScans]);

  const riskCounts = useMemo(() => {
    const counts = { High: 0, Moderate: 0, Low: 0 };
    districtsData.forEach((d) => {
      const r = riskStyle(d.pest_disease_risk, C);
      if (r.weight === 3) counts.High++;
      else if (r.weight === 2) counts.Moderate++;
      else if (r.weight === 1) counts.Low++;
    });
    return counts;
  }, [districtsData]);

  const cropCounts = useMemo(() => {
    const m = {};
    recentScans.forEach((s) => { m[s.crop] = (m[s.crop] || 0) + 1; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [recentScans]);

  const diseaseCounts = useMemo(() => {
    const m = {};
    recentScans.forEach((s) => {
      const label = s.predicted_class.replace(/_/g, " ");
      m[label] = (m[label] || 0) + 1;
    });
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [recentScans]);

  const confidenceTrend = useMemo(
    () => [...recentScans].reverse().map((s) => s.confidence * 100),
    [recentScans]
  );

  const alertItems = useMemo(() => {
    const items = [];
    districtsData.forEach((d) => {
      if (riskStyle(d.pest_disease_risk, C).weight === 3) {
        items.push({ key: `d-${d.district}`, text: `${d.district} is at high weather-driven risk (${d.temperature_C}°C, ${d.humidity_percent}% humidity) — schedule a preventive advisory.`, color: C.rust });
      }
    });
    insights.forEach((h) => {
      if (h.pct >= 80) {
        items.push({ key: `h-${h.region}`, text: `${h.region} shows a ${h.pct}% hotspot severity (${h.risk}) — prioritize an extension visit.`, color: C.rust });
      }
    });
    return items;
  }, [districtsData, insights]);

  const filteredScans = useMemo(() => {
    let rows = recentScans.filter((s) => {
      const matchesSearch = scanSearch.trim() === "" ||
        `${s.crop} ${s.district} ${s.predicted_class}`.toLowerCase().includes(scanSearch.toLowerCase());
      const matchesCrop = scanCropFilter === "All" || s.crop === scanCropFilter;
      const matchesRisk = scanRiskFilter === "All" || (s.risk || "").toLowerCase().includes(scanRiskFilter.toLowerCase());
      return matchesSearch && matchesCrop && matchesRisk;
    });
    rows = [...rows].sort((a, b) => {
      if (scanSort === "newest") return new Date(b.timestamp) - new Date(a.timestamp);
      if (scanSort === "oldest") return new Date(a.timestamp) - new Date(b.timestamp);
      if (scanSort === "confidence") return b.confidence - a.confidence;
      return 0;
    });
    return rows;
  }, [recentScans, scanSearch, scanCropFilter, scanRiskFilter, scanSort]);

  const sortedDistricts = useMemo(() => {
    return [...districtsData].sort((a, b) => {
      if (districtSort === "risk") return riskStyle(b.pest_disease_risk, C).weight - riskStyle(a.pest_disease_risk, C).weight;
      if (districtSort === "name") return a.district.localeCompare(b.district);
      if (districtSort === "temp") return (b.temperature_C ?? -999) - (a.temperature_C ?? -999);
      if (districtSort === "humidity") return (b.humidity_percent ?? -999) - (a.humidity_percent ?? -999);
      return 0;
    });
  }, [districtsData, districtSort]);

  const uniqueCrops = useMemo(() => ["All", ...new Set(recentScans.map((s) => s.crop))], [recentScans]);

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
        .district-card { transition: transform .2s ease, box-shadow .2s ease; cursor: pointer; }
        .district-card:hover { transform: translateY(-3px); box-shadow: 0 0 16px ${C.gold}33; }
        .step-box:hover .step-num { text-shadow: 0 0 16px ${C.gold}; transform: scale(1.1); }
        .step-num { transition: transform .2s, text-shadow .2s; display: inline-block; }
        .blob { position: fixed; border-radius: 50%; filter: blur(70px); opacity: .18; pointer-events: none; z-index: 0; }
        select, input.dash-input { outline: none; }
        select:focus, input.dash-input:focus { border-color: ${C.gold} !important; box-shadow: 0 0 0 2px ${C.gold}33; }
        table.scan-table th { text-align: left; font-weight: 600; color: ${C.sand}; font-size: 12px; padding: 10px 12px; border-bottom: 1px solid ${C.line}; }
        table.scan-table td { padding: 10px 12px; font-size: 13px; border-bottom: 1px solid ${C.line}; }
        table.scan-table tr:last-child td { border-bottom: none; }
        table.scan-table tr:hover td { background: ${C.surface2}; }
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
        @keyframes livePulse { 0%,100% { opacity: 1; } 50% { opacity: .35; } }
        @media (max-width: 760px) {
          .hero-grid, .insights-wrap, .scan-grid { grid-template-columns: 1fr !important; }
          .insights-grid, .stat-strip, .analytics-grid { grid-template-columns: 1fr !important; }
          .nav-links { gap: 16px !important; font-size: 13px !important; flex-wrap: wrap !important; }
          .map-frame { height: 260px !important; }
          .scan-table-wrap { overflow-x: auto; }
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

      {districtModal && (
        <DistrictModal district={districtModal} recentScans={recentScans} insights={insights} onClose={() => setDistrictModal(null)} />
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
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
            <div>
              <div style={S.kicker}>For agriculture officials</div>
              <div style={S.h2}>Regional risk dashboard</div>
              <div style={S.body}>Live weather-based risk across all tracked districts, disease hotspots and farmer-submitted scans — for planning extension visits and preventive interventions.</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 6 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, color: C.sand, cursor: "pointer" }}>
                <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
                Auto-refresh (30s)
              </label>
              <button className="btn-ghost" style={{ ...S.ghostBtn, padding: "8px 16px", fontSize: 13 }} onClick={loadDashboard} disabled={dashLoading}>
                {dashLoading ? "Refreshing…" : "Refresh now"}
              </button>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: C.sand }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: C.gold, animation: "livePulse 1.6s ease-in-out infinite" }} />
                {lastUpdated ? `Updated ${timeAgo(lastUpdated.toISOString())}` : "Loading…"}
              </div>
            </div>
          </div>

          {/* OUTBREAK CLUSTER DETECTION — auto-flags 3+ matching reports in one district within 6h */}
          {clusters.length > 0 ? (
            <Reveal style={{ ...S.glowBox, padding: 20, margin: "28px 0", border: `1px solid ${C.rust}`, boxShadow: `0 0 24px ${C.rust}44`, animation: "chipPulse 2.4s ease-in-out infinite" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                <span style={{ fontSize: 19 }}>🧬</span>
                <span style={{ fontFamily: serif, fontSize: 21, color: C.rust }}>Active outbreak clusters detected</span>
                <span style={{ color: C.sand, fontSize: 13 }}>({clusters.length})</span>
              </div>
              <div style={{ color: C.sand, fontSize: 13, marginBottom: 16 }}>
                3+ independent farmers reported the same disease in the same district within 6 hours — this crosses individual diagnosis into an early epidemic signal.
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
                {clusters.map((cl, i) => (
                  <div key={i} style={{ background: `${C.rust}18`, border: `1px solid ${C.rust}66`, borderRadius: 8, padding: "14px 16px" }}>
                    <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{cl.district}</div>
                    <div style={{ color: C.rust, fontWeight: 600, fontSize: 13.5, marginBottom: 6 }}>{cl.disease}</div>
                    <div style={{ color: C.ivory, fontSize: 13 }}>{cl.report_count} independent reports · {(cl.avg_confidence * 100).toFixed(0)}% avg confidence</div>
                    <div style={{ color: C.sand, fontSize: 12, marginTop: 6 }}>First seen {timeAgo(cl.first_seen)} · last {timeAgo(cl.last_seen)}</div>
                  </div>
                ))}
              </div>
            </Reveal>
          ) : (
            <Reveal style={{ ...S.glowBox, padding: 18, margin: "28px 0", display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: C.cane, animation: "livePulse 1.6s ease-in-out infinite", flexShrink: 0 }} />
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>🧬 Outbreak cluster engine — monitoring</div>
                <div style={{ color: C.sand, fontSize: 12.5, marginTop: 2 }}>No active clusters right now. Auto-flags when 3+ farmers report the same disease in the same district within 6 hours — {recentScans.length} submissions currently in window.</div>
              </div>
            </Reveal>
          )}
          <div className="stat-strip" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, margin: "32px 0 40px" }}>
            {[
              { label: "Districts tracked", value: summary.districtsTracked, color: C.cane, sub: "weather-monitored" },
              { label: "High-risk districts", value: summary.highRiskDistricts, color: C.rust, sub: "need attention now" },
              { label: "Severe hotspots", value: summary.severeHotspots, color: C.rust, sub: "≥ 70% activity" },
              { label: "Farmer scans logged", value: summary.totalScans, color: C.gold, sub: summary.avgConfidence != null ? `avg ${summary.avgConfidence.toFixed(0)}% confidence` : "no submissions yet" },
            ].map((s, i) => (
              <Reveal key={s.label} delay={i * 0.05}>
                <div style={{ ...S.glowBox, padding: "18px 20px" }}>
                  <div style={{ color: C.sand, fontSize: 12.5, marginBottom: 6 }}>{s.label}</div>
                  <div style={{ fontFamily: serif, fontSize: 32, color: s.color, textShadow: `0 0 10px ${s.color}44` }}>{s.value}</div>
                  <div style={{ color: C.sand, fontSize: 11.5, marginTop: 4 }}>{s.sub}</div>
                </div>
              </Reveal>
            ))}
          </div>

          {/* ALERTS PANEL */}
          {alertItems.length > 0 && (
            <Reveal style={{ ...S.glowBox, padding: 20, marginBottom: 40, borderLeft: `3px solid ${C.rust}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                <span style={{ fontSize: 17 }}>🚨</span>
                <span style={{ fontFamily: serif, fontSize: 19 }}>Needs attention</span>
                <span style={{ color: C.sand, fontSize: 13 }}>({alertItems.length})</span>
              </div>
              <div style={{ display: "grid", gap: 10 }}>
                {alertItems.map((a) => (
                  <div key={a.key} style={{ display: "flex", gap: 10, alignItems: "flex-start", background: `${a.color}14`, border: `1px solid ${a.color}44`, borderRadius: 8, padding: "10px 14px", fontSize: 13.5, color: C.ivory }}>
                    <span style={{ color: a.color }}>●</span>
                    <span>{a.text}</span>
                  </div>
                ))}
              </div>
            </Reveal>
          )}

          {/* DISTRICT CARDS */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
            <div style={S.kicker}>District weather risk</div>
            <select className="dash-input" value={districtSort} onChange={(e) => setDistrictSort(e.target.value)} style={{ background: C.bg, color: C.ivory, border: `1px solid ${C.line}`, padding: "8px 12px", borderRadius: 4, fontSize: 13 }}>
              <option value="risk">Sort by risk</option>
              <option value="name">Sort by name</option>
              <option value="temp">Sort by temperature</option>
              <option value="humidity">Sort by humidity</option>
            </select>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, marginBottom: 44 }}>
            {sortedDistricts.length === 0 && <div style={{ color: C.sand }}>Loading district data…</div>}
            {sortedDistricts.map((d, i) => {
              const risk = riskStyle(d.pest_disease_risk, C);
              const hotspot = insights.find((h) => h.region === d.district);
              return (
                <Reveal key={d.district} delay={i * 0.05}>
                  <div className="district-card" onClick={() => setDistrictModal(d)} style={{ ...S.glowBox, padding: 18, borderLeft: `3px solid ${risk.color}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div style={{ fontFamily: serif, fontSize: 19, marginBottom: 6 }}>{d.district}</div>
                      {hotspot && <div style={{ fontSize: 11.5, color: C.sand }}>{hotspot.pct}% activity</div>}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, color: risk.color, fontWeight: 700, fontSize: 13.5, marginBottom: 8 }}>
                      <span>{risk.icon}</span>{d.pest_disease_risk} risk
                      {d.trend === "rising" && <span title="Risk rising" style={{ color: C.rust, marginLeft: 4 }}>↗</span>}
                      {d.trend === "falling" && <span title="Risk falling" style={{ color: C.cane, marginLeft: 4 }}>↘</span>}
                    </div>
                    <div style={{ color: C.sand, fontSize: 13 }}>
                      {d.temperature_C != null ? `🌡️ ${d.temperature_C}°C · 💧 ${d.humidity_percent}%` : "Weather unavailable"}
                    </div>
                    <div style={{ color: C.gold, fontSize: 12, marginTop: 10, fontWeight: 600 }}>View briefing →</div>
                  </div>
                </Reveal>
              );
            })}
          </div>

          {/* ANALYTICS ROW: risk mix, crop breakdown, disease breakdown, confidence trend */}
          <div style={S.kicker}>Regional analytics</div>
          <div className="analytics-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 44 }}>
            <Reveal style={{ ...S.glowBox, padding: 20, display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{ color: C.sand, fontSize: 12.5, marginBottom: 12, alignSelf: "flex-start" }}>Risk mix across districts</div>
              <Donut segments={[
                { value: riskCounts.High, color: C.rust },
                { value: riskCounts.Moderate, color: C.gold },
                { value: riskCounts.Low, color: C.cane },
              ]} />
              <div style={{ display: "flex", gap: 12, marginTop: 14, flexWrap: "wrap", justifyContent: "center" }}>
                {[["High", C.rust], ["Moderate", C.gold], ["Low", C.cane]].map(([label, col]) => (
                  <div key={label} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: col }} />
                    <span style={{ color: C.sand }}>{label} ({riskCounts[label]})</span>
                  </div>
                ))}
              </div>
            </Reveal>

            <Reveal delay={0.05} style={{ ...S.glowBox, padding: 20 }}>
              <div style={{ color: C.sand, fontSize: 12.5, marginBottom: 14 }}>Scans by crop</div>
              {cropCounts.length === 0 && <div style={{ color: C.sand, fontSize: 13 }}>No submissions yet</div>}
              {cropCounts.map(([crop, count]) => (
                <HBar key={crop} label={crop} value={count} max={cropCounts[0]?.[1] || 1} color={C.cane} />
              ))}
            </Reveal>

            <Reveal delay={0.1} style={{ ...S.glowBox, padding: 20 }}>
              <div style={{ color: C.sand, fontSize: 12.5, marginBottom: 14 }}>Top diagnoses reported</div>
              {diseaseCounts.length === 0 && <div style={{ color: C.sand, fontSize: 13 }}>No submissions yet</div>}
              {diseaseCounts.map(([label, count]) => (
                <HBar key={label} label={label} value={count} max={diseaseCounts[0]?.[1] || 1} color={C.gold} />
              ))}
            </Reveal>

            <Reveal delay={0.15} style={{ ...S.glowBox, padding: 20 }}>
              <div style={{ color: C.sand, fontSize: 12.5, marginBottom: 14 }}>Confidence trend (submission order)</div>
              <Sparkline points={confidenceTrend} color={C.gold} />
              <div style={{ color: C.sand, fontSize: 11.5, marginTop: 10 }}>
                {confidenceTrend.length > 0 ? `Latest: ${confidenceTrend[confidenceTrend.length - 1].toFixed(0)}%` : "Waiting for submissions"}
              </div>
            </Reveal>
          </div>

          {/* HOTSPOTS */}
          <div style={S.kicker}>Current top hotspots</div>
          <div style={{ ...S.glowBox, padding: 20, marginBottom: 44 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
              {insights.length === 0 && <div style={{ color: C.sand, fontSize: 14 }}>Loading hotspot data…</div>}
              {insights.map((r, i) => {
                const col = r.pct > 70 ? C.rust : r.pct > 40 ? C.gold : C.cane;
                return (
                  <div key={r.region} style={{ background: C.surface2, border: `1px solid ${C.line}`, borderRadius: 8, padding: "12px 14px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{r.region}</span>
                      <span style={{ color: col, fontWeight: 700, fontSize: 13 }}>{r.pct}%</span>
                    </div>
                    <div style={{ color: C.sand, fontSize: 12.5 }}>{r.risk}</div>
                    <div style={{ background: C.line, borderRadius: 3, height: 5, marginTop: 8 }}>
                      <div style={{ background: col, height: 5, borderRadius: 3, width: `${r.pct}%`, transition: "width 1s ease-out" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* RECENT FIELD SUBMISSIONS: searchable, filterable, sortable table with export */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 16, marginBottom: 4 }}>
            <div>
              <div style={S.kicker}>Recent field submissions</div>
              <div style={{ ...S.body, marginBottom: 0 }}>Live feed of actual farmer uploads processed by the system — crop, AI diagnosis, confidence, and local risk at the moment of submission.</div>
            </div>
            <button className="btn-ghost" style={{ ...S.ghostBtn, padding: "9px 16px", fontSize: 13 }} onClick={() => downloadCSV(recentScans, "cropguard_recent_scans.csv")} disabled={recentScans.length === 0}>
              Export CSV
            </button>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "20px 0 16px" }}>
            <input className="dash-input" placeholder="Search crop, district or diagnosis…" value={scanSearch} onChange={(e) => setScanSearch(e.target.value)}
              style={{ background: C.bg, color: C.ivory, border: `1px solid ${C.line}`, padding: "9px 12px", borderRadius: 4, fontSize: 13.5, flex: "1 1 240px" }} />
            <select className="dash-input" value={scanCropFilter} onChange={(e) => setScanCropFilter(e.target.value)} style={{ background: C.bg, color: C.ivory, border: `1px solid ${C.line}`, padding: "9px 12px", borderRadius: 4, fontSize: 13.5 }}>
              {uniqueCrops.map((c) => <option key={c}>{c}</option>)}
            </select>
            <select className="dash-input" value={scanRiskFilter} onChange={(e) => setScanRiskFilter(e.target.value)} style={{ background: C.bg, color: C.ivory, border: `1px solid ${C.line}`, padding: "9px 12px", borderRadius: 4, fontSize: 13.5 }}>
              <option value="All">All risk levels</option>
              <option value="High">High</option>
              <option value="Moderate">Moderate</option>
              <option value="Low">Low</option>
            </select>
            <select className="dash-input" value={scanSort} onChange={(e) => setScanSort(e.target.value)} style={{ background: C.bg, color: C.ivory, border: `1px solid ${C.line}`, padding: "9px 12px", borderRadius: 4, fontSize: 13.5 }}>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="confidence">Highest confidence</option>
            </select>
          </div>

          <div className="scan-table-wrap" style={{ ...S.glowBox, padding: 0, overflow: "hidden" }}>
            {filteredScans.length === 0 && (
              <div style={{ color: C.sand, padding: 20 }}>
                {recentScans.length === 0 ? "No submissions yet — results appear here as farmers scan crops." : "No submissions match these filters."}
              </div>
            )}
            {filteredScans.length > 0 && (
              <table className="scan-table" style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
                <thead>
                  <tr>
                    <th>Crop / district</th>
                    <th>Diagnosis</th>
                    <th>Confidence</th>
                    <th>Risk</th>
                    <th>When</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredScans.map((s, i) => {
                    const risk = riskStyle(s.risk, C);
                    const conf = s.confidence * 100;
                    const cCol = confColor(conf, C);
                    return (
                      <tr key={i} style={{ animation: `fadeInUp .35s ease-out ${Math.min(i, 10) * 0.02}s both` }}>
                        <td style={{ fontWeight: 600 }}>{s.crop} <span style={{ color: C.sand, fontWeight: 400 }}>· {s.district}</span></td>
                        <td>{s.predicted_class.replace(/_/g, " ")}</td>
                        <td style={{ color: cCol, fontWeight: 700 }}>{conf.toFixed(0)}%</td>
                        <td style={{ color: risk.color }}>{risk.icon} {s.risk}</td>
                        <td style={{ color: C.sand, whiteSpace: "nowrap" }}>{timeAgo(s.timestamp)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          <div style={{ color: C.sand, fontSize: 12, marginTop: 10 }}>
            Showing {filteredScans.length} of {recentScans.length} logged submissions.
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

                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
                    <div style={{ color: C.sand, fontSize: 13 }}>Expert advisory</div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="btn-ghost" style={{ ...S.ghostBtn, padding: "6px 12px", fontSize: 12.5 }}
                        onClick={() => {
                          const parsed = parseAdvisory(result.advisory);
                          const english = parsed.filter((s) => !/marathi|सारांश/i.test(s.title)).map((s) => `${s.title}. ${s.body}`).join(". ");
                          if (!speakText(english, "en-IN")) showToast("Voice playback not supported on this device");
                        }}>🔊 Listen (English)</button>
                      <button className="btn-ghost" style={{ ...S.ghostBtn, padding: "6px 12px", fontSize: 12.5 }}
                        onClick={() => {
                          const parsed = parseAdvisory(result.advisory);
                          const mr = parsed.find((s) => /marathi|सारांश/i.test(s.title));
                          if (!mr || !speakText(mr.body, "mr-IN")) showToast("Marathi voice not supported on this device");
                        }}>🔊 ऐका (मराठी)</button>
                    </div>
                  </div>
                  <div>
                    {(() => {
                      const parsed = parseAdvisory(result.advisory);
                      const hasContent = parsed.length > 0 && parsed.some((s) => s.body && s.body.trim());
                      if (!hasContent) {
                        return (
                          <div style={{ background: C.surface2, border: `1px solid ${C.line}`, borderLeft: `3px solid ${C.gold}`, borderRadius: 8, padding: "14px 16px", fontSize: 14.5, color: C.ivory, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>
                            {result.advisory && result.advisory.trim() ? result.advisory : "No advisory text was returned for this result."}
                          </div>
                        );
                      }
                      return parsed.map((s, i) => (
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
                      ));
                    })()}
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