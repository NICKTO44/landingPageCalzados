-- Crear base de datos
CREATE DATABASE IF NOT EXISTS shoes_store CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE shoes_store;

-- Tabla de productos
CREATE TABLE IF NOT EXISTS products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    brand VARCHAR(100) NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    image_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_brand (brand),
    INDEX idx_title (title),
    INDEX idx_price (price)
);

-- Tabla de tallas y stock
CREATE TABLE IF NOT EXISTS product_sizes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_id INT NOT NULL,
    size VARCHAR(10) NOT NULL,
    stock INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    UNIQUE KEY unique_product_size (product_id, size),
    INDEX idx_stock (stock),
    INDEX idx_size (size)
);

-- Insertar datos de ejemplo
INSERT INTO products (title, brand, price, image_url) VALUES
('Zapatos Oxford Clásicos', 'Elegance', 299.99, '/imagenes/imagen1.jpeg'),
('Sneakers Deportivos Premium', 'SportMax', 159.99, 'https://images.unsplash.com/photo-1549298916-b41d501d3772?w=900&h=600&fit=crop&crop=center'),
('Botas de Cuero Artesanales', 'CraftMaster', 449.99, 'https://images.unsplash.com/photo-1608667508764-33cf0726dde9?w=900&h=600&fit=crop&crop=center'),
('Zapatillas Casual Urbanas', 'StreetStyle', 129.99, 'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=900&h=600&fit=crop&crop=center'),
('Mocasines de Lujo', 'LuxeWear', 389.99, 'https://images.unsplash.com/photo-1582897085656-c636d006a246?w=900&h=600&fit=crop&crop=center');

-- Insertar tallas y stock para cada producto
INSERT INTO product_sizes (product_id, size, stock) VALUES
-- Zapatos Oxford Clásicos
(1, '38', 2),
(1, '39', 0),
(1, '40', 5),
(1, '41', 1),
(1, '42', 0),

-- Sneakers Deportivos Premium
(2, '36', 3),
(2, '37', 0),
(2, '38', 4),
(2, '39', 2),
(2, '40', 0),

-- Botas de Cuero Artesanales
(3, '39', 0),
(3, '40', 0),
(3, '41', 0),
(3, '42', 1),

-- Zapatillas Casual Urbanas
(4, '37', 3),
(4, '38', 5),
(4, '39', 2),
(4, '40', 4),
(4, '41', 1),

-- Mocasines de Lujo
(5, '38', 2),
(5, '39', 1),
(5, '40', 3),
(5, '41', 0),
(5, '42', 2);

-- Crear usuario para la aplicación (opcional, para mayor seguridad)
-- CREATE USER 'shoes_app'@'%' IDENTIFIED BY 'secure_password_here';
-- GRANT SELECT, INSERT, UPDATE, DELETE ON shoes_store.* TO 'shoes_app'@'%';
-- FLUSH PRIVILEGES;