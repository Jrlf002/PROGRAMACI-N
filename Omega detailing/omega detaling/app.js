const APPOINTMENTS_KEY = "omega-appointments";
const SCHEDULE_KEY = "omega-schedule";
const DEFAULT_SCHEDULE = { weekdays: [1, 2, 3, 4, 5, 6], open: "09:00", close: "17:00" };
const MAX_MEDIA_SIZE = 20 * 1024 * 1024;
const dateInput = document.querySelector("#appointment-date");
const timeSelect = document.querySelector("#appointment-time");
const bookingForm = document.querySelector("#booking-form");
const bookingStatus = document.querySelector("#booking-status");
const adminPanel = document.querySelector("#admin-panel");
const mediaGrid = document.querySelector("#gallery-grid");
const mediaManage = document.querySelector("#media-manage");
let selectedCalendarDate = new Date();
let calendarMonth = new Date();
let mediaDatabase;
let galleryRenderGeneration = 0;

function readStorage(key, fallback) {
    try {
        const stored = localStorage.getItem(key);
        return stored ? JSON.parse(stored) : fallback;
    } catch (error) {
        console.error(`No se pudo leer ${key} del almacenamiento local.`, error);
        return fallback;
    }
}

function saveStorage(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
    } catch (error) {
        console.error(`No se pudo guardar ${key} en el almacenamiento local.`, error);
        return false;
    }
}

function getAppointments() {
    const stored = readStorage(APPOINTMENTS_KEY, []);
    return Array.isArray(stored) ? stored : [];
}

function getSchedule() {
    const stored = readStorage(SCHEDULE_KEY, DEFAULT_SCHEDULE);
    if (!stored || !Array.isArray(stored.weekdays) || typeof stored.open !== "string" || typeof stored.close !== "string") {
        return DEFAULT_SCHEDULE;
    }
    return stored;
}

function dateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function formatDate(value) {
    return new Date(`${value}T12:00:00`).toLocaleDateString("es", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric"
    });
}

function renderAvailableTimes() {
    const chosenDate = dateInput.value;
    const schedule = getSchedule();
    timeSelect.replaceChildren();
    timeSelect.disabled = true;

    if (!chosenDate) {
        timeSelect.add(new Option("Primero elige una fecha", ""));
        return;
    }

    const weekday = new Date(`${chosenDate}T12:00:00`).getDay();
    if (!schedule.weekdays.includes(weekday)) {
        timeSelect.add(new Option("No atendemos ese día", ""));
        return;
    }

    const [openingHour, openingMinute] = schedule.open.split(":").map(Number);
    const [closingHour, closingMinute] = schedule.close.split(":").map(Number);
    const openingMinutes = openingHour * 60 + openingMinute;
    const closingMinutes = closingHour * 60 + closingMinute;
    const occupied = new Set(
        getAppointments()
            .filter(appointment => appointment.date === chosenDate)
            .map(appointment => appointment.time)
    );
    const now = new Date();
    const earliestToday = now.getHours() * 60 + now.getMinutes();
    let availableCount = 0;

    timeSelect.add(new Option("Selecciona una hora", ""));
    for (let minutes = openingMinutes; minutes + 60 <= closingMinutes; minutes += 60) {
        const hour = String(Math.floor(minutes / 60)).padStart(2, "0");
        const minute = String(minutes % 60).padStart(2, "0");
        const time = `${hour}:${minute}`;
        if (occupied.has(time) || (chosenDate === dateKey(now) && minutes <= earliestToday)) {
            continue;
        }
        timeSelect.add(new Option(time, time));
        availableCount += 1;
    }

    if (!availableCount) {
        timeSelect.replaceChildren(new Option("No hay horarios disponibles", ""));
        return;
    }
    timeSelect.disabled = false;
}

function setBookingStatus(message, isError) {
    bookingStatus.textContent = message;
    bookingStatus.classList.toggle("error", Boolean(isError));
}

