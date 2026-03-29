require('dotenv').config();

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 8787);
const ROOT_DIR = __dirname;
const SUPABASE_URL = (process.env.TPVMX_SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = process.env.TPVMX_SUPABASE_SERVICE_ROLE_KEY || "";
const YCLOUD_API_BASE = (process.env.TPVMX_YCLOUD_API_BASE || "https://api.ycloud.com/v2").replace(/\/$/, "");
const YCLOUD_API_KEY = process.env.TPVMX_YCLOUD_API_KEY || "";
const YCLOUD_WEBHOOK_SECRET = process.env.TPVMX_YCLOUD_WEBHOOK_SECRET || "";
const YCLOUD_FROM = process.env.TPVMX_YCLOUD_FROM || "";
const PIPELINE = new Set(["Nuevos", "Pendientes", "Cotizados", "Seguimiento", "Cerrados", "Perdidos"]);

const STATIC_FILES = new Map([
  ["/", path.join(ROOT_DIR, "index.html")],
  ["/index.html", path.join(ROOT_DIR, "index.html")],
  ["/styles.css", path.join(ROOT_DIR, "styles.css")],
  ["/app.js", path.join(ROOT_DIR, "app.js")],
]);

const server = http.createServer(async (req, res) => {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

    if (url.pathname === "/api/health" && req.method === "GET") {
      sendJson(res, 200, {
        ok: true,
        supabaseConfigured: Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY),
        webhookPrepared: true,
        ycloudConfigured: Boolean(YCLOUD_API_KEY),
      });
      return;
    }

    if (url.pathname === "/api/leads" && req.method === "GET") {
      const leads = await listLeads();
      sendJson(res, 200, leads);
      return;
    }

    if (url.pathname === "/api/leads" && req.method === "POST") {
      const payload = await readJsonBody(req);
      const savedLead = await saveLeadFromClient(payload);
      sendJson(res, 200, savedLead);
      return;
    }

if ((url.pathname === "/webhook" || url.pathname === "/api/webhooks/ycloud") && req.method === "POST") {
  const rawBody = await readRawBody(req);

  console.log("=== RAW BODY YCLOUD ===");
  console.log(rawBody);

  let event = {};

  try {
    event = rawBody ? JSON.parse(rawBody) : {};
  } catch (err) {
    console.error("❌ Error parseando JSON:", err.message);
    sendJson(res, 200, { received: true, error: "invalid_json" });
    return;
  }

  console.log("=== EVENT PARSEADO ===");
  console.log(JSON.stringify(event, null, 2));

  if (YCLOUD_WEBHOOK_SECRET) {
    const signatureHeader = req.headers["ycloud-signature"];
    if (!verifyYCloudSignature(rawBody, signatureHeader, YCLOUD_WEBHOOK_SECRET)) {
      console.error("❌ Firma inválida");
      sendJson(res, 401, { error: "invalid_signature" });
      return;
    }
  }

  try {
    const result = await handleYCloudWebhook(event);
    console.log("✅ Resultado webhook:", JSON.stringify(result, null, 2));
    sendJson(res, 200, result);
    return;
  } catch (err) {
    console.error("❌ Error en handleYCloudWebhook:", err.message);
    console.error(err.stack);
    sendJson(res, 500, { error: "internal_error", detail: err.message });
    return;
  }
}

if (url.pathname === "/api/messages/send" && req.method === "POST") {
  const payload = await readJsonBody(req);
  const result = await sendYCloudMessage(payload);
  sendJson(res, 200, result);
  return;
}

    if (STATIC_FILES.has(url.pathname)) {
      sendFile(res, STATIC_FILES.get(url.pathname));
      return;
    }

    sendJson(res, 404, { error: "not_found" });
  } catch (error) {
    sendJson(res, 500, {
      error: "internal_error",
      detail: error.message,
    });
  }
});

server.listen(PORT, () => {
  console.log(`Motor de Ventas TPVMX listo en http://localhost:${PORT}`);
  console.log(`Webhook YCloud: http://localhost:${PORT}/webhook`);
});

async function listLeads() {
  const data = await supabaseRequest("GET", "/rest/v1/leads?select=*");
  const leads = Array.isArray(data) ? data : [];
  return leads.map(mapDbLeadToClient).sort(compareLeadsByActivity);
}

async function saveLeadFromClient(clientLead) {
  assertSupabaseConfigured();

  const phone = normalizePhone(clientLead.phone);
  if (!phone) {
    throw new Error("El telefono es obligatorio.");
  }

  const existingLead = clientLead.id
    ? await findLeadById(clientLead.id)
    : await findLeadByPhone(phone);

  const dbPayload = mapClientLeadToDb(clientLead);

  if (!existingLead) {
    const created = await insertLead({
      ...dbPayload,
      phone,
      source: dbPayload.source || "manual",
      entry_date: dbPayload.entry_date || todayDate(),
      last_activity_at: dbPayload.last_activity_at || new Date().toISOString(),
      status: normalizeStatus(dbPayload.status),
    });
    return mapDbLeadToClient(created);
  }

  const updated = await updateLeadById(existingLead.id, {
    ...dbPayload,
    phone,
    status: normalizeStatus(dbPayload.status || existingLead.status),
    last_activity_at: dbPayload.last_activity_at || existingLead.last_activity_at || new Date().toISOString(),
  });

  return mapDbLeadToClient(updated);
}

