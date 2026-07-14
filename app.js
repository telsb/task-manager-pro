/* ═══════════════════════════════════════════
   TASKFLOW PRO — APP LOGIC
   ═══════════════════════════════════════════ */

const API_BASE = "https://task-manager-backend-vcm9.onrender.com/api";

/* ─── State ─── */
let allTasks = [];
let allUsers = [];
let currentView = 'dashboard';
let currentCategory = null;
let pendingDeleteId = null;
let editingTaskId = null;
let editingUserId = null;
let activityChart = null;
let completionRing = null;
let selectedTaskIds = new Set();
let densityCompact = false;
let currentUser = null;

/* ─── Priority helpers ─── */
const PRIORITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };
const PRIORITY_COLOR = { critical: '#e53e3e', high: '#e67e22', medium: '#d69e2e', low: '#38a169' };
const PRIORITY_LABEL = { critical: '🔴 Critical', high: '🟠 High', medium: '🟡 Medium', low: '🟢 Low' };
const CATEGORY_EMOJI = { general: '📌', work: '💼', personal: '👤', shopping: '🛒', health: '❤️' };

/* ─── Init ─── */
document.addEventListener('DOMContentLoaded', async () => {
    // Auth Check
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = 'login.html';
        return;
    }

    currentUser = {
        token: token,
        role: localStorage.getItem('role'),
        name: localStorage.getItem('name'),
        id: parseInt(localStorage.getItem('userId'))
    };

    document.body.dataset.role = currentUser.role;

    initUserProfile();
    lucide.createIcons();
    setHeaderDate();
    initClock();
    initHeaderNav();
    initTaskModal();
    initUserModal();
    initSearch();
    initFilters();
    initCharts();
    initTabs();
    initDensityToggle();
    initCommandPalette();
    initQuickAdd();
    
    await fetchTasks();
    if (currentUser.role === 'admin') {
        await fetchUsers();
    }
    await fetchGroups();
    initNotifications();
    initNewGroupModal();
    initBulkTaskModal();
});

/* ═══════════════════════════════════════════
   USER PROFILE & LOGOUT
═══════════════════════════════════════════ */
function initUserProfile() {
    document.getElementById('header-name').textContent = currentUser.name;
    document.getElementById('header-role').textContent = currentUser.role;
    document.getElementById('header-avatar').textContent = currentUser.name.charAt(0).toUpperCase();

    document.getElementById('logout-btn').addEventListener('click', async () => {
        try {
            await fetch(`${API_BASE}/auth/logout`, {
                method: 'POST',
                headers: { 'X-Session-Token': currentUser.token }
            });
        } catch (e) {} // ignore errors on logout
        localStorage.clear();
        window.location.href = 'login.html';
    });
}

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

    document.querySelectorAll('.stat-item[data-view]').forEach(item => {
        item.addEventListener('click', () => switchView(item.dataset.view));
    });
}

function switchView(viewName) {
    currentView = viewName;
    currentCategory = null;

    document.querySelectorAll('.header-nav-btn[data-view]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === viewName);
    });

    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const target = document.getElementById(`view-${viewName}`);
    if (target) target.classList.add('active');

    const titles = {
        dashboard: ['Dashboard', 'Track and manage your tasks'],
        all:       ['All Tasks', 'Browse and filter every task'],
        active:    ['Active Tasks', 'Tasks in progress'],
        completed: ['Completed Tasks', "Tasks you've finished"],
        overdue:   ['Overdue Tasks', 'Tasks past their due date'],
        groups:    ['Groups', 'Collaborate with your team'],
        users:     ['User Management', 'Manage team members and roles']
    };
    const [title, subtitle] = titles[viewName] || ['Tasks', ''];
    document.getElementById('page-title').textContent = title;
    document.getElementById('page-subtitle').textContent = subtitle;

    if (viewName === 'users') renderUsers();
    else if (viewName === 'groups') renderGroups();
    else renderCurrentView();
    lucide.createIcons();
}

/* ═══════════════════════════════════════════
   API CALLS - TASKS
═══════════════════════════════════════════ */
async function fetchTasks() {
    const loader = document.getElementById('loading-indicator');
    loader.innerHTML = '<span>⏳ Syncing tasks…</span>';
    loader.classList.remove('hidden');

    try {
        const cached = localStorage.getItem('taskCache');
        if (cached && allTasks.length === 0) {
            try { 
                allTasks = JSON.parse(cached); 
                updateAll(); 
            } catch {}
        }
        
        const resp = await fetch(`${API_BASE}/tasks`, { headers: { 'X-Session-Token': currentUser.token } });
        if (resp.status === 401) { localStorage.clear(); window.location.href = 'login.html'; return; }
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        allTasks = (await resp.json()).map(normalizeTask);
        localStorage.setItem('taskCache', JSON.stringify(allTasks));
        loader.classList.add('hidden');
        updateAll();
    } catch (err) {
        loader.innerHTML = `<span>⚠️ Could not connect — retrying in 8s…</span>`;
        setTimeout(fetchTasks, 8000);
    }
}

