// app.js
let currentUser = null;

function show(id) {
  document.getElementById(id).classList.remove("hidden");
}
function hide(id) {
  document.getElementById(id).classList.add("hidden");
}
function setText(id, text) {
  document.getElementById(id).textContent = text;
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("btnLogin").addEventListener("click", login);
  document.getElementById("btnRegister").addEventListener("click", register);

  document
    .getElementById("btnProfVerHorarios")
    .addEventListener("click", cargarHorariosProfesor);
  document
    .getElementById("btnProfCerrarSesion")
    .addEventListener("click", logout);
  document
    .getElementById("btnCrearHorario")
    .addEventListener("click", crearHorarioProfesor);

  document
    .getElementById("btnVerClases")
    .addEventListener("click", cargarHorariosAlumno);
  document
    .getElementById("btnMisReservas")
    .addEventListener("click", cargarMisReservas);
  document
    .getElementById("btnAlumnoCerrarSesion")
    .addEventListener("click", logout);

  actualizarVista();
});

// ============ VISTAS ============

function actualizarVista() {
  if (!currentUser) {
    show("authSection");
    hide("profPanel");
    hide("alumnoPanel");
    return;
  }

  hide("authSection");

  if (currentUser.rol === "profesor") {
    show("profPanel");
    hide("alumnoPanel");
    setText("profTitulo", `Bienvenido, Profesor ${currentUser.nombre}`);
  } else {
    hide("profPanel");
    show("alumnoPanel");
    setText("alumnoTitulo", `Bienvenido, ${currentUser.nombre}`);
  }
}

// ============ AUTH ============

async function login() {
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value.trim();
  setText("loginMsg", "");

  if (!email || !password) {
    setText("loginMsg", "Completa tus datos.");
    return;
  }

  try {
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!data.success) {
      setText("loginMsg", data.message || "Error al iniciar sesión.");
      return;
    }

    currentUser = data.user;
    document.getElementById("loginEmail").value = "";
    document.getElementById("loginPassword").value = "";
    actualizarVista();
  } catch (err) {
    console.error(err);
    setText("loginMsg", "Error de conexión.");
  }
}

async function register() {
  const nombre = document.getElementById("regNombre").value.trim();
  const email = document.getElementById("regEmail").value.trim();
  const password = document.getElementById("regPassword").value.trim();
  setText("regMsg", "");

  if (!nombre || !email || !password) {
    setText("regMsg", "Completa todos los campos.");
    return;
  }

  try {
    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre, email, password })
    });
    const data = await res.json();
    if (!data.success) {
      setText("regMsg", data.message || "Error al registrarse.");
      return;
    }

    setText(
      "regMsg",
      "Cuenta creada. Ahora inicia sesión con tu correo y contraseña."
    );
    document.getElementById("regNombre").value = "";
    document.getElementById("regEmail").value = "";
    document.getElementById("regPassword").value = "";
  } catch (err) {
    console.error(err);
    setText("regMsg", "Error de conexión.");
  }
}

function logout() {
  currentUser = null;
  document.getElementById("listaHorarios").innerHTML = "";
  document.getElementById("listaReservas").innerHTML = "";
  document.getElementById("listaHorariosAdmin").innerHTML = "";
  hide("clasesSection");
  hide("misReservasSection");
  hide("profHorariosSection");
  actualizarVista();
}

// ============ PROFESOR ============

async function crearHorarioProfesor() {
  if (!currentUser || currentUser.rol !== "profesor") return;

  const nombreClase = document.getElementById("profNombreClase").value.trim();
  const descripcion = document.getElementById("profDescripcionClase").value.trim();
  const fecha = document.getElementById("profFecha").value;
  const horaInicio = document.getElementById("profHoraInicio").value;
  const horaFin = document.getElementById("profHoraFin").value;
  const cupos = parseInt(document.getElementById("profCupos").value, 10);

  setText("profMsg", "");

  if (!nombreClase || !fecha || !horaInicio || !horaFin || !cupos) {
    setText("profMsg", "Completa todos los campos.");
    return;
  }

  try {
    const res = await fetch("/api/admin/horarios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profesorId: currentUser.id,
        nombreClase,
        descripcion,
        fecha,
        horaInicio,
        horaFin,
        cupos
      })
    });
    const data = await res.json();
    if (!data.success) {
      setText("profMsg", data.message || "Error al crear horario.");
      return;
    }

    setText("profMsg", "Horario creado con éxito.");
    document.getElementById("profFecha").value = "";
    document.getElementById("profHoraInicio").value = "";
    document.getElementById("profHoraFin").value = "";
    document.getElementById("profCupos").value = "";
    cargarHorariosProfesor();
  } catch (err) {
    console.error(err);
    setText("profMsg", "Error de conexión.");
  }
}

