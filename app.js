// 1. CONFIGURACIÓN INICIAL
const DEFAULT_API_BASE = window.location.protocol === "file:"
    ? "http://localhost:8787/api"
    : `${window.location.origin}/api`;

const PIPELINE = [
  { key: "Nuevos", slug: "nuevos", description: "Entradas recientes" },
  { key: "Pendientes", slug: "pendientes", description: "Esperando respuesta" },
  { key: "Cotizados", slug: "cotizados", description: "Propuesta enviada" },
  { key: "Seguimiento", slug: "seguimiento", description: "Cerca del cierre" },
  { key: "Cerrados", slug: "cerrados", description: "Ventas hechas" },
  { key: "Perdidos", slug: "perdidos", description: "No concretados" },
];

// 2. FUNCIONES DE FORMATO (Movidas arriba para evitar errores)
function cleanPhone(p) { return String(p || "").replace(/\D+/g, "").slice(-10); }
function formatPhone(p) { const d = cleanPhone(p); return d.length === 10 ? `${d.slice(0,3)} ${d.slice(3,6)} ${d.slice(6)}` : d || "Sin tel"; }
function formatDateTime(v) { 
    if(!v) return "Sin registro"; 
    try {
        return new Intl.DateTimeFormat("es-MX", {day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit"}).format(new Date(v));
    } catch(e) { return "Fecha inválida"; }
}
function formatDate(v) {
    if(!v) return "Sin fecha";
    try {
        const d = v.includes("T") ? new Date(v) : new Date(`${v}T12:00:00`);
        return new Intl.DateTimeFormat("es-MX", {day:"2-digit", month:"short", year:"numeric"}).format(d);
    } catch(e) { return v; }
}

const state = {
  apiBase: DEFAULT_API_BASE,
  leads: [],
  draggedLeadId: null,
  selectedLeadId: null,
  syncMode: "loading",
};

// 3. ELEMENTOS DEL DOM
const board = document.querySelector("#board");
const metricsContainer = document.querySelector("#metrics");
const form = document.querySelector("#lead-form");
const fields = {
  id: document.querySelector("#lead-id"),
  name: document.querySelector("#client-name"),
  phone: document.querySelector("#phone"),
  destination: document.querySelector("#destination"),
  entryDate: document.querySelector("#entry-date"),
  lastMessage: document.querySelector("#last-message"),
  advisor: document.querySelector("#advisor"),
  nextAction: document.querySelector("#next-action"),
  followUpDate: document.querySelector("#follow-up-date"),
  notes: document.querySelector("#notes"),
  status: document.querySelector("#status"),
};

// 4. INICIO DE LA APP
async function startApp() {
  bindEvents();
  resetForm();
  await loadInitialLeads();
  render();
}
startApp();

function bindEvents() {
  form.addEventListener("submit", handleSubmit);
  document.querySelector("#reset-form").addEventListener("click", resetForm);
  document.querySelector("#open-lead-form").addEventListener("click", () => {
    resetForm();
    form.scrollIntoView({ behavior: "smooth" });
    fields.name.focus();
  });
}

async function loadInitialLeads() {
  try {
    const data = await apiRequest("/leads");
    state.leads = Array.isArray(data?.leads) ? data.leads.map(normalizeLead) : (Array.isArray(data) ? data.map(normalizeLead) : []);
    state.syncMode = "api";
  } catch (e) { state.syncMode = "error"; }
}

async function handleSubmit(event) {
  event.preventDefault();
  const lead = {
    id: fields.id.value || `lead-${Date.now()}`,
    name: fields.name.value.trim(),
    phone: fields.phone.value.trim(),
    destination: fields.destination.value.trim(),
    entryDate: fields.entryDate.value,
    lastMessage: fields.lastMessage.value.trim(),
    advisor: fields.advisor.value.trim(),
    nextAction: fields.nextAction.value.trim(),
    followUpDate: fields.followUpDate.value,
    notes: fields.notes.value.trim(),
    status: fields.status.value,
    category: document.getElementById('category').value,
    isActive: document.getElementById('is-active').checked,
    updatedAt: new Date().toISOString(),
    lastActivityAt: new Date().toISOString(),
    source: fields.id.value ? "manual" : "manual"
  };

  try {
    const saved = await apiRequest("/leads", { method: "POST", body: lead });
    const idx = state.leads.findIndex(l => l.id === lead.id);
    if(idx >= 0) state.leads[idx] = normalizeLead(saved);
    else state.leads.unshift(normalizeLead(saved));
    render();
    resetForm();
  } catch(e) { alert("Error al guardar en Supabase"); }
}

function render() {
  renderBoard();
  // Aquí puedes añadir renderMetrics() si tienes el template en el HTML
}

function renderBoard() {
  if(!board) return;
  board.innerHTML = "";
  PIPELINE.forEach(stage => {
    const col = document.createElement("div");
    col.className = `kanban-column status-${stage.slug}`;
    col.innerHTML = `<h3>${stage.key} <span class="count">0</span></h3><div class="dropzone"></div>`;
    
    const leads = state.leads.filter(l => l.status === stage.key);
    col.querySelector(".count").textContent = leads.length;
    const zone = col.querySelector(".dropzone");

    leads.forEach(lead => {
        const card = document.createElement("div");
        card.className = "lead-card";
        const isOverdue = lead.followUpDate && new Date(lead.followUpDate) < new Date().setHours(0,0,0,0);
        
        card.innerHTML = `
            <div class="lead-card__header">
                <strong>${lead.name}</strong>
                ${lead.category !== 'Cliente' ? `<small style="background:orange; padding:2px 5px; border-radius:3px; color:white">${lead.category}</small>` : ''}
            </div>
            <div class="lead-card__body">
                <p>📍 ${lead.destination}</p>
                <p>📞 ${formatPhone(lead.phone)}</p>
                <p>⏰ Actividad: ${formatDateTime(lead.lastActivityAt)}</p>
            </div>
            <div class="lead-card__actions">
                <button onclick="populateFormById('${lead.id}')">EDITAR</button>
            </div>
        `;
        zone.appendChild(card);
    });
    board.appendChild(col);
  });
}

// Función global para que los botones de las cards funcionen
window.populateFormById = function(id) {
    const lead = state.leads.find(l => l.id === id);
    if(lead) populateForm(lead);
};

function populateForm(lead) {
  document.querySelector("#form-title").textContent = "Editar Lead";
  fields.id.value = lead.id;
  fields.name.value = lead.name;
  fields.phone.value = cleanPhone(lead.phone);
  fields.destination.value = lead.destination;
  fields.entryDate.value = lead.entryDate || "";
  fields.status.value = lead.status;
  document.getElementById('category').value = lead.category || "Cliente";
  document.getElementById('is-active').checked = lead.isActive !== false;
  form.scrollIntoView({ behavior: "smooth" });
}

function resetForm() {
  form.reset();
  fields.id.value = "";
  document.querySelector("#form-title").textContent = "Nuevo Lead";
  document.getElementById('category').value = "Cliente";
  document.getElementById('is-active').checked = true;
}

function normalizeLead(l) {
  return {
    ...l,
    category: l.category || "Cliente",
    isActive: l.isActive !== false || l.is_active !== false,
    status: l.status || "Nuevos"
  };
}

async function apiRequest(path, opts = {}) {
  const r = await fetch(`${state.apiBase}${path}`, {
    method: opts.method || "GET",
    headers: { "Content-Type": "application/json" },
    body: opts.body ? JSON.stringify(opts.body) : null
  });
  return r.ok ? r.json() : Promise.reject();
}
