/**
* SyntriGuard Deployment Map — Suriname
* Fetches sites from /api/sites and places markers with live data.
*/

'use strict';

(function () {

    var basicMapVar = document.getElementById('basicMap');
    if (!basicMapVar) return;

    // Center on Paramaribo, Suriname
    var basicMap = L.map('basicMap').setView([5.832, -55.166], 12);

    L.tileLayer('https://{s}.tile.osm.org/{z}/{x}/{y}.png', {
        attribution: 'Map data &copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a>',
        maxZoom: 18
    }).addTo(basicMap);

    // Status colors for markers
    var statusColors = {
        'active': '#22c55e',
        'elevated': '#ef4444',
        'pending': '#f59e0b',
        'inactive': '#6b7280'
    };

    function createMarkerIcon(color) {
        return L.divIcon({
            className: '',
            html: '<div style="background:' + color + ';width:14px;height:14px;border-radius:50%;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);"></div>',
            iconSize: [14, 14],
            iconAnchor: [7, 7],
            popupAnchor: [0, -10]
        });
    }

    // Fetch live sites from API
    var token = localStorage.getItem('sg_token');
    if (token) {
        fetch('/api/sites', {
            headers: { 'Authorization': 'Bearer ' + token }
        })
        .then(function(resp) { return resp.json(); })
        .then(function(sites) {
            if (!sites || !sites.length) {
                // Fallback static markers
                addStaticMarkers(basicMap);
                return;
            }

            var bounds = [];

            sites.forEach(function(site) {
                var lat = parseFloat(site.latitude);
                var lng = parseFloat(site.longitude);

                if (!lat || !lng) return;

                var status = site.status || 'active';
                var color = statusColors[status] || statusColors['active'];
                var guardCount = site.guard_count || site.guards_assigned || 0;
                var clientName = site.client_name || '';

                var popupContent =
                    '<strong>' + site.name + '</strong>' +
                    (clientName ? '<br><span style="color:#666;">' + clientName + '</span>' : '') +
                    '<br>' + (site.address || site.district || '') +
                    '<br><strong>' + guardCount + ' guards</strong> · ' +
                    '<span style="color:' + color + ';font-weight:600;">' + status.charAt(0).toUpperCase() + status.slice(1) + '</span>';

                var marker = L.marker([lat, lng], { icon: createMarkerIcon(color) })
                    .addTo(basicMap)
                    .bindPopup(popupContent);

                bounds.push([lat, lng]);
            });

            // Fit map to show all markers with padding
            if (bounds.length > 1) {
                basicMap.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
            } else if (bounds.length === 1) {
                basicMap.setView(bounds[0], 14);
            }
        })
        .catch(function(err) {
            console.error('Failed to load sites for map:', err);
            addStaticMarkers(basicMap);
        });
    } else {
        addStaticMarkers(basicMap);
    }

    // Fallback if not logged in or API fails
    function addStaticMarkers(map) {
        L.marker([5.8295, -55.1677]).addTo(map).bindPopup('<strong>Presidential Palace</strong><br>Kleine Combeweg 2, Paramaribo<br>14 guards · Elevated Alert');
        L.marker([5.8550, -55.2150]).addTo(map).bindPopup('<strong>Port of Paramaribo</strong><br>Waterkant 138, Paramaribo<br>10 guards · Active');
        L.marker([5.8750, -55.1600]).addTo(map).bindPopup('<strong>Staatsolie HQ</strong><br>Dr. Ir. H.S. Adhinstraat 21, Flora<br>8 guards · Active');
        L.marker([5.8420, -55.2050]).addTo(map).bindPopup('<strong>Hakrinbank</strong><br>Domineestraat 26, Paramaribo<br>6 guards · Active');
        L.marker([5.4531, -55.1879]).addTo(map).bindPopup('<strong>Johan Adolf Pengel Airport</strong><br>Zanderij, Para District<br>10 guards · Pending');
    }

})();
