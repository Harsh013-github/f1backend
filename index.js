// index.js
require('dotenv').config();

const express = require('express');
const jwt = require('jsonwebtoken');
const Joi = require('joi');
const { createClient } = require('@supabase/supabase-js');
const swaggerUi = require('swagger-ui-express');

const app = express();
app.set('trust proxy', true);

// ─────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────
const PORT = Number(process.env.PORT || 3000);
const API = normalizeBase(process.env.API || '/api');
const NODE_ENV = process.env.NODE_ENV || 'development';
const SERVER_PUBLIC_URL = (process.env.SERVER_PUBLIC_URL || '').replace(/\/+$/, '');
const JWT_SECRET = process.env.JWT_SECRET || 'changeme';

// Supabase
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
const db = createClient(SUPABASE_URL, SERVICE_ROLE);
const dbAnon = ANON_KEY ? createClient(SUPABASE_URL, ANON_KEY) : null;

// Log database connection and tables
async function logDatabaseInfo() {
  try {
    console.log('📊 Database Connection Info:');
    console.log('URL:', SUPABASE_URL);
    
    // List all tables
    const { count: carCount, error: tablesError } = await db
      .from('f1_cars')
      .select('*', { count: 'exact', head: true });
    
    if (tablesError) {
      console.error('❌ Error accessing f1_cars table:', tablesError.message);
    } else {
      console.log('✅ Connected to f1_cars table');
      console.log('Total records:', carCount);
    }

    // Check auth tables
    const { count: userCount, error: usersError } = await db
      .from('auth.users')
      .select('*', { count: 'exact', head: true });
    
    if (usersError) {
      console.error('❌ Error accessing auth.users table:', usersError.message);
    } else {
      console.log('✅ Connected to auth.users table');
      console.log('Total users:', userCount);
    }
  } catch (err) {
    console.error('❌ Database connection error:', err.message);
  }
}

// Call the function when server starts
logDatabaseInfo();

// ─────────────────────────────────────────────
// Middleware
// ─────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));

// CORS (allow all origins)
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use((req, _res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
function normalizeBase(s) {
  if (!s.startsWith('/')) s = '/' + s;
  if (s.length > 1) s = s.replace(/\/+$/, '');
  return s;
}

const ok = (res, data = null, message = 'OK', status = 200) =>
  res.status(status).json({ success: true, message, data });
const bad = (res, status, code, message, details) =>
  res.status(status).json({ success: false, error: { code, message, details } });
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function auth(req, res, next) {
  const token = (req.headers.authorization || '').split(' ')[1];
  if (!token) return bad(res, 401, 'UNAUTHORIZED', 'Authentication required');
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    return bad(res, 403, 'INVALID_TOKEN', 'Invalid or expired token', e?.message);
  }
}

// ─────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────
const carSchema = Joi.object({
  name: Joi.string().required(),
  manufacturer: Joi.string().required(),
  top_speed: Joi.number().min(0).required(),
  horsepower: Joi.number().min(0).required(),
  driver: Joi.string().allow(null, ''),
  year: Joi.number().integer().min(1950).max(new Date().getFullYear()).required(),
  image_url: Joi.string().uri().allow('', null),
});

const signupSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(8).max(100).required(),
  name: Joi.string().min(2).max(100).required(),
});
const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(8).max(100).required(),
});

// ─────────────────────────────────────────────
// Swagger Setup
// ─────────────────────────────────────────────
const swaggerServers = [{ url: API, description: 'Relative base (same origin)' }];
if (SERVER_PUBLIC_URL)
  swaggerServers.push({ url: `${SERVER_PUBLIC_URL}${API}`, description: 'Absolute (env)' });

