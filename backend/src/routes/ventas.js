import { Router } from 'express';
import { supabase } from '../supabase.js';
import { requireAdmin } from '../auth.js';

const router = Router();

const COMISION_PCT = 5;

async function puedeGestionarVenta(req, ventaId) {
  if (req.user.rol === 'admin') return true;
  const { data: venta } = await supabase
    .from('ventas')
    .select('creado_por, clientes(vendedor_id)')
    .eq('id', ventaId)
    .single();
  if (!venta) return false;
  return venta.creado_por === req.user.id || venta.clientes?.vendedor_id === req.user.id;
}

function conVendedor(venta) {
  const vendedor = venta.clientes?.usuarios?.nombre || null;
  const comision = vendedor ? Number(venta.total) * (COMISION_PCT / 100) : 0;
  return { ...venta, vendedor, comision };
}

function conMargen(venta, costoPorProducto) {
  let costoTotal = 0;
  for (const item of venta.venta_items) {
    costoTotal += (costoPorProducto.get(item.producto_id) || 0) * Number(item.cantidad);
  }
  const margenPesos = Number(venta.total) - costoTotal;
  const margenPct = Number(venta.total) > 0 ? (margenPesos / Number(venta.total)) * 100 : 0;
  return { ...venta, margenPesos, margenPct };
}

const SELECT_VENTA = '*, venta_items(*), remitos(id, numero), facturas(id, numero), clientes(id, nombre, vendedor_id, usuarios(nombre))';

router.get('/', async (req, res) => {
  let data;
  if (req.user.rol === 'vendedor') {
    const [propias, deClientesAsignados] = await Promise.all([
      supabase.from('ventas').select(SELECT_VENTA).eq('creado_por', req.user.id),
      supabase.from('ventas').select(SELECT_VENTA).eq('clientes.vendedor_id', req.user.id),
    ]);
    if (propias.error) return res.status(500).json({ error: propias.error.message });
    if (deClientesAsignados.error) return res.status(500).json({ error: deClientesAsignados.error.message });
    const porId = new Map();
    for (const v of [...propias.data, ...deClientesAsignados.data]) {
      if (v.clientes?.vendedor_id === req.user.id || v.creado_por === req.user.id) porId.set(v.id, v);
    }
    data = [...porId.values()].sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : b.id - a.id));
  } else {
    const { data: todas, error } = await supabase
      .from('ventas')
      .select(SELECT_VENTA)
      .order('fecha', { ascending: false })
      .order('id', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    data = todas;
  }

  const conVend = data.map(conVendedor);

  if (req.user.rol === 'admin') {
    const { data: productos } = await supabase.from('productos').select('id, costo');
    const costoPorProducto = new Map(productos.map((p) => [p.id, Number(p.costo)]));
    return res.json(conVend.map((v) => conMargen(v, costoPorProducto)));
  }
  res.json(conVend);
});

router.get('/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('ventas')
    .select('*, venta_items(*), remitos(id, numero), facturas(id, numero), clientes(id, nombre, vendedor_id, usuarios(nombre))')
    .eq('id', req.params.id)
    .single();
  if (error || !data) return res.status(404).json({ error: 'Venta no encontrada' });
  if (req.user.rol !== 'admin' && data.creado_por !== req.user.id && data.clientes?.vendedor_id !== req.user.id) {
    return res.status(403).json({ error: 'No podés ver esta venta' });
  }
  const { data: historial } = await supabase
    .from('venta_historial')
    .select('id, usuario_nombre, fecha, cambios')
    .eq('venta_id', req.params.id)
    .order('fecha', { ascending: false });
  const dataConVendedor = conVendedor(data);
  dataConVendedor.historial = historial || [];
  if (req.user.rol === 'admin') {
    const { data: productos } = await supabase.from('productos').select('id, costo');
    const costoPorProducto = new Map(productos.map((p) => [p.id, Number(p.costo)]));
    return res.json(conMargen(dataConVendedor, costoPorProducto));
  }
  res.json(dataConVendedor);
});

router.post('/', async (req, res) => {
  const { fecha, cliente, clienteId, items, generarRemito, generarFactura, clienteCuit, clienteCondicionIva, ivaPct, descuento } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Agregá al menos un producto' });
  }

  const { data, error } = await supabase.rpc('registrar_venta', {
    p_fecha: fecha || new Date().toISOString().slice(0, 10),
    p_cliente: (cliente && cliente.trim()) || 'Consumidor final',
    p_items: items,
    p_generar_remito: generarRemito !== false,
    p_generar_factura: !!generarFactura,
    p_cliente_cuit: (clienteCuit && clienteCuit.trim()) || null,
    p_cliente_condicion_iva: (clienteCondicionIva && clienteCondicionIva.trim()) || null,
    p_iva_pct: ivaPct !== undefined && ivaPct !== null ? Number(ivaPct) : 0,
    p_creado_por: req.user.id,
    p_cliente_id: clienteId || null,
    p_descuento: descuento !== undefined && descuento !== null ? Number(descuento) : 0,
  });
  if (error) return res.status(400).json({ error: error.message });

  const { data: venta } = await supabase
    .from('ventas')
    .select('*, venta_items(*), remitos(id, numero), facturas(id, numero)')
    .eq('id', data)
    .single();
  res.status(201).json(venta);
});

