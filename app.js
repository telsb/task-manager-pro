/* ═══════════════════════════════════════════
   TASKFLOW PRO — APP LOGIC
   ═══════════════════════════════════════════ */

const API_URL = "https://task-manager-backend-vcm9.onrender.com/api/tasks";

/* ─── State ─── */
let allTasks = [];
let currentView = 'dashboard';
let currentCategory = null;
let pendingDeleteId = null;
let editingTaskId = null;
let activityChart = null;
let completionRing = null;
let selectedTaskIds = new Set();

/* ─── Priority helpers ─── */
const PRIORITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };
const PRIORITY_COLOR = {
    critical: '#e53e3e',
    high:     '#e67e22',
    medium:   '#d69e2e',
    low:      '#38a169'
};
const PRIORITY_LABEL = { critical: '🔴 Critical', high: '🟠 High', medium: '🟡 Medium', low: '🟢 Low' };
const CATEGORY_EMOJI = { general: '📌', work: '💼', personal: '👤', shopping: '🛒', health: '❤️' };

/* ─── Init ─── */
document.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons();
    setHeaderDate();
    initSidebar();
    initModal();
    initSearch();
    initFilters();
    initCharts();
    initDensityToggle();
    initCommandPalette();
    initQuickAdd();
    fetchTasks();
});

/* ═══════════════════════════════════════════
   DATE HELPERS
═══════════════════════════════════════════ */
function setHeaderDate() {
    const el = document.getElementById('header-date-text');
    const now = new Date();
    el.textContent = now.toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' });
}

function formatDueDate(dateStr) {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    if (isNaN(d)) return null;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function isOverdue(task) {
    if (!task.dueDate || task.isCompleted) return false;
    return new Date(task.dueDate) < new Date();
}

function getLast7Days() {
    const days = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        d.setHours(0, 0, 0, 0);
        days.push(d);
    }
    return days;
}

/* ═══════════════════════════════════════════
   SIDEBAR & NAVIGATION
═══════════════════════════════════════════ */
function initSidebar() {
    // Main nav items
    document.querySelectorAll('.nav-item[data-view]').forEach(item => {
        item.addEventListener('click', e => {
            e.preventDefault();
            switchView(item.dataset.view);
        });
    });

    // Category items
    document.querySelectorAll('.cat-item[data-category]').forEach(item => {
        item.addEventListener('click', e => {
            e.preventDefault();
            currentCategory = item.dataset.category;
            switchView('all');
            const catFilter = document.getElementById('filter-category');
            if (catFilter) catFilter.value = currentCategory;
            applyFilters();
        });
    });

    // See all link
    document.querySelectorAll('.see-all-link').forEach(link => {
        link.addEventListener('click', e => {
            e.preventDefault();
            switchView(link.dataset.view || 'all');
        });
    });

    // Mobile toggle
    const toggle = document.getElementById('sidebar-toggle');
    const sidebar = document.getElementById('sidebar');
    toggle.addEventListener('click', () => sidebar.classList.toggle('open'));

    // Close sidebar on outside click (mobile)
    document.addEventListener('click', e => {
        if (!sidebar.contains(e.target) && !toggle.contains(e.target)) {
            sidebar.classList.remove('open');
        }
    });

    // Sidebar collapse (icon-only mode)
    const collapseBtn = document.getElementById('sidebar-collapse-btn');
    if (collapseBtn) {
        collapseBtn.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
        });
    }
}

function switchView(viewName) {
    currentView = viewName;
    currentCategory = null;

    // Update nav highlights
    document.querySelectorAll('.nav-item[data-view]').forEach(item => {
        item.classList.toggle('active', item.dataset.view === viewName);
    });

    // Swap views
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const target = document.getElementById(`view-${viewName}`);
    if (target) target.classList.add('active');

    // Update header title
    const titles = {
        dashboard: ['Dashboard', 'Track and manage your tasks'],
        all: ['All Tasks', 'Browse and filter every task'],
        active: ['Active Tasks', 'Tasks in progress'],
        completed: ['Completed Tasks', "Tasks you've finished"],
        overdue: ['Overdue Tasks', 'Tasks past their due date']
    };

    const [title, subtitle] = titles[viewName] || ['Tasks', ''];
    document.getElementById('page-title').textContent = title;
    document.getElementById('page-subtitle').textContent = subtitle;

    renderCurrentView();
    lucide.createIcons();
}