function normalizeTask(t) {
    return {
        id:             t.id,
        title:          t.title || '',
        description:    t.description || '',
        isCompleted:    t.isCompleted || false,
        createdAt:      t.createdAt || new Date().toISOString(),
        completedAt:    t.completedAt || null,
        priority:       (t.priority || 'medium').toLowerCase(),
        dueDate:        t.dueDate || null,
        category:       (t.category || 'general').toLowerCase(),
        energyLevel:    (t.energyLevel || 'medium').toLowerCase(),
        rescheduleCount: t.rescheduleCount || 0,
        assignedToUserId: t.assignedToUserId,
        assignedToName:   t.assignedToName
    };
}

async function addTask(payload) {
    if (currentUser.role !== 'admin') return;
    try {
        await fetch(`${API_BASE}/tasks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Session-Token': currentUser.token },
            body: JSON.stringify(payload)
        });
        await fetchTasks();
    } catch (err) { console.error('addTask error:', err); }
}

async function updateTask(id, payload) {
    try {
        await fetch(`${API_BASE}/tasks/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'X-Session-Token': currentUser.token },
            body: JSON.stringify(payload)
        });
        await fetchTasks();
    } catch (err) { console.error('updateTask error:', err); }
}

async function deleteTask(id) {
    if (currentUser.role !== 'admin') return;
    try {
        await fetch(`${API_BASE}/tasks/${id}`, { method: 'DELETE', headers: { 'X-Session-Token': currentUser.token } });
        await fetchTasks();
    } catch (err) { console.error('deleteTask error:', err); }
}

/* ═══════════════════════════════════════════
   API CALLS - USERS
═══════════════════════════════════════════ */
async function fetchUsers() {
    if (currentUser.role !== 'admin') return;
    try {
        const cached = localStorage.getItem('userCache');
        if (cached && allUsers.length === 0) {
            try { 
                allUsers = JSON.parse(cached); 
                populateAssigneeDropdown();
                if (currentView === 'users') renderUsers();
            } catch {}
        }

        const resp = await fetch(`${API_BASE}/users`, { headers: { 'X-Session-Token': currentUser.token } });
        if (!resp.ok) throw new Error();
        allUsers = await resp.json();
        localStorage.setItem('userCache', JSON.stringify(allUsers));
        populateAssigneeDropdown();
        if (currentView === 'users') renderUsers();
    } catch (err) { console.error('fetchUsers error:', err); }
}

function populateAssigneeDropdown() {
    const select = document.getElementById('task-assignee');
    if (!select) return;
    select.innerHTML = '<option value="">Unassigned</option>';
    allUsers.forEach(u => {
        const opt = document.createElement('option');
        opt.value = u.id;
        opt.textContent = u.name;
        select.appendChild(opt);
    });
}

async function saveUser(payload) {
    try {
        const url = payload.id ? `${API_BASE}/users/${payload.id}` : `${API_BASE}/users`;
        const method = payload.id ? 'PUT' : 'POST';
        const resp = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json', 'X-Session-Token': currentUser.token },
            body: JSON.stringify(payload)
        });
        if (!resp.ok) {
            const err = await resp.json();
            alert(err.error || 'Failed to save user');
            return false;
        }
        await fetchUsers();
        await fetchTasks(); // tasks might show updated unassigned statuses
        return true;
    } catch (err) { console.error('saveUser error:', err); return false; }
}

async function deleteUser(id) {
    if (!confirm('Are you sure you want to delete this user? Their tasks will become unassigned.')) return;
    try {
        const resp = await fetch(`${API_BASE}/users/${id}`, { method: 'DELETE', headers: { 'X-Session-Token': currentUser.token } });
        if (!resp.ok) {
            const err = await resp.json();
            alert(err.error || 'Failed to delete user');
            return;
        }
        await fetchUsers();
        await fetchTasks();
    } catch (err) { console.error('deleteUser error:', err); }
}

