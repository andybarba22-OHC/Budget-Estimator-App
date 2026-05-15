import { useState, useEffect } from "react";

// ── Inject fonts & keyframes ──────────────────────────────────────────────────
if (typeof document !== "undefined") {
  const link = document.createElement("link");
  link.href =
    "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400&family=DM+Sans:wght@300;400;500&display=swap";
  link.rel = "stylesheet";
  document.head.appendChild(link);
  const style = document.createElement("style");
  style.textContent = `@keyframes spin{to{transform:rotate(360deg)}} * { box-sizing: border-box; }`;
  document.head.appendChild(style);
}

// ── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  ivory: "#FAF7F2", cream: "#F2EDE4", green: "#0D2347",
  greenMid: "#1A3560", gold: "#B8965A", goldLight: "#D4AF7A",
  text: "#0D2347", muted: "#6B7A8D", border: "#DDD5C8", white: "#FFFFFF",
};
const serif = { fontFamily: "'Cormorant Garamond', Georgia, serif" };
const sans  = { fontFamily: "'DM Sans', system-ui, sans-serif" };

const inputStyle = {
  ...sans, fontSize: 13, color: C.text,
  border: `1.5px solid ${C.border}`, background: C.ivory,
  padding: "10px 12px", outline: "none", width: "100%",
  WebkitAppearance: "none", transition: "border-color 0.15s",
};

// ── Goal type config ──────────────────────────────────────────────────────────
const GOAL_TYPES = {
  wedding:  { label: "Wedding",        icon: "💒" },
  vacation: { label: "Vacation",       icon: "✈️" },
  purchase: { label: "Large Purchase", icon: "🏡" },
};

const CATEGORIES = {
  wedding: [
    { key: "travel",        icon: "✈",  label: "Travel" },
    { key: "accommodation", icon: "🏨", label: "Accommodation" },
    { key: "gift",          icon: "🎁", label: "Gift" },
    { key: "attire",        icon: "👗", label: "Attire" },
    { key: "events",        icon: "🥂", label: "Events (bach, rehearsal)" },
  ],
  vacation: [
    { key: "flights",       icon: "✈",  label: "Flights / Transport" },
    { key: "accommodation", icon: "🏨", label: "Accommodation" },
    { key: "food",          icon: "🍽", label: "Food & Dining" },
    { key: "activities",    icon: "🎭", label: "Activities" },
    { key: "other",         icon: "🧳", label: "Other (transit, souvenirs)" },
  ],
  purchase: [
    { key: "main",          icon: "💰", label: "Main Cost" },
    { key: "fees",          icon: "📋", label: "Taxes & Fees" },
    { key: "setup",         icon: "🔧", label: "Setup / Closing" },
    { key: "reserve",       icon: "🛡", label: "Reserve / Contingency" },
    { key: "other",         icon: "📌", label: "Other" },
  ],
};

const newGoal = () => ({
  type: "wedding",
  location: "", date: "", role: "guest", dresscode: "cocktail",
  destination: "", tripDate: "", tripLength: "short", travelStyle: "mid",
  itemType: "home_down_payment", itemDetails: "", targetDate: "",
  costs: null, loading: false, error: null,
});

// ── Claude API call ───────────────────────────────────────────────────────────
async function callClaude(prompt) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 400,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const raw = data.content.find((c) => c.type === "text")?.text ?? "";
  return JSON.parse(raw.replace(/```json\n?|```/g, "").trim());
}

