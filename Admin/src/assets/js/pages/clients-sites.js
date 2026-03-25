/**
 * SyntriGuard — Clients & Sites Page
 * Live data from API. View, edit, add, delete clients & sites.
 */
var allClients = [];
var allSites = [];
var viewModal = null;
var clientModal = null;
var siteModal = null;

document.addEventListener('DOMContentLoaded', async function () {
    viewModal = new bootstrap.Modal(document.getElementById('viewModal'));
    clientModal = new bootstrap.Modal(document.getElementById('clientModal'));
    siteModal = new bootstrap.Modal(document.getElementById('siteModal'));

    await loadData();

    // Add Client button
    document.getElementById('btn-add-client').addEventListener('click', function () {
        openClientModal(null);
    });

    // Add Site button
    document.getElementById('btn-add-site').addEventListener('click', function () {
        openSiteModal(null);
    });

    // Save Client button
    document.getElementById('btn-save-client').addEventListener('click', async function () {
        await saveClient();
    });

    // Save Site button
    document.getElementById('btn-save-site').addEventListener('click', async function () {
        await saveSite();
    });

    // Edit from View modal — closes view, opens edit
    document.getElementById('btn-edit-from-view').addEventListener('click', function () {
        viewModal.hide();
        if (currentViewType === 'site') {
            editSite(currentViewId);
        } else if (currentViewType === 'client') {
            editClient(currentViewId);
        }
    });

    // Search
    var searchInput = document.querySelector('input[placeholder*="Search clients"]');
    if (searchInput) {
        searchInput.addEventListener('input', function () {
            renderTable(this.value.trim().toLowerCase());
        });
    }
});

async function loadData() {
    try {
        var results = await Promise.allSettled([
            SyntriGuard.getClients(),
            SyntriGuard.getSites()
        ]);

        allClients = results[0].status === 'fulfilled' ? results[0].value : [];
        allSites = results[1].status === 'fulfilled' ? results[1].value : [];

        if (!Array.isArray(allClients)) allClients = [];
        if (!Array.isArray(allSites)) allSites = [];

        renderTable('');
    } catch (err) {
        console.error('Clients & Sites: Failed to load data', err);
    }
}

