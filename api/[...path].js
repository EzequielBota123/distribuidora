import express from 'express';
import cors from 'cors';

import authRouter from '../backend/src/routes/auth.js';
import usuariosRouter from '../backend/src/routes/usuarios.js';
import clientesRouter from '../backend/src/routes/clientes.js';
import productosRouter from '../backend/src/routes/productos.js';
import tipoCambioRouter from '../backend/src/routes/tipoCambio.js';
import comprasRouter from '../backend/src/routes/compras.js';
import ventasRouter from '../backend/src/routes/ventas.js';
import remitosRouter from '../backend/src/routes/remitos.js';
import facturasRouter from '../backend/src/routes/facturas.js';
import recordatoriosRouter from '../backend/src/routes/recordatorios.js';
import dashboardRouter from '../backend/src/routes/dashboard.js';
import reportesRouter from '../backend/src/routes/reportes.js';
import gastosRouter from '../backend/src/routes/gastos.js';
import proveedoresRouter from '../backend/src/routes/proveedores.js';
import { requireAuth } from '../backend/src/auth.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '15mb' }));

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', authRouter);

app.use('/api', requireAuth);

app.use('/api/usuarios', usuariosRouter);
app.use('/api/clientes', clientesRouter);
app.use('/api/productos', productosRouter);
app.use('/api/tipo-cambio', tipoCambioRouter);
app.use('/api/compras', comprasRouter);
app.use('/api/ventas', ventasRouter);
app.use('/api/remitos', remitosRouter);
app.use('/api/facturas', facturasRouter);
app.use('/api/recordatorios', recordatoriosRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/reportes', reportesRouter);
app.use('/api/gastos', gastosRouter);
app.use('/api/proveedores', proveedoresRouter);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

export default app;
