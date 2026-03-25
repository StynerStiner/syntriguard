/**
 * SyntriGuard — Guard Performance Page
 * Fetches real guard data from API and replaces static table rows.
 */
document.addEventListener('DOMContentLoaded', async function () {
    var DEFAULT_AVATAR = 'https://pub-bb4fc0a4a29548cc9136a6cdb4882573.r2.dev/founder-headshot/raoulstiner.png';

    try {
        var guards = await SyntriGuard.getGuards();
        if (!guards || !Array.isArray(guards)) return;

        // Sort by auto_score descending (fallback to 0)
        guards.sort(function (a, b) {
            return (b.auto_score || 0) - (a.auto_score || 0);
        });

        var tbody = document.querySelector('.table-hover tbody');
        if (!tbody) return;

        var totalShifts = 0;
        var totalIncidents = 0;
        var scoreSum = 0;
        var scoredCount = 0;

        var rows = '';
        guards.forEach(function (g, idx) {
            var rank = idx + 1;
            var avatar = g.avatar_url || DEFAULT_AVATAR;
            var name = g.name || 'Unknown';
            var role = g.role || '—';
            var site = g.site_name || '—';
            var completed = g.total_shifts_completed || 0;
            var missed = g.total_shifts_missed || 0;
            var onTime = g.on_time_percentage != null ? g.on_time_percentage : null;
            var incidents = g.performance_score || 0;
            var score = g.auto_score != null ? g.auto_score : null;

            totalShifts += completed;
            totalIncidents += incidents;
            if (score !== null) {
                scoreSum += score;
                scoredCount++;
            }

            // On-time display
            var onTimeDisplay = onTime !== null ? onTime + '%' : '—';

            // Score badge color
            var badgeClass = 'bg-secondary-subtle text-secondary';
            var scoreDisplay = '—';
            if (score !== null) {
                scoreDisplay = score + '%';
                if (score >= 93) {
                    badgeClass = 'bg-success-subtle text-success';
                } else if (score >= 88) {
                    badgeClass = 'bg-primary-subtle text-primary';
                } else if (score >= 80) {
                    badgeClass = 'bg-warning-subtle text-warning';
                } else {
                    badgeClass = 'bg-danger-subtle text-danger';
                }
            }

            // Trend icon
            var trendIcon = '<i class="ti ti-minus text-muted fs-18"></i>';
            if (score !== null && score >= 93) {
                trendIcon = '<i class="ti ti-trending-up text-success fs-18"></i>';
            } else if (score !== null && score < 88) {
                trendIcon = '<i class="ti ti-trending-down text-danger fs-18"></i>';
            }

            rows += '<tr>' +
                '<td class="ps-3 fw-semibold">' + rank + '</td>' +
                '<td>' +
                    '<div class="d-flex align-items-center gap-2">' +
                        '<div class="avatar-sm">' +
                            '<img src="' + avatar + '" alt="" class="img-fluid rounded-circle" width="32" height="32">' +
                        '</div>' +
                        '<h6 class="fs-14 mb-0">' + name + '</h6>' +
                    '</div>' +
                '</td>' +
                '<td>' + role + '</td>' +
                '<td>' + site + '</td>' +
                '<td>' + completed + '</td>' +
                '<td>' + missed + '</td>' +
                '<td>' + onTimeDisplay + '</td>' +
                '<td>' + incidents + '</td>' +
                '<td><span class="badge ' + badgeClass + ' fs-12 p-1">' + scoreDisplay + '</span></td>' +
                '<td class="pe-3">' + trendIcon + '</td>' +
            '</tr>';
        });

        tbody.innerHTML = rows;

        // Update footer summary stats
        var avgScore = scoredCount > 0 ? Math.round(scoreSum / scoredCount) : 0;
        var footerDiv = document.querySelector('.card-footer .text-muted');
        if (footerDiv) {
            footerDiv.innerHTML = 'Average Performance Score: <span class="fw-semibold">' + avgScore + '%</span> | ' +
                'Total Shifts Completed: <span class="fw-semibold">' + totalShifts + '</span> | ' +
                'Total Incidents Handled: <span class="fw-semibold">' + totalIncidents + '</span>';
        }

    } catch (err) {
        console.error('Guard Performance: Failed to load data', err);
    }
});
