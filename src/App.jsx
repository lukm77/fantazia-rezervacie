import { useState, useEffect, useMemo } from "react";
import { fetchBookings, addBooking, deleteBooking } from "./storage";

// ── Konfigurácia ──────────────────────────────────────────────
const OPEN = 7 * 60;      // 7:00
const CLOSE = 18 * 60;    // posledný termín musí skončiť do 18:00
const STEP = 30;
const ADMIN_PIN = "1234";

const SERVICES = [
  // Strihanie
  { id: "pansky",          group: "Strihanie", name: "Pánsky strih",             min: 30,  price: 10, icon: "💈" },
  { id: "detsky",          group: "Strihanie", name: "Detský strih (do 12 r.)",  min: 30,  price: 8,  icon: "🧒" },
  { id: "strih-kratke",    group: "Strihanie", name: "Strihanie – krátke vlasy", min: 30,  price: 12, icon: "✂️" },
  { id: "strih-dlhe",      group: "Strihanie", name: "Strihanie – dlhé vlasy",   min: 45,  price: 16, icon: "💇‍♀️" },
  { id: "strih-fukana",    group: "Strihanie", name: "Strih + fúkaná",           min: 60,  price: 20, icon: "💨" },
  // Farbenie
  { id: "farbenie-kratke", group: "Farbenie",  name: "Farbenie – krátke vlasy",  min: 75,  price: 35, icon: "🎨" },
  { id: "farbenie-dlhe",   group: "Farbenie",  name: "Farbenie – dlhé vlasy",    min: 90,  price: 45, icon: "🌈" },
  { id: "melir",           group: "Farbenie",  name: "Melír",                    min: 105, price: 50, icon: "✨" },
  { id: "balayage",        group: "Farbenie",  name: "Balayage",                 min: 120, price: 60, icon: "🌅" },
  // Styling
  { id: "fukana",          group: "Styling",   name: "Fúkaná",                   min: 30,  price: 10, icon: "🌬️" },
  { id: "uces",            group: "Styling",   name: "Spoločenský účes",         min: 60,  price: 25, icon: "👰" },
];
const GROUPS = ["Strihanie", "Farbenie", "Styling"];

const MONTHS = ["Január","Február","Marec","Apríl","Máj","Jún","Júl","August","September","Október","November","December"];
const DAYS_SHORT = ["Ne","Po","Ut","St","Št","Pi","So"];

// ── Pomocné funkcie ───────────────────────────────────────────
const pad = (n) => String(n).padStart(2, "0");
const fmtTime = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => { const t = new Date(); t.setHours(0, 0, 0, 0); return t; };
const fmtDateLong = (key, opts) =>
  new Date(key + "T00:00:00").toLocaleDateString("sk-SK", opts || { weekday: "long", day: "numeric", month: "long" });
const normPhone = (p) => p.replace(/\D/g, "").slice(-9);

function monthDays(year, month) {
  const days = [];
  const d = new Date(year, month, 1);
  while (d.getMonth() === month) {
    if (d.getDay() !== 0) days.push(new Date(d)); // bez nedieľ
    d.setDate(d.getDate() + 1);
  }
  return days;
}
const overlaps = (s1, e1, s2, e2) => s1 < e2 && s2 < e1;

// ── Logo ──────────────────────────────────────────────────────
function Logo({ size = 56 }) {
  return (
    <svg viewBox="0 0 72 72" width={size} height={size} aria-hidden="true">
      <defs>
        <linearGradient id="fzg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#8B5CF6" />
          <stop offset="100%" stopColor="#4C1D95" />
        </linearGradient>
      </defs>
      <circle cx="36" cy="36" r="34" fill="url(#fzg)" />
      <circle cx="36" cy="36" r="34" fill="none" stroke="#D8B4FE" strokeWidth="1.5" opacity="0.6" />
      {/* Monogram F */}
      <text x="27" y="47" textAnchor="middle" fontSize="32" fontFamily="Prata, Georgia, serif" fill="#F5EEFF">F</text>
      {/* Nožnice */}
      <g stroke="#E9D5FF" strokeWidth="2.6" strokeLinecap="round" fill="none">
        <line x1="43" y1="24" x2="55" y2="48" />
        <line x1="55" y1="24" x2="43" y2="48" />
      </g>
      <circle cx="41.5" cy="51" r="3.4" fill="none" stroke="#E9D5FF" strokeWidth="2.4" />
      <circle cx="56.5" cy="51" r="3.4" fill="none" stroke="#E9D5FF" strokeWidth="2.4" />
      {/* Oblúčik – prameň vlasov */}
      <path d="M16 20 Q36 6 56 20" stroke="#C4B5FD" strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.9" />
    </svg>
  );
}