function buildPrompt(g) {
  if (g.type === "wedding") {
    return `You are a wedding cost estimator. Estimate realistic costs for a guest attending this wedding:
Location: ${g.location}
Date: ${g.date || "upcoming"}
Role: ${g.role}
Dress code: ${g.dresscode}

Assume the guest lives ~500 miles away (adjust for obvious destination weddings). Include: round-trip travel, 1-2 nights accommodation, registry gift, attire appropriate for their role and dress code, and secondary events (bachelorette/bachelor if bridesmaid/groomsman/MOH/best man; rehearsal dinner if in the wedding party).

Return ONLY valid JSON with no markdown:
{"travel":number,"accommodation":number,"gift":number,"attire":number,"events":number,"total":number,"notes":"one concise sentence"}`;
  }
  if (g.type === "vacation") {
    return `You are a vacation cost estimator. Estimate realistic costs for one person taking this trip:
Destination: ${g.destination}
Date: ${g.tripDate || "upcoming"}
Trip length: ${g.tripLength}
Travel style: ${g.travelStyle}

Assume travel from a major US city. Include round-trip flights/transport, accommodation for the full duration, food/dining, activities and entertainment, and other expenses (local transit, souvenirs, travel insurance).

Return ONLY valid JSON with no markdown:
{"flights":number,"accommodation":number,"food":number,"activities":number,"other":number,"total":number,"notes":"one concise sentence about your assumptions"}`;
  }
  return `You are a major purchase cost estimator. Estimate the realistic all-in cost for this purchase:
Item type: ${g.itemType.replace(/_/g, " ")}
Details: ${g.itemDetails || "standard"}
Target date: ${g.targetDate || "upcoming"}

Provide a realistic breakdown. For a home down payment, "main" is the down payment itself (assume 20% on a reasonable purchase price), "fees" is closing costs, "setup" is moving/initial costs, "reserve" is recommended emergency reserve. For a car, "main" is sticker price minus trade-in, "fees" is tax/title/registration, "setup" is delivery/first insurance, "reserve" is maintenance fund. Adapt categories sensibly for other purchases. Use 0 for any category that doesn't apply.

Return ONLY valid JSON with no markdown:
{"main":number,"fees":number,"setup":number,"reserve":number,"other":number,"total":number,"notes":"one concise sentence about your assumptions"}`;
}

function canEstimate(g) {
  if (g.type === "wedding")  return g.location.trim().length > 0;
  if (g.type === "vacation") return g.destination.trim().length > 0;
  if (g.type === "purchase") return g.itemDetails.trim().length > 0;
  return false;
}

function goalTitle(g, fallback) {
  if (g.type === "wedding")  return g.location ? `${g.location} Wedding` : fallback;
  if (g.type === "vacation") return g.destination ? `${g.destination} Trip` : fallback;
  if (g.type === "purchase") {
    const itemLabel = {
      home_down_payment: "Home Down Payment",
      car: "Car",
      engagement_ring: "Engagement Ring",
      home_renovation: "Home Renovation",
      other: "Major Purchase",
    }[g.itemType] || "Major Purchase";
    return itemLabel;
  }
  return fallback;
}

function goalDate(g) {
  if (g.type === "wedding")  return g.date;
  if (g.type === "vacation") return g.tripDate;
  if (g.type === "purchase") return g.targetDate;
  return "";
}

// ── Shared micro-components ───────────────────────────────────────────────────
function ProgressBar({ pct }) {
  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, height: 3, background: C.border, zIndex: 100 }}>
      <div style={{ height: "100%", width: `${pct}%`, background: C.gold, transition: "width 0.5s ease" }} />
    </div>
  );
}

function BackBtn({ onClick, light }) {
  return (
    <button
      onClick={onClick}
      style={{
        position: "fixed", top: 18, left: 18, zIndex: 200,
        background: "none", border: "none", cursor: "pointer",
        ...sans, fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase",
        color: light ? "rgba(250,247,242,0.45)" : C.muted,
      }}
    >
      ← Back
    </button>
  );
}

function PrimaryBtn({ children, onClick, disabled, dark }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        ...sans, fontSize: 13, fontWeight: 500,
        letterSpacing: "0.08em", textTransform: "uppercase",
        border: "none", padding: "15px 36px", cursor: disabled ? "not-allowed" : "pointer",
        background: disabled ? C.border : dark ? C.gold : C.green,
        color: disabled ? C.muted : C.ivory,
        transition: "background 0.2s",
      }}
    >
      {children}
    </button>
  );
}

