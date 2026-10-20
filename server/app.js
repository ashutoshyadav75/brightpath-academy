
import express from "express";
import mysql from "mysql2/promise";
import dotenv from "dotenv";
import session from "express-session";
import MySQLStoreFactory from "express-mysql-session";
import bcrypt from "bcryptjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

dotenv.config();

if (!process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET must be configured in .env");
}

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDirectory = path.join(__dirname, "..", "public");

const dbConfig = {
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || "coaching_db"
};

const pool = mysql.createPool({
  ...dbConfig,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

const MySQLStore = MySQLStoreFactory(session);
const sessionStore = new MySQLStore({
  ...dbConfig,
  clearExpired: true,
  checkExpirationInterval: 15 * 60 * 1000,
  expiration: 24 * 60 * 60 * 1000
});

app.use(express.json({ limit: "10kb" }));
app.use(express.static(publicDirectory));

app.use(session({
  name: "brightpath.sid",
  secret: process.env.SESSION_SECRET,
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    maxAge: 24 * 60 * 60 * 1000
  }
}));

function requireAdmin(req, res, next) {
  if (!req.session?.admin) {
    return res.status(401).json({
      message: "Please log in as an administrator."
    });
  }

  next();
}

function requireStudent(req, res, next) {
  if (!req.session?.student) {
    return res.status(401).json({
      message: "Please log in as a student."
    });
  }

  next();
}

app.get("/api/health", async (req, res) => {
  try {
    await pool.execute("SELECT 1");
    res.json({
      status: "ok",
      database: "connected",
      databaseType: "MySQL"
    });
  } catch (error) {
    console.error("Health check failed:", error.message);
    res.status(503).json({
      status: "error",
      message: "Database connection unavailable"
    });
  }
});

// Existing public admission form endpoint.
app.post("/api/admissions", async (req, res) => {
  const { studentName, phone, course, mode } = req.body ?? {};

  const validCourses = [
    "School Foundation",
    "Exam Preparation",
    "Online Courses"
  ];
  const validModes = ["Offline", "Online", "Hybrid"];

  if (
    typeof studentName !== "string" ||
    typeof phone !== "string" ||
    typeof course !== "string" ||
    typeof mode !== "string"
  ) {
    return res.status(400).json({
      message: "Please provide all required fields."
    });
  }

  const cleanName = studentName.trim();
  const cleanPhone = phone.trim();

  if (
    cleanName.length < 2 ||
    cleanName.length > 100 ||
    !/^[6-9]\d{9}$/.test(cleanPhone) ||
    !validCourses.includes(course) ||
    !validModes.includes(mode)
  ) {
    return res.status(400).json({
      message: "Please check your name, phone, course and learning mode."
    });
  }

  try {
    const [result] = await pool.execute(
      `INSERT INTO admissions
       (student_name, phone, course, learning_mode)
       VALUES (?, ?, ?, ?)`,
      [cleanName, cleanPhone, course, mode]
    );

    res.status(201).json({
      message: "Admission enquiry submitted successfully.",
      enquiry: {
        id: result.insertId,
        studentName: cleanName,
        course,
        learningMode: mode
      }
    });
  } catch (error) {
    console.error("Admission insert failed:", error.message);
    res.status(500).json({
      message: "Unable to save your enquiry. Please try again later."
    });
  }
});

// Admin login.
app.post("/api/admin/login", async (req, res) => {
  const { username, password } = req.body ?? {};

  if (
    typeof username !== "string" ||
    typeof password !== "string" ||
    !username.trim() ||
    !password
  ) {
    return res.status(400).json({
      message: "Enter your username and password."
    });
  }

  try {
    const [rows] = await pool.execute(
      `SELECT id, username, password_hash
       FROM admins WHERE username = ? LIMIT 1`,
      [username.trim()]
    );

    const admin = rows[0];

    if (!admin || !(await bcrypt.compare(password, admin.password_hash))) {
      return res.status(401).json({
        message: "Invalid username or password."
      });
    }

    // Regenerate the session after login to help prevent session fixation.
    await new Promise((resolve, reject) => {
      req.session.regenerate((error) =>
        error ? reject(error) : resolve()
      );
    });

    req.session.admin = {
      id: admin.id,
      username: admin.username
    };

    await new Promise((resolve, reject) => {
      req.session.save((error) =>
        error ? reject(error) : resolve()
      );
    });

    res.json({
      message: "Login successful.",
      username: admin.username
    });
  } catch (error) {
    console.error("Admin login failed:", error.message);
    res.status(500).json({
      message: "Unable to log in right now."
    });
  }
});

// Check the current login session.
app.get("/api/admin/me", (req, res) => {
  if (!req.session?.admin) {
    return res.status(401).json({
      message: "Not logged in."
    });
  }

  res.json({
    username: req.session.admin.username
  });
});

// Protected: return admission enquiries only to logged-in admins.

app.get("/api/admin/admissions", requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT
         id,
         student_name,
         phone,
         course,
         learning_mode,
         status,
         created_at
       FROM admissions
       ORDER BY id DESC
       LIMIT 500`
    );

    res.json({ admissions: rows });
  } catch (error) {
    console.error("Could not load admissions:", error.message);
    res.status(500).json({
      message: "Unable to load admission enquiries."
    });
  }
});

// Update the status of an admission enquiry.
app.patch(
  "/api/admin/admissions/:id/status",
  requireAdmin,
  async (req, res) => {
    const id = Number(req.params.id);
    const { status } = req.body ?? {};

    const validStatuses = [
      "New",
      "Contacted",
      "Enrolled",
      "Rejected"
    ];

    if (
      !Number.isSafeInteger(id) ||
      id < 1 ||
      !validStatuses.includes(status)
    ) {
      return res.status(400).json({
        message: "Invalid enquiry ID or status."
      });
    }

    try {
      const [result] = await pool.execute(
        "UPDATE admissions SET status = ? WHERE id = ?",
        [status, id]
      );

      if (result.affectedRows === 0) {
        const [rows] = await pool.execute(
          "SELECT id FROM admissions WHERE id = ?",
          [id]
        );

        if (rows.length === 0) {
          return res.status(404).json({
            message: "Admission enquiry not found."
          });
        }
      }

      res.json({
        message: "Admission status updated successfully.",
        id,
        status
      });
    } catch (error) {
      console.error("Status update failed:", error.message);
      res.status(500).json({
        message: "Unable to update admission status."
      });
    }
  }
);



const validStudentModes = ["Offline", "Online", "Hybrid"];
const validStudentCourses = [
  "School Foundation",
  "Exam Preparation",
  "Online Courses"
];


 // Student login.
app.post("/api/student/login", async (req, res) => {
  const { studentId, password } = req.body ?? {};
  const id = Number(studentId);

  
  if (
    !Number.isSafeInteger(id) ||
    id < 1 ||
    typeof password !== "string" ||
    password.length < 1 ||
    password.length > 128
  ) {
    return res.status(400).json({
      message: "Enter a valid Student ID and password."
    });
  }

  try {
    const [rows] = await pool.execute(
      `SELECT id, student_name, password_hash
       FROM students
       WHERE id = ?
       LIMIT 1`,
      [id]
    );

    const student = rows[0];

    if (
      !student ||
      !student.password_hash ||
      !(await bcrypt.compare(password, student.password_hash))
    ) {
      return res.status(401).json({
        message: "Invalid Student ID or password."
      });
    }

    await new Promise((resolve, reject) => {
      req.session.regenerate((error) =>
        error ? reject(error) : resolve()
      );
    });

    req.session.student = {
      id: student.id,
      studentName: student.student_name
    };

    await new Promise((resolve, reject) => {
      req.session.save((error) =>
        error ? reject(error) : resolve()
      );
    });

    return res.json({
      message: "Student login successful.",
      student: {
        id: student.id,
        studentName: student.student_name
      }
    });
  } catch (error) {
    console.error("Student login failed:", error.message);

    return res.status(500).json({
      message: "Unable to log in right now."
    });
  }
});



app.post("/api/student/logout", requireStudent, (req, res) => {
  req.session.destroy((error) => {
    if (error) {
      console.error("Student logout failed:", error.message);
      return res.status(500).json({
        message: "Unable to log out right now."
      });
    }

    res.clearCookie("connect.sid");
    return res.json({ message: "Logged out successfully." });
  });
});

// Get the currently logged-in student's own details.
app.get("/api/student/me", requireStudent, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT id, student_name, phone, course,
              learning_mode, created_at
       FROM students
       WHERE id = ?
       LIMIT 1`,
      [req.session.student.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        message: "Student account not found."
      });
    }

    return res.json({ student: rows[0] });
  } catch (error) {
    console.error("Student profile lookup failed:", error.message);

    return res.status(500).json({
      message: "Unable to load student profile."
    });
  }
});


