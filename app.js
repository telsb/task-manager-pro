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
let densityCompact = false;

/* ─── Priority helpers ─── */
const PRIORITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };
const PRIORITY_COLOR = { critical: '#e53e3e', high: '#e67e22', medium: '#d69e2e', low: '#38a169' };
const PRIORITY_LABEL = { critical: '🔴 Critical', high: '🟠 High', medium: '🟡 Medium', low: '🟢 Low' };
const CATEGORY_EMOJI = { general: '📌', work: '💼', personal: '👤', shopping: '🛒', health: '❤️' };

/* ─── Init ─── */
document.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons();
    setHeaderDate();
    initClock();
    initHeaderNav();
    initModal();
    initSearch();
    initFilters();
    initCharts();
    initTabs();
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
   HEADER NAV
═══════════════════════════════════════════ */
function initHeaderNav() {
    document.querySelectorAll('.header-nav-btn[data-view]').forEach(btn => {
        btn.addEventListener('click', e => {
            e.preventDefault();
            switchView(btn.dataset.view);
        });
    });

    document.querySelectorAll('.see-all-link[data-view]').forEach(link => {
        link.addEventListener('click', e => {
            e.preventDefault();
            switchView(link.dataset.view || 'all');
        });
    });

    // Stat strip clicks
    document.querySelectorAll('.stat-item[data-view]').forEach(item => {
        item.addEventListener('click', () => switchView(item.dataset.view));
        item.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); switchView(item.dataset.view); }
        });
    });
}

function switchView(viewName) {
    currentView = viewName;
    currentCategory = null;

    // Update nav highlights
    document.querySelectorAll('.header-nav-btn[data-view]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === viewName);
    });

    // Swap views
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const target = document.getElementById(`view-${viewName}`);
    if (target) target.classList.add('active');

    // Update header title
    const titles = {
        dashboard: ['Dashboard', 'Track and manage your tasks'],
        all:       ['All Tasks', 'Browse and filter every task'],
        active:    ['Active Tasks', 'Tasks in progress'],
        completed: ['Completed Tasks', "Tasks you've finished"],
        overdue:   ['Overdue Tasks', 'Tasks past their due date']
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
    loader.innerHTML = '<span>⏳ Waking up server… (this may take ~30s on first load)</span>';
    loader.classList.remove('hidden');

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 90000);
        const resp = await fetch(API_URL, { signal: controller.signal });
        clearTimeout(timeout);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        allTasks = (await resp.json()).map(normalizeTask);
        loader.classList.add('hidden');
        updateAll();
    } catch (err) {
        if (err.name === 'AbortError') {
            loader.innerHTML = '<span>❌ Server took too long. Retrying…</span>';
        } else {
            loader.innerHTML = `<span>⚠️ Could not connect — retrying in 8s… (${err.message})</span>`;
        }
        console.error('fetchTasks error:', err);
        setTimeout(fetchTasks, 8000);
    }
}

function normalizeTask(t) {
    return {
        id:             t.id ?? t.Id,
        title:          t.title ?? t.Title ?? '',
        description:    t.description ?? t.Description ?? '',
        isCompleted:    t.isCompleted ?? t.IsCompleted ?? false,
        createdAt:      t.createdAt ?? t.CreatedAt ?? new Date().toISOString(),
        completedAt:    t.completedAt ?? t.CompletedAt ?? null,
        priority:       (t.priority ?? t.Priority ?? 'medium').toLowerCase(),
        dueDate:        t.dueDate ?? t.DueDate ?? null,
        category:       (t.category ?? t.Category ?? 'general').toLowerCase(),
        energyLevel:    (t.energyLevel ?? t.EnergyLevel ?? 'medium').toLowerCase(),
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
    } catch (err) { console.error('addTask error:', err); }
}

