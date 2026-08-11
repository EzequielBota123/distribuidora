import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { supabase } from '../supabase.js';
import { requireAdmin } from '../auth.js';

const router = Router();

router.get('/', requireAdmin, async (req, res) => {
  const { data, error } = await supabase
    .from('usuarios')
    .select('id, nombre, rol, created_at')
    .order('created_at');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.post('/', requireAdmin, async (req, res) => {
  const { nombre, password, rol } = req.body;
  if (!nombre || !nombre.trim()) return res.status(400).json({ error: 'El nombre de usuario es obligatorio' });
  if (!password || password.length < 4) return res.status(400).json({ error: 'La contraseña debe tener al menos 4 caracteres' });
  if (!['admin', 'vendedor'].includes(rol)) return res.status(400).json({ error: 'Rol inválido' });

  const password_hash = await bcrypt.hash(password, 10);
  const { data, error } = await supabase
    .from('usuarios')
    .insert({ nombre: nombre.trim(), password_hash, rol })
    .select('id, nombre, rol, created_at')
    .single();
  if (error) {
    if (error.code === '23505') return res.status(400).json({ error: 'Ya existe un usuario con ese nombre' });
    return res.status(400).json({ error: error.message });
  }
  res.status(201).json(data);
});

router.put('/:id', requireAdmin, async (req, res) => {
  const { password, rol } = req.body;
  const updates = {};
  if (password) {
    if (password.length < 4) return res.status(400).json({ error: 'La contraseña debe tener al menos 4 caracteres' });
    updates.password_hash = await bcrypt.hash(password, 10);
  }
  if (rol) {
    if (!['admin', 'vendedor'].includes(rol)) return res.status(400).json({ error: 'Rol inválido' });
    updates.rol = rol;
  }
  if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'Nada para actualizar' });

  const { data, error } = await supabase
    .from('usuarios')
    .update(updates)
    .eq('id', req.params.id)
    .select('id, nombre, rol, created_at')
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

router.delete('/:id', requireAdmin, async (req, res) => {
  if (Number(req.params.id) === req.user.id) {
    return res.status(400).json({ error: 'No podés eliminar tu propio usuario' });
  }
  const { error } = await supabase.from('usuarios').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.status(204).end();
});

export default router;
