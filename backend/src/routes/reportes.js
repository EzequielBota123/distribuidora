import { Router } from 'express';
import { supabase } from '../supabase.js';
import { requireAdmin } from '../auth.js';

const router = Router();
router.use(requireAdmin);

const COMISION_PCT = 5;

router.get('/', async (req, res) => {
  const { data: ventas, error } = await supabase
    .from('ventas')
    .select('*, venta_items(*), clientes(vendedor_id, usuarios(nombre))');
  if (error) return res.status(500).json({ error: error.message });

  const { data: productos } = await supabase.from('productos').select('id, nombre, costo');
  const costoPorProducto = new Map(productos.map((p) => [p.id, p.costo]));

  const ventasTotal = ventas.reduce((s, v) => s + Number(v.total), 0);
  let costoTotal = 0;
  const porProducto = {};

  ventas.forEach((v) => {
    v.venta_items.forEach((l) => {
      const costo = costoPorProducto.get(l.producto_id) ?? 0;
      costoTotal += costo * Number(l.cantidad);
      const key = l.producto_id ?? `del-${l.producto_nombre}`;
      if (!porProducto[key]) {
        porProducto[key] = { nombre: l.producto_nombre, unidades: 0, facturado: 0 };
      }
      porProducto[key].unidades += Number(l.cantidad);
      porProducto[key].facturado += Number(l.cantidad) * Number(l.precio_unit);
    });
  });

  const top = Object.values(porProducto)
    .sort((a, b) => b.unidades - a.unidades)
    .slice(0, 10);

  const porMes = {};
  ventas.forEach((v) => {
    const key = v.fecha.slice(0, 7);
    if (!porMes[key]) porMes[key] = { n: 0, total: 0 };
    porMes[key].n += 1;
    porMes[key].total += Number(v.total);
  });
  const mensual = Object.entries(porMes)
    .map(([mes, v]) => ({ mes, ...v }))
    .sort((a, b) => b.mes.localeCompare(a.mes));

  const porVendedor = {};
  ventas.forEach((v) => {
    const nombre = v.clientes?.usuarios?.nombre || 'Sin vendedor asignado';
    if (!porVendedor[nombre]) porVendedor[nombre] = { vendedor: nombre, nVentas: 0, total: 0, comision: 0 };
    porVendedor[nombre].nVentas += 1;
    porVendedor[nombre].total += Number(v.total);
    if (v.clientes?.usuarios?.nombre) porVendedor[nombre].comision += Number(v.total) * (COMISION_PCT / 100);
  });
  const vendedores = Object.values(porVendedor).sort((a, b) => b.total - a.total);

  res.json({
    ventasTotal,
    costoTotal,
    margen: ventasTotal - costoTotal,
    nVentas: ventas.length,
    top,
    mensual,
    vendedores,
  });
});

export default router;
