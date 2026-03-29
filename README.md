# Motor de Ventas TPVMX

Motor de ventas visual con tablero kanban, backend simple en Node.js y almacenamiento real en Supabase.

## Esta version hace

- Carga los leads desde Supabase al abrir el tablero.
- Guarda nuevos leads en Supabase.
- Actualiza estatus, notas y demas campos en Supabase.
- Mantiene el diseno actual de `index.html`, `styles.css` y `app.js`.
- Deja preparada la estructura para un webhook futuro de YCloud.

## Archivos importantes

- `server.js`: API HTTP y puente con Supabase.
- `supabase/schema.sql`: tabla `leads`.
- `.env.example`: variables de entorno.
- `package.json`: script `npm start`.

## Variables de entorno

```bash
PORT=8787
TPVMX_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
TPVMX_SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY
```

Opcionales para la siguiente fase con YCloud:

```bash
TPVMX_YCLOUD_API_KEY=YOUR_YCLOUD_API_KEY
TPVMX_YCLOUD_WEBHOOK_SECRET=YOUR_YCLOUD_WEBHOOK_SECRET
TPVMX_YCLOUD_FROM=YOUR_YCLOUD_WHATSAPP_SENDER
```

## Configurar Supabase

1. Crea un proyecto en Supabase.
2. Ejecuta `supabase/schema.sql` en el SQL Editor.
3. Configura `TPVMX_SUPABASE_URL` y `TPVMX_SUPABASE_SERVICE_ROLE_KEY`.

## Arrancar

```bash
npm start
```

Abre:

- `http://localhost:8787/`

## Endpoints actuales

- `GET /api/health`
- `GET /api/leads`
- `POST /api/leads`

## Estructura preparada para YCloud

Ya estan reservadas estas rutas para la siguiente fase:

- `POST /webhook`
- `POST /api/webhooks/ycloud`
- `POST /api/messages/send`
