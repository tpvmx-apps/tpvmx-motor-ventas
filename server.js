import { createClient } from '@supabase/supabase-js';

// 1. CONFIGURACIÓN DE SUPABASE
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Configuración de CORS para que el CRM pueda hablar con el servidor
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

        // Convertimos los datos de la base de datos al formato que entiende el CRM
        const leads = data.map(mapDbLeadToClient);
        return new Response(JSON.stringify(leads), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // RUTA: GUARDAR O ACTUALIZAR LEAD
      if (path === '/api/leads' && request.method === 'POST') {
        const leadData = await request.json();
        
        // Convertimos del formato CRM al formato de Base de Datos (Supabase)
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

      return new Response('Not Found', { status: 404 });
    } catch (error) {
      console.error('Error en el servidor:', error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  },
};

// --- FUNCIONES DE TRADUCCIÓN (EL PUENTE) ---

/**
 * Pasa los datos de la Base de Datos al Navegador (CRM)
 */
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
    // --- ESTO ASEGURA QUE EL CRM VEA SI ES ALIADO ---
    category: lead.category || "Cliente",
    is_active: lead.is_active !== false
  };
}
/**
 * Pasa los datos del Navegador (CRM) a la Base de Datos (Supabase)
 */
function mapClientLeadToDb(lead) {
  return {
    // Si viene un ID lo usamos, si no Supabase crea uno
    ...(lead.id && !lead.id.startsWith('lead-') ? { id: lead.id } : {}),
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
    // --- ESTO GUARDA POR FIN LA CATEGORÍA Y EL BOT ---
    category: lead.category || "Cliente",
    is_active: lead.is_active !== undefined ? lead.is_active : true
  };
}

/**
 * Limpia el teléfono para que siempre tenga 10 dígitos
 */
function normalizePhone(phone) {
  const digits = String(phone).replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}
