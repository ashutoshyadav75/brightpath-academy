
const loginPanel = document.querySelector("#loginPanel");
const dashboardPanel = document.querySelector("#dashboardPanel");
const loginForm = document.querySelector("#loginForm");
const loginMessage = document.querySelector("#loginMessage");
const dashboardMessage = document.querySelector("#dashboardMessage");
const admissionsBody = document.querySelector("#admissionsBody");
const searchInput = document.querySelector("#searchInput");
const courseFilter = document.querySelector("#courseFilter");

let allAdmissions = [];

const validStatuses = ["New", "Contacted", "Enrolled", "Rejected"];


function updateDashboardStats() {
  document.querySelector("#totalCount").textContent =
    allAdmissions.length;

  document.querySelector("#newCount").textContent =
    allAdmissions.filter((item) => item.status === "New").length;

  document.querySelector("#contactedCount").textContent =
    allAdmissions.filter((item) => item.status === "Contacted").length;

  document.querySelector("#enrolledCount").textContent =
    allAdmissions.filter((item) => item.status === "Enrolled").length;
}


function showLogin() {
  loginPanel.hidden = false;
  dashboardPanel.hidden = true;

  
  const studentsPanel = document.querySelector("#studentsPanel");
  const feeManagementSection = document.querySelector("#feeManagementSection");
const classesPanel = document.getElementById("classesPanel");
if (classesPanel) classesPanel.hidden = true;
  if (studentsPanel) studentsPanel.hidden = true;
  if (feeManagementSection) feeManagementSection.hidden = true;
}

function showDashboard(username) {
  loginPanel.hidden = true;

  dashboardPanel.hidden = false;

  loadClasses();

  const studentsPanel = document.querySelector("#studentsPanel");
  const feeManagementSection = document.querySelector("#feeManagementSection");

  const classesPanel = document.getElementById("classesPanel");
if (classesPanel) classesPanel.hidden = false;
  if (studentsPanel) studentsPanel.hidden = false;
  if (feeManagementSection) feeManagementSection.hidden = false;

  document.querySelector("#adminUsername").textContent = username;
}

async function apiRequest(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.body
        ? { "Content-Type": "application/json" }
        : {}),
      ...options.headers
    }
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.message || "Request failed.");
  }

  return result;
}

function renderAdmissions() {
  const searchTerm = searchInput.value.trim().toLowerCase();
  const selectedCourse = courseFilter.value;

  const filteredAdmissions = allAdmissions.filter((admission) => {
    const name = String(admission.student_name || "").toLowerCase();
    const phone = String(admission.phone || "");
    const course = String(admission.course || "");

    const matchesSearch =
      name.includes(searchTerm) || phone.includes(searchTerm);

    const matchesCourse =
      !selectedCourse || course === selectedCourse;

    return matchesSearch && matchesCourse;
  });

  admissionsBody.replaceChildren();

  for (const admission of filteredAdmissions) {
    const row = document.createElement("tr");

    const values = [
      admission.id,
      admission.student_name,
      admission.phone,
      admission.course,
      admission.learning_mode
    ];

    for (const value of values) {
      const cell = document.createElement("td");
      cell.textContent = value == null ? "" : String(value);
      row.appendChild(cell);
    }

    // Status dropdown.
    const statusCell = document.createElement("td");
    const statusSelect = document.createElement("select");

    statusSelect.setAttribute(
      "aria-label",
      `Admission status for ${admission.student_name}`
    );

    for (const status of validStatuses) {
      const option = document.createElement("option");
      option.value = status;
      option.textContent = status;
      statusSelect.appendChild(option);
    }

    


    statusSelect.value = validStatuses.includes(admission.status)
      ? admission.status
      : "New";

    statusSelect.addEventListener("change", async () => {
      const newStatus = statusSelect.value;
      statusSelect.disabled = true;
      dashboardMessage.textContent = "Saving admission status...";

      try {
        await apiRequest(
          `/api/admin/admissions/${admission.id}/status`,
          {
            method: "PATCH",
            body: JSON.stringify({ status: newStatus })
          }
        );

        admission.status = newStatus;
        updateDashboardStats();
        dashboardMessage.textContent =
          `Admission #${admission.id} status saved as ${newStatus}.`;
      } catch (error) {
        dashboardMessage.textContent = error.message;
        statusSelect.value = admission.status || "New";
      } finally {
        statusSelect.disabled = false;
      }
    });

    statusCell.appendChild(statusSelect);
    row.appendChild(statusCell);

    // Submission date.
    const dateCell = document.createElement("td");
    dateCell.textContent = admission.created_at
      ? new Date(admission.created_at).toLocaleString()
      : "";
    row.appendChild(dateCell);

    admissionsBody.appendChild(row);
  }

  if (filteredAdmissions.length === 0) {
    dashboardMessage.textContent =
      allAdmissions.length === 0
        ? "No admission enquiries yet."
        : "No enquiries match your search or course filter.";
  } else {
    dashboardMessage.textContent =
      `Showing ${filteredAdmissions.length} of ` +
      `${allAdmissions.length} admission enquiry record(s).`;
  }
}

