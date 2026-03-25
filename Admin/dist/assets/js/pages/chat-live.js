/**
 * SyntriGuard — Messages Page (Live Chat)
 * Select a guard, load real conversation, send messages to database.
 */
var chatGuards = [];
var activeGuardId = null;
var DEFAULT_AVATAR = 'https://pub-bb4fc0a4a29548cc9136a6cdb4882573.r2.dev/founder-headshot/raoulstiner.png';

document.addEventListener('DOMContentLoaded', async function () {
    try {
        chatGuards = await SyntriGuard.getGuards();
        if (!chatGuards || !Array.isArray(chatGuards)) chatGuards = [];
        renderSidebar(chatGuards);
    } catch (err) {
        console.error('Chat: Failed to load guards', err);
    }

    // Send message form
    var form = document.getElementById('chat-form');
    if (form) {
        form.addEventListener('submit', async function (e) {
            e.preventDefault();
            await sendMessage();
        });
    }

    // Sidebar search
    var searchInput = document.querySelector('.chat-user-list input[type="text"]');
    if (searchInput) {
        searchInput.addEventListener('input', function () {
            var q = this.value.toLowerCase();
            var filtered = chatGuards.filter(function (g) {
                return (g.full_name || '').toLowerCase().indexOf(q) !== -1 ||
                       (g.role || '').toLowerCase().indexOf(q) !== -1 ||
                       (g.site_name || '').toLowerCase().indexOf(q) !== -1;
            });
            renderSidebar(filtered);
        });
    }
});

function renderSidebar(guards) {
    var contactList = document.querySelector('.users-list');
    if (!contactList) return;

    var leads = [];
    var others = [];
    guards.forEach(function (g) {
        if ((g.role || '').toLowerCase().indexOf('lead') !== -1) {
            leads.push(g);
        } else {
            others.push(g);
        }
    });

    var html = '';

    if (leads.length > 0) {
        html += '<div class="d-flex align-items-center px-3 py-2">' +
            '<iconify-icon icon="solar:pin-bold-duotone" class="fs-18 text-muted"></iconify-icon>' +
            '<h5 class="mb-0 ms-1 fw-semibold fs-14">Team Leads</h5></div>';
        leads.forEach(function (g) { html += guardRow(g); });
    }

    if (others.length > 0) {
        html += '<div class="d-flex align-items-center px-3 py-2">' +
            '<iconify-icon icon="solar:chat-line-bold-duotone" class="fs-18 text-muted"></iconify-icon>' +
            '<h5 class="mb-0 ms-1 fw-semibold fs-14">All Guards</h5></div>';
        others.forEach(function (g) { html += guardRow(g); });
    }

    contactList.innerHTML = html;

    // Attach click handlers
    contactList.querySelectorAll('[data-guard-id]').forEach(function (el) {
        el.addEventListener('click', function (e) {
            e.preventDefault();
            var gid = parseInt(this.getAttribute('data-guard-id'));
            selectGuard(gid);
            // Close offcanvas on mobile
            var offcanvas = bootstrap.Offcanvas.getInstance(document.getElementById('chatUserList'));
            if (offcanvas) offcanvas.hide();
        });
    });
}

function guardRow(g) {
    var avatar = g.avatar_url || DEFAULT_AVATAR;
    var name = g.full_name || g.name || 'Unknown';
    var subtitle = g.site_name ? 'On duty \u2014 ' + g.site_name : (g.role || 'Guard');
    var isActive = g.id === activeGuardId ? ' active' : '';
    var onlineClass = g.status === 'on_duty' ? 'chat-avatar-online' : 'chat-avatar-offline';

    return '<a href="javascript:void(0);" class="text-body d-block" data-guard-id="' + g.id + '">' +
        '<div class="chat-users' + isActive + '">' +
            '<div class="avatar-md ' + onlineClass + '">' +
                '<img src="' + escHtml(avatar) + '" class="img-fluid rounded-circle" alt="' + escHtml(name) + '" />' +
            '</div>' +
            '<div class="flex-grow-1 overflow-hidden">' +
                '<h5 class="m-0">' + escHtml(name) + '</h5>' +
                '<p class="mt-1 mb-0 text-muted lh-1">' +
                    '<span class="w-75 d-inline-block text-truncate overflow-hidden fs-13">' + escHtml(subtitle) + '</span>' +
                '</p>' +
            '</div>' +
        '</div>' +
    '</a>';
}