function renderTable(filter) {
    var tbody = document.querySelector('.table-hover tbody');
    if (!tbody) return;

    var statusMap = {
        'active': { badge: 'bg-success-subtle text-success', label: 'Active' },
        'pending': { badge: 'bg-warning-subtle text-warning', label: 'Pending' },
        'proposal': { badge: 'bg-info-subtle text-info', label: 'Proposal' },
        'inactive': { badge: 'bg-secondary-subtle text-secondary', label: 'Inactive' }
    };

    // Build client lookup
    var clientMap = {};
    allClients.forEach(function (c) { clientMap[c.id] = c; });

    var rows = '';
    var totalRows = 0;

    // Render one row per site (with client info)
    allSites.forEach(function (s) {
        var client = clientMap[s.client_id] || {};
        var clientName = s.client_name || client.name || '—';
        var siteName = s.name || '—';
        var address = s.address || '—';
        var district = s.district || '—';
        var guardCount = s.guard_count != null ? s.guard_count : 0;
        var contractValue = client.contract_value_srd ? 'SRD ' + Number(client.contract_value_srd).toLocaleString() + '/mo' : '—';
        var statusKey = (s.status || 'active').toLowerCase();
        var statusInfo = statusMap[statusKey] || statusMap['active'];

        // Apply search filter
        if (filter) {
            var searchStr = (clientName + ' ' + siteName + ' ' + address + ' ' + district).toLowerCase();
            if (searchStr.indexOf(filter) === -1) return;
        }

        rows += '<tr>' +
            '<td class="ps-3"><input type="checkbox" class="form-check-input"></td>' +
            '<td><span class="fw-semibold">' + escHtml(clientName) + '</span></td>' +
            '<td>' + escHtml(siteName) + '</td>' +
            '<td><span class="text-muted">' + escHtml(address) + '</span></td>' +
            '<td>' + escHtml(district) + '</td>' +
            '<td>' + guardCount + '</td>' +
            '<td>' + contractValue + '</td>' +
            '<td><span class="badge ' + statusInfo.badge + ' fs-12 p-1">' + statusInfo.label + '</span></td>' +
            '<td class="pe-3">' +
                '<div class="dropdown">' +
                '<button class="btn btn-sm btn-light dropdown-toggle drop-arrow-none" data-bs-toggle="dropdown">' +
                '<i class="ti ti-dots-vertical fs-18"></i></button>' +
                '<div class="dropdown-menu dropdown-menu-end">' +
                '<a href="javascript:void(0);" class="dropdown-item" onclick="viewSiteDetails(' + s.id + ')">' +
                '<i class="ti ti-eye fs-14 me-2"></i>View Details</a>' +
                '<a href="javascript:void(0);" class="dropdown-item" onclick="editSite(' + s.id + ')">' +
                '<i class="ti ti-edit fs-14 me-2"></i>Edit Site</a>' +
                '<a href="javascript:void(0);" class="dropdown-item" onclick="editClientOf(' + s.id + ')">' +
                '<i class="ti ti-building fs-14 me-2"></i>Edit Client</a>' +
                '<div class="dropdown-divider"></div>' +
                '<a href="javascript:void(0);" class="dropdown-item text-danger" onclick="deleteSiteRow(' + s.id + ')">' +
                '<i class="ti ti-trash fs-14 me-2"></i>Delete Site</a>' +
                '</div></div>' +
            '</td>' +
        '</tr>';
        totalRows++;
    });

    // Also show clients with NO sites
    allClients.forEach(function (c) {
        var hasSite = allSites.some(function (s) { return s.client_id === c.id; });
        if (hasSite) return;

        var clientName = c.name || '—';
        var contractValue = c.contract_value_srd ? 'SRD ' + Number(c.contract_value_srd).toLocaleString() + '/mo' : '—';
        var statusKey = (c.status || 'active').toLowerCase();
        var statusInfo = statusMap[statusKey] || statusMap['active'];

        if (filter) {
            var searchStr = (clientName + ' ' + (c.district || '')).toLowerCase();
            if (searchStr.indexOf(filter) === -1) return;
        }

        rows += '<tr>' +
            '<td class="ps-3"><input type="checkbox" class="form-check-input"></td>' +
            '<td><span class="fw-semibold">' + escHtml(clientName) + '</span></td>' +
            '<td class="text-muted fst-italic">No sites assigned</td>' +
            '<td><span class="text-muted">' + escHtml(c.address || '—') + '</span></td>' +
            '<td>' + escHtml(c.district || '—') + '</td>' +
            '<td>0</td>' +
            '<td>' + contractValue + '</td>' +
            '<td><span class="badge ' + statusInfo.badge + ' fs-12 p-1">' + statusInfo.label + '</span></td>' +
            '<td class="pe-3">' +
                '<div class="dropdown">' +
                '<button class="btn btn-sm btn-light dropdown-toggle drop-arrow-none" data-bs-toggle="dropdown">' +
                '<i class="ti ti-dots-vertical fs-18"></i></button>' +
                '<div class="dropdown-menu dropdown-menu-end">' +
                '<a href="javascript:void(0);" class="dropdown-item" onclick="viewClientDetails(' + c.id + ')">' +
                '<i class="ti ti-eye fs-14 me-2"></i>View Details</a>' +
                '<a href="javascript:void(0);" class="dropdown-item" onclick="editClient(' + c.id + ')">' +
                '<i class="ti ti-edit fs-14 me-2"></i>Edit Client</a>' +
                '<a href="javascript:void(0);" class="dropdown-item" onclick="addSiteForClient(' + c.id + ')">' +
                '<i class="ti ti-map-pin fs-14 me-2"></i>Add Site</a>' +
                '<div class="dropdown-divider"></div>' +
                '<a href="javascript:void(0);" class="dropdown-item text-danger" onclick="deleteClientRow(' + c.id + ')">' +
                '<i class="ti ti-trash fs-14 me-2"></i>Delete Client</a>' +
                '</div></div>' +
            '</td>' +
        '</tr>';
        totalRows++;
    });

    tbody.innerHTML = rows;

    var footerText = document.querySelector('.card-footer .text-muted');
    if (footerText) {
        footerText.innerHTML = 'Showing <span class="fw-semibold">' + totalRows + '</span> of <span class="fw-semibold">' + (allSites.length + allClients.filter(function(c) { return !allSites.some(function(s) { return s.client_id === c.id; }); }).length) + '</span> Results';
    }
}

// ─── View Details ───
var currentViewType = null;
var currentViewId = null;

