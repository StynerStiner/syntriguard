/**
 * SyntriGuard Shift Scheduler
 * Fetches shifts from /api/shifts, saves changes back to database.
 * Uses existing Arclon calendar template — no style changes.
 */

// Map shift_type to calendar CSS class (existing Bootstrap classes)
function shiftTypeToClass(type) {
    switch (type) {
        case 'morning': return 'bg-success';
        case 'afternoon': return 'bg-primary';
        case 'overnight': return 'bg-danger';
        case 'training': return 'bg-warning';
        case 'on_call': return 'bg-info';
        case 'critical': return 'bg-danger';
        default: return 'bg-secondary';
    }
}

function classToShiftType(cls) {
    if (cls.includes('success')) return 'morning';
    if (cls.includes('primary')) return 'afternoon';
    if (cls.includes('danger')) return 'overnight';
    if (cls.includes('warning')) return 'training';
    if (cls.includes('info')) return 'overnight';
    if (cls.includes('dark')) return 'training';
    if (cls.includes('secondary')) return 'on_call';
    return 'morning';
}

class CalendarSchedule {

    constructor() {
        this.body = document.body;
        this.modal = new bootstrap.Modal(document.getElementById('event-modal'), { backdrop: 'static' });
        this.calendar = document.getElementById('calendar');
        this.formEvent = document.getElementById('forms-event');
        this.btnNewEvent = document.getElementById('btn-new-event');
        this.btnDeleteEvent = document.getElementById('btn-delete-event');
        this.btnSaveEvent = document.getElementById('btn-save-event');
        this.modalTitle = document.getElementById('modal-title');
        this.calendarObj = null;
        this.selectedEvent = null;
        this.newEventData = null;
        this.shiftsMap = {}; // maps calendar event ID to database shift ID
        this.guardsCache = null;
        this.sitesCache = null;
    }

    /* ── Fetch guards & sites for dropdowns ── */

    async loadGuards() {
        if (this.guardsCache) return this.guardsCache;
        try {
            const resp = await fetch('/api/guards', {
                headers: { 'Authorization': 'Bearer ' + (localStorage.getItem('sg_token') || '') }
            });
            if (!resp.ok) throw new Error('Failed to load guards');
            this.guardsCache = await resp.json();
            return this.guardsCache;
        } catch (err) {
            console.error('loadGuards error:', err);
            return [];
        }
    }

    async loadSites() {
        if (this.sitesCache) return this.sitesCache;
        try {
            const resp = await fetch('/api/sites', {
                headers: { 'Authorization': 'Bearer ' + (localStorage.getItem('sg_token') || '') }
            });
            if (!resp.ok) throw new Error('Failed to load sites');
            this.sitesCache = await resp.json();
            return this.sitesCache;
        } catch (err) {
            console.error('loadSites error:', err);
            return [];
        }
    }

    async populateDropdowns() {
        var guards = await this.loadGuards();
        var sites = await this.loadSites();

        var guardSelect = document.getElementById('shift-guard');
        var siteSelect = document.getElementById('shift-site');

        // Clear existing options (keep the first placeholder)
        guardSelect.innerHTML = '<option value="">Select Guard</option>';
        siteSelect.innerHTML = '<option value="">Select Site</option>';

        guards.forEach(function(g) {
            var opt = document.createElement('option');
            opt.value = g.id;
            opt.textContent = g.full_name;
            guardSelect.appendChild(opt);
        });

        sites.forEach(function(s) {
            var opt = document.createElement('option');
            opt.value = s.id;
            opt.textContent = s.name;
            siteSelect.appendChild(opt);
        });
    }

    /* ── Auto-generate shift title from guard + site ── */

    getSelectedGuardName() {
        var sel = document.getElementById('shift-guard');
        return sel.options[sel.selectedIndex]?.textContent || 'Unassigned';
    }

    getSelectedSiteName() {
        var sel = document.getElementById('shift-site');
        return sel.options[sel.selectedIndex]?.textContent || 'No site';
    }

    generateTitle() {
        return this.getSelectedGuardName() + ' \u2014 ' + this.getSelectedSiteName();
    }

    /* ── Event handlers ── */

