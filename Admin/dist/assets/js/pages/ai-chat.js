/**
 * SyntriGuard AI Assistant Chat
 * Sends messages to /api/ai/chat and displays real AI responses.
 * Uses existing Arclon chat template — no custom styles.
 */

class AIChatApp {

    constructor() {
        this.messagesScrollWrapper = document.querySelector('[data-apps-chat="messages-scroll-wrapper"]');
        this.messagesList = document.querySelector('[data-apps-chat="messages-list"]');
        this.messagesSimplebar = null;
        this.chatForm = document.querySelector('#chat-form');
        if (this.chatForm) this.chatInput = document.getElementById('ai-chat-input') || this.chatForm.querySelector('textarea') || this.chatForm.querySelector('input');
        if (this.messagesScrollWrapper) this.messagesSimplebar = new SimpleBar(this.messagesScrollWrapper);
        this.conversationId = null;
        this.isSending = false;
    }

    getUserMessageHTML(message) {
        var time = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
        var user = (typeof SyntriGuard !== 'undefined') ? SyntriGuard.getUser() : null;
        var avatarSrc = (user && user.avatar_url) ? user.avatar_url : 'https://pub-bb4fc0a4a29548cc9136a6cdb4882573.r2.dev/founder-headshot/raoulstiner.png';
        return '<li class="chat-group odd">' +
            '<img src="' + avatarSrc + '" class="avatar-sm rounded-circle" alt="user" />' +
            '<div class="chat-body">' +
            '<div><h6 class="d-inline-flex">You.</h6> <h6 class="d-inline-flex text-muted">' + time + '</h6></div>' +
            '<div class="chat-message"><p>' + this.escapeHtml(message) + '</p></div>' +
            '</div></li>';
    }

    getAIMessageHTML(message) {
        var time = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
        var formatted = this.formatAIResponse(message);
        var msgId = 'ai-msg-' + Date.now();
        return '<li class="chat-group">' +
            '<div class="avatar-sm rounded-circle bg-light d-flex align-items-center justify-content-center">' +
            '<img src="assets/images/logo-sm.png" height="20" alt="AI"></div>' +
            '<div class="chat-body">' +
            '<div><h6 class="d-inline-flex">SyntriGuard AI.</h6> <h6 class="d-inline-flex text-muted">' + time + '</h6>' +
            '<button class="btn btn-icon btn-ghost-primary ms-2" onclick="readAloud(this)" title="Read aloud"><i class="ti ti-volume fs-18"></i></button>' +
            '</div>' +
            '<div class="chat-message" id="' + msgId + '">' + formatted + '</div>' +
            '</div></li>';
    }

    getTypingHTML() {
        // Animated thinking bubbles using Bootstrap spinner-grow (no custom CSS)
        return '<li class="chat-group" id="ai-typing">' +
            '<div class="avatar-sm rounded-circle bg-light d-flex align-items-center justify-content-center">' +
            '<img src="assets/images/logo-sm.png" height="20" alt="AI"></div>' +
            '<div class="chat-body">' +
            '<div><h6 class="d-inline-flex">SyntriGuard AI.</h6> <h6 class="d-inline-flex text-muted">typing</h6></div>' +
            '<div class="chat-message">' +
            '<div class="d-flex align-items-center gap-2">' +
            '<div class="spinner-grow spinner-grow-sm text-primary" role="status"></div>' +
            '<div class="spinner-grow spinner-grow-sm text-primary" role="status"></div>' +
            '<div class="spinner-grow spinner-grow-sm text-primary" role="status"></div>' +
            '<span class="text-muted ms-2" id="ai-status-text">Analyzing your request...</span>' +
            '</div></div>' +
            '</div></li>';
    }

