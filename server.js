// 1. CONFIGURACIÓN (Sin 'require' de supabase, usando solo fetch nativo)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

async function handleRequest(request) {
  const url = new URL(request.url);
  const path = url.pathname;

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, apikey, Authorization',
  };

  if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    // RUTA: OBTENER LEADS (GET)
    if (path === '/api/leads' && request.method === 'GET') {
      const response = await fetch(`${supabaseUrl}/rest/v1/leads?select=*&order=last_activity_at.desc`, {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();
      const leads = data.map(mapDbLeadToClient);
      return new Response(JSON.stringify(leads), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // RUTA: GUARDAR O ACTUALIZAR (POST)
    if (path === '/api/leads' && request.method === 'POST') {
      const leadData = await request.json();
      const dbLead = mapClientLeadToDb(leadData);

      const response = await fetch(`${supabaseUrl}/rest/v1/leads`, {
        method: 'POST',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation,resolution=merge-duplicates' // Esto hace el UPSERT
        },
        body: JSON.stringify(dbLead)
      });

      const savedData = await response.json();
      // Si es un array (POST suele devolver array), tomamos el primero
      const result = Array.isArray(savedData) ? savedData[0] : savedData;
      
      return new Response(JSON.stringify(mapDbLeadToClient(result)), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    return new Response('No encontrado', { status: 404 });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 500, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
}

// 2. TRADUCTORES (Para que los mensajes y categorías funcionen)
function mapDbLeadToClient(l) {
  return {
    id: l.id,
    name: l.name || "",
    phone: l.phone || "",
    status: l.status || "Nuevos",
    destination: l.destination || "",
    entryDate: l.entry_date || "",
    lastMessage: l.last_message || "", 
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
  const dbData = {
    name: l.name || null,
    phone: String(l.phone || "").replace(/\D/g, "").slice(-10),
    status: l.status || "Nuevos",
    destination: l.destination || "",
    entry_date: l.entryDate || new Date().toISOString(),
    last_message: l.lastMessage || "",
    advisor: l.advisor || "",
    next_action: l.nextAction || "",
    follow_up_date: l.followUpDate || null,
    notes: l.notes || "",
    category: l.category || "Cliente",
    is_active: l.is_active !== undefined ? l.is_active : true,
    last_activity_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  // Si no es un lead nuevo de AppSheet (que empiezan con 'lead-'), mandamos el ID para actualizar
  if (l.id && !String(l.id).startsWith('lead-')) {
    dbData.id = l.id;
  }
  return dbData;
}

// 3. EXPORTACIÓN PARA RENDER
module.exports = { fetch: handleRequest };