    async onEventClick(info) {
        this.formEvent?.reset();
        this.formEvent.classList.remove('was-validated');
        this.newEventData = null;
        this.btnDeleteEvent.style.display = "block";
        this.modalTitle.textContent = 'Edit Shift';

        await this.populateDropdowns();
        this.modal.show();
        this.selectedEvent = info.event;

        var props = this.selectedEvent.extendedProps || {};

        // Pre-populate dropdowns with current values
        document.getElementById('shift-guard').value = props.guardId || '';
        document.getElementById('shift-site').value = props.siteId || '';
        document.getElementById('event-category').value = (this.selectedEvent.classNames[0]) || 'bg-secondary';

        // Pre-populate date and times
        if (this.selectedEvent.start) {
            document.getElementById('shift-date').value = this.selectedEvent.start.toISOString().split('T')[0];
            document.getElementById('shift-start').value = this.selectedEvent.start.toTimeString().substring(0, 5);
        }
        if (this.selectedEvent.end) {
            document.getElementById('shift-end').value = this.selectedEvent.end.toTimeString().substring(0, 5);
        }

        // Pre-populate notes
        document.getElementById('shift-notes').value = props.notes || '';

        // Set hidden title
        document.getElementById('event-title').value = this.selectedEvent.title;
    }

    async onSelect(info) {
        this.formEvent?.reset();
        this.formEvent?.classList.remove('was-validated');
        this.selectedEvent = null;
        this.newEventData = info;
        this.btnDeleteEvent.style.display = "none";
        this.modalTitle.textContent = 'Add New Shift';

        await this.populateDropdowns();

        // Set the date from the clicked calendar cell
        var clickedDate = info.date || info.dateStr || new Date();
        if (clickedDate instanceof Date) {
            clickedDate = clickedDate.toISOString().split('T')[0];
        } else if (typeof clickedDate === 'string' && clickedDate.includes('T')) {
            clickedDate = clickedDate.split('T')[0];
        }
        document.getElementById('shift-date').value = clickedDate;

        // Set default times
        document.getElementById('shift-start').value = '06:00';
        document.getElementById('shift-end').value = '14:00';

        this.modal.show();
        if (this.calendarObj) this.calendarObj.unselect();
    }

    async loadShiftsFromAPI() {
        if (!SyntriGuard || !SyntriGuard.isLoggedIn()) return [];

        try {
            // Get shifts for a wide range (3 months)
            const today = new Date();
            const start = new Date(today.getFullYear(), today.getMonth() - 1, 1).toISOString().split('T')[0];
            const end = new Date(today.getFullYear(), today.getMonth() + 2, 0).toISOString().split('T')[0];

            const shifts = await SyntriGuard.getShifts(start, end);
            if (!shifts) return [];

            return shifts.map(function(s) {
                var startDateTime = s.shift_date.split('T')[0] + 'T' + (s.start_time || '06:00:00');
                var endDateTime = s.shift_date.split('T')[0] + 'T' + (s.end_time || '14:00:00');

                // Handle overnight shifts that end next day
                if (s.end_time && s.start_time && s.end_time < s.start_time) {
                    var nextDay = new Date(s.shift_date);
                    nextDay.setDate(nextDay.getDate() + 1);
                    endDateTime = nextDay.toISOString().split('T')[0] + 'T' + s.end_time;
                }

                var title = (s.guard_name || 'Unassigned') + ' \u2014 ' + (s.site_name || 'No site');
                var className = shiftTypeToClass(s.shift_type);

                return {
                    id: 'shift-' + s.id,
                    title: title,
                    start: startDateTime,
                    end: endDateTime,
                    className: className,
                    extendedProps: {
                        dbId: s.id,
                        guardId: s.guard_id,
                        siteId: s.site_id,
                        shiftType: s.shift_type,
                        status: s.status,
                        guardName: s.guard_name,
                        siteName: s.site_name,
                        notes: s.notes || ''
                    }
                };
            });
        } catch (err) {
            console.error('Failed to load shifts:', err);
            return [];
        }
    }

