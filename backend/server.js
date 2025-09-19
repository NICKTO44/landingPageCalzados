const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    methods: ["GET", "POST", "PUT", "DELETE"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());
// IMPORTANTE: Los archivos estáticos DEBEN ir antes de las rutas
app.use(express.static(path.join(__dirname, 'public')));

// Configuración de base de datos para Railway
function getDatabaseConfig() {
  // Si existe DATABASE_URL, usarla (Railway)
  if (process.env.DATABASE_URL) {
    const url = require('url');
    const dbUrl = url.parse(process.env.DATABASE_URL);
    
    return {
      host: dbUrl.hostname,
      port: parseInt(dbUrl.port),
      user: dbUrl.auth.split(':')[0],
      password: dbUrl.auth.split(':')[1],
      database: dbUrl.pathname.slice(1), // Remover el '/' inicial
    };
  }
  
  // Configuración local/alternativa
  return {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'shoes_store',
    port: process.env.DB_PORT || 3306
  };
}

const dbConfig = getDatabaseConfig();
let db;

// Conexión a la base de datos
async function initDatabase() {
  try {
    db = await mysql.createConnection(dbConfig);
    console.log('✅ Conectado a MySQL');
    
    // Crear tablas si no existen
    await createTables();
    await insertInitialData();
  } catch (error) {
    console.error('❌ Error conectando a MySQL:', error);
    process.exit(1);
  }
}

// Crear tablas
async function createTables() {
  const createProductsTable = `
    CREATE TABLE IF NOT EXISTS products (
      id INT AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      brand VARCHAR(100) NOT NULL,
      price DECIMAL(10,2) NOT NULL,
      image_url TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `;

  const createSizesTable = `
    CREATE TABLE IF NOT EXISTS product_sizes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      product_id INT NOT NULL,
      size VARCHAR(10) NOT NULL,
      stock INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
      UNIQUE KEY unique_product_size (product_id, size)
    )
  `;

  await db.execute(createProductsTable);
  await db.execute(createSizesTable);
  console.log('✅ Tablas creadas correctamente');
}

// Insertar datos iniciales
async function insertInitialData() {
  const [existingProducts] = await db.execute('SELECT COUNT(*) as count FROM products');
  
  if (existingProducts[0].count === 0) {
    console.log('📦 Insertando datos iniciales...');
    
    const products = [
      {
        title: "Zapato Boni urbanos color negro",
        brand: "Elegance",
        price: 299.99,
        image_url: "/imagenes/imagen1.jpeg",
        sizes: [
          { size: "38", stock: 2 },
          { size: "39", stock: 0 },
          { size: "40", stock: 5 },
          { size: "41", stock: 1 },
          { size: "42", stock: 0 }
        ]
      },
      {
        title: "Sneakers Deportivos Premium",
        brand: "SportMax",
        price: 159.99,
        image_url: "/imagenes/imagen2.jpeg",
        sizes: [
          { size: "36", stock: 3 },
          { size: "37", stock: 0 },
          { size: "38", stock: 4 },
          { size: "39", stock: 2 },
          { size: "40", stock: 0 }
        ]
      },
      {
        title: "Botas de Cuero Artesanales",
        brand: "CraftMaster",
        price: 449.99,
        image_url: "/imagenes/imagen3.jpeg",
        sizes: [
          { size: "39", stock: 0 },
          { size: "40", stock: 0 },
          { size: "41", stock: 0 }
        ]
      }
    ];

    for (const product of products) {
      const [result] = await db.execute(
        'INSERT INTO products (title, brand, price, image_url) VALUES (?, ?, ?, ?)',
        [product.title, product.brand, product.price, product.image_url]
      );
      
      const productId = result.insertId;
      
      for (const size of product.sizes) {
        await db.execute(
          'INSERT INTO product_sizes (product_id, size, stock) VALUES (?, ?, ?)',
          [productId, size.size, size.stock]
        );
      }
    }
    
    console.log('✅ Datos iniciales insertados');
  }
}

