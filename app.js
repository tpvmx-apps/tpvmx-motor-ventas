const DEFAULT_API_BASE =
  window.location.protocol === "file:"
    ? "http://localhost:8787/api"
    : `${window.location.origin}/api`;

const PIPELINE = [
  { key: "Nuevos", slug: "nuevos", description: "Entradas recientes por atender" },
  { key: "Pendientes", slug: "pendientes", description: "Conversaciones esperando respuesta o dato" },
  { key: "Cotizados", slug: "cotizados", description: "Leads con propuesta enviada" },
  { key: "Seguimiento", slug: "seguimiento", description: "Contactos activos para cierre" },
  { key: "Cerrados", slug: "cerrados", description: "Ventas concretadas" },
  { key: "Perdidos", slug: "perdidos", description: "Oportunidades fuera del embudo" },
];

const state = {
  apiBase: DEFAULT_API_BASE,
  leads: [],
  draggedLeadId: null,
  selectedLeadId: null,
  syncMode: "loading",
};

const board = document.querySelector("#board");
const metricsContainer = document.querySelector("#metrics");
const form = document.querySelector("#lead-form");
const formTitle = document.querySelector("#form-title");
const submitButton = document.querySelector("#submit-button");
const resetButton = document.querySelector("#reset-form");
const openLeadFormButton = document.querySelector("#open-lead-form");
const statusDialog = document.querySelector("#status-dialog");
const statusDialogTitle = document.querySelector("#status-dialog-title");
const statusDialogOptions = document.querySelector("#status-dialog-options");
const syncStatus = document.querySelector("#sync-status");

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

startApp();

async function startApp() {
  bindEvents();
  resetForm();
  await loadInitialLeads();
  render();
}

function bindEvents() {
  form.addEventListener("submit", handleSubmit);
  resetButton.addEventListener("click", resetForm);
  openLeadFormButton.addEventListener("click", () => {
    resetForm();
    form.scrollIntoView({ behavior: "smooth", block: "start" });
    fields.name.focus();
  });
  statusDialogOptions?.addEventListener("click", handleStatusDialogClick);
  statusDialog?.addEventListener("close", () => {
    state.selectedLeadId = null;
  });
}

async function loadInitialLeads() {
  try {
    const remoteLeads = await apiRequest("/leads");
    state.leads = normalizeLeadList(remoteLeads);
    state.syncMode = "api";
  } catch (error) {
    console.warn("No se pudo cargar Supabase.", error);
    state.leads = [];
    state.syncMode = "error";
  }
}

// --- FUNCIÓN DE GUARDADO CORREGIDA ---
async function handleSubmit(event) {
  event.preventDefault();
  
  // Definimos fields correctamente desde el evento
  const formElements = event.target.elements; 
  
  const lead = {
    id: fields.id.value || createId(),
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
    // Nuevos campos para Tú Próximo Viaje MX
    category: document.getElementById('category').value,
    isActive: document.getElementById('is-active').checked,
    updatedAt: new Date().toISOString(),
    lastActivityAt: new Date().toISOString(),
    source: "manual"
  };

  if (!lead.name || !lead.phone || !lead.destination || !lead.entryDate) {
    alert("Por favor rellena los campos obligatorios (Nombre, Teléfono, Destino y Fecha).");
    return;
  }

  try {
    const savedLead = await apiRequest("/leads", {
      method: "POST",
      body: lead,
    });
    upsertInState(savedLead);
    state.syncMode = "api";
  } catch (error) {
    console.warn("Fallo el guardado en Supabase.", error);
    state.syncMode = "error";
    window.alert("No se pudo guardar el lead en Supabase.");
    return;
  }

  render();
  resetForm();
}

function render() {
  renderSyncStatus();
  renderMetrics();
  renderBoard();
}

function renderSyncStatus() {
  if (!syncStatus) return;
  syncStatus.className = "sync-pill";
  if (state.syncMode === "api") {
    syncStatus.classList.add("sync-pill--api");
    syncStatus.textContent = "Supabase activo";
  } else {
    syncStatus.classList.add("sync-pill--error");
    syncStatus.textContent = "Sin conexion con Supabase";
  }
}