dateInput.min = dateKey(new Date());
dateInput.addEventListener("change", renderAvailableTimes);
bookingForm.addEventListener("submit", event => {
    event.preventDefault();
    const formData = new FormData(bookingForm);
    const appointment = {
        id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        name: String(formData.get("name")).trim(),
        phone: String(formData.get("phone")).trim(),
        email: String(formData.get("email")).trim(),
        service: String(formData.get("service")),
        date: String(formData.get("date")),
        time: String(formData.get("time"))
    };
    const schedule = getSchedule();
    const appointmentDate = new Date(`${appointment.date}T12:00:00`);
    const [openHour, openMinute] = schedule.open.split(":").map(Number);
    const [closeHour, closeMinute] = schedule.close.split(":").map(Number);
    const appointmentMinutes = Number(appointment.time.slice(0, 2)) * 60 + Number(appointment.time.slice(3, 5));
    const openingMinutes = openHour * 60 + openMinute;
    const closingMinutes = closeHour * 60 + closeMinute;
    const appointments = getAppointments();

    if (appointmentDate < new Date(`${dateKey(new Date())}T12:00:00`) ||
        !schedule.weekdays.includes(appointmentDate.getDay()) ||
        appointmentMinutes < openingMinutes ||
        appointmentMinutes + 60 > closingMinutes ||
        appointments.some(item => item.date === appointment.date && item.time === appointment.time)) {
        setBookingStatus("Ese horario ya no está disponible. Elige otra fecha u hora.", true);
        renderAvailableTimes();
        return;
    }

    appointments.push(appointment);
    if (!saveStorage(APPOINTMENTS_KEY, appointments)) {
        setBookingStatus("No se pudo guardar la cita en este navegador. Inténtalo de nuevo.", true);
        return;
    }

    bookingForm.reset();
    renderAvailableTimes();
    setBookingStatus(`¡Gracias, ${appointment.name}! Tu cita para ${formatDate(appointment.date)} a las ${appointment.time} quedó registrada. OMEGA podrá contactarte para confirmar.`);
});

document.querySelector("#admin-trigger").addEventListener("click", () => {
    adminPanel.hidden = false;
    adminPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    renderScheduleForm();
    renderCalendar();
    renderDayAppointments();
    renderMediaManager();
});

document.querySelector("#close-admin").addEventListener("click", () => {
    adminPanel.hidden = true;
});

function renderScheduleForm() {
    const schedule = getSchedule();
    document.querySelectorAll('input[name="weekday"]').forEach(input => {
        input.checked = schedule.weekdays.includes(Number(input.value));
    });
    document.querySelector("#opening-time").value = schedule.open;
    document.querySelector("#closing-time").value = schedule.close;
}

document.querySelector("#schedule-form").addEventListener("submit", event => {
    event.preventDefault();
    const weekdays = Array.from(document.querySelectorAll('input[name="weekday"]:checked'), input => Number(input.value));
    const open = document.querySelector("#opening-time").value;
    const close = document.querySelector("#closing-time").value;
    const status = document.querySelector("#schedule-status");
    if (!weekdays.length || open >= close) {
        status.textContent = "Selecciona al menos un día y un horario válido.";
        status.classList.add("error");
        return;
    }
    if (!saveStorage(SCHEDULE_KEY, { weekdays, open, close })) {
        status.textContent = "No se pudo guardar el horario en este navegador.";
        status.classList.add("error");
        return;
    }
    status.textContent = "Disponibilidad guardada.";
    status.classList.remove("error");
    renderAvailableTimes();
    renderCalendar();
});