function viewSiteDetails(siteId) {
    var s = allSites.find(function (x) { return x.id === siteId; });
    if (!s) return;
    var client = allClients.find(function (c) { return c.id === s.client_id; }) || {};

    currentViewType = 'site';
    currentViewId = siteId;

    document.getElementById('viewModalTitle').textContent = s.name + ' — Site Details';
    document.getElementById('viewModalBody').innerHTML =
        '<div class="row">' +
        '<div class="col-md-6 mb-3"><p class="text-muted mb-1 fs-13">Client</p><p class="fs-14 fw-semibold mb-0">' + escHtml(s.client_name || client.name || '—') + '</p></div>' +
        '<div class="col-md-6 mb-3"><p class="text-muted mb-1 fs-13">Site Name</p><p class="fs-14 fw-semibold mb-0">' + escHtml(s.name || '—') + '</p></div>' +
        '<div class="col-md-6 mb-3"><p class="text-muted mb-1 fs-13">Address</p><p class="fs-14 mb-0">' + escHtml(s.address || '—') + '</p></div>' +
        '<div class="col-md-6 mb-3"><p class="text-muted mb-1 fs-13">District</p><p class="fs-14 mb-0">' + escHtml(s.district || '—') + '</p></div>' +
        '<div class="col-md-6 mb-3"><p class="text-muted mb-1 fs-13">Guards Assigned</p><p class="fs-14 mb-0">' + (s.guard_count || 0) + '</p></div>' +
        '<div class="col-md-6 mb-3"><p class="text-muted mb-1 fs-13">Status</p><p class="fs-14 mb-0">' + escHtml((s.status || 'active').toUpperCase()) + '</p></div>' +
        (s.latitude ? '<div class="col-md-6 mb-3"><p class="text-muted mb-1 fs-13">Coordinates</p><p class="fs-14 mb-0">' + s.latitude + ', ' + s.longitude + '</p></div>' : '') +
        (s.notes ? '<div class="col-12 mb-3"><p class="text-muted mb-1 fs-13">Notes</p><p class="fs-14 mb-0">' + escHtml(s.notes) + '</p></div>' : '') +
        '</div>' +
        '<hr>' +
        '<p class="fw-semibold fs-14 mb-3">Client Information</p>' +
        '<div class="row">' +
        '<div class="col-md-6 mb-3"><p class="text-muted mb-1 fs-13">Contact Name</p><p class="fs-14 mb-0">' + escHtml(client.contact_name || '—') + '</p></div>' +
        '<div class="col-md-6 mb-3"><p class="text-muted mb-1 fs-13">Contact Email</p><p class="fs-14 mb-0">' + escHtml(client.contact_email || '—') + '</p></div>' +
        '<div class="col-md-6 mb-3"><p class="text-muted mb-1 fs-13">Contact Phone</p><p class="fs-14 mb-0">' + escHtml(client.contact_phone || '—') + '</p></div>' +
        '<div class="col-md-6 mb-3"><p class="text-muted mb-1 fs-13">Contract Value</p><p class="fs-14 mb-0">' + (client.contract_value_srd ? 'SRD ' + Number(client.contract_value_srd).toLocaleString() + '/mo' : '—') + '</p></div>' +
        '</div>';
    viewModal.show();
}