/* ═══════════════════════════════════════════
   API CALLS
═══════════════════════════════════════════ */
async function fetchTasks() {
    const loader = document.getElementById('loading-indicator');

    // Show waking-up message quickly — Render free tier cold starts can take 60–90s
    loader.textContent = '⏳ Waking up server… (this may take ~30s on first load)';
    loader.classList.remove('hidden');

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 90000); // 90s timeout

        const resp = await fetch(API_URL, { signal: controller.signal });
        clearTimeout(timeout);

        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

        allTasks = (await resp.json()).map(normalizeTask);
        loader.classList.add('hidden');
        updateAll();
    } catch (err) {
        if (err.name === 'AbortError') {
            loader.textContent = '❌ Server took too long to respond. Retrying…';
        } else {
            loader.textContent = `⚠️ Could not connect to server — retrying in 8s… (${err.message})`;
        }
        console.error('Error fetching tasks:', err);
        setTimeout(fetchTasks, 8000);
    }
}

function normalizeTask(t) {
    return {
        id:          t.id ?? t.Id,
        title:       t.title ?? t.Title ?? '',
        description: t.description ?? t.Description ?? '',
        isCompleted: t.isCompleted ?? t.IsCompleted ?? false,
        createdAt:   t.createdAt ?? t.CreatedAt ?? new Date().toISOString(),
        completedAt: t.completedAt ?? t.CompletedAt ?? null,
        priority:    (t.priority ?? t.Priority ?? 'medium').toLowerCase(),
        dueDate:     t.dueDate ?? t.DueDate ?? null,
        category:    (t.category ?? t.Category ?? 'general').toLowerCase(),
        energyLevel: (t.energyLevel ?? t.EnergyLevel ?? 'medium').toLowerCase(),
        rescheduleCount: t.rescheduleCount ?? t.RescheduleCount ?? 0,
        recurrenceRule: t.recurrenceRule ?? t.RecurrenceRule ?? null
    };
}

async function addTask(payload) {
    try {
        await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        await fetchTasks();
    } catch (err) { console.error('Error adding task:', err); }
}

