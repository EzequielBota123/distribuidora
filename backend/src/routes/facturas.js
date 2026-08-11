import { Router } from 'express';
import { supabase } from '../supabase.js';
import { requireAdmin } from '../auth.js';

const router = Router();

function limpiar(f) {
  const { ventas, ...resto } = f;
  return resto;
}

router.get('/', async (req, res) => {
  let query = supabase.from('facturas').select('*, factura_items(*), ventas!inner(creado_por)').order('id', { ascending: false });
  if (req.user.rol === 'vendedor') query = query.eq('ventas.creado_por', req.user.id);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data.map(limpiar));
});

router.get('/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('facturas')
    .select('*, factura_items(*), ventas!inner(creado_por)')
    .eq('id', req.params.id)
    .single();
  if (error || !data) return res.status(404).json({ error: 'Factura no encontrada' });
  if (req.user.rol === 'vendedor' && data.ventas.creado_por !== req.user.id) {
    return res.status(403).json({ error: 'No podés ver esta cotización' });
  }
  res.json(limpiar(data));
});

router.put('/:id', async (req, res) => {
  const { data: existente, error: findErr } = await supabase
    .from('facturas')
    .select('*, ventas!inner(creado_por)')
    .eq('id', req.params.id)
    .single();
  if (findErr || !existente) return res.status(404).json({ error: 'Cotización no encontrada' });
  if (req.user.rol !== 'admin' && existente.ventas.creado_por !== req.user.id) {
    return res.status(403).json({ error: 'No podés editar esta cotización' });
  }

  const { clienteCuit, clienteCondicionIva, ivaPct } = req.body;
  const iva_pct = Number(ivaPct) || 0;
  const neto = Number(existente.subtotal) - Number(existente.descuento_monto || 0);
  const iva_monto = neto * (iva_pct / 100);

  const { data, error } = await supabase
    .from('facturas')
    .update({
      cliente_cuit: (clienteCuit && clienteCuit.trim()) || null,
      cliente_condicion_iva: (clienteCondicionIva && clienteCondicionIva.trim()) || null,
      iva_pct,
      iva_monto,
      total: neto + iva_monto,
    })
    .eq('id', req.params.id)
    .select('*, factura_items(*)')
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

router.delete('/', requireAdmin, async (req, res) => {
  const { error } = await supabase.from('facturas').delete().gte('id', 0);
  if (error) return res.status(400).json({ error: error.message });
  res.status(204).end();
});

router.delete('/:id', requireAdmin, async (req, res) => {
  const { error } = await supabase.from('facturas').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.status(204).end();
});

export default router;
