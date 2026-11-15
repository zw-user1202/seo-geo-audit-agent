/**
 * Admin Panel Logic
 */

let currentUsers = [];

document.addEventListener('DOMContentLoaded', async () => {
    const user = await checkAuth();

    if (!user) return;

    if (user.role !== 'admin') {
        alert('需要管理员权限');
        window.location.href = '/';
        return;
    }

    document.getElementById('adminUsername').textContent = user.username;

    await loadUsers();
});

async function loadUsers() {
    try {
        const response = await fetch('/api/users', {
            credentials: 'include'
        });

        if (!response.ok) {
            throw new Error('加载用户失败');
        }

        currentUsers = await response.json();
        renderUsers();
        updateStats();
    } catch (error) {
        console.error('Load users error:', error);
        document.getElementById('usersTableBody').innerHTML = `
            <tr>
                <td colspan="6" class="text-center py-8 text-[var(--danger)]">
                    <i class="fas fa-exclamation-circle text-xl mb-2"></i>
                    <p class="text-xs">加载失败: ${error.message}</p>
                </td>
            </tr>
        `;
    }
}

function renderUsers() {
    const tbody = document.getElementById('usersTableBody');

    if (currentUsers.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center py-10 text-[var(--text-muted)]">
                    <i class="fas fa-users text-2xl mb-3 opacity-30"></i>
                    <p class="text-sm text-[var(--text-secondary)]">暂无用户</p>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = currentUsers.map(user => `
        <tr>
            <td>
                <span class="text-[var(--text-primary)] font-medium">${escapeHtml(user.username)}</span>
            </td>
            <td>
                <span class="text-xs px-2.5 py-1 rounded-[var(--radius-sm)] ${user.role === 'admin' ? 'badge-admin' : 'badge-user'}">
                    ${user.role === 'admin' ? '管理员' : '用户'}
                </span>
            </td>
            <td>
                <span class="text-[var(--text-muted)]">${formatDate(user.created_at)}</span>
            </td>
            <td>
                <span class="text-[var(--text-muted)]">${user.last_login ? formatDate(user.last_login) : '-'}</span>
            </td>
            <td class="text-center">
                <a href="/history.html?userId=${user.id}" class="text-[var(--accent)] hover:text-[var(--text-primary)] transition-colors">
                    ${user.report_count || 0}
                </a>
            </td>
            <td class="text-right">
                <button
                    onclick="showEditUser(${user.id})"
                    class="text-[var(--accent)] hover:text-[var(--text-primary)] mr-3 transition-colors"
                    title="编辑"
                >
                    <i class="fas fa-edit text-xs"></i>
                </button>
                <button
                    onclick="deleteUser(${user.id}, '${escapeHtml(user.username)}')"
                    class="text-[var(--danger)] hover:text-[var(--text-primary)] transition-colors"
                    title="删除"
                    ${user.id === getCurrentUser().id ? 'disabled style="opacity:0.3;cursor:not-allowed"' : ''}
                >
                    <i class="fas fa-trash text-xs"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

function updateStats() {
    const totalUsers = currentUsers.length;
    const totalAdmins = currentUsers.filter(u => u.role === 'admin').length;
    const totalRegularUsers = currentUsers.filter(u => u.role === 'user').length;

    document.getElementById('totalUsers').textContent = totalUsers;
    document.getElementById('totalAdmins').textContent = totalAdmins;
    document.getElementById('totalRegularUsers').textContent = totalRegularUsers;
}

function showAddUserModal() {
    document.getElementById('addUserModal').classList.remove('hidden');
    document.getElementById('addUserForm').reset();
    document.getElementById('addUserError').classList.add('hidden');
}

function hideAddUserModal() {
    document.getElementById('addUserModal').classList.add('hidden');
}

document.getElementById('addUserForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const username = document.getElementById('newUsername').value;
    const password = document.getElementById('newPassword').value;
    const role = document.getElementById('newRole').value;

    const btn = document.getElementById('addUserBtn');
    const errorDiv = document.getElementById('addUserError');

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i>';
    errorDiv.classList.add('hidden');

    try {
        const response = await fetch('/api/users', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({ username, password, role })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || '创建用户失败');
        }

        await loadUsers();
        hideAddUserModal();

        showNotification('用户创建成功', 'success');
    } catch (error) {
        errorDiv.textContent = error.message;
        errorDiv.classList.remove('hidden');
    } finally {
        btn.disabled = false;
        btn.textContent = '添加';
    }
});

function showEditUser(userId) {
    const user = currentUsers.find(u => u.id === userId);
    if (!user) return;

    document.getElementById('editUserId').value = user.id;
    document.getElementById('editUsername').value = user.username;
    document.getElementById('editPassword').value = '';
    document.getElementById('editRole').value = user.role;
    document.getElementById('editUserError').classList.add('hidden');

    document.getElementById('editUserModal').classList.remove('hidden');
}

function hideEditUserModal() {
    document.getElementById('editUserModal').classList.add('hidden');
}

document.getElementById('editUserForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const userId = document.getElementById('editUserId').value;
    const password = document.getElementById('editPassword').value;
    const role = document.getElementById('editRole').value;

    const btn = document.getElementById('editUserBtn');
    const errorDiv = document.getElementById('editUserError');

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i>';
    errorDiv.classList.add('hidden');

    try {
        if (password) {
            const response = await fetch(`/api/users/${userId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include',
                body: JSON.stringify({ password })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || '更新密码失败');
            }
        }

        const response = await fetch(`/api/users/${userId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({ role })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || '更新角色失败');
        }

        await loadUsers();
        hideEditUserModal();

        showNotification('用户更新成功', 'success');
    } catch (error) {
        errorDiv.textContent = error.message;
        errorDiv.classList.remove('hidden');
    } finally {
        btn.disabled = false;
        btn.textContent = '保存';
    }
});

async function deleteUser(userId, username) {
    if (!confirm(`确定要删除用户 "${username}" 吗？\n\n此操作将同时删除该用户的所有报告，且无法恢复！`)) {
        return;
    }

    try {
        const response = await fetch(`/api/users/${userId}`, {
            method: 'DELETE',
            credentials: 'include'
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || '删除用户失败');
        }

        await loadUsers();

        showNotification('用户已删除', 'success');
    } catch (error) {
        alert(`删除失败: ${error.message}`);
    }
}

function formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return String(unsafe)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    const bgColor = type === 'success' ? 'var(--success-dim)' : type === 'error' ? 'var(--danger-dim)' : type === 'warning' ? 'var(--warning-dim)' : 'var(--accent-dim)';
    const textColor = type === 'success' ? 'var(--success)' : type === 'error' ? 'var(--danger)' : type === 'warning' ? 'var(--warning)' : 'var(--accent)';
    const borderColor = type === 'success' ? 'rgba(5, 150, 105, 0.15)' : type === 'error' ? 'rgba(225, 29, 72, 0.15)' : type === 'warning' ? 'rgba(217, 119, 6, 0.15)' : 'var(--border-accent)';
    const icon = type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : type === 'warning' ? 'fa-triangle-exclamation' : 'fa-info-circle';

    notification.className = 'notification-toast fade-in flex items-start gap-3';
    notification.style.cssText = `background: ${bgColor}; color: ${textColor}; border: 1px solid ${borderColor};`;
    notification.innerHTML = `<i class="fas ${icon}"></i><span>${message}</span>`;

    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
}
