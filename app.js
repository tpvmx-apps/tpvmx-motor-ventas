// 1. CONFIGURACIÓN DEL PIPELINE
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

// 2. UTILIDADES DE FORMATO
const cleanPhone = (p) => String(p || "").replace(/\D+/g, "").slice(-10);
const formatPhone = (p) => { const d = cleanPhone(p); return d.length === 10 ? `${d.slice(0,3)} ${d.slice(3,6)} ${d.slice(6)}` : d; };
const formatDateTime = (v) => v ? new Intl.DateTimeFormat("es-MX", {day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit"}).format(new Date(v)) : "Sin registro";
const formatDate = (v) => v ? new Intl.DateTimeFormat("es-MX", {day:"2-digit", month:"short", year:"numeric"}).format(v.includes("T") ? new Date(v) : new Date(`${v}T12:00:00`)) : "Sin fecha";

// 3. REFERENCIAS DEL FORMULARIO (Agregamos los campos faltantes)
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
  category: document.querySelector("#category"), // Agregado
  isActive: document.querySelector("#is-active"), // Agregado
};

// 4. INICIO DE LA APLICACIÓN
async function startApp() {
  document.querySelector("#lead-form").addEventListener("submit", handleSubmit);
  document.querySelector("#reset-form").addEventListener("click", resetForm);
  document.querySelector("#open-lead-form").addEventListener("click", () => { 
    resetForm(); 
    document.querySelector("#lead-form").scrollIntoView({ behavior: "smooth" }); 
  });
  await loadInitialLeads();
}
startApp();

async function loadInitialLeads() {
  try {
    const data = await apiRequest("/leads");
    state.leads = (Array.isArray(data?.leads) ? data.leads : (Array.isArray(data) ? data : [])).map(normalizeLead);
    state.syncMode = "api";
  } catch (e) { state.syncMode = "error"; }
  render();
}

// 5. GUARDAR Y ACTUALIZAR
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
    category: fields.category.value, // Ahora usa el objeto fields
    is_active: fields.isActive.checked,
    updatedAt: new Date().toISOString(),
    lastActivityAt: new Date().toISOString()
  };

  try {
    const saved = await apiRequest("/leads", { method: "POST", body: lead });
    const normalizedSaved = normalizeLead(saved);
    const idx = state.leads.findIndex(l => l.id === lead.id);
    
    if(idx >= 0) state.leads[idx] = normalizedSaved;
    else state.leads.unshift(normalizedSaved);
    
    resetForm();
    render();
    alert("¡Viajero guardado con éxito!");
  } catch(e) { 
    alert("Error al conectar con Supabase. Revisa tu conexión."); 
  }
}

// 6. RENDERIZADO DEL TABLERO
function render() {
  const board = document.querySelector("#board");
  if(!board) return;
  board.innerHTML = "";

  const syncStatus = document.querySelector("#sync-status");
  if (syncStatus) {
    syncStatus.className = "sync-pill " + (state.syncMode === "api" ? "sync-pill--api" : "sync-pill--error");
    syncStatus.textContent = state.syncMode === "api" ? "Supabase activo" : "Conectando...";
  }

  PIPELINE.forEach(stage => {
    const col = document.createElement("div");
    col.className = `kanban-column status-${stage.slug}`;
    
    let leads;
    if (stage.key === "Aliados y Familia") {
      leads = state.leads.filter(l => l.category !== "Cliente");
    } else {
      leads = state.leads.filter(l => l.status === stage.key && l.category === "Cliente");
    }

    col.innerHTML = `<h3>${stage.key} <span class="count">${leads.length}</span></h3><div class="dropzone"></div>`;
    const zone = col.querySelector(".dropzone");

    leads.forEach(lead => {
      const card = document.createElement("div");
      card.className = "lead-card";
      
      // REINTEGRAMOS EL ÚLTIMO MENSAJE Y MEJORAMOS EL DISEÑO
      card.innerHTML = `
        <div class="lead-card__badge" style="background:${lead.category === 'Cliente' ? '#007bff' : '#f0ad4e'}">
          ${lead.category} ${lead.is_active ? '🤖' : '🔇'}
        </div>
        <div class="lead-card__content">
          <h4 class="lead-card__name">${lead.name}</h4>
          <p><strong>📍 Destino:</strong> ${lead.destination}</p>
          <p><strong>📞 Tel:</strong> ${formatPhone(lead.phone)}</p>
          <p><strong>💬 Último msj:</strong> ${lead.lastMessage || "Sin mensajes aún"}</p>
          <p><strong>👤 Asesor:</strong> ${lead.advisor || "Sin asignar"}</p>
          <hr>
          <p style="color: #d9534f"><strong>🚀 Siguiente:</strong> ${lead.nextAction || "Pendiente"}</p>
          <small>📅 Actividad: ${formatDateTime(lead.lastActivityAt)}</small>
        </div>
        <div class="lead-card__actions">
          <button onclick="window.populateFormById('${lead.id}')">✏️ Editar</button>
          <button onclick="window.open('https://wa.me/52${cleanPhone(lead.phone)}')">📱 WA</button>
        </div>
      `;
      zone.appendChild(card);
    });
    board.appendChild(col);
  });
}

// 7. FUNCIONES DE INTERFAZ
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
  fields.category.value = lead.category || "Cliente";
  fields.isActive.checked = lead.is_active !== false;
  document.querySelector("#lead-form").scrollIntoView({ behavior: "smooth" });
};

function resetForm() {
  document.querySelector("#lead-form").reset();
  fields.id.value = "";
  fields.entryDate.value = new Date().toISOString().slice(0, 10);
  document.querySelector("#form-title").textContent = "Nuevo Lead";
  fields.category.value = "Cliente";
  fields.isActive.checked = true;
}

function normalizeLead(l) {
  return {
    ...l,
    category: l.category || "Cliente",
    is_active: l.is_active !== false && l.isActive !== false,
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
  return r.ok ? r.json() : Promise.reject();
}