    escapeHtml(text) {
        var div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    formatAIResponse(text) {
        // Convert **bold** to <strong>
        var formatted = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        // Convert bullet points
        formatted = formatted.replace(/^[•\-]\s(.+)/gm, '&bull; $1');
        // Convert numbered lists
        formatted = formatted.replace(/^(\d+)\.\s(.+)/gm, '<strong>$1.</strong> $2');
        // Convert newlines to <br>
        formatted = formatted.replace(/\n/g, '<br>');
        // Wrap in paragraph
        formatted = '<p>' + formatted + '</p>';
        return formatted;
    }

    // Cycle through status messages while AI is thinking
    startStatusAnimation() {
        var messages = [
            'Analyzing your request...',
            'Checking guard roster...',
            'Reviewing shift schedules...',
            'Reviewing incident reports...',
            'Checking site coverage...',
            'Preparing response...'
        ];
        var index = 0;
        this.statusInterval = setInterval(function() {
            var el = document.getElementById('ai-status-text');
            if (el) {
                index = (index + 1) % messages.length;
                el.textContent = messages[index];
            }
        }, 2500);
    }

    stopStatusAnimation() {
        if (this.statusInterval) {
            clearInterval(this.statusInterval);
            this.statusInterval = null;
        }
    }

    scrollToBottom(smooth) {
        if (this.messagesSimplebar && this.messagesSimplebar.getScrollElement()) {
            var el = this.messagesSimplebar.getScrollElement();
            if (smooth) el.style.scrollBehavior = 'smooth';
            el.scrollTop = el.scrollHeight;
        }
    }

    // Check if message is asking for exports/documents and auto-generate links
    async checkForExportActions(message, aiResponse) {
        var lowerMsg = message.toLowerCase();
        var lowerResp = aiResponse.toLowerCase();
        var links = [];

        var needsSchedule = lowerMsg.includes('schedule') || lowerMsg.includes('shift') ||
            lowerResp.includes('schedule') || lowerResp.includes('shift assignment');
        var needsRoster = lowerMsg.includes('roster') || lowerMsg.includes('guard list');
        var needsIncident = lowerMsg.includes('incident') && (lowerMsg.includes('report') || lowerMsg.includes('export'));
        var needsExport = lowerMsg.includes('export') || lowerMsg.includes('download') ||
            lowerMsg.includes('pdf') || lowerMsg.includes('sheet') ||
            lowerMsg.includes('google') || lowerMsg.includes('drive') ||
            lowerMsg.includes('send') || lowerMsg.includes('share');

        if (!needsExport) return null;

        try {
            if (needsSchedule || needsExport) {
                var month = new Date().toISOString().substring(0, 7);
                var sheetResult = await SyntriGuard.syncScheduleSheet(month);
                if (sheetResult && sheetResult.url) {
                    links.push({ label: 'Open Schedule in Google Sheets', url: sheetResult.url, icon: 'ti ti-table' });
                }
                links.push({ label: 'Download Schedule PDF', action: 'pdf-schedule', icon: 'ti ti-file-download' });
            }
            if (needsRoster) {
                var rosterResult = await SyntriGuard.exportRosterSheet();
                if (rosterResult && rosterResult.url) {
                    links.push({ label: 'Open Roster in Google Sheets', url: rosterResult.url, icon: 'ti ti-table' });
                }
                links.push({ label: 'Download Roster PDF', action: 'pdf-roster', icon: 'ti ti-file-download' });
            }
            if (needsIncident) {
                var incResult = await SyntriGuard.exportIncidentsSheet();
                if (incResult && incResult.url) {
                    links.push({ label: 'Open Incidents in Google Sheets', url: incResult.url, icon: 'ti ti-table' });
                }
            }
        } catch (err) {
            console.error('Export action failed:', err);
        }

        return links.length > 0 ? links : null;
    }

    getExportLinksHTML(links) {
        var html = '<div class="mt-2 d-flex flex-column gap-1">';
        for (var i = 0; i < links.length; i++) {
            var link = links[i];
            if (link.url) {
                html += '<a href="' + link.url + '" target="_blank" class="btn btn-sm btn-outline-primary">' +
                    '<i class="' + link.icon + ' me-1"></i>' + link.label + '</a>';
            } else if (link.action) {
                html += '<button class="btn btn-sm btn-outline-primary" onclick="handleExportAction(\'' + link.action + '\')">' +
                    '<i class="' + link.icon + ' me-1"></i>' + link.label + '</button>';
            }
        }
        html += '</div>';
        return html;
    }

    async sendMessage(message) {
        if (!message.trim() || this.isSending) return;
        this.isSending = true;

        // Disable input while processing
        if (this.chatInput) {
            this.chatInput.disabled = true;
            this.chatInput.placeholder = 'AI is thinking...';
        }
        var submitBtn = this.chatForm?.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.disabled = true;

        // Add user message to chat
        this.messagesList.innerHTML += this.getUserMessageHTML(message);
        this.scrollToBottom(true);

        // Show animated typing indicator
        this.messagesList.innerHTML += this.getTypingHTML();
        this.scrollToBottom(true);
        this.startStatusAnimation();

        try {
            // Try the API call directly — don't pre-check login status
            var token = localStorage.getItem('sg_token');
            if (!token) {
                throw new Error('NOT_LOGGED_IN');
            }

            var response = await fetch('/api/ai/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + token
                },
                body: JSON.stringify({
                    message: message,
                    conversation_id: this.conversationId || null
                })
            });

            this.stopStatusAnimation();

            if (response.status === 401) {
                throw new Error('NOT_LOGGED_IN');
            }

            var result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'AI request failed');
            }

            if (result) {
                this.conversationId = result.conversation_id;

                // Remove typing indicator
                var typing = document.getElementById('ai-typing');
                if (typing) typing.remove();

                // Add AI response
                var responseHTML = this.getAIMessageHTML(result.response);

                // Check for export actions and append links
                var links = await this.checkForExportActions(message, result.response);
                if (links) {
                    var linksHTML = this.getExportLinksHTML(links);
                    responseHTML = responseHTML.replace('</div></div></li>',
                        linksHTML + '</div></div></li>');
                }

                this.messagesList.innerHTML += responseHTML;
                this.scrollToBottom(true);
            }
        } catch (err) {
            this.stopStatusAnimation();
            var typing = document.getElementById('ai-typing');
            if (typing) typing.remove();

            if (err.message === 'NOT_LOGGED_IN') {
                this.messagesList.innerHTML += this.getAIMessageHTML(
                    'You need to log in first.\n\n' +
                    '<a href="/login" class="btn btn-sm btn-primary mt-2">Go to Login</a>'
                );
            } else {
                this.messagesList.innerHTML += this.getAIMessageHTML(
                    'Sorry, I encountered an error. Please try again.\n\n' +
                    'Error: ' + err.message
                );
            }
            this.scrollToBottom(true);
        }

        // Re-enable input
        this.isSending = false;
        if (this.chatInput) {
            this.chatInput.disabled = false;
            this.chatInput.placeholder = 'Ask SyntriGuard AI';
            this.chatInput.focus();
        }
        if (submitBtn) submitBtn.disabled = false;

        // Refresh conversation list in sidebar
        this.loadConversations();
    }

    // ─── Conversation Management ───

    async loadConversations() {
        var listEl = document.getElementById('conversations-list');
        if (!listEl) return;

        if (typeof SyntriGuard === 'undefined' || !SyntriGuard.isLoggedIn()) {
            listEl.innerHTML = '<div class="text-center py-3 text-muted fs-13">Log in to see conversations</div>';
            return;
        }

        try {
            this.allConversations = await SyntriGuard.getAIConversations();
            this.renderConversationList();
        } catch (err) {
            console.error('Failed to load conversations:', err);
            listEl.innerHTML = '<div class="text-center py-3 text-muted fs-13">Failed to load</div>';
        }
    }

    renderConversationList(filter) {
        var listEl = document.getElementById('conversations-list');
        if (!listEl) return;

        var conversations = this.allConversations || [];

        // Apply search filter
        if (filter && filter.trim()) {
            var term = filter.toLowerCase();
            conversations = conversations.filter(function(c) {
                return (c.title || '').toLowerCase().includes(term);
            });
        }

        if (conversations.length === 0) {
            listEl.innerHTML = '<div class="text-center py-3 text-muted fs-13">' +
                (filter ? 'No matching conversations' : 'No conversations yet. Start one!') + '</div>';
            return;
        }

        var html = '';
        var self = this;
        for (var i = 0; i < conversations.length; i++) {
            var conv = conversations[i];
            var isActive = conv.id === this.conversationId;
            var timeAgo = this.getTimeAgo(conv.updated_at || conv.created_at);
            var title = conv.title || 'Conversation';
            if (title.length > 32) title = title.substring(0, 32) + '...';

            html += '<div class="d-flex align-items-center" data-conv-wrapper="' + conv.id + '">' +
                '<a href="javascript:void(0);" class="text-body d-block flex-grow-1" data-conv-id="' + conv.id + '">' +
                '<div class="chat-users' + (isActive ? ' active' : '') + '">' +
                '<div class="avatar-md ' + (isActive ? 'chat-avatar-online' : 'chat-avatar-offline') + '">' +
                '<div class="h-100 w-100 rounded-circle bg-light d-flex align-items-center justify-content-center">' +
                '<img src="assets/images/logo-sm.png" height="22" alt="AI"></div></div>' +
                '<div class="flex-grow-1 overflow-hidden">' +
                '<h5 class="m-0">' + this.escapeHtml(title) + '</h5>' +
                '<p class="mt-1 mb-0 text-muted lh-1">' +
                '<span class="w-75 d-inline-block text-truncate overflow-hidden fs-13">' + timeAgo + '</span>' +
                '</p></div>' +
                '</div></a>' +
                '<div class="dropdown flex-shrink-0 me-1">' +
                '<button class="btn btn-sm btn-icon btn-ghost-dark" data-bs-toggle="dropdown" aria-expanded="false">' +
                '<i class="ti ti-dots-vertical fs-16"></i></button>' +
                '<div class="dropdown-menu dropdown-menu-end">' +
                '<a href="javascript:void(0);" class="dropdown-item" data-rename-conv="' + conv.id + '">' +
                '<i class="ti ti-edit fs-14 me-1"></i>Rename</a>' +
                '<a href="javascript:void(0);" class="dropdown-item text-danger" data-delete-conv="' + conv.id + '">' +
                '<i class="ti ti-trash fs-14 me-1"></i>Delete</a>' +
                '</div></div>' +
                '</div>';
        }
        listEl.innerHTML = html;

        // Attach click handlers for loading conversations
        listEl.querySelectorAll('[data-conv-id]').forEach(function(link) {
            link.addEventListener('click', function(e) {
                e.preventDefault();
                var convId = parseInt(this.getAttribute('data-conv-id'));
                if (convId === self.conversationId) return; // already active

                // Instantly swap active class — no re-render
                listEl.querySelectorAll('.chat-users').forEach(function(el) {
                    el.classList.remove('active');
                });
                var chatUsersDiv = this.querySelector('.chat-users');
                if (chatUsersDiv) chatUsersDiv.classList.add('active');

                self.loadConversation(convId);
            });
        });

        // Attach delete handlers
        listEl.querySelectorAll('[data-delete-conv]').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                var convId = parseInt(this.getAttribute('data-delete-conv'));
                self.deleteConversation(convId);
            });
        });

        // Attach rename handlers
        listEl.querySelectorAll('[data-rename-conv]').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                var convId = parseInt(this.getAttribute('data-rename-conv'));
                self.renameConversation(convId);
            });
        });
    }

    async deleteConversation(convId) {
        if (!confirm('Delete this conversation?')) return;

        try {
            var token = SyntriGuard.getToken();
            await fetch('/api/ai/conversations/' + convId, {
                method: 'DELETE',
                headers: { 'Authorization': 'Bearer ' + token }
            });

            // If we deleted the active conversation, start fresh
            if (this.conversationId === convId) {
                this.startNewConversation();
            } else {
                this.loadConversations();
            }
        } catch (err) {
            console.error('Failed to delete conversation:', err);
        }
    }

    async renameConversation(convId) {
        var conv = (this.allConversations || []).find(function(c) { return c.id === convId; });
        var currentTitle = conv ? conv.title : '';
        var newTitle = prompt('Rename conversation:', currentTitle);
        if (!newTitle || newTitle.trim() === '' || newTitle === currentTitle) return;

        try {
            var token = SyntriGuard.getToken();
            await fetch('/api/ai/conversations/' + convId, {
                method: 'PUT',
                headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: newTitle.trim() })
            });
            this.loadConversations();
        } catch (err) {
            console.error('Failed to rename conversation:', err);
        }
    }

    async loadConversation(convId) {
        if (typeof SyntriGuard === 'undefined' || !SyntriGuard.isLoggedIn()) return;

        // Show loading in chat area immediately
        this.conversationId = convId;
        this.messagesList.innerHTML = '<li class="text-center py-4"><div class="spinner-border spinner-border-sm text-primary" role="status"></div><span class="text-muted ms-2">Loading messages...</span></li>';

        try {
            var token = SyntriGuard.getToken();
            var response = await fetch('/api/ai/conversations/' + convId + '/messages', {
                headers: { 'Authorization': 'Bearer ' + token }
            });
            var messages = await response.json();

            // Build all HTML first, then set once (no flickering)
            var html = '';
            for (var i = 0; i < messages.length; i++) {
                var msg = messages[i];
                if (msg.role === 'user') {
                    html += this.getUserMessageHTML(msg.content);
                } else {
                    html += this.getAIMessageHTML(msg.content);
                }
            }
            this.messagesList.innerHTML = html;
            this.scrollToBottom(false);

            if (this.chatInput) this.chatInput.focus();
        } catch (err) {
            console.error('Failed to load conversation:', err);
            this.messagesList.innerHTML = '<li class="text-center py-4 text-muted">Failed to load conversation</li>';
        }
    }

    startNewConversation() {
        this.conversationId = null;

        // Remove active from all sidebar items instantly
        var listEl = document.getElementById('conversations-list');
        if (listEl) {
            listEl.querySelectorAll('.chat-users').forEach(function(el) {
                el.classList.remove('active');
            });
        }

        // Show welcome message
        this.messagesList.innerHTML = this.getAIMessageHTML(
            'Good ' + this.getGreeting() + '. How can I help you today?\n\n' +
            'You can ask me about:\n' +
            '- Shift schedules and coverage\n' +
            '- Guard availability and performance\n' +
            '- Open incidents and recommendations\n' +
            '- Site status and client reports\n' +
            '- Export schedules to Google Sheets or PDF'
        );
        this.scrollToBottom(false);

        if (this.chatInput) this.chatInput.focus();
    }

    getGreeting() {
        var hour = new Date().getHours();
        if (hour < 12) return 'morning';
        if (hour < 17) return 'afternoon';
        return 'evening';
    }

    getTimeAgo(dateStr) {
        if (!dateStr) return '';
        var now = new Date();
        var date = new Date(dateStr);
        var diffMs = now - date;
        var diffMins = Math.floor(diffMs / 60000);
        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return diffMins + 'm ago';
        var diffHours = Math.floor(diffMins / 60);
        if (diffHours < 24) return diffHours + 'h ago';
        var diffDays = Math.floor(diffHours / 24);
        if (diffDays === 1) return 'Yesterday';
        if (diffDays < 7) return diffDays + 'd ago';
        return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
    }

    init() {
        var self = this;
        this.allConversations = [];
        this.scrollToBottom();

        // Load past conversations
        this.loadConversations();

        // New Conversation button
        var newConvBtn = document.getElementById('btn-new-conversation');
        if (newConvBtn) {
            newConvBtn.addEventListener('click', function() {
                self.startNewConversation();
            });
        }

        // Search conversations
        var searchInput = document.getElementById('search-conversations');
        if (searchInput) {
            searchInput.addEventListener('input', function() {
                self.renderConversationList(this.value);
            });
        }

        // Quick Action buttons — send their prompt directly
        var quickActions = document.querySelectorAll('[data-quick-action]');
        quickActions.forEach(function(el) {
            el.addEventListener('click', function() {
                var prompt = this.getAttribute('data-quick-action');
                if (prompt && !self.isSending) {
                    self.conversationId = null;
                    self.messagesList.innerHTML = '';
                    self.sendMessage(prompt);
                }
            });
        });

        // Chat form submit
        this.chatForm?.addEventListener('submit', function(e) {
            e.preventDefault();
            var msg = self.chatInput ? self.chatInput.value.trim() : '';
            if (msg.length > 0) {
                self.chatInput.value = '';
                self.chatInput.style.height = 'auto';
                self.sendMessage(msg);
            }
        });

        // Enter to send (Shift+Enter for new line)
        if (this.chatInput) {
            this.chatInput.addEventListener('keydown', function(e) {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    self.chatForm.dispatchEvent(new Event('submit'));
                }
            });

            // Auto-resize textarea
            this.chatInput.addEventListener('input', function() {
                this.style.height = 'auto';
                this.style.height = Math.min(this.scrollHeight, 120) + 'px';
            });
        }
    }
}

