chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'UPDATE_TODOS') {
                // Update todos in chrome.storage
                chrome.storage.local.set({ todos: message.todos }, () => {
                        // Broadcast the update to all tabs except the sender
                        chrome.tabs.query({}, (tabs) => {
                                tabs.forEach((tab) => {
                                        if (sender.tab && tab.id !== sender.tab.id) {
                                                chrome.tabs.sendMessage(tab.id, {
                                                        type: 'SYNC_TODOS',
                                                        todos: message.todos,
                                                });
                                        }
                                });
                        });
                        sendResponse({ success: true });
                });
        }
        return true; // Indicate async response
});
