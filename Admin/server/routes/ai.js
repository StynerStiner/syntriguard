const router = require('express').Router();
const Anthropic = require('@anthropic-ai/sdk').default;
const db = require('../db');
const auth = require('../middleware/auth');

const SYSTEM_PROMPT = `You are SyntriGuard AI, the intelligent operations assistant for SyntriGuard Security Services NV, headquartered at Keizerstraat 72, Paramaribo, Suriname. Phone: +597 520-8800.

You are an expert in security operations management. You have full access to live operational data (guard roster, shift schedules, incidents, client contracts, site details, performance metrics) which is provided below.

═══ WHAT YOU CAN DO ═══

1. SCHEDULING & SHIFT MANAGEMENT
   - Recommend shift assignments based on guard availability, skills, and site needs
   - Identify coverage gaps (unstaffed hours, single-guard posts that need backup)
   - Suggest shift swaps when guards request changes
   - Flag overtime risks (guards approaching weekly hour limits)
   - Plan coverage for holidays, sick leave, and special events
   - Recommend optimal shift rotations to prevent burnout

2. EMPLOYEE / GUARD MANAGEMENT
   - Answer questions about any guard (status, performance, assigned site, contact info)
   - Recommend promotions based on performance scores and shift history
   - Identify underperforming guards and suggest improvement plans
   - Help with onboarding plans for new trainees
   - Track leave balances and availability
   - Suggest guard-to-site matching based on skills and experience

3. INCIDENT MANAGEMENT
   - Brief on any open or recent incidents
   - Recommend response actions for incident types
   - Identify incident patterns (recurring issues at specific sites/times)
   - Suggest security improvements based on incident history
   - Draft incident summaries for client reports
   - Escalation recommendations (when to notify police, clients, management)

4. SITE & CLIENT MANAGEMENT
   - Report on site status, guard counts, and coverage levels
   - Compare contract values vs. operational costs
   - Flag sites that are understaffed relative to contract requirements
   - Recommend guard allocation changes across sites
   - Help prepare client briefings and status reports

5. PERFORMANCE & ANALYTICS
   - Calculate team-wide and individual performance metrics
   - Identify trends (improving/declining performance)
   - Compare site-level performance
   - Generate daily/weekly/monthly operations summaries
   - Forecast staffing needs based on growth trends

6. GENERAL OPERATIONS
   - Answer questions about Surinamese security regulations and best practices
   - Help draft operational policies and procedures
   - Assist with report writing and documentation
   - Provide weather-related security advisories for Suriname
   - Help with equipment and maintenance tracking

7. GOOGLE SHEETS & DOCUMENT GENERATION
   - Export schedules, roster, incidents, or client data to Google Sheets
   - Each month has a master spreadsheet that stays updated
   - Schedule changes are tracked with revision numbers and color-coded
   - Can generate PDFs for download or Google Drive upload
   - When a schedule change is made, the Google Sheet updates automatically

═══ HOW TO RESPOND ═══

- Always use REAL data from the operational context provided — never make up guard names, incident numbers, or stats
- Be specific: use guard names, site names, dates, and numbers
- When recommending schedule changes, specify: guard name, site, date, start time, end time
- When discussing performance, reference actual scores and shift counts
- Format responses clearly with bullet points or numbered lists for actionable items
- If asked something outside your data, say what you'd need to answer it
- Currency is SRD (Surinamese Dollar)
- Time zone is SRT (UTC-3, America/Paramaribo)
- Shift types: Morning (06:00-14:00), Afternoon (14:00-22:00), Overnight (22:00-06:00)
- Keep responses concise but thorough — operations staff need quick, actionable answers
- If a question is ambiguous, give the most useful interpretation and note alternatives
- When you make a schedule change, mention that it will be tracked in the Changes Log
- If asked to export or share a schedule, mention both Google Sheets and PDF options
- Reference revision numbers when discussing schedule changes`;

// ─── AI Provider Cascade ───────────────────────────────────
// Primary: DeepSeek
// Fallback 1: Perplexity
// Fallback 2: Inception
// Anthropic Claude: commented out, uncomment when ready