/* Get only the logged-in student's own fee details. */
app.get("/api/student/fees", requireStudent, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT total_fee, amount_paid, due_date, notes
       FROM student_fees
       WHERE student_id = ?
       ORDER BY id DESC
       LIMIT 1`,
      [req.session.student.id]
    );

    if (rows.length === 0) {
      return res.json({ fee: null });
    }

    const record = rows[0];

    return res.json({
      fee: {
        totalFee: Number(record.total_fee),
        amountPaid: Number(record.amount_paid),
        balance: Number(record.total_fee) - Number(record.amount_paid),
        dueDate: record.due_date,
        notes: record.notes
      }
    });
  } catch (error) {
    console.error("Student fee lookup failed:", error.message);

    return res.status(500).json({
      message: "Unable to load student fee details."
    });
  }
});

// Get all registered students (admin only).
app.get("/api/admin/students", requireAdmin, async (req, res) => {
  try {
    const [students] = await pool.execute(
      `SELECT id, admission_id, student_name, phone,
              course, learning_mode, created_at
       FROM students
       ORDER BY id DESC
       LIMIT 500`
    );

    res.json({ students });
  } catch (error) {
    console.error("Could not load students:", error.message);
    res.status(500).json({
      message: "Unable to load students."
    });
  }
});


/* Admin: Get all classes */
app.get("/api/admin/classes", requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT id, course, class_title, description,
              class_type, class_link, scheduled_at, created_at
       FROM classes
       ORDER BY created_at DESC`
    );

    res.json({ classes: rows });
  } catch (error) {
    console.error("Load classes failed:", error.message);
    res.status(500).json({
      message: "Unable to load classes."
    });
  }
});

