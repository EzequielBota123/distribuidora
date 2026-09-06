import { Router } from 'express';
import { supabase } from '../supabase.js';

const router = Router();

router.get('/', async (req, res) => {
  let ventasQuery = supabase
    .from('ventas')
    .select('*, venta_items(*)')
    .order('fecha', { ascending: false })
    .order('id', { ascending: false });
  if (req.user.rol === 'vendedor') ventasQuery = ventasQuery.eq('creado_por', req.user.id);

  const [{ data: productos, error: e1 }, { data: ventas, error: e2 }] = await Promise.all([
    supabase.from('productos').select('*'),
    ventasQuery,
  ]);
  if (e1 || e2) return res.status(500).json({ error: (e1 || e2).message });

  const valorVenta = productos.reduce((s, p) => s + p.stock * p.precio, 0);

  const now = new Date();
  const ventasDelMes = ventas.filter((v) => {
    const d = new Date(v.fecha);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const ventasMes = ventasDelMes.reduce((s, v) => s + Number(v.total), 0);

  const stockBajo = productos.filter((p) => p.stock <= p.stock_min);

  const respuesta = { valorVenta, ventasMes, stockBajo, ultimasVentas: ventas.slice(0, 6) };
  if (req.user.rol === 'admin') {
    const valorCosto = productos.reduce((s, p) => s + p.stock * p.costo, 0);
    respuesta.valorCosto = valorCosto;
    respuesta.margenStockPesos = valorVenta - valorCosto;
    respuesta.margenStockPct = valorVenta > 0 ? ((valorVenta - valorCosto) / valorVenta) * 100 : 0;

    // Margen de ventas: del mes en curso, no histórico — así acompaña a
    // "Ventas del mes" en vez de quedar pegado al volumen de meses viejos.
    const costoPorProducto = new Map(productos.map((p) => [p.id, Number(p.costo)]));
    let costoVentasMes = 0;
    for (const v of ventasDelMes) {
      for (const item of v.venta_items) {
        costoVentasMes += (costoPorProducto.get(item.producto_id) || 0) * Number(item.cantidad);
      }
    }
    respuesta.margenVentasPesos = ventasMes - costoVentasMes;
    respuesta.margenVentasPct = ventasMes > 0 ? ((ventasMes - costoVentasMes) / ventasMes) * 100 : 0;
  }
  res.json(respuesta);
});

export default router;
