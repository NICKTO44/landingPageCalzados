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
  if (process.env.DATABASE_URL) {
    const url = require('url');
    const dbUrl = url.parse(process.env.DATABASE_URL);
    
    return {
      host: dbUrl.hostname,
      port: parseInt(dbUrl.port),
      user: dbUrl.auth.split(':')[0],
      password: dbUrl.auth.split(':')[1],
      database: dbUrl.pathname.slice(1),
      // AGREGAR ESTAS LÍNEAS:
      connectionLimit: 10,
      acquireTimeout: 60000,
      timeout: 60000,
      reconnect: true,
      idleTimeout: 300000,
      ssl: { rejectUnauthorized: false }
    };
  }
  
  return {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'shoes_store',
    port: process.env.DB_PORT || 3306,
    // AGREGAR ESTAS LÍNEAS:
    connectionLimit: 5,
    acquireTimeout: 60000,
    timeout: 60000,
    reconnect: true
  };
}

const dbConfig = getDatabaseConfig();
let db;

// Conexión a la base de datos
async function initDatabase() {
  try {
    db = mysql.createPool(dbConfig);  // CAMBIO: createPool en lugar de createConnection
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
        brand: "Boni",
        price: 74.99,
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
        title: "Zapato Boni urbanos color negro",
        brand: "Boni",
        price: 74.99,
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
        title: "Zapato Boni urbanos color negro",
        brand: "Boni",
        price: 74.99,
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
  try {
    // Versión compatible con MariaDB
    const [rows] = await db.execute(`
      SELECT 
        p.id,
        p.title,
        p.brand,
        p.price,
        p.image_url,
        p.created_at,
        p.updated_at
      FROM products p
      ORDER BY p.created_at DESC
    `);

    // Obtener tallas para cada producto por separado
    for (let product of rows) {
      const [sizes] = await db.execute(
        'SELECT size, stock FROM product_sizes WHERE product_id = ? ORDER BY size',
        [product.id]
      );
      product.sizes = sizes;
    }

    return rows;
  } catch (error) {
    console.error('Error obteniendo productos:', error);
      if (error.code === 'PROTOCOL_CONNECTION_LOST' || 
      error.message.includes('closed state')) {
    console.log('🔄 Error de conexión detectado, el pool reconectará automáticamente');
  }
    throw error;
  }
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
// Actualizar stock (PUT /api/admin/stock) - CORREGIDO
app.put('/api/admin/stock', async (req, res) => {
    let connection = null;
    
    try {
        console.log('Body recibido en stock update:', JSON.stringify(req.body, null, 2));
        
        const { password, updates } = req.body;
        
        if (password !== (process.env.ADMIN_PASSWORD || 'Daniela1809')) {
            return res.status(401).json({ error: 'Contraseña incorrecta' });
        }

        if (!updates || !Array.isArray(updates)) {
            return res.status(400).json({ error: 'Updates debe ser un array' });
        }

        // Obtener conexión del pool para transacción
        connection = await db.getConnection();
        
        // Iniciar transacción en la conexión específica
        await connection.beginTransaction();

        try {
            for (const update of updates) {
                const productId = parseInt(update.productId);
                const size = update.size?.toString().trim();
                const stock = parseInt(update.stock) || 0;

                console.log('Actualizando:', { productId, size, stock });

                if (!productId || !size || stock < 0) {
                    throw new Error(`Datos inválidos: productId=${productId}, size=${size}, stock=${stock}`);
                }

                // Verificar que existe la combinación producto-talla
                const [existing] = await connection.execute(
                    'SELECT id FROM product_sizes WHERE product_id = ? AND size = ?',
                    [productId, size]
                );

                if (existing.length === 0) {
                    // Si no existe, crear la talla
                    await connection.execute(
                        'INSERT INTO product_sizes (product_id, size, stock) VALUES (?, ?, ?)',
                        [productId, size, stock]
                    );
                } else {
                    // Si existe, actualizar
                    await connection.execute(
                        'UPDATE product_sizes SET stock = ? WHERE product_id = ? AND size = ?',
                        [stock, productId, size]
                    );
                }
            }

            await connection.commit();

            // Obtener productos actualizados usando el pool
            const products = await getProductsWithSizes();

            // Notificar a todos los clientes
            io.emit('stock_updated', products);

            console.log(`Stock actualizado para ${updates.length} tallas`);

            res.json({ success: true, message: 'Stock actualizado correctamente' });

        } catch (error) {
            await connection.rollback();
            throw error;
        }

    } catch (error) {
        console.error('Error actualizando stock:', error);
        res.status(500).json({ error: 'Error interno del servidor: ' + error.message });
    } finally {
        // Liberar conexión de vuelta al pool
        if (connection) connection.release();
    }
});

// Crear nuevo producto (admin)
// Crear nuevo producto (admin) - CORREGIDO
// Crear nuevo producto (POST /api/admin/products) - VERSIÓN CORREGIDA FINAL
app.post('/api/admin/products', async (req, res) => {
    let connection = null;
    
    try {
        console.log('🔍 POST /api/admin/products recibido');
        console.log('Body completo:', JSON.stringify(req.body, null, 2));
        
        const { password, product, sizes } = req.body;
        
        // Verificar contraseña admin
        if (password !== (process.env.ADMIN_PASSWORD || 'Daniela1809')) {
            console.log('❌ Contraseña incorrecta');
            return res.status(401).json({ error: 'Contraseña incorrecta' });
        }
        
        // Validar que product existe y tiene propiedades
        if (!product || typeof product !== 'object') {
            console.log('❌ Objeto product inválido:', product);
            return res.status(400).json({ error: 'Datos del producto inválidos' });
        }
        
        // Limpiar y validar datos del producto
        const cleanProduct = {
            title: product.title ? product.title.toString().trim() : '',
            brand: product.brand ? product.brand.toString().trim() : '',
            price: product.price ? parseFloat(product.price) : 0,
            image_url: product.image_url ? product.image_url.toString().trim() : ''
        };
        
        console.log('📦 Producto limpio:', cleanProduct);
        
        // Validar campos obligatorios
        if (!cleanProduct.title || !cleanProduct.brand || !cleanProduct.image_url) {
            console.log('❌ Faltan campos obligatorios');
            return res.status(400).json({ error: 'Faltan campos obligatorios del producto' });
        }
        
        // Validar precio
        if (isNaN(cleanProduct.price) || cleanProduct.price <= 0) {
            console.log('❌ Precio inválido:', cleanProduct.price);
            return res.status(400).json({ error: 'Precio inválido' });
        }
        
        // Validar y limpiar sizes
        if (!sizes || !Array.isArray(sizes) || sizes.length === 0) {
            console.log('❌ Sizes inválidas:', sizes);
            return res.status(400).json({ error: 'Debe incluir al menos una talla' });
        }
        
        const cleanSizes = sizes.map(size => ({
            size: size.size ? size.size.toString().trim() : '',
            stock: size.stock ? parseInt(size.stock) : 0
        })).filter(size => size.size !== '');
        
        console.log('👕 Tallas limpias:', cleanSizes);
        
        if (cleanSizes.length === 0) {
            return res.status(400).json({ error: 'Debe incluir al menos una talla válida' });
        }
        
        // Obtener conexión del pool
        connection = await db.getConnection();
        
        // Verificar que el título no existe ya
        console.log('🔍 Verificando título único...');
        const [existingTitle] = await connection.execute(
            'SELECT id FROM products WHERE title = ?',
            [cleanProduct.title]
        );
        
        if (existingTitle.length > 0) {
            return res.status(400).json({ error: 'Ya existe un producto con ese título' });
        }
        
        // Iniciar transacción
        console.log('🔄 Iniciando transacción...');
        await connection.beginTransaction();
        
        try {
            // Insertar producto
            console.log('📝 Insertando producto:', [cleanProduct.title, cleanProduct.brand, cleanProduct.price, cleanProduct.image_url]);
            
            const [productResult] = await connection.execute(
                'INSERT INTO products (title, brand, price, image_url) VALUES (?, ?, ?, ?)',
                [cleanProduct.title, cleanProduct.brand, cleanProduct.price, cleanProduct.image_url]
            );
            
            const productId = productResult.insertId;
            console.log('✅ Producto insertado con ID:', productId);
            
            // Insertar tallas
            console.log('👕 Insertando tallas...');
            for (const size of cleanSizes) {
                console.log('📏 Insertando talla:', [productId, size.size, size.stock]);
                
                await connection.execute(
                    'INSERT INTO product_sizes (product_id, size, stock) VALUES (?, ?, ?)',
                    [productId, size.size, size.stock]
                );
            }
            
            // Confirmar transacción
            await connection.commit();
            console.log('✅ Transacción confirmada');
            
            // Obtener productos actualizados
            const products = await getProductsWithSizes();
            
            // Emitir actualización vía socket a todos los clientes
            io.emit('products_updated', products);
            
            console.log(`✅ Producto creado exitosamente: ${cleanProduct.title} (ID: ${productId})`);
            
            res.json({ 
                success: true,
                message: 'Producto creado exitosamente', 
                productId: productId
            });
            
        } catch (error) {
            // Revertir transacción en caso de error
            await connection.rollback();
            console.log('🔙 Transacción revertida');
            throw error;
        }
        
    } catch (error) {
        console.error('❌ Error detallado creando producto:', error);
        res.status(500).json({ 
            error: error.message || 'Error interno del servidor' 
        });
    } finally {
        // Liberar conexión de vuelta al pool
        if (connection) connection.release();
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

// Mantener conexiones vivas
setInterval(async () => {
  try {
    await db.execute('SELECT 1');
  } catch (error) {
    console.warn('Ping de BD falló:', error.message);
  }
}, 240000); // Cada 4 minutos

async function startServer() {
  await initDatabase();
  
  server.listen(PORT, () => {
    console.log(`🚀 Servidor ejecutándose en puerto ${PORT}`);
    console.log(`📱 Frontend: http://localhost:${PORT}`);
    console.log(`🔧 API: http://localhost:${PORT}/api`);
  });
}




// ===============================================
// BACKEND ADMIN API - VERSIÓN CORREGIDA
// Reemplaza tu ruta POST /api/admin/products actual
// ===============================================

// Crear nuevo producto (POST /api/admin/products) - VERSIÓN CORREGIDA
app.post('/api/admin/products', async (req, res) => {
    try {
        console.log('🔍 POST /api/admin/products recibido');
        console.log('Body completo:', JSON.stringify(req.body, null, 2));
        
        const { password, product, sizes } = req.body;
        
        // Verificar contraseña admin
        if (password !== process.env.ADMIN_PASSWORD) {
            console.log('❌ Contraseña incorrecta');
            return res.status(401).json({ error: 'Contraseña incorrecta' });
        }
        
        // Validar que product existe y tiene propiedades
        if (!product || typeof product !== 'object') {
            console.log('❌ Objeto product inválido:', product);
            return res.status(400).json({ error: 'Datos del producto inválidos' });
        }
        
        // Limpiar y validar datos del producto
        const cleanProduct = {
            title: product.title ? product.title.toString().trim() : '',
            brand: product.brand ? product.brand.toString().trim() : '',
            price: product.price ? parseFloat(product.price) : 0,
            image_url: product.image_url ? product.image_url.toString().trim() : ''
        };
        
        console.log('📦 Producto limpio:', cleanProduct);
        
        // Validar campos obligatorios
        if (!cleanProduct.title || !cleanProduct.brand || !cleanProduct.image_url) {
            console.log('❌ Faltan campos obligatorios');
            return res.status(400).json({ error: 'Faltan campos obligatorios del producto' });
        }
        
        // Validar precio
        if (isNaN(cleanProduct.price) || cleanProduct.price <= 0) {
            console.log('❌ Precio inválido:', cleanProduct.price);
            return res.status(400).json({ error: 'Precio inválido' });
        }
        
        // Validar y limpiar sizes
        if (!sizes || !Array.isArray(sizes) || sizes.length === 0) {
            console.log('❌ Sizes inválidas:', sizes);
            return res.status(400).json({ error: 'Debe incluir al menos una talla' });
        }
        
        const cleanSizes = sizes.map(size => ({
            size: size.size ? size.size.toString().trim() : '',
            stock: size.stock ? parseInt(size.stock) : 0
        })).filter(size => size.size !== ''); // Filtrar tallas vacías
        
        console.log('👕 Tallas limpias:', cleanSizes);
        
        if (cleanSizes.length === 0) {
            return res.status(400).json({ error: 'Debe incluir al menos una talla válida' });
        }
        
        // Validar que no hay tallas duplicadas
        const sizeNumbers = cleanSizes.map(s => s.size);
        if (new Set(sizeNumbers).size !== sizeNumbers.length) {
            return res.status(400).json({ error: 'No puede haber tallas duplicadas' });
        }
        
        // Validar stocks
        for (const size of cleanSizes) {
            if (size.stock < 0) {
                return res.status(400).json({ error: `Stock no puede ser negativo para talla ${size.size}` });
            }
        }
        
        // Verificar que el título no existe ya
        console.log('🔍 Verificando título único...');
        const [existingTitle] = await db.execute(
            'SELECT id FROM products WHERE title = ?',
            [cleanProduct.title]
        );
        
        if (existingTitle.length > 0) {
            return res.status(400).json({ error: 'Ya existe un producto con ese título' });
        }
        
        // Iniciar transacción
        console.log('🔄 Iniciando transacción...');
        await db.beginTransaction();
        
        try {
            // Insertar producto
            console.log('📝 Insertando producto:', [cleanProduct.title, cleanProduct.brand, cleanProduct.price, cleanProduct.image_url]);
            
            const [productResult] = await db.execute(
                'INSERT INTO products (title, brand, price, image_url) VALUES (?, ?, ?, ?)',
                [cleanProduct.title, cleanProduct.brand, cleanProduct.price, cleanProduct.image_url]
            );
            
            const productId = productResult.insertId;
            console.log('✅ Producto insertado con ID:', productId);
            
            // Insertar tallas
            console.log('👕 Insertando tallas...');
            for (const size of cleanSizes) {
                console.log('📏 Insertando talla:', [productId, size.size, size.stock]);
                
                await db.execute(
                    'INSERT INTO product_sizes (product_id, size, stock) VALUES (?, ?, ?)',
                    [productId, size.size, size.stock]
                );
            }
            
            // Confirmar transacción
            await db.commit();
            console.log('✅ Transacción confirmada');
            
            // Obtener producto completo recién creado
            const [newProductRows] = await db.execute(
                `SELECT p.*, 
                        JSON_ARRAYAGG(
                            JSON_OBJECT('size', ps.size, 'stock', ps.stock)
                            ORDER BY ps.size
                        ) as sizes
                 FROM products p 
                 LEFT JOIN product_sizes ps ON p.id = ps.product_id 
                 WHERE p.id = ?
                 GROUP BY p.id`,
                [productId]
            );
            
            const newProduct = newProductRows[0];
            newProduct.sizes = JSON.parse(newProduct.sizes);
            
            // Emitir actualización vía socket a todos los clientes
            io.emit('products_updated', await getAllProducts());
            
            console.log(`✅ Producto creado exitosamente: ${cleanProduct.title} (ID: ${productId})`);
            
            res.json({ 
                message: 'Producto creado exitosamente', 
                product: newProduct 
            });
            
        } catch (error) {
            // Revertir transacción en caso de error
            await db.rollback();
            console.log('🔙 Transacción revertida');
            throw error;
        }
        
    } catch (error) {
        console.error('❌ Error detallado creando producto:', error);
        console.error('Stack completo:', error.stack);
        res.status(500).json({ 
            error: error.message || 'Error interno del servidor' 
        });
    }
});

// Función auxiliar para obtener todos los productos (CORREGIDA)
async function getAllProducts() {
  try {
    // Versión compatible con MariaDB
    const [rows] = await db.execute(`
      SELECT 
        p.id,
        p.title,
        p.brand,
        p.price,
        p.image_url,
        p.created_at,
        p.updated_at
      FROM products p
      ORDER BY p.created_at DESC
    `);

    // Obtener tallas para cada producto por separado
    for (let product of rows) {
      const [sizes] = await db.execute(
        'SELECT size, stock FROM product_sizes WHERE product_id = ? ORDER BY size',
        [product.id]
      );
      product.sizes = sizes;
    }

    return rows;
  } catch (error) {
    console.error('Error obteniendo productos:', error);
    throw error;
  }
}
// ===============================================
// BACKEND ADMIN API - PARTE 2/3
// ELIMINAR Y ACTUALIZAR PRODUCTOS
// Agregar después de la Parte 1
// ===============================================

// Eliminar producto (DELETE /api/admin/products/:id)
// Eliminar producto (DELETE /api/admin/products/:id)
app.delete('/api/admin/products/:id', async (req, res) => {
  try {
    const { password } = req.body;
    const productId = parseInt(req.params.id);
    
    if (password !== (process.env.ADMIN_PASSWORD || 'Daniela1809')) {
      return res.status(401).json({ error: 'Contraseña incorrecta' });
    }
    
    // Verificar que el producto existe
    const [existingProduct] = await db.execute(
      'SELECT id, title FROM products WHERE id = ?',
      [productId]
    );
    
    if (existingProduct.length === 0) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }
    
    const productTitle = existingProduct[0].title;
    
    // Eliminar producto (las tallas se eliminan automáticamente por CASCADE)
    await db.execute('DELETE FROM products WHERE id = ?', [productId]);
    
    // Obtener productos actualizados
    const products = await getProductsWithSizes();
    
    // Notificar a todos los clientes
    io.emit('products_updated', products);
    
    console.log(`Producto eliminado: ${productTitle} (ID: ${productId})`);
    
    res.json({ 
      message: 'Producto eliminado exitosamente',
      deletedProduct: { id: productId, title: productTitle }
    });
    
  } catch (error) {
    console.error('Error eliminando producto:', error);
    res.status(500).json({ error: 'Error interno del servidor: ' + error.message });
  }
});
// Actualizar producto (PUT /api/admin/products/:id)
app.put('/api/admin/products/:id', async (req, res) => {
    try {
        const { password, product } = req.body;
        const productId = parseInt(req.params.id);
        
        // Verificar contraseña admin
        if (password !== process.env.ADMIN_PASSWORD) {
            return res.status(401).json({ error: 'Contraseña incorrecta' });
        }
        
        // Validar ID del producto
        if (isNaN(productId) || productId <= 0) {
            return res.status(400).json({ error: 'ID de producto inválido' });
        }
        
        // Verificar que el producto existe
        const [existingProduct] = await db.execute(
            'SELECT id, title FROM products WHERE id = ?',
            [productId]
        );
        
        if (existingProduct.length === 0) {
            return res.status(404).json({ error: 'Producto no encontrado' });
        }
        
        // Validar datos del producto
        if (!product.title || !product.brand || !product.price || !product.image_url) {
            return res.status(400).json({ error: 'Faltan campos obligatorios' });
        }
        
        // Validar precio
        const price = parseFloat(product.price);
        if (isNaN(price) || price <= 0) {
            return res.status(400).json({ error: 'Precio inválido' });
        }
        
        // Verificar que no haya otro producto con el mismo título (excepto el actual)
        const [duplicateTitle] = await db.execute(
            'SELECT id FROM products WHERE title = ? AND id != ?',
            [product.title.trim(), productId]
        );
        
        if (duplicateTitle.length > 0) {
            return res.status(400).json({ error: 'Ya existe otro producto con ese título' });
        }
        
        // Actualizar producto
        const [updateResult] = await db.execute(
            'UPDATE products SET title = ?, brand = ?, price = ?, image_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [product.title.trim(), product.brand.trim(), price, product.image_url.trim(), productId]
        );
        
        if (updateResult.affectedRows === 0) {
            return res.status(404).json({ error: 'No se pudo actualizar el producto' });
        }
        
        // Emitir actualización vía socket
        io.emit('products_updated', await getAllProducts());
        
        console.log(`📝 Producto actualizado: ${product.title} (ID: ${productId})`);
        
        res.json({ 
            message: 'Producto actualizado exitosamente',
            productId: productId
        });
        
    } catch (error) {
        console.error('❌ Error actualizando producto:', error);
        res.status(500).json({ 
            error: error.message || 'Error interno del servidor' 
        });
    }
});

// Obtener un producto específico (GET /api/admin/products/:id)
app.get('/api/admin/products/:id', async (req, res) => {
    try {
        const productId = parseInt(req.params.id);
        
        // Validar ID del producto
        if (isNaN(productId) || productId <= 0) {
            return res.status(400).json({ error: 'ID de producto inválido' });
        }
        
        // Obtener producto con sus tallas
        const [productRows] = await db.execute(
            `SELECT p.*, 
                    JSON_ARRAYAGG(
                        JSON_OBJECT('size', ps.size, 'stock', ps.stock)
                        ORDER BY ps.size
                    ) as sizes
             FROM products p 
             LEFT JOIN product_sizes ps ON p.id = ps.product_id 
             WHERE p.id = ?
             GROUP BY p.id`,
            [productId]
        );
        
        if (productRows.length === 0) {
            return res.status(404).json({ error: 'Producto no encontrado' });
        }
        
        const product = productRows[0];
        product.sizes = JSON.parse(product.sizes || '[]');
        
        res.json(product);
        
    } catch (error) {
        console.error('❌ Error obteniendo producto:', error);
        res.status(500).json({ 
            error: error.message || 'Error interno del servidor' 
        });
    }
});
// ===============================================
// BACKEND ADMIN API - PARTE 3/3
// GESTIÓN DE TALLAS
// Agregar después de la Parte 2
// ===============================================

// Agregar nueva talla a producto existente (POST /api/admin/products/:id/sizes)
app.post('/api/admin/products/:id/sizes', async (req, res) => {
    try {
        const { password, size, stock } = req.body;
        const productId = parseInt(req.params.id);
        
        // Verificar contraseña admin
        if (password !== process.env.ADMIN_PASSWORD) {
            return res.status(401).json({ error: 'Contraseña incorrecta' });
        }
        
        // Validar ID del producto
        if (isNaN(productId) || productId <= 0) {
            return res.status(400).json({ error: 'ID de producto inválido' });
        }
        
        // Validar datos de la talla
        if (!size || size.trim() === '') {
            return res.status(400).json({ error: 'La talla es obligatoria' });
        }
        
        const stockValue = parseInt(stock) || 0;
        if (stockValue < 0) {
            return res.status(400).json({ error: 'El stock no puede ser negativo' });
        }
        
        // Verificar que el producto existe
        const [existingProduct] = await db.execute(
            'SELECT id, title FROM products WHERE id = ?',
            [productId]
        );
        
        if (existingProduct.length === 0) {
            return res.status(404).json({ error: 'Producto no encontrado' });
        }
        
        // Verificar que la talla no existe ya para este producto
        const [existingSize] = await db.execute(
            'SELECT id FROM product_sizes WHERE product_id = ? AND size = ?',
            [productId, size.trim()]
        );
        
        if (existingSize.length > 0) {
            return res.status(400).json({ error: `La talla ${size} ya existe para este producto` });
        }
        
        // Insertar nueva talla
        const [insertResult] = await db.execute(
            'INSERT INTO product_sizes (product_id, size, stock) VALUES (?, ?, ?)',
            [productId, size.trim(), stockValue]
        );
        
        if (insertResult.affectedRows === 0) {
            return res.status(500).json({ error: 'No se pudo agregar la talla' });
        }
        
        // Emitir actualización vía socket
        io.emit('products_updated', await getAllProducts());
        
        console.log(`➕ Nueva talla agregada: ${size} para producto ID ${productId} (${existingProduct[0].title})`);
        
        res.json({ 
            message: 'Talla agregada exitosamente',
            productId: productId,
            productTitle: existingProduct[0].title,
            size: size.trim(),
            stock: stockValue
        });
        
    } catch (error) {
        console.error('Error agregando talla:', error);
        res.status(500).json({ 
            error: error.message || 'Error interno del servidor' 
        });
    }
});

// Eliminar talla específica (DELETE /api/admin/products/:productId/sizes/:size)
app.delete('/api/admin/products/:productId/sizes/:size', async (req, res) => {
    try {
        const { password } = req.body;
        const productId = parseInt(req.params.productId);
        const size = req.params.size;
        
        // Verificar contraseña admin
        if (password !== process.env.ADMIN_PASSWORD) {
            return res.status(401).json({ error: 'Contraseña incorrecta' });
        }
        
        // Validar ID del producto
        if (isNaN(productId) || productId <= 0) {
            return res.status(400).json({ error: 'ID de producto inválido' });
        }
        
        // Validar talla
        if (!size || size.trim() === '') {
            return res.status(400).json({ error: 'Talla no válida' });
        }
        
        // Verificar que existe la combinación producto-talla
        const [existingSize] = await db.execute(
            'SELECT id FROM product_sizes WHERE product_id = ? AND size = ?',
            [productId, size]
        );
        
        if (existingSize.length === 0) {
            return res.status(404).json({ error: 'Talla no encontrada para este producto' });
        }
        
        // Verificar que no es la última talla del producto
        const [totalSizes] = await db.execute(
            'SELECT COUNT(*) as count FROM product_sizes WHERE product_id = ?',
            [productId]
        );
        
        if (totalSizes[0].count <= 1) {
            return res.status(400).json({ error: 'No se puede eliminar la última talla del producto. Un producto debe tener al menos una talla.' });
        }
        
        // Obtener info del producto para logging
        const [productInfo] = await db.execute(
            'SELECT title FROM products WHERE id = ?',
            [productId]
        );
        
        // Eliminar talla
        const [deleteResult] = await db.execute(
            'DELETE FROM product_sizes WHERE product_id = ? AND size = ?',
            [productId, size]
        );
        
        if (deleteResult.affectedRows === 0) {
            return res.status(404).json({ error: 'No se pudo eliminar la talla' });
        }
        
        // Emitir actualización vía socket
        io.emit('products_updated', await getAllProducts());
        
        const productTitle = productInfo[0]?.title || 'Producto desconocido';
        console.log(`🗑️ Talla eliminada: ${size} del producto "${productTitle}" (ID: ${productId})`);
        
        res.json({ 
            message: 'Talla eliminada exitosamente',
            productId: productId,
            productTitle: productTitle,
            size: size
        });
        
    } catch (error) {
        console.error('Error eliminando talla:', error);
        res.status(500).json({ 
            error: error.message || 'Error interno del servidor' 
        });
    }
});

// Actualizar stock de talla específica (PUT /api/admin/products/:productId/sizes/:size)
app.put('/api/admin/products/:productId/sizes/:size', async (req, res) => {
    try {
        const { password, stock } = req.body;
        const productId = parseInt(req.params.productId);
        const size = req.params.size;
        
        // Verificar contraseña admin
        if (password !== process.env.ADMIN_PASSWORD) {
            return res.status(401).json({ error: 'Contraseña incorrecta' });
        }
        
        // Validar ID del producto
        if (isNaN(productId) || productId <= 0) {
            return res.status(400).json({ error: 'ID de producto inválido' });
        }
        
        // Validar talla
        if (!size || size.trim() === '') {
            return res.status(400).json({ error: 'Talla no válida' });
        }
        
        // Validar stock
        const stockValue = parseInt(stock);
        if (isNaN(stockValue) || stockValue < 0) {
            return res.status(400).json({ error: 'Stock debe ser un número mayor o igual a 0' });
        }
        
        // Verificar que existe la combinación producto-talla
        const [existingSize] = await db.execute(
            'SELECT id, stock FROM product_sizes WHERE product_id = ? AND size = ?',
            [productId, size]
        );
        
        if (existingSize.length === 0) {
            return res.status(404).json({ error: 'Talla no encontrada para este producto' });
        }
        
        const oldStock = existingSize[0].stock;
        
        // Actualizar stock
        const [updateResult] = await db.execute(
            'UPDATE product_sizes SET stock = ?, updated_at = CURRENT_TIMESTAMP WHERE product_id = ? AND size = ?',
            [stockValue, productId, size]
        );
        
        if (updateResult.affectedRows === 0) {
            return res.status(404).json({ error: 'No se pudo actualizar el stock' });
        }
        
        // Emitir actualización vía socket
        io.emit('stock_updated', await getAllProducts());
        
        // Obtener info del producto para logging
        const [productInfo] = await db.execute(
            'SELECT title FROM products WHERE id = ?',
            [productId]
        );
        
        const productTitle = productInfo[0]?.title || 'Producto desconocido';
        console.log(`📦 Stock actualizado: "${productTitle}" talla ${size}: ${oldStock} → ${stockValue}`);
        
        res.json({ 
            message: 'Stock actualizado exitosamente',
            productId: productId,
            productTitle: productTitle,
            size: size,
            oldStock: oldStock,
            newStock: stockValue
        });
        
    } catch (error) {
        console.error('Error actualizando stock:', error);
        res.status(500).json({ 
            error: error.message || 'Error interno del servidor' 
        });
    }
});

// Obtener estadísticas del inventario (GET /api/admin/stats)
app.get('/api/admin/stats', async (req, res) => {
    try {
        // Stats generales
        const [productCount] = await db.execute('SELECT COUNT(*) as total FROM products');
        const [totalStock] = await db.execute('SELECT SUM(stock) as total FROM product_sizes');
        const [outOfStock] = await db.execute('SELECT COUNT(*) as total FROM product_sizes WHERE stock = 0');
        const [lowStock] = await db.execute('SELECT COUNT(*) as total FROM product_sizes WHERE stock > 0 AND stock < 5');
        
        // Productos más vendidos (menos stock)
        const [topProducts] = await db.execute(`
            SELECT 
                p.title,
                p.brand,
                SUM(ps.stock) as total_stock,
                COUNT(ps.id) as total_sizes
            FROM products p
            LEFT JOIN product_sizes ps ON p.id = ps.product_id
            GROUP BY p.id
            ORDER BY total_stock ASC
            LIMIT 5
        `);
        
        // Stock por marca
        const [stockByBrand] = await db.execute(`
            SELECT 
                p.brand,
                SUM(ps.stock) as total_stock,
                COUNT(DISTINCT p.id) as products_count
            FROM products p
            LEFT JOIN product_sizes ps ON p.id = ps.product_id
            GROUP BY p.brand
            ORDER BY total_stock DESC
        `);
        
        res.json({
            general: {
                totalProducts: productCount[0].total,
                totalStock: totalStock[0].total || 0,
                outOfStockSizes: outOfStock[0].total,
                lowStockSizes: lowStock[0].total
            },
            topProducts: topProducts,
            stockByBrand: stockByBrand
        });
        
    } catch (error) {
        console.error('Error obteniendo estadísticas:', error);
        res.status(500).json({ 
            error: error.message || 'Error interno del servidor' 
        });
    }
});

startServer().catch(console.error);

module.exports = { app, server, io };