async function updateTask(id, payload) {
    try {
        await fetch(`${API_URL}/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        await fetchTasks();
    } catch (err) { console.error('Error updating task:', err); }
}

async function deleteTask(id) {
    try {
        await fetch(`${API_URL}/${id}`, { method: 'DELETE' });
        await fetchTasks();
    } catch (err) { console.error('Error deleting task:', err); }
}

/* ═══════════════════════════════════════════
   MODAL — ADD / EDIT
═══════════════════════════════════════════ */
function initModal() {
    const modal       = document.getElementById('task-modal');
    const openBtn     = document.getElementById('open-modal-btn');
    const closeBtn    = document.getElementById('close-modal-btn');
    const cancelBtn   = document.getElementById('cancel-modal-btn');
    const form        = document.getElementById('task-form');
    const saveBtn     = document.getElementById('save-task-btn');

    const openModal = (task = null) => {
        editingTaskId = task ? task.id : null;
        document.getElementById('modal-title').textContent = task ? 'Edit Task' : 'New Task';
        saveBtn.innerHTML = `<i data-lucide="${task ? 'save' : 'plus'}"></i> ${task ? 'Save Changes' : 'Add Task'}`;

        // Reset
        document.getElementById('edit-task-id').value = task ? task.id : '';
        document.getElementById('task-title').value    = task ? task.title : '';
        document.getElementById('task-desc').value     = task ? task.description : '';
        document.getElementById('task-priority').value = task ? task.priority : 'medium';
        document.getElementById('task-category').value = task ? task.category : 'general';
        document.getElementById('task-due').value      = task && task.dueDate
            ? new Date(task.dueDate).toISOString().slice(0, 16) : '';

        modal.classList.add('open');
        setTimeout(() => document.getElementById('task-title').focus(), 100);
        lucide.createIcons();
    };

    const closeModal = () => {
        modal.classList.remove('open');
        editingTaskId = null;
    };

    openBtn.addEventListener('click', () => openModal());
    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });

    form.addEventListener('submit', async e => {
        e.preventDefault();
        const title    = document.getElementById('task-title').value.trim();
        const desc     = document.getElementById('task-desc').value.trim();
        const priority = document.getElementById('task-priority').value;
        const category = document.getElementById('task-category').value;
        const dueRaw   = document.getElementById('task-due').value;
        const dueDate  = dueRaw ? new Date(dueRaw).toISOString() : null;

        if (!title) return;

        if (editingTaskId) {
            const existing = allTasks.find(t => t.id === editingTaskId);
            await updateTask(editingTaskId, {
                id:          editingTaskId,
                title,
                description: desc,
                isCompleted: existing ? existing.isCompleted : false,
                priority,
                category,
                dueDate
            });
        } else {
            await addTask({ title, description: desc, isCompleted: false, priority, category, dueDate });
        }
        closeModal();
    });

    // Confirm delete modal
    const confirmModal = document.getElementById('confirm-modal');
    document.getElementById('close-confirm-btn').addEventListener('click', () => confirmModal.classList.remove('open'));
    document.getElementById('cancel-confirm-btn').addEventListener('click', () => confirmModal.classList.remove('open'));
    confirmModal.addEventListener('click', e => { if (e.target === confirmModal) confirmModal.classList.remove('open'); });

    document.getElementById('confirm-delete-btn').addEventListener('click', async () => {
        if (pendingDeleteId !== null) {
            await deleteTask(pendingDeleteId);
            pendingDeleteId = null;
        }
        confirmModal.classList.remove('open');
    });

    // Expose openModal for task item edit buttons
    window._openEditModal = openModal;
}

function triggerDelete(id) {
    pendingDeleteId = id;
    document.getElementById('confirm-modal').classList.add('open');
}

/* ═══════════════════════════════════════════
   SEARCH & FILTERS
═══════════════════════════════════════════ */
function initSearch() {
    document.getElementById('search-input').addEventListener('input', () => {
        renderCurrentView();
    });
}

function initFilters() {
    ['filter-priority', 'filter-category', 'sort-by'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', applyFilters);
    });

    const bulkDeleteBtn = document.getElementById('bulk-delete-btn');
    if (bulkDeleteBtn) {
        bulkDeleteBtn.addEventListener('click', async () => {
            if (selectedTaskIds.size === 0) return;
            if (!confirm(`Delete ${selectedTaskIds.size} selected task(s)?`)) return;
            for (const id of selectedTaskIds) {
                await fetch(`${API_URL}/${id}`, { method: 'DELETE' });
            }
            selectedTaskIds.clear();
            await fetchTasks();
        });
    }
}

function applyFilters() { renderCurrentView(); }

function getSearchQuery() {
    return (document.getElementById('search-input')?.value || '').toLowerCase().trim();
}

function getFilteredTasks(tasks) {
    const q        = getSearchQuery();
    const priority = document.getElementById('filter-priority')?.value || '';
    const category = document.getElementById('filter-category')?.value || currentCategory || '';
    const sortBy   = document.getElementById('sort-by')?.value || 'newest';

    let filtered = tasks.filter(t => {
        if (q && !t.title.toLowerCase().includes(q) && !t.description.toLowerCase().includes(q)) return false;
        if (priority && t.priority !== priority) return false;
        if (category && t.category !== category) return false;
        return true;
    });

    filtered.sort((a, b) => {
        switch (sortBy) {
            case 'oldest':   return new Date(a.createdAt) - new Date(b.createdAt);
            case 'due':      return (a.dueDate ? new Date(a.dueDate) : Infinity) - (b.dueDate ? new Date(b.dueDate) : Infinity);
            case 'priority': return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
            case 'alpha':    return a.title.localeCompare(b.title);
            default:         return new Date(b.createdAt) - new Date(a.createdAt);
        }
    });

    return filtered;
}

/* ═══════════════════════════════════════════
   RENDER ENGINE
═══════════════════════════════════════════ */
function updateAll() {
    updateKPIs();
    updateBadges();
    updateCharts();
    renderCurrentView();
}

function renderCurrentView() {
    switch (currentView) {
        case 'dashboard': renderDashboard(); break;
        case 'all':       renderList('all-task-list',       allTasks,                              'all-empty');       break;
        case 'active':    renderList('active-task-list',    allTasks.filter(t => !t.isCompleted),  'active-empty');    break;
        case 'completed': renderList('completed-task-list', allTasks.filter(t => t.isCompleted),   'completed-empty'); break;
        case 'overdue':   renderList('overdue-task-list',   allTasks.filter(t => isOverdue(t)),    'overdue-empty');   break;
    }
    lucide.createIcons();
}

function renderDashboard() {
    const recent = [...allTasks]
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 6);
    renderTaskItems('recent-task-list', recent, false);
}

function renderList(listId, baseTasks, emptyId) {
    const filtered = getFilteredTasks(baseTasks);
    renderTaskItems(listId, filtered, true);

    const emptyEl = document.getElementById(emptyId);
    if (emptyEl) emptyEl.style.display = filtered.length === 0 ? 'flex' : 'none';

    // Bulk select
    const bulkBtn = document.getElementById('bulk-delete-btn');
    if (bulkBtn) bulkBtn.style.display = selectedTaskIds.size > 0 ? 'inline-flex' : 'none';
}

function renderTaskItems(listId, tasks, showBulk) {
    const list = document.getElementById(listId);
    if (!list) return;
    list.innerHTML = '';

    tasks.forEach(task => {
        const li = document.createElement('li');
        li.className = `task-item ${task.isCompleted ? 'completed-item' : ''} ${isOverdue(task) ? 'overdue-item' : ''}`;
        li.dataset.id = task.id;

        const dueFmt = formatDueDate(task.dueDate);
        const overdue = isOverdue(task);

        let agingClass = '';
        if (task.rescheduleCount >= 3) agingClass = 'task-aging-2';
        else if (task.rescheduleCount >= 1) agingClass = 'task-aging-1';

        li.innerHTML = `
            ${showBulk ? `<input type="checkbox" class="bulk-select" data-id="${task.id}" ${selectedTaskIds.has(task.id) ? 'checked' : ''} aria-label="Select task">` : ''}
            <div class="task-check ${task.isCompleted ? 'checked' : ''}" data-id="${task.id}" role="checkbox" aria-checked="${task.isCompleted}" tabindex="0">
                <i data-lucide="check"></i>
            </div>
            <div class="task-body ${agingClass}" data-id="${task.id}">
                <div class="task-title-text">${escapeHtml(task.title)}</div>
                ${task.description ? `<div class="task-desc-text">${escapeHtml(task.description)}</div>` : ''}
                <div class="task-meta">
                    <span class="badge badge-${task.priority}">${PRIORITY_LABEL[task.priority] || task.priority}</span>
                    <span class="badge-cat">${CATEGORY_EMOJI[task.category] || '📌'} ${capitalize(task.category)}</span>
                    <span class="badge-energy ${task.energyLevel}">⚡ ${capitalize(task.energyLevel)}</span>
                    ${dueFmt ? `<span class="task-due ${overdue ? 'overdue' : ''}"><i data-lucide="calendar"></i>${overdue ? '⚠ Overdue · ' : ''}${dueFmt}</span>` : ''}
                </div>
            </div>
            <div class="task-actions">
                <button class="action-btn edit" data-id="${task.id}" aria-label="Edit task"><i data-lucide="pencil"></i></button>
                <button class="action-btn delete" data-id="${task.id}" aria-label="Delete task"><i data-lucide="trash-2"></i></button>
            </div>
        `;

        // Checkbox toggle
        li.querySelector('.task-check').addEventListener('click', () => toggleTask(task));
        li.querySelector('.task-check').addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleTask(task); }
        });

        // Body click = edit
        li.querySelector('.task-body').addEventListener('click', () => window._openEditModal(task));

        // Edit button
        li.querySelector('.action-btn.edit').addEventListener('click', e => {
            e.stopPropagation();
            window._openEditModal(task);
        });

        // Delete button
        li.querySelector('.action-btn.delete').addEventListener('click', e => {
            e.stopPropagation();
            triggerDelete(task.id);
        });

        // Bulk select
        if (showBulk) {
            li.querySelector('.bulk-select').addEventListener('change', e => {
                if (e.target.checked) selectedTaskIds.add(task.id);
                else selectedTaskIds.delete(task.id);
                const bulkBtn = document.getElementById('bulk-delete-btn');
                if (bulkBtn) bulkBtn.style.display = selectedTaskIds.size > 0 ? 'inline-flex' : 'none';
            });
        }

        list.appendChild(li);
    });
}

async function toggleTask(task) {
    await updateTask(task.id, {
        id:          task.id,
        title:       task.title,
        description: task.description,
        isCompleted: !task.isCompleted,
        priority:    task.priority,
        category:    task.category,
        dueDate:     task.dueDate
    });
}

/* ═══════════════════════════════════════════
   KPI CARDS
═══════════════════════════════════════════ */
function updateKPIs() {
    const total     = allTasks.length;
    const completed = allTasks.filter(t => t.isCompleted).length;
    const active    = allTasks.filter(t => !t.isCompleted).length;
    const overdue   = allTasks.filter(t => isOverdue(t)).length;
    const rate      = total > 0 ? Math.round((completed / total) * 100) : 0;

    animateNumber('kpi-total-val',     total);
    animateNumber('kpi-completed-val', completed);
    animateNumber('kpi-active-val',    active);
    animateNumber('kpi-overdue-val',   overdue);

    // Deltas
    setText('kpi-total-delta span',     `${rate}% completion rate`);
    setText('kpi-completed-delta span', `${rate}% of total`);
    setText('kpi-active-delta span',    `${total > 0 ? Math.round((active / total) * 100) : 0}% remaining`);
    setText('kpi-overdue-delta span',   overdue > 0 ? `${overdue} need attention` : 'All on time!');
}

function updateBadges() {
    const active  = allTasks.filter(t => !t.isCompleted).length;
    const overdue = allTasks.filter(t => isOverdue(t)).length;

    setText('badge-all',     allTasks.length);
    setText('badge-active',  active);
    setText('badge-overdue', overdue);
}

/* ═══════════════════════════════════════════
   CHARTS
═══════════════════════════════════════════ */
function initCharts() {
    // Activity Chart
    const actCtx = document.getElementById('activityChart')?.getContext('2d');
    if (!actCtx) return;

    activityChart = new Chart(actCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'Created',
                    data: [],
                    borderColor: '#3d9c94',
                    backgroundColor: 'rgba(61,156,148,0.1)',
                    fill: true,
                    tension: 0.4,
                    pointRadius: 4,
                    pointBackgroundColor: '#3d9c94',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2
                },
                {
                    label: 'Completed',
                    data: [],
                    borderColor: '#5c6bc0',
                    backgroundColor: 'rgba(92,107,192,0.08)',
                    fill: true,
                    tension: 0.4,
                    pointRadius: 4,
                    pointBackgroundColor: '#5c6bc0',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } },
            scales: {
                x: { grid: { display: false }, ticks: { color: '#718096', font: { size: 11 } } },
                y: {
                    beginAtZero: true,
                    ticks: { color: '#718096', font: { size: 11 }, stepSize: 1 },
                    grid: { color: 'rgba(0,0,0,0.04)' }
                }
            }
        }
    });

    // Completion Ring
    const ringCtx = document.getElementById('completionRing')?.getContext('2d');
    if (!ringCtx) return;

    completionRing = new Chart(ringCtx, {
        type: 'doughnut',
        data: {
            datasets: [{
                data: [0, 100],
                backgroundColor: ['#3d9c94', '#f0f4f3'],
                borderWidth: 0,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            cutout: '72%',
            plugins: { legend: { display: false }, tooltip: { enabled: false } },
            animation: { animateRotate: true, duration: 800 }
        }
    });
}

function updateCharts() {
    updateActivityChart();
    updateCompletionRing();
    updatePriorityBars();
}

function updateActivityChart() {
    if (!activityChart) return;
    const days = getLast7Days();
    const labels = days.map(d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));

    const created = days.map(d => {
        const next = new Date(d); next.setDate(next.getDate() + 1);
        return allTasks.filter(t => {
            const c = new Date(t.createdAt);
            return c >= d && c < next;
        }).length;
    });

    // Simulate "completed on day" using createdAt of completed tasks (backend doesn't track completedAt yet)
    const completed = days.map(d => {
        const next = new Date(d); next.setDate(next.getDate() + 1);
        return allTasks.filter(t => {
            const c = new Date(t.createdAt);
            return t.isCompleted && c >= d && c < next;
        }).length;
    });

    activityChart.data.labels = labels;
    activityChart.data.datasets[0].data = created;
    activityChart.data.datasets[1].data = completed;
    activityChart.update('active');
}

function updateCompletionRing() {
    if (!completionRing) return;
    const total = allTasks.length;
    const done  = allTasks.filter(t => t.isCompleted).length;
    const pct   = total > 0 ? Math.round((done / total) * 100) : 0;

    completionRing.data.datasets[0].data = [pct, 100 - pct];
    completionRing.update('active');

    const ringText = document.getElementById('ring-pct-text');
    if (ringText) ringText.textContent = `${pct}%`;
}

function updatePriorityBars() {
    const container = document.getElementById('priority-bars');
    if (!container) return;

    const total = allTasks.length || 1;
    const priorities = ['critical', 'high', 'medium', 'low'];

    container.innerHTML = priorities.map(p => {
        const count = allTasks.filter(t => t.priority === p).length;
        const pct   = Math.round((count / total) * 100);
        return `
            <div class="priority-bar-row">
                <div class="priority-bar-meta">
                    <span>${PRIORITY_LABEL[p]}</span>
                    <span>${count} (${pct}%)</span>
                </div>
                <div class="priority-bar-track">
                    <div class="priority-bar-fill" style="width:${pct}%; background:${PRIORITY_COLOR[p]}"></div>
                </div>
            </div>
        `;
    }).join('');
}

/* ═══════════════════════════════════════════
   UTILITY HELPERS
═══════════════════════════════════════════ */
function animateNumber(id, target) {
    const el = document.getElementById(id);
    if (!el) return;
    const start = parseInt(el.textContent) || 0;
    if (start === target) return;
    const step = (target - start) / 18;
    let current = start;
    const tick = () => {
        current += step;
        if ((step > 0 && current >= target) || (step < 0 && current <= target)) {
            el.textContent = target;
            return;
        }
        el.textContent = Math.round(current);
        requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
}

function setText(selector, value) {
    const el = document.querySelector(`#${selector}`) || document.querySelector(selector);
    if (el) el.textContent = value;
}

function capitalize(str) {
    return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
}

function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/* ═══════════════════════════════════════════
   NEW FEATURES (NLP, Automations, Toggles)
   ═══════════════════════════════════════════ */
function initDensityToggle() {
    const btn = document.getElementById('density-toggle');
    if (!btn) return;
    btn.addEventListener('click', () => {
        document.querySelectorAll('.task-list').forEach(list => list.classList.toggle('compact'));
    });
}

function initCommandPalette() {
    const palette = document.getElementById('command-palette');
    const input = document.getElementById('cmd-input');
    const results = document.getElementById('cmd-results');
    if (!palette) return;

    window.addEventListener('keydown', e => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
            e.preventDefault();
            palette.classList.add('open');
            input.focus();
        }
        if (e.key === 'Escape' && palette.classList.contains('open')) {
            palette.classList.remove('open');
        }
    });

    palette.addEventListener('click', e => {
        if (e.target === palette) palette.classList.remove('open');
    });
}

