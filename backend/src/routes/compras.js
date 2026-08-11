import { Router } from 'express';
import { supabase } from '../supabase.js';
import { requireAdmin } from '../auth.js';

const router = Router();
router.use(requireAdmin);

router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('compras')
    .select('*, compra_items(*)')
    .order('fecha', { ascending: false })
    .order('id', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.post('/', async (req, res) => {
  const { fecha, proveedor, nroFactura, items } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Agregá al menos un producto' });
  }

  const { data, error } = await supabase.rpc('registrar_compra', {
    p_fecha: fecha || new Date().toISOString().slice(0, 10),
    p_proveedor: (proveedor && proveedor.trim()) || 'Sin especificar',
    p_nro_factura: (nroFactura && nroFactura.trim()) || '—',
    p_items: items,
  });
  if (error) return res.status(400).json({ error: error.message });

  const { data: compra } = await supabase.from('compras').select('*, compra_items(*)').eq('id', data).single();
  res.status(201).json(compra);
});

router.delete('/', async (req, res) => {
  const { data: compras, error: findErr } = await supabase.from('compras').select('id');
  if (findErr) return res.status(500).json({ error: findErr.message });

  for (const c of compras) {
    const { error } = await supabase.rpc('eliminar_compra', { p_compra_id: c.id });
    if (error) return res.status(400).json({ error: error.message });
  }
  res.status(204).end();
});

router.delete('/:id', async (req, res) => {
  const { error } = await supabase.rpc('eliminar_compra', { p_compra_id: req.params.id });
  if (error) return res.status(400).json({ error: error.message });
  res.status(204).end();
});

export default router;
