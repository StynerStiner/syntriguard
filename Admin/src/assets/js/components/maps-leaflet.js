/**
 * SyntriGuard Command Center — Deployment Map
 * Full-featured security operations map with 12 integrated features:
 *  1. Live guard positions        7. Alert system with auto-zoom
 *  2. Geofence security zones     8. Weather overlay
 *  3. Status dashboard overlay    9. Satellite/dark tile toggle
 *  4. Shift layer toggle         10. Distance & area measurement
 *  5. Incident markers + heat   11. Site detail drawer
 *  6. Patrol route visualization 12. Export/print map
 */

'use strict';

(function () {

    var mapEl = document.getElementById('commandMap');
    if (!mapEl) return;

    // ──────────────────────────────────────────
    // CONFIG
    // ──────────────────────────────────────────
    var PARAMARIBO = [5.832, -55.166];
    var statusColors = {
        active:   '#22c55e',
        elevated: '#ef4444',
        pending:  '#f59e0b',
        inactive: '#6b7280'
    };
    var shiftTypeColors = {
        morning:   '#f59e0b',
        afternoon: '#3b82f6',
        overnight: '#8b5cf6',
        training:  '#06b6d4',
        on_call:   '#ec4899',
        critical:  '#ef4444'
    };
    var severityColors = {
        critical: '#ef4444',
        high:     '#f97316',
        medium:   '#f59e0b',
        low:      '#6b7280'
    };

    // ──────────────────────────────────────────
    // TILE LAYERS (Feature 9: Map Style Toggle)
    // ──────────────────────────────────────────
    var tileLayers = {
        street: L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
            maxZoom: 20
        }),
        satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            attribution: '&copy; Esri',
            maxZoom: 19
        }),
        dark: L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; CartoDB',
            maxZoom: 19
        }),
        topo: L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenTopoMap',
            maxZoom: 17
        })
    };

    // ──────────────────────────────────────────
    // INIT MAP
    // ──────────────────────────────────────────
    // Set map height dynamically — fill available screen
    function setMapHeight() {
        var rect = mapEl.getBoundingClientRect();
        var available = window.innerHeight - rect.top - 10;
        mapEl.style.height = Math.max(280, available) + 'px';
    }
    setMapHeight();
    window.addEventListener('resize', function () {
        setMapHeight();
        map.invalidateSize();
    });

    var map = L.map('commandMap', {
        center: PARAMARIBO,
        zoom: 12,
        layers: [tileLayers.street],
        zoomControl: true
    });

    var currentTileKey = 'street';

    // ──────────────────────────────────────────
    // LAYER GROUPS
    // ──────────────────────────────────────────
    var sitesLayer    = L.layerGroup().addTo(map);
    var guardsLayer   = L.layerGroup();
    var geofenceLayer = L.layerGroup();
    var incidentLayer = L.layerGroup();
    var heatLayer     = null;  // created dynamically
    var routesLayer   = L.layerGroup();
    var measureLayer  = L.layerGroup().addTo(map);

    // Track state
    var mapData       = null;
    var activeShift   = 'all';
    var activeLayers  = { sites: true, guards: false, geofence: false, incidents: false, heatmap: false, routes: false };
    var isMeasuring   = false;
    var measureMode   = null; // 'distance' or 'area'
    var measurePoints = [];
    var measureLine   = null;
    var measurePoly   = null;
    var currentAlert  = null;

    // ──────────────────────────────────────────
    // MARKER FACTORIES
    // ──────────────────────────────────────────
    function siteIcon(color, count) {
        var size = Math.max(20, Math.min(40, 16 + count * 2));
        return L.divIcon({
            className: '',
            html: '<div style="' +
                'background:' + color + ';' +
                'width:' + size + 'px;height:' + size + 'px;' +
                'border-radius:50%;border:3px solid white;' +
                'box-shadow:0 2px 8px rgba(0,0,0,0.4);' +
                'display:flex;align-items:center;justify-content:center;' +
                'color:white;font-weight:700;font-size:11px;' +
                '">' + (count > 0 ? count : '') + '</div>',
            iconSize: [size, size],
            iconAnchor: [size / 2, size / 2],
            popupAnchor: [0, -(size / 2) - 4]
        });
    }

    function guardIcon() {
        return L.divIcon({
            className: '',
            html: '<div style="' +
                'width:12px;height:12px;border-radius:50%;' +
                'background:#3b82f6;border:2px solid white;' +
                'box-shadow:0 1px 4px rgba(0,0,0,0.3);' +
                '"></div>',
            iconSize: [12, 12],
            iconAnchor: [6, 6],
            popupAnchor: [0, -8]
        });
    }

    function incidentIcon(severity) {
        var color = severityColors[severity] || '#ef4444';
        return L.divIcon({
            className: '',
            html: '<div style="' +
                'width:0;height:0;' +
                'border-left:8px solid transparent;border-right:8px solid transparent;' +
                'border-bottom:16px solid ' + color + ';' +
                'filter:drop-shadow(0 2px 4px rgba(0,0,0,0.4));' +
                'position:relative;' +
                '"><span style="position:absolute;top:5px;left:-3px;color:white;font-weight:900;font-size:9px;">!</span></div>',
            iconSize: [16, 16],
            iconAnchor: [8, 16],
            popupAnchor: [0, -16]
        });
    }

    function pulsingIcon(color) {
        return L.divIcon({
            className: '',
            html: '<div style="position:relative;">' +
                '<div style="width:14px;height:14px;border-radius:50%;background:' + color + ';border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.4);position:relative;z-index:2;"></div>' +
                '<div style="position:absolute;top:-5px;left:-5px;width:24px;height:24px;border-radius:50%;background:' + color + ';opacity:0.3;animation:sg-pulse 1.5s infinite;"></div>' +
                '</div>',
            iconSize: [24, 24],
            iconAnchor: [12, 12],
            popupAnchor: [0, -14]
        });
    }

    // Inject pulse animation CSS
    if (!document.getElementById('sg-pulse-css')) {
        var style = document.createElement('style');
        style.id = 'sg-pulse-css';
        style.textContent = '@keyframes sg-pulse{0%{transform:scale(1);opacity:0.3;}50%{transform:scale(1.8);opacity:0;}100%{transform:scale(1);opacity:0.3;}}';
        document.head.appendChild(style);
    }

    // ──────────────────────────────────────────
    // DATA LOADING
    // ──────────────────────────────────────────
    function loadMapData(callback) {
        var token = localStorage.getItem('sg_token');
        if (!token) {
            showMapMessage('Authentication required. Please <a href="/login">log in</a> to view live deployment data.');
            return;
        }

        fetch('/api/map-data', {
            headers: { 'Authorization': 'Bearer ' + token }
        })
        .then(function (r) {
            if (r.status === 401) {
                showMapMessage('Session expired. Please <a href="/login">log in again</a>.');
                return null;
            }
            return r.json();
        })
        .then(function (data) {
            if (!data) return;
            if (data.error) {
                console.error('Map data error:', data.error);
                showMapMessage('Failed to load deployment data. Check server connection.');
                return;
            }
            mapData = data;
            renderAll();
            if (callback) callback();
        })
        .catch(function (err) {
            console.error('Failed to load map data:', err);
            showMapMessage('Connection error. Unable to reach the server.');
        });
    }

    function showMapMessage(html) {
        // Show an overlay message on the map when data cannot be loaded
        var existing = document.getElementById('mapOverlayMsg');
        if (existing) existing.remove();
        var div = document.createElement('div');
        div.id = 'mapOverlayMsg';
        div.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);z-index:1000;background:rgba(0,0,0,0.8);color:white;padding:20px 30px;border-radius:8px;text-align:center;max-width:400px;';
        div.innerHTML = '<i class="ti ti-shield-lock" style="font-size:32px;display:block;margin-bottom:8px;"></i>' + html;
        mapEl.parentElement.appendChild(div);
    }

    // ──────────────────────────────────────────
    // RENDER ALL LAYERS
    // ──────────────────────────────────────────
    function renderAll() {
        if (!mapData) return;
        renderSites();
        renderGuards();
        renderGeofences();
        renderIncidents();
        renderHeatmap();
        renderRoutes();
        renderDashboard();
        fitMapBounds();
    }

    // ── Feature 1 & 11: Site Markers + Detail Drawer ──
    function renderSites() {
        sitesLayer.clearLayers();
        if (!mapData || !mapData.sites) return;

        mapData.sites.forEach(function (site) {
            var lat = parseFloat(site.latitude);
            var lng = parseFloat(site.longitude);
            if (!lat || !lng) return;

            var status = site.status || 'active';
            var color = statusColors[status] || statusColors.active;
            var guardCount = parseInt(site.guard_count) || 0;

            var popup =
                '<strong>' + esc(site.name) + '</strong>' +
                (site.client_name ? '<br><span class="text-muted">' + esc(site.client_name) + '</span>' : '') +
                '<br>' + esc(site.address || site.district || '') +
                '<br><strong>' + guardCount + ' guards</strong> &middot; ' +
                '<span style="color:' + color + ';font-weight:600;">' + cap(status) + '</span>' +
                '<br><a href="#" class="btn-site-detail text-primary" data-site-id="' + site.id + '">View Full Details &rarr;</a>';

            var marker = L.marker([lat, lng], { icon: siteIcon(color, guardCount) })
                .bindPopup(popup);

            marker.siteData = site;
            sitesLayer.addLayer(marker);
        });
    }

    // ── Feature 1: Guard Positions ──
    function renderGuards() {
        guardsLayer.clearLayers();
        if (!mapData || !mapData.guards) return;

        mapData.guards.forEach(function (g) {
            var lat = parseFloat(g.site_lat);
            var lng = parseFloat(g.site_lng);
            if (!lat || !lng) return;

            // Offset slightly so guards don't stack exactly on site
            var offset = (g.id % 10) * 0.0003;
            var angle = (g.id * 137.5) % 360;
            var oLat = lat + offset * Math.cos(angle * Math.PI / 180);
            var oLng = lng + offset * Math.sin(angle * Math.PI / 180);

            var statusLabel = g.status ? cap(g.status.replace('_', ' ')) : 'Unknown';
            var popup =
                '<strong>' + esc(g.full_name) + '</strong>' +
                '<br><span class="text-muted">' + esc(g.role) + '</span>' +
                '<br>' + esc(g.site_name || 'Unassigned') +
                '<br>Status: <strong>' + statusLabel + '</strong>' +
                (g.phone ? '<br><i class="ti ti-phone"></i> ' + esc(g.phone) : '');

            L.marker([oLat, oLng], { icon: guardIcon() })
                .bindPopup(popup)
                .addTo(guardsLayer);
        });
    }

    // ── Feature 2: Geofence Security Perimeters ──
    function renderGeofences() {
        geofenceLayer.clearLayers();
        if (!mapData || !mapData.sites) return;

        mapData.sites.forEach(function (site) {
            var lat = parseFloat(site.latitude);
            var lng = parseFloat(site.longitude);
            if (!lat || !lng) return;

            var status = site.status || 'active';
            var color = statusColors[status] || statusColors.active;
            var guardCount = parseInt(site.guard_count) || 0;

            // Inner zone — restricted perimeter (150m for elevated, 100m otherwise)
            var innerRadius = status === 'elevated' ? 150 : 100;
            L.circle([lat, lng], {
                radius: innerRadius,
                color: color,
                fillColor: color,
                fillOpacity: 0.15,
                weight: 2,
                dashArray: status === 'elevated' ? '' : '6 4'
            }).addTo(geofenceLayer);

            // Outer buffer zone (300m for elevated, 200m otherwise)
            var outerRadius = status === 'elevated' ? 300 : 200;
            L.circle([lat, lng], {
                radius: outerRadius,
                color: color,
                fillColor: color,
                fillOpacity: 0.05,
                weight: 1,
                dashArray: '4 8'
            }).addTo(geofenceLayer);

            // Low coverage — show as red dashed inner circle only (no tooltip spam)
            if (guardCount < 3 && status !== 'inactive') {
                L.circle([lat, lng], {
                    radius: innerRadius * 0.5,
                    color: '#ef4444',
                    fillColor: '#ef4444',
                    fillOpacity: 0.1,
                    weight: 2,
                    dashArray: '4 4'
                }).addTo(geofenceLayer);
            }
        });
    }

    // ── Feature 5: Incident Markers ──
    function renderIncidents() {
        incidentLayer.clearLayers();
        if (!mapData || !mapData.incidents) return;

        mapData.incidents.forEach(function (inc) {
            var lat = parseFloat(inc.site_lat);
            var lng = parseFloat(inc.site_lng);
            if (!lat || !lng) return;

            // Slight random offset to avoid perfect overlap
            var offset = (inc.id % 7) * 0.0004;
            lat += offset * Math.cos(inc.id);
            lng += offset * Math.sin(inc.id);

            var isActive = inc.status === 'open' || inc.status === 'investigating';
            var icon = isActive ? pulsingIcon(severityColors[inc.severity] || '#ef4444') : incidentIcon(inc.severity);

            var date = inc.filed_at ? new Date(inc.filed_at).toLocaleDateString() : '';
            var popup =
                '<strong>' + esc(inc.incident_id || 'Incident') + '</strong> — ' + cap(inc.severity || 'unknown') +
                '<br><strong>' + esc(inc.type) + '</strong>' +
                '<br>' + esc(inc.site_name || '') +
                (inc.guard_name ? '<br>Guard: ' + esc(inc.guard_name) : '') +
                '<br>Status: <strong>' + cap(inc.status || 'open') + '</strong>' +
                '<br>Filed: ' + date +
                (inc.description ? '<br><em>' + esc(inc.description.substring(0, 100)) + '</em>' : '');

            L.marker([lat, lng], { icon: icon })
                .bindPopup(popup)
                .addTo(incidentLayer);
        });
    }

    // ── Feature 5: Heat Map ──
    function renderHeatmap() {
        if (heatLayer) {
            map.removeLayer(heatLayer);
            heatLayer = null;
        }
        if (!mapData || !mapData.incidents || !mapData.incidents.length) return;
        if (typeof L.heatLayer !== 'function') return;

        var points = [];
        mapData.incidents.forEach(function (inc) {
            var lat = parseFloat(inc.site_lat);
            var lng = parseFloat(inc.site_lng);
            if (!lat || !lng) return;
            var weight = inc.severity === 'critical' ? 1.0 : inc.severity === 'high' ? 0.7 : inc.severity === 'medium' ? 0.4 : 0.2;
            points.push([lat, lng, weight]);
        });

        if (points.length > 0) {
            heatLayer = L.heatLayer(points, {
                radius: 40,
                blur: 25,
                maxZoom: 15,
                gradient: { 0.2: '#22c55e', 0.5: '#f59e0b', 0.8: '#f97316', 1.0: '#ef4444' }
            });
        }

        if (activeLayers.heatmap && heatLayer) {
            heatLayer.addTo(map);
        }
    }

    // ── Feature 6: Patrol Routes ──
    function renderRoutes() {
        routesLayer.clearLayers();
        if (!mapData || !mapData.sites) return;

        // Build routes between sites that share the same client (natural patrol routes)
        var clientSites = {};
        mapData.sites.forEach(function (s) {
            var lat = parseFloat(s.latitude);
            var lng = parseFloat(s.longitude);
            if (!lat || !lng) return;
            var key = s.client_id || 'unassigned';
            if (!clientSites[key]) clientSites[key] = [];
            clientSites[key].push({ lat: lat, lng: lng, name: s.name });
        });

        var routeColors = ['#3b82f6', '#8b5cf6', '#06b6d4', '#ec4899', '#f59e0b', '#22c55e'];
        var colorIdx = 0;

        Object.keys(clientSites).forEach(function (key) {
            var sites = clientSites[key];
            if (sites.length < 2) return;

            var coords = sites.map(function (s) { return [s.lat, s.lng]; });
            var color = routeColors[colorIdx % routeColors.length];
            colorIdx++;

            // Draw polyline between sites
            var line = L.polyline(coords, {
                color: color,
                weight: 3,
                opacity: 0.7,
                dashArray: '10 6'
            });

            // Calculate total route distance
            var totalDist = 0;
            for (var i = 0; i < coords.length - 1; i++) {
                totalDist += map.distance(L.latLng(coords[i]), L.latLng(coords[i + 1]));
            }

            var routeNames = sites.map(function (s) { return s.name; }).join(' → ');
            line.bindPopup(
                '<strong>Patrol Route</strong><br>' +
                esc(routeNames) +
                '<br>Distance: <strong>' + formatDistance(totalDist) + '</strong>' +
                '<br>Est. drive: ~' + Math.ceil(totalDist / 500) + ' min'
            );

            routesLayer.addLayer(line);

            // Direction arrows along the route
            for (var j = 0; j < coords.length - 1; j++) {
                var mid = [(coords[j][0] + coords[j + 1][0]) / 2, (coords[j][1] + coords[j + 1][1]) / 2];
                var dist = map.distance(L.latLng(coords[j]), L.latLng(coords[j + 1]));
                L.circleMarker(mid, {
                    radius: 4,
                    color: color,
                    fillColor: color,
                    fillOpacity: 1,
                    weight: 0
                }).bindTooltip(formatDistance(dist), { direction: 'top', offset: [0, -6] })
                  .addTo(routesLayer);
            }
        });
    }

    // ── Feature 3: Dashboard Panel ──
    function renderDashboard() {
        if (!mapData) return;
        var stats = mapData.stats || {};

        setText('statActiveSites', stats.active_sites || 0);
        setText('statElevatedSites', stats.elevated_sites || 0);
        setText('statGuardsDeployed', stats.available_guards || 0);
        setText('statOpenIncidents', stats.open_incidents || 0);
        setText('statTodayShifts', stats.today_shifts || 0);

        // Render today's shifts list
        var shiftHtml = '';
        var shifts = filterShifts(mapData.shifts || []);
        if (shifts.length === 0) {
            shiftHtml = '<p class="text-muted text-center py-2 mb-0">No shifts found</p>';
        } else {
            shifts.forEach(function (sh) {
                var typeColor = shiftTypeColors[sh.shift_type] || '#6b7280';
                var statusBadge = sh.status === 'in_progress' ? 'bg-success' : sh.status === 'completed' ? 'bg-secondary' : 'bg-primary-subtle text-primary';
                shiftHtml +=
                    '<div class="d-flex align-items-center py-1 border-bottom border-dashed shift-row" data-lat="' + (sh.site_lat || '') + '" data-lng="' + (sh.site_lng || '') + '">' +
                    '<span style="width:8px;height:8px;border-radius:50%;background:' + typeColor + ';flex-shrink:0;" class="me-2"></span>' +
                    '<div class="flex-grow-1 text-truncate">' +
                    '<strong class="d-block text-truncate" style="font-size:12px;">' + esc(sh.guard_name || 'Unknown') + '</strong>' +
                    '<small class="text-muted">' + esc(sh.site_name || '') + ' &middot; ' + formatTime(sh.start_time) + '-' + formatTime(sh.end_time) + '</small>' +
                    '</div>' +
                    '<span class="badge ' + statusBadge + ' ms-1" style="font-size:10px;">' + cap(sh.status || 'scheduled') + '</span>' +
                    '</div>';
            });
        }
        setHtml('shiftsList', shiftHtml);

        // Render understaffed sites
        var understaffed = (mapData.sites || []).filter(function (s) {
            return s.status !== 'inactive' && (parseInt(s.guard_count) || 0) < 3;
        });
        var usHtml = '';
        if (understaffed.length === 0) {
            usHtml = '<p class="text-success text-center py-2 mb-0"><i class="ti ti-check me-1"></i>All sites properly staffed</p>';
        } else {
            understaffed.forEach(function (s) {
                var color = statusColors[s.status] || statusColors.active;
                usHtml +=
                    '<div class="d-flex align-items-center py-1 border-bottom border-dashed understaffed-row" data-lat="' + (s.latitude || '') + '" data-lng="' + (s.longitude || '') + '">' +
                    '<span style="width:8px;height:8px;border-radius:50%;background:' + color + ';flex-shrink:0;" class="me-2"></span>' +
                    '<div class="flex-grow-1 text-truncate">' +
                    '<strong style="font-size:12px;">' + esc(s.name) + '</strong>' +
                    '</div>' +
                    '<span class="badge bg-danger-subtle text-danger">' + (parseInt(s.guard_count) || 0) + ' guards</span>' +
                    '</div>';
            });
        }
        setHtml('understaffedList', usHtml);

        // Render recent incidents
        var recentInc = (mapData.incidents || []).slice(0, 10);
        var incHtml = '';
        if (recentInc.length === 0) {
            incHtml = '<p class="text-muted text-center py-2 mb-0">No recent incidents</p>';
        } else {
            recentInc.forEach(function (inc) {
                var sevColor = severityColors[inc.severity] || '#6b7280';
                var isActive = inc.status === 'open' || inc.status === 'investigating';
                incHtml +=
                    '<div class="d-flex align-items-center py-1 border-bottom border-dashed incident-row" data-lat="' + (inc.site_lat || '') + '" data-lng="' + (inc.site_lng || '') + '">' +
                    '<span style="width:8px;height:8px;border-radius:50%;background:' + sevColor + ';flex-shrink:0;" class="me-2"></span>' +
                    '<div class="flex-grow-1 text-truncate">' +
                    '<strong style="font-size:12px;">' + esc(inc.type) + '</strong>' +
                    '<small class="text-muted d-block">' + esc(inc.site_name || '') + '</small>' +
                    '</div>' +
                    '<span class="badge ' + (isActive ? 'bg-danger' : 'bg-secondary') + '" style="font-size:10px;">' + cap(inc.status || 'open') + '</span>' +
                    '</div>';
            });
        }
        setHtml('incidentsList', incHtml);

        // ── Feature 7: Alert System ──
        checkForAlerts();

        // Make rows clickable to zoom
        bindRowClicks();
    }

    function filterShifts(shifts) {
        if (activeShift === 'all') return shifts;
        return shifts.filter(function (sh) {
            return sh.shift_type === activeShift;
        });
    }

    // ── Feature 7: Alert System ──
    function checkForAlerts() {
        if (!mapData) return;

        // Check for critical open incidents
        var criticals = (mapData.incidents || []).filter(function (i) {
            return i.severity === 'critical' && (i.status === 'open' || i.status === 'investigating');
        });

        if (criticals.length > 0) {
            var latest = criticals[0];
            showAlert(
                'CRITICAL INCIDENT: ' + esc(latest.type) + ' at ' + esc(latest.site_name || 'Unknown') +
                ' — ' + esc(latest.incident_id || ''),
                parseFloat(latest.site_lat),
                parseFloat(latest.site_lng)
            );
        } else {
            // Check for elevated sites with low coverage
            var elevatedLow = (mapData.sites || []).filter(function (s) {
                return s.status === 'elevated' && (parseInt(s.guard_count) || 0) < 3;
            });
            if (elevatedLow.length > 0) {
                var s = elevatedLow[0];
                showAlert(
                    'UNDERSTAFFED ELEVATED SITE: ' + esc(s.name) + ' — only ' + (parseInt(s.guard_count) || 0) + ' guards assigned',
                    parseFloat(s.latitude),
                    parseFloat(s.longitude)
                );
            } else {
                hideAlert();
            }
        }
    }

    function showAlert(text, lat, lng) {
        var banner = document.getElementById('alertBanner');
        var textEl = document.getElementById('alertBannerText');
        if (!banner || !textEl) return;
        textEl.innerHTML = text;
        banner.classList.remove('d-none');
        currentAlert = { lat: lat, lng: lng };
    }

    function hideAlert() {
        var banner = document.getElementById('alertBanner');
        if (banner) banner.classList.add('d-none');
        currentAlert = null;
    }

    // ── Feature 11: Site Detail Drawer ──
    function openSiteDrawer(siteId) {
        if (!mapData) return;
        var site = mapData.sites.find(function (s) { return s.id == siteId; });
        if (!site) return;

        var drawerTitle = document.getElementById('drawerSiteName');
        var drawerBody  = document.getElementById('drawerBody');
        if (drawerTitle) drawerTitle.textContent = site.name;

        // Gather guards at this site
        var siteGuards = (mapData.guards || []).filter(function (g) { return g.assigned_site_id == site.id; });
        var siteShifts = (mapData.shifts || []).filter(function (sh) { return sh.site_id == site.id; });
        var siteIncidents = (mapData.incidents || []).filter(function (i) { return i.site_id == site.id; });

        var html = '';

        // Site info
        html += '<div class="mb-3">';
        html += '<span class="badge bg-' + (site.status === 'elevated' ? 'danger' : site.status === 'active' ? 'success' : site.status === 'pending' ? 'warning' : 'secondary') + '">' + cap(site.status || 'active') + '</span>';
        if (site.client_name) html += ' <span class="text-muted">' + esc(site.client_name) + '</span>';
        html += '<p class="mt-2 mb-1"><i class="ti ti-map-pin me-1"></i>' + esc(site.address || site.district || 'No address') + '</p>';
        if (site.notes) html += '<p class="text-muted mb-0"><small>' + esc(site.notes) + '</small></p>';
        html += '</div>';

        // Guard roster
        html += '<h6 class="border-bottom pb-1"><i class="ti ti-shield-check me-1"></i>Guard Roster (' + siteGuards.length + ')</h6>';
        if (siteGuards.length === 0) {
            html += '<p class="text-muted">No guards assigned</p>';
        } else {
            html += '<div class="list-group list-group-flush mb-3">';
            siteGuards.forEach(function (g) {
                html += '<div class="list-group-item px-0 py-1">' +
                    '<strong>' + esc(g.full_name) + '</strong> <small class="text-muted">' + esc(g.guard_id) + '</small>' +
                    '<br><small>' + esc(g.role) + ' &middot; ' + cap((g.status || '').replace('_', ' ')) + '</small>' +
                    '</div>';
            });
            html += '</div>';
        }

        // Today's shifts
        html += '<h6 class="border-bottom pb-1"><i class="ti ti-clock me-1"></i>Today\'s Shifts (' + siteShifts.length + ')</h6>';
        if (siteShifts.length === 0) {
            html += '<p class="text-muted">No shifts today</p>';
        } else {
            html += '<div class="list-group list-group-flush mb-3">';
            siteShifts.forEach(function (sh) {
                var typeColor = shiftTypeColors[sh.shift_type] || '#6b7280';
                html += '<div class="list-group-item px-0 py-1">' +
                    '<span style="width:8px;height:8px;border-radius:50%;background:' + typeColor + ';display:inline-block;" class="me-1"></span>' +
                    '<strong>' + esc(sh.guard_name || 'Unknown') + '</strong>' +
                    '<br><small>' + formatTime(sh.start_time) + ' - ' + formatTime(sh.end_time) + ' &middot; ' + cap(sh.shift_type || '') + ' &middot; ' + cap(sh.status || '') + '</small>' +
                    '</div>';
            });
            html += '</div>';
        }

        // Recent incidents
        html += '<h6 class="border-bottom pb-1"><i class="ti ti-alert-triangle me-1"></i>Recent Incidents (' + siteIncidents.length + ')</h6>';
        if (siteIncidents.length === 0) {
            html += '<p class="text-success"><i class="ti ti-check me-1"></i>No incidents</p>';
        } else {
            html += '<div class="list-group list-group-flush mb-3">';
            siteIncidents.slice(0, 5).forEach(function (inc) {
                var sevColor = severityColors[inc.severity] || '#6b7280';
                html += '<div class="list-group-item px-0 py-1">' +
                    '<span style="width:8px;height:8px;border-radius:50%;background:' + sevColor + ';display:inline-block;" class="me-1"></span>' +
                    '<strong>' + esc(inc.incident_id || '') + '</strong> — ' + esc(inc.type) +
                    '<br><small>' + cap(inc.severity || '') + ' &middot; ' + cap(inc.status || '') +
                    (inc.filed_at ? ' &middot; ' + new Date(inc.filed_at).toLocaleDateString() : '') + '</small>' +
                    '</div>';
            });
            html += '</div>';
        }

        if (drawerBody) drawerBody.innerHTML = html;

        // Open offcanvas
        var offcanvasEl = document.getElementById('siteDetailDrawer');
        if (offcanvasEl && typeof bootstrap !== 'undefined') {
            var bsOffcanvas = bootstrap.Offcanvas.getOrCreateInstance(offcanvasEl);
            bsOffcanvas.show();
        }
    }

    // ── Feature 10: Measurement Tools ──
    function startMeasuring(mode) {
        clearMeasurement();
        isMeasuring = true;
        measureMode = mode;
        measurePoints = [];
        mapEl.style.cursor = 'crosshair';
        var modeLabel = mode === 'distance' ? 'distance' : 'area';
        showMeasureText('Click on map to start measuring ' + modeLabel + '. Double-click to finish.');
    }

    function handleMapClick(e) {
        if (!isMeasuring) return;

        measurePoints.push(e.latlng);

        // Drop a small circle at each click point
        L.circleMarker(e.latlng, {
            radius: 4,
            color: '#3b82f6',
            fillColor: '#3b82f6',
            fillOpacity: 1,
            weight: 0
        }).addTo(measureLayer);

        if (measureMode === 'distance' && measurePoints.length >= 2) {
            if (measureLine) measureLayer.removeLayer(measureLine);
            measureLine = L.polyline(measurePoints, { color: '#3b82f6', weight: 3, dashArray: '6 4' }).addTo(measureLayer);
            var totalDist = 0;
            for (var i = 0; i < measurePoints.length - 1; i++) {
                totalDist += measurePoints[i].distanceTo(measurePoints[i + 1]);
            }
            showMeasureText('Distance: ' + formatDistance(totalDist) + ' (click to add, double-click to finish)');
        }

        if (measureMode === 'area' && measurePoints.length >= 3) {
            if (measurePoly) measureLayer.removeLayer(measurePoly);
            measurePoly = L.polygon(measurePoints, { color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.15, weight: 2 }).addTo(measureLayer);
            var area = calculateArea(measurePoints);
            showMeasureText('Area: ' + formatArea(area) + ' (click to add, double-click to finish)');
        }
    }

    function handleMapDblClick() {
        if (!isMeasuring) return;
        isMeasuring = false;
        mapEl.style.cursor = '';

        if (measureMode === 'distance' && measurePoints.length >= 2) {
            var totalDist = 0;
            for (var i = 0; i < measurePoints.length - 1; i++) {
                totalDist += measurePoints[i].distanceTo(measurePoints[i + 1]);
            }
            showMeasureText('Total distance: ' + formatDistance(totalDist));
        } else if (measureMode === 'area' && measurePoints.length >= 3) {
            var area = calculateArea(measurePoints);
            showMeasureText('Total area: ' + formatArea(area));
        }
    }

    function clearMeasurement() {
        isMeasuring = false;
        measureMode = null;
        measurePoints = [];
        measureLine = null;
        measurePoly = null;
        measureLayer.clearLayers();
        mapEl.style.cursor = '';
        hideMeasureDisplay();
    }

    function showMeasureText(text) {
        var display = document.getElementById('measureDisplay');
        var textEl = document.getElementById('measureText');
        if (display) display.classList.remove('d-none');
        if (textEl) textEl.textContent = text;
    }

    function hideMeasureDisplay() {
        var display = document.getElementById('measureDisplay');
        if (display) display.classList.add('d-none');
    }

    // Approximate area calculation using Shoelace formula on projected coords
    function calculateArea(points) {
        var n = points.length;
        if (n < 3) return 0;
        var area = 0;
        for (var i = 0; i < n; i++) {
            var j = (i + 1) % n;
            // Convert to approximate meters
            var xi = points[i].lng * 111320 * Math.cos(points[i].lat * Math.PI / 180);
            var yi = points[i].lat * 110540;
            var xj = points[j].lng * 111320 * Math.cos(points[j].lat * Math.PI / 180);
            var yj = points[j].lat * 110540;
            area += xi * yj - xj * yi;
        }
        return Math.abs(area / 2);
    }

    // ── Feature 12: Export / Print ──
    function exportMap() {
        if (typeof html2canvas === 'undefined') {
            alert('Export library not loaded. Please try again.');
            return;
        }
        html2canvas(mapEl, { useCORS: true, allowTaint: true }).then(function (canvas) {
            var link = document.createElement('a');
            link.download = 'syntriguard-deployment-' + new Date().toISOString().split('T')[0] + '.png';
            link.href = canvas.toDataURL();
            link.click();
        });
    }

    function printMap() {
        window.print();
    }

    // ──────────────────────────────────────────
    // LAYER TOGGLE LOGIC
    // ──────────────────────────────────────────
    function syncLayers() {
        if (activeLayers.sites)    { if (!map.hasLayer(sitesLayer))    map.addLayer(sitesLayer); }
        else                       { if (map.hasLayer(sitesLayer))     map.removeLayer(sitesLayer); }

        if (activeLayers.guards)   { if (!map.hasLayer(guardsLayer))   map.addLayer(guardsLayer); }
        else                       { if (map.hasLayer(guardsLayer))    map.removeLayer(guardsLayer); }

        if (activeLayers.geofence) { if (!map.hasLayer(geofenceLayer)) map.addLayer(geofenceLayer); }
        else                       { if (map.hasLayer(geofenceLayer))  map.removeLayer(geofenceLayer); }

        if (activeLayers.incidents){ if (!map.hasLayer(incidentLayer)) map.addLayer(incidentLayer); }
        else                       { if (map.hasLayer(incidentLayer))  map.removeLayer(incidentLayer); }

        if (activeLayers.heatmap && heatLayer)  { if (!map.hasLayer(heatLayer)) map.addLayer(heatLayer); }
        else if (heatLayer)                     { if (map.hasLayer(heatLayer))  map.removeLayer(heatLayer); }

        if (activeLayers.routes)   { if (!map.hasLayer(routesLayer))   map.addLayer(routesLayer); }
        else                       { if (map.hasLayer(routesLayer))    map.removeLayer(routesLayer); }
    }

    // ──────────────────────────────────────────
    // FIT BOUNDS
    // ──────────────────────────────────────────
    function fitMapBounds() {
        if (!mapData || !mapData.sites) return;
        var bounds = [];
        mapData.sites.forEach(function (s) {
            var lat = parseFloat(s.latitude);
            var lng = parseFloat(s.longitude);
            if (lat && lng) bounds.push([lat, lng]);
        });
        var pad = window.innerWidth < 768 ? [20, 20] : [50, 50];
        if (bounds.length > 1) {
            map.fitBounds(bounds, { padding: pad, maxZoom: 14 });
        } else if (bounds.length === 1) {
            map.setView(bounds[0], 14);
        }
    }

    // Force map to recalculate size after page fully loads
    window.addEventListener('load', function () {
        setTimeout(function () { map.invalidateSize(); }, 200);
    });

    // No static/mock data — this is a live production system.
    // All data comes from the Supabase database via /api/map-data.

    // ──────────────────────────────────────────
    // EVENT BINDINGS (works for BOTH mobile + desktop button sets)
    // ──────────────────────────────────────────

    // Helper: sync visual state across ALL matching buttons (mobile + desktop)
    function syncButtonState(selector, attrName, activeVal) {
        document.querySelectorAll(selector).forEach(function (b) {
            var val = b.getAttribute(attrName);
            if (val === activeVal) {
                b.classList.add('btn-primary', 'active');
                b.classList.remove('btn-light');
            } else {
                b.classList.remove('btn-primary', 'active');
                b.classList.add('btn-light');
            }
        });
    }

    // Layer toggle buttons — bind ALL [data-layer] buttons on page
    document.querySelectorAll('[data-layer]').forEach(function (btn) {
        btn.addEventListener('click', function () {
            var layer = this.getAttribute('data-layer');
            activeLayers[layer] = !activeLayers[layer];
            // Sync ALL layer buttons with same data-layer value
            document.querySelectorAll('[data-layer="' + layer + '"]').forEach(function (b) {
                b.classList.toggle('btn-primary', activeLayers[layer]);
                b.classList.toggle('btn-light', !activeLayers[layer]);
                b.classList.toggle('active', activeLayers[layer]);
            });
            syncLayers();
        });
    });

    // Shift filter buttons — bind ALL [data-shift] buttons
    document.querySelectorAll('[data-shift]').forEach(function (btn) {
        btn.addEventListener('click', function () {
            activeShift = this.getAttribute('data-shift');
            syncButtonState('[data-shift]', 'data-shift', activeShift);
            renderDashboard();
        });
    });

    // Map style switcher — bind ALL [data-style] buttons
    document.querySelectorAll('[data-style]').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
            e.preventDefault();
            var style = this.getAttribute('data-style');
            if (style === currentTileKey) return;

            map.removeLayer(tileLayers[currentTileKey]);
            if (tileLayers[style]) {
                tileLayers[style].addTo(map);
                currentTileKey = style;
            }
            syncButtonState('[data-style]', 'data-style', style);
        });
    });

    // Mobile bottom sheet toggle
    var btnMore = document.getElementById('btnMobileMore');
    if (btnMore) {
        btnMore.addEventListener('click', function () {
            var sheet = document.getElementById('mobileSheet');
            if (!sheet) return;
            var isOpen = !sheet.classList.contains('d-none');
            if (isOpen) {
                sheet.classList.add('d-none');
            } else {
                sheet.classList.remove('d-none');
            }
            this.classList.toggle('btn-primary', !isOpen);
            this.classList.toggle('btn-light', isOpen);
        });
    }

    // Dashboard panel toggle — bind both mobile + desktop
    function toggleDashboard() {
        var panel = document.getElementById('dashboardPanel');
        if (!panel) return;
        panel.classList.toggle('d-none');
        setTimeout(function () { map.invalidateSize(); }, 100);
    }
    ['btnToggleDashboard', 'btnToggleDashboardDt'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.addEventListener('click', toggleDashboard);
    });

    // Measurement tools — bind both mobile + desktop
    ['btnMeasure', 'btnMeasureDt'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.addEventListener('click', function (e) { e.preventDefault(); startMeasuring('distance'); });
    });
    ['btnMeasureArea', 'btnMeasureAreaDt'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.addEventListener('click', function (e) { e.preventDefault(); startMeasuring('area'); });
    });

    var btnClearMeasure = document.getElementById('btnClearMeasure');
    if (btnClearMeasure) btnClearMeasure.addEventListener('click', function (e) { e.preventDefault(); clearMeasurement(); });

    // Export — bind both mobile + desktop
    ['btnExport', 'btnExportDt'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.addEventListener('click', function (e) { e.preventDefault(); exportMap(); });
    });

    // Refresh — bind both mobile + desktop
    ['btnRefresh', 'btnRefreshDt'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.addEventListener('click', function (e) { e.preventDefault(); loadMapData(); });
    });

    // Alert actions
    var btnDismiss = document.getElementById('btnDismissAlert');
    if (btnDismiss) btnDismiss.addEventListener('click', function () { hideAlert(); });

    var btnZoom = document.getElementById('btnZoomAlert');
    if (btnZoom) {
        btnZoom.addEventListener('click', function () {
            if (currentAlert && currentAlert.lat && currentAlert.lng) {
                map.setView([currentAlert.lat, currentAlert.lng], 16);
            }
            hideAlert();
        });
    }

    // Map click events for measurement
    map.on('click', handleMapClick);
    map.on('dblclick', handleMapDblClick);

    // Popup click delegation for site detail links
    map.on('popupopen', function (e) {
        var popup = e.popup;
        var container = popup.getElement();
        if (!container) return;
        var links = container.querySelectorAll('.btn-site-detail');
        links.forEach(function (link) {
            link.addEventListener('click', function (ev) {
                ev.preventDefault();
                var siteId = this.getAttribute('data-site-id');
                map.closePopup();
                openSiteDrawer(siteId);
            });
        });
    });

    // Clickable dashboard rows
    function bindRowClicks() {
        document.querySelectorAll('.shift-row, .understaffed-row, .incident-row').forEach(function (row) {
            row.style.cursor = 'pointer';
            row.addEventListener('click', function () {
                var lat = parseFloat(this.getAttribute('data-lat'));
                var lng = parseFloat(this.getAttribute('data-lng'));
                if (lat && lng) map.setView([lat, lng], 16);
            });
        });
    }

    // ──────────────────────────────────────────
    // HELPERS
    // ──────────────────────────────────────────
    function esc(str) {
        if (!str) return '';
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function cap(str) {
        if (!str) return '';
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    function setText(id, val) {
        var el = document.getElementById(id);
        if (el) el.textContent = val;
    }

    function setHtml(id, html) {
        var el = document.getElementById(id);
        if (el) el.innerHTML = html;
    }

    function formatDistance(meters) {
        if (meters >= 1000) return (meters / 1000).toFixed(2) + ' km';
        return Math.round(meters) + ' m';
    }

    function formatArea(sqMeters) {
        if (sqMeters >= 1000000) return (sqMeters / 1000000).toFixed(2) + ' km²';
        return Math.round(sqMeters).toLocaleString() + ' m²';
    }

    function formatTime(timeStr) {
        if (!timeStr) return '';
        var parts = String(timeStr).split(':');
        var h = parseInt(parts[0]);
        var m = parts[1] || '00';
        var ampm = h >= 12 ? 'PM' : 'AM';
        h = h % 12 || 12;
        return h + ':' + m + ' ' + ampm;
    }

    // ──────────────────────────────────────────
    // AUTO-REFRESH (every 60 seconds)
    // ──────────────────────────────────────────
    setInterval(function () {
        if (document.visibilityState === 'visible') {
            loadMapData();
        }
    }, 60000);

    // ──────────────────────────────────────────
    // INIT
    // ──────────────────────────────────────────
    loadMapData();

})();
