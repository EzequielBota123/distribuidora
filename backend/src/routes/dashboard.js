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
  const ventasMes = ventas
    .filter((v) => {
      const d = new Date(v.fecha);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    })
    .reduce((s, v) => s + Number(v.total), 0);

  const stockBajo = productos.filter((p) => p.stock <= p.stock_min);

  const respuesta = { valorVenta, ventasMes, stockBajo, ultimasVentas: ventas.slice(0, 6) };
  if (req.user.rol === 'admin') {
    const valorCosto = productos.reduce((s, p) => s + p.stock * p.costo, 0);
    respuesta.valorCosto = valorCosto;
    respuesta.margenStockPesos = valorVenta - valorCosto;
    respuesta.margenStockPct = valorVenta > 0 ? ((valorVenta - valorCosto) / valorVenta) * 100 : 0;

    const costoPorProducto = new Map(productos.map((p) => [p.id, Number(p.costo)]));
    const ventasTotalHist = ventas.reduce((s, v) => s + Number(v.total), 0);
    let costoVentasHist = 0;
    for (const v of ventas) {
      for (const item of v.venta_items) {
        costoVentasHist += (costoPorProducto.get(item.producto_id) || 0) * Number(item.cantidad);
      }
    }
    respuesta.margenVentasPesos = ventasTotalHist - costoVentasHist;
    respuesta.margenVentasPct = ventasTotalHist > 0 ? ((ventasTotalHist - costoVentasHist) / ventasTotalHist) * 100 : 0;
  }
  res.json(respuesta);
});

export default router;