/* ═══════════════════════════════════════════
   TASK MODAL
═══════════════════════════════════════════ */
function initTaskModal() {
    const modal     = document.getElementById('task-modal');
    const openBtn   = document.getElementById('open-modal-btn');
    const closeBtn  = document.getElementById('close-modal-btn');
    const form      = document.getElementById('task-form');
    const saveBtn   = document.getElementById('save-task-btn');

    if (!openBtn) return;

    window._openTaskModal = (task = null) => {
        if (currentUser.role !== 'admin') return; // Users can't open the modal
        editingTaskId = task ? task.id : null;
        document.getElementById('modal-title').textContent = task ? 'Edit Task' : 'New Task';
        saveBtn.innerHTML = `<i data-lucide="${task ? 'save' : 'plus'}"></i> ${task ? 'Save Changes' : 'Add Task'}`;

        document.getElementById('edit-task-id').value  = task ? task.id : '';
        document.getElementById('task-title').value    = task ? task.title : '';
        document.getElementById('task-desc').value     = task ? task.description : '';
        document.getElementById('task-priority').value = task ? task.priority : 'medium';
        document.getElementById('task-category').value = task ? task.category : 'general';
        document.getElementById('task-due').value      = task && task.dueDate ? new Date(task.dueDate).toISOString().slice(0, 16) : '';
        
        const assigneeSelect = document.getElementById('task-assignee');
        if (assigneeSelect) assigneeSelect.value = task && task.assignedToUserId ? task.assignedToUserId : '';

        modal.classList.add('open');
        setTimeout(() => document.getElementById('task-title').focus(), 100);
        lucide.createIcons();
    };

    const closeModal = () => { modal.classList.remove('open'); editingTaskId = null; };

    openBtn.addEventListener('click', () => window._openTaskModal());
    closeBtn.addEventListener('click', closeModal);
    document.getElementById('cancel-modal-btn').addEventListener('click', closeModal);
    modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });

    form.addEventListener('submit', async e => {
        e.preventDefault();
        const title    = document.getElementById('task-title').value.trim();
        const desc     = document.getElementById('task-desc').value.trim();
        const priority = document.getElementById('task-priority').value;
        const category = document.getElementById('task-category').value;
        const dueRaw   = document.getElementById('task-due').value;
        const dueDate  = dueRaw ? new Date(dueRaw).toISOString() : null;
        const assignee = document.getElementById('task-assignee').value;
        const assignedToUserId = assignee ? parseInt(assignee) : null;
        if (!title) return;

        if (editingTaskId) {
            const existing = allTasks.find(t => t.id === editingTaskId);
            await updateTask(editingTaskId, {
                id: editingTaskId, title, description: desc,
                isCompleted: existing ? existing.isCompleted : false,
                priority, category, dueDate, assignedToUserId,
                energyLevel: existing ? existing.energyLevel : 'medium',
                rescheduleCount: existing ? existing.rescheduleCount : 0
            });
        } else {
            await addTask({ title, description: desc, isCompleted: false, priority, category, dueDate, assignedToUserId, energyLevel: 'medium' });
        }
        closeModal();
    });

    // Confirm task delete
    const confirmModal = document.getElementById('confirm-modal');
    document.getElementById('close-confirm-btn').addEventListener('click', () => confirmModal.classList.remove('open'));
    document.getElementById('cancel-confirm-btn').addEventListener('click', () => confirmModal.classList.remove('open'));
    document.getElementById('confirm-delete-btn').addEventListener('click', async () => {
        if (pendingDeleteId !== null) { await deleteTask(pendingDeleteId); pendingDeleteId = null; }
        confirmModal.classList.remove('open');
    });
}

function triggerDelete(id) {
    if (currentUser.role !== 'admin') return;
    pendingDeleteId = id;
    document.getElementById('confirm-modal').classList.add('open');
}

/* ═══════════════════════════════════════════
   USER MODAL (ADMIN ONLY)
═══════════════════════════════════════════ */
function initUserModal() {
    if (currentUser.role !== 'admin') return;
    const modal = document.getElementById('user-modal');
    const form = document.getElementById('user-form');
    
    document.getElementById('open-user-modal-btn').addEventListener('click', () => {
        editingUserId = null;
        document.getElementById('user-modal-title').textContent = 'New User';
        form.reset();
        document.getElementById('user-pw-req').style.display = 'inline';
        document.getElementById('user-password').required = true;
        modal.classList.add('open');
    });

    window._openEditUserModal = (user) => {
        editingUserId = user.id;
        document.getElementById('user-modal-title').textContent = 'Edit User';
        document.getElementById('user-name').value = user.name;
        document.getElementById('user-username').value = user.username;
        document.getElementById('user-role').value = user.role;
        document.getElementById('user-password').value = '';
        document.getElementById('user-password').required = false;
        document.getElementById('user-pw-req').style.display = 'none';
        const empIdEl = document.getElementById('user-employee-id');
        if (empIdEl) empIdEl.value = user.employeeId || '';
        modal.classList.add('open');
    };

    const closeModal = () => modal.classList.remove('open');
    document.getElementById('close-user-modal-btn').addEventListener('click', closeModal);
    document.getElementById('cancel-user-modal-btn').addEventListener('click', closeModal);

    form.addEventListener('submit', async e => {
        e.preventDefault();
        const empIdEl = document.getElementById('user-employee-id');
        const payload = {
            id: editingUserId,
            name: document.getElementById('user-name').value.trim(),
            username: document.getElementById('user-username').value.trim(),
            role: document.getElementById('user-role').value,
            password: document.getElementById('user-password').value,
            employeeId: empIdEl ? empIdEl.value.trim() : ''
        };
        const success = await saveUser(payload);
        if (success) closeModal();
    });
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
}

function getFilteredTasks(tasks) {
    const q        = (document.getElementById('search-input')?.value || '').toLowerCase().trim();
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
    autoReprioritize();
    checkDeadlines();
}

