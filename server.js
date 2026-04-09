const { createClient } = require('@supabase/supabase-js');

// 1. CONEXIÓN
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// 2. PROCESAMIENTO
async function handleRequest(request) {
  const url = new URL(request.url);
  const path = url.pathname;
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    // LEER LEADS (Aquí recuperamos los mensajes)
    if (path === '/api/leads' && request.method === 'GET') {
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .order('last_activity_at', { ascending: false });

      if (error) throw error;
      const leads = data.map(mapDbLeadToClient);
      return new Response(JSON.stringify(leads), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // GUARDAR LEADS
    if (path === '/api/leads' && request.method === 'POST') {
      const leadData = await request.json();
      const dbLead = mapClientLeadToDb(leadData);
      const { data, error } = await supabase.from('leads').upsert(dbLead, { onConflict: 'phone' }).select().single();
      if (error) throw error;
      return new Response(JSON.stringify(mapDbLeadToClient(data)), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response('No encontrado', { status: 404 });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
}

// 3. TRADUCTORES (Aquí está el arreglo de los mensajes)
function mapDbLeadToClient(l) {
  return {
    id: l.id,
    name: l.name || "",
    phone: l.phone || "",
    status: l.status || "Nuevos",
    destination: l.destination || "",
    entryDate: l.entry_date || "",
    lastMessage: l.last_message || "", // <-- Aseguramos que lea el mensaje de la BD
    advisor: l.advisor || "",
    nextAction: l.next_action || "",
    followUpDate: l.follow_up_date || "",
    notes: l.notes || "",
    category: l.category || "Cliente",
    is_active: l.is_active !== false,
    lastActivityAt: l.last_activity_at || l.updated_at
  };
}

function mapClientLeadToDb(l) {
  return {
    name: l.name || null,
    phone: String(l.phone || "").replace(/\D/g, "").slice(-10),
    status: l.status || "Nuevos",
    destination: l.destination || "",
    entry_date: l.entryDate || new Date().toISOString(),
    last_message: l.lastMessage || "", // <-- Guardamos el mensaje correctamente
    advisor: l.advisor || "",
    next_action: l.nextAction || "",
    follow_up_date: l.followUpDate || null,
    notes: l.notes || "",
    category: l.category || "Cliente",
    is_active: l.is_active !== undefined ? l.is_active : true,
    last_activity_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
}

module.exports = { fetch: handleRequest };
