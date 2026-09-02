import { Router } from 'express';
import { supabase } from '../supabase.js';
import { requireAdmin } from '../auth.js';

const router = Router();

const BUCKET = 'comprobantes-gastos';

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

router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('gastos')
    .select('*, usuarios(nombre)')
    .order('fecha', { ascending: false })
    .order('id', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data.map(({ usuarios, ...g }) => ({ ...g, cargadoPorNombre: usuarios?.nombre || null })));
});

router.post('/', async (req, res) => {
  const { fecha, concepto, categoria, monto, comprobanteBase64, comprobanteNombre } = req.body;
  if (!concepto || !concepto.trim()) return res.status(400).json({ error: 'El concepto es obligatorio' });
  const montoNum = Number(monto);
  if (!montoNum || montoNum <= 0) return res.status(400).json({ error: 'Ingresá un monto válido' });

  let comprobanteUrl = null;
  try {
    comprobanteUrl = await subirComprobante(comprobanteBase64, comprobanteNombre);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  const { data, error } = await supabase
    .from('gastos')
    .insert({
      fecha: fecha || new Date().toISOString().slice(0, 10),
      concepto: concepto.trim(),
      categoria: (categoria && categoria.trim()) || 'General',
      monto: montoNum,
      comprobante_url: comprobanteUrl,
      creado_por: req.user.id,
    })
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

router.put('/:id', async (req, res) => {
  const { fecha, concepto, categoria, monto, comprobanteBase64, comprobanteNombre } = req.body;
  if (!concepto || !concepto.trim()) return res.status(400).json({ error: 'El concepto es obligatorio' });
  const montoNum = Number(monto);
  if (!montoNum || montoNum <= 0) return res.status(400).json({ error: 'Ingresá un monto válido' });

  const updates = {
    fecha: fecha || new Date().toISOString().slice(0, 10),
    concepto: concepto.trim(),
    categoria: (categoria && categoria.trim()) || 'General',
    monto: montoNum,
  };

  if (comprobanteBase64) {
    try {
      updates.comprobante_url = await subirComprobante(comprobanteBase64, comprobanteNombre);
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }
  }

  const { data, error } = await supabase.from('gastos').update(updates).eq('id', req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
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
