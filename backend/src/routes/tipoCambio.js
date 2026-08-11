import { Router } from 'express';
import { supabase } from '../supabase.js';
import { requireAdmin } from '../auth.js';

const router = Router();

router.get('/', async (req, res) => {
  const { data, error } = await supabase.from('tipo_cambio').select('*').eq('id', 1).single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.put('/', requireAdmin, async (req, res) => {
  const valor = Number(req.body.valor);
  if (!valor || valor <= 0) return res.status(400).json({ error: 'Ingresá un valor de tipo de cambio válido' });

  const { data: actualizados, error } = await supabase.rpc('actualizar_tipo_cambio', { p_valor: valor });
  if (error) return res.status(400).json({ error: error.message });

  const { data } = await supabase.from('tipo_cambio').select('*').eq('id', 1).single();
  res.json({ ...data, productosActualizados: actualizados });
});

export default router;