function renderCalendar() {
    const grid = document.querySelector("#calendar-grid");
    const monthLabel = document.querySelector("#calendar-month");
    grid.replaceChildren();
    monthLabel.textContent = calendarMonth.toLocaleDateString("es", { month: "long", year: "numeric" });

    ["L", "M", "X", "J", "V", "S", "D"].forEach(day => {
        const label = document.createElement("span");
        label.className = "calendar-weekday";
        label.textContent = day;
        grid.append(label);
    });

    const firstDay = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
    const offset = (firstDay.getDay() + 6) % 7;
    const daysInMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0).getDate();
    const daysWithAppointments = new Set(getAppointments().map(appointment => appointment.date));
    for (let empty = 0; empty < offset; empty += 1) {
        const spacer = document.createElement("span");
        spacer.className = "calendar-empty";
        grid.append(spacer);
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
        const date = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), day);
        const key = dateKey(date);
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = String(day);
        button.setAttribute("aria-label", formatDate(key));
        button.classList.toggle("has-appointments", daysWithAppointments.has(key));
        button.classList.toggle("selected", dateKey(selectedCalendarDate) === key);
        button.addEventListener("click", () => {
            selectedCalendarDate = date;
            renderCalendar();
            renderDayAppointments();
        });
        grid.append(button);
    }
}

