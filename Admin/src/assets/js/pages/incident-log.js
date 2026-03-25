/**
 * SyntriGuard — Incident Log Page
 * Live data from API. View, edit, delete incidents.
 */
var allIncidents = [];
var allGuards = [];
var allSites = [];
var incidentModal = null;
var editIncidentModal = null;
var currentViewIncidentId = null;

document.addEventListener('DOMContentLoaded', async function () {
    incidentModal = new bootstrap.Modal(document.getElementById('incidentModal'));
    editIncidentModal = new bootstrap.Modal(document.getElementById('editIncidentModal'));

    await loadIncidents();

    // Load guards & sites for edit dropdowns
    try {
        var token = localStorage.getItem('sg_token');
        if (token) {
            var results = await Promise.allSettled([
                fetch('/api/guards', { headers: { 'Authorization': 'Bearer ' + token } }).then(function(r) { return r.json(); }),
                fetch('/api/sites', { headers: { 'Authorization': 'Bearer ' + token } }).then(function(r) { return r.json(); })
            ]);
            allGuards = results[0].status === 'fulfilled' && Array.isArray(results[0].value) ? results[0].value : [];
            allSites = results[1].status === 'fulfilled' && Array.isArray(results[1].value) ? results[1].value : [];
        }
    } catch (e) { console.error('Failed to load guards/sites', e); }

    // PDF download button in modal
    document.getElementById('incidentModalPDF').addEventListener('click', function() {
        var id = this.getAttribute('data-id');
        if (id && typeof SyntriGuard !== 'undefined') {
            SyntriGuard.downloadPDF('incident/' + id);
        }
    });

    // Edit button in view modal — closes view, opens edit form
    document.getElementById('incidentModalEdit').addEventListener('click', function() {
        if (currentViewIncidentId) {
            incidentModal.hide();
            openEditIncident(currentViewIncidentId);
        }
    });

    // Save incident changes
    document.getElementById('btn-save-incident').addEventListener('click', async function() {
        await saveIncident();
    });
});

async function loadIncidents() {
    var DEFAULT_AVATAR = 'https://pub-bb4fc0a4a29548cc9136a6cdb4882573.r2.dev/founder-headshot/raoulstiner.png';

    try {
        var token = localStorage.getItem('sg_token');
        if (!token) return;
        var resp = await fetch('/api/incidents', { headers: { 'Authorization': 'Bearer ' + token } });
        if (!resp.ok) return;
        allIncidents = await resp.json();
        if (!Array.isArray(allIncidents)) return;

        allIncidents.sort(function (a, b) {
            return new Date(b.filed_at || b.created_at) - new Date(a.filed_at || a.created_at);
        });

        var tbody = document.querySelector('.table-hover tbody');
        if (!tbody) return;

        var statusMap = {
            'open': { badge: 'bg-warning-subtle text-warning', label: 'Open' },
            'investigating': { badge: 'bg-primary-subtle text-primary', label: 'Investigating' },
            'resolved': { badge: 'bg-success-subtle text-success', label: 'Resolved' },
            'closed': { badge: 'bg-secondary-subtle text-secondary', label: 'Closed' }
        };

        var rows = '';
        allIncidents.forEach(function (inc) {
            var incId = inc.incident_id || ('INC-' + String(inc.id).padStart(3, '0'));
            var type = inc.type || '—';
            var dateFiled = inc.filed_at ? formatDate(inc.filed_at) : (inc.created_at ? formatDate(inc.created_at) : '—');
            var guardName = inc.guard_name || '—';
            var damages = inc.damages_srd ? 'SRD ' + Number(inc.damages_srd).toLocaleString() : '—';
            var recoveryDate = inc.recovery_date ? formatDate(inc.recovery_date) : '—';
            var statusKey = (inc.status || 'open').toLowerCase();
            var statusInfo = statusMap[statusKey] || statusMap['open'];

            rows += '<tr>' +
                '<td class="ps-3"><input type="checkbox" class="form-check-input"></td>' +
                '<td><span class="fw-semibold">' + incId + '</span></td>' +
                '<td>' + type + '</td>' +
                '<td><span class="text-muted">' + dateFiled + '</span></td>' +
                '<td>' +
                    '<div class="d-flex align-items-center gap-2">' +
                    '<div class="avatar-sm"><img src="' + DEFAULT_AVATAR + '" class="img-fluid rounded-circle" width="32" height="32"></div>' +
                    '<span class="fs-14">' + guardName + '</span></div>' +
                '</td>' +
                '<td>' + damages + '</td>' +
                '<td><span class="text-muted">' + recoveryDate + '</span></td>' +
                '<td><span class="badge ' + statusInfo.badge + ' fs-13 p-1">' + statusInfo.label + '</span></td>' +
                '<td class="pe-3">' +
                    '<div class="dropdown">' +
                    '<button class="btn btn-light dropdown-toggle drop-arrow-none" data-bs-toggle="dropdown">' +
                    '<i class="ti ti-dots-vertical fs-18"></i></button>' +
                    '<div class="dropdown-menu dropdown-menu-end">' +
                    '<a href="javascript:void(0);" class="dropdown-item" onclick="viewIncident(' + inc.id + ')">' +
                    '<i class="ti ti-eye fs-14 me-2"></i>View Details</a>' +
                    '<a href="javascript:void(0);" class="dropdown-item" onclick="openEditIncident(' + inc.id + ')">' +
                    '<i class="ti ti-edit fs-14 me-2"></i>Edit Incident</a>' +
                    '<div class="dropdown-divider"></div>' +
                    '<a href="javascript:void(0);" class="dropdown-item" onclick="changeIncidentStatus(' + inc.id + ', \'investigating\')">' +
                    '<i class="ti ti-search fs-14 me-2"></i>Mark Investigating</a>' +
                    '<a href="javascript:void(0);" class="dropdown-item" onclick="changeIncidentStatus(' + inc.id + ', \'resolved\')">' +
                    '<i class="ti ti-check fs-14 me-2"></i>Mark Resolved</a>' +
                    '<a href="javascript:void(0);" class="dropdown-item" onclick="changeIncidentStatus(' + inc.id + ', \'closed\')">' +
                    '<i class="ti ti-archive fs-14 me-2"></i>Mark Closed</a>' +
                    '<div class="dropdown-divider"></div>' +
                    '<a href="javascript:void(0);" class="dropdown-item text-danger" onclick="deleteIncident(' + inc.id + ')">' +
                    '<i class="ti ti-trash fs-14 me-2"></i>Delete</a>' +
                    '</div></div>' +
                '</td>' +
            '</tr>';
        });

        tbody.innerHTML = rows;

        var footerText = document.querySelector('.card-footer .text-muted');
        if (footerText) {
            footerText.innerHTML = 'Showing <span class="fw-semibold">' + allIncidents.length + '</span> of <span class="fw-semibold">' + allIncidents.length + '</span> Results';
        }

    } catch (err) {
        console.error('Incident Log: Failed to load', err);
    }
}