// ── Hlavný komponent ──────────────────────────────────────────
export default function FantaziaRezervacie() {
  const now = new Date();
  const [tab, setTab] = useState("book"); // book | cennik | info
  const [screen, setScreen] = useState("book"); // book | done | admin-login | admin
  const [view, setView] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [selectedDate, setSelectedDate] = useState(null);
  const [serviceId, setServiceId] = useState(SERVICES[2].id);
  const [selectedStart, setSelectedStart] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [form, setForm] = useState({ name: "", phone: "", note: "" });
  const [confirmed, setConfirmed] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState(false);
  const [lookupPhone, setLookupPhone] = useState("");
  const [lookupDone, setLookupDone] = useState(false);

  const service = SERVICES.find((s) => s.id === serviceId);

  const loadBookings = async () => {
    try {
      const list = await fetchBookings();
      setBookings(list);
      return list;
    } catch { setBookings([]); return []; }
  };
  useEffect(() => { loadBookings(); }, []);

  const days = useMemo(() => monthDays(view.y, view.m), [view]);
  const t0 = today();

  const dayBookings = useMemo(() => {
    if (!selectedDate) return [];
    const key = dateKey(selectedDate);
    return bookings.filter((b) => b.date === key).sort((a, b) => a.start - b.start);
  }, [bookings, selectedDate]);

  const slots = useMemo(() => {
    if (!selectedDate || !service) return [];
    const out = [];
    const isToday = dateKey(selectedDate) === dateKey(new Date());
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
    for (let s = OPEN; s + STEP <= CLOSE; s += STEP) {
      const busy = dayBookings.some((b) => overlaps(s, s + STEP, b.start, b.start + b.min));
      const fits = s + service.min <= CLOSE &&
        !dayBookings.some((b) => overlaps(s, s + service.min, b.start, b.start + b.min));
      const past = isToday && s <= nowMin;
      out.push({ start: s, busy, available: fits && !busy && !past });
    }
    return out;
  }, [selectedDate, service, dayBookings]);

  const canGoBack = view.y > now.getFullYear() || (view.y === now.getFullYear() && view.m > now.getMonth());
  const shiftMonth = (dir) => {
    let m = view.m + dir, y = view.y;
    if (m < 0) { m = 11; y--; }
    if (m > 11) { m = 0; y++; }
    setView({ y, m }); setSelectedDate(null); setSelectedStart(null);
  };

  const submit = async () => {
    setError("");
    if (!form.name.trim()) return setError("Prosím, zadajte svoje meno.");
    if (form.phone.replace(/\D/g, "").length < 9) return setError("Prosím, zadajte platné telefónne číslo.");
    setSaving(true);
    try {
      const fresh = await loadBookings();
      const key = dateKey(selectedDate);
      const clash = fresh.some((b) => b.date === key &&
        overlaps(selectedStart, selectedStart + service.min, b.start, b.start + b.min));
      if (clash) {
        setSelectedStart(null);
        setError("Tento termín si medzičasom niekto rezervoval. Vyberte si iný čas.");
        setSaving(false);
        return;
      }
      const booking = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        date: key, start: selectedStart, min: service.min,
        service: service.name, price: service.price,
        name: form.name.trim(), phone: form.phone.trim(), note: form.note.trim(),
        createdAt: new Date().toISOString(),
      };
      await addBooking(booking);
      setBookings([...fresh, booking]);
      setConfirmed(booking);
      setScreen("done");
      setForm({ name: "", phone: "", note: "" });
      setSelectedStart(null);
    } catch {
      setError("Rezerváciu sa nepodarilo uložiť. Skúste to znova.");
    }
    setSaving(false);
  };

  const cancelBooking = async (id) => {
    try {
      await deleteBooking(id);
    } catch { /* zobrazíme aspoň aktuálny stav */ }
    await loadBookings();
  };

  const tryPin = () => {
    if (pin === ADMIN_PIN) { setScreen("admin"); setPin(""); setPinError(false); }
    else setPinError(true);
  };

  // Admin štatistiky
  const stats = useMemo(() => {
    const tKey = dateKey(new Date());
    const future = bookings.filter((b) => b.date >= tKey);
    const todayCount = bookings.filter((b) => b.date === tKey).length;
    const revenue = future.reduce((sum, b) => sum + (b.price || 0), 0);
    return { todayCount, futureCount: future.length, revenue };
  }, [bookings]);

  // Moja rezervácia – vyhľadanie podľa telefónu
  const myBookings = useMemo(() => {
    if (!lookupDone) return [];
    const p = normPhone(lookupPhone);
    if (p.length < 9) return [];
    const tKey = dateKey(new Date());
    return bookings
      .filter((b) => normPhone(b.phone) === p && b.date >= tKey)
      .sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start);
  }, [bookings, lookupPhone, lookupDone]);

  const goTab = (t) => { setTab(t); setScreen("book"); setConfirmed(null); setError(""); };

  // ── UI ──────────────────────────────────────────────────────
  return (
    <div className="fz-root">
      <style>{css}</style>

      <header className="fz-header">
        <div className="fz-logo"><Logo /></div>
        <div>
          <h1>Kaderníctvo Fantázia</h1>
          <p className="fz-sub">Po–So · 7:00–18:00 · posledný termín končí o 18:00</p>
        </div>
      </header>

      {/* Navigácia */}
      {screen !== "admin" && screen !== "admin-login" && (
        <nav className="fz-tabs">
          <button className={`fz-tab ${tab === "book" ? "is-active" : ""}`} onClick={() => goTab("book")}>Rezervácia</button>
          <button className={`fz-tab ${tab === "cennik" ? "is-active" : ""}`} onClick={() => goTab("cennik")}>Cenník</button>
          <button className={`fz-tab ${tab === "info" ? "is-active" : ""}`} onClick={() => goTab("info")}>Info</button>
        </nav>
      )}

      {/* ── Potvrdenie ── */}
      {screen === "done" && confirmed && (
        <section className="fz-card fz-done">
          <div className="fz-done-icon">✔</div>
          <h2>Termín je rezervovaný</h2>
          <p className="fz-done-line">{confirmed.service} · {confirmed.price} €</p>
          <p className="fz-done-line fz-done-strong">
            {fmtDateLong(confirmed.date)} · {fmtTime(confirmed.start)}–{fmtTime(confirmed.start + confirmed.min)}
          </p>
          <p className="fz-muted">Tešíme sa na vás, {confirmed.name}!</p>
          <p className="fz-muted fz-small">Ak potrebujete termín zrušiť, nájdete ho v záložke Info podľa telefónneho čísla.</p>
          <button className="fz-btn" onClick={() => { setScreen("book"); setConfirmed(null); }}>Nová rezervácia</button>
        </section>
      )}

      {/* ── Admin prihlásenie ── */}
      {screen === "admin-login" && (
        <section className="fz-card fz-done">
          <h2>Vstup pre administrátora</h2>
          <p className="fz-muted">Zadajte PIN kód.</p>
          <input
            className="fz-input fz-pin"
            type="password" inputMode="numeric" maxLength={8} value={pin}
            onChange={(e) => { setPin(e.target.value); setPinError(false); }}
            onKeyDown={(e) => e.key === "Enter" && tryPin()}
            placeholder="• • • •"
          />
          {pinError && <p className="fz-error">Nesprávny PIN.</p>}
          <button className="fz-btn" onClick={tryPin}>Prihlásiť sa</button>
          <button className="fz-link fz-mt" onClick={() => setScreen("book")}>← Späť na rezervácie</button>
        </section>
      )}

      {/* ── Admin ── */}
      {screen === "admin" && (
        <>
          <section className="fz-card">
            <div className="fz-row-between">
              <h2>Správa rezervácií</h2>
              <button className="fz-link" onClick={() => setScreen("book")}>Odhlásiť sa</button>
            </div>
            <div className="fz-stats">
              <div className="fz-stat"><span className="fz-stat-num">{stats.todayCount}</span><span className="fz-stat-label">dnes</span></div>
              <div className="fz-stat"><span className="fz-stat-num">{stats.futureCount}</span><span className="fz-stat-label">nadchádzajúce</span></div>
              <div className="fz-stat"><span className="fz-stat-num">{stats.revenue} €</span><span className="fz-stat-label">očakávaná tržba</span></div>
            </div>
          </section>
          <section className="fz-card">
            {bookings.length === 0 && <p className="fz-muted">Zatiaľ žiadne rezervácie.</p>}
            {[...bookings].sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start).map((b) => (
              <div key={b.id} className="fz-admin-item">
                <div>
                  <div className="fz-admin-when">
                    {fmtDateLong(b.date, { weekday: "short", day: "numeric", month: "numeric" })} {fmtTime(b.start)}–{fmtTime(b.start + b.min)}
                  </div>
                  <div className="fz-admin-who">{b.name} · {b.phone}</div>
                  <div className="fz-muted">{b.service} · {b.price} €{b.note ? ` · ${b.note}` : ""}</div>
                </div>
                <button className="fz-cancel" onClick={() => cancelBooking(b.id)}>Zrušiť</button>
              </div>
            ))}
          </section>
        </>
      )}

      {/* ── Cenník ── */}
      {screen === "book" && tab === "cennik" && (
        <section className="fz-card">
          <h2>Cenník služieb</h2>
          {GROUPS.map((g) => (
            <div key={g} className="fz-price-group">
              <h3 className="fz-price-head">{g}</h3>
              {SERVICES.filter((s) => s.group === g).map((s) => (
                <div key={s.id} className="fz-price-row">
                  <span className="fz-price-icon">{s.icon}</span>
                  <span className="fz-price-name">{s.name}<span className="fz-price-min"> · {s.min} min</span></span>
                  <span className="fz-price-dots" />
                  <span className="fz-price-val">{s.price} €</span>
                </div>
              ))}
            </div>
          ))}
          <p className="fz-muted fz-small">Ceny sú orientačné – konečná cena závisí od dĺžky a hustoty vlasov. Radi vám poradíme na mieste.</p>
          <button className="fz-btn fz-mt" onClick={() => goTab("book")}>Rezervovať termín</button>
        </section>
      )}

      {/* ── Info + moja rezervácia ── */}
      {screen === "book" && tab === "info" && (
        <>
          <section className="fz-card">
            <h2>Otváracie hodiny</h2>
            <div className="fz-hours">
              <div className="fz-hours-row"><span>Pondelok – Sobota</span><strong>7:00 – 18:00</strong></div>
              <div className="fz-hours-row"><span>Nedeľa</span><strong className="fz-closed">zatvorené</strong></div>
            </div>
            <p className="fz-muted fz-small">Posledný termín prijímame tak, aby skončil najneskôr o 18:00.</p>
          </section>

          <section className="fz-card">
            <h2>Moja rezervácia</h2>
            <p className="fz-muted fz-small fz-mb">Zadajte telefónne číslo, ktoré ste uviedli pri rezervácii.</p>
            <div className="fz-lookup">
              <input className="fz-input" type="tel" value={lookupPhone}
                onChange={(e) => { setLookupPhone(e.target.value); setLookupDone(false); }}
                placeholder="+421 900 000 000" />
              <button className="fz-btn fz-btn-sm" onClick={() => setLookupDone(true)}>Vyhľadať</button>
            </div>
            {lookupDone && myBookings.length === 0 && (
              <p className="fz-muted fz-mt">Na toto číslo sme nenašli žiadnu nadchádzajúcu rezerváciu.</p>
            )}
            {myBookings.map((b) => (
              <div key={b.id} className="fz-admin-item">
                <div>
                  <div className="fz-admin-when">{fmtDateLong(b.date)} · {fmtTime(b.start)}–{fmtTime(b.start + b.min)}</div>
                  <div className="fz-muted">{b.service} · {b.price} €</div>
                </div>
                <button className="fz-cancel" onClick={() => cancelBooking(b.id)}>Zrušiť</button>
              </div>
            ))}
          </section>

          <section className="fz-card">
            <h2>Kontakt</h2>
            <p className="fz-contact">📍 Hlavná 12, Ostrava</p>
            <p className="fz-contact">📞 +421 900 123 456</p>
            <p className="fz-muted fz-small">Adresu a telefón si upravte podľa skutočnosti.</p>
          </section>
        </>
      )}

      {/* ── Rezervácia ── */}
      {screen === "book" && tab === "book" && (
        <>
          <section className="fz-card">
            <div className="fz-month-nav">
              <button className="fz-nav-btn" onClick={() => shiftMonth(-1)} disabled={!canGoBack} aria-label="Predchádzajúci mesiac">‹</button>
              <span className="fz-month-name">{MONTHS[view.m]} {view.y}</span>
              <button className="fz-nav-btn" onClick={() => shiftMonth(1)} aria-label="Nasledujúci mesiac">›</button>
            </div>
            <div className="fz-days">
              {days.map((d) => {
                const past = d < t0;
                const active = selectedDate && dateKey(d) === dateKey(selectedDate);
                return (
                  <button key={dateKey(d)} className={`fz-day ${active ? "is-active" : ""}`}
                    disabled={past} onClick={() => { setSelectedDate(d); setSelectedStart(null); setError(""); }}>
                    <span className="fz-day-name">{DAYS_SHORT[d.getDay()]}</span>
                    <span className="fz-day-num">{d.getDate()}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="fz-card">
            <h2>Vyberte službu</h2>
            {GROUPS.map((g) => (
              <div key={g}>
                <h3 className="fz-group-head">{g}</h3>
                <div className="fz-services">
                  {SERVICES.filter((s) => s.group === g).map((s) => (
                    <button key={s.id} className={`fz-service ${s.id === serviceId ? "is-active" : ""}`}
                      onClick={() => { setServiceId(s.id); setSelectedStart(null); }}>
                      <span className="fz-service-icon">{s.icon}</span>
                      <span className="fz-service-name">{s.name}</span>
                      <span className="fz-service-min">{s.min} min · {s.price} €</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </section>

          <section className="fz-card">
            <h2>{selectedDate
              ? `Voľné termíny · ${selectedDate.toLocaleDateString("sk-SK", { weekday: "long", day: "numeric", month: "long" })}`
              : "Najprv si vyberte deň"}</h2>
            {selectedDate && (
              <>
                <div className="fz-slots">
                  {slots.map((sl) => (
                    <button key={sl.start}
                      className={`fz-slot ${sl.busy ? "is-busy" : ""} ${selectedStart === sl.start ? "is-active" : ""}`}
                      disabled={!sl.available}
                      onClick={() => { setSelectedStart(sl.start); setError(""); }}>
                      {sl.busy ? "Obsadené" : fmtTime(sl.start)}
                    </button>
                  ))}
                </div>
                <p className="fz-muted fz-small">
                  Vybraná služba trvá {service.min} min. Obsadené termíny sú anonymné – nezobrazuje sa, kto ich rezervoval.
                </p>
              </>
            )}
          </section>

          {selectedStart !== null && selectedDate && (
            <section className="fz-card fz-form">
              <h2>Dokončenie rezervácie</h2>
              <p className="fz-summary">
                {service.name} · {selectedDate.toLocaleDateString("sk-SK", { day: "numeric", month: "long" })} ·{" "}
                <strong>{fmtTime(selectedStart)}–{fmtTime(selectedStart + service.min)}</strong> · {service.price} €
              </p>
              <label className="fz-label">Meno a priezvisko
                <input className="fz-input" value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="napr. Jana Nováková" />
              </label>
              <label className="fz-label">Telefónne číslo
                <input className="fz-input" type="tel" value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="+421 900 000 000" />
              </label>
              <label className="fz-label">Poznámka (nepovinné)
                <input className="fz-input" value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                  placeholder="napr. ofina, melír…" />
              </label>
              {error && <p className="fz-error">{error}</p>}
              <button className="fz-btn" onClick={submit} disabled={saving}>
                {saving ? "Ukladám…" : "Rezervovať termín"}
              </button>
            </section>
          )}
          {error && selectedStart === null && <p className="fz-error fz-center">{error}</p>}
        </>
      )}

      <footer className="fz-footer">
        <span>Kaderníctvo Fantázia · rezervačný systém</span>
        {screen !== "admin" && screen !== "admin-login" && (
          <button className="fz-link" onClick={() => { setScreen("admin-login"); setPin(""); setPinError(false); }}>
            Admin
          </button>
        )}
      </footer>
    </div>
  );
}

// ── Štýly ─────────────────────────────────────────────────────
const css = `
@import url('https://fonts.googleapis.com/css2?family=Prata&family=Manrope:wght@400;500;600;700&display=swap');

:root {
  --fz-bg: #F5F1FB;
  --fz-card: #FFFFFF;
  --fz-ink: #2E1A4F;
  --fz-muted: #7C6E96;
  --fz-violet: #6D28D9;
  --fz-violet-deep: #4C1D95;
  --fz-lilac: #EDE6FA;
  --fz-lilac-line: #DCCEF5;
  --fz-busy: #F1EDF7;
  --fz-error: #B4236B;
}
.fz-root {
  min-height: 100vh;
  background:
    radial-gradient(600px 300px at 100% -50px, #E9DDFB 0%, transparent 70%),
    radial-gradient(500px 260px at -80px 30%, #F3E8FF 0%, transparent 70%),
    var(--fz-bg);
  color: var(--fz-ink);
  font-family: 'Manrope', -apple-system, 'Segoe UI', sans-serif;
  padding: 16px 14px 28px;
  max-width: 560px;
  margin: 0 auto;
}
.fz-header { display: flex; gap: 14px; align-items: center; padding: 8px 4px 14px; }
.fz-header h1 {
  font-family: 'Prata', Georgia, serif;
  font-size: 24px; margin: 0; line-height: 1.15;
  color: var(--fz-violet-deep); letter-spacing: .3px;
}
.fz-sub { margin: 4px 0 0; font-size: 12px; color: var(--fz-muted); }
.fz-logo { filter: drop-shadow(0 4px 10px rgba(109,40,217,.25)); flex-shrink: 0; }

.fz-tabs {
  display: flex; gap: 6px; background: var(--fz-lilac);
  padding: 5px; border-radius: 16px; margin-bottom: 14px;
  border: 1px solid var(--fz-lilac-line);
}
.fz-tab {
  flex: 1; padding: 10px 0; border-radius: 12px; border: none; cursor: pointer;
  background: transparent; color: var(--fz-violet-deep);
  font-family: inherit; font-weight: 700; font-size: 13.5px;
}
.fz-tab.is-active {
  background: linear-gradient(135deg, #7C3AED, #5B21B6); color: #fff;
  box-shadow: 0 4px 10px rgba(109,40,217,.3);
}

.fz-card {
  background: var(--fz-card);
  border: 1px solid var(--fz-lilac-line);
  border-radius: 18px; padding: 16px; margin-bottom: 14px;
  box-shadow: 0 2px 12px rgba(76,29,149,.06);
}
.fz-card h2 { font-size: 15px; font-weight: 700; margin: 0 0 12px; color: var(--fz-violet-deep); }

.fz-month-nav { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.fz-month-name { font-family: 'Prata', Georgia, serif; font-size: 19px; color: var(--fz-violet-deep); }
.fz-nav-btn {
  width: 38px; height: 38px; border-radius: 12px; border: 1px solid var(--fz-lilac-line);
  background: var(--fz-lilac); color: var(--fz-violet); font-size: 20px; cursor: pointer;
}
.fz-nav-btn:disabled { opacity: .35; cursor: default; }

.fz-days { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 6px; scrollbar-width: thin; }
.fz-day {
  flex: 0 0 auto; width: 52px; padding: 8px 0 10px; border-radius: 14px;
  border: 1px solid var(--fz-lilac-line); background: #FBF9FF; cursor: pointer;
  display: flex; flex-direction: column; align-items: center; gap: 2px;
  transition: transform .12s ease, background .12s ease;
}
.fz-day:disabled { opacity: .35; cursor: default; }
.fz-day-name { font-size: 11px; color: var(--fz-muted); font-weight: 600; }
.fz-day-num { font-size: 18px; font-weight: 700; }
.fz-day.is-active {
  background: linear-gradient(135deg, #7C3AED, #5B21B6);
  border-color: transparent; transform: translateY(-2px);
  box-shadow: 0 6px 14px rgba(109,40,217,.35);
}
.fz-day.is-active .fz-day-name, .fz-day.is-active .fz-day-num { color: #fff; }

.fz-group-head, .fz-price-head {
  font-size: 12px; text-transform: uppercase; letter-spacing: 1.2px;
  color: var(--fz-muted); margin: 14px 0 8px; font-weight: 700;
}
.fz-group-head:first-of-type { margin-top: 0; }

.fz-services { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.fz-service {
  display: flex; flex-direction: column; align-items: flex-start; gap: 3px;
  padding: 11px 12px; border-radius: 14px; text-align: left;
  border: 1px solid var(--fz-lilac-line); background: #FBF9FF; cursor: pointer;
  font-family: inherit;
}
.fz-service-icon { font-size: 17px; }
.fz-service-name { font-size: 13px; font-weight: 600; color: var(--fz-ink); line-height: 1.25; }
.fz-service-min { font-size: 12px; color: var(--fz-violet); font-weight: 700; }
.fz-service.is-active {
  background: var(--fz-lilac); border-color: var(--fz-violet);
  box-shadow: inset 0 0 0 1px var(--fz-violet);
}

.fz-slots { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.fz-slot {
  padding: 10px 0; border-radius: 12px; font-weight: 700; font-size: 13.5px;
  border: 1px solid var(--fz-lilac-line); background: #FBF9FF; color: var(--fz-ink);
  cursor: pointer; font-family: inherit;
}
.fz-slot:disabled { cursor: default; }
.fz-slot:disabled:not(.is-busy) { opacity: .3; }
.fz-slot.is-busy {
  background: var(--fz-busy); color: var(--fz-muted);
  font-weight: 500; font-size: 11.5px; border-style: dashed;
}
.fz-slot.is-active {
  background: linear-gradient(135deg, #7C3AED, #5B21B6);
  color: #fff; border-color: transparent;
  box-shadow: 0 5px 12px rgba(109,40,217,.35);
}

.fz-form .fz-summary { font-size: 13.5px; color: var(--fz-muted); margin: 0 0 12px; }
.fz-form .fz-summary strong { color: var(--fz-violet-deep); }
.fz-label { display: block; font-size: 12.5px; font-weight: 700; color: var(--fz-violet-deep); margin-bottom: 10px; }
.fz-input {
  display: block; width: 100%; box-sizing: border-box; margin-top: 5px;
  padding: 12px 13px; border-radius: 12px; border: 1px solid var(--fz-lilac-line);
  background: #FBF9FF; font-size: 15px; font-family: inherit; color: var(--fz-ink);
}
.fz-input:focus { outline: 2px solid var(--fz-violet); outline-offset: 1px; }
.fz-pin { max-width: 180px; margin: 8px auto 12px; text-align: center; font-size: 20px; letter-spacing: 6px; }

.fz-btn {
  width: 100%; padding: 14px; border-radius: 14px; border: none; cursor: pointer;
  background: linear-gradient(135deg, #7C3AED, #5B21B6); color: #fff;
  font-size: 15.5px; font-weight: 700; font-family: inherit;
  box-shadow: 0 8px 18px rgba(109,40,217,.32); margin-top: 4px;
}
.fz-btn:disabled { opacity: .6; }
.fz-btn-sm { width: auto; padding: 12px 18px; margin: 0; font-size: 14px; flex-shrink: 0; }

.fz-done { text-align: center; padding: 28px 18px; }
.fz-done-icon {
  width: 54px; height: 54px; border-radius: 50%; margin: 0 auto 12px;
  background: linear-gradient(135deg, #7C3AED, #5B21B6); color: #fff;
  display: flex; align-items: center; justify-content: center; font-size: 24px;
}
.fz-done h2 { font-family: 'Prata', Georgia, serif; font-size: 20px; margin: 0 0 10px; }
.fz-done-line { margin: 2px 0; font-size: 14.5px; }
.fz-done-strong { font-weight: 700; color: var(--fz-violet-deep); }
.fz-done .fz-btn { margin-top: 16px; }

.fz-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.fz-stat {
  background: var(--fz-lilac); border-radius: 14px; padding: 12px 6px;
  display: flex; flex-direction: column; align-items: center; gap: 2px;
}
.fz-stat-num { font-family: 'Prata', Georgia, serif; font-size: 19px; color: var(--fz-violet-deep); }
.fz-stat-label { font-size: 11px; color: var(--fz-muted); font-weight: 600; }

.fz-admin-item {
  display: flex; justify-content: space-between; gap: 10px; align-items: center;
  padding: 10px 0; border-bottom: 1px solid var(--fz-lilac);
}
.fz-admin-item:last-child { border-bottom: none; }
.fz-admin-when { font-weight: 700; font-size: 14px; }
.fz-admin-who { font-size: 13px; color: var(--fz-violet-deep); margin-top: 2px; }
.fz-cancel {
  border: 1px solid #EAB8D2; background: #FDF2F8; color: var(--fz-error);
  border-radius: 10px; padding: 8px 12px; font-weight: 700; cursor: pointer; font-family: inherit;
  flex-shrink: 0;
}

.fz-price-group { margin-bottom: 6px; }
.fz-price-row { display: flex; align-items: baseline; gap: 8px; padding: 7px 0; }
.fz-price-icon { font-size: 15px; }
.fz-price-name { font-size: 14px; font-weight: 600; }
.fz-price-min { color: var(--fz-muted); font-weight: 500; font-size: 12.5px; }
.fz-price-dots { flex: 1; border-bottom: 2px dotted var(--fz-lilac-line); transform: translateY(-3px); }
.fz-price-val { font-weight: 800; color: var(--fz-violet-deep); font-size: 14.5px; white-space: nowrap; }

.fz-hours-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 14px; }
.fz-closed { color: var(--fz-error); }
.fz-contact { margin: 6px 0; font-size: 14.5px; }
.fz-lookup { display: flex; gap: 8px; align-items: stretch; }
.fz-lookup .fz-input { margin-top: 0; }

.fz-row-between { display: flex; justify-content: space-between; align-items: baseline; }
.fz-link { background: none; border: none; color: var(--fz-violet); font-weight: 700; cursor: pointer; font-family: inherit; font-size: 13px; padding: 0; }
.fz-muted { color: var(--fz-muted); font-size: 13px; }
.fz-small { margin: 10px 0 0; font-size: 12px; }
.fz-mb { margin-bottom: 10px; }
.fz-mt { margin-top: 12px; }
.fz-error { color: var(--fz-error); font-size: 13.5px; font-weight: 600; margin: 4px 0 10px; }
.fz-center { text-align: center; }
.fz-footer {
  display: flex; justify-content: space-between; align-items: center;
  padding: 6px 4px 0; font-size: 11.5px; color: var(--fz-muted);
}
@media (prefers-reduced-motion: reduce) { .fz-day, .fz-slot { transition: none; } }
`;