function renderDayAppointments() {
    const container = document.querySelector("#day-appointments");
    container.replaceChildren();
    const key = dateKey(selectedCalendarDate);
    const heading = document.createElement("h4");
    heading.textContent = formatDate(key);
    container.append(heading);
    const appointments = getAppointments()
        .filter(appointment => appointment.date === key)
        .sort((left, right) => left.time.localeCompare(right.time));

    if (!appointments.length) {
        const empty = document.createElement("p");
        empty.className = "empty-day";
        empty.textContent = "No hay citas para este día.";
        container.append(empty);
        return;
    }

    appointments.forEach(appointment => {
        const card = document.createElement("article");
        card.className = "appointment-card";
        const details = document.createElement("div");
        const time = document.createElement("strong");
        time.textContent = appointment.time;
        const customer = document.createElement("span");
        customer.textContent = `${appointment.name} · ${appointment.service}`;
        const contact = document.createElement("small");
        contact.textContent = `${appointment.phone} · ${appointment.email}`;
        details.append(time, customer, contact);

        const actions = document.createElement("div");
        actions.className = "appointment-actions";
        const digits = appointment.phone.replace(/\D/g, "");
        const message = `Hola ${appointment.name}, confirmamos tu cita de ${appointment.service} el ${formatDate(appointment.date)} a las ${appointment.time}. ¡Te esperamos!`;
        const whatsapp = document.createElement("a");
        whatsapp.href = `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
        whatsapp.target = "_blank";
        whatsapp.rel = "noopener noreferrer";
        whatsapp.textContent = "WhatsApp";
        whatsapp.setAttribute("aria-label", `Preparar confirmación por WhatsApp para ${appointment.name}`);
        const email = document.createElement("a");
        email.href = `mailto:${encodeURIComponent(appointment.email)}?subject=${encodeURIComponent("Confirmación de cita — OMEGA Detailing")}&body=${encodeURIComponent(message)}`;
        email.textContent = "Correo";
        email.setAttribute("aria-label", `Preparar confirmación por correo para ${appointment.name}`);
        const cancel = document.createElement("button");
        cancel.type = "button";
        cancel.textContent = "Cancelar";
        cancel.addEventListener("click", () => {
            const remaining = getAppointments().filter(item => item.id !== appointment.id);
            if (saveStorage(APPOINTMENTS_KEY, remaining)) {
                renderCalendar();
                renderDayAppointments();
                renderAvailableTimes();
            }
        });
        actions.append(whatsapp, email, cancel);
        card.append(details, actions);
        container.append(card);
    });
}

document.querySelector("#calendar-prev").addEventListener("click", () => {
    calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1);
    renderCalendar();
});

document.querySelector("#calendar-next").addEventListener("click", () => {
    calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1);
    renderCalendar();
});

function openMediaDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open("omega-detailing-media", 1);
        request.onupgradeneeded = () => {
            request.result.createObjectStore("gallery", { keyPath: "id", autoIncrement: true });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error("No se pudo abrir la galería."));
    });
}

function getMediaItems() {
    return new Promise((resolve, reject) => {
        const request = mediaDatabase.transaction("gallery", "readonly").objectStore("gallery").getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error("No se pudo leer la galería."));
    });
}

function renderMediaItem(item, isManaged) {
    const figure = document.createElement("figure");
    figure.className = isManaged ? "gallery-item" : "gallery-item uploaded-media";
    const mediaUrl = URL.createObjectURL(item.file);
    const media = document.createElement(item.type.startsWith("video/") ? "video" : "img");
    media.src = mediaUrl;
    media.alt = item.name || "Trabajo de OMEGA Detailing";
    if (media instanceof HTMLVideoElement) {
        media.controls = true;
        media.preload = "metadata";
    } else {
        media.loading = "lazy";
    }
    const caption = document.createElement("figcaption");
    const title = document.createElement("span");
    title.textContent = item.name || "TRABAJO OMEGA";
    caption.append(title);
    figure.append(media, caption);

    if (isManaged) {
        const remove = document.createElement("button");
        remove.className = "remove-media";
        remove.type = "button";
        remove.textContent = "Quitar";
        remove.addEventListener("click", async () => {
            try {
                const transaction = mediaDatabase.transaction("gallery", "readwrite");
                transaction.objectStore("gallery").delete(item.id);
                transaction.oncomplete = () => {
                    renderGallery();
                    renderMediaManager();
                };
                transaction.onerror = () => {
                    document.querySelector("#media-status").textContent = "No se pudo quitar el archivo.";
                };
            } catch (error) {
                document.querySelector("#media-status").textContent = "No se pudo quitar el archivo.";
                console.error("Error al quitar contenido de la galería.", error);
            }
        });
        figure.append(remove);
    }
    return figure;
}

async function renderGallery() {
    try {
        const generation = ++galleryRenderGeneration;
        const items = await getMediaItems();
        if (generation !== galleryRenderGeneration) return;
        mediaGrid.querySelectorAll(".uploaded-media").forEach(item => item.remove());
        items.forEach(item => mediaGrid.append(renderMediaItem(item, false)));
    } catch (error) {
        console.error("No se pudo cargar la galería.", error);
    }
}

async function renderMediaManager() {
    if (!mediaDatabase) return;
    mediaManage.replaceChildren();
    try {
        const items = await getMediaItems();
        if (!items.length) {
            const empty = document.createElement("p");
            empty.className = "empty-day";
            empty.textContent = "Aún no has agregado archivos propios.";
            mediaManage.append(empty);
            return;
        }
        items.forEach(item => mediaManage.append(renderMediaItem(item, true)));
    } catch (error) {
        document.querySelector("#media-status").textContent = "No se pudo cargar la galería.";
        console.error("No se pudo cargar el administrador de medios.", error);
    }
}

document.querySelector("#media-upload").addEventListener("change", async event => {
    const files = Array.from(event.target.files || []);
    const status = document.querySelector("#media-status");
    for (const file of files) {
        if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
            status.textContent = `${file.name}: formato no compatible.`;
            continue;
        }
        if (file.size > MAX_MEDIA_SIZE) {
            status.textContent = `${file.name}: supera el límite de 20 MB.`;
            continue;
        }
        try {
            const transaction = mediaDatabase.transaction("gallery", "readwrite");
            transaction.objectStore("gallery").add({ name: file.name, type: file.type, file });
            await new Promise((resolve, reject) => {
                transaction.oncomplete = resolve;
                transaction.onerror = () => reject(transaction.error || new Error("No se pudo guardar el archivo."));
            });
            status.textContent = `${file.name} agregado a la galería.`;
        } catch (error) {
            status.textContent = `No se pudo guardar ${file.name}.`;
            console.error("Error al guardar contenido de la galería.", error);
        }
    }
    event.target.value = "";
    await renderGallery();
    await renderMediaManager();
});

openMediaDatabase()
    .then(database => {
        mediaDatabase = database;
        renderGallery();
    })
    .catch(error => {
        document.querySelector("#media-status").textContent = "La galería necesita abrirse desde un navegador compatible.";
        console.error("No se pudo iniciar el almacenamiento de la galería.", error);
    });