async function handleYCloudWebhook(event) {
  assertSupabaseConfigured();

  const eventType = event?.type || "";
  const message = event?.whatsappInboundMessage || event?.whatsappMessage || null;

  if (!message || !["whatsapp.inbound.message", "whatsapp.inbound_message.received"].includes(eventType)) {
    return {
      received: true,
      ignored: true,
      eventType,
    };
  }

  const phone = normalizePhone(
    message.from ||
    message?.customerProfile?.phone ||
    message?.customerProfile?.waId ||
    message?.sender?.phone ||
    ""
  );

  const text = extractYCloudMessageText(message);
  const name =
    message?.customerProfile?.name ||
    message?.sender?.name ||
    message?.fromName ||
    null;
  const activityAt =
    message.createTime ||
    message.sendTime ||
    message.updateTime ||
    event.createTime ||
    new Date().toISOString();

  if (!phone) {
    throw new Error("No se pudo extraer el telefono del webhook.");
  }

  const existingLead = await findLeadByPhone(phone);

  if (!existingLead) {
    const createdLead = await insertLead({
      name,
      phone,
      last_message: text,
      entry_date: isoToDate(activityAt),
      last_activity_at: activityAt,
      status: "Nuevos",
      source: "ycloud-webhook",
    });

    return {
      received: true,
      createdOrUpdated: true,
      lead: mapDbLeadToClient(createdLead),
    };
  }

  const updatedLead = await updateLeadById(existingLead.id, {
    name: existingLead.name || name,
    last_message: text,
    last_activity_at: activityAt,
    source: existingLead.source || "ycloud-webhook",
  });

  return {
    received: true,
    createdOrUpdated: true,
    lead: mapDbLeadToClient(updatedLead),
  };
}

async function sendYCloudMessage(payload) {
  if (!YCLOUD_API_KEY) {
    throw new Error("Falta TPVMX_YCLOUD_API_KEY.");
  }

  const to = formatE164Phone(payload.to || payload.phone || "");
  const from = payload.from || YCLOUD_FROM;
  const text = String(payload.text || "").trim();

  if (!to || !from || !text) {
    throw new Error("El envio requiere to, text y un from configurado.");
  }

  const body = {
    from,
    to,
    type: "text",
    text: {
      body: text,
    },
  };

  const response = await requestJson({
    method: "POST",
    url: `${YCLOUD_API_BASE}/whatsapp/messages/sendDirectly`,
    headers: {
      "X-API-Key": YCLOUD_API_KEY,
      "Content-Type": "application/json",
    },
    body,
  });

  return {
    ok: true,
    request: body,
    ycloud: response,
  };
}

async function findLeadByPhone(phone) {
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) {
    return null;
  }

  const data = await supabaseRequest(
    "GET",
    `/rest/v1/leads?select=*&phone=eq.${encodeURIComponent(normalizedPhone)}&limit=1`
  );

  return Array.isArray(data) && data.length ? data[0] : null;
}

async function findLeadById(id) {
  if (!id) {
    return null;
  }

  const data = await supabaseRequest(
    "GET",
    `/rest/v1/leads?select=*&id=eq.${encodeURIComponent(id)}&limit=1`
  );

  return Array.isArray(data) && data.length ? data[0] : null;
}

async function insertLead(payload) {
  const data = await supabaseRequest("POST", "/rest/v1/leads", payload, {
    Prefer: "return=representation",
  });
  return Array.isArray(data) ? data[0] : data;
}

async function updateLeadById(id, payload) {
  const data = await supabaseRequest(
    "PATCH",
    `/rest/v1/leads?id=eq.${encodeURIComponent(id)}`,
    payload,
    {
      Prefer: "return=representation",
    }
  );

  return Array.isArray(data) ? data[0] : data;
}

async function supabaseRequest(method, resourcePath, body, extraHeaders = {}) {
  assertSupabaseConfigured();

  return requestJson({
    method,
    url: `${SUPABASE_URL}${resourcePath}`,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...extraHeaders,
    },
    body,
  });
}

function assertSupabaseConfigured() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Faltan TPVMX_SUPABASE_URL o TPVMX_SUPABASE_SERVICE_ROLE_KEY.");
  }
}

function requestJson({ method, url, headers = {}, body }) {
  const target = new URL(url);
  const transport = target.protocol === "https:" ? https : http;

  return new Promise((resolve, reject) => {
    const request = transport.request(
      {
        method,
        hostname: target.hostname,
        port: target.port || (target.protocol === "https:" ? 443 : 80),
        path: `${target.pathname}${target.search}`,
        headers,
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          const isJson = (response.headers["content-type"] || "").includes("application/json");
          const parsed = text && isJson ? JSON.parse(text) : text;

          if (response.statusCode < 200 || response.statusCode >= 300) {
            const detail =
              typeof parsed === "string"
                ? parsed
                : parsed?.message || parsed?.error_description || parsed?.error || text;
            reject(new Error(detail || `HTTP ${response.statusCode}`));
            return;
          }

          resolve(parsed);
        });
      }
    );

    request.on("error", reject);

    if (body !== undefined) {
      request.write(JSON.stringify(body));
    }

    request.end();
  });
}