function renderCurrentView() {
    if (currentView === 'users') { renderUsers(); return; }
    
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
    const recent = [...allTasks].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 6);
    renderTaskItems('recent-task-list', recent, false);
}

function renderList(listId, baseTasks, emptyId) {
    const filtered = getFilteredTasks(baseTasks);
    renderTaskItems(listId, filtered, currentUser.role === 'admin');
    const emptyEl = document.getElementById(emptyId);
    if (emptyEl) emptyEl.style.display = filtered.length === 0 ? 'flex' : 'none';
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

        const assigneeBadge = (currentUser.role === 'admin' && task.assignedToName) 
            ? `<span class="badge-assignee"><i data-lucide="user"></i> ${task.assignedToName}</span>` 
            : '';

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
                    ${assigneeBadge}
                    ${dueFmt ? `<span class="task-due ${overdue ? 'overdue' : ''}"><i data-lucide="calendar"></i>${overdue ? '⚠ Overdue · ' : ''}${dueFmt}</span>` : ''}
                </div>
            </div>
            ${currentUser.role === 'admin' ? `
                <div class="task-actions">
                    <button class="action-btn edit" data-id="${task.id}" aria-label="Edit task"><i data-lucide="pencil"></i></button>
                    <button class="action-btn delete" data-id="${task.id}" aria-label="Delete task"><i data-lucide="trash-2"></i></button>
                </div>
            ` : ''}
        `;

        li.querySelector('.task-check').addEventListener('click', () => toggleTask(task));
        li.querySelector('.task-check').addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleTask(task); }
        });
        
        if (currentUser.role === 'admin') {
            li.querySelector('.task-body').addEventListener('click', () => window._openTaskModal(task));
            li.querySelector('.action-btn.edit').addEventListener('click', e => { e.stopPropagation(); window._openTaskModal(task); });
            li.querySelector('.action-btn.delete').addEventListener('click', e => { e.stopPropagation(); triggerDelete(task.id); });
        }

        list.appendChild(li);
    });
}

async function toggleTask(task) {
    await updateTask(task.id, { ...task, isCompleted: !task.isCompleted });
}

function renderUsers() {
    const grid = document.getElementById('users-grid');
    if (!grid) return;
    grid.innerHTML = '';
    
    allUsers.forEach(u => {
        const div = document.createElement('div');
        div.className = 'user-card';
        const taskCount = allTasks.filter(t => t.assignedToUserId === u.id && !t.isCompleted).length;
        
        div.innerHTML = `
            <div class="uc-header">
                <div class="uc-avatar">${u.name.charAt(0).toUpperCase()}</div>
                <div class="uc-info">
                    <div class="uc-name">${escapeHtml(u.name)}</div>
                    <div class="uc-username">@${escapeHtml(u.username)}</div>
                    ${u.employeeId ? `<div class="uc-empid"><i data-lucide="id-card" style="width:12px;height:12px;vertical-align:middle;margin-right:3px;"></i>${escapeHtml(u.employeeId)}</div>` : ''}
                </div>
            </div>
            <div class="uc-meta">
                <span class="uc-role ${u.role === 'admin' ? 'admin' : ''}">${u.role === 'admin' ? 'Admin' : 'User'}</span>
                <span class="uc-tasks">${taskCount} active task(s)</span>
            </div>
            <div class="uc-actions">
                <button class="btn-secondary edit-user"><i data-lucide="pencil"></i> Edit</button>
                <button class="btn-danger-outline delete-user"><i data-lucide="trash-2"></i> Delete</button>
            </div>
        `;

        div.querySelector('.edit-user').addEventListener('click', () => window._openEditUserModal(u));
        div.querySelector('.delete-user').addEventListener('click', () => deleteUser(u.id));
        grid.appendChild(div);
    });
    lucide.createIcons();
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
                { label: 'Created',   data: [], borderColor: '#3d9c94', backgroundColor: 'rgba(61,156,148,0.08)', fill: true, tension: 0.4, pointRadius: 4 },
                { label: 'Completed', data: [], borderColor: '#5c6bc0', backgroundColor: 'rgba(92,107,192,0.06)', fill: true, tension: 0.4, pointRadius: 4 }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { x: { display: false }, y: { beginAtZero: true, display: false } }
        }
    });

    const ringCtx = document.getElementById('completionRing')?.getContext('2d');
    if (!ringCtx) return;
    completionRing = new Chart(ringCtx, {
        type: 'doughnut',
        data: { datasets: [{ data: [0, 100], backgroundColor: ['#3d9c94', '#f0f4f3'], borderWidth: 0 }] },
        options: { responsive: true, maintainAspectRatio: true, cutout: '72%', plugins: { legend: { display: false }, tooltip: { enabled: false } } }
    });
}

function updateCharts() {
    updateCompletionRing();
    updatePriorityBars();
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
    container.innerHTML = ['critical', 'high', 'medium', 'low'].map(p => {
        const count = allTasks.filter(t => t.priority === p).length;
        const pct   = Math.round((count / total) * 100);
        return `<div class="priority-bar-row">
                    <div class="priority-bar-meta"><span>${PRIORITY_LABEL[p]}</span><span>${count} (${pct}%)</span></div>
                    <div class="priority-bar-track"><div class="priority-bar-fill" style="width:${pct}%; background:${PRIORITY_COLOR[p]}"></div></div>
                </div>`;
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

function initDensityToggle() {
    const btn = document.getElementById('density-toggle');
    if (!btn) return;
    btn.addEventListener('click', () => { densityCompact = !densityCompact; renderCurrentView(); });
}

/* ═══════════════════════════════════════════
   COMMAND PALETTE & QUICK ADD
═══════════════════════════════════════════ */
function initCommandPalette() {
    const palette = document.getElementById('command-palette');
    const input   = document.getElementById('cmd-input');
    if (!palette || !input) return;
    const open = () => { palette.classList.add('open'); input.value = ''; input.focus(); };
    const close = () => palette.classList.remove('open');
    document.getElementById('cmd-palette-btn').addEventListener('click', open);
    window.addEventListener('keydown', e => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); open(); }
        if (e.key === 'Escape' && palette.classList.contains('open')) close();
    });
    palette.addEventListener('click', e => { if (e.target === palette) close(); });
}

function initQuickAdd() {
    const form    = document.getElementById('quick-add-form');
    const input   = document.getElementById('quick-add-input');
    if (!form || currentUser.role !== 'admin') {
        if (form) form.style.display = 'none';
        return;
    }

    form.addEventListener('submit', async e => {
        e.preventDefault();
        const val = input.value.trim();
        if (!val) return;
        await addTask({ title: val, description: '', isCompleted: false, priority: 'medium', category: 'general', energyLevel: 'medium', dueDate: null });
        input.value = '';
    });
}

/* ═══════════════════════════════════════════
   WEEKLY RETRO & AUTO-REPRIORITIZE
═══════════════════════════════════════════ */
function computeWeeklyRetro() {
    const retroContent = document.getElementById('retro-content');
    if (!retroContent) return;
    const completedThisWeek = allTasks.filter(t => t.isCompleted).length;
    retroContent.innerHTML = `<div style="line-height:1.7;"><p>✅ <strong>${completedThisWeek} tasks</strong> completed overall.</p></div>`;
}

async function autoReprioritize() {}

/* ═══════════════════════════════════════════
   LIVE CLOCK & DEADLINES
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
    setInterval(checkDeadlines, 60 * 1000);
}

const _toastedIds = new Set();

function checkDeadlines() {
    const now = new Date();
    const soon = new Date(now.getTime() + 60 * 60 * 1000);
    const verySoon = new Date(now.getTime() + 15 * 60 * 1000);

    allTasks.forEach(task => {
        if (task.isCompleted || !task.dueDate) return;
        const due = new Date(task.dueDate);
        if (due < now) return;

        const key15  = `15_${task.id}`;
        const key60  = `60_${task.id}`;

        if (due <= verySoon && !_toastedIds.has(key15)) {
            _toastedIds.add(key15); showDeadlineToast(task, due, 'critical');
        } else if (due <= soon && !_toastedIds.has(key60)) {
            _toastedIds.add(key60); showDeadlineToast(task, due, 'warning');
        }
    });
}

function showDeadlineToast(task, dueDate, level) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `deadline-toast ${level}`;
    toast.innerHTML = `
        <div class="toast-icon"><i data-lucide="${level === 'critical' ? 'alarm-clock' : 'clock'}"></i></div>
        <div class="toast-body">
            <div class="toast-title">${level === 'critical' ? '🚨 Deadline Imminent!' : '⏰ Upcoming Deadline'}</div>
            <div class="toast-task">${escapeHtml(task.title)}</div>
        </div>
        <button class="toast-close" aria-label="Dismiss">&times;</button>
    `;

    toast.querySelector('.toast-close').addEventListener('click', e => { e.stopPropagation(); dismissToast(toast); });
    if (currentUser.role === 'admin') toast.addEventListener('click', () => { window._openTaskModal(task); dismissToast(toast); });

    container.appendChild(toast);
    lucide.createIcons();
    setTimeout(() => dismissToast(toast), 12000);
}

function dismissToast(toast) {
    if (!toast.parentNode) return;
    toast.classList.add('toast-exit');
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
}

/* ═══════════════════════════════════════════
   UTILITY HELPERS
═══════════════════════════════════════════ */
function animateNumber(id, target) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = target; // Simplified for stability
}

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function capitalize(str) { return str ? str.charAt(0).toUpperCase() + str.slice(1) : ''; }

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* ═══════════════════════════════════════════
   GROUPS
═══════════════════════════════════════════ */
let allGroups = [];
let invitingGroupId = null;

async function fetchGroups() {
    try {
        const cached = localStorage.getItem('groupCache');
        if (cached && allGroups.length === 0) {
            try { 
                allGroups = JSON.parse(cached); 
                renderGroups(); 
            } catch {}
        }
        
        const res = await fetch(`${API_BASE}/groups`, { headers: { 'X-Session-Token': currentUser.token } });
        if (!res.ok) return;
        allGroups = await res.json();
        localStorage.setItem('groupCache', JSON.stringify(allGroups));
        renderGroups(); // Re-render to update UI with latest data from DB
    } catch {}
}

function renderGroups() {
    const grid = document.getElementById('groups-grid');
    if (!grid) return;
    if (!allGroups.length) {
        grid.innerHTML = `<div class="empty-state" style="display:flex;grid-column:1/-1;">
            <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            <p>No groups yet</p>
            <span>${currentUser.role === 'admin' ? 'Click "New Group" to create one' : 'You haven\'t been added to any groups yet'}</span>
        </div>`;
    } else {
    grid.innerHTML = allGroups.map(g => `
        <div class="group-card" data-id="${g.id}">
            <div class="gc-header">
                <div class="gc-avatar">${g.name.charAt(0).toUpperCase()}</div>
                <div class="gc-info">
                    <div class="gc-name">${escapeHtml(g.name)}</div>
                    <div class="gc-desc">${escapeHtml(g.description || 'No description')}</div>
                </div>
            </div>
            <div class="gc-meta">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
                ${g.memberCount} member${g.memberCount !== 1 ? 's' : ''}
            </div>
            <div class="gc-actions">
                <button class="btn-secondary open-chat-btn" data-id="${g.id}">💬 Open Chat</button>
                ${currentUser.role === 'admin' ? `
                    <button class="btn-secondary invite-btn" data-id="${g.id}" data-name="${escapeHtml(g.name)}">Invite</button>
                    <button class="btn-danger-outline delete-group-btn" data-id="${g.id}">
                        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                ` : ''}
            </div>
        </div>
    `).join('');

    grid.querySelectorAll('.open-chat-btn').forEach(btn => {
        btn.addEventListener('click', () => window.location.href = `chat.html?group=${btn.dataset.id}`);
    });
    grid.querySelectorAll('.invite-btn').forEach(btn => {
        btn.addEventListener('click', () => openInviteModal(parseInt(btn.dataset.id), btn.dataset.name));
    });
    grid.querySelectorAll('.delete-group-btn').forEach(btn => {
        btn.addEventListener('click', () => deleteGroup(parseInt(btn.dataset.id)));
    });
    }

    const dashList = document.getElementById('dash-groups-list');
    if (dashList) {
        if (!allGroups.length) {
            dashList.innerHTML = `<div style="color:var(--text-muted);font-size:0.85rem;padding:8px 0;">No groups yet.</div>`;
        } else {
            dashList.innerHTML = allGroups.slice(0, 4).map(g => `
                <div class="dash-group-item" data-id="${g.id}" style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:var(--radius-sm);background:var(--bg);cursor:pointer;transition:background var(--trans);border:1px solid transparent;">
                    <div style="width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg, var(--teal), var(--blue));color:#fff;display:flex;align-items:center;justify-content:center;font-size:1rem;font-weight:700;flex-shrink:0;">
                        ${g.name.charAt(0).toUpperCase()}
                    </div>
                    <div style="flex:1;min-width:0;">
                        <div style="font-size:0.88rem;font-weight:600;color:var(--text-main);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(g.name)}</div>
                        <div style="font-size:0.75rem;color:var(--text-muted);margin-top:2px;">${g.memberCount} member${g.memberCount !== 1 ? 's' : ''}</div>
                    </div>
                    <div style="color:var(--teal);opacity:0.7;"><i data-lucide="message-square" style="width:18px;height:18px;"></i></div>
                </div>
            `).join('');
            
            dashList.querySelectorAll('.dash-group-item').forEach(el => {
                el.addEventListener('mouseover', () => el.style.borderColor = 'var(--border)');
                el.addEventListener('mouseout', () => el.style.borderColor = 'transparent');
                el.addEventListener('click', () => window.location.href = `chat.html?group=${el.dataset.id}`);
            });
        }
    }

    lucide.createIcons();
}

async function deleteGroup(id) {
    if (!confirm('Delete this group and all its chat messages?')) return;
    try {
        await fetch(`${API_BASE}/groups/${id}`, { method: 'DELETE', headers: { 'X-Session-Token': currentUser.token } });
        await fetchGroups();
    } catch {}
}

function initNewGroupModal() {
    const modal = document.getElementById('new-group-modal');
    const form  = document.getElementById('new-group-form');
    const openBtn = document.getElementById('open-new-group-btn');
    const dashOpenBtn = document.getElementById('dash-new-group-btn');

    const openModal = () => {
        form.reset();
        renderGroupUserList();
        modal.classList.add('open');
    };

    if (openBtn) openBtn.addEventListener('click', openModal);
    if (dashOpenBtn) dashOpenBtn.addEventListener('click', openModal);

    document.getElementById('close-new-group-btn')?.addEventListener('click', () => modal.classList.remove('open'));
    document.getElementById('cancel-new-group-btn')?.addEventListener('click', () => modal.classList.remove('open'));
    modal?.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('open'); });

    form?.addEventListener('submit', async e => {
        e.preventDefault();
        const name = document.getElementById('group-name').value.trim();
        const desc = document.getElementById('group-desc').value.trim();
        if (!name) return;
        try {
            const res = await fetch(`${API_BASE}/groups`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Session-Token': currentUser.token },
                body: JSON.stringify({ name, description: desc })
            });
            if (res.ok) { createModal.classList.remove('open'); await fetchGroups(); }
        } catch {}
    });

    // Invite Modal
    const inviteModal = document.getElementById('invite-modal');
    document.getElementById('close-invite-btn')?.addEventListener('click', () => inviteModal.classList.remove('open'));
    document.getElementById('cancel-invite-btn')?.addEventListener('click', () => inviteModal.classList.remove('open'));
    inviteModal?.addEventListener('click', e => { if (e.target === inviteModal) inviteModal.classList.remove('open'); });

    document.getElementById('confirm-invite-btn')?.addEventListener('click', async () => {
        if (!invitingGroupId) return;
        const checked = [...document.querySelectorAll('#invite-user-list input[type=checkbox]:checked')];
        const userIds = checked.map(cb => parseInt(cb.value));
        if (!userIds.length) return;
        try {
            await fetch(`${API_BASE}/groups/${invitingGroupId}/invite`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Session-Token': currentUser.token },
                body: JSON.stringify({ userIds })
            });
            inviteModal.classList.remove('open');
        } catch {}
    });
}

function openInviteModal(groupId, groupName) {
    invitingGroupId = groupId;
    document.getElementById('invite-modal-title').textContent = `Invite to: ${groupName}`;
    const list = document.getElementById('invite-user-list');
    if (!allUsers.length) {
        list.innerHTML = '<div style="color:var(--text-muted);padding:8px;">No other users found.</div>';
    } else {
        list.innerHTML = allUsers
            .filter(u => u.id !== currentUser.id)
            .map(u => `
                <label class="user-checklist-item">
                    <input type="checkbox" value="${u.id}">
                    <div class="uci-avatar">${u.name.charAt(0).toUpperCase()}</div>
                    <div>
                        <div class="uci-name">${escapeHtml(u.name)}</div>
                        <div class="uci-sub">@${escapeHtml(u.username)}</div>
                    </div>
                </label>
            `).join('');
    }
    document.getElementById('invite-modal').classList.add('open');
}

/* ═══════════════════════════════════════════
   BULK TASK MODAL
═══════════════════════════════════════════ */
function initBulkTaskModal() {
    const modal = document.getElementById('bulk-task-modal');
    const form  = document.getElementById('bulk-task-form');
    const openBtn = document.getElementById('open-bulk-task-btn');
    const dashOpenBtn = document.getElementById('dash-bulk-task-btn');

    const openModal = () => {
        form.reset();
        renderBulkUserList();
        renderBulkGroupPick();
        modal.classList.add('open');
    };

    if (openBtn) openBtn.addEventListener('click', openModal);
    if (dashOpenBtn) dashOpenBtn.addEventListener('click', openModal);

    document.getElementById('close-bulk-task-btn')?.addEventListener('click', () => modal.classList.remove('open'));
    document.getElementById('cancel-bulk-task-btn')?.addEventListener('click', () => modal.classList.remove('open'));
    modal?.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('open'); });

    form?.addEventListener('submit', async e => {
        e.preventDefault();
        const title    = document.getElementById('bulk-title').value.trim();
        const desc     = document.getElementById('bulk-desc').value.trim();
        const priority = document.getElementById('bulk-priority').value;
        const dueRaw   = document.getElementById('bulk-due').value;
        const dueDate  = dueRaw ? new Date(dueRaw).toISOString() : null;
        const checked  = [...document.querySelectorAll('#bulk-user-list input[type=checkbox]:checked')];
        const userIds  = checked.map(cb => parseInt(cb.value));

        if (!title || !userIds.length) {
            alert(!title ? 'Please enter a task title.' : 'Please select at least one user.');
            return;
        }

        try {
            const res = await fetch(`${API_BASE}/tasks/bulk`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Session-Token': currentUser.token },
                body: JSON.stringify({ title, description: desc, priority, dueDate, userIds })
            });
            if (res.ok) {
                const data = await res.json();
                modal.classList.remove('open');
                alert(`✅ ${data.message}`);
                await fetchTasks();
            }
        } catch {}
    });
}

function renderBulkUserList() {
    const list = document.getElementById('bulk-user-list');
    if (!allUsers.length) {
        list.innerHTML = '<div style="color:var(--text-muted);padding:8px;">No users found.</div>';
        return;
    }
    list.innerHTML = allUsers.map(u => `
        <label class="user-checklist-item">
            <input type="checkbox" value="${u.id}">
            <div class="uci-avatar">${u.name.charAt(0).toUpperCase()}</div>
            <div>
                <div class="uci-name">${escapeHtml(u.name)}</div>
                <div class="uci-sub">@${escapeHtml(u.username)}</div>
            </div>
        </label>
    `).join('');
}

function renderBulkGroupPick() {
    const pick = document.getElementById('bulk-group-pick');
    if (!allGroups.length) { pick.innerHTML = ''; return; }
    pick.innerHTML = '<span style="font-size:0.75rem;color:var(--text-muted);align-self:center;">Select group:</span>' +
        allGroups.map(g => `<button type="button" class="bulk-group-btn" data-id="${g.id}">${escapeHtml(g.name)}</button>`).join('');

    pick.querySelectorAll('.bulk-group-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const groupId = parseInt(btn.dataset.id);
            try {
                const res = await fetch(`${API_BASE}/groups/${groupId}/members`, { headers: { 'X-Session-Token': currentUser.token } });
                if (!res.ok) return;
                const members = await res.json();
                const memberIds = new Set(members.map(m => m.id));
                document.querySelectorAll('#bulk-user-list input[type=checkbox]').forEach(cb => {
                    cb.checked = memberIds.has(parseInt(cb.value));
                });
            } catch {}
        });
    });
}

/* ═══════════════════════════════════════════
   NOTIFICATIONS
═══════════════════════════════════════════ */
let allNotifications = [];

function initNotifications() {
    const bell     = document.getElementById('notif-bell-btn');
    const dropdown = document.getElementById('notif-dropdown');

    bell?.addEventListener('click', e => {
        e.stopPropagation();
        const isOpen = dropdown.style.display !== 'none';
        dropdown.style.display = isOpen ? 'none' : 'block';
        if (!isOpen) fetchNotifications();
    });

    document.addEventListener('click', e => {
        if (!document.getElementById('notif-bell-wrap')?.contains(e.target)) {
            if (dropdown) dropdown.style.display = 'none';
        }
    });

    document.getElementById('notif-read-all-btn')?.addEventListener('click', async () => {
        try {
            await fetch(`${API_BASE}/notifications/read-all`, { method: 'POST', headers: { 'X-Session-Token': currentUser.token } });
            await fetchNotifications();
        } catch {}
    });

    // Poll every 20s
    fetchNotifications();
    setInterval(fetchNotifications, 20000);
}

async function fetchNotifications() {
    try {
        const res = await fetch(`${API_BASE}/notifications`, { headers: { 'X-Session-Token': currentUser.token } });
        if (!res.ok) return;
        allNotifications = await res.json();
        renderNotifications();
    } catch {}
}

function renderNotifications() {
    const badge = document.getElementById('notif-badge');
    const list  = document.getElementById('notif-list');
    if (!badge || !list) return;

    const unreadCount = allNotifications.filter(n => !n.isRead).length;
    badge.textContent = unreadCount;
    badge.style.display = unreadCount > 0 ? 'flex' : 'none';

    if (!allNotifications.length) {
        list.innerHTML = '<div class="notif-empty">No notifications yet</div>';
        return;
    }

    list.innerHTML = allNotifications.map(n => {
        const isInvite = n.type === 'group_invite';
        let payload = {};
        try { payload = JSON.parse(n.payload || '{}'); } catch {}

        const timeAgo = formatTimeAgo(new Date(n.createdAt));

        const actionBtns = isInvite && !n.isRead ? `
            <div class="notif-actions">
                <button class="notif-action-btn accept" data-notif-id="${n.id}" data-group-id="${payload.groupId}" data-action="accept">✅ Accept</button>
                <button class="notif-action-btn decline" data-notif-id="${n.id}" data-group-id="${payload.groupId}" data-action="decline">❌ Decline</button>
            </div>
        ` : '';

        return `
            <div class="notif-item ${n.isRead ? '' : 'unread'}" data-id="${n.id}">
                <div class="notif-item-title">
                    ${!n.isRead ? '<span class="notif-unread-dot"></span>' : ''}
                    ${escapeHtml(n.title)}
                </div>
                <div class="notif-item-body">${escapeHtml(n.body)}</div>
                <div class="notif-item-time">${timeAgo}</div>
                ${actionBtns}
            </div>
        `;
    }).join('');

    // Bind accept/decline
    list.querySelectorAll('.notif-action-btn').forEach(btn => {
        btn.addEventListener('click', async e => {
            e.stopPropagation();
            const notifId = parseInt(btn.dataset.notifId);
            const groupId = parseInt(btn.dataset.groupId);
            const action  = btn.dataset.action;
            try {
                await fetch(`${API_BASE}/groups/${groupId}/respond`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-Session-Token': currentUser.token },
                    body: JSON.stringify({ action, notificationId: notifId })
                });
                await fetchNotifications();
                await fetchGroups();
            } catch {}
        });
    });
}

function formatTimeAgo(date) {
    const diff = Math.floor((Date.now() - date.getTime()) / 1000);
    if (diff < 60)  return 'just now';
    if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}