function describirCambios(antes, despues) {
  const cambios = [];
  if (antes.fecha !== despues.fecha) cambios.push(`fecha: ${antes.fecha} → ${despues.fecha}`);
  if (antes.cliente !== despues.cliente) cambios.push(`cliente: "${antes.cliente}" → "${despues.cliente}"`);
  if (Number(antes.descuento || 0) !== Number(despues.descuento || 0)) {
    cambios.push(`descuento: ${Number(antes.descuento || 0)}% → ${Number(despues.descuento || 0)}%`);
  }

  const itemsAntes = antes.venta_items.map((i) => `${i.producto_nombre} x${Number(i.cantidad)} ($${Number(i.precio_unit)})`);
  const itemsDespues = despues.items.map((i) => {
    const nombre = despues.nombresPorId.get(i.productoId) || `#${i.productoId}`;
    return `${nombre} x${Number(i.cantidad)} ($${Number(i.precioUnit)})`;
  });
  const antesStr = itemsAntes.join(', ');
  const despuesStr = itemsDespues.join(', ');
  if (antesStr !== despuesStr) cambios.push(`items: [${antesStr}] → [${despuesStr}]`);

  return cambios.length ? cambios.join('; ') : 'sin cambios de datos';
}

router.put('/:id', async (req, res) => {
  const { fecha, cliente, items, descuento, clienteId } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Agregá al menos un producto' });
  }

  if (!(await puedeGestionarVenta(req, req.params.id))) {
    return res.status(403).json({ error: 'Solo podés editar tus propias ventas o las de tus clientes asignados' });
  }

  const { data: ventaAntes } = await supabase
    .from('ventas')
    .select('fecha, cliente, descuento, venta_items(producto_nombre, cantidad, precio_unit)')
    .eq('id', req.params.id)
    .single();

  const fechaNueva = fecha || new Date().toISOString().slice(0, 10);
  const clienteNuevo = (cliente && cliente.trim()) || 'Consumidor final';
  const descuentoNuevo = descuento !== undefined && descuento !== null ? Number(descuento) : 0;

  const { error } = await supabase.rpc('editar_venta', {
    p_venta_id: req.params.id,
    p_fecha: fechaNueva,
    p_cliente: clienteNuevo,
    p_items: items,
    p_descuento: descuentoNuevo,
    p_cliente_id: clienteId || null,
  });
  if (error) return res.status(400).json({ error: error.message });

  if (ventaAntes) {
    const productoIds = items.map((i) => i.productoId);
    const { data: productos } = await supabase.from('productos').select('id, nombre').in('id', productoIds);
    const nombresPorId = new Map((productos || []).map((p) => [p.id, p.nombre]));
    const cambios = describirCambios(
      { fecha: ventaAntes.fecha, cliente: ventaAntes.cliente, descuento: ventaAntes.descuento, venta_items: ventaAntes.venta_items },
      { fecha: fechaNueva, cliente: clienteNuevo, descuento: descuentoNuevo, items, nombresPorId }
    );
    await supabase.from('venta_historial').insert({
      venta_id: req.params.id,
      usuario_id: req.user.id,
      usuario_nombre: req.user.nombre,
      cambios,
    });
  }

  const { data: venta } = await supabase
    .from('ventas')
    .select('*, venta_items(*), remitos(id, numero), facturas(id, numero)')
    .eq('id', req.params.id)
    .single();
  res.json(venta);
});

const ESTADOS_VALIDOS = ['Prioridad 1', 'Pendiente', 'Preparado', 'Despachado', 'Pagado'];

router.put('/:id/estado', async (req, res) => {
  const { estado } = req.body;
  if (!ESTADOS_VALIDOS.includes(estado)) return res.status(400).json({ error: 'Estado inválido' });

  if (!(await puedeGestionarVenta(req, req.params.id))) {
    return res.status(403).json({ error: 'Solo podés actualizar tus propias ventas o las de tus clientes asignados' });
  }

  const { data, error } = await supabase
    .from('ventas')
    .update({ estado_pedido: estado })
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

router.delete('/', requireAdmin, async (req, res) => {
  const { data: ventas, error: findErr } = await supabase.from('ventas').select('id');
  if (findErr) return res.status(500).json({ error: findErr.message });

  for (const v of ventas) {
    const { error } = await supabase.rpc('eliminar_venta', { p_venta_id: v.id });
    if (error) return res.status(400).json({ error: error.message });
  }
  res.status(204).end();
});

router.delete('/:id', async (req, res) => {
  if (!(await puedeGestionarVenta(req, req.params.id))) {
    return res.status(403).json({ error: 'Solo podés eliminar tus propias ventas o las de tus clientes asignados' });
  }
  const { error } = await supabase.rpc('eliminar_venta', { p_venta_id: req.params.id });
  if (error) return res.status(400).json({ error: error.message });
  res.status(204).end();
});

export default router;
