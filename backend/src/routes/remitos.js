import { Router } from 'express';
import { supabase } from '../supabase.js';
import { requireAdmin } from '../auth.js';

const router = Router();

function limpiar(r) {
  const { ventas, ...resto } = r;
  return resto;
}

router.get('/', async (req, res) => {
  let query = supabase.from('remitos').select('*, remito_items(*), ventas!inner(creado_por)').order('id', { ascending: false });
  if (req.user.rol === 'vendedor') query = query.eq('ventas.creado_por', req.user.id);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data.map(limpiar));
});

router.get('/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('remitos')
    .select('*, remito_items(*), ventas!inner(creado_por, cliente_id, clientes(nombre, telefono, email, direccion, cuit))')
    .eq('id', req.params.id)
    .single();
  if (error || !data) return res.status(404).json({ error: 'Remito no encontrado' });
  if (req.user.rol === 'vendedor' && data.ventas.creado_por !== req.user.id) {
    return res.status(403).json({ error: 'No podés ver este remito' });
  }
  const { ventas, ...resto } = data;
  res.json({ ...resto, clienteInfo: ventas.clientes || null });
});

router.delete('/', requireAdmin, async (req, res) => {
  const { error } = await supabase.from('remitos').delete().gte('id', 0);
  if (error) return res.status(400).json({ error: error.message });
  res.status(204).end();
});

router.delete('/:id', requireAdmin, async (req, res) => {
  const { error } = await supabase.from('remitos').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.status(204).end();
});

export default router;