async function callAnthropic(systemPrompt, messages) {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2048,
    system: systemPrompt,
    messages
  });
  return response.content[0].text;
}

async function callOpenAICompatible(baseURL, apiKey, model, systemPrompt, messages) {
  const response = await fetch(`${baseURL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      temperature: 0.7,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages
      ]
    })
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`${model} API error: ${response.status} - ${err}`);
  }
  const data = await response.json();
  return data.choices[0].message.content;
}

async function getAIResponse(systemPrompt, messages) {
  const providers = [
    // Primary — Perplexity (best quality responses)
    {
      name: 'Perplexity',
      fn: () => callOpenAICompatible(
        'https://api.perplexity.ai',
        process.env.PERPLEXITY_API_KEY,
        'sonar',
        systemPrompt,
        messages
      ),
      enabled: !!process.env.PERPLEXITY_API_KEY
    },
    // Fallback 1 — LongCat (50M free tokens/day)
    {
      name: 'LongCat',
      fn: () => callOpenAICompatible(
        'https://api.longcat.chat/openai/v1',
        process.env.LONGCAT_API_KEY,
        'LongCat-Flash-Lite',
        systemPrompt,
        messages
      ),
      enabled: !!process.env.LONGCAT_API_KEY
    },
    // Fallback 2 — Inception
    {
      name: 'Inception',
      fn: () => callOpenAICompatible(
        'https://api.inceptionai.ai/v1',
        process.env.INCEPTION_API_KEY,
        'mercury-coder-small',
        systemPrompt,
        messages
      ),
      enabled: !!process.env.INCEPTION_API_KEY
    },
    // Fallback 2 — DeepSeek (slow but reliable)
    {
      name: 'DeepSeek',
      fn: () => callOpenAICompatible(
        'https://api.deepseek.com/v1',
        process.env.DEEPSEEK_API_KEY,
        'deepseek-chat',
        systemPrompt,
        messages
      ),
      enabled: !!process.env.DEEPSEEK_API_KEY
    },
    // Anthropic Claude — uncomment when ready
    // {
    //   name: 'Anthropic Claude',
    //   fn: () => callAnthropic(systemPrompt, messages),
    //   enabled: !!process.env.ANTHROPIC_API_KEY
    // },
  ];

  for (const provider of providers) {
    if (!provider.enabled) continue;
    try {
      console.log(`[AI] Trying ${provider.name}...`);
      // 20-second timeout per provider — if too slow, try the next one
      const result = await Promise.race([
        provider.fn(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout after 20s')), 20000))
      ]);
      console.log(`[AI] Success with ${provider.name}`);
      return result;
    } catch (err) {
      console.error(`[AI] ${provider.name} failed: ${err.message}`);
    }
  }

  throw new Error('All AI providers failed. Check your API keys and credit balances.');
}

// ─── Build Full Context from Database ──────────────────────

async function getOperationalContext() {
  const [guards, incidents, shifts, sites, clients, performance] = await Promise.all([
    // Full guard roster with site and contact details
    db.query(`
      SELECT g.guard_id, g.full_name, g.role, g.phone, g.email, g.status,
             g.performance_score, g.hire_date, g.notes,
             s.name as site_name, s.district as site_district
      FROM guards g
      LEFT JOIN sites s ON g.assigned_site_id = s.id
      ORDER BY g.guard_id
    `),
    // All incidents (recent first)
    db.query(`
      SELECT i.incident_id, i.type, i.severity, i.status, i.description,
             i.specific_location, i.damages_srd, i.police_notified, i.followup_required,
             i.filed_at, i.resolved_at, i.additional_notes,
             s.name as site_name, g.full_name as guard_name
      FROM incidents i
      LEFT JOIN sites s ON i.site_id = s.id
      LEFT JOIN guards g ON i.guard_id = g.id
      ORDER BY i.filed_at DESC LIMIT 20
    `),
    // All shifts (upcoming + recent)
    db.query(`
      SELECT sh.shift_date, sh.start_time, sh.end_time, sh.shift_type, sh.status,
             sh.clock_in, sh.clock_out, sh.notes,
             g.full_name as guard_name, g.guard_id,
             s.name as site_name
      FROM shifts sh
      LEFT JOIN guards g ON sh.guard_id = g.id
      LEFT JOIN sites s ON sh.site_id = s.id
      WHERE sh.shift_date >= CURRENT_DATE - INTERVAL '7 days'
      ORDER BY sh.shift_date, sh.start_time
      LIMIT 50
    `),
    // All sites with guard counts
    db.query(`
      SELECT s.id, s.name, s.address, s.district, s.status, s.guards_assigned,
             s.latitude, s.longitude, s.notes,
             c.name as client_name,
             (SELECT COUNT(*) FROM guards g WHERE g.assigned_site_id = s.id) as actual_guards
      FROM sites s
      LEFT JOIN clients c ON s.client_id = c.id
      ORDER BY s.name
    `),
    // All clients with contracts
    db.query(`
      SELECT c.name, c.address, c.district, c.status, c.contract_value_srd,
             c.contact_name, c.contact_phone, c.notes,
             (SELECT COUNT(*) FROM sites s WHERE s.client_id = c.id) as site_count
      FROM clients c
      ORDER BY c.name
    `),
    // Performance summary
    db.query(`
      SELECT
        COUNT(*) as total_guards,
        COUNT(*) FILTER (WHERE status = 'on_duty') as on_duty,
        COUNT(*) FILTER (WHERE status = 'off_duty') as off_duty,
        COUNT(*) FILTER (WHERE status = 'on_leave') as on_leave,
        COUNT(*) FILTER (WHERE status = 'unassigned') as unassigned,
        ROUND(AVG(performance_score), 1) as avg_performance,
        MIN(performance_score) as min_performance,
        MAX(performance_score) as max_performance
      FROM guards
      WHERE performance_score IS NOT NULL
    `)
  ]);

  const today = new Date().toISOString().split('T')[0];

  return `
═══ GUARD ROSTER (${guards.rows.length} guards) ═══
${guards.rows.map(g =>
    `${g.guard_id} | ${g.full_name} | ${g.role} | ${g.site_name || 'UNASSIGNED'} | Status: ${g.status} | Performance: ${g.performance_score || 'N/A'}% | Phone: ${g.phone || 'N/A'}${g.hire_date ? ' | Hired: ' + g.hire_date : ''}${g.notes ? ' | Notes: ' + g.notes : ''}`
  ).join('\n')}

═══ WORKFORCE SUMMARY ═══
Total: ${performance.rows[0]?.total_guards || 0} | On Duty: ${performance.rows[0]?.on_duty || 0} | Off Duty: ${performance.rows[0]?.off_duty || 0} | On Leave: ${performance.rows[0]?.on_leave || 0} | Unassigned: ${performance.rows[0]?.unassigned || 0}
Avg Performance: ${performance.rows[0]?.avg_performance || 'N/A'}% | Range: ${performance.rows[0]?.min_performance || 'N/A'}% - ${performance.rows[0]?.max_performance || 'N/A'}%

═══ SITES (${sites.rows.length} sites) ═══
${sites.rows.map(s =>
    `${s.name} | Client: ${s.client_name} | ${s.address} | District: ${s.district} | Status: ${s.status} | Guards: ${s.actual_guards}/${s.guards_assigned} assigned${s.notes ? ' | Notes: ' + s.notes : ''}`
  ).join('\n')}

═══ CLIENTS (${clients.rows.length} clients) ═══
${clients.rows.map(c =>
    `${c.name} | ${c.address} | District: ${c.district} | Status: ${c.status} | Contract: SRD ${c.contract_value_srd ? Number(c.contract_value_srd).toLocaleString() : 'N/A'}/mo | Sites: ${c.site_count}${c.contact_name ? ' | Contact: ' + c.contact_name + ' ' + (c.contact_phone || '') : ''}`
  ).join('\n')}

═══ RECENT INCIDENTS (last 20) ═══
${incidents.rows.length === 0 ? 'No incidents recorded.' : incidents.rows.map(i =>
    `${i.incident_id} | ${i.type} | Severity: ${i.severity} | Status: ${i.status} | Site: ${i.site_name} | Guard: ${i.guard_name} | Filed: ${i.filed_at ? new Date(i.filed_at).toLocaleDateString() : 'N/A'}${i.damages_srd ? ' | Damages: SRD ' + i.damages_srd : ''} | Police: ${i.police_notified}${i.description ? ' | ' + i.description.substring(0, 150) : ''}`
  ).join('\n')}

═══ SHIFTS (today: ${today}, showing ±7 days) ═══
${shifts.rows.length === 0 ? 'No shifts scheduled.' : shifts.rows.map(s =>
    `${s.shift_date} | ${s.start_time}-${s.end_time} | ${s.shift_type || 'standard'} | ${s.guard_name} (${s.guard_id}) | ${s.site_name} | Status: ${s.status}${s.clock_in ? ' | Clocked in: ' + s.clock_in : ''}${s.notes ? ' | ' + s.notes : ''}`
  ).join('\n')}

═══ TODAY'S DATE: ${today} | TIMEZONE: SRT (UTC-3) ═══
`;
}

// ─── Routes ────────────────────────────────────────────────

// POST /api/ai/chat
router.post('/chat', auth, async (req, res) => {
  try {
    const { message, conversation_id } = req.body;

    // Pull full operational context from database
    const context = await getOperationalContext();
    const fullSystemPrompt = SYSTEM_PROMPT + '\n\n═══ LIVE OPERATIONAL DATA ═══\n' + context;

    // Get or create conversation
    let convId = conversation_id;
    if (!convId) {
      const convResult = await db.query(
        'INSERT INTO ai_conversations (user_id, title) VALUES ($1, $2) RETURNING id',
        [req.user.id, message.substring(0, 100)]
      );
      convId = convResult.rows[0].id;
    }

    // Save user message
    await db.query(
      'INSERT INTO ai_messages (conversation_id, role, content) VALUES ($1, $2, $3)',
      [convId, 'user', message]
    );

    // Get conversation history (last 20 messages to keep context manageable)
    const history = await db.query(
      'SELECT role, content FROM ai_messages WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT 20',
      [convId]
    );
    const messages = history.rows.reverse().map(m => ({ role: m.role, content: m.content }));

    // Call AI with cascade fallback
    const aiResponse = await getAIResponse(fullSystemPrompt, messages);

    // Save AI response
    await db.query(
      'INSERT INTO ai_messages (conversation_id, role, content) VALUES ($1, $2, $3)',
      [convId, 'assistant', aiResponse]
    );

    // Update conversation title and timestamp
    await db.query(
      'UPDATE ai_conversations SET updated_at = NOW() WHERE id = $1',
      [convId]
    );

    res.json({ response: aiResponse, conversation_id: convId });
  } catch (err) {
    console.error('AI Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/ai/conversations
router.get('/conversations', auth, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM ai_conversations WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 20',
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/ai/conversations/:id/messages
router.get('/conversations/:id/messages', auth, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM ai_messages WHERE conversation_id = $1 ORDER BY created_at',
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/ai/conversations/:id — rename conversation
router.put('/conversations/:id', auth, async (req, res) => {
  try {
    const { title } = req.body;
    if (!title) return res.status(400).json({ error: 'Title is required' });
    await db.query(
      'UPDATE ai_conversations SET title = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3',
      [title, req.params.id, req.user.id]
    );
    res.json({ message: 'Conversation renamed' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/ai/conversations/:id
router.delete('/conversations/:id', auth, async (req, res) => {
  try {
    await db.query('DELETE FROM ai_conversations WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    res.json({ message: 'Conversation deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/ai/generate-schedule — AI generates a week schedule and saves shifts to DB
router.post('/generate-schedule', auth, async (req, res) => {
  try {
    const { start_date, end_date, instructions } = req.body;
    const startDate = start_date || new Date().toISOString().split('T')[0];
    const endDate = end_date || new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];

    // Get context
    const context = await getOperationalContext();

    const schedulePrompt = `${SYSTEM_PROMPT}

═══ LIVE OPERATIONAL DATA ═══
${context}

═══ TASK ═══
Generate a complete shift schedule from ${startDate} to ${endDate}.
${instructions ? 'Additional instructions: ' + instructions : ''}

RULES:
- Every site must have coverage for all 3 shifts (morning 06:00-14:00, afternoon 14:00-22:00, overnight 22:00-06:00)
- Guards on_leave or unassigned should NOT be scheduled
- No guard should work more than 6 shifts per week
- Distribute shifts fairly based on current shift counts
- Trainees should be paired with experienced guards when possible
- Presidential Palace needs extra coverage (2+ guards per shift)

RESPOND IN EXACTLY THIS JSON FORMAT (no other text, just the JSON array):
[
  {"guard_id": 1, "site_id": 1, "date": "YYYY-MM-DD", "start": "HH:MM", "end": "HH:MM", "type": "morning"},
  ...
]

Use numeric IDs (guard table id, not guard_id string). Only output the JSON array.`;

    const messages = [{ role: 'user', content: 'Generate the schedule now. Output only JSON.' }];
    const aiResponse = await getAIResponse(schedulePrompt, messages);

    // Parse the AI response as JSON
    let shifts;
    try {
      // Extract JSON from response (AI might wrap it in markdown)
      const jsonMatch = aiResponse.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error('No JSON array found in AI response');
      shifts = JSON.parse(jsonMatch[0]);
    } catch (parseErr) {
      return res.json({
        success: false,
        error: 'AI response could not be parsed as schedule JSON',
        raw_response: aiResponse
      });
    }

    // Insert shifts into database
    let inserted = 0;
    for (const shift of shifts) {
      try {
        await db.query(
          `INSERT INTO shifts (guard_id, site_id, shift_date, start_time, end_time, shift_type, status)
           VALUES ($1, $2, $3, $4, $5, $6, 'scheduled')`,
          [shift.guard_id, shift.site_id, shift.date, shift.start, shift.end, shift.type]
        );
        inserted++;
      } catch (e) {
        console.error(`Failed to insert shift:`, shift, e.message);
      }
    }

    // Audit log
    await db.query(
      `INSERT INTO audit_log (user_id, action, entity_type, details)
       VALUES ($1, 'ai_schedule_generated', 'shift', $2)`,
      [req.user.id, JSON.stringify({ start: startDate, end: endDate, shifts_created: inserted })]
    );

    // Determine the month(s) covered for Google Sheets sync hint
    const startMonth = startDate.substring(0, 7);
    const endMonth = endDate.substring(0, 7);
    const months = [startMonth];
    if (endMonth !== startMonth) months.push(endMonth);

    // Attempt to auto-sync to Google Sheets if configured
    let sheetsSync = null;
    try {
      if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_REFRESH_TOKEN) {
        // Dynamically call the sheets sync for the primary month
        const sheetsRoute = require('./sheets');
        // We don't call the route directly — instead provide info for the client to call it
        sheetsSync = {
          available: true,
          sync_url: '/api/sheets/schedule/sync',
          sync_body: { month: startMonth },
          message: `Schedule saved. Sync to Google Sheets by calling POST /api/sheets/schedule/sync with month "${startMonth}".`
        };
      }
    } catch (e) {
      sheetsSync = { available: false, message: 'Google Sheets not configured' };
    }

    res.json({
      success: true,
      shifts_generated: shifts.length,
      shifts_saved: inserted,
      period: { start: startDate, end: endDate },
      download_url: `/api/pdf/schedule?start=${startDate}&end=${endDate}`,
      google_sheets: sheetsSync
    });
  } catch (err) {
    console.error('Schedule generation error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