// Función auxiliar para obtener productos con tallas (compatible con MySQL 5.7)
async function getProductsWithSizes() {
  // Obtener productos
  const [products] = await db.execute('SELECT * FROM products ORDER BY id');
  
  // Para cada producto, obtener sus tallas
  for (let product of products) {
    const [sizes] = await db.execute(
      'SELECT size, stock FROM product_sizes WHERE product_id = ? ORDER BY size',
      [product.id]
    );
    product.sizes = sizes;
  }
  
  return products;
}

// RUTAS API

// Obtener todos los productos con sus tallas
app.get('/api/products', async (req, res) => {
  try {
    const products = await getProductsWithSizes();
    res.json(products);
  } catch (error) {
    console.error('Error obteniendo productos:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Obtener un producto específico
app.get('/api/products/:id', async (req, res) => {
  try {
    const [products] = await db.execute(
      'SELECT * FROM products WHERE id = ?',
      [req.params.id]
    );

    if (products.length === 0) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    const product = products[0];
    
    // Obtener tallas del producto
    const [sizes] = await db.execute(
      'SELECT size, stock FROM product_sizes WHERE product_id = ? ORDER BY size',
      [product.id]
    );
    
    product.sizes = sizes;
    res.json(product);
    
  } catch (error) {
    console.error('Error obteniendo producto:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Actualizar stock (solo para admin)
app.put('/api/admin/stock', async (req, res) => {
  try {
    const { password, updates } = req.body;
    
    // Validar contraseña de admin
    if (password !== (process.env.ADMIN_PASSWORD || 'Daniela1809')) {
      return res.status(401).json({ error: 'Contraseña incorrecta' });
    }

    // Actualizar stock en lote
    for (const update of updates) {
      await db.execute(`
        UPDATE product_sizes 
        SET stock = ?, updated_at = CURRENT_TIMESTAMP 
        WHERE product_id = ? AND size = ?
      `, [update.stock, update.productId, update.size]);
    }

    // Obtener productos actualizados
    const products = await getProductsWithSizes();

    // Emitir actualización a todos los clientes conectados
    io.emit('stock_updated', products);

    res.json({ 
      success: true, 
      message: 'Stock actualizado correctamente',
      products: products
    });

  } catch (error) {
    console.error('Error actualizando stock:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Crear nuevo producto (admin)
app.post('/api/admin/products', async (req, res) => {
  try {
    const { password, title, brand, price, image_url, sizes } = req.body;
    
    if (password !== (process.env.ADMIN_PASSWORD || 'Daniela1809')) {
      return res.status(401).json({ error: 'Contraseña incorrecta' });
    }

    const [result] = await db.execute(
      'INSERT INTO products (title, brand, price, image_url) VALUES (?, ?, ?, ?)',
      [title, brand, price, image_url]
    );
    
    const productId = result.insertId;
    
    for (const size of sizes) {
      await db.execute(
        'INSERT INTO product_sizes (product_id, size, stock) VALUES (?, ?, ?)',
        [productId, size.size, size.stock]
      );
    }

    // Obtener todos los productos actualizados
    const products = await getProductsWithSizes();

    // Notificar a todos los clientes
    io.emit('products_updated', products);

    res.json({ success: true, productId, products: products });

  } catch (error) {
    console.error('Error creando producto:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// IMPORTANTE: Esta ruta debe ir AL FINAL, después de todas las otras rutas
// Servir frontend estático solo para rutas que no son archivos
app.get('*', (req, res) => {
  // Solo servir index.html para rutas que no contengan extensiones de archivo
  if (!req.path.includes('.') || req.path === '/') {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  } else {
    res.status(404).send('Archivo no encontrado');
  }
});

// Socket.IO para conexiones en tiempo real
io.on('connection', (socket) => {
  console.log('🔌 Cliente conectado:', socket.id);
  
  socket.on('disconnect', () => {
    console.log('🔌 Cliente desconectado:', socket.id);
  });
});

// Inicializar servidor
const PORT = process.env.PORT || 3000;

async function startServer() {
  await initDatabase();
  
  server.listen(PORT, () => {
    console.log(`🚀 Servidor ejecutándose en puerto ${PORT}`);
    console.log(`📱 Frontend: http://localhost:${PORT}`);
    console.log(`🔧 API: http://localhost:${PORT}/api`);
  });
}

startServer().catch(console.error);

module.exports = { app, server, io };