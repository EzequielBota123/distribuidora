import { Router } from 'express';
import { supabase } from '../supabase.js';
import { requireAdmin } from '../auth.js';

const router = Router();

router.get('/', async (req, res) => {
  const [{ data: clientes, error: e1 }, { data: movimientos, error: e2 }] = await Promise.all([
    supabase.from('clientes').select('*, usuarios(nombre)').order('nombre'),
    supabase.from('cliente_movimientos').select('cliente_id, monto'),
  ]);
  if (e1 || e2) return res.status(500).json({ error: (e1 || e2).message });

  const saldos = {};
  for (const m of movimientos) saldos[m.cliente_id] = (saldos[m.cliente_id] || 0) + Number(m.monto);

  res.json(clientes.map((c) => ({ ...c, vendedorNombre: c.usuarios?.nombre || null, saldo: saldos[c.id] || 0 })));
});

router.get('/:id', async (req, res) => {
  const [{ data: cliente, error: e1 }, { data: movimientos, error: e2 }] = await Promise.all([
    supabase.from('clientes').select('*, usuarios(nombre)').eq('id', req.params.id).single(),
    supabase
      .from('cliente_movimientos')
      .select('*')
      .eq('cliente_id', req.params.id)
      .order('fecha', { ascending: false })
      .order('id', { ascending: false }),
  ]);
  if (e1 || !cliente) return res.status(404).json({ error: 'Cliente no encontrado' });
  if (e2) return res.status(500).json({ error: e2.message });

  const saldo = movimientos.reduce((s, m) => s + Number(m.monto), 0);
  res.json({ ...cliente, vendedorNombre: cliente.usuarios?.nombre || null, saldo, movimientos });
});

router.post('/', async (req, res) => {
  const { nombre, telefono, email, direccion, cuit, notas, vendedorId } = req.body;
  if (!nombre || !nombre.trim()) return res.status(400).json({ error: 'El nombre es obligatorio' });

  const { data, error } = await supabase
    .from('clientes')
    .insert({
      nombre: nombre.trim(),
      telefono: (telefono && telefono.trim()) || null,
      email: (email && email.trim()) || null,
      direccion: (direccion && direccion.trim()) || null,
      cuit: (cuit && cuit.trim()) || null,
      notas: (notas && notas.trim()) || null,
      vendedor_id: req.user.rol === 'admin' ? vendedorId || null : null,
    })
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json({ ...data, saldo: 0 });
});

router.put('/:id', async (req, res) => {
  const { nombre, telefono, email, direccion, cuit, notas, vendedorId } = req.body;
  if (!nombre || !nombre.trim()) return res.status(400).json({ error: 'El nombre es obligatorio' });

  const updates = {
    nombre: nombre.trim(),
    telefono: (telefono && telefono.trim()) || null,
    email: (email && email.trim()) || null,
    direccion: (direccion && direccion.trim()) || null,
    cuit: (cuit && cuit.trim()) || null,
    notas: (notas && notas.trim()) || null,
  };
  if (req.user.rol === 'admin') updates.vendedor_id = vendedorId || null;

  const { data, error } = await supabase
    .from('clientes')
    .update(updates)
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

router.post('/:id/pagos', async (req, res) => {
  const { monto, descripcion, fecha, banco, ventaId, descuento } = req.body;
  const m = Number(monto);
  const desc = Number(descuento) || 0;
  if (!m || m <= 0) return res.status(400).json({ error: 'Ingresá un monto válido' });
  if (desc < 0) return res.status(400).json({ error: 'El descuento no puede ser negativo' });

  if (ventaId) {
    const { data: venta } = await supabase.from('ventas').select('id, cliente_id').eq('id', ventaId).single();
    if (!venta || String(venta.cliente_id) !== String(req.params.id)) {
      return res.status(400).json({ error: 'Ese pedido no pertenece a este cliente' });
    }
  }

  const fechaMov = fecha || new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('cliente_movimientos')
    .insert({
      cliente_id: req.params.id,
      fecha: fechaMov,
      tipo: 'pago',
      monto: -Math.abs(m),
      descripcion: (descripcion && descripcion.trim()) || 'Pago registrado',
      banco: (banco && banco.trim()) || null,
      venta_id: ventaId || null,
    })
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });

  if (desc > 0) {
    await supabase.from('cliente_movimientos').insert({
      cliente_id: req.params.id,
      fecha: fechaMov,
      tipo: 'ajuste',
      monto: -desc,
      descripcion: 'Descuento aplicado',
      venta_id: ventaId || null,
    });
  }

  if (ventaId) {
    const [{ data: ventaTotal }, { data: movsVenta }] = await Promise.all([
      supabase.from('ventas').select('total').eq('id', ventaId).single(),
      supabase.from('cliente_movimientos').select('monto').eq('venta_id', ventaId).in('tipo', ['pago', 'ajuste']),
    ]);
    const totalImputado = (movsVenta || []).reduce((s, mv) => s + Math.abs(Number(mv.monto)), 0);
    if (ventaTotal && totalImputado >= Number(ventaTotal.total)) {
      await supabase.from('ventas').update({ estado_pedido: 'Pagado' }).eq('id', ventaId);
    }
  }

  res.status(201).json(data);
});

router.delete('/movimientos/:movId', requireAdmin, async (req, res) => {
  const { error } = await supabase.from('cliente_movimientos').delete().eq('id', req.params.movId);
  if (error) return res.status(400).json({ error: error.message });
  res.status(204).end();
});

router.delete('/', requireAdmin, async (req, res) => {
  const { error } = await supabase.from('clientes').delete().gte('id', 0);
  if (error) return res.status(400).json({ error: error.message });
  res.status(204).end();
});

router.delete('/:id', requireAdmin, async (req, res) => {
  const { error } = await supabase.from('clientes').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.status(204).end();
});

export default router;
