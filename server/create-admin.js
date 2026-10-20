
import dotenv from "dotenv";
import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";

dotenv.config();

async function createAdmin() {
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;

  if (!username || !password || password.length < 12) {
    throw new Error(
      "Set ADMIN_USERNAME and an ADMIN_PASSWORD of at least 12 characters in .env."
    );
  }

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || "coaching_db"
  });

  try {
    const passwordHash = await bcrypt.hash(password, 12);

    const [result] = await connection.execute(
      `INSERT IGNORE INTO admins (username, password_hash)
       VALUES (?, ?)`,
      [username, passwordHash]
    );

    if (result.affectedRows === 1) {
      console.log(`Admin account created for "${username}".`);
    } else {
      console.log(
        `Admin "${username}" already exists; its password was not changed.`
      );
    }
  } finally {
    await connection.end();
  }
}

createAdmin().catch((error) => {
  console.error("Could not create admin:", error.message);
  process.exitCode = 1;
});