async function updateTask(id, payload) {
    try {
        await fetch(`${API_URL}/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        await fetchTasks();
    } catch (err) { console.error('updateTask error:', err); }
}

async function deleteTask(id) {
    try {
        await fetch(`${API_URL}/${id}`, { method: 'DELETE' });
        await fetchTasks();
    } catch (err) { console.error('deleteTask error:', err); }
}

/* ═══════════════════════════════════════════
   MODAL — ADD / EDIT
═══════════════════════════════════════════ */
function initModal() {
    const modal     = document.getElementById('task-modal');
    const openBtn   = document.getElementById('open-modal-btn');
    const closeBtn  = document.getElementById('close-modal-btn');
    const cancelBtn = document.getElementById('cancel-modal-btn');
    const form      = document.getElementById('task-form');
    const saveBtn   = document.getElementById('save-task-btn');

    const openModal = (task = null) => {
        editingTaskId = task ? task.id : null;
        document.getElementById('modal-title').textContent = task ? 'Edit Task' : 'New Task';
        saveBtn.innerHTML = `<i data-lucide="${task ? 'save' : 'plus'}"></i> ${task ? 'Save Changes' : 'Add Task'}`;

        document.getElementById('edit-task-id').value  = task ? task.id : '';
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

    openBtn.addEventListener('click',   () => openModal());
    closeBtn.addEventListener('click',  closeModal);
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
                id: editingTaskId, title, description: desc,
                isCompleted: existing ? existing.isCompleted : false,
                priority, category, dueDate,
                energyLevel: existing ? existing.energyLevel : 'medium',
                rescheduleCount: existing ? existing.rescheduleCount : 0
            });
        } else {
            await addTask({ title, description: desc, isCompleted: false, priority, category, dueDate, energyLevel: 'medium' });
        }
        closeModal();
    });

    // Confirm delete
    const confirmModal = document.getElementById('confirm-modal');
    document.getElementById('close-confirm-btn').addEventListener('click',  () => confirmModal.classList.remove('open'));
    document.getElementById('cancel-confirm-btn').addEventListener('click', () => confirmModal.classList.remove('open'));
    confirmModal.addEventListener('click', e => { if (e.target === confirmModal) confirmModal.classList.remove('open'); });
    document.getElementById('confirm-delete-btn').addEventListener('click', async () => {
        if (pendingDeleteId !== null) { await deleteTask(pendingDeleteId); pendingDeleteId = null; }
        confirmModal.classList.remove('open');
    });

    // Daily Digest
    const digestModal = document.getElementById('digest-modal');
    if (digestModal) {
        document.getElementById('close-digest-btn').addEventListener('click', () => digestModal.classList.remove('open'));
        document.getElementById('ack-digest-btn').addEventListener('click', () => {
            digestModal.classList.remove('open');
            localStorage.setItem('lastDigestDate', new Date().toDateString());
        });
    }

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
    document.getElementById('search-input').addEventListener('input', () => renderCurrentView());
}

function initFilters() {
    ['filter-priority', 'filter-category', 'sort-by'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', () => renderCurrentView());
    });

    const bulkBtn = document.getElementById('bulk-delete-btn');
    if (bulkBtn) {
        bulkBtn.addEventListener('click', async () => {
            if (selectedTaskIds.size === 0) return;
            if (!confirm(`Delete ${selectedTaskIds.size} selected task(s)?`)) return;
            for (const id of selectedTaskIds) await fetch(`${API_URL}/${id}`, { method: 'DELETE' });
            selectedTaskIds.clear();
            await fetchTasks();
        });
    }
}

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
    computeWeeklyRetro();
    checkDailyDigest();
    autoReprioritize();
    checkDeadlines();
}

function renderCurrentView() {
    switch (currentView) {
        case 'dashboard': renderDashboard(); break;
        case 'all':       renderList('all-task-list',       allTasks,                             'all-empty');      break;
        case 'active':    renderList('active-task-list',    allTasks.filter(t => !t.isCompleted), 'active-empty');   break;
        case 'completed': renderList('completed-task-list', allTasks.filter(t => t.isCompleted),  'completed-empty'); break;
        case 'overdue':   renderList('overdue-task-list',   allTasks.filter(t => isOverdue(t)),   'overdue-empty');  break;
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
    const bulkBtn = document.getElementById('bulk-delete-btn');
    if (bulkBtn) bulkBtn.style.display = selectedTaskIds.size > 0 ? 'inline-flex' : 'none';
}

function renderTaskItems(listId, tasks, showBulk) {
    const list = document.getElementById(listId);
    if (!list) return;
    if (densityCompact) list.classList.add('compact'); else list.classList.remove('compact');
    list.innerHTML = '';

    tasks.forEach(task => {
        const li = document.createElement('li');
        li.className = `task-item ${task.isCompleted ? 'completed-item' : ''} ${isOverdue(task) ? 'overdue-item' : ''}`;
        li.dataset.id = task.id;

        const dueFmt  = formatDueDate(task.dueDate);
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
                    ${task.energyLevel && task.energyLevel !== 'medium' ? `<span class="badge-energy ${task.energyLevel}">⚡ ${capitalize(task.energyLevel)}</span>` : ''}
                    ${dueFmt ? `<span class="task-due ${overdue ? 'overdue' : ''}"><i data-lucide="calendar"></i>${overdue ? '⚠ Overdue · ' : ''}${dueFmt}</span>` : ''}
                </div>
            </div>
            <div class="task-actions">
                <button class="action-btn edit" data-id="${task.id}" aria-label="Edit task"><i data-lucide="pencil"></i></button>
                <button class="action-btn delete" data-id="${task.id}" aria-label="Delete task"><i data-lucide="trash-2"></i></button>
            </div>
        `;

        li.querySelector('.task-check').addEventListener('click', () => toggleTask(task));
        li.querySelector('.task-check').addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleTask(task); }
        });
        li.querySelector('.task-body').addEventListener('click', () => window._openEditModal(task));
        li.querySelector('.action-btn.edit').addEventListener('click', e => { e.stopPropagation(); window._openEditModal(task); });
        li.querySelector('.action-btn.delete').addEventListener('click', e => { e.stopPropagation(); triggerDelete(task.id); });

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
        dueDate:     task.dueDate,
        energyLevel: task.energyLevel,
        rescheduleCount: task.rescheduleCount
    });
}

