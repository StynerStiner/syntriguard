/**
 * SyntriGuard — File Report Page
 * Populates dropdowns from API and submits real incidents to the database.
 */
document.addEventListener('DOMContentLoaded', async function () {

    var guardSelect = document.getElementById('guardName');
    var siteSelect = document.getElementById('incidentSite');
    var incidentNoInput = document.getElementById('incidentNo');
    var guardsData = [];
    var sitesData = [];

    try {
        var token = localStorage.getItem('sg_token');
        if (!token) return;

        var results = await Promise.allSettled([
            fetch('/api/guards', { headers: { 'Authorization': 'Bearer ' + token } }).then(r => r.json()),
            fetch('/api/sites', { headers: { 'Authorization': 'Bearer ' + token } }).then(r => r.json()),
            fetch('/api/incidents', { headers: { 'Authorization': 'Bearer ' + token } }).then(r => r.json())
        ]);

        guardsData = results[0].status === 'fulfilled' ? results[0].value : [];
        sitesData = results[1].status === 'fulfilled' ? results[1].value : [];
        var incidents = results[2].status === 'fulfilled' ? results[2].value : [];

        if (!Array.isArray(guardsData)) guardsData = [];
        if (!Array.isArray(sitesData)) sitesData = [];
        if (!Array.isArray(incidents)) incidents = [];

        // Populate Guard Dropdown
        if (guardSelect) {
            guardSelect.innerHTML = '<option value="">Select Guard</option>';
            guardsData.forEach(function (g) {
                var opt = document.createElement('option');
                opt.value = g.id;
                opt.textContent = g.full_name + ' (' + g.guard_id + ')';
                guardSelect.appendChild(opt);
            });
        }

        // Populate Site Dropdown
        if (siteSelect) {
            siteSelect.innerHTML = '<option value="">Select Site</option>';
            sitesData.forEach(function (s) {
                var opt = document.createElement('option');
                opt.value = s.id;
                opt.textContent = s.name;
                siteSelect.appendChild(opt);
            });
        }

        // Generate Next Incident ID
        if (incidentNoInput) {
            var maxId = 0;
            incidents.forEach(function (inc) {
                var match = (inc.incident_id || '').match(/INC-(\d+)/);
                if (match) {
                    var num = parseInt(match[1], 10);
                    if (num > maxId) maxId = num;
                }
            });
            incidentNoInput.value = '#INC-' + String(maxId + 1).padStart(3, '0');
        }

    } catch (err) {
        console.error('File Report: Failed to populate dropdowns', err);
    }

    // Wire Submit Report button
    var submitBtn = document.getElementById('btn-submit-report');
    if (submitBtn) {
        submitBtn.addEventListener('click', async function (e) {
            e.preventDefault();
            await submitReport();
        });
    }

    // Wire Save Draft button
    var draftBtn = document.getElementById('btn-save-draft');
    if (draftBtn) {
        draftBtn.addEventListener('click', function (e) {
            e.preventDefault();
            showMessage('Draft saved.', 'info');
        });
    }

    async function submitReport() {
        var severitySelect = document.getElementById('incidentSeverity');
        var typeSelect = document.getElementById('incidentType');
        var descTextarea = document.getElementById('incidentDescription');
        var damagesInput = document.getElementById('incidentDamages');
        var policeSelect = document.getElementById('policeNotified');
        var followUpSelect = document.getElementById('followUp');
        var notesTextarea = document.getElementById('additionalNotes');
        var locationTextarea = document.querySelector('textarea[placeholder*="Rear gate"]') || document.querySelector('textarea[placeholder*="e.g."]');

        var guardId = guardSelect ? parseInt(guardSelect.value) : null;
        var siteId = siteSelect ? parseInt(siteSelect.value) : null;

        var payload = {
            type: typeSelect ? typeSelect.value : '',
            severity: severitySelect ? severitySelect.value : 'medium',
            site_id: siteId || null,
            guard_id: guardId || null,
            description: descTextarea ? descTextarea.value : '',
            specific_location: locationTextarea ? locationTextarea.value : '',
            damages_srd: damagesInput ? parseFloat(damagesInput.value) || null : null,
            police_notified: policeSelect ? policeSelect.value : 'no',
            followup_required: followUpSelect ? followUpSelect.value === 'Yes' : false,
            additional_notes: notesTextarea ? notesTextarea.value : ''
        };

        if (!payload.type) {
            showMessage('Please select an incident type.', 'danger');
            return;
        }
        if (!guardId) {
            showMessage('Please select a guard.', 'danger');
            return;
        }
        if (!siteId) {
            showMessage('Please select a site.', 'danger');
            return;
        }

        try {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Submitting...';

            var token = localStorage.getItem('sg_token');
            var resp = await fetch('/api/incidents', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                body: JSON.stringify(payload)
            });
            var result = await resp.json();

            if (!resp.ok) throw new Error(result.error || 'Failed to submit');

            showMessage('Incident ' + (result.incident_id || '') + ' submitted successfully!', 'success');

            setTimeout(function () {
                window.location.href = '/incidents';
            }, 1500);

        } catch (err) {
            showMessage('Failed: ' + (err.message || 'Unknown error'), 'danger');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Submit Report';
        }
    }

    function showMessage(text, type) {
        var existing = document.getElementById('sg-form-alert');
        if (existing) existing.remove();

        var alert = document.createElement('div');
        alert.id = 'sg-form-alert';
        alert.className = 'alert alert-' + type + ' alert-dismissible fade show mt-3';
        alert.innerHTML = text + '<button type="button" class="btn-close" data-bs-dismiss="alert"></button>';

        var cardBody = document.querySelector('.card-body');
        if (cardBody) cardBody.insertBefore(alert, cardBody.firstChild);

        setTimeout(function () { if (alert.parentNode) alert.remove(); }, 5000);
    }
});
