// index.js
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const Joi = require('joi');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');

const app = express();
const PORT = process.env.PORT || 3000;
const API = '/api';
const JWT_SECRET = process.env.JWT_SECRET || 'changeme';

// ─────────────────────────────────────────────
// Supabase setup
// ─────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error(' Missing SUPABASE_URL or SUPABASE_(SERVICE_ROLE_)KEY. Check your .env');
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─────────────────────────────────────────────
// Middleware
// ─────────────────────────────────────────────
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use((req, _res, next) => { console.log(`${req.method} ${req.url}`); next(); });

// ─────────────────────────────────────────────
/* Helpers */
// ─────────────────────────────────────────────
function sendSuccess(res, data = null, message = 'OK', status = 200) {
  return res.status(status).json({ success: true, message, data });
}
function sendError(res, status, code, message, details = undefined) {
  return res.status(status).json({ success: false, error: { code, message, details } });
}
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ─────────────────────────────────────────────
// Auth middleware
// ─────────────────────────────────────────────
function authenticateToken(req, res, next) {
  const token = (req.headers.authorization || '').split(' ')[1];
  if (!token) return sendError(res, 401, 'UNAUTHORIZED', 'Authentication required');
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    return sendError(res, 403, 'INVALID_TOKEN', 'Invalid or expired token', err?.message);
  }
}

// ─────────────────────────────────────────────
// Validation Schemas
// ─────────────────────────────────────────────
const signupSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(8).max(100).pattern(/[A-Z]/).pattern(/[a-z]/).pattern(/[0-9]/).required(),
  name: Joi.string().min(2).max(100).required(),
});
const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(8).max(100).required(),
});

// ─────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────
app.get(`${API}/`, (_req, res) => {
  res.json({
    success: true,
    message: 'Welcome to the F1 Cars API',
    endpoints: [
      '/api/auth/signup',
      '/api/auth/login',
      '/api/me',
      '/api/cars',
      '/api/cars/:id',
      '/api/docs'
    ]
  });
});

// ─────────────────────────────────────────────
// Signup
// ─────────────────────────────────────────────
/**
 * @swagger
 * tags:
 *   - name: Auth
 *     description: Authentication
 *   - name: Cars
 *     description: F1 Cars CRUD
 *
 * components:
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 *   schemas:
 *     SignupBody:
 *       type: object
 *       required: [email, password, name]
 *       properties:
 *         email: { type: string, format: email, example: "harshkokitkar2003@gmail.com" }
 *         password: { type: string, example: "Harsh#013" }
 *         name: { type: string, example: "Harsh" }
 *     LoginBody:
 *       type: object
 *       required: [email, password]
 *       properties:
 *         email: { type: string, format: email, example: "harshkokitkar2003@gmail.com" }
 *         password: { type: string, example: "Harsh#013" }
 *     Car:
 *       type: object
 *       properties:
 *         car_id: { type: string, example: "RB20" }
 *         car_name: { type: string, example: "Red Bull RB20" }
 *         constructor: { type: string, example: "Red Bull Racing" }
 *         season: { type: string, example: "2025" }
 *         driver: { type: string, example: "Max Verstappen" }
 *         car_number: { type: integer, example: 1 }
 *         chassis_code: { type: string, example: "RB20" }
 *         engine_supplier: { type: string, example: "Honda" }
 *         engine_type: { type: string, example: "1.6L V6 Turbo Hybrid" }
 *         rpm_limit: { type: integer, example: 15000 }
 *         tyre_supplier: { type: string, example: "Pirelli" }
 *         chassis_material: { type: string, example: "Carbon fiber composite monocoque" }
 *         front_wing: { type: string, example: "Multi-element adjustable" }
 *         rear_wing: { type: string, example: "DRS-enabled" }
 *         floor_design: { type: string, example: "Ground-effect tunnels" }
 *         diffuser: { type: string, example: "Rear aerodynamic diffuser" }
 *         sidepods: { type: string, example: "Aero-optimized cooling" }
 *         halo: { type: string, example: "Titanium protection structure" }
 *         length_m: { type: number, example: 5.0 }
 *         width_m: { type: number, example: 2.0 }
 *         height_m: { type: number, example: 0.95 }
 *         wheelbase_m: { type: number, example: 3.6 }
 *         minimum_weight_kg: { type: number, example: 798 }
 *         acceleration_0_100_kmh: { type: number, example: 2.5 }
 *         top_speed_kmh: { type: number, example: 350 }
 *         downforce_kgf: { type: number, example: 3000 }
 *         cornering_g_force: { type: number, example: 6 }
 *         fuel_capacity_kg: { type: number, example: 110 }
 */