function mapDbLeadToClient(lead) {
  return {
    id: lead.id,
    name: lead.name || "",
    phone: normalizePhone(lead.phone || ""),
    destination: lead.destination || "",
    entryDate: lead.entry_date || "",
    lastMessage: lead.last_message || "",
    advisor: lead.advisor || "",
    nextAction: lead.next_action || "",
    followUpDate: lead.follow_up_date || "",
    notes: lead.notes || "",
    status: normalizeStatus(lead.status),
    updatedAt: lead.updated_at || lead.last_activity_at || new Date().toISOString(),
    lastActivityAt: lead.last_activity_at || lead.updated_at || new Date().toISOString(),
    source: lead.source || "manual",
  };
}

function mapClientLeadToDb(lead) {
  return {
    id: lead.id || undefined,
    name: lead.name || null,
    phone: normalizePhone(lead.phone || ""),
    destination: lead.destination || null,
    entry_date: lead.entryDate || todayDate(),
    last_message: lead.lastMessage || null,
    advisor: lead.advisor || null,
    next_action: lead.nextAction || null,
    follow_up_date: lead.followUpDate || null,
    notes: lead.notes || null,
    status: normalizeStatus(lead.status),
    last_activity_at: lead.lastActivityAt || lead.updatedAt || new Date().toISOString(),
    source: lead.source || "manual",
  };
}

function normalizeStatus(status) {
  return PIPELINE.has(status) ? status : "Nuevos";
}

function normalizePhone(phone) {
  const digits = String(phone || "").replace(/\D+/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function formatE164Phone(phone) {
  const digits = String(phone || "").replace(/\D+/g, "");

  if (!digits) {
    return "";
  }

  if (digits.length === 10) {
    return `+52${digits}`;
  }

  if (digits.startsWith("52")) {
    return `+${digits}`;
  }

  return `+${digits}`;
}

function isoToDate(value) {
  if (!value) {
    return todayDate();
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? todayDate() : date.toISOString().slice(0, 10);
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function compareLeadsByActivity(a, b) {
  return new Date(b.lastActivityAt || b.updatedAt || 0) - new Date(a.lastActivityAt || a.updatedAt || 0);
}

function extractYCloudMessageText(message) {
  const type = message?.type || "text";

  if (type === "text") {
    return message?.text?.body || "[Mensaje sin texto]";
  }

  if (type === "button") {
    return message?.button?.text || "[Boton presionado]";
  }

  if (type === "interactive") {
    return (
      message?.interactive?.buttonReply?.title ||
      message?.interactive?.listReply?.title ||
      "[Respuesta interactiva]"
    );
  }

  if (type === "image") {
    return message?.image?.caption ? `[Imagen] ${message.image.caption}` : "[Imagen]";
  }

  if (type === "video") {
    return message?.video?.caption ? `[Video] ${message.video.caption}` : "[Video]";
  }

  if (type === "document") {
    return message?.document?.caption ? `[Documento] ${message.document.caption}` : "[Documento]";
  }

  if (type === "location") {
    return message?.location?.address || "[Ubicacion enviada]";
  }

  if (type === "audio") {
    return "[Audio]";
  }

  return `[Mensaje ${type}]`;
}

function verifyYCloudSignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) {
    return false;
  }

  const parts = Object.fromEntries(
    String(signatureHeader)
      .split(",")
      .map((item) => item.split("="))
      .filter((pair) => pair.length === 2)
      .map(([key, value]) => [key.trim(), value.trim()])
  );

  if (!parts.t || !parts.s) {
    return false;
  }

  const signedPayload = `${parts.t}.${rawBody}`;
  const expected = crypto.createHmac("sha256", secret).update(signedPayload).digest("hex");
  const receivedBuffer = Buffer.from(parts.s, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");

  if (receivedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(receivedBuffer, expectedBuffer);
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function readJsonBody(req) {
  const raw = await readRawBody(req);
  return raw ? JSON.parse(raw) : {};
}

function sendJson(res, statusCode, payload) {
  const json = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(json),
  });
  res.end(json);
}

function sendFile(res, filePath) {
  const contentType = getMimeType(filePath);
  const stream = fs.createReadStream(filePath);

  stream.on("open", () => {
    res.writeHead(200, {
      "Content-Type": contentType,
    });
  });

  stream.on("error", () => {
    sendJson(res, 404, { error: "file_not_found" });
  });

  stream.pipe(res);
}

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,YCloud-Signature");
  res.setHeader("Cache-Control", "no-store");
}

function getMimeType(filePath) {
  const extension = path.extname(filePath).toLowerCase();

  switch (extension) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "application/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}