async function cargarHorariosProfesor() {
  if (!currentUser || currentUser.rol !== "profesor") return;

  show("profHorariosSection");

  try {
    const res = await fetch(
      `/api/admin/horarios?profesorId=${currentUser.id}`
    );
    const data = await res.json();
    if (!data.success) {
      setText("profMsg", data.message || "Error al cargar horarios.");
      return;
    }

    const cont = document.getElementById("listaHorariosAdmin");
    cont.innerHTML = "";

    if (data.horarios.length === 0) {
      cont.innerHTML = "<p>No tienes horarios creados.</p>";
      return;
    }

    data.horarios.forEach((h) => {
      const div = document.createElement("div");
      div.className = "item";

      div.innerHTML = `
        <div>
          <strong>${h.clase}</strong><br>
          Fecha: ${h.fecha} | ${h.hora_inicio} - ${h.hora_fin} | Cupos: ${h.cupos}
        </div>
        <div class="actions">
          <button data-id="${h.id}" class="btn-editar">Editar</button>
          <button data-id="${h.id}" class="btn-eliminar btn-secondary">Eliminar</button>
        </div>
      `;

      cont.appendChild(div);
    });

    cont.querySelectorAll(".btn-eliminar").forEach((btn) => {
      btn.addEventListener("click", () => eliminarHorario(btn.dataset.id));
    });

    cont.querySelectorAll(".btn-editar").forEach((btn) => {
      btn.addEventListener("click", () => editarHorario(btn.dataset.id));
    });
  } catch (err) {
    console.error(err);
    setText("profMsg", "Error de conexión.");
  }
}

async function eliminarHorario(id) {
  if (!confirm("¿Eliminar este horario?")) return;

  try {
    const res = await fetch(`/api/admin/horarios/${id}`, {
      method: "DELETE"
    });
    const data = await res.json();
    if (!data.success) {
      alert(data.message || "Error al eliminar horario.");
      return;
    }
    cargarHorariosProfesor();
  } catch (err) {
    console.error(err);
    alert("Error de conexión.");
  }
}

