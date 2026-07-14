/* ═══════════════════════════════════════════
   TASKFLOW PRO — CHAT PAGE LOGIC
   ═══════════════════════════════════════════ */

const API_BASE = 'https://task-manager-backend-vcm9.onrender.com/api';

let currentUser   = null;
let allGroups     = [];
let activeGroupId = null;
let pollTimer     = null;
let lastMsgId     = 0;

/* ── Auth Check ── */
document.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('token');
    if (!token) { window.location.href = 'login.html'; return; }

    currentUser = {
        token,
        id:   parseInt(localStorage.getItem('userId')),
        name: localStorage.getItem('name'),
        role: localStorage.getItem('role')
    };

    await loadGroups();
    initInput();

    // Pre-select group from URL param if provided
    const params = new URLSearchParams(location.search);
    const gid = parseInt(params.get('group'));
    if (gid && allGroups.find(g => g.id === gid)) {
        openGroup(gid);
    }
});

/* ── Load Group Sidebar ── */
async function loadGroups() {
    const list = document.getElementById('group-list');
    try {
        const res = await fetch(`${API_BASE}/groups`, {
            headers: { 'X-Session-Token': currentUser.token }
        });
        if (res.status === 401) { window.location.href = 'login.html'; return; }
        allGroups = await res.json();
        renderSidebar();
    } catch {
        list.innerHTML = '<div style="padding:16px 18px;color:#fc5c7d;font-size:0.8rem;">Could not load groups.</div>';
    }
}

function renderSidebar() {
    const list = document.getElementById('group-list');
    if (!allGroups.length) {
        list.innerHTML = '<div class="no-groups">You have no groups yet.<br>Ask an admin to create one!</div>';
        return;
    }
    list.innerHTML = allGroups.map(g => `
        <div class="group-item ${g.id === activeGroupId ? 'active' : ''}" data-id="${g.id}">
            <div class="group-avatar">${g.name.charAt(0).toUpperCase()}</div>
            <div class="group-info">
                <div class="group-name">${esc(g.name)}</div>
                <div class="group-meta">${g.memberCount} member${g.memberCount !== 1 ? 's' : ''}</div>
            </div>
        </div>
    `).join('');
    list.querySelectorAll('.group-item').forEach(el => {
        el.addEventListener('click', () => openGroup(parseInt(el.dataset.id)));
    });
}

/* ── Open Group Chat ── */
async function openGroup(groupId) {
    activeGroupId = groupId;
    lastMsgId = 0;
    clearInterval(pollTimer);

    // Update sidebar highlight
    renderSidebar();

    const group = allGroups.find(g => g.id === groupId);

    // Show chat pane
    document.getElementById('no-group-pane').style.display   = 'none';
    const pane = document.getElementById('active-chat-pane');
    pane.style.display = 'flex';

    // Update header
    document.getElementById('hdr-avatar').textContent = group.name.charAt(0).toUpperCase();
    document.getElementById('hdr-name').textContent   = group.name;
    document.getElementById('hdr-sub').textContent    = `${group.memberCount} members · ${group.description || 'No description'}`;

    // Load messages
    await loadMessages(true);

    // Start polling every 3s
    pollTimer = setInterval(() => loadMessages(false), 3000);

    // Focus input
    document.getElementById('msg-input').focus();
}

/* ── Load / Refresh Messages ── */
async function loadMessages(initial = false) {
    if (!activeGroupId) return;
    try {
        const res = await fetch(`${API_BASE}/chat/${activeGroupId}`, {
            headers: { 'X-Session-Token': currentUser.token }
        });
        if (!res.ok) return;
        const msgs = await res.json();

        if (!msgs.length) {
            if (initial) {
                document.getElementById('messages-area').innerHTML =
                    '<div class="empty-chat" id="empty-chat-msg"><div class="empty-chat-icon">🗨️</div><p>No messages yet. Say hello!</p></div>';
            }
            return;
        }

        const newest = msgs[msgs.length - 1];
        if (newest.id === lastMsgId && !initial) return; // No new messages

        lastMsgId = newest.id;
        renderMessages(msgs);
    } catch {}
}

function renderMessages(msgs) {
    const area = document.getElementById('messages-area');
    const wasAtBottom = area.scrollHeight - area.scrollTop - area.clientHeight < 60;

    area.innerHTML = '';
    let lastDate = '';

    msgs.forEach(m => {
        const d = new Date(m.createdAt);
        const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        if (dateStr !== lastDate) {
            lastDate = dateStr;
            const div = document.createElement('div');
            div.className = 'date-divider';
            div.textContent = dateStr;
            area.appendChild(div);
        }

        const isMe = m.senderUserId === currentUser.id;
        const row = document.createElement('div');
        row.className = `msg-row ${isMe ? 'mine' : 'other'}`;

        const timeStr = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

        row.innerHTML = `
            <div class="msg-avatar">${m.senderName.charAt(0).toUpperCase()}</div>
            <div class="msg-content">
                ${!isMe ? `<div class="msg-sender">${esc(m.senderName)}</div>` : ''}
                <div class="msg-bubble">${esc(m.body)}</div>
                <div class="msg-time">${timeStr}</div>
            </div>
        `;
        area.appendChild(row);
    });

    // Scroll to bottom if user was near bottom or this is the initial load
    if (wasAtBottom || msgs.length < 5) {
        area.scrollTop = area.scrollHeight;
    }
}

/* ── Send Message ── */
function initInput() {
    const input   = document.getElementById('msg-input');
    const sendBtn = document.getElementById('send-btn');

    const send = async () => {
        const body = input.value.trim();
        if (!body || !activeGroupId) return;
        input.value = '';
        input.focus();
        try {
            const res = await fetch(`${API_BASE}/chat/${activeGroupId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Session-Token': currentUser.token },
                body: JSON.stringify({ body })
            });
            if (res.ok) await loadMessages(false);
        } catch {}
    };

    sendBtn.addEventListener('click', send);
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });
}

/* ── Utils ── */
function esc(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