function Spinner() {
  return (
    <div style={{
      width: 13, height: 13, borderRadius: "50%",
      border: "2px solid rgba(250,247,242,0.3)",
      borderTopColor: C.ivory,
      animation: "spin 0.7s linear infinite",
      display: "inline-block",
    }} />
  );
}

function PageShell({ children, dark }) {
  return (
    <div style={{
      minHeight: "100vh", padding: "80px 24px 64px",
      background: dark ? C.green : C.ivory,
      display: "flex", flexDirection: "column", alignItems: "center",
    }}>
      {children}
    </div>
  );
}

function PageHeader({ step, title, sub, light }) {
  return (
    <div style={{ textAlign: "center", marginBottom: 40, maxWidth: 540 }}>
      {step && (
        <p style={{ ...sans, fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: light ? C.goldLight : C.gold, marginBottom: 10 }}>
          {step}
        </p>
      )}
      <h2 style={{ ...serif, fontSize: "clamp(26px,5vw,40px)", fontWeight: 300, color: light ? C.ivory : C.text, lineHeight: 1.2 }}>
        {title}
      </h2>
      {sub && (
        <p style={{ ...sans, fontSize: 13, color: light ? "rgba(250,247,242,0.55)" : C.muted, marginTop: 10, lineHeight: 1.6 }}>
          {sub}
        </p>
      )}
    </div>
  );
}

// ── PAGE 1 — Landing ──────────────────────────────────────────────────────────
function LandingPage({ onNext }) {
  const stats = [
    ["$1,800", "avg. wedding cost"],
    ["$5,500", "avg. vacation cost"],
    ["$0", "most save in advance"],
  ];
  return (
    <div style={{
      minHeight: "100vh", background: C.green,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      textAlign: "center", padding: "60px 24px", position: "relative", overflow: "hidden",
    }}>
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        background: "radial-gradient(ellipse at 25% 20%, rgba(184,150,90,0.13) 0%, transparent 55%), radial-gradient(ellipse at 80% 80%, rgba(184,150,90,0.08) 0%, transparent 50%)",
      }} />

      <p style={{ ...sans, fontSize: 11, letterSpacing: "0.22em", textTransform: "uppercase", color: C.goldLight, marginBottom: 24 }}>
        Introducing OHC
      </p>

      <h1 style={{ ...serif, fontSize: "clamp(40px,8vw,68px)", fontWeight: 300, color: C.ivory, lineHeight: 1.1, marginBottom: 14 }}>
        Life's big moments<br />are{" "}
        <em style={{ color: C.goldLight, fontStyle: "italic" }}>expensive.</em>
        <br />Let's plan for them.
      </h1>

      <p style={{ ...serif, fontSize: "clamp(17px,3vw,22px)", fontWeight: 300, color: "rgba(250,247,242,0.6)", maxWidth: 460, lineHeight: 1.6, marginBottom: 48 }}>
        Weddings, vacations, down payments — the expenses you see coming a mile away, but never actually save for.
      </p>

      <div style={{ display: "flex", gap: 40, marginBottom: 52, flexWrap: "wrap", justifyContent: "center" }}>
        {stats.map(([n, l]) => (
          <div key={l} style={{ textAlign: "center" }}>
            <div style={{ ...serif, fontSize: 34, fontWeight: 600, color: C.goldLight }}>{n}</div>
            <div style={{ ...sans, fontSize: 11, color: "rgba(250,247,242,0.38)", letterSpacing: "0.06em", marginTop: 2 }}>{l}</div>
          </div>
        ))}
      </div>

      <button
        onClick={onNext}
        style={{
          background: C.gold, color: C.white, border: "none",
          padding: "16px 38px", ...sans, fontSize: 13, fontWeight: 500,
          letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer",
        }}
      >
        Plan My Next Big Moment →
      </button>
    </div>
  );
}

