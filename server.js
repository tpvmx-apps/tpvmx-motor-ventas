const { createClient } = require('@supabase/supabase-js');

// 1. CONFIGURACIÓN DE SUPABASE
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// 2. FUNCIÓN PRINCIPAL (Versión compatible)
async function handleRequest(request) {
  const url = new URL(request.url);
  const path = url.pathname;

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // RUTA: OBTENER LEADS
    if (path === '/api/leads' && request.method === 'GET') {
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .order('last_activity_at', { ascending: false });

      if (error) throw error;

      const leads = data.map(mapDbLeadToClient);
      return new Response(JSON.stringify(leads), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // RUTA: GUARDAR O ACTUALIZAR
    if (path === '/api/leads' && request.method === 'POST') {
      const leadData = await request.json();
      const dbLead = mapClientLeadToDb(leadData);

      const { data, error } = await supabase
        .from('leads')
        .upsert(dbLead, { onConflict: 'phone' })
        .select()
        .single();

      if (error) throw error;

      return new Response(JSON.stringify(mapDbLeadToClient(data)), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response('Ruta no encontrada', { status: 404 });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

// 3. FUNCIONES DE APOYO
function mapDbLeadToClient(lead) {
  return {
    id: lead.id,
    name: lead.name || "",
    phone: lead.phone || "",
    status: lead.status || "Nuevos",
    destination: lead.destination || "",
    entryDate: lead.entry_date || "",
    lastMessage: lead.last_message || "",
    advisor: lead.advisor || "",
    nextAction: lead.next_action || "",
    followUpDate: lead.follow_up_date || "",
    notes: lead.notes || "",
    category: lead.category || "Cliente",
    is_active: lead.is_active !== false,
    lastActivityAt: lead.last_activity_at || lead.updated_at
  };
}

function mapClientLeadToDb(lead) {
  const dbData = {
    name: lead.name || null,
    phone: String(lead.phone || "").replace(/\D/g, "").slice(-10),
    status: lead.status || "Nuevos",
    destination: lead.destination || "",
    entry_date: lead.entryDate || new Date().toISOString(),
    last_message: lead.lastMessage || "",
    advisor: lead.advisor || "",
    next_action: lead.nextAction || "",
    follow_up_date: lead.followUpDate || null,
    notes: lead.notes || "",
    category: lead.category || "Cliente",
    is_active: lead.is_active !== undefined ? lead.is_active : true,
    last_activity_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  
  if (lead.id && !String(lead.id).startsWith('lead-')) {
    dbData.id = lead.id;
  }
  return dbData;
}

// Exportación para Render/Cloudflare/Node
module.exports = {
  fetch: handleRequest
};