async function loadAdmissions() {
  dashboardMessage.textContent = "Loading enquiries...";

  try {
    const result = await apiRequest("/api/admin/admissions");
   allAdmissions = result.admissions;
    updateDashboardStats();
   renderAdmissions();
  } catch (error) {
    dashboardMessage.textContent = error.message;
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginMessage.textContent = "Signing in...";

  const formData = new FormData(loginForm);

  try {
    const result = await apiRequest("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({
        username: formData.get("username"),
        password: formData.get("password")
      })
    });

    loginForm.reset();
    showDashboard(result.username);
    await loadAdmissions();
  } catch (error) {
    loginMessage.textContent = error.message;
  }
});

searchInput.addEventListener("input", renderAdmissions);
courseFilter.addEventListener("change", renderAdmissions);

document.querySelector("#refreshButton")
  .addEventListener("click", loadAdmissions);

document.querySelector("#logoutButton")
  .addEventListener("click", async () => {
    try {
      await apiRequest("/api/admin/logout", { method: "POST" });
      allAdmissions = [];
      showLogin();
      loginMessage.textContent = "You have logged out.";
      dashboardMessage.textContent = "";
    } catch (error) {
      dashboardMessage.textContent = error.message;
    }
  });

async function checkExistingSession() {
  try {
    const result = await apiRequest("/api/admin/me");
    showDashboard(result.username);
    await loadAdmissions();
  } catch {
    showLogin();
  }
}

checkExistingSession();


const studentForm = document.querySelector("#studentForm");
const studentMessage = document.querySelector("#studentMessage");
const studentsBody = document.querySelector("#studentsBody");
const refreshStudentsButton = document.querySelector("#refreshStudentsButton");

async function loadStudents() {
  studentMessage.textContent = "Loading students...";
  studentsBody.replaceChildren();

  try {
    const result = await apiRequest("/api/admin/students");

    if (result.students.length === 0) {
      studentMessage.textContent = "No registered students yet.";
      return;
    }

    for (const student of result.students) {
      const row = document.createElement("tr");

      const values = [
        student.id,
        student.admission_id,
        student.student_name,
        student.phone,
        student.course,
        student.learning_mode,
        student.created_at
          ? new Date(student.created_at).toLocaleString()
          : ""
      ];

      for (const value of values) {
        const cell = document.createElement("td");
        cell.textContent = value == null ? "" : String(value);
        row.appendChild(cell);
      }

      studentsBody.appendChild(row);
    }

    studentMessage.textContent =
      `Showing ${result.students.length} registered student(s).`;
  } catch (error) {
    studentMessage.textContent = error.message;
  }
}

studentForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const submitButton = studentForm.querySelector(
    'button[type="submit"]'
  );
  const formData = new FormData(studentForm);

const student = {
  studentName: String(formData.get("studentName") || "").trim(),
  phone: String(formData.get("phone") || "").trim(),
  course: String(formData.get("course") || ""),
  mode: String(formData.get("mode") || ""),
  password: String(formData.get("password") || "")
};

  const admissionId = String(formData.get("admissionId") || "").trim();

  if (admissionId) {
    student.admissionId = Number(admissionId);
  }

  studentMessage.textContent = "Registering student...";
  submitButton.disabled = true;

  try {
    const result = await apiRequest("/api/admin/students", {
      method: "POST",
      body: JSON.stringify(student)
    });

    studentMessage.textContent =
      result.message || "Student registered successfully.";

    studentForm.reset();
    await loadStudents();
  } catch (error) {
    studentMessage.textContent = error.message;
  } finally {
    submitButton.disabled = false;
  }
});

refreshStudentsButton.addEventListener("click", loadStudents);

// Load students only when an administrator is logged in.
async function initializeStudentSection() {
  try {
    await apiRequest("/api/admin/me");
    await loadStudents();
  } catch {
    studentMessage.textContent =
      "Log in as an administrator to view student records.";
  }
}

initializeStudentSection();



