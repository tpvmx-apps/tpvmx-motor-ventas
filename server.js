import { createClient } from '@supabase/supabase-js';

// 1. CONFIGURACIÓN DEL SERVIDOR Y SUPABASE
// Asegúrate de tener estas variables en el panel de Render
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Configuración de CORS
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

      // RUTA: GUARDAR O ACTUALIZAR LEAD
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
      console.error('Error en server.js:', error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  },
};

// --- FUNCIONES DE TRADUCCIÓN (MAPEO) ---

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
    source: lead.source || "manual",
    lastActivityAt: lead.last_activity_at || lead.updated_at,
    // Aquí es donde el CRM lee la categoría
    category: lead.category || "Cliente",
    is_active: lead.is_active !== false
  };
}

function mapClientLeadToDb(lead) {
  return {
    // Si el ID es manual lo quitamos para que Supabase lo maneje, a menos que sea actualización
    ...(lead.id && !String(lead.id).startsWith('lead-') ? { id: lead.id } : {}),
    name: lead.name || null,
    phone: normalizePhone(lead.phone),
    status: lead.status || "Nuevos",
    destination: lead.destination || "",
    entry_date: lead.entryDate || new Date().toISOString(),
    last_message: lead.lastMessage || "",
    advisor: lead.advisor || "",
    next_action: lead.nextAction || "",
    follow_up_date: lead.followUpDate || null,
    notes: lead.notes || "",
    source: lead.source || "manual",
    last_activity_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    // Aquí es donde se guarda en la base de datos
    category: lead.category || "Cliente",
    is_active: lead.is_active !== undefined ? lead.is_active : true
  };
}

function normalizePhone(phone) {
  const digits = String(phone).replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}