/**
 * @swagger
 * /auth/signup:
 *   post:
 *     summary: Register a new user (Supabase Auth)
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SignupBody'
 *     responses:
 *       200:
 *         description: User registered (may require email verification)
 *       400:
 *         description: Validation or signup error
 */
app.post(`${API}/auth/signup`, asyncHandler(async (req, res) => {
  const { email, password, name } = req.body;

  // Use ANON key for the user client
  const anonClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

  const { data, error: signErr } = await anonClient.auth.signUp({ email, password });
  if (signErr) return sendError(res, 400, 'SIGNUP_FAILED', signErr.message);

  // If email confirmation is ON, there is no session here → cannot insert as user.
  if (!data.session) {
    return sendSuccess(
      res,
      { id: data.user.id, email },
      'User registered. Please verify your email, then login (profile will be created on first login).'
    );
  }

  // Insert profile as the user (RLS: id must equal auth.uid())
  const userToken = data.session.access_token;
  const userScoped = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY, {
    global: { headers: { Authorization: `Bearer ${userToken}` } }
  });

  const { error: profErr } = await userScoped
    .from('profiles')
    .insert([{ id: data.user.id, full_name: name, role: 'USER' }]);

  if (profErr) return sendError(res, 500, 'PROFILE_CREATE_FAILED', profErr.message);

  return sendSuccess(res, { id: data.user.id, email }, 'User registered');
}));

// ─────────────────────────────────────────────
// Login
// ─────────────────────────────────────────────
/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Login and receive API JWT (not Supabase session token)
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginBody'
 *     responses:
 *       200:
 *         description: Login successful
 *       401:
 *         description: Invalid credentials or email not confirmed
 */