function renderMetrics() {
  metricsContainer.innerHTML = "";
  const overdueCount = state.leads.filter((lead) => isFollowUpOverdue(lead.followUpDate)).length;
  const todayCount = state.leads.filter((lead) => isFollowUpToday(lead.followUpDate)).length;
  const closedCount = state.leads.filter((lead) => lead.status === "Cerrados").length;
  const activeCount = state.leads.filter((lead) => !["Cerrados", "Perdidos"].includes(lead.status)).length;

  const metrics = [
    { label: "Leads activos", value: activeCount, hint: "Oportunidades trabajando hoy" },
    { label: "Seguimientos hoy", value: todayCount, hint: "Prioridad comercial inmediata" },
    { label: "Atrasados", value: overdueCount, hint: "Requieren atencion para no enfriarse" },
    { label: "Cerrados", value: closedCount, hint: "Ventas concretadas en el tablero" },
  ];

  metrics.forEach(metric => {
    const template = document.querySelector("#metric-template").content.cloneNode(true);
    template.querySelector(".metric-card__label").textContent = metric.label;
    template.querySelector(".metric-card__value").textContent = metric.value;
    template.querySelector(".metric-card__hint").textContent = metric.hint;
    metricsContainer.appendChild(template);
  });
}

function renderBoard() {
  board.innerHTML = "";
  PIPELINE.forEach(stage => {
    const template = document.querySelector("#column-template").content.cloneNode(true);
    const column = template.querySelector(".kanban-column");
    const title = template.querySelector("h3");
    const meta = template.querySelector(".kanban-column__meta");
    const count = template.querySelector(".kanban-column__count");
    const dropzone = template.querySelector(".kanban-column__dropzone");
    
    const leads = state.leads
      .filter((lead) => lead.status === stage.key)
      .sort((a, b) => new Date(b.lastActivityAt || b.updatedAt || 0) - new Date(a.lastActivityAt || a.updatedAt || 0));

    column.classList.add(`status-${stage.slug}`);
    column.dataset.status = stage.key;
    title.textContent = stage.key;
    meta.textContent = stage.description;
    count.textContent = leads.length;

    bindColumnDnD(column, stage.key);

    if (!leads.length) {
      const emptyState = document.createElement("div");
      emptyState.className = "empty-state";
      emptyState.textContent = "Arrastra o agrega leads.";
      dropzone.appendChild(emptyState);
    } else {
      leads.forEach(lead => dropzone.appendChild(createLeadCard(lead)));
    }
    board.appendChild(template);
  });
}

function createLeadCard(lead) {
  const template = document.querySelector("#card-template").content.cloneNode(true);
  const card = template.querySelector(".lead-card");
  const badge = template.querySelector(".lead-card__badge");

  card.dataset.id = lead.id;
  template.querySelector(".lead-card__name").textContent = lead.name || "Contacto sin nombre";
  template.querySelector(".lead-card__phone").textContent = formatPhone(lead.phone);
  template.querySelector(".lead-card__destination").textContent = lead.destination || "Sin definir";
  template.querySelector(".lead-card__activity").textContent = formatDateTime(lead.lastActivityAt || lead.updatedAt);
  
  // Mostrar Categoría si no es Cliente
  if(lead.category && lead.category !== "Cliente") {
      template.querySelector(".lead-card__name").innerHTML += ` <small style="color:orange">(${lead.category})</small>`;
  }

  card.addEventListener("dragstart", () => {
    state.draggedLeadId = lead.id;
    card.classList.add("is-dragging");
  });

  card.addEventListener("dragend", () => {
    state.draggedLeadId = null;
    card.classList.remove("is-dragging");
  });

  card.querySelector('[data-action="whatsapp"]').addEventListener("click", () => {
    openWhatsApp(lead.phone, lead.name || "viajero");
  });

  card.querySelector('[data-action="edit"]').addEventListener("click", () => {
    populateForm(lead);
  });

  return card;
}

function bindColumnDnD(column, status) {
  column.addEventListener("dragover", (e) => { e.preventDefault(); column.classList.add("kanban-column--drag-over"); });
  column.addEventListener("dragleave", () => column.classList.remove("kanban-column--drag-over"));
  column.addEventListener("drop", async (e) => {
    e.preventDefault();
    column.classList.remove("kanban-column--drag-over");
    if (state.draggedLeadId) await updateLeadStatus(state.draggedLeadId, status);
  });
}

async function updateLeadStatus(id, nextStatus) {
  const lead = state.leads.find((item) => item.id === id);
  if (!lead) return;
  const updatedLead = { ...lead, status: nextStatus, updatedAt: new Date().toISOString() };
  try {
    const savedLead = await apiRequest("/leads", { method: "POST", body: updatedLead });
    upsertInState(savedLead);
  } catch (error) {
    console.warn("Fallo actualización de estatus.");
  }
  render();
}