/* ═══════════════════════════════════════════
   KPI STRIP
═══════════════════════════════════════════ */
function updateKPIs() {
    const total     = allTasks.length;
    const completed = allTasks.filter(t => t.isCompleted).length;
    const active    = allTasks.filter(t => !t.isCompleted).length;
    const overdue   = allTasks.filter(t => isOverdue(t)).length;

    animateNumber('kpi-total-val',     total);
    animateNumber('kpi-completed-val', completed);
    animateNumber('kpi-active-val',    active);
    animateNumber('kpi-overdue-val',   overdue);
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
    const actCtx = document.getElementById('activityChart')?.getContext('2d');
    if (!actCtx) return;
    activityChart = new Chart(actCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                { label: 'Created',   data: [], borderColor: '#3d9c94', backgroundColor: 'rgba(61,156,148,0.08)', fill: true, tension: 0.4, pointRadius: 4, pointBackgroundColor: '#3d9c94', pointBorderColor: '#fff', pointBorderWidth: 2 },
                { label: 'Completed', data: [], borderColor: '#5c6bc0', backgroundColor: 'rgba(92,107,192,0.06)', fill: true, tension: 0.4, pointRadius: 4, pointBackgroundColor: '#5c6bc0', pointBorderColor: '#fff', pointBorderWidth: 2 }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } },
            scales: {
                x: { grid: { display: false }, ticks: { color: '#718096', font: { size: 11 } } },
                y: { beginAtZero: true, ticks: { color: '#718096', font: { size: 11 }, stepSize: 1 }, grid: { color: 'rgba(0,0,0,0.04)' } }
            }
        }
    });

    const ringCtx = document.getElementById('completionRing')?.getContext('2d');
    if (!ringCtx) return;
    completionRing = new Chart(ringCtx, {
        type: 'doughnut',
        data: { datasets: [{ data: [0, 100], backgroundColor: ['#3d9c94', '#f0f4f3'], borderWidth: 0, hoverOffset: 4 }] },
        options: {
            responsive: true, maintainAspectRatio: true, cutout: '72%',
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
        return allTasks.filter(t => { const c = new Date(t.createdAt); return c >= d && c < next; }).length;
    });
    const completed = days.map(d => {
        const next = new Date(d); next.setDate(next.getDate() + 1);
        return allTasks.filter(t => { const c = new Date(t.createdAt); return t.isCompleted && c >= d && c < next; }).length;
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
    const sub = document.getElementById('completion-sub');
    if (sub) sub.textContent = total > 0 ? `${done} of ${total} tasks completed` : 'No tasks yet';
}

function updatePriorityBars() {
    const container = document.getElementById('priority-bars');
    if (!container) return;
    const total = allTasks.length || 1;
    container.innerHTML = ['critical', 'high', 'medium', 'low'].map(p => {
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
   TABS
═══════════════════════════════════════════ */
function initTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.dataset.tab;
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            const content = document.getElementById(`tab-${tabId}`);
            if (content) content.classList.add('active');
        });
    });
}

