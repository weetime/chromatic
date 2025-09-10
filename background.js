// Service Worker - Push API消息处理和通知管理
class PushNotificationManager {
    constructor() {
        this.messages = [];
        this.maxMessages = 1000; // Maximum stored messages.
        this.subscriptions = new Map(); // Store push subscriptions.
        this.init();
    }

    async init() {
        // Load stored messages and subscriptions.
        await this.loadMessages();
        await this.loadSubscriptions();
        
        // Setup message listeners.
        this.setupMessageListeners();
        
        // Setup push event listeners.
        this.setupPushEventListeners();
        
        // Setup notification event listeners.
        this.setupNotificationEventListeners();
        
        // Cleanup old messages.
        this.cleanupOldMessages();
    }

    setupMessageListeners() {
        // Listen for messages from content scripts and popup.
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            switch (message.type) {
                case 'GET_MESSAGES':
                    sendResponse({ messages: this.messages });
                    break;
                    
                case 'CLEAR_MESSAGES':
                    this.clearAllMessages();
                    sendResponse({ success: true });
                    break;
                    
                case 'GET_SUBSCRIPTIONS':
                    sendResponse({ 
                        subscriptions: Array.from(this.subscriptions.entries()) 
                    });
                    break;
                    
                case 'PUSH_SUBSCRIPTION_FOUND':
                case 'PUSH_SUBSCRIPTION_UPDATE':
                    this.handleSubscriptionEvent(message.data, sender);
                    sendResponse({ success: true });
                    break;
                    
                case 'NOTIFICATION_PERMISSION_CHANGED':
                    this.handlePermissionChange(message.data, sender);
                    sendResponse({ success: true });
                    break;
                    
                case 'DELETE_SUBSCRIPTION':
                    this.deletePushSubscription(message.data.endpoint)
                        .then(result => sendResponse(result))
                        .catch(error => sendResponse({ error: error.message }));
                    break;
                    
                case 'GET_STATS':
                    sendResponse(this.getMessageStats());
                    break;
                    
                case 'TEST_NOTIFICATION':
                    this.showTestNotification(message.data);
                    sendResponse({ success: true });
                    break;
                    
                default:
                    sendResponse({ error: 'Unknown message type' });
            }
            return true; // Async response.
        });
    }

    setupPushEventListeners() {
        // Listen for push events from the Push Service.
        self.addEventListener('push', (event) => {
            console.log('Push event received:', event);
            
            let notificationData = {
                title: 'Push Notification',
                body: 'You have a new message',
                icon: '/icons/icon48.png',
                badge: '/icons/icon16.png',
                tag: 'default',
                data: {
                    url: chrome.runtime.getURL('popup.html'),
                    timestamp: Date.now()
                }
            };

            // Handle push message with payload.
            if (event.data) {
                try {
                    const payload = event.data.json();
                    
                    // Check if it's a declarative push message.
                    if (payload.web_push === 8030 && payload.notification) {
                        notificationData = this.parseDeclarativePushMessage(payload);
                    } else {
                        // Handle custom payload format.
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
                    // Use plain text if JSON parsing fails.
                    notificationData.body = event.data.text();
                }
            }

            // Store the message.
            this.storePushMessage(notificationData);

            // Show the notification.
            event.waitUntil(
                self.registration.showNotification(
                    notificationData.title, 
                    notificationData
                )
            );
        });

        // Handle push subscription changes.
        self.addEventListener('pushsubscriptionchange', (event) => {
            console.log('Push subscription changed:', event);
            
            event.waitUntil(
                this.handleSubscriptionChange(event.oldSubscription, event.newSubscription)
            );
        });
    }

    setupNotificationEventListeners() {
        // Handle notification clicks.
        self.addEventListener('notificationclick', (event) => {
            console.log('Notification clicked:', event);
            
            event.notification.close();

            const notificationData = event.notification.data || {};
            const url = notificationData.url || chrome.runtime.getURL('popup.html');

            event.waitUntil(
                clients.matchAll({ type: 'window' }).then((clientList) => {
                    // Check if there's already a window/tab open with the target URL.
                    for (const client of clientList) {
                        if (client.url === url && 'focus' in client) {
                            return client.focus();
                        }
                    }
                    
                    // Open new window/tab if none exists.
                    if (clients.openWindow) {
                        return clients.openWindow(url);
                    }
                })
            );

            // Update message as clicked.
            this.updateMessageStatus(event.notification.tag, 'clicked');
        });

        // Handle notification close events.
        self.addEventListener('notificationclose', (event) => {
            console.log('Notification closed:', event);
            
            // Update message as dismissed.
            this.updateMessageStatus(event.notification.tag, 'dismissed');
        });
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

        // Limit message count.
        if (this.messages.length > this.maxMessages) {
            this.messages = this.messages.slice(0, this.maxMessages);
        }

        await this.saveMessages();
        this.notifyPopupUpdateOnly();
    }

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
        try {
            console.log('Notification permission changed:', permissionData.permission, 'for', permissionData.url);
            // Just log permission changes, don't store as messages
            return { success: true };
        } catch (error) {
            console.error('Error handling permission change:', error);
            return { error: error.message };
        }
    }

    async deletePushSubscription(endpoint) {
        try {
            if (this.subscriptions.has(endpoint)) {
                this.subscriptions.delete(endpoint);
                await this.saveSubscriptions();
                return { success: true };
            } else {
                return { error: 'Subscription not found' };
            }
        } catch (error) {
            console.error('Error deleting push subscription:', error);
            return { error: error.message };
        }
    }

    async handleSubscriptionChange(oldSubscription, newSubscription) {
        console.log('Handling subscription change:', { oldSubscription, newSubscription });
        
        // Update stored subscriptions.
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
        
        // Just log subscription changes, don't store as messages
        console.log('Subscription change processed:', newSubscription ? 'updated' : 'removed');
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

        // Store test notification with special type
        const message = {
            id: this.generateId(),
            title: notificationData.title,
            body: notificationData.body,
            icon: notificationData.icon,
            url: notificationData.data?.url || '',
            timestamp: new Date().toISOString(),
            type: 'test_notification', // Special type for test notifications
            status: 'sent',
            data: notificationData.data
        };

        this.messages.unshift(message);
        if (this.messages.length > this.maxMessages) {
            this.messages = this.messages.slice(0, this.maxMessages);
        }
        
        // Save and notify in one go
        await this.saveMessages();
        this.notifyPopupUpdateOnly();
        
        return self.registration.showNotification(
            notificationData.title,
            notificationData
        );
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

    async clearAllMessages() {
        console.log('Clearing all messages, current count:', this.messages.length);
        this.messages = [];
        await this.saveMessages();
        console.log('Messages cleared and saved, new count:', this.messages.length);
        this.notifyPopupUpdateOnly();
    }

    notifyPopupUpdate() {
        // Save first, then notify
        this.saveMessages().then(() => {
            this.notifyPopupUpdateOnly();
        });
    }

    notifyPopupUpdateOnly() {
        // Notify popup of message updates without saving.
        try {
            chrome.runtime.sendMessage({
                type: 'MESSAGE_UPDATED',
                count: this.messages.length,
                timestamp: Date.now()
            }, (response) => {
                if (chrome.runtime.lastError) {
                    // Popup might not be open, ignore error.
                    return;
                }
            });
        } catch (error) {
            // Popup might not be open, ignore error.
        }
    }

    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    generateKey() {
        // Generate a simple key for demo purposes.
        // In production, use proper cryptographic key generation.
        return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
    }

    cleanupOldMessages() {
        // Clean up messages older than 30 days.
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

        // Schedule next cleanup.
        setTimeout(() => this.cleanupOldMessages(), 24 * 60 * 60 * 1000); // 24 hours.
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

        // Statistics by type.
        this.messages.forEach(msg => {
            stats.byType[msg.type] = (stats.byType[msg.type] || 0) + 1;
            stats.byStatus[msg.status] = (stats.byStatus[msg.status] || 0) + 1;
        });

        return stats;
    }
}

// Initialize the push notification manager.
const pushNotificationManager = new PushNotificationManager();

// Handle extension install and update.
chrome.runtime.onInstalled.addListener((details) => {
    console.log('Chrome Push Notification Collector installed/updated:', details.reason);
    
    if (details.reason === 'install') {
        console.log('Extension installed successfully. Ready to collect push notifications.');
        // Don't store welcome messages - just log
    }
});

// Handle extension startup.
chrome.runtime.onStartup.addListener(() => {
    console.log('Chrome Push Notification Collector started');
});