/* Admin: Add a class */
app.post("/api/admin/classes", requireAdmin, async (req, res) => {
  try {
    const {
      course,
      classTitle,
      description,
      classType,
      classLink,
      scheduledAt
    } = req.body;

    if (
      typeof course !== "string" ||
      !course.trim() ||
      typeof classTitle !== "string" ||
      !classTitle.trim()
    ) {
      return res.status(400).json({
        message: "Course and class title are required."
      });
    }

    if (!["Live", "Recorded"].includes(classType)) {
      return res.status(400).json({
        message: "Class type must be Live or Recorded."
      });
    }

    const link = classLink?.trim() || null;

    if (link) {
      try {
        const parsedUrl = new URL(link);

        if (!["http:", "https:"].includes(parsedUrl.protocol)) {
          throw new Error("Invalid protocol");
        }
      } catch {
        return res.status(400).json({
          message: "Please enter a valid HTTP or HTTPS class link."
        });
      }
    }

    const [result] = await pool.execute(
      `INSERT INTO classes
       (course, class_title, description, class_type,
        class_link, scheduled_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        course.trim(),
        classTitle.trim(),
        typeof description === "string"
          ? description.trim() || null
          : null,
        classType,
        link,
        scheduledAt || null
      ]
    );

    res.status(201).json({
      message: "Class added successfully.",
      classId: result.insertId
    });
  } catch (error) {
    console.error("Add class failed:", error.message);
    res.status(500).json({
      message: "Unable to add class."
    });
  }
});


// Register a student (admin only).


 // Register a student (admin only).
app.post("/api/admin/students", requireAdmin, async (req, res) => {
  const {
    studentName,
    phone,
    course,
    mode,
    admissionId,
    password
  } = req.body ?? {};

  const cleanName =
    typeof studentName === "string" ? studentName.trim() : "";
  const cleanPhone =
    typeof phone === "string" ? phone.trim() : "";

  if (
    cleanName.length < 2 ||
    cleanName.length > 100 ||
    !/^[6-9]\d{9}$/.test(cleanPhone) ||
    !validStudentCourses.includes(course) ||
    !validStudentModes.includes(mode) ||
    typeof password !== "string" ||
    password.length < 12 ||
    password.length > 128
  ) {
    return res.status(400).json({
      message:
        "Enter valid student details and a password between 12 and 128 characters."
    });
  }

  let cleanAdmissionId = null;

  if (admissionId !== undefined && admissionId !== null &&
      admissionId !== "") {
    cleanAdmissionId = Number(admissionId);

    if (
      !Number.isSafeInteger(cleanAdmissionId) ||
      cleanAdmissionId < 1
    ) {
      return res.status(400).json({
        message: "Invalid admission ID."
      });
    }

    try {
      const [admissions] = await pool.execute(
        "SELECT id FROM admissions WHERE id = ?",
        [cleanAdmissionId]
      );

      if (admissions.length === 0) {
        return res.status(404).json({
          message: "Admission enquiry not found."
        });
      }
    } catch (error) {
      console.error("Admission lookup failed:", error.message);
      return res.status(500).json({
        message: "Unable to verify admission enquiry."
      });
    }
  }

  try {
    // Hash the password before saving it.
    const passwordHash = await bcrypt.hash(password, 12);

    const [result] = await pool.execute(
      `INSERT INTO students
       (admission_id, student_name, phone, course,
        learning_mode, password_hash)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        cleanAdmissionId,
        cleanName,
        cleanPhone,
        course,
        mode,
        passwordHash
      ]
    );

    return res.status(201).json({
      message: "Student registered successfully.",
      student: {
        id: result.insertId,
        studentName: cleanName,
        phone: cleanPhone,
        course,
        learningMode: mode
      }
    });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        message: "This admission enquiry is already linked to a student."
      });
    }

    console.error("Student registration failed:", error.message);
    return res.status(500).json({
      message: "Unable to register student."
    });
  }
});


 
/* Create a fee record for a student (admin only). */
app.post("/api/admin/student-fees", requireAdmin, async (req, res) => {
  const { studentId, totalFee, amountPaid = 0, dueDate = null, notes = null } =
    req.body ?? {};

  const id = Number(studentId);
  const total = Number(totalFee);
  const paid = Number(amountPaid);

  if (
    !Number.isSafeInteger(id) ||
    id < 1 ||
    !Number.isFinite(total) ||
    total <= 0 ||
    !Number.isFinite(paid) ||
    paid < 0 ||
    paid > total ||
    (dueDate !== null &&
      (typeof dueDate !== "string" ||
       !/^\d{4}-\d{2}-\d{2}$/.test(dueDate))) ||
    (notes !== null &&
      (typeof notes !== "string" || notes.length > 255))
  ) {
    return res.status(400).json({
      message: "Enter valid student fee details."
    });
  }

  try {
    const [students] = await pool.execute(
      "SELECT id FROM students WHERE id = ? LIMIT 1",
      [id]
    );

    if (students.length === 0) {
      return res.status(404).json({
        message: "Student not found."
      });
    }

    const [result] = await pool.execute(
      `INSERT INTO student_fees
       (student_id, total_fee, amount_paid, due_date, notes)
       VALUES (?, ?, ?, ?, ?)`,
      [id, total.toFixed(2), paid.toFixed(2), dueDate, notes]
    );

    return res.status(201).json({
      message: "Student fee record created successfully.",
      fee: {
        id: result.insertId,
        studentId: id,
        totalFee: total.toFixed(2),
        amountPaid: paid.toFixed(2),
        balanceDue: (total - paid).toFixed(2),
        dueDate,
        notes
      }
    });
  } catch (error) {
    console.error("Fee record creation failed:", error.message);
    return res.status(500).json({
      message: "Unable to create fee record."
    });
  }
});

