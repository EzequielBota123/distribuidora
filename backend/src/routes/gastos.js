import { Router } from 'express';
import { supabase } from '../supabase.js';
import { requireAdmin } from '../auth.js';

const router = Router();

const BUCKET = 'comprobantes-gastos';

async function tipoCambioActual() {
  const { data } = await supabase.from('tipo_cambio').select('valor').eq('id', 1).single();
  return Number(data?.valor) || 0;
}

async function subirComprobante(base64, nombreArchivo) {
  const match = /^data:(.+);base64,(.+)$/.exec(base64 || '');
  if (!match) return null;
  const [, contentType, data] = match;
  const buffer = Buffer.from(data, 'base64');
  const ext = (nombreArchivo && nombreArchivo.split('.').pop()) || 'jpg';
  const path = `${Date.now()}-${Math.round(Math.random() * 1e6)}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, buffer, { contentType });
  if (error) throw new Error('No se pudo subir el comprobante: ' + error.message);
  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return pub.publicUrl;
}

// Busca un proveedor por nombre (sin importar mayúsculas/espacios) y si no
// existe lo crea al vuelo — así se puede simplemente tipear el proveedor
// al cargar un gasto, sin tener que darlo de alta antes en otro lado.
async function resolverProveedor(nombre) {
  const nombreTrim = (nombre || '').trim();
  if (!nombreTrim) return null;
  const { data: existente } = await supabase
    .from('proveedores')
    .select('id')
    .ilike('nombre', nombreTrim)
    .limit(1)
    .maybeSingle();
  if (existente) return existente.id;
  const { data: nuevo, error } = await supabase.from('proveedores').insert({ nombre: nombreTrim }).select('id').single();
  if (error) throw new Error('No se pudo crear el proveedor: ' + error.message);
  return nuevo.id;
}

// Calcula el monto final en pesos: si viene un monto en USD, manda ese
// (convertido con la cotización actual); si no, usa el monto en pesos tal
// cual — mismo patrón que costo/costoUsd en productos.
async function calcularMontos(monto, montoUsd) {
  const usaUsd = montoUsd !== undefined && montoUsd !== null && montoUsd !== '';
  if (usaUsd) {
    const tc = await tipoCambioActual();
    return { monto: Number(montoUsd) * tc, montoUsd: Number(montoUsd) };
  }
  return { monto: Number(monto) || 0, montoUsd: null };
}

router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('gastos')
    .select('*, usuarios(nombre), proveedores(id, nombre)')
    .order('fecha', { ascending: false })
    .order('id', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(
    data.map(({ usuarios, proveedores, ...g }) => ({
      ...g,
      cargadoPorNombre: usuarios?.nombre || null,
      proveedorNombre: proveedores?.nombre || null,
    }))
  );
});

router.post('/', async (req, res) => {
  const { fecha, concepto, categoria, monto, montoUsd, proveedor, comprobanteBase64, comprobanteNombre } = req.body;
  if (!concepto || !concepto.trim()) return res.status(400).json({ error: 'El concepto es obligatorio' });

  const montos = await calcularMontos(monto, montoUsd);
  if (!montos.monto || montos.monto <= 0) return res.status(400).json({ error: 'Ingresá un monto válido' });

  let comprobanteUrl = null;
  let proveedorId = null;
  try {
    comprobanteUrl = await subirComprobante(comprobanteBase64, comprobanteNombre);
    proveedorId = await resolverProveedor(proveedor);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  const { data, error } = await supabase
    .from('gastos')
    .insert({
      fecha: fecha || new Date().toISOString().slice(0, 10),
      concepto: concepto.trim(),
      categoria: (categoria && categoria.trim()) || 'General',
      monto: montos.monto,
      monto_usd: montos.montoUsd,
      proveedor_id: proveedorId,
      comprobante_url: comprobanteUrl,
      creado_por: req.user.id,
    })
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

router.put('/:id', async (req, res) => {
  const { fecha, concepto, categoria, monto, montoUsd, proveedor, comprobanteBase64, comprobanteNombre } = req.body;
  if (!concepto || !concepto.trim()) return res.status(400).json({ error: 'El concepto es obligatorio' });

  const montos = await calcularMontos(monto, montoUsd);
  if (!montos.monto || montos.monto <= 0) return res.status(400).json({ error: 'Ingresá un monto válido' });

  const updates = {
    fecha: fecha || new Date().toISOString().slice(0, 10),
    concepto: concepto.trim(),
    categoria: (categoria && categoria.trim()) || 'General',
    monto: montos.monto,
    monto_usd: montos.montoUsd,
  };

  try {
    updates.proveedor_id = await resolverProveedor(proveedor);
    if (comprobanteBase64) {
      updates.comprobante_url = await subirComprobante(comprobanteBase64, comprobanteNombre);
    }
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  const { data, error } = await supabase.from('gastos').update(updates).eq('id', req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

router.post('/bulk', async (req, res) => {
  const { gastos } = req.body;
  if (!Array.isArray(gastos) || gastos.length === 0) {
    return res.status(400).json({ error: 'No se recibieron gastos para importar' });
  }

  const tc = await tipoCambioActual();
  const proveedorIdPorNombre = new Map(); // cache para no crear el mismo proveedor varias veces en un mismo import

  const omitidos = [];
  const filas = [];
  for (let i = 0; i < gastos.length; i++) {
    const g = gastos[i];
    const concepto = (g.concepto && String(g.concepto).trim()) || '';
    const usaUsd = g.montoUsd !== undefined && g.montoUsd !== null && g.montoUsd !== '';
    const monto = usaUsd ? Number(g.montoUsd) * tc : Number(g.monto);
    if (!concepto) { omitidos.push({ fila: i + 1, motivo: 'Falta el concepto' }); continue; }
    if (!monto || monto <= 0) { omitidos.push({ fila: i + 1, motivo: 'Monto inválido' }); continue; }

    let proveedorId = null;
    const proveedorNombre = (g.proveedor || '').trim();
    if (proveedorNombre) {
      const key = proveedorNombre.toLowerCase();
      if (proveedorIdPorNombre.has(key)) {
        proveedorId = proveedorIdPorNombre.get(key);
      } else {
        try {
          proveedorId = await resolverProveedor(proveedorNombre);
          proveedorIdPorNombre.set(key, proveedorId);
        } catch (e) {
          omitidos.push({ fila: i + 1, motivo: e.message });
          continue;
        }
      }
    }

    filas.push({
      fecha: g.fecha || new Date().toISOString().slice(0, 10),
      concepto,
      categoria: (g.categoria && String(g.categoria).trim()) || 'General',
      monto,
      monto_usd: usaUsd ? Number(g.montoUsd) : null,
      proveedor_id: proveedorId,
      creado_por: req.user.id,
    });
  }

  if (filas.length === 0) {
    return res.status(400).json({ error: 'Ninguna fila tenía concepto y monto válidos', omitidos });
  }

  const { data, error } = await supabase.from('gastos').insert(filas).select();
  if (error) return res.status(400).json({ error: error.message, omitidos });
  res.status(201).json({ importados: data.length, omitidos });
});

router.delete('/', requireAdmin, async (req, res) => {
  const { error } = await supabase.from('gastos').delete().gte('id', 0);
  if (error) return res.status(400).json({ error: error.message });
  res.status(204).end();
});

router.delete('/:id', requireAdmin, async (req, res) => {
  const { error } = await supabase.from('gastos').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.status(204).end();
});

export default router;
