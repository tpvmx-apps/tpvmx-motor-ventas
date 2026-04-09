const DEFAULT_API_BASE =
  window.location.protocol === "file:"
    ? "http://localhost:8787/api"
    : `${window.location.origin}/api`;

const PIPELINE = [
  {
    key: "Nuevos",
    slug: "nuevos",
    description: "Entradas recientes por atender",
  },
  {
    key: "Pendientes",
    slug: "pendientes",
    description: "Conversaciones esperando respuesta o dato",
  },
  {
    key: "Cotizados",
    slug: "cotizados",
    description: "Leads con propuesta enviada",
  },
  {
    key: "Seguimiento",
    slug: "seguimiento",
    description: "Contactos activos para cierre",
  },
  {
    key: "Cerrados",
    slug: "cerrados",
    description: "Ventas concretadas",
  },
  {
    key: "Perdidos",
    slug: "perdidos",
    description: "Oportunidades fuera del embudo",
  },
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
  statusDialogOptions.addEventListener("click", handleStatusDialogClick);
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

async function handleSubmit(event) {
  event.preventDefault();
  const fields = event.target.elements; 
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
    status: fields.status.value,const lead = {
  id: fields.id.value || createId(),
  name: fields.name.value.trim(),
  category: document.getElementById('category').value,
  isActive: document.getElementById('is-active').checked,
    updatedAt: new Date().toISOString(),
  lastActivityAt: new Date().toISOString(),
  source: "manual",
};

  if (!lead.name || !lead.phone || !lead.destination || !lead.entryDate) {
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
  syncStatus.className = "sync-pill";

  if (state.syncMode === "api") {
    syncStatus.classList.add("sync-pill--api");
    syncStatus.textContent = "Supabase activo";
    return;
  }

  syncStatus.classList.add("sync-pill--error");
  syncStatus.textContent = "Sin conexion con Supabase";
}

function renderMetrics() {
  metricsContainer.innerHTML = "";

  const overdueCount = state.leads.filter((lead) => isFollowUpOverdue(lead.followUpDate)).length;
  const todayCount = state.leads.filter((lead) => isFollowUpToday(lead.followUpDate)).length;
  const closedCount = state.leads.filter((lead) => lead.status === "Cerrados").length;
  const activeCount = state.leads.filter((lead) => !["Cerrados", "Perdidos"].includes(lead.status)).length;

  const metrics = [
    {
      label: "Leads activos",
      value: activeCount,
      hint: "Oportunidades trabajando hoy",
    },
    {
      label: "Seguimientos hoy",
      value: todayCount,
      hint: "Prioridad comercial inmediata",
    },
    {
      label: "Atrasados",
      value: overdueCount,
      hint: "Requieren atencion para no enfriarse",
    },
    {
      label: "Cerrados",
      value: closedCount,
      hint: "Ventas concretadas en el tablero",
    },
  ];

  for (const metric of metrics) {
    const template = document.querySelector("#metric-template").content.cloneNode(true);
    template.querySelector(".metric-card__label").textContent = metric.label;
    template.querySelector(".metric-card__value").textContent = metric.value;
    template.querySelector(".metric-card__hint").textContent = metric.hint;
    metricsContainer.appendChild(template);
  }
}

function renderBoard() {
  board.innerHTML = "";

  for (const stage of PIPELINE) {
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
      emptyState.textContent = "Arrastra o agrega leads para alimentar esta etapa.";
      dropzone.appendChild(emptyState);
    } else {
      for (const lead of leads) {
        dropzone.appendChild(createLeadCard(lead));
      }
    }

    board.appendChild(template);
  }
}

function createLeadCard(lead) {
  const template = document.querySelector("#card-template").content.cloneNode(true);
  const card = template.querySelector(".lead-card");
  const badge = template.querySelector(".lead-card__badge");

  card.dataset.id = lead.id;
  template.querySelector(".lead-card__name").textContent = lead.name || "Contacto sin nombre";
  template.querySelector(".lead-card__phone").textContent = formatPhone(lead.phone);
  template.querySelector(".lead-card__destination").textContent = lead.destination || "Sin definir";
  template.querySelector(".lead-card__entry").textContent = formatDate(lead.entryDate);
  template.querySelector(".lead-card__activity").textContent = formatDateTime(lead.lastActivityAt || lead.updatedAt);
  template.querySelector(".lead-card__message").textContent = lead.lastMessage || "Sin resumen";
  template.querySelector(".lead-card__advisor").textContent = lead.advisor || "Sin asignar";
  template.querySelector(".lead-card__next").textContent = lead.nextAction || "Pendiente de definir";
  template.querySelector(".lead-card__followup").textContent = lead.followUpDate ? formatDate(lead.followUpDate) : "Sin fecha";
  template.querySelector(".lead-card__notes").textContent = lead.notes || "Sin notas";

  if (isFollowUpOverdue(lead.followUpDate)) {
    card.classList.add("is-overdue");
    badge.textContent = "Atrasado";
  } else if (isFollowUpToday(lead.followUpDate)) {
    card.classList.add("is-today");
    badge.textContent = "Hoy";
  } else if (lead.source === "ycloud-webhook") {
    badge.textContent = "WhatsApp";
  } else {
    badge.textContent = lead.status;
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

  card.querySelector('[data-action="move"]').addEventListener("click", () => {
    openStatusDialog(lead);
  });

  card.querySelector('[data-action="edit"]').addEventListener("click", () => {
    populateForm(lead);
  });

  return card;
}

function bindColumnDnD(column, status) {
  column.addEventListener("dragover", (event) => {
    event.preventDefault();
    column.classList.add("kanban-column--drag-over");
  });

  column.addEventListener("dragleave", () => {
    column.classList.remove("kanban-column--drag-over");
  });

  column.addEventListener("drop", async (event) => {
    event.preventDefault();
    column.classList.remove("kanban-column--drag-over");

    if (!state.draggedLeadId) {
      return;
    }

    await updateLeadStatus(state.draggedLeadId, status);
  });
}

async function updateLeadStatus(id, nextStatus) {
  const lead = state.leads.find((item) => item.id === id);

  if (!lead) {
    return;
  }

  const updatedLead = {
    ...lead,
    status: nextStatus,
    updatedAt: new Date().toISOString(),
  };

  try {
    const savedLead = await apiRequest("/leads", {
      method: "POST",
      body: updatedLead,
    });
    upsertInState(savedLead);
    state.syncMode = "api";
  } catch (error) {
    console.warn("No se pudo actualizar en Supabase.", error);
    state.syncMode = "error";
    window.alert("No se pudo actualizar el lead en Supabase.");
    return;
  }

  render();
}

function openStatusDialog(lead) {
  state.selectedLeadId = lead.id;

  if (!statusDialog || typeof statusDialog.showModal !== "function") {
    updateLeadStatus(lead.id, getSuggestedStatus(lead.status));
    return;
  }

  statusDialogTitle.textContent = `Mover a ${lead.name || "este lead"}`;
  statusDialogOptions.innerHTML = "";

  for (const stage of PIPELINE) {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "status-option";
    option.dataset.status = stage.key;

    if (stage.key === lead.status) {
      option.disabled = true;
    }

    option.innerHTML = `<strong>${stage.key}</strong><span>${stage.description}</span>`;
    statusDialogOptions.appendChild(option);
  }

  statusDialog.showModal();
}

function handleStatusDialogClick(event) {
  const button = event.target.closest(".status-option");

  if (!button || !state.selectedLeadId) {
    return;
  }

  updateLeadStatus(state.selectedLeadId, button.dataset.status);
  state.selectedLeadId = null;
  statusDialog.close();
}

function populateForm(lead) {
  formTitle.textContent = "Editar lead";
  submitButton.textContent = "Actualizar lead";
  fields.id.value = lead.id || "";
  fields.name.value = lead.name || "";
  fields.phone.value = cleanPhone(lead.phone || "");
  fields.destination.value = lead.destination || "";
  fields.entryDate.value = lead.entryDate || new Date().toISOString().slice(0, 10);
  fields.lastMessage.value = lead.lastMessage || "";
  fields.advisor.value = lead.advisor || "";
  fields.nextAction.value = lead.nextAction || "";
  fields.followUpDate.value = lead.followUpDate || "";
  fields.notes.value = lead.notes || "";
  fields.status.value = lead.status || "Nuevos";
  fields.name.focus();
}

function resetForm() {
  form.reset();
  formTitle.textContent = "Nuevo lead";
  submitButton.textContent = "Guardar lead";
  fields.id.value = "";
  fields.entryDate.value = new Date().toISOString().slice(0, 10);
  fields.status.value = "Nuevos";
}

function openWhatsApp(phone, name) {
  const message = encodeURIComponent(`Hola ${name}, te contacto de Tu Proximo Viaje MX para dar seguimiento a tu solicitud.`);
  const sanitizedPhone = cleanPhone(phone);
  const url = `https://wa.me/52${sanitizedPhone}?text=${message}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

async function apiRequest(path, options = {}) {
  const requestOptions = {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  };

  if (options.body !== undefined) {
    requestOptions.body = JSON.stringify(options.body);
  }

  const response = await fetch(`${state.apiBase}${path}`, requestOptions);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `HTTP ${response.status}`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

function upsertInState(lead) {
  const normalizedLead = normalizeLead(lead);
  const existingIndex = state.leads.findIndex((item) => item.id === normalizedLead.id);

  if (existingIndex >= 0) {
    state.leads[existingIndex] = normalizedLead;
  } else {
    state.leads.unshift(normalizedLead);
  }
}

function normalizeLeadList(leads) {
  if (leads && Array.isArray(leads.leads)) {
    return leads.leads.map(normalizeLead);
  }

  if (!Array.isArray(leads)) {
    return [];
  }

  return leads.map(normalizeLead);
}

function normalizeLead(lead) {
  const normalized = {
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
    status: PIPELINE.some((stage) => stage.key === lead.status) ? lead.status : "Nuevos",
    updatedAt: lead.updatedAt || new Date().toISOString(),
    lastActivityAt: lead.lastActivityAt || lead.updatedAt || new Date().toISOString(),
    source: lead.source || "manual",
  };

  if (!normalized.entryDate) {
    normalized.entryDate = normalized.lastActivityAt.slice(0, 10);
  }

  return normalized;
}

function getSuggestedStatus(currentStatus) {
  const currentIndex = PIPELINE.findIndex((stage) => stage.key === currentStatus);
  const nextIndex = currentIndex >= 0 && currentIndex < PIPELINE.length - 1 ? currentIndex + 1 : currentIndex;
  return PIPELINE[nextIndex].key;
}

function normalizeDateValue(value) {
  if (!value) {
    return "";
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return parsed.toISOString().slice(0, 10);
}

function formatDate(value) {
  if (!value) {
    return "Sin fecha";
  }

  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "Sin fecha";
  }

  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(parsed);
}

function formatDateTime(value) {
  if (!value) {
    return "Sin registro";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "Sin registro";
  }

  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

function cleanPhone(phone) {
  const digits = String(phone).replace(/\D+/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function formatPhone(phone) {
  const digits = cleanPhone(phone);

  if (digits.length !== 10) {
    return digits || "Sin telefono";
  }

  return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
}

function isFollowUpOverdue(dateValue) {
  if (!dateValue) {
    return false;
  }

  const today = startOfDay(new Date());
  const compareDate = startOfDay(new Date(`${dateValue}T12:00:00`));
  return compareDate < today;
}

function isFollowUpToday(dateValue) {
  if (!dateValue) {
    return false;
  }

  const today = startOfDay(new Date());
  const compareDate = startOfDay(new Date(`${dateValue}T12:00:00`));
  return compareDate.getTime() === today.getTime();
}

function startOfDay(date) {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
}

function createId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }

  return `lead-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