    async reloadCalendarEvents() {
        if (!this.calendarObj) return;
        // Remove all existing events
        var allEvents = this.calendarObj.getEvents();
        allEvents.forEach(function(ev) { ev.remove(); });

        // Reload from API
        var apiEvents = await this.loadShiftsFromAPI();
        apiEvents.forEach(function(ev) {
            this.calendarObj.addEvent(ev);
        }.bind(this));
    }

    async init() {
        var self = this;
        var externalEventContainerEl = document.getElementById('external-events');

        new FullCalendar.Draggable(externalEventContainerEl, {
            itemSelector: '.external-event',
            eventData: function (eventEl) {
                return {
                    title: eventEl.innerText,
                    classNames: eventEl.getAttribute('data-class')
                };
            }
        });

        // Load shifts from API
        var apiEvents = await this.loadShiftsFromAPI();

        // Pre-load guards and sites cache
        await Promise.all([this.loadGuards(), this.loadSites()]);

        // cal - init
        self.calendarObj = new FullCalendar.Calendar(self.calendar, {

            plugins: [],
            slotDuration: '00:30:00',
            slotMinTime: '05:00:00',
            slotMaxTime: '23:00:00',
            themeSystem: 'bootstrap',
            bootstrapFontAwesome: false,
            initialView: window.innerWidth < 768 ? 'listWeek' : 'dayGridMonth',
            handleWindowResize: true,
            height: window.innerWidth < 768 ? 'auto' : (window.innerHeight - 200),
            headerToolbar: {
                left: 'prev,next today',
                center: 'title',
                right: window.innerWidth < 768 ? 'listWeek,dayGridMonth' : 'dayGridMonth,timeGridWeek,timeGridDay,listMonth'
            },
            buttonText: {
                today: 'Today',
                month: 'Month',
                week: 'Week',
                day: 'Day',
                list: 'List',
                listWeek: 'List',
                listMonth: 'List',
                prev: '←',
                next: '→'
            },
            initialEvents: apiEvents,
            editable: true,
            droppable: true,
            selectable: true,
            dateClick: function (info) {
                self.onSelect(info);
            },
            eventClick: function (info) {
                self.onEventClick(info);
            },
            // When an event is dropped from external list or moved on calendar
            eventDrop: async function(info) {
                var dbId = info.event.extendedProps?.dbId;
                if (dbId && SyntriGuard && SyntriGuard.isLoggedIn()) {
                    try {
                        var newDate = info.event.start.toISOString().split('T')[0];
                        var startTime = info.event.start.toTimeString().substring(0, 5);
                        var endTime = info.event.end ? info.event.end.toTimeString().substring(0, 5) : startTime;

                        await SyntriGuard.updateShift(dbId, {
                            shift_date: newDate,
                            start_time: startTime,
                            end_time: endTime,
                            reason: 'Rescheduled via calendar drag'
                        });
                    } catch (err) {
                        console.error('Failed to update shift:', err);
                        info.revert();
                    }
                }
            },
            // When an event is resized
            eventResize: async function(info) {
                var dbId = info.event.extendedProps?.dbId;
                if (dbId && SyntriGuard && SyntriGuard.isLoggedIn()) {
                    try {
                        var startTime = info.event.start.toTimeString().substring(0, 5);
                        var endTime = info.event.end ? info.event.end.toTimeString().substring(0, 5) : startTime;

                        await SyntriGuard.updateShift(dbId, {
                            start_time: startTime,
                            end_time: endTime,
                            reason: 'Time adjusted via calendar resize'
                        });
                    } catch (err) {
                        console.error('Failed to resize shift:', err);
                        info.revert();
                    }
                }
            }
        });

        self.calendarObj.render();

        // on new event button click
        self.btnNewEvent.addEventListener('click', function (e) {
            self.onSelect({
                date: new Date(),
                allDay: true
            });
        });

        // save event
        self.formEvent?.addEventListener('submit', async function (e) {
            e.preventDefault();
            var form = self.formEvent;

            if (form.checkValidity()) {
                var guardId = document.getElementById('shift-guard').value;
                var siteId = document.getElementById('shift-site').value;
                var category = document.getElementById('event-category').value;
                var shiftDate = document.getElementById('shift-date').value;
                var startTime = document.getElementById('shift-start').value;
                var endTime = document.getElementById('shift-end').value;
                var notes = document.getElementById('shift-notes').value;
                var shiftType = classToShiftType(category);

                // Auto-generate title
                var title = self.generateTitle();
                document.getElementById('event-title').value = title;

                if (self.selectedEvent) {
                    // ── Update existing shift ──
                    var dbId = self.selectedEvent.extendedProps?.dbId;

                    // Update the calendar event visually
                    self.selectedEvent.setProp('title', title);
                    self.selectedEvent.setProp('classNames', category);

                    if (dbId && SyntriGuard && SyntriGuard.isLoggedIn()) {
                        try {
                            await SyntriGuard.updateShift(dbId, {
                                guard_id: parseInt(guardId),
                                site_id: parseInt(siteId),
                                shift_date: shiftDate,
                                start_time: startTime,
                                end_time: endTime,
                                shift_type: shiftType,
                                notes: notes,
                                reason: 'Updated via calendar modal'
                            });
                            // Reload to get fresh data
                            await self.reloadCalendarEvents();
                        } catch (err) {
                            console.error('Failed to update shift:', err);
                        }
                    }
                } else {
                    // ── Create new shift ──

                    // Save to database if logged in
                    if (SyntriGuard && SyntriGuard.isLoggedIn()) {
                        try {
                            await SyntriGuard.createShift({
                                guard_id: parseInt(guardId),
                                site_id: parseInt(siteId),
                                shift_date: shiftDate,
                                start_time: startTime,
                                end_time: endTime,
                                shift_type: shiftType,
                                notes: notes
                            });
                            // Reload calendar to show the new event with DB data
                            await self.reloadCalendarEvents();
                        } catch (err) {
                            console.error('Failed to save shift:', err);
                            // Fallback: add event to calendar locally
                            var startDateTime = shiftDate + 'T' + startTime;
                            var endDateTime = shiftDate + 'T' + endTime;
                            self.calendarObj.addEvent({
                                title: title,
                                start: startDateTime,
                                end: endDateTime,
                                className: category
                            });
                        }
                    } else {
                        // Not logged in — just add locally
                        var startDate = self.newEventData?.date || new Date();
                        self.calendarObj.addEvent({
                            title: title,
                            start: startDate,
                            allDay: self.newEventData?.allDay || false,
                            className: category
                        });
                    }
                }
                self.modal.hide();
            } else {
                e.stopPropagation();
                form.classList.add('was-validated');
            }
        });

        // delete event
        self.btnDeleteEvent.addEventListener('click', async function (e) {
            if (self.selectedEvent) {
                var dbId = self.selectedEvent.extendedProps?.dbId;

                // Remove from calendar
                self.selectedEvent.remove();
                self.selectedEvent = null;
                self.modal.hide();

                // Delete from database
                if (dbId && SyntriGuard && SyntriGuard.isLoggedIn()) {
                    try {
                        await SyntriGuard.deleteShift(dbId);
                    } catch (err) {
                        console.error('Failed to delete shift:', err);
                    }
                }
            }
        });
        // Wire mobile Add Shift button
        var mobileBtn = document.getElementById('btn-new-event-mobile');
        if (mobileBtn) {
            mobileBtn.addEventListener('click', function () {
                self.onSelect({ date: new Date(), allDay: true });
            });
        }

        // ── Month/Year Jump Navigation (Bootstrap dropdowns) ──
        var monthBtn = document.getElementById('cal-month-btn');
        var yearBtn = document.getElementById('cal-year-btn');
        var monthMenu = document.getElementById('cal-month-menu');
        var yearMenu = document.getElementById('cal-year-menu');
        var monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
        var selectedMonth = new Date().getMonth();
        var selectedYear = new Date().getFullYear();

        // Build month dropdown items
        if (monthMenu) {
            monthNames.forEach(function (m, idx) {
                var a = document.createElement('a');
                a.className = 'dropdown-item';
                a.href = 'javascript:void(0);';
                a.textContent = m;
                a.setAttribute('data-month', idx);
                a.addEventListener('click', function () {
                    selectedMonth = idx;
                    self.calendarObj.gotoDate(new Date(selectedYear, selectedMonth, 1));
                    syncDropdowns();
                });
                monthMenu.appendChild(a);
            });
        }

        // Build year dropdown items
        if (yearMenu) {
            var currentYear = new Date().getFullYear();
            for (var y = currentYear - 2; y <= currentYear + 3; y++) {
                var a = document.createElement('a');
                a.className = 'dropdown-item';
                a.href = 'javascript:void(0);';
                a.textContent = y;
                a.setAttribute('data-year', y);
                (function (yr) {
                    a.addEventListener('click', function () {
                        selectedYear = yr;
                        self.calendarObj.gotoDate(new Date(selectedYear, selectedMonth, 1));
                        syncDropdowns();
                    });
                })(y);
                yearMenu.appendChild(a);
            }
        }

        function syncDropdowns() {
            if (!self.calendarObj) return;
            var d = self.calendarObj.getDate();
            selectedMonth = d.getMonth();
            selectedYear = d.getFullYear();
            if (monthBtn) monthBtn.textContent = monthNames[selectedMonth];
            if (yearBtn) yearBtn.textContent = selectedYear;

            // Highlight active items
            if (monthMenu) {
                monthMenu.querySelectorAll('.dropdown-item').forEach(function (item) {
                    item.classList.toggle('active', parseInt(item.getAttribute('data-month')) === selectedMonth);
                });
            }
            if (yearMenu) {
                yearMenu.querySelectorAll('.dropdown-item').forEach(function (item) {
                    item.classList.toggle('active', parseInt(item.getAttribute('data-year')) === selectedYear);
                });
            }
        }

        var prevBtn = document.getElementById('cal-prev-month');
        var nextBtn = document.getElementById('cal-next-month');
        var todayBtn = document.getElementById('cal-today-btn');

        if (prevBtn) prevBtn.addEventListener('click', function () {
            self.calendarObj.prev();
            syncDropdowns();
        });
        if (nextBtn) nextBtn.addEventListener('click', function () {
            self.calendarObj.next();
            syncDropdowns();
        });
        if (todayBtn) todayBtn.addEventListener('click', function () {
            self.calendarObj.today();
            syncDropdowns();
        });

        // Sync when FullCalendar's own nav is used
        self.calendarObj.on('datesSet', function () { syncDropdowns(); });
        syncDropdowns();

        // Populate today's shifts panel
        self.populateTodayShifts(apiEvents);
    }