/* ═══════════════════════════════════════════
   DENSITY TOGGLE
═══════════════════════════════════════════ */
function initDensityToggle() {
    const btn = document.getElementById('density-toggle');
    if (!btn) return;
    btn.addEventListener('click', () => {
        densityCompact = !densityCompact;
        renderCurrentView();
    });
}

/* ═══════════════════════════════════════════
   COMMAND PALETTE (Ctrl+K)
═══════════════════════════════════════════ */
function initCommandPalette() {
    const palette = document.getElementById('command-palette');
    const input   = document.getElementById('cmd-input');
    const results = document.getElementById('cmd-results');
    if (!palette || !input) return;

    const VIEWS = [
        { label: 'Dashboard',       icon: 'layout-dashboard', view: 'dashboard' },
        { label: 'All Tasks',       icon: 'list-checks',      view: 'all' },
        { label: 'Active Tasks',    icon: 'clock',            view: 'active' },
        { label: 'Completed Tasks', icon: 'circle-check-big', view: 'completed' },
        { label: 'Overdue Tasks',   icon: 'triangle-alert',   view: 'overdue' },
    ];

    const open = () => { palette.classList.add('open'); input.value = ''; renderCmdResults(''); input.focus(); };
    const close = () => palette.classList.remove('open');

    document.getElementById('cmd-palette-btn').addEventListener('click', open);

    window.addEventListener('keydown', e => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); open(); }
        if (e.key === 'Escape' && palette.classList.contains('open')) close();
    });
    palette.addEventListener('click', e => { if (e.target === palette) close(); });

    input.addEventListener('input', () => renderCmdResults(input.value));

    function renderCmdResults(query) {
        results.innerHTML = '';
        const q = query.toLowerCase().trim();

        const navMatches = VIEWS.filter(v => !q || v.label.toLowerCase().includes(q));
        const taskMatches = q
            ? allTasks.filter(t => t.title.toLowerCase().includes(q)).slice(0, 5)
            : [];

        if (!navMatches.length && !taskMatches.length) {
            results.innerHTML = `<div class="cmd-empty">No results for "${query}"</div>`;
            return;
        }

        navMatches.forEach(v => {
            const li = document.createElement('li');
            li.className = 'cmd-result-item';
            li.innerHTML = `<i data-lucide="${v.icon}"></i><span>${v.label}</span>`;
            li.addEventListener('click', () => { switchView(v.view); close(); });
            results.appendChild(li);
        });

        taskMatches.forEach(t => {
            const li = document.createElement('li');
            li.className = 'cmd-result-item';
            li.innerHTML = `<i data-lucide="check-square"></i><span>${escapeHtml(t.title)}</span>`;
            li.addEventListener('click', () => { window._openEditModal(t); close(); });
            results.appendChild(li);
        });

        lucide.createIcons();
    }
}

/* ═══════════════════════════════════════════
   QUICK ADD (NLP)
═══════════════════════════════════════════ */
function initQuickAdd() {
    const form    = document.getElementById('quick-add-form');
    const input   = document.getElementById('quick-add-input');
    const preview = document.getElementById('quick-add-preview');
    if (!form) return;

    input.addEventListener('input', () => {
        const val = input.value.trim();
        if (!val) { preview.style.display = 'none'; return; }
        const p = parseQuickAdd(val);
        preview.style.display = 'flex';
        preview.innerHTML = `
            <span class="badge badge-${p.priority}">${p.priority}</span>
            <span class="badge-cat">${CATEGORY_EMOJI[p.category] || '📌'} ${capitalize(p.category)}</span>
            ${p.dueDate ? `<span style="font-size:0.78rem;color:var(--text-muted)">📅 ${new Date(p.dueDate).toLocaleDateString()}</span>` : ''}
        `;
    });

    form.addEventListener('submit', async e => {
        e.preventDefault();
        const val = input.value.trim();
        if (!val) return;
        const p = parseQuickAdd(val);
        await addTask({ title: p.title, description: '', isCompleted: false, priority: p.priority, category: p.category, energyLevel: p.energyLevel, dueDate: p.dueDate });
        input.value = '';
        preview.style.display = 'none';
    });
}

