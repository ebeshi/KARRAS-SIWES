import mysql from 'mysql2/promise'
import fs from 'fs'

const dbConfig = {
  host: process.env.MYSQL_HOST || '127.0.0.1',
  port: parseInt(process.env.MYSQL_PORT || '3306', 10),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'virtual_lab',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
}

// Support XAMPP Linux socket if available
if (process.env.MYSQL_SOCKET) {
  dbConfig.socketPath = process.env.MYSQL_SOCKET
} else if (fs.existsSync('/opt/lampp/var/mysql/mysql.sock')) {
  dbConfig.socketPath = '/opt/lampp/var/mysql/mysql.sock'
}

export const pool = mysql.createPool(dbConfig)

// Helper query function
export async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params)
  return rows
}

// Ensure the database schema.
export async function ensureSchema() {
  try {
    // 1. Create institutions table
    await query(`
      CREATE TABLE IF NOT EXISTS \`institutions\` (
        \`id\` VARCHAR(36) NOT NULL PRIMARY KEY,
        \`name\` VARCHAR(255) NOT NULL,
        \`school_code\` VARCHAR(50) NOT NULL UNIQUE,
        \`location\` VARCHAR(255) NULL,
        \`website\` VARCHAR(255) NULL,
        \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `)

    // 2. Create faculties table
    await query(`
      CREATE TABLE IF NOT EXISTS \`faculties\` (
        \`id\` VARCHAR(36) NOT NULL PRIMARY KEY,
        \`institution_id\` VARCHAR(36) NOT NULL,
        \`name\` VARCHAR(255) NOT NULL,
        \`code\` VARCHAR(50) NOT NULL,
        \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY \`uk_fac_code\` (\`institution_id\`, \`code\`),
        CONSTRAINT \`fk_fac_institution\` FOREIGN KEY (\`institution_id\`) REFERENCES \`institutions\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `)

    // 3. Create departments table
    await query(`
      CREATE TABLE IF NOT EXISTS \`departments\` (
        \`id\` VARCHAR(36) NOT NULL PRIMARY KEY,
        \`institution_id\` VARCHAR(36) NOT NULL,
        \`faculty_id\` VARCHAR(36) NOT NULL,
        \`name\` VARCHAR(255) NOT NULL,
        \`code\` VARCHAR(50) NOT NULL,
        \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY \`uk_dept_code\` (\`faculty_id\`, \`code\`),
        CONSTRAINT \`fk_dept_institution\` FOREIGN KEY (\`institution_id\`) REFERENCES \`institutions\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_dept_faculty\` FOREIGN KEY (\`faculty_id\`) REFERENCES \`faculties\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `)

    // 4. Update users table columns
    try {
      await query(`ALTER TABLE \`users\` MODIFY COLUMN \`role\` ENUM('admin', 'instructor', 'student') NOT NULL;`)
    } catch (_) {}

    const userCols = [
      { name: 'institution_id', def: 'VARCHAR(36) NULL' },
      { name: 'faculty_id', def: 'VARCHAR(36) NULL' },
      { name: 'department_id', def: 'VARCHAR(36) NULL' },
      { name: 'admission_year', def: 'INT NULL' },
      { name: 'serial_no', def: 'VARCHAR(20) NULL' },
    ]
    for (const col of userCols) {
      try {
        await query(`ALTER TABLE \`users\` ADD COLUMN \`${col.name}\` ${col.def};`)
      } catch (_) {}
    }

    try {
      await query(`ALTER TABLE \`manuals\` ADD COLUMN \`institution_id\` VARCHAR(36) NULL;`)
    } catch (_) {}

    // 5. Seed FULAFIA and Faculty of Computing if missing
    await query(`
      INSERT INTO \`institutions\` (\`id\`, \`name\`, \`school_code\`, \`location\`, \`website\`)
      VALUES ('inst-fulafia', 'Federal University of Lafia', 'FULAFIA', 'Lafia, Nasarawa State, Nigeria', 'https://fulafia.edu.ng')
      ON DUPLICATE KEY UPDATE \`name\` = VALUES(\`name\`);
    `)

    await query(`
      INSERT INTO \`faculties\` (\`id\`, \`institution_id\`, \`name\`, \`code\`)
      VALUES ('fac-fulafia-cp', 'inst-fulafia', 'Faculty of Computing', 'CP')
      ON DUPLICATE KEY UPDATE \`name\` = VALUES(\`name\`);
    `)

    await query(`
      INSERT INTO \`departments\` (\`id\`, \`institution_id\`, \`faculty_id\`, \`name\`, \`code\`)
      VALUES
      ('dept-fulafia-csc', 'inst-fulafia', 'fac-fulafia-cp', 'Computer Science', 'CSC'),
      ('dept-fulafia-ift', 'inst-fulafia', 'fac-fulafia-cp', 'Information Technology', 'IFT'),
      ('dept-fulafia-cyb', 'inst-fulafia', 'fac-fulafia-cp', 'Cybersecurity', 'CYB')
      ON DUPLICATE KEY UPDATE \`name\` = VALUES(\`name\`);
    `)

    console.log('✅ MySQL schema verified.')
  } catch (err) {
    console.warn('⚠️ Schema check note (database may not be connected yet):', err.message)
  }
}
