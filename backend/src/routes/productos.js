import { Router } from 'express';
import { supabase } from '../supabase.js';
import { requireAdmin } from '../auth.js';

const router = Router();

async function tipoCambioActual() {
  const { data } = await supabase.from('tipo_cambio').select('valor').eq('id', 1).single();
  return Number(data?.valor) || 0;
}

router.get('/', async (req, res) => {
  const { data, error } = await supabase.from('productos').select('*').order('nombre');
  if (error) return res.status(500).json({ error: error.message });
  if (req.user.rol === 'vendedor') {
    return res.json(data.map(({ costo, costo_usd, multiplicador, ...resto }) => resto));
  }
  res.json(data);
});

router.post('/', requireAdmin, async (req, res) => {
  const { codigo, nombre, categoria, costo, costoUsd, precio, multiplicador, stock, stockMin } = req.body;
  if (!nombre || !nombre.trim()) return res.status(400).json({ error: 'El nombre es obligatorio' });

  const usaUsd = costoUsd !== undefined && costoUsd !== null && costoUsd !== '';
  const costoFinal = usaUsd ? Number(costoUsd) * (await tipoCambioActual()) : Number(costo) || 0;
  const usaMultiplicador = multiplicador !== undefined && multiplicador !== null && multiplicador !== '';
  const precioFinal = usaMultiplicador ? costoFinal * Number(multiplicador) : Number(precio) || 0;

  const finalCodigo = (codigo && codigo.trim()) || ('P' + String(Date.now()).slice(-6));
  const { data, error } = await supabase
    .from('productos')
    .insert({
      codigo: finalCodigo,
      nombre: nombre.trim(),
      categoria: (categoria && categoria.trim()) || 'General',
      costo: costoFinal,
      costo_usd: usaUsd ? Number(costoUsd) : null,
      precio: precioFinal,
      multiplicador: usaMultiplicador ? Number(multiplicador) : null,
      stock: Number(stock) || 0,
      stock_min: Number(stockMin) || 0,
    })
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

router.put('/:id', requireAdmin, async (req, res) => {
  const { codigo, nombre, categoria, costo, costoUsd, precio, multiplicador, stock, stockMin } = req.body;
  if (!nombre || !nombre.trim()) return res.status(400).json({ error: 'El nombre es obligatorio' });

  const usaUsd = costoUsd !== undefined && costoUsd !== null && costoUsd !== '';
  const costoFinal = usaUsd ? Number(costoUsd) * (await tipoCambioActual()) : Number(costo) || 0;
  const usaMultiplicador = multiplicador !== undefined && multiplicador !== null && multiplicador !== '';
  const precioFinal = usaMultiplicador ? costoFinal * Number(multiplicador) : Number(precio) || 0;

  const { data, error } = await supabase
    .from('productos')
    .update({
      codigo: (codigo && codigo.trim()) || undefined,
      nombre: nombre.trim(),
      categoria: (categoria && categoria.trim()) || 'General',
      costo: costoFinal,
      costo_usd: usaUsd ? Number(costoUsd) : null,
      precio: precioFinal,
      multiplicador: usaMultiplicador ? Number(multiplicador) : null,
      stock: Number(stock) || 0,
      stock_min: Number(stockMin) || 0,
      updated_at: new Date().toISOString(),
    })
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

router.post('/bulk', requireAdmin, async (req, res) => {
  const { productos } = req.body;
  if (!Array.isArray(productos) || productos.length === 0) {
    return res.status(400).json({ error: 'No se recibieron productos para importar' });
  }

  const omitidos = [];
  const vistos = new Map();
  const tc = await tipoCambioActual();
  for (const [i, p] of productos.entries()) {
    const codigo = (p.codigo && String(p.codigo).trim()) || '';
    const nombre = (p.nombre && String(p.nombre).trim()) || '';
    if (!codigo || !nombre) {
      omitidos.push({ fila: i + 1, motivo: 'Falta código o nombre' });
      continue;
    }
    const costoUsdRaw = p.costoUsd ?? p.costo_usd;
    const usaUsd = costoUsdRaw !== undefined && costoUsdRaw !== null && costoUsdRaw !== '';
    const costoCalc = usaUsd ? Number(costoUsdRaw) * tc : Number(p.costo) || 0;
    const multRaw = p.multiplicador;
    const usaMult = multRaw !== undefined && multRaw !== null && multRaw !== '';
    vistos.set(codigo, {
      codigo,
      nombre,
      categoria: (p.categoria && String(p.categoria).trim()) || 'General',
      costo: costoCalc,
      costo_usd: usaUsd ? Number(costoUsdRaw) : null,
      precio: usaMult ? costoCalc * Number(multRaw) : Number(p.precio) || 0,
      multiplicador: usaMult ? Number(multRaw) : null,
      stock: Number(p.stock) || 0,
      stock_min: Number(p.stockMin ?? p.stock_min) || 0,
      updated_at: new Date().toISOString(),
    });
  }

  const filas = [...vistos.values()];
  if (filas.length === 0) {
    return res.status(400).json({ error: 'Ninguna fila tenía código y nombre válidos', omitidos });
  }

  const LOTE = 500;
  let importados = 0;
  for (let i = 0; i < filas.length; i += LOTE) {
    const lote = filas.slice(i, i + LOTE);
    const { error, count } = await supabase
      .from('productos')
      .upsert(lote, { onConflict: 'codigo', count: 'exact' });
    if (error) return res.status(400).json({ error: error.message, importados, omitidos });
    importados += count ?? lote.length;
  }

  res.status(201).json({ importados, omitidos });
});

router.delete('/', requireAdmin, async (req, res) => {
  const { error } = await supabase.from('productos').delete().gte('id', 0);
  if (error) return res.status(400).json({ error: error.message });
  res.status(204).end();
});

router.delete('/:id', requireAdmin, async (req, res) => {
  const { error } = await supabase.from('productos').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.status(204).end();
});

router.post('/:id/ajuste', requireAdmin, async (req, res) => {
  const { tipo, cantidad } = req.body;
  const cant = Number(cantidad) || 0;
  const { data: producto, error: findErr } = await supabase
    .from('productos')
    .select('*')
    .eq('id', req.params.id)
    .single();
  if (findErr || !producto) return res.status(404).json({ error: 'Producto no encontrado' });

  const nuevoStock = tipo === 'alta' ? Number(producto.stock) + cant : Math.max(0, Number(producto.stock) - cant);
  const { data, error } = await supabase
    .from('productos')
    .update({ stock: nuevoStock, updated_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

export default router;
