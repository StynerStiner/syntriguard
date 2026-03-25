/**
* SyntriGuard Guard Roster — Live CRUD with Grid.js
* Fetches from /api/guards. Add, edit, delete guards in real time.
*/

var guardsData = [];
var guardsGrid = null;
var guardModal = null;

document.addEventListener("DOMContentLoaded", async function () {
    if (!document.getElementById("table-gridjs")) return;

    guardModal = new bootstrap.Modal(document.getElementById('guardModal'));

    // Avatar preview on file select
    document.getElementById('guard-avatar-file').addEventListener('change', function(e) {
        var file = e.target.files[0];
        if (file) {
            var reader = new FileReader();
            reader.onload = function(ev) {
                document.getElementById('guard-avatar-preview').src = ev.target.result;
            };
            reader.readAsDataURL(file);
        }
    });

    // Load sites for the dropdown
    await loadSites();

    // Load and render guards
    await loadGuards();

    // Form submit handler
    document.getElementById('guard-form').addEventListener('submit', async function(e) {
        e.preventDefault();
        var editId = document.getElementById('guard-edit-id').value;
        var btn = document.getElementById('guard-save-btn');
        btn.disabled = true;
        btn.textContent = 'Saving...';

        var siteVal = document.getElementById('guard-site').value;
        var guardData = {
            guard_id: document.getElementById('guard-guard-id').value.trim(),
            full_name: document.getElementById('guard-name').value.trim(),
            role: document.getElementById('guard-role').value,
            status: document.getElementById('guard-status').value,
            phone: document.getElementById('guard-phone').value.trim() || null,
            email: document.getElementById('guard-email').value.trim() || null,
            assigned_site_id: siteVal ? parseInt(siteVal) : null,
            notes: document.getElementById('guard-notes').value.trim() || null
        };

        try {
            var token = localStorage.getItem('sg_token');
            var url = editId ? '/api/guards/' + editId : '/api/guards';
            var method = editId ? 'PUT' : 'POST';

            var response = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                body: JSON.stringify(guardData)
            });
            var result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Failed to save');

            // Upload avatar if a new file was actually picked
            var avatarInput = document.getElementById('guard-avatar-file');
            if (avatarInput && avatarInput.files && avatarInput.files.length > 0 && avatarInput.files[0].size > 0) {
                try {
                    var guardDbId = editId || result.id;
                    var formData = new FormData();
                    formData.append('avatar', avatarInput.files[0]);
                    formData.append('guard_id', String(guardDbId));
                    var uploadResp = await fetch('/api/uploads/avatar', {
                        method: 'POST',
                        headers: { 'Authorization': 'Bearer ' + token },
                        body: formData
                    });
                    if (!uploadResp.ok) {
                        var uploadErr = await uploadResp.json();
                        console.warn('Avatar upload failed:', uploadErr.error);
                    }
                } catch (uploadErr) {
                    console.warn('Avatar upload error:', uploadErr);
                }
            }

            guardModal.hide();
            await loadGuards();
        } catch (err) {
            console.error('Save guard error:', err);
            alert('Error saving guard: ' + err.message);
        }

        btn.disabled = false;
        btn.textContent = 'Save Guard';
    });
});