async function selectGuard(guardId) {
    activeGuardId = guardId;
    var guard = chatGuards.find(function (g) { return g.id === guardId; });
    if (!guard) return;

    // Update header
    var nameEl = document.getElementById('chat-active-name');
    var statusEl = document.getElementById('chat-active-status');
    var avatarEl = document.getElementById('chat-active-avatar');
    var inputEl = document.getElementById('chat-input');

    if (nameEl) nameEl.textContent = guard.full_name || guard.name || 'Guard';
    if (statusEl) statusEl.innerHTML = '<small class="ti ti-circle-filled text-success"></small> ' + (guard.site_name ? 'On duty \u2014 ' + guard.site_name : (guard.role || 'Guard'));
    if (avatarEl) avatarEl.src = guard.avatar_url || DEFAULT_AVATAR;
    if (inputEl) inputEl.placeholder = 'Message ' + (guard.full_name || 'guard') + '...';

    // Highlight active in sidebar
    document.querySelectorAll('.chat-users').forEach(function (el) { el.classList.remove('active'); });
    var activeRow = document.querySelector('[data-guard-id="' + guardId + '"] .chat-users');
    if (activeRow) activeRow.classList.add('active');

    // Load conversation
    await loadConversation(guardId);
}

async function loadConversation(guardId) {
    var messagesList = document.querySelector('[data-apps-chat="messages-list"]');
    if (!messagesList) return;

    try {
        var token = localStorage.getItem('sg_token');
        var resp = await fetch('/api/messages/conversation/' + guardId, {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        var messages = await resp.json();
        if (!Array.isArray(messages)) messages = [];

        var guard = chatGuards.find(function (g) { return g.id === guardId; });
        var guardName = guard ? (guard.full_name || 'Guard') : 'Guard';
        var guardAvatar = guard ? (guard.avatar_url || DEFAULT_AVATAR) : DEFAULT_AVATAR;
        var user = SyntriGuard.getUser();
        var userAvatar = user && user.avatar_url ? user.avatar_url : DEFAULT_AVATAR;

        if (messages.length === 0) {
            messagesList.innerHTML = '<li class="text-center text-muted py-5">' +
                '<i class="ti ti-message-circle fs-32 d-block mb-2"></i>' +
                '<p>No messages yet. Start the conversation!</p></li>';
        } else {
            var html = '';
            messages.forEach(function (m, idx) {
                var isAdmin = m.direction === 'admin';
                var oddClass = isAdmin ? ' odd' : '';
                var avatar = isAdmin ? userAvatar : guardAvatar;
                var senderName = isAdmin ? 'You' : guardName;
                var time = formatTime(m.created_at);

                html += '<li class="chat-group' + oddClass + '" id="msg-' + (m.id || idx) + '">' +
                    '<img src="' + avatar + '" class="avatar-sm rounded-circle" alt="">' +
                    '<div class="chat-body"><div>' +
                    '<h6 class="d-inline-flex">' + escHtml(senderName) + '.</h6>' +
                    '<h6 class="d-inline-flex text-muted">' + time + '</h6>' +
                    '</div><div class="chat-message"><p>' + escHtml(m.content) + '</p></div></div></li>';
            });
            messagesList.innerHTML = html;
        }

        // Scroll to bottom
        var scrollWrapper = document.querySelector('[data-apps-chat="messages-scroll-wrapper"]');
        if (scrollWrapper) {
            var sb = SimpleBar.instances.get(scrollWrapper);
            if (sb) {
                setTimeout(function () { sb.getScrollElement().scrollTop = sb.getScrollElement().scrollHeight; }, 100);
            }
        }
    } catch (err) {
        console.error('Failed to load conversation', err);
        messagesList.innerHTML = '<li class="text-center text-muted py-5"><p>Failed to load messages</p></li>';
    }
}

async function sendMessage() {
    if (!activeGuardId) {
        alert('Please select a guard first.');
        return;
    }

    var input = document.getElementById('chat-input');
    var content = input ? input.value.trim() : '';
    if (!content) return;

    try {
        var token = localStorage.getItem('sg_token');
        await fetch('/api/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
            body: JSON.stringify({ guard_id: activeGuardId, content: content })
        });

        input.value = '';
        await loadConversation(activeGuardId);
    } catch (err) {
        console.error('Failed to send message', err);
    }
}

function formatTime(dateStr) {
    if (!dateStr) return '';
    var d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    var h = d.getHours();
    var m = d.getMinutes();
    var ampm = h >= 12 ? 'pm' : 'am';
    h = h % 12 || 12;
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m + ampm;
}

function escHtml(str) {
    var div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
}