function parseQuickAdd(text) {
    let raw = text;
    let priority    = 'medium';
    let energyLevel = 'medium';
    let dueDate     = null;

    // Priority
    if (/(!critical|#critical)/i.test(raw)) { priority = 'critical'; }
    else if (/(!high|#high|\bp1\b)/i.test(raw)) { priority = 'high'; }
    else if (/(!low|#low|\bp3\b)/i.test(raw)) { priority = 'low'; }

    // Energy
    if (/\bhigh energy\b/i.test(raw)) energyLevel = 'high';
    else if (/\blow energy\b/i.test(raw)) energyLevel = 'low';

    // Due date
    const now = new Date();
    if (/\btomorrow\b/i.test(raw)) {
        const d = new Date(now); d.setDate(d.getDate() + 1); d.setHours(12, 0, 0, 0);
        dueDate = d.toISOString();
    } else if (/\btoday\b/i.test(raw)) {
        const d = new Date(now); d.setHours(18, 0, 0, 0);
        dueDate = d.toISOString();
    }

    // Strip keywords from title
    let title = raw
        .replace(/!critical|#critical|!high|#high|\bp1\b|!low|#low|\bp3\b|high energy|low energy|tomorrow|today/gi, '')
        .replace(/\s+/g, ' ').trim();
    if (!title) title = 'New Task';

    const category = autoCategorize(raw);
    return { title, priority, category, energyLevel, dueDate };
}

function autoCategorize(text) {
    const t = text.toLowerCase();
    if (/(cook|buy|grocery|shop|order|milk|egg|groceries|store)/.test(t)) return 'shopping';
    if (/(workout|run|gym|doctor|meditate|sleep|exercise|health|medicine)/.test(t)) return 'health';
    if (/(email|report|meeting|client|presentation|work|project|deadline)/.test(t)) return 'work';
    if (/(clean|wash|laundry|call|family|home|house)/.test(t)) return 'personal';
    return 'general';
}

/* ═══════════════════════════════════════════
   WEEKLY RETRO
═══════════════════════════════════════════ */
function computeWeeklyRetro() {
    const retroContent = document.getElementById('retro-content');
    if (!retroContent) return;
    const startOfWeek = getLast7Days()[0];
    const completedThisWeek = allTasks.filter(t => t.isCompleted && t.completedAt && new Date(t.completedAt) >= startOfWeek);
    const chronic = allTasks.filter(t => !t.isCompleted && t.rescheduleCount >= 3);
    retroContent.innerHTML = `
        <div style="line-height:1.7;">
            <p>✅ <strong>${completedThisWeek.length} tasks</strong> completed in the last 7 days.</p>
            ${chronic.length > 0
                ? `<p style="margin-top:10px;color:var(--red);">⚠ <strong>${chronic.length} task(s)</strong> rescheduled 3+ times — time to act or drop them!</p>`
                : `<p style="margin-top:10px;color:var(--green);">🎉 No chronic procrastination detected this week!</p>`
            }
        </div>
    `;
}

/* ═══════════════════════════════════════════
   DAILY DIGEST
═══════════════════════════════════════════ */
function checkDailyDigest() {
    const lastDigest = localStorage.getItem('lastDigestDate');
    if (lastDigest === new Date().toDateString()) return;
    const modal   = document.getElementById('digest-modal');
    const content = document.getElementById('digest-content');
    if (!modal || !content) return;
    const active  = allTasks.filter(t => !t.isCompleted);
    const overdue = active.filter(t => isOverdue(t));
    const hiEnergy = active.filter(t => t.energyLevel === 'high');
    content.innerHTML = `
        <p>Good morning! You have <strong>${active.length} active task${active.length !== 1 ? 's' : ''}</strong>.</p>
        ${overdue.length > 0 ? `<p style="margin-top:8px;color:var(--red);">⚠ ${overdue.length} task${overdue.length !== 1 ? 's are' : ' is'} overdue!</p>` : ''}
        ${hiEnergy.length > 0 ? `<p style="margin-top:8px;">⚡ ${hiEnergy.length} high-energy task${hiEnergy.length !== 1 ? 's' : ''} — tackle them before noon!</p>` : ''}
        ${active.length === 0 ? '<p style="margin-top:8px;color:var(--green);">🎉 Your task list is clear. Great job!</p>' : ''}
    `;
    modal.classList.add('open');
}

/* ═══════════════════════════════════════════
   AUTO-REPRIORITIZE
═══════════════════════════════════════════ */
async function autoReprioritize() {
    const now    = new Date();
    const next24 = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    for (const t of allTasks) {
        if (!t.isCompleted && t.priority === 'medium' && t.dueDate) {
            const due = new Date(t.dueDate);
            if (due > now && due < next24) {
                await updateTask(t.id, { ...t, priority: 'high' });
            }
        }
    }
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
            el.textContent = target; return;
        }
        el.textContent = Math.round(current);
        requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
}

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function capitalize(str) {
    return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
}

function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/* ═══════════════════════════════════════════
   LIVE CLOCK
═══════════════════════════════════════════ */
function initClock() {
    const el = document.getElementById('live-clock');
    if (!el) return;
    function tick() {
        const now = new Date();
        const hh = String(now.getHours()).padStart(2, '0');
        const mm = String(now.getMinutes()).padStart(2, '0');
        const ss = String(now.getSeconds()).padStart(2, '0');
        el.textContent = `${hh}:${mm}:${ss}`;
    }
    tick();
    setInterval(tick, 1000);
    // Also run deadline check every minute
    setInterval(checkDeadlines, 60 * 1000);
}

/* ═══════════════════════════════════════════
   DEADLINE TOAST NOTIFICATIONS
═══════════════════════════════════════════ */
// Track which task IDs we've already toasted so we don't spam
const _toastedIds = new Set();

function checkDeadlines() {
    const now = new Date();
    const soon = new Date(now.getTime() + 60 * 60 * 1000);     // 1 hour
    const verySoon = new Date(now.getTime() + 15 * 60 * 1000); // 15 minutes

    allTasks.forEach(task => {
        if (task.isCompleted || !task.dueDate) return;
        const due = new Date(task.dueDate);
        if (due < now) return; // already overdue, handled elsewhere

        const key15  = `15_${task.id}`;
        const key60  = `60_${task.id}`;

        // 15-minute warning (critical)
        if (due <= verySoon && !_toastedIds.has(key15)) {
            _toastedIds.add(key15);
            showDeadlineToast(task, due, 'critical');
        }
        // 1-hour warning
        else if (due <= soon && !_toastedIds.has(key60)) {
            _toastedIds.add(key60);
            showDeadlineToast(task, due, 'warning');
        }
    });
}

function showDeadlineToast(task, dueDate, level) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const now = new Date();
    const minsLeft = Math.round((dueDate - now) / 60000);
    const timeLabel = minsLeft <= 1 ? 'Due in less than a minute!'
                    : minsLeft < 60 ? `Due in ${minsLeft} minutes`
                    : 'Due in about 1 hour';

    const iconName  = level === 'critical' ? 'alarm-clock' : 'clock';
    const titleText = level === 'critical' ? '🚨 Deadline Imminent!' : '⏰ Upcoming Deadline';

    const toast = document.createElement('div');
    toast.className = `deadline-toast ${level}`;
    toast.innerHTML = `
        <div class="toast-icon"><i data-lucide="${iconName}"></i></div>
        <div class="toast-body">
            <div class="toast-title">${titleText}</div>
            <div class="toast-task">${escapeHtml(task.title)}</div>
            <div class="toast-time">${timeLabel} &middot; ${dueDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</div>
        </div>
        <button class="toast-close" aria-label="Dismiss">&times;</button>
    `;

    // Dismiss on close button
    toast.querySelector('.toast-close').addEventListener('click', e => {
        e.stopPropagation();
        dismissToast(toast);
    });

    // Click toast body to jump to task
    toast.addEventListener('click', () => {
        window._openEditModal(task);
        dismissToast(toast);
    });

    container.appendChild(toast);
    lucide.createIcons();

    // Auto-dismiss after 12 seconds
    setTimeout(() => dismissToast(toast), 12000);
}

function dismissToast(toast) {
    if (!toast.parentNode) return;
    toast.classList.add('toast-exit');
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
    // Fallback in case animation doesn't fire
    setTimeout(() => { if (toast.parentNode) toast.remove(); }, 400);
}