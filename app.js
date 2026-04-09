// 1. CONFIGURACIÓN E INDICADORES
const DEFAULT_API_BASE = window.location.protocol === "file:" ? "http://localhost:8787/api" : `${window.location.origin}/api`;

const PIPELINE = [
  { key: "Nuevos", slug: "nuevos", description: "Entradas recientes" },
  { key: "Pendientes", slug: "pendientes", description: "Esperando respuesta" },
  { key: "Cotizados", slug: "cotizados", description: "Propuesta enviada" },
  { key: "Seguimiento", slug: "seguimiento", description: "Cerca del cierre" },
  { key: "Cerrados", slug: "cerrados", description: "Ventas hechas" },
  { key: "Perdidos", slug: "perdidos", description: "No concretados" },
  { key: "Aliados y Familia", slug: "aliados", description: "Contactos personales y socios" },
];

const state = { apiBase: DEFAULT_API_BASE, leads: [], syncMode: "loading" };

// 2. FUNCIONES DE APOYO (FECHAS Y TELÉFONO)
const cleanPhone = (p) => String(p || "").replace(/\D+/g, "").slice(-10);
const formatPhone = (p) => { const d = cleanPhone(p); return d.length === 10 ? `${d.slice(0,3)} ${d.slice(3,6)} ${d.slice(6)}` : d; };
const formatDateTime = (v) => v ? new Intl.DateTimeFormat("es-MX", {day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit"}).format(new Date(v)) : "Sin registro";
const formatDate = (v) => v ? new Intl.DateTimeFormat("es-MX", {day:"2-digit", month:"short", year:"numeric"}).format(v.includes("T") ? new Date(v) : new Date(`${v}T12:00:00`)) : "Sin fecha";

// 3. CAMPOS DEL FORMULARIO
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

// 4. LÓGICA DE LA APP
async function startApp() {
  document.querySelector("#lead-form").addEventListener("submit", handleSubmit);
  document.querySelector("#reset-form").addEventListener("click", resetForm);
  document.querySelector("#open-lead-form").addEventListener("click", () => { resetForm(); document.querySelector("#lead-form").scrollIntoView({ behavior: "smooth" }); });
  await loadInitialLeads();
  render();
}
startApp();

async function loadInitialLeads() {
  try {
    const data = await apiRequest("/leads");
    state.leads = (Array.isArray(data?.leads) ? data.leads : (Array.isArray(data) ? data : [])).map(normalizeLead);
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
    lastActivityAt: new Date().toISOString()
  };

  try {
    const saved = await apiRequest("/leads", { method: "POST", body: lead });
    const idx = state.leads.findIndex(l => l.id === lead.id);
    if(idx >= 0) state.leads[idx] = normalizeLead(saved);
    else state.leads.unshift(normalizeLead(saved));
    render();
    resetForm();
  } catch(e) { alert("Error al conectar con Supabase"); }
}

// 5. RENDERIZADO DEL TABLERO (CON TODOS LOS DATOS)
function render() {
  const board = document.querySelector("#board");
  if(!board) return;
  board.innerHTML = "";

  PIPELINE.forEach(stage => {
    const col = document.createElement("div");
    col.className = `kanban-column status-${stage.slug}`;
    const leads = state.leads.filter(l => l.status === stage.key);
    
    col.innerHTML = `
      <div class="kanban-column__header">
        <h3>${stage.key} <span class="count">${leads.length}</span></h3>
      </div>
      <div class="dropzone"></div>
    `;

    const zone = col.querySelector(".dropzone");
    leads.forEach(lead => {
      const card = document.createElement("div");
      card.className = "lead-card";
      
      // Aquí devolvemos toda la información que se perdió:
      card.innerHTML = `
        <div class="lead-card__badge" style="background:${lead.category === 'Cliente' ? '#007bff' : 'orange'}">
          ${lead.category} ${lead.isActive ? '🤖' : '🔇'}
        </div>
        <div class="lead-card__content">
          <h4 class="lead-card__name">${lead.name}</h4>
          <p><strong>Destino:</strong> ${lead.destination}</p>
          <p><strong>Tel:</strong> ${formatPhone(lead.phone)}</p>
          <p><strong>Último msj:</strong> ${lead.lastMessage || "Sin mensaje"}</p>
          <p><strong>Asesor:</strong> ${lead.advisor || "No asignado"}</p>
          <hr>
          <p style="color: #d9534f"><strong>Próxima acción:</strong> ${lead.nextAction || "Pendiente"}</p>
          <p><strong>Seguimiento:</strong> ${formatDate(lead.followUpDate)}</p>
          <div class="lead-card__notes"><em>${lead.notes || ""}</em></div>
          <small>Actividad: ${formatDateTime(lead.lastActivityAt)}</small>
        </div>
        <div class="lead-card__actions">
          <button class="btn-edit" onclick="populateFormById('${lead.id}')">✏️ Editar</button>
          <button class="btn-wa" onclick="window.open('https://wa.me/52${cleanPhone(lead.phone)}')">📱 WA</button>
        </div>
      `;
      zone.appendChild(card);
    });
    board.appendChild(col);
  });
}

// 6. FUNCIONES DE INTERFAZ
window.populateFormById = (id) => {
  const lead = state.leads.find(l => l.id === id);
  if(!lead) return;
  document.querySelector("#form-title").textContent = "Editar Lead";
  fields.id.value = lead.id;
  fields.name.value = lead.name;
  fields.phone.value = cleanPhone(lead.phone);
  fields.destination.value = lead.destination;
  fields.entryDate.value = lead.entryDate;
  fields.lastMessage.value = lead.lastMessage;
  fields.advisor.value = lead.advisor;
  fields.nextAction.value = lead.nextAction;
  fields.followUpDate.value = lead.followUpDate;
  fields.notes.value = lead.notes;
  fields.status.value = lead.status;
  document.getElementById('category').value = lead.category;
  document.getElementById('is-active').checked = lead.isActive;
  document.querySelector("#lead-form").scrollIntoView({ behavior: "smooth" });
};

function resetForm() {
  document.querySelector("#lead-form").reset();
  fields.id.value = "";
  document.querySelector("#form-title").textContent = "Nuevo Lead";
  document.getElementById('category').value = "Cliente";
  document.getElementById('is-active').checked = true;
}

function normalizeLead(l) {
  return {
    ...l,
    category: l.category || "Cliente",
    isActive: l.isActive !== false && l.is_active !== false,
    status: l.status || "Nuevos",
    lastMessage: l.lastMessage || l.last_message || "",
    nextAction: l.nextAction || l.next_action || "",
    followUpDate: l.followUpDate || l.follow_up_date || ""
  };
}

async function apiRequest(path, opts = {}) {
  const r = await fetch(`${state.apiBase}${path}`, {
    method: opts.method || "GET",
    headers: { "Content-Type": "application/json" },
    body: opts.body ? JSON.stringify(opts.body) : null
  });
  return r.ok ? r.json() : Promise.reject();p