async function loadSites() {
    try {
        var token = localStorage.getItem('sg_token');
        if (!token) return;
        var response = await fetch('/api/sites', {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        var sites = await response.json();
        var select = document.getElementById('guard-site');
        if (select && sites && sites.length) {
            sites.forEach(function(s) {
                var opt = document.createElement('option');
                opt.value = s.id;
                opt.textContent = s.name;
                select.appendChild(opt);
            });
        }
    } catch (err) {
        console.error('Failed to load sites:', err);
    }
}

async function loadGuards() {
    var data = [];

    try {
        var token = localStorage.getItem('sg_token');
        if (token) {
            var response = await fetch('/api/guards', {
                headers: { 'Authorization': 'Bearer ' + token }
            });
            var guards = await response.json();
            if (guards && guards.length > 0) {
                guardsData = guards;
                var defaultAvatar = 'https://pub-bb4fc0a4a29548cc9136a6cdb4882573.r2.dev/founder-headshot/raoulstiner.png';
                data = guards.map(function(g) {
                    var status = (g.status || 'active').replace(/_/g, ' ');
                    status = status.charAt(0).toUpperCase() + status.slice(1);
                    return [
                        g.guard_id,
                        (g.avatar_url || defaultAvatar) + '|||' + g.full_name,
                        g.role,
                        g.site_name || 'Unassigned',
                        status,
                        g.performance_score ? g.performance_score + '%' : '—',
                        g.phone || '—',
                        g.id
                    ];
                });
            }
        }
    } catch (err) {
        console.error('Failed to load guards:', err);
    }

    // If no data from API, use static fallback
    if (data.length === 0) {
        var defaultAvatar = 'https://pub-bb4fc0a4a29548cc9136a6cdb4882573.r2.dev/founder-headshot/raoulstiner.png';
        data = [
            ["G-001", defaultAvatar + "|||Marcus Redan", "Lead Guard", "Presidential Palace", "On Duty", "96%", "+597 861-4401", 1],
            ["G-002", defaultAvatar + "|||Priya Nankoe", "Site Guard", "Port of Paramaribo", "On Duty", "94%", "+597 861-4402", 2]
        ];
    }

    var container = document.getElementById("table-gridjs");

    // Clear previous grid
    if (guardsGrid) {
        guardsGrid.destroy();
        container.innerHTML = '';
    }

    guardsGrid = new gridjs.Grid({
        columns: [
            "Guard ID",
            {
                name: "Guard",
                formatter: function(cell) {
                    // cell is "avatarUrl|||name" combined string
                    var parts = String(cell).split('|||');
                    var avatar = parts[0] || '';
                    var name = parts[1] || '';
                    return gridjs.html(
                        '<div class="d-flex align-items-center gap-2">' +
                        '<img src="' + avatar + '" class="rounded-circle" width="32" height="32" alt="">' +
                        '<span class="fw-semibold">' + name + '</span></div>'
                    );
                }
            },
            "Role",
            "Site",
            "Status",
            "Performance",
            "Phone",
            {
                name: "Actions",
                formatter: function(cell) {
                    return gridjs.html(
                        '<div class="dropdown">' +
                        '<button class="btn btn-sm btn-light dropdown-toggle drop-arrow-none" data-bs-toggle="dropdown">' +
                        '<i class="ti ti-dots fs-18"></i></button>' +
                        '<div class="dropdown-menu dropdown-menu-end">' +
                        '<a href="javascript:void(0);" class="dropdown-item" onclick="openEditGuard(' + cell + ')">' +
                        '<i class="ti ti-edit fs-14 me-2"></i>Edit Guard</a>' +
                        '<a href="javascript:void(0);" class="dropdown-item" onclick="openEditGuard(' + cell + ')">' +
                        '<i class="ti ti-phone fs-14 me-2"></i>Contact</a>' +
                        '<a href="javascript:void(0);" class="dropdown-item" onclick="viewGuardShifts(' + cell + ')">' +
                        '<i class="ti ti-calendar fs-14 me-2"></i>View Shifts</a>' +
                        '<div class="dropdown-divider"></div>' +
                        '<a href="javascript:void(0);" class="dropdown-item text-danger" onclick="deleteGuard(' + cell + ')">' +
                        '<i class="ti ti-trash fs-14 me-2"></i>Delete</a>' +
                        '</div></div>'
                    );
                }
            }
        ],
        data: data,
        pagination: { limit: 10 },
        search: true,
        sort: true,
        language: { search: { placeholder: "Search guards..." } }
    }).render(container);
}

function openAddGuard() {
    document.getElementById('guardModalLabel').textContent = 'Add Guard';
    document.getElementById('guard-form').reset();
    document.getElementById('guard-edit-id').value = '';
    document.getElementById('guard-avatar-preview').src = 'https://pub-bb4fc0a4a29548cc9136a6cdb4882573.r2.dev/founder-headshot/raoulstiner.png';
    document.getElementById('guard-avatar-file').value = '';

    // Auto-generate next guard ID
    var maxNum = 0;
    guardsData.forEach(function(g) {
        var num = parseInt((g.guard_id || '').replace('G-', ''));
        if (num > maxNum) maxNum = num;
    });
    document.getElementById('guard-guard-id').value = 'G-' + String(maxNum + 1).padStart(3, '0');
}

function openEditGuard(dbId) {
    var guard = guardsData.find(function(g) { return g.id === dbId; });
    if (!guard) return;

    var defaultAvatar = 'https://pub-bb4fc0a4a29548cc9136a6cdb4882573.r2.dev/founder-headshot/raoulstiner.png';

    document.getElementById('guardModalLabel').textContent = 'Edit Guard';
    document.getElementById('guard-edit-id').value = dbId;
    document.getElementById('guard-guard-id').value = guard.guard_id || '';
    document.getElementById('guard-name').value = guard.full_name || '';
    document.getElementById('guard-role').value = guard.role || 'Site Guard';
    document.getElementById('guard-status').value = guard.status || 'active';
    document.getElementById('guard-phone').value = guard.phone || '';
    document.getElementById('guard-email').value = guard.email || '';
    document.getElementById('guard-site').value = guard.assigned_site_id || '';
    document.getElementById('guard-notes').value = guard.notes || '';
    document.getElementById('guard-avatar-preview').src = guard.avatar_url || defaultAvatar;
    document.getElementById('guard-avatar-file').value = '';

    guardModal.show();
}

async function deleteGuard(dbId) {
    var guard = guardsData.find(function(g) { return g.id === dbId; });
    if (!guard) return;
    if (!confirm('Delete ' + guard.full_name + '? This cannot be undone.')) return;

    try {
        var token = localStorage.getItem('sg_token');
        var response = await fetch('/api/guards/' + dbId, {
            method: 'DELETE',
            headers: { 'Authorization': 'Bearer ' + token }
        });
        if (!response.ok) throw new Error('Failed to delete');
        await loadGuards();
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

function viewGuardShifts(dbId) {
    var guard = guardsData.find(function(g) { return g.id === dbId; });
    if (guard) {
        window.sgQuickAction('Show me all shifts for ' + guard.full_name + ' (' + guard.guard_id + ') this week and next week.');
    }
}

function exportGuardsPDF() {
    if (typeof SyntriGuard !== 'undefined') {
        SyntriGuard.downloadPDF('roster');
    }
}

async function exportGuardsSheet() {
    try {
        if (typeof SyntriGuard !== 'undefined') {
            var result = await SyntriGuard.exportRosterSheet();
            if (result && result.url) {
                window.open(result.url, '_blank');
            }
        }
    } catch (err) {
        alert('Export failed: ' + err.message);
    }
}
