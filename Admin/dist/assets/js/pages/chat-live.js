/**
 * SyntriGuard — Messages Page (Chat Live Data)
 * Fetches real guard data from API and populates the contacts sidebar.
 */
document.addEventListener('DOMContentLoaded', async function () {
    var DEFAULT_AVATAR = 'https://pub-bb4fc0a4a29548cc9136a6cdb4882573.r2.dev/founder-headshot/raoulstiner.png';

    try {
        var guards = await SyntriGuard.getGuards();
        if (!guards || !Array.isArray(guards)) return;

        // Update admin avatar from localStorage
        var user = SyntriGuard.getUser();
        if (user && user.avatar_url) {
            var adminAvatars = document.querySelectorAll('.chat-user-list .card-body .chat-avatar-online img');
            if (adminAvatars.length > 0) {
                adminAvatars[0].src = user.avatar_url;
            }
        }

        // Separate leads and regular guards
        var leads = [];
        var others = [];
        guards.forEach(function (g) {
            var role = (g.role || '').toLowerCase();
            if (role.includes('lead')) {
                leads.push(g);
            } else {
                others.push(g);
            }
        });

        // Build the contacts sidebar HTML
        var contactList = document.querySelector('.users-list');
        if (!contactList) return;

        var html = '';

        // Team Leads section
        if (leads.length > 0) {
            html += '<div class="d-flex align-items-center px-3 py-2">' +
                '<iconify-icon icon="solar:pin-bold-duotone" class="fs-18 text-muted"></iconify-icon>' +
                '<h5 class="mb-0 ms-1 fw-semibold fs-14">Team Leads</h5>' +
            '</div>';

            leads.forEach(function (g, idx) {
                var avatar = g.avatar_url || DEFAULT_AVATAR;
                var name = g.name || 'Unknown';
                var role = g.role || 'Guard';
                var activeClass = idx === 0 ? ' active' : '';
                var onlineClass = g.status === 'on_duty' ? 'chat-avatar-online' : 'chat-avatar-offline';

                html += '<a href="javascript:void(0);" class="text-body d-block">' +
                    '<div class="chat-users' + activeClass + '">' +
                        '<div class="avatar-md ' + onlineClass + '">' +
                            '<img src="' + avatar + '" class="img-fluid rounded-circle" alt="' + name + '" />' +
                        '</div>' +
                        '<div class="flex-grow-1 overflow-hidden">' +
                            '<h5 class="m-0">' +
                                '<span class="float-end text-muted fs-12"></span>' +
                                name +
                            '</h5>' +
                            '<p class="mt-1 mb-0 text-muted lh-1">' +
                                '<span class="w-75 d-inline-block text-truncate overflow-hidden fs-13">' + role + '</span>' +
                            '</p>' +
                        '</div>' +
                    '</div>' +
                '</a>';
            });
        }

        // All Guards section
        if (others.length > 0) {
            html += '<div class="d-flex align-items-center px-3 py-2">' +
                '<iconify-icon icon="solar:chat-line-bold-duotone" class="fs-18 text-muted"></iconify-icon>' +
                '<h5 class="mb-0 ms-1 fw-semibold fs-14">All Guards</h5>' +
            '</div>';

            others.forEach(function (g) {
                var avatar = g.avatar_url || DEFAULT_AVATAR;
                var name = g.name || 'Unknown';
                var subtitle = g.site_name ? 'On duty \u2014 ' + g.site_name : (g.role || 'Guard');
                var onlineClass = g.status === 'on_duty' ? 'chat-avatar-online' : 'chat-avatar-offline';

                html += '<a href="javascript:void(0);" class="text-body d-block">' +
                    '<div class="chat-users">' +
                        '<div class="avatar-md ' + onlineClass + '">' +
                            '<img src="' + avatar + '" class="img-fluid rounded-circle" alt="' + name + '" />' +
                        '</div>' +
                        '<div class="flex-grow-1 overflow-hidden">' +
                            '<h5 class="m-0">' +
                                '<span class="float-end text-muted fs-12"></span>' +
                                name +
                            '</h5>' +
                            '<p class="mt-1 mb-0 text-muted lh-1">' +
                                '<span class="w-75 d-inline-block text-truncate overflow-hidden fs-13">' + subtitle + '</span>' +
                            '</p>' +
                        '</div>' +
                    '</div>' +
                '</a>';
            });
        }

        contactList.innerHTML = html;

    } catch (err) {
        console.error('Chat: Failed to load contacts', err);
    }
});
