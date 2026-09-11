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
