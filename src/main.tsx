import React, {
  useState,
  useEffect,
  useCallback,
  createContext,
  useContext,
  useRef,
} from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Routes,
  Route,
  NavLink,
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import axios from "axios";
import { useDropzone } from "react-dropzone";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  PieChart,
  Pie,
} from "recharts";
import { ReactFlow, Background, Controls, MarkerType } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Box,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  ClipboardCheck,
  Clock3,
  FileText,
  FlaskConical,
  Focus,
  GitBranch,
  ImagePlus,
  LayoutDashboard,
  Loader2,
  LogOut,
  Menu,
  Microscope,
  MoreHorizontal,
  Package,
  Plus,
  ScanLine,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  TriangleAlert,
  X,
  XCircle,
  Eye,
  Layers,
} from "lucide-react";
import "./styles.css";

type Row = Record<string, any>;
const hosted = !["localhost", "127.0.0.1"].includes(window.location.hostname);
const maximumImageMB = hosted ? 4 : 15;
const api = axios.create({
  baseURL: "/api",
  headers: { "X-Requested-With": "PharmaInspect" },
});
const colors = ["#217864", "#e2ab53", "#c56a60", "#8e9a96", "#7392a8"];
const Auth = createContext<{ role: string; refresh: () => void }>({
  role: "",
  refresh: () => {},
});
function errorMessage(error: any): string {
  const detail = error.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail
      .map((item: Row) => `${item.loc?.join(".") || "Input"}: ${item.msg}`)
      .join("; ");
  return error.message || "The request could not be completed.";
}
function useData(path: string) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const pending = useRef<AbortController | null>(null);
  const refresh = useCallback(() => {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setError("");
    api
      .get(path, { signal: controller.signal })
      .then((r) => setData(r.data))
      .catch((e) => {
        if (!axios.isCancel(e)) setError(errorMessage(e));
      });
  }, [path]);
  useEffect(() => {
    setData(null);
    refresh();
    return () => pending.current?.abort();
  }, [refresh]);
  return { data, error, refresh };
}
function ErrorBox({ message }: { message: string }) {
  return message ? (
    <div className="error" role="alert">
      <TriangleAlert size={17} />
      {message}
    </div>
  ) : null;
}
function Loading() {
  return (
    <div className="loading">
      <Loader2 className="spin" size={20} /> Loading workspace…
    </div>
  );
}
function Badge({ status }: { status: string }) {
  return (
    <span
      className={`badge ${status === "PASS" || status === "MATCH" || status === "COMPLETED" || status === "APPROVED" ? "good" : status === "FAIL" || status === "ERROR" || status === "MISMATCH" || status === "REJECTED" ? "bad" : status === "RUNNING" ? "active" : "warn"}`}
    >
      <i />
      {status.toLowerCase().replaceAll("_", " ")}
    </span>
  );
}
function Empty({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <ScanLine size={28} />
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
function PageTitle({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}
function download(path: string) {
  window.open("/api" + path, "_blank", "noopener");
}
function time(value: string) {
  const utc = /Z$|[+-]\d{2}:\d{2}$/.test(value) ? value : value + "Z";
  return (
    new Date(utc).toLocaleString("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Kolkata",
    }) + " IST"
  );
}
function App() {
  const [role, setRole] = useState("");
  const [checking, setChecking] = useState(true);
  const refresh = () =>
    api
      .get("/auth/me")
      .then((r) => setRole(r.data.role))
      .catch(() => setRole(""))
      .finally(() => setChecking(false));
  useEffect(() => {
    refresh();
  }, []);
  return (
    <Auth.Provider value={{ role, refresh }}>
      <BrowserRouter>
        {checking ? (
          <Loading />
        ) : (
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/*" element={role ? <Shell /> : <Login />} />
          </Routes>
        )}
      </BrowserRouter>
    </Auth.Provider>
  );
}
function Logo() {
  return (
    <div className="logo">
      <span className="logo-mark">
        <ScanLine size={24} />
      </span>
      <div>
        PharmaInspect<span>AI</span>
      </div>
    </div>
  );
}
function Landing() {
  return (
    <div className="landing">
      <nav>
        <Logo />
        <div>
          <a href="#capabilities">Capabilities</a>
          <a href="#workflow">How it works</a>
          <Link className="btn primary" to="/dashboard">
            Open workspace <ArrowUpRight size={16} />
          </Link>
        </div>
      </nav>
      <main>
        <div className="hero-copy">
          <div className="eyebrow">
            <span className="live-dot" /> VISION. EVIDENCE. CONFIDENCE.
          </div>
          <h1>
            A closer look.
            <br />A clearer <em>decision.</em>
          </h1>
          <p>
            Image-grounded intelligence for pharmaceutical packaging. Bring
            visual inspection, label verification, and human expertise into one
            traceable workflow.
          </p>
          <Link to="/dashboard" className="btn primary large">
            Start inspecting <ArrowRight size={18} />
          </Link>
          <span className="hero-note">
            <ShieldCheck size={16} /> Designed for research. Built around human
            review.
          </span>
        </div>
        <div className="hero-visual">
          <div className="scan-corner tl" />
          <div className="scan-corner tr" />
          <div className="scan-corner bl" />
          <div className="scan-corner br" />
          <div className="visual-top">
            <span className="live-dot" /> PACKAGING INTELLIGENCE{" "}
            <span>01 / 10</span>
          </div>
          <Carton />
          <div className="visual-caption">
            <span>
              <Focus size={17} /> Evidence comes first
            </span>
            <span>Human oversight, always</span>
          </div>
        </div>
      </main>
      <section id="capabilities" className="features">
        <div>
          <Focus />
          <h3>See the evidence</h3>
          <p>
            Image quality measurements and traceable regions, with clear
            baseline limitations.
          </p>
        </div>
        <div>
          <FileText />
          <h3>Verify every field</h3>
          <p>
            Compare printed identity, strength, batch, and dates against
            versioned specifications.
          </p>
        </div>
        <div>
          <GitBranch />
          <h3>Follow the reasoning</h3>
          <p>
            Ten specialized workflow stages with real execution logs and
            reviewable outcomes.
          </p>
        </div>
      </section>
      <section id="workflow" className="landing-bottom">
        <span>01 &nbsp; Capture</span>
        <ChevronRight />
        <span>02 &nbsp; Inspect</span>
        <ChevronRight />
        <span>03 &nbsp; Verify</span>
        <ChevronRight />
        <span>04 &nbsp; Human review</span>
      </section>
      <footer>
        PharmaInspect AI · Academic research prototype. Does not replace
        validated inspection or authorize product release.
      </footer>
    </div>
  );
}
function Carton() {
  return (
    <svg
      viewBox="0 0 530 390"
      className="carton-art"
      role="img"
      aria-label="Illustrative pharmaceutical carton; not an inspection result"
    >
      <defs>
        <linearGradient id="box" x1="0" x2="1">
          <stop stopColor="#fff" />
          <stop offset="1" stopColor="#e7ebe6" />
        </linearGradient>
        <filter id="shadow">
          <feDropShadow dx="0" dy="15" stdDeviation="16" floodOpacity=".12" />
        </filter>
      </defs>
      <ellipse
        cx="268"
        cy="330"
        rx="160"
        ry="23"
        fill="#c7d8cd"
        opacity=".35"
      />
      <g filter="url(#shadow)">
        <path d="M125 105 364 68 409 111 174 151Z" fill="#fafbf7" />
        <path d="M174 151 409 111 409 291 174 333Z" fill="url(#box)" />
        <path d="M125 105 174 151 174 333 125 281Z" fill="#d8e0d9" />
        <path d="M174 151 409 111 409 150 174 193Z" fill="#277563" />
        <path d="M125 105 174 151 174 193 125 147Z" fill="#164d41" />
        <g transform="matrix(1,-.17,0,1,196,218)">
          <text
            fontSize="23"
            fontFamily="Arial"
            fontWeight="700"
            fill="#234d40"
          >
            Paracetamol
          </text>
          <text y="27" fontSize="17" fontFamily="Arial" fill="#40705b">
            500 mg
          </text>
          <text y="53" fontSize="10" fontFamily="Arial" fill="#73827b">
            TABLETS · ORAL USE
          </text>
          <path d="M0 68h153" stroke="#c0cec4" />
          <text y="86" fontSize="8" fontFamily="monospace" fill="#7c877e">
            ILLUSTRATIVE PACKAGING
          </text>
        </g>
      </g>
      <path
        d="M182 151 417 109 417 295 180 338Z"
        fill="none"
        stroke="#308a71"
        strokeDasharray="6 5"
      />
      <g transform="translate(310 43)">
        <rect width="153" height="29" rx="6" fill="#fff" />
        <circle cx="13" cy="14" r="3" fill="#298168" />
        <text x="24" y="18" fontSize="10" fontFamily="Arial" fill="#346453">
          Illustrative packaging region
        </text>
      </g>
      <path d="m371 74 11 39" stroke="#308a71" />
      <g transform="translate(56 263)">
        <rect width="131" height="31" rx="6" fill="#fff" />
        <text x="12" y="20" fontSize="10" fontFamily="Arial" fill="#346453">
          Traceable visual evidence
        </text>
      </g>
    </svg>
  );
}
function Login() {
  const { refresh } = useContext(Auth);
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("admin");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  return (
    <div className="login">
      <Link to="/">
        <Logo />
      </Link>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await api.post("/auth/login", { role, password });
            refresh();
            navigate("/dashboard");
          } catch (e: any) {
            setError(errorMessage(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="eyebrow">RESEARCH WORKSPACE</div>
        <h1>Welcome to a closer look.</h1>
        <p>Sign in to inspect packaging and review the evidence.</p>
        <label>
          Workspace role
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="admin">Administrator</option>
            <option value="reviewer">Quality reviewer</option>
          </select>
        </label>
        <label>
          Password
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </label>
        <ErrorBox message={error} />
        <button className="btn primary" disabled={busy}>
          {busy ? (
            <Loader2 className="spin" size={17} />
          ) : (
            <>
              Open workspace <ArrowRight size={17} />
            </>
          )}
        </button>
        <div className="dev-note">
          {hosted ? (
            "Use the private workspace credentials supplied by your administrator."
          ) : (
            <>
              Local setup: administrator password <code>research-only</code>;
              reviewer password <code>review-only</code>. Set environment
              credentials before any shared deployment.
            </>
          )}
        </div>
      </form>
      <footer>
        Academic research prototype · Authorized human review required
      </footer>
    </div>
  );
}
const navigation = [
  ["/dashboard", "Overview", LayoutDashboard],
  ["/inspect", "Inspection workspace", ScanLine],
  ["/products", "Product library", Package],
  ["/history", "Inspection history", ClipboardCheck],
  ["/agents", "Agent workflow", GitBranch],
  ["/analytics", "Analytics & reports", Activity],
] as const;
function Shell() {
  const [open, setOpen] = useState(false);
  const { role, refresh } = useContext(Auth);
  return (
    <div className="app-shell">
      <aside className={open ? "sidebar open" : "sidebar"}>
        <button
          className="icon-btn mobile-nav-close"
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
        >
          <X size={19} />
        </button>
        <Link to="/" className="brand-link">
          <Logo />
        </Link>
        <div className="workspace-label">
          QUALITY INTELLIGENCE <span>WORKSPACE</span>
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {navigation.map(([href, label, Icon]) => (
            <NavLink key={href} to={href} onClick={() => setOpen(false)}>
              <Icon size={19} />
              {label}
              {href === "/inspect" && <span className="nav-new">NEW</span>}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="baseline-note">
            <div>
              <span className="live-dot" /> RESEARCH BASELINE
            </div>
            <p>
              Evidence-led inspection.
              <br />
              Human decisions.
            </p>
            <Link to="/settings">
              View configuration <ArrowUpRight size={14} />
            </Link>
          </div>
          <NavLink className="settings-link" to="/settings">
            <Settings2 size={18} /> Settings
          </NavLink>
          <button
            className="profile"
            onClick={async () => {
              await api.post("/auth/logout");
              refresh();
            }}
            title="Sign out"
          >
            <span className="avatar">{role === "admin" ? "AD" : "QR"}</span>
            <span>
              {role === "admin" ? "Administrator" : "Quality reviewer"}
              <small>Research workspace</small>
            </span>
            <LogOut size={15} />
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <button
            className="icon-btn mobile-menu"
            aria-label="Toggle navigation"
            onClick={() => setOpen(!open)}
          >
            <Menu size={20} />
          </button>
          <span>
            Workspace <ChevronRight size={14} />{" "}
            <b>Pharmaceutical quality control</b>
          </span>
          <div>
            <span className="prototype-tag">
              <FlaskConical size={13} /> Research prototype
            </span>
            <Link to="/settings" title="Configuration">
              <CircleHelp size={18} />
            </Link>
          </div>
        </header>
        <main className="main-content">
          <Routes>
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="products" element={<Products />} />
            <Route path="inspect" element={<Workspace />} />
            <Route path="inspections/:id" element={<InspectionDetail />} />
            <Route path="history" element={<History />} />
            <Route path="agents" element={<Agents />} />
            <Route path="analytics" element={<Analytics />} />
            <Route path="settings" element={<Settings />} />
            <Route
              path="*"
              element={
                <Empty
                  title="Page not found"
                  description="Choose a workspace page from the navigation."
                />
              }
            />
          </Routes>
        </main>
        <footer className="app-footer">
          <span>
            <ShieldCheck size={13} /> Decision support only. Final disposition
            requires authorized human review.
          </span>
          <span>
            PharmaInspect AI <i /> v0.1.0
          </span>
        </footer>
      </div>
    </div>
  );
}
function Stats({ data }: { data: Row }) {
  return (
    <div className="stats-grid">
      {[
        ["Total inspections", data.total, ScanLine, "All recorded inspections"],
        [
          "Passed inspections",
          data.passed,
          CheckCircle2,
          "No configured findings",
        ],
        ["Requires review", data.review, Eye, "Human assessment needed"],
        [
          "Failed inspections",
          data.failed,
          XCircle,
          "Configured criteria detected",
        ],
      ].map(([label, value, Icon, note]: any, i) => (
        <div className="stat-card" key={label}>
          <div>
            {label}
            <span className={`stat-icon s${i}`}>
              <Icon size={18} />
            </span>
          </div>
          <strong>{String(value).padStart(2, "0")}</strong>
          <small>
            <span className={`stat-dot s${i}`} />
            {note}
          </small>
        </div>
      ))}
    </div>
  );
}
function InspectionTable({ rows }: { rows: Row[] }) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>INSPECTION / PRODUCT</th>
            <th>PACKAGING</th>
            <th>DATE & TIME</th>
            <th>OUTCOME</th>
            <th>FINDINGS</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((i) => (
            <tr key={i.id}>
              <td>
                <Link className="table-product" to={`/inspections/${i.id}`}>
                  <span className="product-icon">
                    <Box size={19} />
                  </span>
                  <span>
                    {i.product_name}
                    <small>
                      INS-{i.id.slice(0, 8).toUpperCase()} · Spec v
                      {i.specification_version}
                    </small>
                  </span>
                </Link>
              </td>
              <td>{i.packaging}</td>
              <td>{time(i.created_at)}</td>
              <td>
                <Badge status={i.status} />
              </td>
              <td>{i.defect_count ?? "—"}</td>
              <td>
                <Link aria-label="View inspection" to={`/inspections/${i.id}`}>
                  <ArrowUpRight size={17} />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function Trend({ data }: { data: Row[] }) {
  return data.length ? (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart
        data={data}
        margin={{ top: 15, right: 8, left: -28, bottom: 0 }}
      >
        <defs>
          <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
            <stop stopColor="#2a8069" stopOpacity={0.2} />
            <stop offset="1" stopColor="#2a8069" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid
          strokeDasharray="3 4"
          vertical={false}
          stroke="#e9ede9"
        />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11, fill: "#8a9690" }}
        />
        <YAxis
          allowDecimals={false}
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11, fill: "#8a9690" }}
        />
        <Tooltip />
        <Area
          dataKey="inspections"
          name="Inspections"
          type="monotone"
          stroke="#2b7964"
          strokeWidth={2.5}
          fill="url(#area)"
        />
      </AreaChart>
    </ResponsiveContainer>
  ) : (
    <div className="chart-empty">
      <Activity size={28} />
      <span>Your inspection trends start here</span>
      <small>Run your first inspection to see activity over time.</small>
    </div>
  );
}
function Dashboard() {
  const { data, error } = useData("/analytics/dashboard");
  if (error) return <ErrorBox message={error} />;
  if (!data) return <Loading />;
  return (
    <>
      <PageTitle
        eyebrow="YOUR QUALITY CONTROL, AT A GLANCE"
        title="Inspection overview"
        description="Every package tells a story. Make every inspection count."
        action={
          <Link className="btn primary" to="/inspect">
            <Plus size={17} /> New inspection
          </Link>
        }
      />
      <div className="research-banner">
        <span>
          <FlaskConical size={17} />
          <b>Research mode</b>
          <span>
            Research vision baseline is active. Findings require qualified human
            review.
          </span>
        </span>
        <Link to="/settings">
          View setup <ArrowUpRight size={15} />
        </Link>
      </div>
      <Stats data={data} />
      <div className="dashboard-charts">
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Inspection activity</h2>
              <p>Recorded volume across the last 30 active days</p>
            </div>
            <span className="subtle-tag">
              <span className="legend-dot" /> All inspections
            </span>
          </div>
          <Trend data={data.trends} />
        </section>
        <section className="panel distribution">
          <div className="panel-head">
            <div>
              <h2>Inspection outcomes</h2>
              <p>Decision-support distribution</p>
            </div>
            <MoreHorizontal size={19} />
          </div>
          {data.total ? (
            <>
              <div className="donut">
                <ResponsiveContainer width="100%" height={174}>
                  <PieChart>
                    <Pie
                      data={data.distribution}
                      dataKey="value"
                      innerRadius={57}
                      outerRadius={76}
                      paddingAngle={3}
                      stroke="none"
                    >
                      {data.distribution.map((_: Row, i: number) => (
                        <Cell key={i} fill={colors[i % colors.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div>
                  <strong>{data.total}</strong>
                  <small>INSPECTIONS</small>
                </div>
              </div>
              <div className="distribution-legend">
                {data.distribution.map((d: Row, i: number) => (
                  <span key={d.name}>
                    <i style={{ background: colors[i % colors.length] }} />
                    {d.name.toLowerCase()}
                    <b>{d.value}</b>
                  </span>
                ))}
              </div>
            </>
          ) : (
            <div className="zero-donut">
              <span>
                0<small>INSPECTIONS</small>
              </span>
              <p>No outcomes recorded yet</p>
            </div>
          )}
        </section>
      </div>
      <section className="panel recent-panel">
        <div className="panel-head">
          <div>
            <h2>
              Recent inspections{" "}
              <span className="count-tag">{data.recent.length}</span>
            </h2>
            <p>A traceable record of your latest packaging checks</p>
          </div>
          <Link className="text-link" to="/history">
            View all history <ArrowRight size={15} />
          </Link>
        </div>
        {data.recent.length ? (
          <InspectionTable rows={data.recent} />
        ) : (
          <Empty
            title="Your first inspection starts here"
            description="Select a product, upload packaging images, and follow the evidence from capture to review."
            action={
              <Link to="/inspect" className="btn secondary">
                Create an inspection <ArrowRight size={16} />
              </Link>
            }
          />
        )}
      </section>
      <div className="workflow-strip">
        <div className="workflow-strip-icon">
          <GitBranch size={24} />
        </div>
        <div>
          <h3>Ten specialists. One traceable workflow.</h3>
          <p>
            From image validation to a reviewable report, follow every stage of
            the inspection.
          </p>
        </div>
        <Link className="text-link" to="/agents">
          Explore agents <ArrowUpRight size={16} />
        </Link>
      </div>
    </>
  );
}

function Products() {
  const { role } = useContext(Auth);
  const { data, error, refresh } = useData("/products");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Row | null>(null);
  const [history, setHistory] = useState<Row[] | null>(null);
  return (
    <>
      <PageTitle
        eyebrow="THE REFERENCE FOR EVERY INSPECTION"
        title="Product library"
        description="Define what correct packaging looks like. Keep every specification version."
        action={
          role === "admin" && (
            <button className="btn primary" onClick={() => setEditing({})}>
              <Plus size={16} /> Register product
            </button>
          )
        }
      />
      <ErrorBox message={error} />
      <div className="toolbar">
        <div className="search-input">
          <Search size={17} />
          <input
            placeholder="Search products…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <span className="muted">
          {data?.length || 0} products in your library
        </span>
      </div>
      <div className="product-grid">
        {data
          ?.filter((p: Row) =>
            p.name.toLowerCase().includes(query.toLowerCase()),
          )
          .map((p: Row) => (
            <article className="panel product-card" key={p.id}>
              <div className="product-card-top">
                <span className="large-product-icon">
                  <Package size={28} />
                </span>
                <span className="subtle-tag">{p.packaging}</span>
              </div>
              <h2>{p.name}</h2>
              <p>
                {p.specification.data.expected.strength ||
                  "Strength not specified"}{" "}
                ·{" "}
                {p.specification.data.expected.dosage_form ||
                  "Dosage form not specified"}
              </p>
              <div className="product-meta">
                <span>
                  Specification <b>Version {p.specification.version}</b>
                </span>
                <span>
                  Required fields{" "}
                  <b>{p.specification.data.required_fields.length}</b>
                </span>
                <span>
                  Security seal{" "}
                  <b>
                    {p.specification.data.seal_required
                      ? "Required"
                      : "Not configured"}
                  </b>
                </span>
              </div>
              <div className="product-actions">
                <Link to={`/inspect?product=${p.id}`} className="text-link">
                  Inspect product <ArrowRight size={15} />
                </Link>
                <button
                  className="icon-btn"
                  title="Specification history"
                  onClick={async () =>
                    setHistory(
                      (await api.get(`/products/${p.id}/specifications`)).data,
                    )
                  }
                >
                  <Clock3 size={17} />
                </button>
                {role === "admin" && (
                  <button
                    className="icon-btn"
                    title="Edit specification"
                    onClick={() => setEditing(p)}
                  >
                    <SlidersHorizontal size={17} />
                  </button>
                )}
              </div>
            </article>
          ))}
      </div>
      {editing && (
        <ProductEditor
          product={editing}
          onClose={() => setEditing(null)}
          onSave={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}
      {history && (
        <Modal
          title="Specification version history"
          onClose={() => setHistory(null)}
        >
          {history.map((s) => (
            <div className="version-item" key={s.id}>
              <h3>
                Version {s.version} <small>{time(s.created_at)}</small>
              </h3>
              <pre>{JSON.stringify(s.data, null, 2)}</pre>
            </div>
          ))}
        </Modal>
      )}
    </>
  );
}
function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const dialog = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const focusable = () =>
      Array.from(
        dialog.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]",
        ) || [],
      );
    focusable()[0]?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") close.current();
      if (event.key === "Tab") {
        const items = focusable();
        if (event.shiftKey && document.activeElement === items[0]) {
          event.preventDefault();
          items.at(-1)?.focus();
        } else if (!event.shiftKey && document.activeElement === items.at(-1)) {
          event.preventDefault();
          items[0]?.focus();
        }
      }
    };
    document.addEventListener("keydown", keyboard);
    return () => {
      document.removeEventListener("keydown", keyboard);
      previous?.focus();
    };
  }, []);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        ref={dialog}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2>{title}</h2>
          <button
            className="icon-btn"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
function ProductEditor({
  product,
  onClose,
  onSave,
}: {
  product: Row;
  onClose: () => void;
  onSave: () => void;
}) {
  const spec = product.specification?.data || {};
  const [name, setName] = useState(product.name || "");
  const [packaging, setPackaging] = useState(product.packaging || "Carton");
  const [expected, setExpected] = useState<Row>(
    spec.expected || {
      product_name: "",
      strength: "",
      dosage_form: "",
      manufacturer: "",
    },
  );
  const [required, setRequired] = useState<string[]>(
    spec.required_fields || [
      "product_name",
      "strength",
      "batch_number",
      "manufacturing_date",
      "expiry_date",
    ],
  );
  const [seal, setSeal] = useState(spec.seal_required || false);
  const [components, setComponents] = useState(
    (spec.expected_components || ["carton", "label"]).join(", "),
  );
  const [barcode, setBarcode] = useState(spec.barcode || "");
  const [formats, setFormats] = useState(
    (spec.date_formats || ["%Y-%m-%d", "%m/%Y"]).join(", "),
  );
  const [reference, setReference] = useState(spec.reference_image_id || "");
  const [reject, setReject] = useState(spec.fail_on_mismatch ?? true);
  const [threshold, setThreshold] = useState(
    spec.minimum_ocr_confidence ?? 0.6,
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      title={product.id ? "Edit product specification" : "Register product"}
      onClose={onClose}
    >
      <form
        className="form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const body = {
              name,
              packaging,
              specification: {
                expected: Object.fromEntries(
                  Object.entries(expected).filter(([, v]) => v),
                ),
                required_fields: required,
                seal_required: seal,
                expected_components: components
                  .split(",")
                  .map((s: string) => s.trim())
                  .filter(Boolean),
                barcode,
                date_formats: formats
                  .split(",")
                  .map((s: string) => s.trim())
                  .filter(Boolean),
                reference_image_id: reference || null,
                fail_on_mismatch: reject,
                minimum_ocr_confidence: threshold,
              },
            };
            await api[product.id ? "put" : "post"](
              product.id ? `/products/${product.id}` : "/products",
              body,
            );
            onSave();
          } catch (e: any) {
            setError(
              typeof e.response?.data?.detail === "string"
                ? e.response.data.detail
                : JSON.stringify(e.response?.data?.detail) || e.message,
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="form-grid">
          <label>
            Product name
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            Packaging type
            <select
              value={packaging}
              onChange={(e) => setPackaging(e.target.value)}
            >
              {[
                "Carton",
                "Bottle",
                "Blister pack",
                "Label",
                "Vial",
                "Ampoule",
                "Sachet",
                "Pouch",
              ].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
        </div>
        <h3>Expected printed information</h3>
        <div className="form-grid">
          {[
            "product_name",
            "generic_name",
            "strength",
            "dosage_form",
            "manufacturer",
            "batch_number",
            "manufacturing_date",
            "expiry_date",
            "storage",
            "composition",
          ].map((field) => (
            <label key={field}>
              {field.replaceAll("_", " ")}
              <input
                value={expected[field] || ""}
                onChange={(e) =>
                  setExpected({ ...expected, [field]: e.target.value })
                }
              />
            </label>
          ))}
        </div>
        <h3>Required visible fields</h3>
        <div className="checkbox-group">
          {[
            "product_name",
            "strength",
            "batch_number",
            "manufacturing_date",
            "expiry_date",
            "manufacturer",
          ].map((f) => (
            <label key={f}>
              <input
                type="checkbox"
                checked={required.includes(f)}
                onChange={(e) =>
                  setRequired(
                    e.target.checked
                      ? [...required, f]
                      : required.filter((x) => x !== f),
                  )
                }
              />
              {f.replaceAll("_", " ")}
            </label>
          ))}
        </div>
        <label>
          Expected components (comma separated)
          <input
            value={components}
            onChange={(e) => setComponents(e.target.value)}
          />
        </label>
        <div className="form-grid">
          <label>
            Expected barcode / QR content
            <input
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
            />
          </label>
          <label>
            OCR review threshold (0–1)
            <input
              type="number"
              min="0"
              max="1"
              step="0.05"
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
            />
          </label>
        </div>
        <label>
          Explicit date formats (comma separated)
          <input value={formats} onChange={(e) => setFormats(e.target.value)} />
          <small>
            %Y-%m-%d · %d/%m/%Y · %m/%d/%Y · %m/%Y · %m-%Y · %d-%m-%Y · %Y/%m/%d
            · %b %Y
          </small>
        </label>
        <label>
          Reference packaging image
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={async (e) => {
              if (e.target.files?.[0]) {
                const form = new FormData();
                form.append("file", e.target.files[0]);
                try {
                  setReference(
                    (await api.post("/images/upload", form)).data.id,
                  );
                } catch (err: any) {
                  setError(err.message);
                }
              }
            }}
          />
          {reference && (
            <small>
              <Check size={12} /> Reference image attached
            </small>
          )}
        </label>
        <div className="checkbox-group">
          <label>
            <input
              type="checkbox"
              checked={seal}
              onChange={(e) => setSeal(e.target.checked)}
            />
            Security seal required
          </label>
          <label>
            <input
              type="checkbox"
              checked={reject}
              onChange={(e) => setReject(e.target.checked)}
            />
            Fail on confirmed specification mismatch
          </label>
        </div>
        <div className="notice">
          Saving creates a new, immutable specification version. Existing
          inspections retain their original version.
        </div>
        <ErrorBox message={error} />
        <div className="form-actions">
          <button type="button" className="btn secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={busy}>
            {busy ? "Saving…" : "Save specification"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Workspace() {
  const { data: products, error: productsError } = useData("/products");
  const [params] = useSearchParams();
  const [product, setProduct] = useState(params.get("product") || "");
  const [images, setImages] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  useEffect(() => {
    if (products?.length && !product) setProduct(products[0].id);
  }, [products, product]);
  const upload = useCallback(async (files: File[]) => {
    setError("");
    setBusy(true);
    try {
      const uploaded: Row[] = [];
      for (const file of files) {
        const form = new FormData();
        form.append("file", file);
        uploaded.push((await api.post("/images/upload", form)).data);
      }
      setImages((old) => [...old, ...uploaded].slice(0, 8));
    } catch (e: any) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }, []);
  const drop = useDropzone({
    onDrop: upload,
    onDropRejected: () =>
      setError(
        `Use JPG, PNG or WEBP files under ${maximumImageMB} MB. Maximum 8 images per inspection.`,
      ),
    accept: {
      "image/jpeg": [".jpg", ".jpeg"],
      "image/png": [".png"],
      "image/webp": [".webp"],
    },
    maxSize: maximumImageMB * 1024 * 1024,
    maxFiles: 8,
    disabled: busy || images.length >= 8,
  });
  const selected = products?.find((p: Row) => p.id === product);
  return (
    <>
      <PageTitle
        eyebrow="FROM IMAGE TO INSIGHT"
        title="Inspection workspace"
        description="Capture the package. Check the details. Keep the evidence."
      />
      <div className="step-bar">
        <span className="selected">
          <b>01</b> Select product
        </span>
        <ChevronRight size={17} />
        <span className={images.length ? "selected" : ""}>
          <b>02</b> Add images
        </span>
        <ChevronRight size={17} />
        <span>
          <b>03</b> Inspect & review
        </span>
      </div>
      <ErrorBox message={error || productsError} />
      <div className="inspection-layout">
        <div>
          <section className="panel workspace-panel">
            <div className="panel-head">
              <div>
                <h2>
                  <span className="step-number">1</span> Product & specification
                </h2>
                <p>
                  Inspection rules are pinned to this specification version.
                </p>
              </div>
              <Package size={20} />
            </div>
            <label className="workspace-select">
              Product
              <select
                value={product}
                onChange={(e) => setProduct(e.target.value)}
              >
                <option value="" disabled>
                  Select a product
                </option>
                {products?.map((p: Row) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ·{" "}
                    {p.specification.data.expected.strength || p.packaging}
                  </option>
                ))}
              </select>
            </label>
            {selected && (
              <div className="spec-summary">
                <span>
                  <small>PACKAGING</small>
                  {selected.packaging}
                </span>
                <span>
                  <small>SPECIFICATION</small>Version{" "}
                  {selected.specification.version}
                </span>
                <span>
                  <small>REQUIRED FIELDS</small>
                  {selected.specification.data.required_fields.length}{" "}
                  configured
                </span>
              </div>
            )}
          </section>
          <section className="panel workspace-panel">
            <div className="panel-head">
              <div>
                <h2>
                  <span className="step-number">2</span> Packaging images
                </h2>
                <p>
                  Use sharp, evenly lit images with all required information
                  visible.
                </p>
              </div>
              <span className="count-tag">{images.length} / 8</span>
            </div>
            <div
              {...drop.getRootProps()}
              className={`dropzone ${drop.isDragActive ? "dragging" : ""}`}
            >
              <input
                {...drop.getInputProps()}
                aria-label="Upload packaging images"
              />
              <span className="upload-icon">
                {busy ? (
                  <Loader2 className="spin" size={25} />
                ) : (
                  <ImagePlus size={27} />
                )}
              </span>
              <h3>
                {drop.isDragActive
                  ? "Drop your images here"
                  : "Drop packaging images here"}
              </h3>
              <p>
                or <b>browse files</b> to upload
              </p>
              <small>
                JPG, PNG, WEBP · Up to {maximumImageMB} MB each · Maximum 8
                images
              </small>
            </div>
            {images.length > 0 && (
              <div className="image-grid">
                {images.map((image) => (
                  <div key={image.id}>
                    <img src={image.url} alt={image.filename} />
                    <button
                      className="icon-btn"
                      title="Remove image"
                      onClick={() =>
                        setImages(images.filter((i) => i.id !== image.id))
                      }
                    >
                      <X size={15} />
                    </button>
                    <span>{image.filename}</span>
                    <small>
                      {image.meta.width} × {image.meta.height}
                    </small>
                  </div>
                ))}
              </div>
            )}
            <div className="workspace-actions">
              <span>
                <ShieldCheck size={15} /> Original images are preserved
              </span>
              <button
                className="btn primary"
                disabled={busy || !images.length || !product}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const i = (
                      await api.post("/inspections", {
                        product_id: product,
                        image_ids: images.map((x) => x.id),
                      })
                    ).data;
                    await api.post(`/inspections/${i.id}/run`);
                    navigate(`/inspections/${i.id}`);
                  } catch (e: any) {
                    setError(errorMessage(e));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <ScanLine size={17} /> Start inspection <ArrowRight size={17} />
              </button>
            </div>
          </section>
        </div>
        <aside className="workspace-guide">
          <div className="guide-icon">
            <Focus size={25} />
          </div>
          <div className="eyebrow">A BETTER IMAGE. A BETTER INSPECTION.</div>
          <h2>
            Bring the details
            <br />
            into focus.
          </h2>
          <p>Image quality determines what the system can reliably observe.</p>
          {[
            [
              "Frame the full package",
              "Include edges, labels, and required packaging components.",
            ],
            ["Keep text readable", "Avoid glare, shadows, and motion blur."],
            [
              "Show every required field",
              "Add multiple views for batch, dates, and security seals.",
            ],
          ].map(([h, p], i) => (
            <div className="guide-item" key={h}>
              <span>{i + 1}</span>
              <div>
                <h3>{h}</h3>
                <p>{p}</p>
              </div>
            </div>
          ))}
          <div className="guide-note">
            <TriangleAlert size={17} />
            <p>
              Missing evidence is flagged for review. It is never assumed to be
              correct.
            </p>
          </div>
          <a className="text-link" href="/api/demo/sample" download>
            Download synthetic sample <ArrowDownToLine size={14} />
          </a>
        </aside>
      </div>
    </>
  );
}

function OverlayImage({
  image,
  result,
  kind,
}: {
  image: Row;
  result: Row;
  kind: string;
}) {
  const [show, setShow] = useState(true);
  const [processed, setProcessed] = useState(false);
  const analyzed = result.images?.find((x: Row) => x.id === image.id);
  const objects =
    kind === "ocr" ? analyzed?.ocr?.regions || [] : analyzed?.objects || [];
  return (
    <>
      <div className="viewer-toolbar">
        <span>{image.filename}</span>
        <div>
          <label>
            <input
              type="checkbox"
              checked={show}
              onChange={(e) => setShow(e.target.checked)}
            />{" "}
            Overlays
          </label>
          {analyzed?.processed_url && (
            <label>
              <input
                type="checkbox"
                checked={processed}
                onChange={(e) => setProcessed(e.target.checked)}
              />{" "}
              Enhanced
            </label>
          )}
        </div>
      </div>
      <div className="image-viewer">
        <div>
          <img
            src={processed ? analyzed.processed_url : image.url}
            alt="Packaging inspection evidence"
          />
          {show && (
            <svg
              viewBox={`0 0 ${analyzed?.quality?.width || image.meta.width} ${analyzed?.quality?.height || image.meta.height}`}
              preserveAspectRatio="none"
              className="overlay"
            >
              {objects.map((o: Row, i: number) => (
                <g key={i}>
                  <rect
                    x={o.bbox[0]}
                    y={o.bbox[1]}
                    width={o.bbox[2] - o.bbox[0]}
                    height={o.bbox[3] - o.bbox[1]}
                    fill="#21806016"
                    stroke="#2d9e7b"
                    strokeWidth="2"
                    vectorEffect="non-scaling-stroke"
                  >
                    <title>
                      {o.text || o.label} ·{" "}
                      {o.confidence != null
                        ? Math.round(o.confidence * 100) + "%"
                        : "class unverified"}
                    </title>
                  </rect>
                </g>
              ))}
            </svg>
          )}
        </div>
      </div>
      {analyzed && (
        <div className="quality-metrics">
          <span>
            Brightness <b>{analyzed.quality?.brightness}</b>
          </span>
          <span>
            Blur metric <b>{analyzed.quality?.laplacian_variance}</b>
          </span>
          <span>
            Contrast <b>{analyzed.quality?.contrast}</b>
          </span>
        </div>
      )}
      <div className="notice">
        {kind === "ocr"
          ? "Boxes show OCR text regions in original image coordinates."
          : "Boxes show candidate packaging regions, not verified defect locations. Baseline contours do not identify packaging classes."}
      </div>
    </>
  );
}
function InspectionDetail() {
  const { id } = useParams();
  const { data, error, refresh } = useData(`/inspections/${id}`);
  const [tab, setTab] = useState("Overview");
  const [imageIndex, setImageIndex] = useState(0);
  const [actionError, setActionError] = useState("");
  const [correction, setCorrection] = useState<Row | null>(null);
  const [review, setReview] = useState(false);
  const [reviewValue, setReviewValue] = useState("FURTHER REVIEW");
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (data?.status === "RUNNING") {
      const timer = setInterval(refresh, 1600);
      return () => clearInterval(timer);
    }
  }, [data?.status, refresh]);
  if (error) return <ErrorBox message={error} />;
  if (!data) return <Loading />;
  const result = data.result || {};
  const latestRun = result.run_id || data.executions.at(-1)?.run_id;
  const logs = data.executions.filter((x: Row) => x.run_id === latestRun);
  return (
    <>
      <Link to="/history" className="back-link">
        ← Inspection history
      </Link>
      <PageTitle
        eyebrow={`INS-${id?.slice(0, 8).toUpperCase()} · SPECIFICATION V${data.specification_version}`}
        title={data.product_name + " inspection"}
        description={`${data.packaging} · ${time(data.created_at)}`}
        action={
          <div className="button-group">
            <button
              className="btn secondary"
              onClick={() => download(`/inspections/${id}/report?format=pdf`)}
            >
              <ArrowDownToLine size={16} /> Export PDF
            </button>
            <button
              className="btn primary"
              disabled={["RUNNING", "QUEUED", "ERROR"].includes(data.status)}
              onClick={() => setReview(true)}
            >
              <ClipboardCheck size={16} /> Human review
            </button>
          </div>
        }
      />
      <ErrorBox message={actionError} />
      <div className={`outcome-banner ${data.status === "FAIL" ? "fail" : ""}`}>
        <div>
          <span className="outcome-icon">
            {data.status === "RUNNING" ? <Loader2 className="spin" /> : null}
            {data.status !== "RUNNING" && <ShieldCheck size={24} />}
          </span>
          <div>
            <Badge status={data.status} />
            <p>
              {data.status === "RUNNING"
                ? "Executing inspection stages. Progress below reflects recorded server activity."
                : "Decision-support outcome. Authorized human disposition is recorded separately."}
            </p>
          </div>
        </div>
        <button
          className="text-link"
          disabled={data.status === "RUNNING"}
          onClick={async () => {
            try {
              await api.post(`/inspections/${id}/rerun`);
              refresh();
            } catch (e: any) {
              setActionError(errorMessage(e));
            }
          }}
        >
          Rerun inspection <ArrowRight size={15} />
        </button>
      </div>
      <div className="tabs">
        {[
          "Overview",
          "Defect viewer",
          "OCR & labels",
          "Agent execution",
          "Human records",
        ].map((t) => (
          <button
            key={t}
            className={tab === t ? "selected" : ""}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      {result.error && <ErrorBox message={result.error} />}
      {tab === "Overview" && (
        <div className="detail-grid">
          <section className="panel detail-panel">
            <h2>Evidence & findings</h2>
            {!result.comparisons?.length ? (
              <Empty
                title={
                  data.status === "RUNNING"
                    ? "Inspection in progress"
                    : "No comparison evidence yet"
                }
                description="Completed stage logs are available under Agent execution."
              />
            ) : (
              <>
                <ComparisonTable comparisons={result.comparisons} />
                <h3>Reasoning summary</h3>
                <p>{result.reasoning?.summary}</p>
                {result.reasoning?.observations?.map((o: Row, i: number) => (
                  <div className="observation" key={i}>
                    <Eye size={16} />
                    <span>
                      {o.description}
                      <small>
                        {o.evidence_type} ·{" "}
                        {o.requires_review
                          ? "Review required"
                          : "Rule satisfied"}
                      </small>
                    </span>
                  </div>
                ))}
              </>
            )}
          </section>
          <section className="panel detail-panel">
            <h2>Inspection limitations</h2>
            <p className="muted">Uncertainty remains part of the result.</p>
            {result.limitations?.map((l: string, i: number) => (
              <div key={i} className="limitation">
                <TriangleAlert size={16} />
                <p>{l}</p>
              </div>
            ))}
            {!result.limitations && (
              <p>Limitations will be reported after processing.</p>
            )}
            <div className="notice">
              Confidence values describe model or OCR output. They are not
              calibrated probabilities of a defect.
            </div>
          </section>
        </div>
      )}
      {["Defect viewer", "OCR & labels"].includes(tab) && (
        <div className="detail-grid">
          <section className="panel evidence-panel">
            <div className="panel-head">
              <h2>
                {tab === "Defect viewer" ? "Visual evidence" : "Label evidence"}
              </h2>
              <select
                aria-label="Evidence image"
                value={imageIndex}
                onChange={(e) => setImageIndex(Number(e.target.value))}
              >
                {data.images.map((im: Row, i: number) => (
                  <option key={im.id} value={i}>
                    Image {i + 1} · {im.filename}
                  </option>
                ))}
              </select>
            </div>
            {data.images[imageIndex] && (
              <OverlayImage
                image={data.images[imageIndex]}
                result={result}
                kind={tab === "OCR & labels" ? "ocr" : "objects"}
              />
            )}
          </section>
          <section className="panel detail-panel">
            <h2>
              {tab === "OCR & labels"
                ? "Extracted fields"
                : "Configured findings"}
            </h2>
            {tab === "OCR & labels" ? (
              <>
                <button
                  className="text-link"
                  onClick={() =>
                    setCorrection({
                      field: "batch_number",
                      value: "",
                      reason: "",
                    })
                  }
                >
                  <Plus size={14} /> Add field annotation
                </button>
                {Object.entries(result.fields || {}).map(([key, f]: any) => (
                  <div className="field-row" key={key}>
                    <small>{key.replaceAll("_", " ")}</small>
                    <strong>{f.value}</strong>
                    <span>
                      OCR {Math.round(f.confidence * 100)}%{" "}
                      <button
                        className="text-link"
                        onClick={() =>
                          setCorrection({
                            field: key,
                            value: f.value,
                            reason: "",
                          })
                        }
                      >
                        Annotate
                      </button>
                    </span>
                  </div>
                ))}
                <h3>Raw OCR text</h3>
                <pre className="raw-text">
                  {result.images
                    ?.map((im: Row) => im.ocr?.raw_text)
                    .join("\n\n") ||
                    "No text extracted. Check the OCR configuration and image quality."}
                </pre>
              </>
            ) : (
              <>
                {result.defects?.map((d: Row) => (
                  <div className="finding" key={d.id}>
                    <div>
                      <strong>{d.type}</strong>
                      <span className={`severity ${d.severity.toLowerCase()}`}>
                        {d.severity}
                      </span>
                    </div>
                    <p>{d.evidence.explanation}</p>
                    <small>
                      {d.rule} · {d.evidence_type}
                    </small>
                    <button
                      className="text-link"
                      style={{ marginTop: 10 }}
                      onClick={() =>
                        setCorrection({
                          defect_id: d.id,
                          field: d.evidence.field,
                          value: d.evidence.observed || "",
                          reason: "",
                        })
                      }
                    >
                      Annotate finding <FileText size={13} />
                    </button>
                    {d.bbox && (
                      <small>
                        Region identifies source text evidence, not physical
                        damage.
                      </small>
                    )}
                  </div>
                ))}
                {!result.defects?.length && (
                  <p>
                    No configured findings available. Baseline physical defect
                    inspection remains unverified.
                  </p>
                )}
              </>
            )}
          </section>
        </div>
      )}
      {tab === "Agent execution" && <ExecutionList logs={logs} />}
      {tab === "Human records" && (
        <section className="panel detail-panel">
          <h2>Append-only review history</h2>
          <p className="muted">
            Annotations preserve original predictions and do not change the
            automated outcome.
          </p>
          {data.annotations.length ? (
            data.annotations.map((a: Row) => (
              <div className="annotation" key={a.id}>
                <div>
                  <Badge status={a.data.disposition || "HUMAN ANNOTATION"} />
                  <small>
                    {a.actor} · {time(a.created_at)}
                  </small>
                </div>
                <p>
                  {a.data.field && `${a.data.field}: ${a.data.value}. `}
                  {a.data.reason}
                </p>
              </div>
            ))
          ) : (
            <Empty
              title="Ready for a human perspective"
              description="Record a disposition or annotate OCR fields with a reason."
            />
          )}
        </section>
      )}
      {correction && (
        <Modal
          title={
            correction.defect_id
              ? "Annotate inspection finding"
              : "Record OCR annotation"
          }
          onClose={() => setCorrection(null)}
        >
          <form
            className="form"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await api.put(
                  correction.defect_id
                    ? `/defects/${correction.defect_id}/annotation`
                    : `/inspections/${id}/ocr/corrections`,
                  correction,
                );
                setCorrection(null);
                refresh();
              } catch (e: any) {
                setActionError(e.message);
              }
            }}
          >
            <label>
              Field
              <input
                required
                value={correction.field}
                onChange={(e) =>
                  setCorrection({ ...correction, field: e.target.value })
                }
              />
            </label>
            <label>
              Human-observed value
              <input
                required
                value={correction.value}
                onChange={(e) =>
                  setCorrection({ ...correction, value: e.target.value })
                }
              />
            </label>
            <label>
              Reason
              <textarea
                required
                minLength={3}
                value={correction.reason}
                onChange={(e) =>
                  setCorrection({ ...correction, reason: e.target.value })
                }
              />
            </label>
            <div className="notice">
              This annotation is stored alongside the original inspection
              evidence.
            </div>
            <button className="btn primary">Record annotation</button>
          </form>
        </Modal>
      )}
      {review && (
        <Modal
          title="Record human disposition"
          onClose={() => setReview(false)}
        >
          <form
            className="form"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await api.post(`/inspections/${id}/reviews`, {
                  disposition: reviewValue,
                  reason,
                });
                setReview(false);
                setTab("Human records");
                refresh();
              } catch (e: any) {
                setActionError(e.message);
              }
            }}
          >
            <label>
              Disposition
              <select
                value={reviewValue}
                onChange={(e) => setReviewValue(e.target.value)}
              >
                {["FURTHER REVIEW", "APPROVED", "REJECTED"].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <label>
              Rationale
              <textarea
                required
                minLength={5}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <div className="notice">
              Academic workflow record only. This is not authorization to
              release pharmaceutical product.
            </div>
            <button className="btn primary">Record disposition</button>
          </form>
        </Modal>
      )}
    </>
  );
}
function ComparisonTable({ comparisons }: { comparisons: Row[] }) {
  return (
    <div className="table-scroll">
      <table className="comparison-table">
        <thead>
          <tr>
            <th>FIELD</th>
            <th>EXPECTED</th>
            <th>OBSERVED</th>
            <th>CHECK</th>
          </tr>
        </thead>
        <tbody>
          {comparisons.map((c, i) => (
            <tr key={i}>
              <td>{c.field.replaceAll("_", " ")}</td>
              <td>{c.expected}</td>
              <td>
                {c.observed || <span className="muted">Not extracted</span>}
              </td>
              <td>
                <Badge status={c.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function ExecutionList({ logs }: { logs: Row[] }) {
  const { data: agents } = useData("/agents");
  return (
    <div className="execution-list">
      {agents?.map((a: Row, index: number) => {
        const log = logs.find((l) => l.agent === a.id);
        return (
          <details className="panel execution" key={a.id}>
            <summary>
              <span className="execution-index">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span>
                <strong>{a.name}</strong>
                <small>{a.responsibility}</small>
              </span>
              <span>
                {log ? (
                  <Badge status={log.status} />
                ) : (
                  <span className="badge">Not started</span>
                )}
              </span>
              <span className="duration">
                {log ? `${log.duration_ms} ms` : "—"}
              </span>
              <ChevronRight size={16} />
            </summary>
            <pre>
              {log
                ? JSON.stringify(log.detail, null, 2)
                : "No execution recorded."}
            </pre>
          </details>
        );
      })}
    </div>
  );
}
function History() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [product, setProduct] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(0);
  const { data: products } = useData("/products");
  const { data, error } = useData(
    `/inspections?${new URLSearchParams({ q: query, status, product_id: product, date_from: from, date_to: to, offset: String(page * 25), limit: "25" })}`,
  );
  return (
    <>
      <PageTitle
        eyebrow="EVERY INSPECTION, ACCOUNTED FOR"
        title="Inspection history"
        description="Find the evidence, revisit an outcome, and trace the original specification."
        action={
          <button
            className="btn secondary"
            onClick={() => download("/reports/csv")}
          >
            <ArrowDownToLine size={16} /> Export CSV
          </button>
        }
      />
      <section className="panel">
        <div className="toolbar history-toolbar">
          <div className="search-input">
            <Search size={17} />
            <input
              placeholder="Search product or inspection ID…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(0);
              }}
            />
          </div>
          <select
            aria-label="Product filter"
            value={product}
            onChange={(e) => {
              setProduct(e.target.value);
              setPage(0);
            }}
          >
            <option value="">All products</option>
            {products?.map((p: Row) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Status filter"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(0);
            }}
          >
            <option value="">All outcomes</option>
            {[
              "PASS",
              "REVIEW REQUIRED",
              "FAIL",
              "INSUFFICIENT IMAGE",
              "RUNNING",
              "ERROR",
              "QUEUED",
            ].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <label className="date-filter">
            From
            <input
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setPage(0);
              }}
            />
          </label>
          <label className="date-filter">
            To
            <input
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setPage(0);
              }}
            />
          </label>
        </div>
        <ErrorBox message={error} />
        {data?.length ? (
          <InspectionTable rows={data} />
        ) : (
          <Empty
            title="No matching inspections"
            description="Try another filter or start a new packaging inspection."
            action={
              <Link to="/inspect" className="btn secondary">
                New inspection <Plus size={16} />
              </Link>
            }
          />
        )}
        <div className="pagination">
          <span>Page {page + 1} · Up to 25 records per page</span>
          <button
            className="btn secondary small"
            disabled={!page}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </button>
          <button
            className="btn secondary small"
            disabled={!data || data.length < 25}
            onClick={() => setPage(page + 1)}
          >
            Next
          </button>
        </div>
      </section>
    </>
  );
}
function Agents() {
  const { data: agents, error } = useData("/agents");
  const { data: history } = useData("/inspections?limit=100");
  const [selected, setSelected] = useState("");
  const { data: logs, refresh } = useData(
    "/agents/executions" + (selected ? `?inspection_id=${selected}` : ""),
  );
  useEffect(() => {
    if (selected) {
      const timer = setInterval(refresh, 3000);
      return () => clearInterval(timer);
    }
  }, [selected, refresh]);
  const runId = logs?.[0]?.run_id;
  const activeLogs = logs?.filter((l: Row) => l.run_id === runId) || [];
  const nodes = (agents || []).map((a: Row, i: number) => ({
    id: a.id,
    position: { x: (i % 5) * 215, y: Math.floor(i / 5) * 160 },
    data: {
      label: (
        <div className="flow-node">
          <small>AGENT {String(i + 1).padStart(2, "0")}</small>
          <strong>{a.name}</strong>
          <span>
            {activeLogs.find((l: Row) => l.agent === a.id)?.status ||
              "NOT STARTED"}
          </span>
        </div>
      ),
    },
    style: {
      width: 190,
      borderColor: "#d3e0d6",
      borderRadius: 10,
      background: "#fff",
    },
  }));
  const edges = (agents || []).slice(1).map((a: Row, i: number) => ({
    id: `e${i}`,
    source: agents[i].id,
    target: a.id,
    markerEnd: { type: MarkerType.ArrowClosed },
    style: { stroke: "#82a594" },
  }));
  return (
    <>
      <PageTitle
        eyebrow="ORCHESTRATED WITH LANGGRAPH"
        title="Agent workflow"
        description="Ten specialized stages. Shared evidence. A complete execution trace."
      />
      <ErrorBox message={error} />
      <div className="toolbar">
        <label className="inline-label">
          Execution
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="">Latest run across inspections</option>
            {history?.map((i: Row) => (
              <option key={i.id} value={i.id}>
                {i.product_name} · {i.id.slice(0, 8)}
              </option>
            ))}
          </select>
        </label>
        <span className="muted">Statuses reflect actual server records</span>
      </div>
      <section className="panel flow-canvas">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          fitView
          nodesDraggable={false}
          nodesConnectable={false}
        >
          <Background gap={18} color="#dce5de" />
          <Controls showInteractive={false} />
        </ReactFlow>
      </section>
      <ExecutionList logs={activeLogs} />
    </>
  );
}
function Analytics() {
  const { data, error } = useData("/analytics/dashboard");
  const { data: metrics } = useData("/analytics/models");
  if (error) return <ErrorBox message={error} />;
  if (!data) return <Loading />;
  return (
    <>
      <PageTitle
        eyebrow="TURN EVIDENCE INTO UNDERSTANDING"
        title="Analytics & reports"
        description="Explore recorded activity, inspection outcomes, and recurring findings."
        action={
          <button
            className="btn primary"
            onClick={() => download("/reports/csv")}
          >
            <ArrowDownToLine size={16} /> Export inspection data
          </button>
        }
      />
      <Stats data={data} />
      <div className="dashboard-charts">
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Inspection volume</h2>
              <p>Actual recorded inspections</p>
            </div>
          </div>
          <Trend data={data.trends} />
        </section>
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Finding frequency</h2>
              <p>Specification and OCR findings</p>
            </div>
          </div>
          {data.defects.length ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart
                data={data.defects}
                margin={{ left: -20, right: 18, bottom: 55 }}
              >
                <XAxis
                  dataKey="name"
                  angle={-25}
                  textAnchor="end"
                  interval={0}
                  tick={{ fontSize: 10 }}
                />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar
                  dataKey="value"
                  name="Findings"
                  fill="#558c73"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <Empty
              title="No findings recorded"
              description="Frequency appears as inspections accumulate."
            />
          )}
        </section>
      </div>
      <div className="detail-grid">
        <section className="panel detail-panel">
          <h2>Model evaluation</h2>
          <div className="metric-grid">
            {["Precision", "Recall", "Accuracy"].map((m) => (
              <div key={m}>
                <strong>—</strong>
                <small>{m}</small>
              </div>
            ))}
          </div>
          <div className="notice">
            {metrics?.reason ||
              "No labeled evaluation dataset has been evaluated."}
          </div>
        </section>
        <section className="panel detail-panel">
          <h2>Execution & severity</h2>
          <div className="execution-stat">
            <strong>{(data.mean_duration_ms / 1000).toFixed(2)} s</strong>
            <span>Mean recorded workflow duration</span>
          </div>
          {data.severity.map((s: Row) => (
            <div className="severity-row" key={s.name}>
              <span>{s.name}</span>
              <b>{s.value}</b>
            </div>
          ))}
          <p className="muted">
            Severity rules are research defaults, not universal pharmaceutical
            acceptance criteria.
          </p>
        </section>
      </div>
    </>
  );
}
function Settings() {
  const { role } = useContext(Auth);
  const { data, error, refresh } = useData("/settings");
  const { data: health } = useData("/health/models");
  const [form, setForm] = useState<Row | null>(null);
  const [message, setMessage] = useState("");
  const [saveError, setSaveError] = useState("");
  useEffect(() => {
    if (data) setForm(data);
  }, [data]);
  if (error) return <ErrorBox message={error} />;
  if (!form) return <Loading />;
  return (
    <>
      <PageTitle
        eyebrow="MAKE THE BASELINE EXPLICIT"
        title="Workspace settings"
        description="Configure local providers and image quality rules. All changes are audited."
      />
      <div className="detail-grid">
        <section className="panel detail-panel">
          <h2>Model & OCR configuration</h2>
          <form
            className="form"
            onSubmit={async (e) => {
              e.preventDefault();
              setMessage("");
              setSaveError("");
              try {
                await api.put("/settings", form);
                setMessage("Configuration saved. New runs use these settings.");
                refresh();
              } catch (e: any) {
                setSaveError(errorMessage(e));
              }
            }}
          >
            <label>
              OCR engine
              <select
                disabled={role !== "admin"}
                value={form.ocr}
                onChange={(e) => setForm({ ...form, ocr: e.target.value })}
              >
                <option value="tesseract">
                  Tesseract · local executable required
                </option>
                <option value="easyocr">
                  EasyOCR · optional model dependencies
                </option>
                <option value="disabled">Disabled · OCR review required</option>
              </select>
            </label>
            <label>
              YOLO weights path
              <input
                disabled={role !== "admin"}
                value={form.yolo_weights}
                placeholder="Leave empty for contour baseline"
                onChange={(e) =>
                  setForm({ ...form, yolo_weights: e.target.value })
                }
              />
              <small>
                Use trusted, purpose-trained weights. Generic object weights do
                not establish packaging defect performance.
              </small>
            </label>
            <label>
              Reasoning provider
              <select
                disabled={role !== "admin"}
                value={form.vlm}
                onChange={(e) => setForm({ ...form, vlm: e.target.value })}
              >
                <option value="baseline">Deterministic evidence summary</option>
                <option value="ollama">Ollama · local multimodal model</option>
              </select>
            </label>
            {form.vlm === "ollama" && (
              <label>
                Ollama model
                <input
                  value={form.ollama_model}
                  onChange={(e) =>
                    setForm({ ...form, ollama_model: e.target.value })
                  }
                />
              </label>
            )}
            <div className="form-grid">
              <label>
                Blur metric threshold
                <input
                  disabled={role !== "admin"}
                  type="number"
                  min="1"
                  max="1000"
                  value={form.blur_threshold}
                  onChange={(e) =>
                    setForm({ ...form, blur_threshold: Number(e.target.value) })
                  }
                />
              </label>
              <label>
                Minimum brightness
                <input
                  disabled={role !== "admin"}
                  type="number"
                  min="1"
                  max="128"
                  value={form.brightness_min}
                  onChange={(e) =>
                    setForm({ ...form, brightness_min: Number(e.target.value) })
                  }
                />
              </label>
            </div>
            <ErrorBox message={saveError} />
            {message && (
              <div className="success">
                <CheckCircle2 size={17} />
                {message}
              </div>
            )}
            {role === "admin" && (
              <button className="btn primary">Save configuration</button>
            )}
          </form>
        </section>
        <section className="panel detail-panel">
          <h2>System capabilities</h2>
          <div className="capability">
            <span>Image quality & preprocessing</span>
            <Badge status="AVAILABLE" />
          </div>
          <div className="capability">
            <span>Tesseract executable</span>
            <Badge
              status={health?.ocr_tesseract ? "AVAILABLE" : "SETUP REQUIRED"}
            />
          </div>
          <div className="capability">
            <span>Purpose-trained defect weights</span>
            <Badge status="NOT CONFIGURED" />
          </div>
          <div className="capability">
            <span>QR content decoding</span>
            <Badge status="AVAILABLE" />
          </div>
          <div className="notice">
            Baseline mode does not verify tears, seals, contamination, or
            component completeness. Missing capabilities remain visible in every
            inspection report.
          </div>
          <h3>Research boundaries</h3>
          <p className="muted">
            No regulatory certification or production validation is claimed. A
            PASS never authorizes product release. Human annotations are stored
            separately from original predictions.
          </p>
          <Link className="text-link" to="/agents">
            View the inspection pipeline <ArrowRight size={16} />
          </Link>
        </section>
      </div>
    </>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
