import { Router } from 'express';
import { supabase } from '../supabase.js';
import { requireAdmin } from '../auth.js';

const router = Router();

router.get('/', async (req, res) => {
  const { data, error } = await supabase.from('proveedores').select('*').order('nombre');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.post('/', async (req, res) => {
  const { nombre, telefono, notas } = req.body;
  if (!nombre || !nombre.trim()) return res.status(400).json({ error: 'El nombre es obligatorio' });
  const { data, error } = await supabase
    .from('proveedores')
    .insert({
      nombre: nombre.trim(),
      telefono: (telefono && telefono.trim()) || null,
      notas: (notas && notas.trim()) || null,
    })
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

router.put('/:id', async (req, res) => {
  const { nombre, telefono, notas } = req.body;
  if (!nombre || !nombre.trim()) return res.status(400).json({ error: 'El nombre es obligatorio' });
  const { data, error } = await supabase
    .from('proveedores')
    .update({
      nombre: nombre.trim(),
      telefono: (telefono && telefono.trim()) || null,
      notas: (notas && notas.trim()) || null,
    })
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

router.delete('/', requireAdmin, async (req, res) => {
  const { error } = await supabase.from('proveedores').delete().gte('id', 0);
  if (error) return res.status(400).json({ error: error.message });
  res.status(204).end();
});

router.delete('/:id', requireAdmin, async (req, res) => {
  const { error } = await supabase.from('proveedores').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.status(204).end();
});

export default router;
