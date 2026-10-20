
const welcomeHeading = document.getElementById("welcomeHeading");
const statusMessage = document.getElementById("statusMessage");
const logoutButton = document.getElementById("logoutButton");

function displayValue(id, value) {
  const element = document.getElementById(id);

  if (!element) return;

  element.textContent =
    value === null || value === undefined || value === ""
      ? "—"
      : String(value);
}

function formatMoney(value) {
  const amount = Number(value);

  if (!Number.isFinite(amount)) return "—";

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2
  }).format(amount);
}

async function loadStudentProfile() {
  try {
    const response = await fetch("/api/student/me", {
      credentials: "same-origin"
    });

    if (response.status === 401) {
      window.location.replace("/student-login.html");
      return;
    }

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || "Unable to load profile.");
    }

    const student = result.student;

    welcomeHeading.textContent =
      `Welcome, ${student.student_name || "Student"}!`;

    displayValue("studentId", student.id);
    displayValue("studentName", student.student_name);
    displayValue("studentPhone", student.phone);
    displayValue("studentCourse", student.course);
    displayValue("learningMode", student.learning_mode);

    displayValue(
      "registrationDate",
      student.created_at
        ? new Date(student.created_at).toLocaleDateString("en-IN")
        : "—"
    );

    statusMessage.textContent = "";

    await loadStudentFees();
  } catch (error) {
    statusMessage.textContent =
      error.message || "Unable to load your profile.";
  }
}

async function loadStudentFees() {
  const feeMessage = document.getElementById("feeMessage");

  try {
    const response = await fetch("/api/student/fees", {
      credentials: "same-origin"
    });

    if (response.status === 401) {
      window.location.replace("/student-login.html");
      return;
    }

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || "Unable to load fee details.");
    }

    if (!result.fee) {
      displayValue("totalFee", "—");
      displayValue("amountPaid", "—");
      displayValue("remainingBalance", "—");
      displayValue("feeDueDate", "—");

      if (feeMessage) {
        feeMessage.textContent =
          "Your fee details have not been added by the admin yet.";
      }

      return;
    }

    const fee = result.fee;

    displayValue("totalFee", formatMoney(fee.totalFee));
    displayValue("amountPaid", formatMoney(fee.amountPaid));
    displayValue("remainingBalance", formatMoney(fee.balance));

    displayValue(
      "feeDueDate",
      fee.dueDate
        ? new Date(`${String(fee.dueDate).slice(0, 10)}T00:00:00`)
            .toLocaleDateString("en-IN")
        : "No due date set"
    );

    if (feeMessage) {
      feeMessage.textContent = fee.notes || "";
    }
  } catch (error) {
    if (feeMessage) {
      feeMessage.textContent =
        error.message || "Unable to load fee details.";
    }
  }
}

logoutButton.addEventListener("click", async () => {
  logoutButton.disabled = true;
  statusMessage.textContent = "Logging out...";

  try {
    const response = await fetch("/api/student/logout", {
      method: "POST",
      credentials: "same-origin"
    });

    if (!response.ok) {
      throw new Error("Logout failed. Please try again.");
    }

    window.location.replace("/student-login.html");
  } catch (error) {
    statusMessage.textContent = error.message;
    logoutButton.disabled = false;
  }
});

loadStudentProfile();