// ── PAGE 2 — Goal Inputs ──────────────────────────────────────────────────────
function Field({ label, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={{ ...sans, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: C.muted }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function CostBreakdown({ goal }) {
  const rows = CATEGORIES[goal.type].map((cat) => [
    cat.icon, cat.label, goal.costs[cat.key],
  ]);
  return (
    <div style={{ marginTop: 14, padding: "16px 18px", background: C.cream, borderLeft: `3px solid ${C.gold}` }}>
      <p style={{ ...sans, fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: C.gold, marginBottom: 12 }}>
        Cost Breakdown
      </p>
      {rows.map(([icon, label, val]) => (
        <div key={label} style={{
          display: "flex", justifyContent: "space-between",
          ...sans, fontSize: 13, padding: "4px 0",
          borderBottom: `1px solid ${C.border}`,
        }}>
          <span>{icon} {label}</span>
          <span>${(val ?? 0).toLocaleString()}</span>
        </div>
      ))}
      <div style={{
        display: "flex", justifyContent: "space-between",
        ...sans, fontSize: 14, fontWeight: 500, color: C.green,
        paddingTop: 10, marginTop: 4, borderTop: `1.5px solid ${C.border}`,
      }}>
        <span>Total</span>
        <span>${(goal.costs.total ?? 0).toLocaleString()}</span>
      </div>
      {goal.costs.notes && (
        <p style={{ ...sans, fontSize: 11, color: C.muted, marginTop: 8, fontStyle: "italic", lineHeight: 1.4 }}>
          {goal.costs.notes}
        </p>
      )}
    </div>
  );
}

function WeddingFields({ goal, up }) {
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
        <Field label="City / Location">
          <input value={goal.location} onChange={(e) => up("location", e.target.value)} placeholder="e.g. Nashville, TN" style={inputStyle} />
        </Field>
        <Field label="Date">
          <input type="month" value={goal.date} onChange={(e) => up("date", e.target.value)} style={inputStyle} />
        </Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
        <Field label="Your Role">
          <select value={goal.role} onChange={(e) => up("role", e.target.value)} style={inputStyle}>
            {["guest", "bridesmaid", "MOH", "groomsman", "best man"].map((r) => (
              <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
            ))}
          </select>
        </Field>
        <Field label="Dress Code">
          <select value={goal.dresscode} onChange={(e) => up("dresscode", e.target.value)} style={inputStyle}>
            {["casual", "cocktail", "black tie", "beach / destination"].map((d) => (
              <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>
            ))}
          </select>
        </Field>
      </div>
    </>
  );
}

function VacationFields({ goal, up }) {
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
        <Field label="Destination">
          <input value={goal.destination} onChange={(e) => up("destination", e.target.value)} placeholder="e.g. Lisbon, Portugal" style={inputStyle} />
        </Field>
        <Field label="Travel Date">
          <input type="month" value={goal.tripDate} onChange={(e) => up("tripDate", e.target.value)} style={inputStyle} />
        </Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
        <Field label="Trip Length">
          <select value={goal.tripLength} onChange={(e) => up("tripLength", e.target.value)} style={inputStyle}>
            <option value="weekend">Weekend (2-3 days)</option>
            <option value="short">Short trip (4-7 days)</option>
            <option value="long">Long trip (1-2 weeks)</option>
            <option value="extended">Extended (3+ weeks)</option>
          </select>
        </Field>
        <Field label="Travel Style">
          <select value={goal.travelStyle} onChange={(e) => up("travelStyle", e.target.value)} style={inputStyle}>
            <option value="budget">Budget</option>
            <option value="mid">Mid-range</option>
            <option value="luxury">Luxury</option>
            <option value="ultra">Ultra-luxury</option>
          </select>
        </Field>
      </div>
    </>
  );
}

function PurchaseFields({ goal, up }) {
  const placeholder =
    goal.itemType === "home_down_payment" ? "e.g. 3-bed home in Chicago, ~$600K" :
    goal.itemType === "car" ? "e.g. Tesla Model Y, new" :
    goal.itemType === "engagement_ring" ? "e.g. 1.5ct round, platinum band" :
    goal.itemType === "home_renovation" ? "e.g. kitchen remodel, 200 sqft" :
    "Tell us what you're saving for";
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
        <Field label="What Are You Buying?">
          <select value={goal.itemType} onChange={(e) => up("itemType", e.target.value)} style={inputStyle}>
            <option value="home_down_payment">Home Down Payment</option>
            <option value="car">Car</option>
            <option value="engagement_ring">Engagement Ring</option>
            <option value="home_renovation">Home Renovation</option>
            <option value="other">Other Major Purchase</option>
          </select>
        </Field>
        <Field label="Target Date">
          <input type="month" value={goal.targetDate} onChange={(e) => up("targetDate", e.target.value)} style={inputStyle} />
        </Field>
      </div>
      <div style={{ marginBottom: 16 }}>
        <Field label="Details">
          <input value={goal.itemDetails} onChange={(e) => up("itemDetails", e.target.value)} placeholder={placeholder} style={inputStyle} />
        </Field>
      </div>
    </>
  );
}

