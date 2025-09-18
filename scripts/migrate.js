#!/usr/bin/env node

const mysql = require('mysql2/promise');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

// Configuración de base de datos
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  port: process.env.DB_PORT || 3306,
  multipleStatements: true
};

async function runMigration() {
  let connection;
  
  try {
    console.log('🔄 Iniciando migración de base de datos...');
    
    // Conectar a MySQL (sin especificar base de datos)
    connection = await mysql.createConnection(dbConfig);
    console.log('✅ Conectado a MySQL');
    
    // Leer archivo de schema
    const schemaPath = path.join(__dirname, '..', 'schema.sql');
    const schema = await fs.readFile(schemaPath, 'utf8');
    console.log('📄 Schema SQL cargado');
    
    // Ejecutar schema
    await connection.execute(schema);
    console.log('🗄️  Base de datos y tablas creadas');
    
    // Verificar datos
    await connection.execute('USE shoes_store');
    const [products] = await connection.execute('SELECT COUNT(*) as count FROM products');
    const [sizes] = await connection.execute('SELECT COUNT(*) as count FROM product_sizes');
    
    console.log(`📦 Productos en base de datos: ${products[0].count}`);
    console.log(`👟 Tallas configuradas: ${sizes[0].count}`);
    
    console.log('✨ ¡Migración completada exitosamente!');
    
  } catch (error) {
    console.error('❌ Error durante la migración:', error.message);
    
    if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('💡 Verifica las credenciales en tu archivo .env');
    } else if (error.code === 'ECONNREFUSED') {
      console.error('💡 Asegúrate de que MySQL esté ejecutándose');
    }
    
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('🔌 Conexión cerrada');
    }
  }
}

// Función para resetear base de datos (usar con cuidado)
async function resetDatabase() {
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  return new Promise((resolve) => {
    rl.question('⚠️  ¿Estás seguro de que quieres RESETEAR la base de datos? (escribe "CONFIRMAR"): ', (answer) => {
      rl.close();
      if (answer === 'CONFIRMAR') {
        resolve(true);
      } else {
        console.log('❌ Operación cancelada');
        resolve(false);
      }
    });
  });
}

async function resetDatabaseConfirmed() {
  let connection;
  
  try {
    console.log('🔄 Reseteando base de datos...');
    
    connection = await mysql.createConnection(dbConfig);
    
    // Eliminar base de datos si existe
    await connection.execute('DROP DATABASE IF EXISTS shoes_store');
    console.log('🗑️  Base de datos eliminada');
    
    // Recrear desde schema
    const schemaPath = path.join(__dirname, '..', 'schema.sql');
    const schema = await fs.readFile(schemaPath, 'utf8');
    await connection.execute(schema);
    
    console.log('✨ Base de datos reseteada y recreada exitosamente');
    
  } catch (error) {
    console.error('❌ Error reseteando:', error.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

// Función para verificar conexión
async function testConnection() {
  let connection;
  
  try {
    console.log('🔄 Probando conexión...');
    
    connection = await mysql.createConnection(dbConfig);
    console.log('✅ Conexión exitosa');
    
    const [result] = await connection.execute('SELECT VERSION() as version');
    console.log(`🐬 MySQL Version: ${result[0].version}`);
    
    // Probar si existe la base de datos
    const [databases] = await connection.execute('SHOW DATABASES LIKE "shoes_store"');
    if (databases.length > 0) {
      console.log('🗄️  Base de datos "shoes_store" encontrada');
      
      await connection.execute('USE shoes_store');
      const [tables] = await connection.execute('SHOW TABLES');
      console.log(`📋 Tablas encontradas: ${tables.length}`);
      tables.forEach(table => {
        console.log(`   - ${Object.values(table)[0]}`);
      });
    } else {
      console.log('⚠️  Base de datos "shoes_store" no encontrada');
    }
    
  } catch (error) {
    console.error('❌ Error de conexión:', error.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

// CLI
async function main() {
  const command = process.argv[2];
  
  switch (command) {
    case 'up':
    case 'migrate':
      await runMigration();
      break;
      
    case 'reset':
      if (await resetDatabase()) {
        await resetDatabaseConfirmed();
      }
      break;
      
    case 'test':
    case 'status':
      await testConnection();
      break;
      
    default:
      console.log(`
🚀 Script de Migración - ShoesStore

Uso:
  npm run migrate [comando]
  node scripts/migrate.js [comando]

Comandos disponibles:
  migrate, up    - Ejecutar migración (crear BD y tablas)
  reset          - Resetear base de datos completamente (¡CUIDADO!)
  test, status   - Probar conexión y mostrar estado
  
Ejemplos:
  npm run migrate
  node scripts/migrate.js reset
  node scripts/migrate.js test

Variables de entorno necesarias (.env):
  DB_HOST=localhost
  DB_USER=root
  DB_PASSWORD=tu_password
  DB_NAME=shoes_store
  DB_PORT=3306
`);
      break;
  }
}

// Ejecutar si es llamado directamente
if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  runMigration,
  testConnection,
  resetDatabase: resetDatabaseConfirmed
};