// Global handler for export buttons in chat
function handleExportAction(action) {
    if (action === 'pdf-schedule') {
        var today = new Date();
        var start = today.toISOString().split('T')[0];
        var end = new Date(today.getTime() + 30 * 86400000).toISOString().split('T')[0];
        SyntriGuard.downloadPDF('schedule', { start: start, end: end });
    } else if (action === 'pdf-roster') {
        SyntriGuard.downloadPDF('roster');
    } else if (action === 'pdf-incident') {
        SyntriGuard.downloadPDF('incident/1');
    }
}

var aiChatInstance = new AIChatApp();
aiChatInstance.init();

// ── Voice Input (Speech-to-Text) ──
var voiceBtn = document.getElementById('btn-voice-input');
var voiceStatus = document.getElementById('voice-status');
var isListening = false;
var stoppedManually = false;
var recognition = null;

function setMicOff() {
    isListening = false;
    if (voiceBtn) {
        voiceBtn.innerHTML = '<i class="ti ti-microphone fs-20"></i>';
        voiceBtn.classList.remove('btn-danger', 'btn-soft-danger', 'text-danger');
        voiceBtn.classList.add('btn-ghost-primary');
    }
    if (voiceStatus) voiceStatus.classList.add('d-none');
}

function setMicOn() {
    isListening = true;
    stoppedManually = false;
    if (voiceBtn) {
        voiceBtn.innerHTML = '<i class="ti ti-microphone-off fs-20 text-white"></i>';
        voiceBtn.classList.remove('btn-ghost-primary');
        voiceBtn.classList.add('btn-danger');
    }
    if (voiceStatus) voiceStatus.classList.remove('d-none');
}

