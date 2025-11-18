// server.js
const express = require("express");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const app = express();
const PORT = 3000;

// middlewares
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ================== BBDD ==================
const db = new sqlite3.Database("./gimnasio.db");

db.serialize(() => {
  // Usuarios: profesor/admin y alumnos
  db.run(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      rol TEXT NOT NULL DEFAULT 'alumno' -- 'profesor' o 'alumno'
    )
  `);

  // Clases (tipo de clase, asociada a un profesor)
  db.run(`
    CREATE TABLE IF NOT EXISTS clases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      descripcion TEXT,
      profesor_id INTEGER NOT NULL,
      FOREIGN KEY(profesor_id) REFERENCES usuarios(id)
    )
  `);

  // Horarios concretos de una clase
  db.run(`
    CREATE TABLE IF NOT EXISTS horarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      clase_id INTEGER NOT NULL,
      fecha TEXT NOT NULL,       -- YYYY-MM-DD
      hora_inicio TEXT NOT NULL, -- HH:MM
      hora_fin TEXT NOT NULL,    -- HH:MM
      cupos INTEGER NOT NULL,
      FOREIGN KEY(clase_id) REFERENCES clases(id)
    )
  `);

  // Reservas de los alumnos
  db.run(`
    CREATE TABLE IF NOT EXISTS reservas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER NOT NULL,
      horario_id INTEGER NOT NULL,
      estado TEXT NOT NULL DEFAULT 'activa',
      FOREIGN KEY(usuario_id) REFERENCES usuarios(id),
      FOREIGN KEY(horario_id) REFERENCES horarios(id)
    )
  `);

  // ----- Datos de ejemplo -----
  db.get(`SELECT COUNT(*) AS count FROM usuarios`, (err, row) => {
    if (err) {
      console.error("Error contando usuarios:", err);
      return;
    }
    if (row.count === 0) {
      db.run(
        `INSERT INTO usuarios (nombre, email, password, rol)
         VALUES ('Sebastian', 'profesor@gym.cl', '1234', 'profesor')`
      );
      db.run(
        `INSERT INTO usuarios (nombre, email, password, rol)
         VALUES ('Alumno Demo', 'alumno@gym.cl', '1234', 'alumno')`
      );
      console.log("Usuario profesor y alumno demo creados.");
    }
  });

  db.get(`SELECT COUNT(*) AS count FROM horarios`, (err, row) => {
    if (err) return console.error(err);
    if (row.count === 0) {
      db.get(
        `SELECT id FROM usuarios WHERE email = 'profesor@gym.cl'`,
        (err2, profRow) => {
          if (err2 || !profRow) return;
          const profesorId = profRow.id;

          db.run(
            `INSERT INTO clases (nombre, descripcion, profesor_id)
             VALUES ('Pilates', 'Clase de pilates de prueba', ?)`,
            [profesorId],
            function (err3) {
              if (err3) return console.error(err3);
              const claseId = this.lastID;

              const stmt = db.prepare(`
                INSERT INTO horarios (clase_id, fecha, hora_inicio, hora_fin, cupos)
                VALUES (?, ?, ?, ?, ?)
              `);

              stmt.run(claseId, "2025-11-18", "14:00", "15:00", 10);
              stmt.run(claseId, "2025-11-18", "15:00", "16:00", 10);
              stmt.finalize();

              console.log("Clase y horarios de ejemplo creados.");
            }
          );
        }
      );
    }
  });
});

// ================== HELPERS ==================

function getDisponibilidadHorario(horarioId, callback) {
  const sql = `
    SELECT h.cupos, COUNT(r.id) AS reservados
    FROM horarios h
    LEFT JOIN reservas r
      ON r.horario_id = h.id AND r.estado = 'activa'
    WHERE h.id = ?
    GROUP BY h.cupos
  `;
  db.get(sql, [horarioId], (err, row) => {
    if (err) return callback(err);
    if (!row) return callback(null, { cupos: 0, reservados: 0, disponibles: 0 });
    const disponibles = row.cupos - row.reservados;
    callback(null, {
      cupos: row.cupos,
      reservados: row.reservados,
      disponibles
    });
  });
}

// ================== AUTH ==================

app.post("/api/register", (req, res) => {
  const { nombre, email, password } = req.body;
  if (!nombre || !email || !password) {
    return res.json({ success: false, message: "Faltan datos" });
  }

  const sql = `
    INSERT INTO usuarios (nombre, email, password, rol)
    VALUES (?, ?, ?, 'alumno')
  `;
  db.run(sql, [nombre, email, password], function (err) {
    if (err) {
      if (err.message.includes("UNIQUE")) {
        return res.json({ success: false, message: "El email ya está registrado." });
      }
      console.error(err);
      return res.json({ success: false, message: "Error al registrar usuario." });
    }
    res.json({
      success: true,
      user: { id: this.lastID, nombre, email, rol: "alumno" }
    });
  });
});

app.post("/api/login", (req, res) => {
  const { email, password } = req.body;
  const sql = `SELECT id, nombre, email, rol FROM usuarios WHERE email = ? AND password = ?`;
  db.get(sql, [email, password], (err, row) => {
    if (err) {
      console.error(err);
      return res.json({ success: false, message: "Error en el login." });
    }
    if (!row) {
      return res.json({ success: false, message: "Credenciales incorrectas." });
    }
    res.json({ success: true, user: row });
  });
});

// ================== HORARIOS (Alumno) ==================

app.get("/api/horarios", (req, res) => {
  const { claseId } = req.query;

  let params = [];
  let where = `WHERE date(h.fecha) >= date('now')`;

  if (claseId) {
    where += " AND h.clase_id = ?";
    params.push(claseId);
  }

  const sql = `
    SELECT
      h.id,
      h.fecha,
      h.hora_inicio,
      h.hora_fin,
      h.cupos,
      c.nombre AS clase,
      c.id AS clase_id,
      u.nombre AS profesor,
      COUNT(r.id) AS reservados
    FROM horarios h
    JOIN clases c ON c.id = h.clase_id
    JOIN usuarios u ON u.id = c.profesor_id
    LEFT JOIN reservas r
      ON r.horario_id = h.id AND r.estado = 'activa'
    ${where}
    GROUP BY h.id
    ORDER BY h.fecha, h.hora_inicio
  `;

  db.all(sql, params, (err, rows) => {
    if (err) {
      console.error(err);
      return res.json({ success: false, message: "Error al obtener horarios." });
    }

    const data = rows.map(r => ({
      id: r.id,
      fecha: r.fecha,
      hora_inicio: r.hora_inicio,
      hora_fin: r.hora_fin,
      cupos: r.cupos,
      reservados: r.reservados,
      disponibles: r.cupos - r.reservados,
      clase: r.clase,
      clase_id: r.clase_id,
      profesor: r.profesor
    }));

    res.json({ success: true, horarios: data });
  });
});

// Crear reserva
app.post("/api/reservas", (req, res) => {
  const { usuarioId, horarioId } = req.body;
  if (!usuarioId || !horarioId) {
    return res.json({ success: false, message: "Datos incompletos." });
  }

  getDisponibilidadHorario(horarioId, (err, info) => {
    if (err) {
      console.error(err);
      return res.json({ success: false, message: "Error al verificar cupos." });
    }

    if (info.disponibles <= 0) {
      return res.json({
        success: false,
        message: "No quedan cupos disponibles en este horario."
      });
    }

    const sql = `
      INSERT INTO reservas (usuario_id, horario_id, estado)
      VALUES (?, ?, 'activa')
    `;
    db.run(sql, [usuarioId, horarioId], function (err2) {
      if (err2) {
        console.error(err2);
        return res.json({ success: false, message: "Error al registrar reserva." });
      }
      res.json({ success: true, reservaId: this.lastID });
    });
  });
});

// Reservas de un usuario
app.get("/api/reservas/:usuarioId", (req, res) => {
  const { usuarioId } = req.params;

  const sql = `
    SELECT
      r.id,
      r.estado,
      h.fecha,
      h.hora_inicio,
      h.hora_fin,
      h.id AS horario_id,
      c.nombre AS clase,
      c.id AS clase_id,
      u.nombre AS profesor
    FROM reservas r
    JOIN horarios h ON h.id = r.horario_id
    JOIN clases c ON c.id = h.clase_id
    JOIN usuarios u ON u.id = c.profesor_id
    WHERE r.usuario_id = ?
    ORDER BY h.fecha, h.hora_inicio
  `;

  db.all(sql, [usuarioId], (err, rows) => {
    if (err) {
      console.error(err);
      return res.json({ success: false, message: "Error al obtener reservas." });
    }
    res.json({ success: true, reservas: rows });
  });
});

// Cancelar reserva
app.delete("/api/reservas/:id", (req, res) => {
  const { id } = req.params;
  db.run(`DELETE FROM reservas WHERE id = ?`, [id], function (err) {
    if (err) {
      console.error(err);
      return res.json({ success: false, message: "Error al cancelar reserva." });
    }
    if (this.changes === 0) {
      return res.json({ success: false, message: "Reserva no encontrada." });
    }
    res.json({ success: true });
  });
});

// Cambiar hora de una reserva
app.put("/api/reservas/:id", (req, res) => {
  const { id } = req.params;
  const { nuevoHorarioId } = req.body;
  if (!nuevoHorarioId) {
    return res.json({ success: false, message: "Falta el nuevo horario." });
  }

  getDisponibilidadHorario(nuevoHorarioId, (err, info) => {
    if (err) {
      console.error(err);
      return res.json({ success: false, message: "Error al verificar cupos." });
    }
    if (info.disponibles <= 0) {
      return res.json({
        success: false,
        message: "No quedan cupos en el nuevo horario."
      });
    }

    db.run(
      `UPDATE reservas SET horario_id = ? WHERE id = ?`,
      [nuevoHorarioId, id],
      function (err2) {
        if (err2) {
          console.error(err2);
          return res.json({ success: false, message: "Error al cambiar la hora." });
        }
        if (this.changes === 0) {
          return res.json({ success: false, message: "Reserva no encontrada." });
        }
        res.json({ success: true });
      }
    );
  });
});

// ================== PROFESOR ==================

app.post("/api/admin/horarios", (req, res) => {
  const {
    profesorId,
    nombreClase,
    descripcion,
    fecha,
    horaInicio,
    horaFin,
    cupos
  } = req.body;

  if (!profesorId || !nombreClase || !fecha || !horaInicio || !horaFin || !cupos) {
    return res.json({ success: false, message: "Faltan datos para crear horario." });
  }

  const sqlClase = `
    SELECT id FROM clases
    WHERE nombre = ? AND profesor_id = ?
  `;
  db.get(sqlClase, [nombreClase, profesorId], (err, row) => {
    if (err) {
      console.error(err);
      return res.json({ success: false, message: "Error al buscar clase." });
    }

    const insertarHorario = (claseId) => {
      const sqlHorario = `
        INSERT INTO horarios (clase_id, fecha, hora_inicio, hora_fin, cupos)
        VALUES (?, ?, ?, ?, ?)
      `;
      db.run(
        sqlHorario,
        [claseId, fecha, horaInicio, horaFin, cupos],
        function (err2) {
          if (err2) {
            console.error(err2);
            return res.json({
              success: false,
              message: "Error al crear horario."
            });
          }
          res.json({ success: true, horarioId: this.lastID });
        }
      );
    };

    if (row) {
      insertarHorario(row.id);
    } else {
      const sqlInsertClase = `
        INSERT INTO clases (nombre, descripcion, profesor_id)
        VALUES (?, ?, ?)
      `;
      db.run(sqlInsertClase, [nombreClase, descripcion || "", profesorId], function (err3) {
        if (err3) {
          console.error(err3);
          return res.json({ success: false, message: "Error al crear clase." });
        }
        insertarHorario(this.lastID);
      });
    }
  });
});

app.get("/api/admin/horarios", (req, res) => {
  const { profesorId } = req.query;
  if (!profesorId) {
    return res.json({ success: false, message: "Falta profesorId." });
  }

  const sql = `
    SELECT
      h.id,
      h.fecha,
      h.hora_inicio,
      h.hora_fin,
      h.cupos,
      c.nombre AS clase
    FROM horarios h
    JOIN clases c ON c.id = h.clase_id
    WHERE c.profesor_id = ?
    ORDER BY h.fecha, h.hora_inicio
  `;

  db.all(sql, [profesorId], (err, rows) => {
    if (err) {
      console.error(err);
      return res.json({
        success: false,
        message: "Error al obtener horarios del profesor."
      });
    }
    res.json({ success: true, horarios: rows });
  });
});

app.put("/api/admin/horarios/:id", (req, res) => {
  const { id } = req.params;
  const { fecha, horaInicio, horaFin, cupos } = req.body;

  const sql = `
    UPDATE horarios
    SET fecha = ?, hora_inicio = ?, hora_fin = ?, cupos = ?
    WHERE id = ?
  `;
  db.run(sql, [fecha, horaInicio, horaFin, cupos, id], function (err) {
    if (err) {
      console.error(err);
      return res.json({ success: false, message: "Error al actualizar horario." });
    }
    if (this.changes === 0) {
      return res.json({ success: false, message: "Horario no encontrado." });
    }
    res.json({ success: true });
  });
});

app.delete("/api/admin/horarios/:id", (req, res) => {
  const { id } = req.params;
  db.run(`DELETE FROM horarios WHERE id = ?`, [id], function (err) {
    if (err) {
      console.error(err);
      return res.json({ success: false, message: "Error al eliminar horario." });
    }
    if (this.changes === 0) {
      return res.json({ success: false, message: "Horario no encontrado." });
    }
    res.json({ success: true });
  });
});

// ================== SERVER ==================
app.listen(PORT, () => {
  console.log(`Servidor iniciado en http://localhost:${PORT}`);
});