function GoalCard({ index, goal, onUpdate, onEstimate }) {
  const up = (field, val) => onUpdate(index, field, val);
  const ok = canEstimate(goal);
  const { icon, label } = GOAL_TYPES[goal.type];

  return (
    <div style={{ background: C.white, border: `1.5px solid ${C.border}`, padding: 26 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
        <div style={{
          width: 28, height: 28, background: C.green, color: C.ivory, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          ...sans, fontSize: 12, fontWeight: 500,
        }}>
          {index + 1}
        </div>
        <div style={{ ...serif, fontSize: 18, color: C.text }}>
          Goal {index + 1} <span style={{ color: C.muted, fontSize: 14 }}>· {icon} {label}</span>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <Field label="Goal Type">
          <select value={goal.type} onChange={(e) => up("type", e.target.value)} style={inputStyle}>
            {Object.entries(GOAL_TYPES).map(([key, { label, icon }]) => (
              <option key={key} value={key}>{icon} {label}</option>
            ))}
          </select>
        </Field>
      </div>

      {goal.type === "wedding"  && <WeddingFields  goal={goal} up={up} />}
      {goal.type === "vacation" && <VacationFields goal={goal} up={up} />}
      {goal.type === "purchase" && <PurchaseFields goal={goal} up={up} />}

      <button
        onClick={() => onEstimate(index)}
        disabled={!ok || goal.loading}
        style={{
          width: "100%", border: "none", padding: 13,
          ...sans, fontSize: 12, fontWeight: 500,
          letterSpacing: "0.08em", textTransform: "uppercase",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          cursor: !ok || goal.loading ? "not-allowed" : "pointer",
          background: !ok || goal.loading ? C.border : C.green,
          color: !ok || goal.loading ? C.muted : C.ivory,
          transition: "background 0.2s",
        }}
      >
        {goal.loading ? <><Spinner /> Estimating with AI...</> : goal.costs ? "✦ Re-estimate" : "✦ Estimate My Costs"}
      </button>

      {goal.error && (
        <p style={{ ...sans, fontSize: 12, color: "#C0392B", marginTop: 8 }}>{goal.error}</p>
      )}

      {goal.costs && <CostBreakdown goal={goal} />}
    </div>
  );
}

function GoalsPage({ goals, onUpdate, onEstimate, onNext, onBack }) {
  const hasAny = goals.some((g) => g.costs !== null);
  return (
    <PageShell>
      <BackBtn onClick={onBack} />
      <PageHeader
        step="Step 1 of 3"
        title="What are you saving for?"
        sub="Add up to 3 goals — weddings, trips, or big purchases. We'll estimate what each one will actually cost you."
      />
      <div style={{ display: "flex", flexDirection: "column", gap: 18, width: "100%", maxWidth: 600 }}>
        {goals.map((g, i) => (
          <GoalCard key={i} index={i} goal={g} onUpdate={onUpdate} onEstimate={onEstimate} />
        ))}
      </div>
      <div style={{ marginTop: 32 }}>
        <PrimaryBtn onClick={onNext} disabled={!hasAny}>
          See My Savings Plan →
        </PrimaryBtn>
      </div>
    </PageShell>
  );
}

// ── PAGE 3 — Savings Plan ─────────────────────────────────────────────────────
function SavingsPage({ goals, onNext, onBack }) {
  const funded = goals.filter((g) => g.costs);
  const total = funded.reduce((s, g) => s + (g.costs?.total ?? 0), 0);
  const now = new Date();
  const dates = funded.map((g) => {
    const d = goalDate(g);
    return d ? new Date(d + "-01") : null;
  }).filter(Boolean);
  const earliest = dates.length ? Math.min(...dates.map((d) => d - now)) : 365 * 86_400_000;
  const weeksUntil = Math.max(Math.round(earliest / (7 * 86_400_000)), 4);
  const weekly = Math.ceil(total / weeksUntil);
  const monthly = Math.ceil(total / (weeksUntil / 4.33));

  return (
    <PageShell dark>
      <BackBtn onClick={onBack} light />
      <PageHeader
        step="Step 2 of 3"
        title="Your goal fund"
        sub="Here's what to set aside — and when — so you're never caught off guard."
        light
      />

      <div style={{
        background: "rgba(250,247,242,0.06)", border: "1.5px solid rgba(184,150,90,0.3)",
        padding: "32px 36px", marginBottom: 24, width: "100%", maxWidth: 560, textAlign: "center",
      }}>
        <p style={{ ...sans, fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: C.goldLight, marginBottom: 6 }}>
          Total Goal Exposure
        </p>
        <div style={{ ...serif, fontSize: "clamp(52px,10vw,76px)", fontWeight: 300, color: C.ivory, lineHeight: 1 }}>
          ${total.toLocaleString()}
        </div>
        <p style={{ ...sans, fontSize: 13, color: "rgba(250,247,242,0.42)", marginTop: 6 }}>
          across {funded.length} goal{funded.length !== 1 ? "s" : ""}
        </p>
        <div style={{ width: 40, height: 1, background: C.gold, margin: "20px auto" }} />
        <div style={{ display: "flex", gap: 36, justifyContent: "center", flexWrap: "wrap" }}>
          {[["$" + weekly.toLocaleString(), "per week"], ["$" + monthly.toLocaleString(), "per month"], [weeksUntil + " wks", "to plan"]].map(([n, l]) => (
            <div key={l} style={{ textAlign: "center" }}>
              <div style={{ ...serif, fontSize: 28, color: C.goldLight }}>{n}</div>
              <div style={{ ...sans, fontSize: 11, color: "rgba(250,247,242,0.38)", letterSpacing: "0.07em", marginTop: 2 }}>{l}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%", maxWidth: 560, marginBottom: 32 }}>
        {funded.map((g, i) => {
          const pct = total > 0 ? Math.round((g.costs.total / total) * 100) : 0;
          const d = goalDate(g);
          const dateStr = d
            ? new Date(d + "-01").toLocaleDateString("en-US", { month: "long", year: "numeric" })
            : "Date TBD";
          const wksLeft = d
            ? Math.max(Math.round((new Date(d + "-01") - now) / (7 * 86_400_000)), 4)
            : weeksUntil;
          const wkly = Math.ceil(g.costs.total / wksLeft);
          const title = goalTitle(g, `Goal ${i + 1}`);
          return (
            <div key={i} style={{ background: "rgba(250,247,242,0.05)", border: "1px solid rgba(250,247,242,0.09)", padding: "18px 22px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                <div>
                  <div style={{ ...serif, fontSize: 17, color: C.ivory }}>{title}</div>
                  <div style={{ ...sans, fontSize: 11, color: "rgba(250,247,242,0.4)", marginTop: 2 }}>
                    {GOAL_TYPES[g.type].icon} {GOAL_TYPES[g.type].label} · {dateStr}
                  </div>
                </div>
                <div style={{ ...sans, fontSize: 13, fontWeight: 500, color: C.goldLight }}>${g.costs.total.toLocaleString()}</div>
              </div>
              <div style={{ height: 3, background: "rgba(250,247,242,0.08)", marginBottom: 8, marginTop: 8 }}>
                <div style={{ height: "100%", width: `${pct}%`, background: C.gold }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", ...sans, fontSize: 11, color: "rgba(250,247,242,0.35)" }}>
                <span>{pct}% of total</span>
                <span>${wkly}/wk to be fully funded</span>
              </div>
            </div>
          );
        })}
      </div>

      <PrimaryBtn onClick={onNext} dark>
        One Last Question →
      </PrimaryBtn>
    </PageShell>
  );
}

// ── PAGE 4 — Survey ───────────────────────────────────────────────────────────
function OptionBtn({ label, selected, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        ...sans, fontSize: 13, width: "100%", textAlign: "left",
        padding: "11px 14px", cursor: "pointer", marginBottom: 8,
        border: `1.5px solid ${selected ? C.green : C.border}`,
        background: selected ? C.green : C.ivory,
        color: selected ? C.ivory : C.text,
        transition: "all 0.15s",
      }}
    >
      {label}
    </button>
  );
}

function SurveyQ({ label, children, last }) {
  return (
    <div style={{ marginBottom: last ? 0 : 28 }}>
      <p style={{ ...serif, fontSize: 17, color: C.text, marginBottom: 13 }}>{label}</p>
      {children}
    </div>
  );
}

function SurveyPage({ onSubmit, onBack }) {
  const [q1, setQ1] = useState("");
  const [q2, setQ2] = useState("");
  const [q3, setQ3] = useState(new Set());
  const [q4, setQ4] = useState("");
  const [email, setEmail] = useState("");

  const toggleFeature = (f) => {
    const next = new Set(q3);
    next.has(f) ? next.delete(f) : next.add(f);
    setQ3(next);
  };

  const features = [
    "AI cost estimates for any goal",
    "Automated monthly savings contributions",
    "Multi-goal tracking & reminders",
    "Bank account integration",
    "Travel & vendor booking",
    "Sharing goals with friends/family",
  ];

  return (
    <PageShell>
      <BackBtn onClick={onBack} />
      <PageHeader
        step="Step 3 of 3"
        title="Would you actually use this?"
        sub="30 seconds. Genuinely helps us figure out what to build."
      />

      <div style={{ background: C.white, border: `1.5px solid ${C.border}`, padding: "36px 32px", width: "100%", maxWidth: 560 }}>
        <SurveyQ label="1. Would you use an app like this?">
          {["Yes, absolutely", "Maybe — depends on the features", "Probably not"].map((o) => (
            <OptionBtn key={o} label={o} selected={q1 === o} onClick={() => setQ1(o)} />
          ))}
        </SurveyQ>

        <SurveyQ label="2. What would you pay per month?">
          {["Free only", "$3–5 / month", "$6–10 / month", "$10+ if it saves me real money"].map((o) => (
            <OptionBtn key={o} label={o} selected={q2 === o} onClick={() => setQ2(o)} />
          ))}
        </SurveyQ>

        <SurveyQ label="3. Which features matter most?">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {features.map((f) => (
              <div key={f} onClick={() => toggleFeature(f)} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "5px 0" }}>
                <div style={{
                  width: 18, height: 18, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                  border: `1.5px solid ${q3.has(f) ? C.green : C.border}`,
                  background: q3.has(f) ? C.green : "transparent",
                  transition: "all 0.15s",
                }}>
                  {q3.has(f) && <span style={{ color: C.white, fontSize: 10, lineHeight: 1 }}>✓</span>}
                </div>
                <span style={{ ...sans, fontSize: 13, color: C.text }}>{f}</span>
              </div>
            ))}
          </div>
        </SurveyQ>

        <SurveyQ label="4. Anything else? (optional)">
          <textarea
            value={q4}
            onChange={(e) => setQ4(e.target.value)}
            placeholder="What would make this a must-have for you?"
            style={{ ...inputStyle, resize: "vertical", minHeight: 80 }}
          />
        </SurveyQ>

        <SurveyQ label="5. Want early access? Drop your email." last>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com"
            style={inputStyle}
          />
        </SurveyQ>

        <button
          onClick={() => onSubmit({ q1, q2, q3: [...q3], q4, email })}
          style={{
            width: "100%", background: C.green, color: C.ivory, border: "none",
            padding: 15, ...sans, fontSize: 13, fontWeight: 500,
            letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer",
            marginTop: 24,
          }}
        >
          Submit →
        </button>
      </div>
    </PageShell>
  );
}

// ── PAGE 5 — Thank You ────────────────────────────────────────────────────────
function ThankYouPage() {
  return (
    <div style={{
      minHeight: "100vh", background: C.green,
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{ textAlign: "center", padding: "60px 24px", maxWidth: 480 }}>
        <div style={{ fontSize: 48, marginBottom: 24 }}>🥂</div>
        <h2 style={{ ...serif, fontSize: 44, fontWeight: 300, color: C.ivory, marginBottom: 16 }}>You're on the list.</h2>
        <p style={{ ...sans, fontSize: 14, color: "rgba(250,247,242,0.55)", lineHeight: 1.75 }}>
          Thanks for taking the time. We're building OHC for people exactly like you —
          and we'll be in touch when it's ready to launch.
        </p>
        <div style={{ width: 40, height: 1, background: "rgba(184,150,90,0.4)", margin: "36px auto 0" }} />
      </div>
    </div>
  );
}

// ── Root App ──────────────────────────────────────────────────────────────────
const PROGRESS = { 1: 0, 2: 30, 3: 62, 4: 88, 5: 100 };

export default function OHC() {
  const [page, setPage] = useState(1);
  const [goals, setGoals] = useState(Array.from({ length: 3 }, newGoal));

  const updateGoal = (i, field, val) => {
    setGoals((gs) => gs.map((g, idx) => {
      if (idx !== i) return g;
      const next = { ...g, [field]: val };
      if (field === "type") next.costs = null;
      return next;
    }));
  };

  const estimateCost = async (i) => {
    const g = goals[i];
    if (!canEstimate(g)) return;
    setGoals((gs) => gs.map((gd, idx) => (idx === i ? { ...gd, loading: true, error: null } : gd)));
    try {
      const costs = await callClaude(buildPrompt(g));
      setGoals((gs) => gs.map((gd, idx) => (idx === i ? { ...gd, costs, loading: false } : gd)));
    } catch (e) {
      setGoals((gs) =>
        gs.map((gd, idx) => (idx === i ? { ...gd, loading: false, error: "Could not estimate — please try again." } : gd))
      );
    }
  };

  return (
    <div style={{ ...sans }}>
      <ProgressBar pct={PROGRESS[page] ?? 0} />
      {page === 1 && <LandingPage onNext={() => setPage(2)} />}
      {page === 2 && <GoalsPage goals={goals} onUpdate={updateGoal} onEstimate={estimateCost} onNext={() => setPage(3)} onBack={() => setPage(1)} />}
      {page === 3 && <SavingsPage goals={goals} onNext={() => setPage(4)} onBack={() => setPage(2)} />}
      {page === 4 && <SurveyPage onSubmit={() => setPage(5)} onBack={() => setPage(3)} />}
      {page === 5 && <ThankYouPage />}
    </div>
  );
}
