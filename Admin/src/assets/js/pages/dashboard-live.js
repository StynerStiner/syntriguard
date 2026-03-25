/**
 * SyntriGuard — Dashboard Live Data
 * Replaces ALL static content with real data from the API.
 * ALL buttons work — navigation, export, refresh, quick actions.
 */
document.addEventListener('DOMContentLoaded', async function () {
    var DEFAULT_AVATAR = 'https://pub-bb4fc0a4a29548cc9136a6cdb4882573.r2.dev/founder-headshot/raoulstiner.png';

    if (typeof SyntriGuard === 'undefined' || !SyntriGuard.isLoggedIn()) return;

    var dashStats = null;
    var dashGuards = null;
    var dashIncidents = null;
    var dashSites = null;

    try {
        var results = await Promise.allSettled([
            SyntriGuard.getDashboardStats(),
            SyntriGuard.getGuards(),
            SyntriGuard.getIncidents(),
            SyntriGuard.getSites()
        ]);

        dashStats = results[0].status === 'fulfilled' ? results[0].value : null;
        dashGuards = results[1].status === 'fulfilled' ? results[1].value : null;
        dashIncidents = results[2].status === 'fulfilled' ? results[2].value : null;
        dashSites = results[3].status === 'fulfilled' ? results[3].value : null;

        if (dashStats) updateKPICards(dashStats);
        if (dashStats) updateShiftCoverageStats(dashStats);
        if (dashStats) updateGuardDeploymentStats(dashStats);
        if (dashGuards) updateTeamMembers(dashGuards);
        if (dashIncidents) updateRecentIncidents(dashIncidents);
        if (dashSites) updateActiveSites(dashSites);

    } catch (err) {
        console.error('Dashboard: Failed to load live data', err);
    }

    // ─── Wire Refresh Button ───
    var refreshBtn = document.getElementById('btn-refresh-deployment');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', async function (e) {
            e.preventDefault();
            refreshBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Loading...';
            try {
                var freshStats = await SyntriGuard.getDashboardStats();
                if (freshStats) {
                    updateKPICards(freshStats);
                    updateGuardDeploymentStats(freshStats);
                    updateShiftCoverageStats(freshStats);
                }
            } catch (err) { console.error(err); }
            refreshBtn.innerHTML = 'Refresh <i class="ri-refresh-line ms-1"></i>';
        });
    }

    // ─── Wire Export Incidents Button ───
    var exportBtn = document.getElementById('btn-export-incidents');
    if (exportBtn) {
        exportBtn.addEventListener('click', async function (e) {
            e.preventDefault();
            exportBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Exporting...';
            try {
                await SyntriGuard.exportIncidentsSheet();
                exportBtn.innerHTML = '<i class="ti ti-check me-1"></i>Exported!';
                setTimeout(function () {
                    exportBtn.innerHTML = 'Export <i class="ti ti-file-export ms-1"></i>';
                }, 2000);
            } catch (err) {
                alert('Export failed: ' + (err.message || 'Unknown error'));
                exportBtn.innerHTML = 'Export <i class="ti ti-file-export ms-1"></i>';
            }
        });
    }

    // ─── KPI Cards (top 4 cards) ───
    function updateKPICards(stats) {
        var kpiCards = document.querySelectorAll('.row-cols-xxl-4 > .col');
        if (kpiCards.length < 4) return;

        // Active Guards
        var h3_0 = kpiCards[0].querySelector('.card-body h3');
        if (h3_0) h3_0.textContent = stats.guards.total || 0;
        var p0 = kpiCards[0].querySelector('.card-body p.text-muted');
        if (p0) p0.textContent = stats.guards.on_duty + ' on duty, ' + stats.guards.off_duty + ' off';
        var bar0 = kpiCards[0].querySelector('.progress-bar');
        if (bar0 && stats.guards.total) {
            var pct0 = Math.round((stats.guards.on_duty / stats.guards.total) * 100);
            bar0.style.width = pct0 + '%';
        }

        // Shifts Today
        var h3_1 = kpiCards[1].querySelector('.card-body h3');
        if (h3_1) h3_1.textContent = stats.shifts.today || 0;
        var p1 = kpiCards[1].querySelector('.card-body p.text-muted');
        if (p1) p1.textContent = stats.shifts.completed + ' completed, ' + stats.shifts.upcoming + ' upcoming';
        var bar1 = kpiCards[1].querySelector('.progress-bar');
        if (bar1 && stats.shifts.today) {
            var pct1 = Math.round((stats.shifts.completed / stats.shifts.today) * 100);
            bar1.style.width = pct1 + '%';
        }

        // Active Sites
        var h3_2 = kpiCards[2].querySelector('.card-body h3');
        if (h3_2) h3_2.textContent = stats.sites.active || 0;
        var p2 = kpiCards[2].querySelector('.card-body p.text-muted');
        if (p2) p2.textContent = stats.sites.total + ' total sites';
        var bar2 = kpiCards[2].querySelector('.progress-bar');
        if (bar2 && stats.sites.total) {
            var pct2 = Math.round((stats.sites.active / stats.sites.total) * 100);
            bar2.style.width = pct2 + '%';
        }

        // Open Incidents
        var h3_3 = kpiCards[3].querySelector('.card-body h3');
        if (h3_3) h3_3.textContent = stats.incidents.open || 0;
        var p3 = kpiCards[3].querySelector('.card-body p.text-muted');
        if (p3) p3.textContent = stats.incidents.critical + ' critical';
        var bar3 = kpiCards[3].querySelector('.progress-bar');
        if (bar3 && stats.incidents.total) {
            var pct3 = Math.round((stats.incidents.open / stats.incidents.total) * 100);
            bar3.style.width = pct3 + '%';
        }

        // Update badges
        var badge0 = kpiCards[0].querySelector('.badge');
        if (badge0) badge0.innerHTML = stats.guards.on_duty + ' on duty <i class="ti ti-trending-up"></i>';
        var badge1 = kpiCards[1].querySelector('.badge');
        if (badge1) {
            var completePct = stats.shifts.today > 0 ? Math.round((stats.shifts.completed / stats.shifts.today) * 100) : 0;
            badge1.innerHTML = completePct + '% <i class="ti ti-trending-up"></i>';
        }
        var badge2 = kpiCards[2].querySelector('.badge');
        if (badge2) badge2.innerHTML = stats.sites.active + ' active <i class="ti ti-trending-up"></i>';
        var badge3 = kpiCards[3].querySelector('.badge');
        if (badge3) badge3.innerHTML = stats.incidents.critical + ' critical <i class="ti ti-trending-down"></i>';
    }

    // ─── Shift Coverage Stats (Scheduled / Completed / Missed) ───
    function updateShiftCoverageStats(stats) {
        var allP = document.querySelectorAll('p.text-muted');
        allP.forEach(function(p) {
            var text = p.textContent.trim();
            var sibling = p.nextElementSibling;
            if (!sibling) return;
            var span = sibling.querySelector('span:last-child') || sibling.querySelector('span') || sibling;

            if (text === 'Scheduled') {
                var total = parseInt(stats.shifts.today || 0) + parseInt(stats.shifts.completed || 0);
                span.textContent = total + ' shifts';
            } else if (text === 'Completed') {
                span.textContent = (stats.shifts.completed || 0) + ' shifts';
            } else if (text === 'Missed') {
                var missed = Math.max(0, parseInt(stats.shifts.today || 0) - parseInt(stats.shifts.completed || 0) - parseInt(stats.shifts.upcoming || 0));
                span.textContent = missed + ' shifts';
            }
        });
    }

    // ─── Guard Deployment Stats (On Duty / Off Duty / On Leave / Unassigned) ───
    function updateGuardDeploymentStats(stats) {
        var deployLabels = document.querySelectorAll('.align-middle.fw-semibold');

        deployLabels.forEach(function(label) {
            var text = label.textContent.trim();
            var valueSpan = label.closest('.d-flex') ? label.closest('.d-flex').querySelector('.float-end') : null;
            if (!valueSpan) return;

            var arrow = valueSpan.querySelector('i');
            var arrowHTML = arrow ? arrow.outerHTML + ' ' : '';

            if (text === 'On Duty') {
                valueSpan.innerHTML = arrowHTML + (stats.guards.on_duty || 0);
            } else if (text === 'Off Duty') {
                valueSpan.innerHTML = arrowHTML + (stats.guards.off_duty || 0);
            } else if (text === 'On Leave') {
                valueSpan.innerHTML = arrowHTML + (stats.guards.on_leave || 0);
            } else if (text === 'Unassigned') {
                valueSpan.innerHTML = arrowHTML + (stats.guards.unassigned || 0);
            }
        });
    }

    // ─── Team Member Cards (top 5 guards) ───
    function updateTeamMembers(guards) {
        var sorted = guards.slice().sort(function (a, b) {
            return (b.total_shifts_completed || b.performance_score || 0) - (a.total_shifts_completed || a.performance_score || 0);
        });
        var top5 = sorted.slice(0, 5);

        var teamRow = document.querySelector('.row-cols-xxl-5');
        if (!teamRow) return;

        var html = '';
        top5.forEach(function (g) {
            var avatar = g.avatar_url || DEFAULT_AVATAR;
            var name = g.full_name || 'Unknown';
            var role = g.role || '';
            var shifts = g.total_shifts_completed || 0;

            html += '<div class="col">' +
                '<div class="card">' +
                '<div class="card-body d-flex align-items-center gap-2">' +
                '<img src="' + avatar + '" alt="" class="me-1 avatar-xl img-thumbnail rounded-circle">' +
                '<div>' +
                '<h5>' + escHtml(name) + '</h5>' +
                '<p class="text-muted">' + escHtml(role) + '</p>' +
                '<p class="m-0 fs-14">' + shifts + ' shifts <a href="/guards" class="link-reset fw-medium"><i class="ti ti-arrow-right"></i></a></p>' +
                '</div></div></div></div>';
        });

        teamRow.innerHTML = html;
    }

    // ─── Active Sites Table ───
    function updateActiveSites(sites) {
        // Find sites count text
        var siteCountEls = document.querySelectorAll('b');
        siteCountEls.forEach(function(b) {
            if (b.parentElement && b.parentElement.textContent.includes('Active sites')) {
                var activeSites = sites.filter(function(s) { return s.status === 'active'; });
                b.textContent = activeSites.length;
                var totalSpan = b.parentElement.querySelector('.fw-medium');
                if (totalSpan) totalSpan.textContent = sites.length;
            }
        });

        // Find the sites table tbody
        var sitesCard = null;
        document.querySelectorAll('.header-title, h4').forEach(function(h) {
            if (h.textContent.trim() === 'Active Sites') {
                sitesCard = h.closest('.card');
            }
        });
        if (!sitesCard) return;

        var tbody = sitesCard.querySelector('tbody');
        if (!tbody) return;

        var activeSites = sites.filter(function(s) { return s.status !== 'inactive'; }).slice(0, 7);

        var statusMap = {
            'active': { color: 'text-success', label: 'Active' },
            'elevated': { color: 'text-danger', label: 'Elevated' },
            'pending': { color: 'text-warning', label: 'Pending' },
            'inactive': { color: 'text-secondary', label: 'Inactive' }
        };

        var bgColors = ['bg-primary-subtle', 'bg-info-subtle', 'bg-success-subtle', 'bg-secondary-subtle', 'bg-danger-subtle', 'bg-warning-subtle', 'bg-dark-subtle'];
        var iconLetterColors = ['text-primary', 'text-info', 'text-success', 'text-secondary', 'text-danger', 'text-warning', 'text-dark'];

        var rows = '';
        activeSites.forEach(function(site, idx) {
            var status = statusMap[site.status] || statusMap['active'];
            var category = site.client_name || 'Client';
            var bgClass = bgColors[idx % bgColors.length];
            var letterColor = iconLetterColors[idx % iconLetterColors.length];
            var letter = (site.name || 'S').charAt(0).toUpperCase();

            rows += '<tr>' +
                '<td>' +
                '<div class="d-flex align-items-center">' +
                '<div class="avatar-md flex-shrink-0 me-2">' +
                '<span class="avatar-title ' + bgClass + ' rounded-circle ' + letterColor + ' fs-18 fw-bold">' + letter + '</span>' +
                '</div>' +
                '<div>' +
                '<span class="text-muted fs-12">' + escHtml(category) + '</span> <br />' +
                '<span class="fw-semibold">' + escHtml(site.name) + '</span>' +
                '</div></div>' +
                '</td>' +
                '<td>' +
                '<span class="text-muted fs-12">Location</span><br/>' +
                '<span class="fw-semibold">' + escHtml(site.district || '') + '</span>' +
                '</td>' +
                '<td>' +
                '<span class="text-muted fs-12">Guards Assigned</span> <br />' +
                '<span class="fw-semibold">' + (site.guard_count || 0) + '</span>' +
                '</td>' +
                '<td>' +
                '<span class="text-muted fs-12">Status</span><br/>' +
                '<span class="fw-semibold"><i class="ti ti-circle-filled fs-12 ' + status.color + '"></i> ' + status.label + '</span>' +
                '</td>' +
                '<td style="width: 30px;">' +
                '<div class="dropdown">' +
                '<a href="#" class="dropdown-toggle text-muted drop-arrow-none card-drop p-0" data-bs-toggle="dropdown">' +
                '<i class="ti ti-dots-vertical"></i></a>' +
                '<div class="dropdown-menu dropdown-menu-end">' +
                '<a href="/clients" class="dropdown-item"><i class="ti ti-eye fs-14 me-2"></i>View Details</a>' +
                '<a href="javascript:void(0);" class="dropdown-item" onclick="sgQuickAction(\'Export site report for ' + escHtml(site.name) + '\')"><i class="ti ti-file-export fs-14 me-2"></i>Export Report</a>' +
                '</div></div>' +
                '</td>' +
                '</tr>';
        });

        tbody.innerHTML = rows;

        // Update footer count
        var footer = sitesCard.querySelector('.card-footer');
        if (footer) {
            var footerText = footer.querySelector('.text-muted');
            if (footerText) {
                footerText.innerHTML = 'Showing <span class="fw-semibold">' + activeSites.length + '</span> of <span class="fw-semibold">' + sites.length + '</span> Results';
            }
        }
    }

    // ─── Recent Incidents Table ───
    function updateRecentIncidents(incidents) {
        var sorted = incidents.slice().sort(function (a, b) {
            return new Date(b.filed_at || b.created_at) - new Date(a.filed_at || a.created_at);
        });
        var top5 = sorted.slice(0, 5);

        var incidentCard = null;
        document.querySelectorAll('.header-title, h4').forEach(function (h) {
            if (h.textContent.trim() === 'Recent Incidents') {
                incidentCard = h.closest('.card');
            }
        });
        if (!incidentCard) return;

        var tbody = incidentCard.querySelector('tbody');
        if (!tbody) return;

        var statusMap = {
            'open': { badge: 'bg-warning-subtle text-warning', label: 'Open' },
            'investigating': { badge: 'bg-primary-subtle text-primary', label: 'Investigating' },
            'resolved': { badge: 'bg-success-subtle text-success', label: 'Resolved' },
            'closed': { badge: 'bg-secondary-subtle text-secondary', label: 'Closed' }
        };

        var severityMap = {
            'critical': { badge: 'bg-danger', icon: 'ti-alert-triangle', color: 'text-danger', bg: 'bg-danger-subtle' },
            'high': { badge: 'bg-warning', icon: 'ti-alert-circle', color: 'text-warning', bg: 'bg-warning-subtle' },
            'medium': { badge: 'bg-info', icon: 'ti-info-circle', color: 'text-info', bg: 'bg-info-subtle' },
            'low': { badge: 'bg-secondary', icon: 'ti-shield', color: 'text-secondary', bg: 'bg-secondary-subtle' }
        };

        var rows = '';
        top5.forEach(function (inc) {
            var type = inc.type || 'Incident';
            var site = inc.site_name || '';
            var guard = inc.guard_name || '';
            var statusKey = (inc.status || 'open').toLowerCase();
            var statusInfo = statusMap[statusKey] || statusMap['open'];
            var severity = (inc.severity || 'medium').toLowerCase();
            var sevInfo = severityMap[severity] || severityMap['medium'];

            rows += '<tr>' +
                '<td style="width: 85px;">' +
                '<div class="avatar-lg border rounded">' +
                '<span class="avatar-title ' + sevInfo.bg + ' ' + sevInfo.color + ' rounded-2 fs-22">' +
                '<i class="ti ' + sevInfo.icon + '"></i>' +
                '</span></div>' +
                '</td>' +
                '<td>' +
                '<h5 class="fs-14 my-1"><a href="/incidents" class="link-reset">' + escHtml(type) + '</a></h5>' +
                '<span class="text-muted fs-12">' + escHtml(site) + '</span>' +
                '</td>' +
                '<td>' +
                '<h5 class="fs-14 my-1">' + escHtml(guard) + '</h5>' +
                '<span class="text-muted fs-12">Guard</span>' +
                '</td>' +
                '<td>' +
                '<span class="badge ' + sevInfo.badge + '">' + severity.charAt(0).toUpperCase() + severity.slice(1) + '</span><br/>' +
                '<span class="text-muted fs-12">Severity</span>' +
                '</td>' +
                '<td>' +
                '<span class="badge ' + statusInfo.badge + '">' + statusInfo.label + '</span><br/>' +
                '<span class="text-muted fs-12">Status</span>' +
                '</td>' +
                '</tr>';
        });

        tbody.innerHTML = rows;

        var footer = incidentCard.querySelector('.card-footer');
        if (footer) {
            var footerText = footer.querySelector('.text-muted');
            if (footerText) {
                footerText.innerHTML = 'Showing <span class="fw-semibold">' + top5.length + '</span> of <span class="fw-semibold">' + incidents.length + '</span> Results';
            }
        }
    }

    function escHtml(str) {
        var div = document.createElement('div');
        div.textContent = str || '';
        return div.innerHTML;
    }
});
