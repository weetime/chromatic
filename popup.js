// Popup window main logic for Push API message management
class PushMessageCollector {
    constructor() {
        this.messages = [];
        this.subscriptions = [];
        this.sortColumn = 'timestamp';
        this.sortDirection = 'desc';
        this.init();
    }

    async init() {
        await this.loadMessages();
        await this.loadSubscriptions();
        await this.loadSubscriptionsFromBackground(); // Also load from background
        this.setupEventListeners();
        this.renderMessages();
        this.updateStats();
        this.setupPushApiControls();
    }

    setupEventListeners() {
        // 搜索功能
        const searchInput = document.getElementById('searchInput');
        searchInput.addEventListener('input', (e) => {
            this.filterMessages(e.target.value);
        });

        // 排序功能
        const sortableHeaders = document.querySelectorAll('.sortable');
        sortableHeaders.forEach(header => {
            header.addEventListener('click', () => {
                const column = header.dataset.column;
                this.sortMessages(column);
            });
        });

        // 清空按钮
        document.getElementById('clearBtn').addEventListener('click', () => {
            this.clearMessages();
        });

        // 导出按钮
        document.getElementById('exportBtn').addEventListener('click', () => {
            this.exportMessages();
        });

        // 删除按钮事件委托
        document.addEventListener('click', (e) => {
            if (e.target.closest('.delete-btn')) {
                const button = e.target.closest('.delete-btn');
                const messageId = button.getAttribute('data-message-id');
                if (messageId) {
                    this.deleteMessage(messageId);
                }
            }
        });

        // 监听来自background的消息更新
        if (chrome && chrome.runtime && chrome.runtime.onMessage) {
            chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
                if (message.type === 'MESSAGE_UPDATED') {
                    this.loadMessages().then(() => {
                        this.renderMessages();
                        this.updateStats();
                    });
                }
            });
        }

        // 设置定期刷新以确保实时更新
        this.setupRealtimeUpdates();
    }

    async loadMessages() {
        try {
            const result = await chrome.storage.local.get(['messages']);
            this.messages = result.messages || [];
        } catch (error) {
            console.error('Failed to load messages:', error);
            this.messages = [];
        }
    }

    async loadSubscriptions() {
        try {
            const result = await chrome.storage.local.get(['subscriptions']);
            // subscriptions is stored as Array.from(Map.entries()), so it's an array of [key, value] pairs
            const subscriptionEntries = result.subscriptions || [];
            this.subscriptions = subscriptionEntries; // Keep as entries array for counting
            console.log('Loaded subscriptions from storage:', subscriptionEntries.length);
        } catch (error) {
            console.error('Failed to load subscriptions:', error);
            this.subscriptions = [];
        }
    }

    async loadSubscriptionsFromBackground() {
        try {
            const response = await chrome.runtime.sendMessage({
                type: 'GET_SUBSCRIPTIONS'
            });
            
            if (response && response.subscriptions) {
                this.subscriptions = response.subscriptions;
                console.log('Loaded subscriptions from background:', response.subscriptions.length);
            }
        } catch (error) {
            console.error('Failed to load subscriptions from background:', error);
        }
    }

    setupPushApiControls() {
        // Add test notification button.
        const testBtn = document.createElement('button');
        testBtn.id = 'testNotificationBtn';
        testBtn.className = 'btn btn-secondary';
        testBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M18 8C18 6.4087 17.3679 4.88258 16.2426 3.75736C15.1174 2.63214 13.5913 2 12 2C10.4087 2 8.88258 2.63214 7.75736 3.75736C6.63214 4.88258 6 6.4087 6 8C6 15 3 17 3 17H21C21 17 18 15 18 8Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M13.73 21C13.5542 21.3031 13.3019 21.5547 12.9982 21.7295C12.6946 21.9044 12.3504 21.9965 12 21.9965C11.6496 21.9965 11.3054 21.9044 11.0018 21.7295C10.6982 21.5547 10.4458 21.3031 10.27 21" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Test Push
        `;
        testBtn.addEventListener('click', () => this.testPushNotification());

        // Insert test button after export button.
        const exportBtn = document.getElementById('exportBtn');
        exportBtn.parentNode.insertBefore(testBtn, exportBtn.nextSibling);

        // Update controls section to show subscription info.
        this.updateSubscriptionInfo();
    }

    async saveMessages() {
        try {
            await chrome.storage.local.set({ messages: this.messages });
        } catch (error) {
            console.error('保存消息失败:', error);
        }
    }

    sortMessages(column) {
        if (this.sortColumn === column) {
            this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortColumn = column;
            this.sortDirection = 'asc';
        }

        this.messages.sort((a, b) => {
            let aVal = a[column];
            let bVal = b[column];

            // 特殊处理时间戳
            if (column === 'timestamp') {
                aVal = new Date(aVal);
                bVal = new Date(bVal);
            }

            if (aVal < bVal) return this.sortDirection === 'asc' ? -1 : 1;
            if (aVal > bVal) return this.sortDirection === 'asc' ? 1 : -1;
            return 0;
        });

        this.updateSortIcons();
        this.renderMessages();
    }

    updateSortIcons() {
        const headers = document.querySelectorAll('.sortable');
        headers.forEach(header => {
            const icon = header.querySelector('.sort-icon');
            if (header.dataset.column === this.sortColumn) {
                icon.textContent = this.sortDirection === 'asc' ? '↑' : '↓';
                header.classList.add('sorted');
            } else {
                icon.textContent = '↕️';
                header.classList.remove('sorted');
            }
        });
    }

    filterMessages(searchTerm) {
        const filteredMessages = this.messages.filter(message => {
            return message.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                   message.url.toLowerCase().includes(searchTerm.toLowerCase()) ||
                   message.content.toLowerCase().includes(searchTerm.toLowerCase());
        });
        this.renderFilteredMessages(filteredMessages);
    }

    renderFilteredMessages(messages) {
        const tbody = document.getElementById('messagesBody');
        const emptyState = document.getElementById('emptyState');
        
        if (messages.length === 0) {
            tbody.innerHTML = '';
            emptyState.style.display = 'flex';
        } else {
            emptyState.style.display = 'none';
            tbody.innerHTML = messages.map(message => this.createMessageRow(message)).join('');
        }
    }

    renderMessages() {
        this.renderFilteredMessages(this.messages);
    }

    createMessageRow(message) {
        const time = new Date(message.timestamp);
        const timeStr = time.toLocaleString('zh-CN');
        const favicon = message.favicon || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>';
        
        return `
            <tr class="message-row" data-id="${message.id}">
                <td class="type-cell">
                    <div class="type-badge type-${message.type}">
                        ${this.getTypeIcon(message.type)}
                        ${this.getTypeLabel(message.type)}
                    </div>
                </td>
                <td class="title-cell">
                    <div class="title-content">
                        <img src="${favicon}" alt="favicon" class="favicon" onerror="this.style.display='none'">
                        <span class="title">${this.escapeHtml(message.title)}</span>
                    </div>
                </td>
                <td class="url-cell">
                    <a href="${message.url}" target="_blank" class="url-link" title="${message.url}">
                        ${this.truncateUrl(message.url)}
                    </a>
                </td>
                <td class="time-cell">${timeStr}</td>
                <td class="action-cell">
                    <button class="btn btn-small btn-danger" onclick="messageCollector.deleteMessage('${message.id}')">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                            <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                        </svg>
                    </button>
                </td>
            </tr>
        `;
    }

    getTypeIcon(type) {
        const icons = {
            'push_notification': '🔔',
            'test_notification': '🧪',
            'default': '📄'
        };
        return icons[type] || icons.default;
    }

    getTypeLabel(type) {
        const labels = {
            'push_notification': 'Push通知',
            'test_notification': '测试通知',
            'default': '推送消息'
        };
        return labels[type] || labels.default;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    truncateUrl(url) {
        try {
            const urlObj = new URL(url);
            const domain = urlObj.hostname;
            return domain.length > 30 ? domain.substring(0, 27) + '...' : domain;
        } catch {
            return url.length > 30 ? url.substring(0, 27) + '...' : url;
        }
    }

    async deleteMessage(messageId) {
        this.messages = this.messages.filter(msg => msg.id !== messageId);
        await this.saveMessages();
        this.renderMessages();
        this.updateStats();
    }

    async clearMessages() {
        if (confirm('确定要清空所有消息吗？此操作无法撤销。')) {
            try {
                // 通知background script清空消息
                const response = await chrome.runtime.sendMessage({
                    type: 'CLEAR_MESSAGES'
                });
                
                if (response && response.success) {
                    // 重新加载消息以确保与background同步
                    console.log('Clearing messages, reloading from storage...');
                    await this.loadMessages();
                    this.renderMessages();
                    this.updateStats();
                    console.log('All messages cleared successfully, new count:', this.messages.length);
                } else {
                    console.error('Failed to clear messages:', response?.error);
                    alert('清空消息失败，请重试');
                }
            } catch (error) {
                console.error('Error clearing messages:', error);
                alert('清空消息时发生错误，请重试');
            }
        }
    }

    exportMessages() {
        if (this.messages.length === 0) {
            alert('没有消息可以导出');
            return;
        }

        const csvContent = this.generateCSV();
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        
        link.setAttribute('href', url);
        link.setAttribute('download', `messages_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    generateCSV() {
        const headers = ['类型', '标题', 'URL', '时间', '内容'];
        const rows = this.messages.map(msg => [
            this.getTypeLabel(msg.type),
            msg.title || '',
            msg.url || '',
            new Date(msg.timestamp).toLocaleString('zh-CN'),
            (msg.content || msg.body || '').replace(/"/g, '""')
        ]);

        const csvContent = [headers, ...rows]
            .map(row => row.map(field => `"${field}"`).join(','))
            .join('\n');

        return '\uFEFF' + csvContent; // 添加BOM以支持中文
    }

    updateStats() {
        const totalCount = this.messages.length;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const todayCount = this.messages.filter(msg => {
            const msgDate = new Date(msg.timestamp);
            msgDate.setHours(0, 0, 0, 0);
            return msgDate.getTime() === today.getTime();
        }).length;

        const pushCount = this.messages.filter(msg => 
            msg.type === 'push_notification'
        ).length;

        document.getElementById('totalCount').textContent = totalCount;
        document.getElementById('todayCount').textContent = todayCount;
        
        // Update subscription count if element exists.
        const subscriptionCountEl = document.getElementById('subscriptionCount');
        if (subscriptionCountEl) {
            subscriptionCountEl.textContent = this.subscriptions.length;
        }
    }

    async testPushNotification() {
        try {
            const response = await chrome.runtime.sendMessage({
                type: 'TEST_NOTIFICATION',
                data: {
                    title: 'Test Push Notification',
                    body: 'This is a test notification from the extension',
                    icon: '/icons/icon48.png',
                    data: {
                        testId: Date.now()
                    }
                }
            });

            if (response.error) {
                console.error('Test notification failed:', response.error);
                // Remove alert popup - just log the error
            } else {
                console.log('Test notification sent successfully');
            }
        } catch (error) {
            console.error('Error sending test notification:', error);
            // Remove alert popup - just log the error
        }
    }

    updateSubscriptionInfo() {
        // Add subscription count to stats.
        const statsContainer = document.querySelector('.stats');
        if (statsContainer && !document.getElementById('subscriptionCount')) {
            const subscriptionStat = document.createElement('div');
            subscriptionStat.className = 'stat-item';
            subscriptionStat.innerHTML = `
                <span class="stat-label">Push订阅:</span>
                <span id="subscriptionCount" class="stat-value">${this.subscriptions.length}</span>
            `;
            statsContainer.appendChild(subscriptionStat);
        }
    }

    setupRealtimeUpdates() {
        // Setup periodic refresh for real-time updates when popup is open
        this.updateInterval = setInterval(async () => {
            const oldCount = this.messages.length;
            await this.loadMessages();
            
            // Only update UI if there are new messages
            if (this.messages.length !== oldCount) {
                this.renderMessages();
                this.updateStats();
            }
        }, 1000); // Check every second

        // Setup storage change listener for immediate updates
        if (chrome && chrome.storage && chrome.storage.onChanged) {
            this.storageListener = (changes, namespace) => {
                if (namespace === 'local' && changes.messages) {
                    this.messages = changes.messages.newValue || [];
                    this.renderMessages();
                    this.updateStats();
                }
            };
            chrome.storage.onChanged.addListener(this.storageListener);
        }

        // Cleanup when popup is closed
        window.addEventListener('beforeunload', () => {
            this.cleanup();
        });

        // Cleanup when popup loses focus (for some browsers)
        window.addEventListener('blur', () => {
            // Don't cleanup immediately, just reduce update frequency
            if (this.updateInterval) {
                clearInterval(this.updateInterval);
                this.updateInterval = setInterval(async () => {
                    const oldCount = this.messages.length;
                    await this.loadMessages();
                    if (this.messages.length !== oldCount) {
                        this.renderMessages();
                        this.updateStats();
                    }
                }, 5000); // Slower updates when not focused
            }
        });

        // Resume normal frequency when popup gets focus
        window.addEventListener('focus', () => {
            if (this.updateInterval) {
                clearInterval(this.updateInterval);
                this.updateInterval = setInterval(async () => {
                    const oldCount = this.messages.length;
                    await this.loadMessages();
                    if (this.messages.length !== oldCount) {
                        this.renderMessages();
                        this.updateStats();
                    }
                }, 1000); // Normal update frequency
            }
        });
    }

    cleanup() {
        // Clear update interval
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }

        // Remove storage listener
        if (this.storageListener && chrome && chrome.storage && chrome.storage.onChanged) {
            chrome.storage.onChanged.removeListener(this.storageListener);
            this.storageListener = null;
        }
    }

    // Override createMessageRow to handle push notification messages better.
    createMessageRow(message) {
        const time = new Date(message.timestamp);
        const timeStr = time.toLocaleString('zh-CN');
        const favicon = message.icon || message.favicon || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>';
        
        // Show body content for push notifications.
        const displayContent = message.body || message.content || message.title;
        
        return `
            <tr class="message-row" data-id="${message.id}">
                <td class="type-cell">
                    <div class="type-badge type-${message.type}">
                        ${this.getTypeIcon(message.type)}
                        ${this.getTypeLabel(message.type)}
                    </div>
                </td>
                <td class="title-cell">
                    <div class="title-content">
                        <img src="${favicon}" alt="favicon" class="favicon" onerror="this.style.display='none'">
                        <span class="title">${this.escapeHtml(message.title)}</span>
                        ${message.status ? `<span class="status-badge status-${message.status}">${message.status}</span>` : ''}
                    </div>
                    ${displayContent && displayContent !== message.title ? `<div class="message-body">${this.escapeHtml(displayContent)}</div>` : ''}
                </td>
                <td class="url-cell">
                    <a href="${message.url}" target="_blank" class="url-link" title="${message.url}">
                        ${this.truncateUrl(message.url)}
                    </a>
                </td>
                <td class="time-cell">${timeStr}</td>
                <td class="action-cell">
                    <button class="btn btn-small btn-danger delete-btn" data-message-id="${message.id}">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                            <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                        </svg>
                    </button>
                </td>
            </tr>
        `;
    }
}

// Initialize push message collector.
let pushMessageCollector;
document.addEventListener('DOMContentLoaded', () => {
    pushMessageCollector = new PushMessageCollector();
});

// Keep backward compatibility.
let messageCollector;
window.addEventListener('load', () => {
    messageCollector = pushMessageCollector;
});