function initQuickAdd() {
    const form = document.getElementById('quick-add-form');
    const input = document.getElementById('quick-add-input');
    const preview = document.getElementById('quick-add-preview');
    if (!form) return;

    input.addEventListener('input', () => {
        const val = input.value;
        if (!val) {
            preview.style.display = 'none';
            return;
        }
        const parsed = parseQuickAdd(val);
        preview.style.display = 'block';
        preview.innerHTML = `
            <span class="badge badge-${parsed.priority}">${parsed.priority}</span>
            <span class="badge-cat">${parsed.category}</span>
            <span class="badge-energy ${parsed.energyLevel}">⚡ ${parsed.energyLevel}</span>
            ${parsed.dueDate ? `<span>📅 ${new Date(parsed.dueDate).toLocaleDateString()}</span>` : ''}
        `;
    });

    form.addEventListener('submit', async e => {
        e.preventDefault();
        const val = input.value;
        if (!val) return;
        const parsed = parseQuickAdd(val);
        await addTask({
            title: parsed.title,
            priority: parsed.priority,
            category: parsed.category,
            energyLevel: parsed.energyLevel,
            dueDate: parsed.dueDate
        });
        input.value = '';
        preview.style.display = 'none';
    });
}

function parseQuickAdd(text) {
    let title = text;
    let priority = 'medium';
    let energyLevel = 'medium';
    let dueDateStr = null;

    if (/(?:!critical|#critical)/i.test(title)) priority = 'critical';
    else if (/(?:!high|#high|p1)/i.test(title)) priority = 'high';
    else if (/(?:!low|#low|p3)/i.test(title)) priority = 'low';

    if (/(?:high energy)/i.test(title)) energyLevel = 'high';
    else if (/(?:low energy)/i.test(title)) energyLevel = 'low';

    let category = autoCategorize(title);

    const today = new Date();
    if (/\btomorrow\b/i.test(title)) {
        today.setDate(today.getDate() + 1);
        today.setHours(12,0,0,0);
        dueDateStr = today.toISOString();
    } else if (/\btoday\b/i.test(title)) {
        today.setHours(18,0,0,0);
        dueDateStr = today.toISOString();
    }

    title = title.replace(/(?:!critical|#critical|!high|#high|p1|!low|#low|p3|high energy|low energy|tomorrow|today)/ig, '').trim();
    title = title.replace(/\s+/g, ' ');

    return { title: title || 'New Task', priority, category, energyLevel, dueDate: dueDateStr };
}

function autoCategorize(text) {
    text = text.toLowerCase();
    if (/(cook|buy|grocery|shop|order|milk|egg)/.test(text)) return 'shopping';
    if (/(workout|run|gym|doctor|meditate|sleep)/.test(text)) return 'health';
    if (/(email|report|meeting|client|presentation)/.test(text)) return 'work';
    if (/(clean|wash|laundry|call)/.test(text)) return 'personal';
    return 'general';
}

function checkDailyDigest() {
    const lastDigest = localStorage.getItem('lastDigestDate');
    const todayStr = new Date().toDateString();
    if (lastDigest === todayStr) return;

    const modal = document.getElementById('digest-modal');
    const content = document.getElementById('digest-content');
    if (!modal) return;

    const active = allTasks.filter(t => !t.isCompleted);
    const overdue = active.filter(t => isOverdue(t));
    const highEnergy = active.filter(t => t.energyLevel === 'high');

    content.innerHTML = `
        <p>Good morning! You have <strong>${active.length} tasks</strong> remaining.</p>
        ${overdue.length > 0 ? `<p style="color: var(--red);">⚠ ${overdue.length} tasks are overdue!</p>` : ''}
        ${highEnergy.length > 0 ? `<p>You have ${highEnergy.length} high-energy tasks. Tackle them before noon!</p>` : ''}
    `;

    modal.classList.add('open');
    document.getElementById('close-digest-btn').onclick = () => modal.classList.remove('open');
    document.getElementById('ack-digest-btn').onclick = () => {
        modal.classList.remove('open');
        localStorage.setItem('lastDigestDate', todayStr);
    };
}

// Call automations when fetchTasks completes successfully
const originalUpdateAll = updateAll;
updateAll = async function() {
    originalUpdateAll();
    
    // Check Daily Digest
    setTimeout(checkDailyDigest, 1000);
    
    // Auto-Reprioritize
    const now = new Date();
    const next24 = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    for (const t of allTasks) {
        if (!t.isCompleted && t.priority === 'medium' && t.dueDate) {
            const due = new Date(t.dueDate);
            if (due < next24 && due > now) {
                // Auto bump to high
                await updateTask(t.id, { ...t, priority: 'high' });
            }
        }
    }

    // Weekly Retro Computation
    computeWeeklyRetro();
};

function computeWeeklyRetro() {
    const retroContent = document.getElementById('retro-content');
    if (!retroContent) return;

    const days = getLast7Days();
    const startOfWeek = days[0];

    const completedThisWeek = allTasks.filter(t => t.isCompleted && t.completedAt && new Date(t.completedAt) >= startOfWeek);
    const chronicProcrastinators = allTasks.filter(t => !t.isCompleted && t.rescheduleCount >= 3);

    retroContent.innerHTML = `
        <div style="line-height: 1.6; color: var(--text-main);">
            <h3 style="margin-bottom: 8px;">Weekly Snapshot</h3>
            <p>✅ You completed <strong>${completedThisWeek.length} tasks</strong> in the last 7 days.</p>
            ${chronicProcrastinators.length > 0 ? 
                `<p style="margin-top: 10px; color: var(--red);">⚠ Warning: You have <strong>${chronicProcrastinators.length} tasks</strong> that have been rescheduled 3 or more times. Time to either do them or delete them!</p>` : 
                `<p style="margin-top: 10px; color: var(--green);">🎉 Great job! No chronic procrastination detected this week.</p>`
            }
        </div>
    `;
}