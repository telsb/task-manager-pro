// ⚠️ REPLACE THIS URL WITH YOUR ACTUAL RENDER APPLICATION URL ONCE DEPLOYED
const API_URL = "https://task-manager-backend-vcm9.onrender.com/api/tasks";

document.addEventListener("DOMContentLoaded", fetchTasks);
document.getElementById("task-form").addEventListener("submit", addTask);

async function fetchTasks() {
    const loader = document.getElementById("loading-indicator");
    // Show a timeout indicator in case Render is suffering a cold start
    const timer = setTimeout(() => loader.classList.remove("hidden"), 1500);

    try {
        const response = await fetch(API_URL);
        const tasks = await response.json();
        renderTasks(tasks);
    } catch (error) {
        console.error("Error communicating with API:", error);
    } finally {
        clearTimeout(timer);
        loader.classList.add("hidden");
    }
}

function renderTasks(tasks) {
    const list = document.getElementById("task-list");
    list.innerHTML = "";

    tasks.forEach(task => {
        const li = document.createElement("li");

        li.innerHTML = `
            <div class="task-text ${task.isCompleted ? 'completed' : ''}" onclick="toggleTask(${task.id}, '${task.title}', '${task.description || ""}', ${task.isCompleted})">
                <h3>${escapeHtml(task.title)}</h3>
                <p>${escapeHtml(task.description || "")}</p>
            </div>
            <button class="delete-btn" onclick="deleteTask(${task.id})">Delete</button>
        `;
        list.appendChild(li);
    });
}

async function addTask(e) {
    e.preventDefault();
    const titleInput = document.getElementById("task-title");
    const descInput = document.getElementById("task-desc");

    const newTask = {
        title: titleInput.value,
        description: descInput.value,
        isCompleted: false
    };

    await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newTask)
    });

    titleInput.value = "";
    descInput.value = "";
    fetchTasks();
}

async function toggleTask(id, title, description, isCompleted) {
    await fetch(`${API_URL}/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, title, description, isCompleted: !isCompleted })
    });
    fetchTasks();
}

async function deleteTask(id) {
    if (confirm("Delete this task?")) {
        await fetch(`${API_URL}/${id}`, { method: "DELETE" });
        fetchTasks();
    }
}

function escapeHtml(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}