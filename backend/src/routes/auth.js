import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { supabase } from '../supabase.js';
import { firmarToken, requireAuth } from '../auth.js';

const router = Router();

router.post('/login', async (req, res) => {
  const { nombre, password } = req.body;
  if (!nombre || !password) return res.status(400).json({ error: 'Ingresá usuario y contraseña' });

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('*')
    .eq('nombre', nombre.trim())
    .single();

  if (!usuario) return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });

  const ok = await bcrypt.compare(password, usuario.password_hash);
  if (!ok) return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });

  const token = firmarToken(usuario);
  res.json({ token, usuario: { id: usuario.id, nombre: usuario.nombre, rol: usuario.rol } });
});

router.get('/me', requireAuth, (req, res) => {
  res.json(req.user);
});

export default router;