function viewIncident(id) {
    var inc = allIncidents.find(function(i) { return i.id === id; });
    if (!inc) return;

    currentViewIncidentId = id;

    var statusColors = { 'open': 'warning', 'investigating': 'primary', 'resolved': 'success', 'closed': 'secondary' };
    var sevColors = { 'critical': 'danger', 'high': 'warning', 'medium': 'info', 'low': 'secondary' };
    var statusColor = statusColors[inc.status] || 'secondary';
    var sevColor = sevColors[inc.severity] || 'info';

    document.getElementById('incidentModalTitle').textContent = inc.incident_id + ' — ' + inc.type;
    document.getElementById('incidentModalPDF').setAttribute('data-id', id);

    var html = '<div class="row">' +
        '<div class="col-md-6 mb-3">' +
        '<p class="text-muted mb-1 fs-13">Incident ID</p><p class="fs-14 fw-semibold mb-0">' + (inc.incident_id || '') + '</p></div>' +
        '<div class="col-md-6 mb-3">' +
        '<p class="text-muted mb-1 fs-13">Type</p><p class="fs-14 fw-semibold mb-0">' + (inc.type || '') + '</p></div>' +
        '<div class="col-md-6 mb-3">' +
        '<p class="text-muted mb-1 fs-13">Severity</p><span class="badge bg-' + sevColor + '">' + (inc.severity || '').toUpperCase() + '</span></div>' +
        '<div class="col-md-6 mb-3">' +
        '<p class="text-muted mb-1 fs-13">Status</p><span class="badge bg-' + statusColor + '">' + (inc.status || '').toUpperCase() + '</span></div>' +
        '<div class="col-md-6 mb-3">' +
        '<p class="text-muted mb-1 fs-13">Site</p><p class="fs-14 mb-0">' + (inc.site_name || '—') + '</p></div>' +
        '<div class="col-md-6 mb-3">' +
        '<p class="text-muted mb-1 fs-13">Filed By</p><p class="fs-14 mb-0">' + (inc.guard_name || '—') + '</p></div>' +
        '<div class="col-md-6 mb-3">' +
        '<p class="text-muted mb-1 fs-13">Date Filed</p><p class="fs-14 mb-0">' + (inc.filed_at ? new Date(inc.filed_at).toLocaleString() : '—') + '</p></div>' +
        '<div class="col-md-6 mb-3">' +
        '<p class="text-muted mb-1 fs-13">Damages</p><p class="fs-14 mb-0">' + (inc.damages_srd ? 'SRD ' + Number(inc.damages_srd).toLocaleString() : 'None') + '</p></div>' +
        '<div class="col-md-6 mb-3">' +
        '<p class="text-muted mb-1 fs-13">Police Notified</p><p class="fs-14 mb-0">' + (inc.police_notified || 'No') + '</p></div>' +
        '<div class="col-md-6 mb-3">' +
        '<p class="text-muted mb-1 fs-13">Follow-up Required</p><p class="fs-14 mb-0">' + (inc.followup_required ? 'Yes' : 'No') + '</p></div>' +
        '</div>';

    if (inc.description) {
        html += '<hr><p class="text-muted mb-1 fs-13">Description</p><p class="fs-14">' + escHtml(inc.description) + '</p>';
    }
    if (inc.specific_location) {
        html += '<p class="text-muted mb-1 fs-13">Specific Location</p><p class="fs-14">' + escHtml(inc.specific_location) + '</p>';
    }
    if (inc.additional_notes) {
        html += '<p class="text-muted mb-1 fs-13">Additional Notes</p><p class="fs-14">' + escHtml(inc.additional_notes) + '</p>';
    }

    document.getElementById('incidentModalBody').innerHTML = html;
    incidentModal.show();
}

