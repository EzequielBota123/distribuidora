import { Router } from 'express';
import { supabase } from '../supabase.js';
import { requireAdmin } from '../auth.js';

const router = Router();

router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('recordatorios')
    .select('*')
    .order('fecha', { ascending: true })
    .order('hora', { ascending: true, nullsFirst: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.post('/', async (req, res) => {
  const { fecha, hora, titulo, descripcion } = req.body;
  if (!fecha) return res.status(400).json({ error: 'La fecha es obligatoria' });
  if (!titulo || !titulo.trim()) return res.status(400).json({ error: 'El título es obligatorio' });

  const { data, error } = await supabase
    .from('recordatorios')
    .insert({
      fecha,
      hora: hora || null,
      titulo: titulo.trim(),
      descripcion: (descripcion && descripcion.trim()) || null,
    })
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

router.put('/:id', async (req, res) => {
  const { fecha, hora, titulo, descripcion } = req.body;
  if (!fecha) return res.status(400).json({ error: 'La fecha es obligatoria' });
  if (!titulo || !titulo.trim()) return res.status(400).json({ error: 'El título es obligatorio' });

  const { data, error } = await supabase
    .from('recordatorios')
    .update({
      fecha,
      hora: hora || null,
      titulo: titulo.trim(),
      descripcion: (descripcion && descripcion.trim()) || null,
    })
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

router.delete('/', requireAdmin, async (req, res) => {
  const { error } = await supabase.from('recordatorios').delete().gte('id', 0);
  if (error) return res.status(400).json({ error: error.message });
  res.status(204).end();
});

router.delete('/:id', async (req, res) => {
  const { error } = await supabase.from('recordatorios').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.status(204).end();
});

export default router;