async function editarHorario(id) {
  const nuevaFecha = prompt("Nueva fecha (YYYY-MM-DD):");
  if (!nuevaFecha) return;
  const nuevaHoraInicio = prompt("Nueva hora inicio (HH:MM):");
  if (!nuevaHoraInicio) return;
  const nuevaHoraFin = prompt("Nueva hora fin (HH:MM):");
  if (!nuevaHoraFin) return;
  const nuevosCupos = prompt("Nuevos cupos:");
  if (!nuevosCupos) return;

  try {
    const res = await fetch(`/api/admin/horarios/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fecha: nuevaFecha,
        horaInicio: nuevaHoraInicio,
        horaFin: nuevaHoraFin,
        cupos: parseInt(nuevosCupos, 10)
      })
    });
    const data = await res.json();
    if (!data.success) {
      alert(data.message || "Error al actualizar.");
      return;
    }
    cargarHorariosProfesor();
  } catch (err) {
    console.error(err);
    alert("Error de conexión.");
  }
}

// ============ ALUMNO ============

async function cargarHorariosAlumno() {
  if (!currentUser) return;

  show("clasesSection");
  hide("misReservasSection");
  setText("clasesMsg", "");

  try {
    const res = await fetch("/api/horarios");
    const data = await res.json();
    if (!data.success) {
      setText("clasesMsg", data.message || "Error al obtener clases.");
      return;
    }

    const cont = document.getElementById("listaHorarios");
    cont.innerHTML = "";

    if (data.horarios.length === 0) {
      cont.innerHTML = "<p>No hay clases disponibles por ahora.</p>";
      return;
    }

    data.horarios.forEach((h) => {
      const div = document.createElement("div");
      div.className = "item";

      const estado =
        h.disponibles > 0
          ? `<span class="ok">${h.disponibles} cupos disponibles</span>`
          : `<span class="error">Sin cupos</span>`;

      div.innerHTML = `
        <div>
          <strong>${h.clase}</strong> (Profesor: ${h.profesor})<br>
          Fecha: ${h.fecha} | ${h.hora_inicio} - ${h.hora_fin}<br>
          ${estado}
        </div>
        <div class="actions">
          <button data-id="${h.id}" class="btn-reservar" ${
        h.disponibles <= 0 ? "disabled" : ""
      }>Reservar</button>
        </div>
      `;

      cont.appendChild(div);
    });

    cont.querySelectorAll(".btn-reservar").forEach((btn) => {
      btn.addEventListener("click", () =>
        reservarHorario(btn.dataset.id)
      );
    });
  } catch (err) {
    console.error(err);
    setText("clasesMsg", "Error de conexión.");
  }
}

async function reservarHorario(horarioId) {
  if (!currentUser) return;

  try {
    const res = await fetch("/api/reservas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usuarioId: currentUser.id, horarioId })
    });
    const data = await res.json();
    if (!data.success) {
      alert(data.message || "No se pudo reservar.");
      return;
    }
    alert("Reserva creada con éxito.");
    cargarHorariosAlumno();
  } catch (err) {
    console.error(err);
    alert("Error de conexión.");
  }
}

async function cargarMisReservas() {
  if (!currentUser) return;

  show("misReservasSection");
  hide("clasesSection");
  setText("reservasMsg", "");

  try {
    const res = await fetch(`/api/reservas/${currentUser.id}`);
    const data = await res.json();
    if (!data.success) {
      setText("reservasMsg", data.message || "Error al obtener reservas.");
      return;
    }

    const cont = document.getElementById("listaReservas");
    cont.innerHTML = "";

    if (data.reservas.length === 0) {
      cont.innerHTML = "<p>No tienes reservas aún.</p>";
      return;
    }

    data.reservas.forEach((r) => {
      const div = document.createElement("div");
      div.className = "item";

      div.innerHTML = `
        <div>
          <strong>${r.clase}</strong> (Profesor: ${r.profesor})<br>
          Fecha: ${r.fecha} | ${r.hora_inicio} - ${r.hora_fin}<br>
          Estado: ${r.estado}
        </div>
        <div class="actions">
          <button data-id="${r.id}" data-claseid="${r.clase_id}" class="btn-cambiar">Cambiar hora</button>
          <button data-id="${r.id}" class="btn-cancelar btn-secondary">Cancelar</button>
        </div>
      `;
      cont.appendChild(div);
    });

    cont.querySelectorAll(".btn-cancelar").forEach((btn) => {
      btn.addEventListener("click", () => cancelarReserva(btn.dataset.id));
    });
    cont.querySelectorAll(".btn-cambiar").forEach((btn) => {
      btn.addEventListener("click", () =>
        cambiarHoraReserva(btn.dataset.id, btn.dataset.claseid)
      );
    });
  } catch (err) {
    console.error(err);
    setText("reservasMsg", "Error de conexión.");
  }
}

async function cancelarReserva(id) {
  if (!confirm("¿Cancelar esta reserva?")) return;

  try {
    const res = await fetch(`/api/reservas/${id}`, {
      method: "DELETE"
    });
    const data = await res.json();
    if (!data.success) {
      alert(data.message || "Error al cancelar.");
      return;
    }
    cargarMisReservas();
  } catch (err) {
    console.error(err);
    alert("Error de conexión.");
  }
}

async function cambiarHoraReserva(reservaId, claseId) {
  // 1) Traemos todos los horarios de esa clase
  try {
    const resHor = await fetch(`/api/horarios?claseId=${claseId}`);
    const dataHor = await resHor.json();
    if (!dataHor.success) {
      alert(dataHor.message || "Error al obtener horarios.");
      return;
    }

    const disponibles = dataHor.horarios.filter(h => h.disponibles > 0);
    if (disponibles.length === 0) {
      alert("No hay otros horarios disponibles para esta clase.");
      return;
    }

    const listado = disponibles
      .map(
        h =>
          `${h.id}: ${h.fecha} ${h.hora_inicio}-${h.hora_fin} (disp: ${h.disponibles})`
      )
      .join("\n");

    const nuevoIdStr = prompt(
      "Elige el ID del nuevo horario:\n" + listado
    );
    if (!nuevoIdStr) return;
    const nuevoHorarioId = parseInt(nuevoIdStr, 10);
    if (isNaN(nuevoHorarioId)) {
      alert("ID no válido.");
      return;
    }

    const res = await fetch(`/api/reservas/${reservaId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nuevoHorarioId })
    });
    const data = await res.json();
    if (!data.success) {
      alert(data.message || "No se pudo cambiar la hora.");
      return;
    }

    alert("Hora cambiada con éxito.");
    cargarMisReservas();
  } catch (err) {
    console.error(err);
    alert("Error de conexión.");
  }
}