/* List fee records (admin only). */
app.get("/api/admin/student-fees", requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT
         f.id,
         f.student_id,
         s.student_name,
         s.phone,
         s.course,
         f.total_fee,
         f.amount_paid,
         (f.total_fee - f.amount_paid) AS balance_due,
         f.due_date,
         f.notes,
         f.created_at
       FROM student_fees f
       JOIN students s ON s.id = f.student_id
       ORDER BY f.created_at DESC`
    );

    return res.json({ fees: rows });
  } catch (error) {
    console.error("Fee records lookup failed:", error.message);
    return res.status(500).json({
      message: "Unable to load fee records."
    });
  }
});


// Admin logout.
app.post("/api/admin/logout", requireAdmin, (req, res) => {
  req.session.destroy((error) => {
    if (error) {
      console.error("Logout failed:", error.message);
      return res.status(500).json({
        message: "Unable to log out."
      });
    }

    res.clearCookie("brightpath.sid", {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production"
    });

    res.json({ message: "Logged out successfully." });
  });
});

const PORT = Number(process.env.PORT) || 3000;

try {
  await pool.execute("SELECT 1");
  app.listen(PORT, () => {
    console.log(`Website running at http://localhost:${PORT}`);
    console.log("MySQL connection successful.");
  });
} catch (error) {
  console.error("Could not connect to MySQL:", error.message);
  process.exitCode = 1;
}
