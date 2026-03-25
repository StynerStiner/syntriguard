require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');

const app = express();

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

// Serve static frontend from dist/ (with .html extension hidden)
const distPath = path.join(__dirname, '..', 'dist');
app.use(express.static(distPath, { extensions: ['html'] }));

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/guards', require('./routes/guards'));
app.use('/api/sites', require('./routes/sites'));
app.use('/api/clients', require('./routes/clients'));
app.use('/api/incidents', require('./routes/incidents'));
app.use('/api/shifts', require('./routes/shifts'));
app.use('/api/messages', require('./routes/messages'));
app.use('/api/ai', require('./routes/ai'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/users', require('./routes/users'));
app.use('/api/whatsapp', require('./routes/whatsapp'));
app.use('/api/pdf', require('./routes/pdf'));
app.use('/api/drive', require('./routes/drive'));
app.use('/api/sheets', require('./routes/sheets'));
app.use('/api/uploads', require('./routes/uploads'));
app.use('/api/scoring', require('./routes/scoring'));
app.use('/api/settings', require('./routes/settings'));

// Clean URL routes — map friendly paths to HTML files
const cleanRoutes = {
  '/': '/auth-login',
  '/dashboard': '/index',
  '/login': '/auth-login',
  '/register': '/auth-register',
  '/guards': '/tables-gridjs',
  '/guard-roster': '/tables-gridjs',
  '/scheduler': '/apps-calendar',
  '/calendar': '/apps-calendar',
  '/map': '/maps-leaflet',
  '/deployment-map': '/maps-leaflet',
  '/clients': '/clients-sites',
  '/sites': '/clients-sites',
  '/incidents': '/apps-invoices',
  '/incident-log': '/apps-invoices',
  '/file-report': '/apps-invoice-create',
  '/messages': '/apps-chat',
  '/chat': '/apps-chat',
  '/ai': '/ai-assistant',
  '/ai-assistant': '/ai-assistant',
  '/settings': '/settings',
  '/performance': '/guard-performance',
};

Object.keys(cleanRoutes).forEach(function(route) {
  if (route === '/') {
    app.get('/', (req, res) => res.redirect('/login'));
  } else {
    app.get(route, (req, res) => {
      res.sendFile(path.join(distPath, cleanRoutes[route] + '.html'));
    });
  }
});

// Export for Vercel serverless
module.exports = app;

// Start server only when run directly (not imported by Vercel)
if (require.main === module) {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => console.log(`SyntriGuard API running on port ${PORT}`));
}