const swaggerSpec = {
  openapi: '3.0.0',
  info: {
    title: 'F1 Cars API',
    version: '1.0.0',
    description: 'API documentation for F1 Cars backend (Node + Supabase)',
  },
  servers: swaggerServers,
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    schemas: {
      SignupBody: {
        type: 'object',
        required: ['email', 'password', 'name'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string' },
          name: { type: 'string' },
        },
      },
      LoginBody: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string' },
        },
      },
      Car: {
        type: 'object',
        required: ['name', 'manufacturer', 'year'],
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          manufacturer: { type: 'string' },
          top_speed: { type: 'number' },
          horsepower: { type: 'number' },
          driver: { type: 'string' },
          year: { type: 'integer' },
          image_url: { type: 'string' },
          created_at: { type: 'string', format: 'date-time' },
        },
      },
    },
  },
  paths: {
    '/': { get: { tags: ['System'], summary: 'API index', responses: { '200': { description: 'OK' } } } },
    '/auth/signup': {
      post: {
        tags: ['Auth'],
        summary: 'Signup and get JWT',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/SignupBody' } } } },
        responses: { '200': { description: 'Signup successful' } },
      },
    },
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Login and get JWT',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginBody' } } } },
        responses: { '200': { description: 'Login successful' } },
      },
    },
    '/cars': {
      get: { tags: ['Cars'], summary: 'List cars', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Cars fetched' } } },
      post: {
        tags: ['Cars'],
        summary: 'Add car',
        security: [{ bearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/Car' } } } },
        responses: { '201': { description: 'Car created' } },
      },
    },
    '/cars/{id}': {
      get: {
        tags: ['Cars'],
        summary: 'Get car by ID',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Car fetched' } },
      },
      put: {
        tags: ['Cars'],
        summary: 'Update car',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/Car' } } } },
        responses: { '200': { description: 'Car updated' } },
      },
      delete: {
        tags: ['Cars'],
        summary: 'Delete car',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Car deleted' } },
      },
    },
  },
};

app.use(`${API}/docs`, swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// ─────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────
const r = express.Router();

r.get('/', (_req, res) => ok(res, { message: 'Welcome to F1 Cars API 🚀' }));

// Auth
r.post('/auth/signup', ah(async (req, res) => {
  const { error } = signupSchema.validate(req.body);
  if (error) return bad(res, 400, 'VALIDATION_ERROR', error.details[0].message);
  if (!dbAnon) return bad(res, 500, 'CONFIG', 'Anon key missing');

  const { email, password, name } = req.body;
  const { data: authData, error: signErr } = await dbAnon.auth.signUp({
    email, 
    password, 
    options: { 
      data: { full_name: name },
      emailRedirectTo: `${SERVER_PUBLIC_URL || 'http://localhost:3000'}/auth/callback`
    }
  });
  
  if (signErr || !authData?.user) {
    return bad(res, 400, 'SIGNUP_FAILED', signErr?.message || 'Failed to create user');
  }

  const token = jwt.sign({ id: authData.user.id, email }, JWT_SECRET, { expiresIn: '3h' });
  ok(res, { token, user: { id: authData.user.id, email, name } }, 'Signup successful');
}));

r.post('/auth/login', ah(async (req, res) => {
  const { error } = loginSchema.validate(req.body);
  if (error) return bad(res, 400, 'VALIDATION_ERROR', error.details[0].message);

  const { email, password } = req.body;
  const client = dbAnon || db;
  const { data, error: authErr } = await client.auth.signInWithPassword({ email, password });
  if (authErr || !data?.user) return bad(res, 401, 'INVALID_CREDENTIALS', authErr?.message || 'Invalid credentials');

  const token = jwt.sign({ id: data.user.id, email: data.user.email }, JWT_SECRET, { expiresIn: '3h' });
  ok(res, { token, user: { id: data.user.id, email: data.user.email } }, 'Login successful');
}));

// Cars CRUD
r.get('/cars', auth, ah(async (_req, res) => {
  const { data, error } = await db.from('f1_cars').select('*').order('created_at', { ascending: false });
  if (error) return bad(res, 500, 'DB', error.message);
  ok(res, data, 'Cars fetched');
}));

r.post('/cars', auth, ah(async (req, res) => {
  const { error, value } = carSchema.validate(req.body);
  if (error) return bad(res, 400, 'VALIDATION', error.details[0].message);

  const { data, error: dberr } = await db.from('f1_cars').insert([value]).select();
  if (dberr) return bad(res, 500, 'DB', dberr.message);
  ok(res, data?.[0], 'Car created', 201);
}));

r.get('/cars/:id', auth, ah(async (req, res) => {
  const { data, error } = await db.from('f1_cars').select('*').eq('id', req.params.id).maybeSingle();
  if (error) return bad(res, 500, 'DB', error.message);
  if (!data) return bad(res, 404, 'NOT_FOUND', 'Car not found');
  ok(res, data, 'Car fetched');
}));

r.put('/cars/:id', auth, ah(async (req, res) => {
  const { error, value } = carSchema.validate(req.body);
  if (error) return bad(res, 400, 'VALIDATION', error.details[0].message);

  const { data, error: dberr } = await db.from('f1_cars').update(value).eq('id', req.params.id).select();
  if (dberr) return bad(res, 500, 'DB', dberr.message);
  ok(res, data?.[0], 'Car updated');
}));

r.delete('/cars/:id', auth, ah(async (req, res) => {
  const { error } = await db.from('f1_cars').delete().eq('id', req.params.id);
  if (error) return bad(res, 500, 'DB', error.message);
  ok(res, null, 'Car deleted');
}));

app.use(API, r);

// Error handling
app.use((req, res) => bad(res, 404, 'NOT_FOUND', `Route ${req.method} ${req.originalUrl} not found`));
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  bad(res, 500, 'SERVER_ERROR', 'Internal server error', NODE_ENV === 'development' ? err.stack : undefined);
});

// ─────────────────────────────────────────────
// Server Start
// ─────────────────────────────────────────────
const displayBase = SERVER_PUBLIC_URL ? `${SERVER_PUBLIC_URL}${API}` : `http://localhost:${PORT}${API}`;
app.listen(PORT, () => {
  console.log(`✅ Env: ${NODE_ENV}`);
  console.log(`✅ API base: ${displayBase}`);
  console.log(`📘 Swagger: ${(SERVER_PUBLIC_URL || `http://localhost:${PORT}`)}${API}/docs`);
});