app.post(`${API}/auth/login`, asyncHandler(async (req, res) => {
  const { error } = loginSchema.validate(req.body);
  if (error) return sendError(res, 400, 'VALIDATION_ERROR', error.details[0].message);

  const { email, password } = req.body;
  const { data, error: authErr } = await supabase.auth.signInWithPassword({ email, password });

  if (authErr || !data?.user) {
    const msg = (authErr?.message || '').toLowerCase();
    if (msg.includes('confirm')) {
      return sendError(res, 401, 'EMAIL_NOT_CONFIRMED', 'Please verify your email before logging in');
    }
    return sendError(res, 401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, phone, role')
    .eq('id', data.user.id)
    .single();

  const token = jwt.sign(
    { id: data.user.id, email: data.user.email, role: profile?.role || 'USER' },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  return sendSuccess(res, {
    token,
    user: {
      id: data.user.id,
      email: data.user.email,
      name: profile?.full_name || null,
      phone: profile?.phone || null,
      role: profile?.role || 'USER'
    }
  }, 'Login successful');
}));

// ─────────────────────────────────────────────
// Current user (GET /me)
// ─────────────────────────────────────────────
/**
 * @swagger
 * /me:
 *   get:
 *     summary: Get current user's profile
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current user profile
 *       401:
 *         description: Unauthorized
 */
app.get(`${API}/me`, authenticateToken, asyncHandler(async (req, res) => {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('full_name, phone, role, created_at, updated_at')
    .eq('id', req.user.id)
    .single();
  if (error) return sendError(res, 500, 'DB_ERROR', error.message);
  return sendSuccess(res, { id: req.user.id, email: req.user.email, ...profile }, 'Me fetched');
}));

// ─────────────────────────────────────────────
// F1 Cars Routes (CRUD) — ANY AUTHENTICATED USER
// ─────────────────────────────────────────────

/**
 * @swagger
 * /cars:
 *   get:
 *     summary: List all F1 cars
 *     tags: [Cars]
 *     security: [ { bearerAuth: [] } ]
 *     responses:
 *       200: { description: Cars fetched }
 *
 *   post:
 *     summary: Create a new car
 *     tags: [Cars]
 *     security: [ { bearerAuth: [] } ]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Car'
 *     responses:
 *       201: { description: Car added successfully }
 */
app.get(`${API}/cars`, authenticateToken, asyncHandler(async (_req, res) => {
  const { data, error } = await supabase.from('f1_cars').select('*');
  if (error) return sendError(res, 500, 'DB_ERROR', error.message);
  return sendSuccess(res, data, 'Cars fetched');
}));
app.post(`${API}/cars`, authenticateToken, asyncHandler(async (req, res) => {
  const { data, error } = await supabase.from('f1_cars').insert([req.body]).select();
  if (error) return sendError(res, 500, 'DB_ERROR', error.message);
  return sendSuccess(res, data, 'Car added successfully', 201);
}));

/**
  @swagger
 * /cars/{id}:
 *   get:
 *     summary: Get car by car_id
 *     tags: [Cars]
 *     security: [ { bearerAuth: [] } ]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Car details fetched }
 *       404: { description: Not found }
 *
 *   put:
 *     summary: Update a car by car_id
 *     tags: [Cars]
 *     security: [ { bearerAuth: [] } ]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Car'
 *     responses:
 *       200: { description: Car updated }
 *       404: { description: Not found }
 *
 *   delete:
 *     summary: Delete a car by car_id
 *     tags: [Cars]
 *     security: [ { bearerAuth: [] } ]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Car deleted }
 */
app.get(`${API}/cars/:id`, authenticateToken, asyncHandler(async (req, res) => {
  const { data, error } = await supabase
    .from('f1_cars')
    .select('*')
    .eq('car_id', req.params.id)
    .single();
  if (error) return sendError(res, 500, 'DB_ERROR', error.message);
  if (!data) return sendError(res, 404, 'NOT_FOUND', 'Car not found');
  return sendSuccess(res, data, 'Car details fetched');
}));
app.put(`${API}/cars/:id`, authenticateToken, asyncHandler(async (req, res) => {
  const { data, error } = await supabase
    .from('f1_cars')
    .update(req.body)
    .eq('car_id', req.params.id)
    .select();
  if (error) return sendError(res, 500, 'DB_ERROR', error.message);
  if (!data || data.length === 0) return sendError(res, 404, 'NOT_FOUND', 'Car not found');
  return sendSuccess(res, data, 'Car updated');
}));
app.delete(`${API}/cars/:id`, authenticateToken, asyncHandler(async (req, res) => {
  const { error } = await supabase.from('f1_cars').delete().eq('car_id', req.params.id);
  if (error) return sendError(res, 500, 'DB_ERROR', error.message);
  return sendSuccess(res, null, 'Car deleted');
}));

// ─────────────────────────────────────────────
// Swagger Documentation
// ─────────────────────────────────────────────
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: { title: 'F1 Cars API', version: '1.0.0', description: 'API documentation for F1 Cars backend (Node + Supabase)' },
    servers: [{ url: `http://localhost:${PORT}${API}` }],
    components: {
      securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } }
    },
    security: [{ bearerAuth: [] }]
  },
  apis: ['./index.js'],
};
const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use(`${API}/docs`, swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// ─────────────────────────────────────────────
// Error handlers (keep LAST)
// ─────────────────────────────────

app.use((req, res) => sendError(res, 404, 'NOT_FOUND', `Route ${req.method} ${req.originalUrl} not found`));
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  return sendError(res, 500, 'SERVER_ERROR', 'Something went wrong',
    process.env.NODE_ENV === 'development' ? err.stack : undefined);
});

// ─────────────────────────────────────────────
// Start server
// ─────────────────────────────────────────────
app.listen(PORT, () => console.log(`✅ F1 API running on http://localhost:${PORT}${API}`))


//Right now your code only inserts into public.profiles during signup if a session exists (i.e., email confirmation is OFF). If email confirmation is ON, there’s no session, so your code skips the insert—hence you see users in auth.users but not in public.profiles.

//When a user signs up, Supabase creates a record in auth.users.

// Because email verification is ON, Supabase does not create a session → your code skips profile insertion.
// So:
// User exists only in auth.users
// Their profile row in public.profiles is created only if you explicitly insert it later (for example, via an admin panel or a post-verification process).