// Content script - Push API subscription detection
class PushSubscriptionDetector {
    constructor() {
        this.isInitialized = false;
        this.init();
    }

    init() {
        if (this.isInitialized || this.isExtensionPage()) return;
        
        this.isInitialized = true;
        this.checkPushApiSupport();
        this.monitorPushSubscriptions();
        
        console.log('Push Subscription Detector loaded for:', window.location.href);
    }

    isExtensionPage() {
        return window.location.href.startsWith('chrome://') || 
               window.location.href.startsWith('chrome-extension://') ||
               window.location.href.startsWith('moz-extension://');
    }

    checkPushApiSupport() {
        const support = {
            serviceWorker: 'serviceWorker' in navigator,
            pushManager: 'PushManager' in window,
            notifications: 'Notification' in window
        };

        console.log('Push API support:', support);

        if (support.serviceWorker && support.pushManager && support.notifications) {
            this.detectExistingSubscriptions();
        }
    }

    async detectExistingSubscriptions() {
        try {
            const registrations = await navigator.serviceWorker.getRegistrations();
            
            for (const registration of registrations) {
                if (registration.pushManager) {
                    const subscription = await registration.pushManager.getSubscription();
                    if (subscription) {
                        console.log('Found push subscription:', subscription.endpoint);
                        this.reportSubscription(subscription, registration);
                    }
                }
            }
        } catch (error) {
            console.error('Error detecting subscriptions:', error);
        }
    }

    monitorPushSubscriptions() {
        this.monitorServiceWorkerMessages();
        this.monitorPermissions();
        this.interceptPushMethods();
    }

    monitorServiceWorkerMessages() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.addEventListener('message', (event) => {
                if (event.data?.type === 'PUSH_SUBSCRIPTION_UPDATE') {
                    this.handleSubscriptionUpdate(event.data.subscription);
                }
            });
        }
    }

    monitorPermissions() {
        if ('Notification' in window) {
            console.log('Initial notification permission:', Notification.permission);
            
            if ('permissions' in navigator) {
                navigator.permissions.query({ name: 'notifications' }).then((permission) => {
                    permission.onchange = () => {
                        this.reportPermissionChange(permission.state);
                    };
                });
            }
        }
    }

    interceptPushMethods() {
        this.interceptServiceWorkerRegistration();
        this.checkExistingRegistrations();
    }

    interceptServiceWorkerRegistration() {
        const originalRegister = navigator.serviceWorker.register;
        const self = this;
        
        navigator.serviceWorker.register = async function(...args) {
            const registration = await originalRegister.apply(this, args);
            
            if (registration.pushManager) {
                self.interceptPushManager(registration.pushManager);
            }
            
            return registration;
        };
    }

    checkExistingRegistrations() {
        navigator.serviceWorker.getRegistrations().then(registrations => {
            registrations.forEach(registration => {
                if (registration.pushManager) {
                    this.interceptPushManager(registration.pushManager);
                }
            });
        });
    }

    interceptPushManager(pushManager) {
        const originalSubscribe = pushManager.subscribe;
        const self = this;
        
        pushManager.subscribe = async function(options) {
            console.log('Push subscription requested:', options);
            
            try {
                const subscription = await originalSubscribe.call(this, options);
                console.log('Push subscription created:', subscription.endpoint);
                
                self.reportSubscription(subscription, null);
                return subscription;
            } catch (error) {
                console.error('Push subscription failed:', error);
                self.reportSubscriptionError(error);
                throw error;
            }
        };
    }

    reportSubscription(subscription, registration) {
        const subscriptionData = {
            endpoint: subscription.endpoint,
            keys: this.extractKeys(subscription),
            options: subscription.options || {},
            scope: registration?.scope,
            url: window.location.href,
            timestamp: new Date().toISOString()
        };

        this.sendMessage({
            type: 'PUSH_SUBSCRIPTION_FOUND',
            data: subscriptionData
        });
    }

    extractKeys(subscription) {
        try {
            return {
                p256dh: subscription.getKey ? this.arrayBufferToBase64(subscription.getKey('p256dh')) : null,
                auth: subscription.getKey ? this.arrayBufferToBase64(subscription.getKey('auth')) : null
            };
        } catch (error) {
            console.error('Error extracting subscription keys:', error);
            return {};
        }
    }

    arrayBufferToBase64(buffer) {
        if (!buffer) return null;
        const bytes = new Uint8Array(buffer);
        let binary = '';
        bytes.forEach(byte => binary += String.fromCharCode(byte));
        return btoa(binary);
    }

    handleSubscriptionUpdate(subscriptionData) {
        this.sendMessage({
            type: 'PUSH_SUBSCRIPTION_UPDATE',
            data: subscriptionData
        });
    }

    reportPermissionChange(newState) {
        this.sendMessage({
            type: 'NOTIFICATION_PERMISSION_CHANGED',
            data: {
                permission: newState,
                url: window.location.href,
                timestamp: new Date().toISOString()
            }
        });
    }

    reportSubscriptionError(error) {
        this.sendMessage({
            type: 'PUSH_SUBSCRIPTION_ERROR',
            data: {
                error: error.message,
                url: window.location.href,
                timestamp: new Date().toISOString()
            }
        });
    }

    sendMessage(messageData) {
        if (!chrome?.runtime?.sendMessage) {
            console.log('Chrome runtime API not available');
            return;
        }

        try {
            chrome.runtime.sendMessage(messageData, (response) => {
                if (chrome.runtime.lastError) {
                    if (!chrome.runtime.lastError.message?.includes('Receiving end does not exist')) {
                        console.log('Runtime error:', chrome.runtime.lastError.message);
                    }
                }
            });
        } catch (error) {
            console.log('Error sending message:', error);
        }
    }
}

// Initialize
if (!window.pushSubscriptionDetector) {
    window.pushSubscriptionDetector = new PushSubscriptionDetector();
}