// ─── Edit Incident ───
function openEditIncident(id) {
    var inc = allIncidents.find(function(i) { return i.id === id; });
    if (!inc) return;

    document.getElementById('editIncidentId').value = inc.id;
    document.getElementById('editIncidentModalTitle').textContent = 'Edit ' + (inc.incident_id || 'Incident');
    document.getElementById('editIncType').value = inc.type || '';
    document.getElementById('editIncSeverity').value = (inc.severity || 'medium').toLowerCase();
    document.getElementById('editIncStatus').value = (inc.status || 'open').toLowerCase();
    document.getElementById('editIncDamages').value = inc.damages_srd || '';
    document.getElementById('editIncDescription').value = inc.description || '';
    document.getElementById('editIncLocation').value = inc.specific_location || '';
    document.getElementById('editIncPolice').value = inc.police_notified || 'No';
    document.getElementById('editIncFollowup').value = inc.followup_required ? 'yes' : 'no';
    document.getElementById('editIncNotes').value = inc.additional_notes || '';

    // Populate guard dropdown
    var guardSelect = document.getElementById('editIncGuard');
    guardSelect.innerHTML = '<option value="">Select Guard</option>';
    allGuards.forEach(function(g) {
        var opt = document.createElement('option');
        opt.value = g.id;
        opt.textContent = g.full_name + ' (' + g.guard_id + ')';
        guardSelect.appendChild(opt);
    });
    guardSelect.value = inc.guard_id || '';

    // Populate site dropdown
    var siteSelect = document.getElementById('editIncSite');
    siteSelect.innerHTML = '<option value="">Select Site</option>';
    allSites.forEach(function(s) {
        var opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = s.name;
        siteSelect.appendChild(opt);
    });
    siteSelect.value = inc.site_id || '';

    editIncidentModal.show();
}

async function saveIncident() {
    var id = document.getElementById('editIncidentId').value;
    if (!id) return;

    var payload = {
        type: document.getElementById('editIncType').value,
        severity: document.getElementById('editIncSeverity').value,
        status: document.getElementById('editIncStatus').value,
        guard_id: parseInt(document.getElementById('editIncGuard').value) || null,
        site_id: parseInt(document.getElementById('editIncSite').value) || null,
        damages_srd: parseFloat(document.getElementById('editIncDamages').value) || null,
        description: document.getElementById('editIncDescription').value.trim(),
        specific_location: document.getElementById('editIncLocation').value.trim(),
        police_notified: document.getElementById('editIncPolice').value,
        followup_required: document.getElementById('editIncFollowup').value === 'yes',
        additional_notes: document.getElementById('editIncNotes').value.trim()
    };

    if (!payload.type) { alert('Please select an incident type.'); return; }

    var btn = document.getElementById('btn-save-incident');
    try {
        btn.disabled = true;
        btn.textContent = 'Saving...';

        var token = localStorage.getItem('sg_token');
        var resp = await fetch('/api/incidents/' + id, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
            body: JSON.stringify(payload)
        });
        if (!resp.ok) throw new Error('Failed to update');

        editIncidentModal.hide();
        await loadIncidents();
    } catch (err) {
        alert('Failed to save: ' + (err.message || 'Unknown error'));
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="ti ti-device-floppy me-1"></i>Save Changes';
    }
}

async function changeIncidentStatus(id, newStatus) {
    try {
        var token = localStorage.getItem('sg_token');
        var resp = await fetch('/api/incidents/' + id + '/status', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
            body: JSON.stringify({ status: newStatus })
        });
        if (!resp.ok) throw new Error('Failed');
        await loadIncidents();
    } catch (err) {
        alert('Failed to update status: ' + err.message);
    }
}

async function deleteIncident(id) {
    var inc = allIncidents.find(function(i) { return i.id === id; });
    if (!confirm('Delete ' + (inc ? inc.incident_id : 'this incident') + '? This cannot be undone.')) return;

    try {
        var token = localStorage.getItem('sg_token');
        await fetch('/api/incidents/' + id, {
            method: 'DELETE',
            headers: { 'Authorization': 'Bearer ' + token }
        });
        await loadIncidents();
    } catch (err) {
        alert('Failed to delete: ' + err.message);
    }
}

function formatDate(dateStr) {
    var d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
}

function escHtml(str) {
    var div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
}
