
const studentLoginForm = document.getElementById("studentLoginForm");
const loginButton = document.getElementById("loginButton");
const message = document.getElementById("message");

studentLoginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  message.textContent = "";
  loginButton.disabled = true;
  loginButton.textContent = "Logging in...";

  const formData = new FormData(studentLoginForm);

  const studentId = Number(formData.get("studentId"));
  const password = String(formData.get("password") || "");

  try {
    const response = await fetch("/api/student/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      credentials: "same-origin",
      body: JSON.stringify({
        studentId,
        password
      })
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || "Login failed.");
    }

    message.textContent = "Login successful! Opening your dashboard...";

    window.location.href = "/student-dashboard.html";
  } catch (error) {
    message.textContent = error.message || "Unable to log in.";
  } finally {
    loginButton.disabled = false;
    loginButton.textContent = "Log In";
  }
});