if (voiceBtn && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
    var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = function () { setMicOn(); };

    recognition.onresult = function (event) {
        var transcript = '';
        for (var i = event.resultIndex; i < event.results.length; i++) {
            transcript += event.results[i][0].transcript;
        }
        var input = document.getElementById('ai-chat-input');
        if (input) input.value = transcript;
    };

    recognition.onend = function () {
        setMicOff();

        // Only auto-submit if user didn't manually stop
        if (!stoppedManually) {
            var input = document.getElementById('ai-chat-input');
            if (input && input.value.trim().length > 0) {
                var msg = input.value.trim();
                input.value = '';
                aiChatInstance.sendMessage(msg);
            }
        }
    };

    recognition.onerror = function (event) {
        setMicOff();
        if (event.error !== 'no-speech' && event.error !== 'aborted') {
            console.error('Speech recognition error:', event.error);
        }
    };

    voiceBtn.addEventListener('click', function () {
        if (isListening) {
            stoppedManually = true;
            recognition.stop();
        } else {
            recognition.start();
        }
    });
} else if (voiceBtn) {
    voiceBtn.classList.add('d-none');
}

// ── Read Aloud (Text-to-Speech) ──
function readAloud(btn) {
    if (!('speechSynthesis' in window)) {
        alert('Text-to-speech is not supported in this browser.');
        return;
    }

    // If already speaking, stop
    if (window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
        btn.innerHTML = '<i class="ti ti-volume fs-18"></i>';
        return;
    }

    // Get the text from the next chat-message div
    var messageDiv = btn.closest('.chat-body').querySelector('.chat-message');
    if (!messageDiv) return;

    var text = messageDiv.innerText || messageDiv.textContent;
    if (!text.trim()) return;

    var utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    utterance.pitch = 1;
    utterance.lang = 'en-US';

    btn.innerHTML = '<i class="ti ti-player-stop fs-18"></i>';

    utterance.onend = function () {
        btn.innerHTML = '<i class="ti ti-volume fs-18"></i>';
    };

    utterance.onerror = function () {
        btn.innerHTML = '<i class="ti ti-volume fs-18"></i>';
    };

    window.speechSynthesis.speak(utterance);
}

// Check if we arrived here via a Quick Action from the navbar
var pendingPrompt = sessionStorage.getItem('sg_quick_prompt');
if (pendingPrompt) {
    sessionStorage.removeItem('sg_quick_prompt');
    setTimeout(function() {
        aiChatInstance.conversationId = null;
        aiChatInstance.messagesList.innerHTML = '';
        aiChatInstance.sendMessage(pendingPrompt);
    }, 500);
}
