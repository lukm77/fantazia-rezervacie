import { SUPA_URL, SUPA_KEY } from "./config";

const useSupa = Boolean(SUPA_URL && SUPA_KEY);
const LS_KEY = "fantazia:bookings";

const headers = {
  apikey: SUPA_KEY,
  Authorization: `Bearer ${SUPA_KEY}`,
  "Content-Type": "application/json",
};

// Načíta všetky rezervácie
export async function fetchBookings() {
  if (!useSupa) {
    try {
      return JSON.parse(localStorage.getItem(LS_KEY)) || [];
    } catch {
      return [];
    }
  }
  const res = await fetch(`${SUPA_URL}/rest/v1/bookings?select=*`, { headers });
  if (!res.ok) throw new Error("Nepodarilo sa načítať rezervácie");
  const rows = await res.json();
  return rows.map((r) => ({
    id: r.id,
    date: r.date,
    start: r.start_min,
    min: r.min,
    service: r.service,
    price: r.price,
    name: r.name,
    phone: r.phone,
    note: r.note || "",
  }));
}

// Pridá novú rezerváciu
export async function addBooking(b) {
  if (!useSupa) {
    const list = await fetchBookings();
    localStorage.setItem(LS_KEY, JSON.stringify([...list, b]));
    return;
  }
  const res = await fetch(`${SUPA_URL}/rest/v1/bookings`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      id: b.id,
      date: b.date,
      start_min: b.start,
      min: b.min,
      service: b.service,
      price: b.price,
      name: b.name,
      phone: b.phone,
      note: b.note,
    }),
  });
  if (!res.ok) throw new Error("Rezerváciu sa nepodarilo uložiť");
}

// Zruší rezerváciu podľa ID
export async function deleteBooking(id) {
  if (!useSupa) {
    const list = await fetchBookings();
    localStorage.setItem(LS_KEY, JSON.stringify(list.filter((b) => b.id !== id)));
    return;
  }
  const res = await fetch(`${SUPA_URL}/rest/v1/bookings?id=eq.${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers,
  });
  if (!res.ok) throw new Error("Rezerváciu sa nepodarilo zrušiť");
}