const studentFeeForm = document.getElementById("studentFeeForm");
const feeMessage = document.getElementById("feeMessage");
const feeRecordsBody = document.getElementById("feeRecordsBody");
const refreshFeesButton = document.getElementById("refreshFeesButton");

async function loadFeeRecords() {
  if (!feeRecordsBody) return;

  feeRecordsBody.textContent = "";

  try {
    const response = await fetch("/api/admin/student-fees", {
      credentials: "same-origin"
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || "Unable to load fee records.");
    }

    if (!result.fees || result.fees.length === 0) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 6;
      cell.textContent = "No fee records yet.";
      row.appendChild(cell);
      feeRecordsBody.appendChild(row);
      return;
    }

    for (const fee of result.fees) {
      const row = document.createElement("tr");

      const values = [
        `${fee.student_name} (ID: ${fee.student_id})`,
        fee.course,
        `₹${Number(fee.total_fee).toFixed(2)}`,
        `₹${Number(fee.amount_paid).toFixed(2)}`,
        `₹${Number(fee.balance_due).toFixed(2)}`,
        fee.due_date
          ? new Date(fee.due_date).toLocaleDateString("en-IN", {
              timeZone: "UTC"
            })
          : "—"
      ];

      for (const value of values) {
        const cell = document.createElement("td");
        cell.textContent = String(value);
        row.appendChild(cell);
      }

      feeRecordsBody.appendChild(row);
    }
  } catch (error) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 6;
    cell.textContent = error.message || "Unable to load fee records.";
    row.appendChild(cell);
    feeRecordsBody.appendChild(row);
  }
}

if (studentFeeForm) {
  studentFeeForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const submitButton = studentFeeForm.querySelector(
      'button[type="submit"]'
    );
    submitButton.disabled = true;
    feeMessage.textContent = "Saving fee record...";

    const formData = new FormData(studentFeeForm);

    const fee = {
      studentId: Number(formData.get("studentId")),
      totalFee: Number(formData.get("totalFee")),
      amountPaid: Number(formData.get("amountPaid")),
      dueDate: String(formData.get("dueDate") || "") || null,
      notes: String(formData.get("notes") || "").trim() || null
    };

    try {
      const response = await fetch("/api/admin/student-fees", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        credentials: "same-origin",
        body: JSON.stringify(fee)
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "Unable to save fee record.");
      }

      feeMessage.textContent = result.message || "Fee record saved.";
      studentFeeForm.reset();

      const paidInput = document.getElementById("amountPaid");
      if (paidInput) paidInput.value = "0";

      await loadFeeRecords();
    } catch (error) {
      feeMessage.textContent = error.message || "Unable to save fee record.";
    } finally {
      submitButton.disabled = false;
    }
  });
}

if (refreshFeesButton) {
  refreshFeesButton.addEventListener("click", loadFeeRecords);
}

loadFeeRecords();


const classForm = document.getElementById("classForm");
const classMessage = document.getElementById("classMessage");
const classesList = document.getElementById("classesList");

async function loadClasses() {
  if (!classesList) return;

  classesList.textContent = "Loading classes...";

  try {
    const response = await fetch("/api/admin/classes", {
      credentials: "same-origin"
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || "Unable to load classes.");
    }

    classesList.replaceChildren();

    if (!result.classes || result.classes.length === 0) {
      classesList.textContent = "No classes added yet.";
      return;
    }

    result.classes.forEach((item) => {
      const card = document.createElement("article");
      const title = document.createElement("h4");
      const details = document.createElement("p");
      const type = document.createElement("p");

      title.textContent = item.class_title;
      details.textContent =
        `${item.course}${item.description ? " — " + item.description : ""}`;
      type.textContent = `Type: ${item.class_type}`;

      card.append(title, details, type);

      if (item.class_link) {
        const link = document.createElement("a");
        link.href = item.class_link;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = "Open Class";
        card.append(link);
      }

      classesList.append(card);
    });
  } catch (error) {
    classesList.textContent = error.message;
  }
}

if (classForm) {
  classForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    classMessage.textContent = "Saving class...";

    const formData = new FormData(classForm);

    const classData = {
      course: formData.get("course"),
      classTitle: formData.get("classTitle"),
      classType: formData.get("classType"),
      scheduledAt: formData.get("scheduledAt") || null,
      classLink: formData.get("classLink"),
      description: formData.get("description")
    };

    try {
      const response = await fetch("/api/admin/classes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        credentials: "same-origin",
        body: JSON.stringify(classData)
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "Unable to add class.");
      }

      classMessage.textContent = "Class added successfully!";
      classForm.reset();

      await loadClasses();
    } catch (error) {
      classMessage.textContent = error.message;
    }
  });
}