function viewClientDetails(clientId) {
    var c = allClients.find(function (x) { return x.id === clientId; });
    if (!c) return;

    currentViewType = 'client';
    currentViewId = clientId;

    var clientSites = allSites.filter(function (s) { return s.client_id === clientId; });
    var sitesHtml = clientSites.length > 0 ?
        clientSites.map(function (s) { return '<li class="fs-14 mb-1">' + escHtml(s.name) + ' — ' + escHtml(s.district || '') + ' (' + (s.guard_count || 0) + ' guards)</li>'; }).join('') :
        '<li class="text-muted fs-14">No sites assigned</li>';

    document.getElementById('viewModalTitle').textContent = c.name + ' — Client Details';
    document.getElementById('viewModalBody').innerHTML =
        '<div class="row">' +
        '<div class="col-md-6 mb-3"><p class="text-muted mb-1 fs-13">Client Name</p><p class="fs-14 fw-semibold mb-0">' + escHtml(c.name || '—') + '</p></div>' +
        '<div class="col-md-6 mb-3"><p class="text-muted mb-1 fs-13">Status</p><p class="fs-14 mb-0">' + escHtml((c.status || 'active').toUpperCase()) + '</p></div>' +
        '<div class="col-md-6 mb-3"><p class="text-muted mb-1 fs-13">Contact Name</p><p class="fs-14 mb-0">' + escHtml(c.contact_name || '—') + '</p></div>' +
        '<div class="col-md-6 mb-3"><p class="text-muted mb-1 fs-13">Contact Email</p><p class="fs-14 mb-0">' + escHtml(c.contact_email || '—') + '</p></div>' +
        '<div class="col-md-6 mb-3"><p class="text-muted mb-1 fs-13">Contact Phone</p><p class="fs-14 mb-0">' + escHtml(c.contact_phone || '—') + '</p></div>' +
        '<div class="col-md-6 mb-3"><p class="text-muted mb-1 fs-13">Address</p><p class="fs-14 mb-0">' + escHtml(c.address || '—') + '</p></div>' +
        '<div class="col-md-6 mb-3"><p class="text-muted mb-1 fs-13">District</p><p class="fs-14 mb-0">' + escHtml(c.district || '—') + '</p></div>' +
        '<div class="col-md-6 mb-3"><p class="text-muted mb-1 fs-13">Contract Value</p><p class="fs-14 mb-0">' + (c.contract_value_srd ? 'SRD ' + Number(c.contract_value_srd).toLocaleString() + '/mo' : '—') + '</p></div>' +
        '<div class="col-md-6 mb-3"><p class="text-muted mb-1 fs-13">Total Sites</p><p class="fs-14 mb-0">' + (c.site_count || 0) + '</p></div>' +
        '<div class="col-md-6 mb-3"><p class="text-muted mb-1 fs-13">Total Guards</p><p class="fs-14 mb-0">' + (c.total_guards || 0) + '</p></div>' +
        (c.notes ? '<div class="col-12 mb-3"><p class="text-muted mb-1 fs-13">Notes</p><p class="fs-14 mb-0">' + escHtml(c.notes) + '</p></div>' : '') +
        '</div>' +
        '<hr><p class="fw-semibold fs-14 mb-2">Sites</p><ul class="ps-3">' + sitesHtml + '</ul>';
    viewModal.show();
}

// ─── Add/Edit Client ───
function openClientModal(clientId) {
    document.getElementById('clientEditId').value = '';
    document.getElementById('clientName').value = '';
    document.getElementById('clientContactName').value = '';
    document.getElementById('clientContactPhone').value = '';
    document.getElementById('clientContactEmail').value = '';
    document.getElementById('clientAddress').value = '';
    document.getElementById('clientDistrict').value = '';
    document.getElementById('clientContractValue').value = '';
    document.getElementById('clientStatus').value = 'active';
    document.getElementById('clientNotes').value = '';

    if (clientId) {
        var c = allClients.find(function (x) { return x.id === clientId; });
        if (!c) return;
        document.getElementById('clientModalTitle').textContent = 'Edit Client';
        document.getElementById('clientEditId').value = c.id;
        document.getElementById('clientName').value = c.name || '';
        document.getElementById('clientContactName').value = c.contact_name || '';
        document.getElementById('clientContactPhone').value = c.contact_phone || '';
        document.getElementById('clientContactEmail').value = c.contact_email || '';
        document.getElementById('clientAddress').value = c.address || '';
        document.getElementById('clientDistrict').value = c.district || '';
        document.getElementById('clientContractValue').value = c.contract_value_srd || '';
        document.getElementById('clientStatus').value = c.status || 'active';
        document.getElementById('clientNotes').value = c.notes || '';
    } else {
        document.getElementById('clientModalTitle').textContent = 'Add Client';
    }
    clientModal.show();
}

function editClient(clientId) { openClientModal(clientId); }

function editClientOf(siteId) {
    var s = allSites.find(function (x) { return x.id === siteId; });
    if (s && s.client_id) openClientModal(s.client_id);
}

async function saveClient() {
    var name = document.getElementById('clientName').value.trim();
    if (!name) { alert('Client name is required.'); return; }

    var payload = {
        name: name,
        contact_name: document.getElementById('clientContactName').value.trim(),
        contact_email: document.getElementById('clientContactEmail').value.trim(),
        contact_phone: document.getElementById('clientContactPhone').value.trim(),
        address: document.getElementById('clientAddress').value.trim(),
        district: document.getElementById('clientDistrict').value,
        contract_value_srd: parseFloat(document.getElementById('clientContractValue').value) || null,
        status: document.getElementById('clientStatus').value,
        notes: document.getElementById('clientNotes').value.trim()
    };

    var editId = document.getElementById('clientEditId').value;
    try {
        var btn = document.getElementById('btn-save-client');
        btn.disabled = true;
        btn.textContent = 'Saving...';

        if (editId) {
            await SyntriGuard.updateClient(editId, payload);
        } else {
            await SyntriGuard.createClient(payload);
        }

        clientModal.hide();
        await loadData();
    } catch (err) {
        alert('Failed to save client: ' + (err.message || 'Unknown error'));
    } finally {
        var btn = document.getElementById('btn-save-client');
        btn.disabled = false;
        btn.textContent = 'Save Client';
    }
}

