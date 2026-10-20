
const menuToggle = document.getElementById("menuToggle");
const navLinks = document.getElementById("navLinks");
const admissionForm = document.getElementById("admissionForm");
const formMessage = document.getElementById("formMessage");
const currentYear = document.getElementById("currentYear");

// Display the current year automatically.
if (currentYear) {
  currentYear.textContent = new Date().getFullYear();
}

// Mobile navigation menu.
if (menuToggle && navLinks) {
  menuToggle.addEventListener("click", () => {
    const isOpen = navLinks.classList.toggle("open");
    menuToggle.setAttribute("aria-expanded", String(isOpen));
  });

  navLinks.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      navLinks.classList.remove("open");
      menuToggle.setAttribute("aria-expanded", "false");
    });
  });
}

// Submit admission enquiries to the Express backend.
if (admissionForm) {
  admissionForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const submitButton = admissionForm.querySelector(
      'button[type="submit"]'
    );

    const formData = new FormData(admissionForm);

    const enquiry = {
      studentName: String(formData.get("studentName") || "").trim(),
      phone: String(formData.get("phone") || "").trim(),
      course: String(formData.get("course") || ""),
      mode: String(formData.get("mode") || "")
    };

    try {
      if (formMessage) {
        formMessage.style.color = "#2544b6";
        formMessage.textContent = "Submitting your enquiry...";
      }

      if (submitButton) submitButton.disabled = true;

      const response = await fetch("/api/admissions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(enquiry)
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "Unable to submit enquiry.");
      }

      if (formMessage) {
        formMessage.style.color = "#16803d";
        formMessage.textContent =
          result.message || "Admission enquiry submitted successfully!";
      }

      admissionForm.reset();
    } catch (error) {
      if (formMessage) {
        formMessage.style.color = "#c62828";
        formMessage.textContent =
          error.message || "Unable to submit. Please try again.";
      }

      console.error("Admission submission error:", error);
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  });
}

