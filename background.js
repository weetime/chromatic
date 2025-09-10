// Service Worker - Push API消息处理和通知管理
class PushNotificationManager {
    constructor() {
        this.messages = [];
        this.maxMessages = 1000;
        this.subscriptions = new Map();
        this.init();
    }

    async init() {
        await this.loadData();
        this.setupEventListeners();
        this.cleanupOldMessages();
    }

    async loadData() {
        await Promise.all([
            this.loadMessages(),
            this.loadSubscriptions()
        ]);
    }

    setupEventListeners() {
        this.setupMessageListeners();
        this.setupPushEventListeners();
        this.setupNotificationEventListeners();
    }

    // Message handling
    setupMessageListeners() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            this.handleMessage(message, sender, sendResponse);
            return true;
        });
    }

    async handleMessage(message, sender, sendResponse) {
        const handlers = {
            'GET_MESSAGES': () => ({ messages: this.messages }),
            'CLEAR_MESSAGES': () => this.clearAllMessages(),
            'GET_SUBSCRIPTIONS': () => ({ subscriptions: Array.from(this.subscriptions.entries()) }),
            'PUSH_SUBSCRIPTION_FOUND': () => this.handleSubscriptionEvent(message.data, sender),
            'PUSH_SUBSCRIPTION_UPDATE': () => this.handleSubscriptionEvent(message.data, sender),
            'NOTIFICATION_PERMISSION_CHANGED': () => this.handlePermissionChange(message.data, sender),
            'TEST_NOTIFICATION': () => this.showTestNotification(message.data)
        };

        try {
            const handler = handlers[message.type];
            if (handler) {
                const result = await handler();
                sendResponse(result || { success: true });
            } else {
                sendResponse({ error: 'Unknown message type' });
            }
        } catch (error) {
            console.error('Error handling message:', error);
            sendResponse({ error: error.message });
        }
    }

    // Push event handling
    setupPushEventListeners() {
        self.addEventListener('push', (event) => {
            this.handlePushEvent(event);
        });

        self.addEventListener('pushsubscriptionchange', (event) => {
            this.handleSubscriptionChange(event.oldSubscription, event.newSubscription);
        });
    }

    async handlePushEvent(event) {
        console.log('Push event received:', event);
        
        const notificationData = this.parsePushData(event);
        await this.storePushMessage(notificationData);
        
        event.waitUntil(
            self.registration.showNotification(notificationData.title, notificationData)
        );
    }

    parsePushData(event) {
        let notificationData = {
            title: 'Push Notification',
            body: 'You have a new message',
            icon: '/icons/icon48.png',
            badge: '/icons/icon16.png',
            tag: 'default',
            data: { url: chrome.runtime.getURL('popup.html'), timestamp: Date.now() }
        };

        if (event.data) {
            try {
                const payload = event.data.json();
                
                if (payload.web_push === 8030 && payload.notification) {
                    notificationData = this.parseDeclarativePushMessage(payload);
                } else {
                    notificationData = {
                        ...notificationData,
                        title: payload.title || notificationData.title,
                        body: payload.body || payload.message || notificationData.body,
                        icon: payload.icon || notificationData.icon,
                        image: payload.image,
                        data: {
                            ...notificationData.data,
                            url: payload.url || payload.navigate,
                            customData: payload.data
                        }
                    };
                }
            } catch (error) {
                console.error('Error parsing push payload:', error);
                notificationData.body = event.data.text();
            }
        }

        return notificationData;
    }

    parseDeclarativePushMessage(payload) {
        const notification = payload.notification;
        
        return {
            title: notification.title,
            body: notification.body,
            icon: notification.icon,
            badge: notification.badge,
            image: notification.image,
            tag: notification.tag || 'declarative',
            dir: notification.dir,
            lang: notification.lang,
            vibrate: notification.vibrate,
            timestamp: notification.timestamp || Date.now(),
            renotify: notification.renotify,
            silent: notification.silent,
            requireInteraction: notification.requireInteraction,
            actions: notification.actions,
            data: {
                url: notification.navigate,
                customData: notification.data,
                mutable: notification.mutable
            }
        };
    }

    // Notification event handling
    setupNotificationEventListeners() {
        self.addEventListener('notificationclick', (event) => {
            this.handleNotificationClick(event);
        });

        self.addEventListener('notificationclose', (event) => {
            this.handleNotificationClose(event);
        });
    }

    handleNotificationClick(event) {
        console.log('Notification clicked:', event);
        
        event.notification.close();

        const notificationData = event.notification.data || {};
        const url = notificationData.url || chrome.runtime.getURL('popup.html');

        event.waitUntil(
            clients.matchAll({ type: 'window' }).then((clientList) => {
                for (const client of clientList) {
                    if (client.url === url && 'focus' in client) {
                        return client.focus();
                    }
                }
                
                if (clients.openWindow) {
                    return clients.openWindow(url);
                }
            })
        );

        this.updateMessageStatus(event.notification.tag, 'clicked');
    }

    handleNotificationClose(event) {
        console.log('Notification closed:', event);
        this.updateMessageStatus(event.notification.tag, 'dismissed');
    }

    // Data management
    async storePushMessage(notificationData) {
        const message = {
            id: this.generateId(),
            title: notificationData.title,
            body: notificationData.body,
            icon: notificationData.icon,
            url: notificationData.data?.url || '',
            timestamp: new Date().toISOString(),
            type: 'push_notification',
            status: 'received',
            data: notificationData.data
        };

        this.messages.unshift(message);
        this.limitMessages();
        await this.saveMessages();
        this.notifyPopupUpdate();
    }

    async showTestNotification(data = {}) {
        const notificationData = {
            title: data.title || 'Test Push Notification',
            body: data.body || 'This is a test push notification from the extension',
            icon: data.icon || '/icons/icon48.png',
            badge: '/icons/icon16.png',
            tag: 'test-' + Date.now(),
            data: {
                url: chrome.runtime.getURL('popup.html'),
                isTest: true,
                ...data.data
            }
        };

        const message = {
            id: this.generateId(),
            title: notificationData.title,
            body: notificationData.body,
            icon: notificationData.icon,
            url: notificationData.data?.url || '',
            timestamp: new Date().toISOString(),
            type: 'test_notification',
            status: 'sent',
            data: notificationData.data
        };

        this.messages.unshift(message);
        this.limitMessages();
        await this.saveMessages();
        this.notifyPopupUpdate();
        
        return self.registration.showNotification(notificationData.title, notificationData);
    }

    // Subscription management
    async handleSubscriptionEvent(subscriptionData, sender) {
        try {
            const subscription = {
                endpoint: subscriptionData.endpoint,
                keys: subscriptionData.keys || {},
                options: subscriptionData.options || {},
                scope: subscriptionData.scope,
                tabId: sender.tab?.id,
                url: sender.tab?.url || subscriptionData.url,
                timestamp: new Date().toISOString()
            };

            this.subscriptions.set(subscription.endpoint, subscription);
            await this.saveSubscriptions();
            console.log('Push subscription detected:', subscription.endpoint, 'for', subscription.url);
            return { success: true, subscription };
        } catch (error) {
            console.error('Error handling subscription event:', error);
            return { error: error.message };
        }
    }

    async handlePermissionChange(permissionData, sender) {
        console.log('Notification permission changed:', permissionData.permission, 'for', permissionData.url);
        return { success: true };
    }

    async handleSubscriptionChange(oldSubscription, newSubscription) {
        console.log('Handling subscription change:', { oldSubscription, newSubscription });
        
        if (oldSubscription) {
            this.subscriptions.delete(oldSubscription.endpoint);
        }
        
        if (newSubscription) {
            this.subscriptions.set(newSubscription.endpoint, {
                endpoint: newSubscription.endpoint,
                keys: newSubscription.getKey ? {
                    p256dh: newSubscription.getKey('p256dh'),
                    auth: newSubscription.getKey('auth')
                } : {},
                timestamp: new Date().toISOString()
            });
        }

        await this.saveSubscriptions();
        console.log('Subscription change processed:', newSubscription ? 'updated' : 'removed');
    }

    // Storage operations
    async loadMessages() {
        try {
            const result = await chrome.storage.local.get(['messages']);
            this.messages = result.messages || [];
        } catch (error) {
            console.error('Failed to load messages:', error);
            this.messages = [];
        }
    }

    async saveMessages() {
        try {
            await chrome.storage.local.set({ 
                messages: this.messages,
                lastUpdate: new Date().toISOString()
            });
        } catch (error) {
            console.error('Failed to save messages:', error);
        }
    }

    async loadSubscriptions() {
        try {
            const result = await chrome.storage.local.get(['subscriptions']);
            const subscriptions = result.subscriptions || [];
            this.subscriptions = new Map(subscriptions);
        } catch (error) {
            console.error('Failed to load subscriptions:', error);
            this.subscriptions = new Map();
        }
    }

    async saveSubscriptions() {
        try {
            await chrome.storage.local.set({ 
                subscriptions: Array.from(this.subscriptions.entries()),
                subscriptionsLastUpdate: new Date().toISOString()
            });
        } catch (error) {
            console.error('Failed to save subscriptions:', error);
        }
    }

    // Utility methods
    async clearAllMessages() {
        console.log('Clearing all messages, current count:', this.messages.length);
        this.messages = [];
        await this.saveMessages();
        console.log('Messages cleared and saved, new count:', this.messages.length);
        this.notifyPopupUpdate();
    }

    updateMessageStatus(tag, status) {
        const message = this.messages.find(msg => 
            msg.data?.tag === tag || msg.id === tag
        );
        
        if (message) {
            message.status = status;
            message.updatedAt = new Date().toISOString();
            this.saveMessages();
            this.notifyPopupUpdate();
        }
    }

    limitMessages() {
        if (this.messages.length > this.maxMessages) {
            this.messages = this.messages.slice(0, this.maxMessages);
        }
    }

    notifyPopupUpdate() {
        try {
            chrome.runtime.sendMessage({
                type: 'MESSAGE_UPDATED',
                count: this.messages.length,
                timestamp: Date.now()
            });
        } catch (error) {
            // Popup might not be open, ignore error
        }
    }

    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    cleanupOldMessages() {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const originalLength = this.messages.length;
        this.messages = this.messages.filter(msg => 
            new Date(msg.timestamp) > thirtyDaysAgo
        );

        if (this.messages.length !== originalLength) {
            this.saveMessages();
            console.log(`Cleaned up ${originalLength - this.messages.length} old messages`);
        }

        setTimeout(() => this.cleanupOldMessages(), 24 * 60 * 60 * 1000);
    }

    getMessageStats() {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
        const thisWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
        
        const stats = {
            total: this.messages.length,
            today: this.messages.filter(msg => new Date(msg.timestamp) >= today).length,
            yesterday: this.messages.filter(msg => {
                const msgDate = new Date(msg.timestamp);
                return msgDate >= yesterday && msgDate < today;
            }).length,
            thisWeek: this.messages.filter(msg => new Date(msg.timestamp) >= thisWeek).length,
            byType: {},
            byStatus: {},
            subscriptions: this.subscriptions.size,
            oldest: this.messages.length > 0 ? this.messages[this.messages.length - 1].timestamp : null,
            newest: this.messages.length > 0 ? this.messages[0].timestamp : null
        };

        this.messages.forEach(msg => {
            stats.byType[msg.type] = (stats.byType[msg.type] || 0) + 1;
            stats.byStatus[msg.status] = (stats.byStatus[msg.status] || 0) + 1;
        });

        return stats;
    }
}

// Initialize
const pushNotificationManager = new PushNotificationManager();

// Extension lifecycle
chrome.runtime.onInstalled.addListener((details) => {
    console.log('Chrome Push Notification Collector installed/updated:', details.reason);
});

chrome.runtime.onStartup.addListener(() => {
    console.log('Chrome Push Notification Collector started');
});