function populateForm(lead) {
  formTitle.textContent = "Editar lead";
  submitButton.textContent = "Actualizar lead";
  fields.id.value = lead.id || "";
  fields.name.value = lead.name || "";
  fields.phone.value = cleanPhone(lead.phone || "");
  fields.destination.value = lead.destination || "";
  fields.entryDate.value = lead.entryDate || "";
  fields.lastMessage.value = lead.lastMessage || "";
  fields.advisor.value = lead.advisor || "";
  fields.nextAction.value = lead.nextAction || "";
  fields.followUpDate.value = lead.followUpDate || "";
  fields.notes.value = lead.notes || "";
  fields.status.value = lead.status || "Nuevos";
  
  // Cargar Categoría e IsActive
  document.getElementById('category').value = lead.category || "Cliente";
  document.getElementById('is-active').checked = lead.isActive !== false;
  
  form.scrollIntoView({ behavior: "smooth" });
}

function resetForm() {
  form.reset();
  formTitle.textContent = "Nuevo lead";
  submitButton.textContent = "Guardar lead";
  fields.id.value = "";
  fields.entryDate.value = new Date().toISOString().slice(0, 10);
  fields.status.value = "Nuevos";
  document.getElementById('category').value = "Cliente";
  document.getElementById('is-active').checked = true;
}

function openWhatsApp(phone, name) {
  const sanitizedPhone = cleanPhone(phone);
  window.open(`https://wa.me/52${sanitizedPhone}`, "_blank");
}

async function apiRequest(path, options = {}) {
  const requestOptions = {
    method: options.method || "GET",
    headers: { "Content-Type": "application/json" },
  };
  if (options.body) requestOptions.body = JSON.stringify(options.body);
  const response = await fetch(`${state.apiBase}${path}`, requestOptions);
  return response.ok ? response.json() : Promise.reject();
}

function upsertInState(lead) {
  const normalizedLead = normalizeLead(lead);
  const idx = state.leads.findIndex(i => i.id === normalizedLead.id);
  if (idx >= 0) state.leads[idx] = normalizedLead;
  else state.leads.unshift(normalizedLead);
}

function normalizeLeadList(leads) {
  const list = Array.isArray(leads?.leads) ? leads.leads : (Array.isArray(leads) ? leads : []);
  return list.map(normalizeLead);
}

function normalizeLead(lead) {
  return {
    id: lead.id || createId(),
    name: lead.name || "",
    phone: cleanPhone(lead.phone || ""),
    destination: lead.destination || "",
    entryDate: normalizeDateValue(lead.entryDate),
    lastMessage: lead.lastMessage || "",
    advisor: lead.advisor || "",
    nextAction: lead.nextAction || "",
    followUpDate: normalizeDateValue(lead.followUpDate),
    notes: lead.notes || "",
    status: lead.status || "Nuevos",
    category: lead.category || "Cliente",
    isActive: lead.isActive !== false,
    updatedAt: lead.updatedAt || new Date().toISOString(),
    lastActivityAt: lead.lastActivityAt || lead.updatedAt || new Date().toISOString(),
    source: lead.source || "manual",
  };
}

function normalizeDateValue(v) { return v ? (v.includes("T") ? v.split("T")[0] : v) : ""; }
function cleanPhone(p) { return String(p).replace(/\D+/g, "").slice(-10); }
function formatPhone(p) { const d = cleanPhone(p); return d.length === 10 ? `${d.slice(0,3)} ${d.slice(3,6)} ${d.slice(6)}` : d; }
function isFollowUpOverdue(d) { if(!d) return false; return startOfDay(new Date(`${d}T12:00:00`)) < startOfDay(new Date()); }
function isFollowUpToday(d) { if(!d) return false; return startOfDay(new Date(`${d}T12:00:00`)).getTime() === startOfDay(new Date()).getTime(); }
function startOfDay(d) { const n = new Date(d); n.setHours(0,0,0,0); return n; }
function createId() { return window.crypto?.randomUUID ? window.crypto.randomUUID() : `lead-${Date.now()}`; }
function formatDateTime(v) { if(!v) return ""; return new Intl.DateTimeFormat("es-MX", {day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit"}).format(new Date(v)); }
