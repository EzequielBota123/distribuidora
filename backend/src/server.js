import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import authRouter from './routes/auth.js';
import usuariosRouter from './routes/usuarios.js';
import clientesRouter from './routes/clientes.js';
import productosRouter from './routes/productos.js';
import tipoCambioRouter from './routes/tipoCambio.js';
import comprasRouter from './routes/compras.js';
import ventasRouter from './routes/ventas.js';
import remitosRouter from './routes/remitos.js';
import facturasRouter from './routes/facturas.js';
import recordatoriosRouter from './routes/recordatorios.js';
import dashboardRouter from './routes/dashboard.js';
import reportesRouter from './routes/reportes.js';
import { requireAuth } from './auth.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
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

const frontendDir = path.join(__dirname, '..', '..', 'frontend');
app.use(express.static(frontendDir));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Backend escuchando en http://localhost:${PORT}`));