// ─── Add/Edit Site ───
function openSiteModal(siteId) {
    document.getElementById('siteEditId').value = '';
    document.getElementById('siteName').value = '';
    document.getElementById('siteAddress').value = '';
    document.getElementById('siteDistrict').value = '';
    document.getElementById('siteStatus').value = 'active';
    document.getElementById('siteLatitude').value = '';
    document.getElementById('siteLongitude').value = '';
    document.getElementById('siteNotes').value = '';

    // Populate client dropdown
    var clientSelect = document.getElementById('siteClientId');
    clientSelect.innerHTML = '<option value="">Select Client</option>';
    allClients.forEach(function (c) {
        var opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.name;
        clientSelect.appendChild(opt);
    });
    clientSelect.value = '';

    if (siteId) {
        var s = allSites.find(function (x) { return x.id === siteId; });
        if (!s) return;
        document.getElementById('siteModalTitle').textContent = 'Edit Site';
        document.getElementById('siteEditId').value = s.id;
        document.getElementById('siteName').value = s.name || '';
        document.getElementById('siteAddress').value = s.address || '';
        document.getElementById('siteDistrict').value = s.district || '';
        document.getElementById('siteStatus').value = s.status || 'active';
        document.getElementById('siteLatitude').value = s.latitude || '';
        document.getElementById('siteLongitude').value = s.longitude || '';
        document.getElementById('siteNotes').value = s.notes || '';
        clientSelect.value = s.client_id || '';
    } else {
        document.getElementById('siteModalTitle').textContent = 'Add Site';
    }
    siteModal.show();
}

function editSite(siteId) { openSiteModal(siteId); }

function addSiteForClient(clientId) {
    openSiteModal(null);
    document.getElementById('siteClientId').value = clientId;
}

async function saveSite() {
    var name = document.getElementById('siteName').value.trim();
    var clientId = document.getElementById('siteClientId').value;
    if (!name) { alert('Site name is required.'); return; }
    if (!clientId) { alert('Please select a client.'); return; }

    var payload = {
        client_id: parseInt(clientId),
        name: name,
        address: document.getElementById('siteAddress').value.trim(),
        district: document.getElementById('siteDistrict').value,
        latitude: parseFloat(document.getElementById('siteLatitude').value) || null,
        longitude: parseFloat(document.getElementById('siteLongitude').value) || null,
        status: document.getElementById('siteStatus').value,
        notes: document.getElementById('siteNotes').value.trim()
    };

    var editId = document.getElementById('siteEditId').value;
    try {
        var btn = document.getElementById('btn-save-site');
        btn.disabled = true;
        btn.textContent = 'Saving...';

        if (editId) {
            await SyntriGuard.updateSite(editId, payload);
        } else {
            await SyntriGuard.createSite(payload);
        }

        siteModal.hide();
        await loadData();
    } catch (err) {
        alert('Failed to save site: ' + (err.message || 'Unknown error'));
    } finally {
        var btn = document.getElementById('btn-save-site');
        btn.disabled = false;
        btn.textContent = 'Save Site';
    }
}

// ─── Delete ───
async function deleteSiteRow(siteId) {
    var s = allSites.find(function (x) { return x.id === siteId; });
    if (!confirm('Delete site "' + (s ? s.name : '') + '"? This cannot be undone.')) return;

    try {
        await SyntriGuard.deleteSite(siteId);
        await loadData();
    } catch (err) {
        alert('Failed to delete site: ' + (err.message || 'Unknown error'));
    }
}

async function deleteClientRow(clientId) {
    var c = allClients.find(function (x) { return x.id === clientId; });
    var clientSites = allSites.filter(function (s) { return s.client_id === clientId; });
    var msg = 'Delete client "' + (c ? c.name : '') + '"?';
    if (clientSites.length > 0) msg += '\n\nThis client has ' + clientSites.length + ' site(s). Delete the sites first or they will become unassigned.';
    if (!confirm(msg)) return;

    try {
        await SyntriGuard.deleteClient(clientId);
        await loadData();
    } catch (err) {
        alert('Failed to delete client: ' + (err.message || 'Unknown error'));
    }
}

// ─── Helpers ───
function escHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