    populateTodayShifts(events) {
        var todayList = document.getElementById('today-shifts-list');
        var countBadge = document.getElementById('today-shift-count');
        if (!todayList) return;

        var today = new Date().toISOString().split('T')[0];
        var todayShifts = events.filter(function (ev) {
            return ev.start && ev.start.startsWith(today);
        });

        if (countBadge) countBadge.textContent = todayShifts.length + ' shift' + (todayShifts.length !== 1 ? 's' : '');

        if (todayShifts.length === 0) {
            todayList.innerHTML = '<p class="text-muted fs-13 mb-0">No shifts scheduled today</p>';
            return;
        }

        var html = '';
        todayShifts.forEach(function (ev) {
            var props = ev.extendedProps || {};
            var time = ev.start.split('T')[1] ? ev.start.split('T')[1].substring(0, 5) : '';
            var endTime = ev.end && ev.end.split('T')[1] ? ev.end.split('T')[1].substring(0, 5) : '';
            var colorClass = ev.className || 'bg-secondary';

            html += '<div class="d-flex align-items-center gap-2 py-1 border-bottom border-dashed">' +
                '<span class="shift-dot ' + colorClass + '"></span>' +
                '<div class="flex-grow-1">' +
                '<span class="fs-13 fw-semibold">' + (props.guardName || 'Unassigned') + '</span>' +
                '<span class="text-muted fs-12 ms-1">' + (props.siteName || '') + '</span>' +
                '</div>' +
                '<span class="text-muted fs-12">' + time + (endTime ? ' - ' + endTime : '') + '</span>' +
                '</div>';
        });
        todayList.innerHTML = html;
    }

}
document.addEventListener('DOMContentLoaded', function (e) {
    new CalendarSchedule().init();
});
