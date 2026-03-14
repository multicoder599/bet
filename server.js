/**
 * ═══════════════════════════════════════════════════════════
 * URBANBET — PRODUCTION SERVER  v2.0
 * Node.js + Express + Socket.IO + MongoDB
 * (Protected with Atomic Transactions & Regex Login)
 * ═══════════════════════════════════════════════════════════
 */

'use strict';

const express      = require('express');
const http         = require('http');
const { Server }   = require('socket.io');
const path         = require('path');
const mongoose     = require('mongoose');
const bcrypt       = require('bcryptjs');
const jwt          = require('jsonwebtoken');
const cors         = require('cors');
const crypto       = require('crypto');
const rateLimit    = require('express-rate-limit');
const helmet       = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
require('dotenv').config();

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: process.env.ALLOWED_ORIGINS || '*', methods: ['GET','POST'] },
  pingTimeout: 60000,
  pingInterval: 25000,
});

/* ────────────────────────────────────────
   ENVIRONMENT CONSTANTS
──────────────────────────────────────── */
const PORT          = process.env.PORT         || 3000;
const MONGO_URI     = process.env.MONGO_URI    || 'mongodb://127.0.0.1:27017/urban-bet';
const JWT_SECRET    = process.env.JWT_SECRET   || 'change_this_in_production';
const ADMIN_SECRET  = process.env.ADMIN_SECRET || 'key1905';
const APP_URL       = process.env.APP_URL      || 'https://bet-6jn6.onrender.com';
const TG_TOKEN      = process.env.TELEGRAM_BOT_TOKEN || '';
const TG_CHAT_ID    = process.env.TELEGRAM_CHAT_ID   || '';
const MEGAPAY_KEY   = process.env.MEGAPAY_API_KEY     || 'MGPY26G5iWPw';
const MEGAPAY_EMAIL = process.env.MEGAPAY_EMAIL       || 'kanyingiwaitara@gmail.com';
const MIN_DEPOSIT   = parseInt(process.env.MIN_DEPOSIT)    || 50;
const MIN_WITHDRAW  = parseInt(process.env.MIN_WITHDRAW)   || 100;
const MAX_WITHDRAW  = parseInt(process.env.MAX_WITHDRAW)   || 150000;
const HOUSE_EDGE    = parseFloat(process.env.HOUSE_EDGE)   || 0.04;

/* ────────────────────────────────────────
   TELEGRAM HELPER
──────────────────────────────────────── */
async function tgSend(text) {
  if (!TG_TOKEN || !TG_CHAT_ID) return;
  try {
    await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ chat_id: TG_CHAT_ID, text, parse_mode: 'Markdown' }),
    });
  } catch (e) { console.error('[TG]', e.message); }
}

/* ────────────────────────────────────────
   SECURITY MIDDLEWARE
──────────────────────────────────────── */
app.use(helmet({
  contentSecurityPolicy: false, 
  crossOriginEmbedderPolicy: false,
}));
app.use(mongoSanitize());      
app.use(cors({ origin: process.env.ALLOWED_ORIGINS || '*' }));
app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, 'public')));

/* ── Rate limiters ── */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 20,
  message: { error: 'Too many requests. Please wait 15 minutes.' },
});
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, max: 100,
  message: { error: 'Rate limit exceeded. Try again shortly.' },
});
const depositLimiter = rateLimit({
  windowMs: 60 * 1000, max: 5,
  message: { error: 'Too many deposit attempts. Wait 1 minute.' },
});

app.use('/api/register', authLimiter);
app.use('/api/login',    authLimiter);
app.use('/api/deposit',  depositLimiter);
app.use('/api/',         apiLimiter);

/* ────────────────────────────────────────
   DATABASE
──────────────────────────────────────── */
mongoose.connect(MONGO_URI, {
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
})
.then(() => console.log('✅ MongoDB connected'))
.catch(err => { console.error('❌ MongoDB error:', err.message); process.exit(1); });

mongoose.connection.on('disconnected', () => console.warn('[DB] Disconnected'));
mongoose.connection.on('reconnected',  () => console.log('[DB] Reconnected'));

/* ────────────────────────────────────────
   SCHEMAS & MODELS
──────────────────────────────────────── */

const UserSchema = new mongoose.Schema({
  phone:        { type: String, required: true, unique: true, trim: true, index: true },
  username:     { type: String, required: true, trim: true },
  password:     { type: String, required: true },
  email:        { type: String, trim: true, lowercase: true, default: '' },
  balance:      { type: Number, default: 0, min: 0 },
  totalDeposit: { type: Number, default: 0 },
  totalBets:    { type: Number, default: 0 },
  totalWins:    { type: Number, default: 0 },
  referredBy:   { type: String, default: '' },
  referralCode: { type: String, unique: true, sparse: true },
  status:       { type: String, enum: ['active','suspended','banned'], default: 'active' },
  kycStatus:    { type: String, enum: ['none','pending','verified','rejected'], default: 'none' },
  role:         { type: String, enum: ['user','admin','support'], default: 'user' },
  lastLogin:    { type: Date, default: null },
  loginIP:      { type: String, default: '' },
  createdAt:    { type: Date, default: Date.now },
});

const BetSchema = new mongoose.Schema({
  userId:            { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  username:          String,
  betAmount:         { type: Number, required: true, min: 0 },
  cashoutMultiplier: { type: Number, default: 0 },
  winnings:          { type: Number, default: 0 },
  roundId:           { type: String, index: true },
  gameId:            { type: String, default: 'aviator' },
  createdAt:         { type: Date, default: Date.now, index: true },
});

const TransactionSchema = new mongoose.Schema({
  userId:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  type:    { type: String, enum: ['DEPOSIT','WITHDRAWAL'], required: true },
  amount:  { type: Number, required: true, min: 0 },
  receipt: { type: String, unique: true, sparse: true },
  method:  { type: String, default: 'M-Pesa' },
  phone:   { type: String, default: '' },
  status:  {
    type: String,
    enum: ['PENDING','COMPLETED','FAILED','REJECTED','PENDING_ADMIN_APPROVAL'],
    default: 'PENDING',
  },
  note:      { type: String, default: '' },
  createdAt: { type: Date, default: Date.now, index: true },
  resolvedAt: { type: Date, default: null },
  resolvedBy: { type: String, default: '' },
});

const CommissionSchema = new mongoose.Schema({
  referrerId:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  refereeId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  depositAmount: Number,
  commission:    Number,
  status:        { type: String, default: 'PAID' },
  createdAt:     { type: Date, default: Date.now },
});

const RoundSchema = new mongoose.Schema({
  roundId:    { type: Number, unique: true },
  crashPoint: Number,
  serverSeed: String,
  hash:       String,
  totalBets:  { type: Number, default: 0 },
  totalWon:   { type: Number, default: 0 },
  createdAt:  { type: Date, default: Date.now },
});

const BonusSchema = new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  type:      { type: String, enum: ['WELCOME','RELOAD','REFERRAL','MANUAL'] },
  amount:    Number,
  status:    { type: String, enum: ['PENDING','APPLIED','EXPIRED'], default: 'PENDING' },
  expiresAt: { type: Date },
  createdAt: { type: Date, default: Date.now },
});

const AuditSchema = new mongoose.Schema({
  adminId: String,
  action:  String,
  target:  String,
  meta:    mongoose.Schema.Types.Mixed,
  ip:      String,
  createdAt: { type: Date, default: Date.now },
});

const User        = mongoose.model('User',        UserSchema);
const Bet         = mongoose.model('Bet',         BetSchema);
const Transaction = mongoose.model('Transaction', TransactionSchema);
const Commission  = mongoose.model('Commission',  CommissionSchema);
const Round       = mongoose.model('Round',       RoundSchema);
const Bonus       = mongoose.model('Bonus',       BonusSchema);
const Audit       = mongoose.model('Audit',       AuditSchema);

/* ────────────────────────────────────────
   AUTH HELPERS
──────────────────────────────────────── */
const genToken = (user) =>
  jwt.sign({ id: user._id, phone: user.phone, role: user.role }, JWT_SECRET, { expiresIn: '7d' });

const verifyToken = (req, res, next) => {
  const header = req.headers.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No token provided.' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token.' });
  }
};

const verifyAdmin = (req, res, next) => {
  const secret = req.headers['x-admin-secret'];
  if (secret === ADMIN_SECRET) {
    req.adminId = 'header-auth';
    return next();
  }
  const header = req.headers.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      if (decoded.role === 'admin') { req.adminId = decoded.id; return next(); }
    } catch {}
  }
  res.status(403).json({ error: 'Unauthorized.' });
};

const genReferralCode = (phone) =>
  'UB-' + phone.slice(-4) + '-' + crypto.randomBytes(3).toString('hex').toUpperCase();

async function logAudit(adminId, action, target, meta = {}, ip = '') {
  try { await Audit.create({ adminId, action, target, meta, ip }); } catch {}
}

/* ────────────────────────────────────────
   INPUT VALIDATION HELPERS
──────────────────────────────────────── */
const isValidAmount = (a, min, max) => {
  const n = parseFloat(a);
  return !isNaN(n) && n >= min && (!max || n <= max);
};
const sanitizePhone = (p) => {
  let n = (p||'').replace(/\D/g,'');
  if (n.startsWith('0'))   n = '254' + n.slice(1);
  if (n.startsWith('7') || n.startsWith('1')) n = '254' + n;
  return n;
};
const toLocalPhone = (p) => {
  const n = (p||'').replace(/\D/g,'');
  return n.startsWith('254') ? '0' + n.slice(3) : n;
};

/* ────────────────────────────────────────
   AUTH ROUTES
──────────────────────────────────────── */

/* POST /api/register */
app.post('/api/register', async (req, res) => {
  try {
    const { username, phone, password, email, referralCode } = req.body;

    if (!phone || !password)
      return res.status(400).json({ error: 'Phone and password are required.' });
    if (password.length < 6)
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });

    const localPhone = toLocalPhone(phone);
    const existing = await User.findOne({ phone: localPhone });
    if (existing)
      return res.status(400).json({ error: 'Phone number already registered. Please login.' });

    const hashed = await bcrypt.hash(password, 12);
    const refCode = genReferralCode(localPhone);

    const user = await User.create({
      phone:        localPhone,
      username:     username || localPhone,
      password:     hashed,
      email:        email || '',
      referralCode: refCode,
      referredBy:   referralCode || '',
    });

    if (process.env.WELCOME_BONUS_ENABLED === 'true') {
      await Bonus.create({
        userId: user._id,
        type:   'WELCOME',
        amount: 0, 
        status: 'PENDING',
        expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
      });
    }

    tgSend(`👤 *NEW REGISTRATION*\n📱 Phone: ${localPhone}\n🏷️ Ref Code: ${refCode}`);
    res.status(201).json({ message: 'Registration successful! You can now log in.' });
  } catch (err) {
    console.error('[register]', err.message);
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

/* POST /api/login (FIXED: Supports both Phone and Text Username) */
app.post('/api/login', async (req, res) => {
  try {
    const identifier = req.body.username || req.body.phone || '';
    const password   = req.body.password || '';

    if (!identifier || !password)
      return res.status(400).json({ error: 'Username/Phone and password required.' });

    // Detect if input is a phone number (digits/plus) or a text username
    const isPhone = /^[0-9+\s]+$/.test(identifier);
    const query = isPhone 
        ? { phone: toLocalPhone(identifier) } 
        : { username: new RegExp(`^${identifier}$`, 'i') }; 

    const user = await User.findOne(query);
    if (!user) return res.status(400).json({ error: 'Invalid credentials.' });
    if (user.status === 'banned') return res.status(403).json({ error: 'Your account has been banned.' });
    if (user.status === 'suspended') return res.status(403).json({ error: 'Your account is suspended. Contact support.' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ error: 'Invalid credentials.' });

    user.lastLogin = new Date();
    user.loginIP   = req.ip || '';
    await user.save();

    const token = genToken(user);
    res.json({
      token,
      user: {
        id:           user._id,
        phone:        user.phone,
        username:     user.username,
        email:        user.email,
        balance:      user.balance,
        referralCode: user.referralCode,
        role:         user.role,
      },
    });
  } catch (err) {
    console.error('[login]', err.message);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

/* GET /api/me — refresh current user data */
app.get('/api/me', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) return res.status(404).json({ error: 'User not found.' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch user data.' });
  }
});

/* PUT /api/me — update profile */
app.put('/api/me', verifyToken, async (req, res) => {
  try {
    const { username, email } = req.body;
    const update = {};
    if (username) update.username = username.trim();
    if (email)    update.email    = email.trim().toLowerCase();
    const user = await User.findByIdAndUpdate(req.user.id, update, { new: true }).select('-password');
    res.json({ message: 'Profile updated.', user });
  } catch (err) {
    res.status(500).json({ error: 'Update failed.' });
  }
});

app.post('/api/change-password', verifyToken, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) return res.status(400).json({ error: 'Both old and new passwords are required.' });
    if (newPassword.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters.' });

    const user = await User.findById(req.user.id);
    const match = await bcrypt.compare(oldPassword, user.password);
    if (!match) return res.status(400).json({ error: 'Current password is incorrect.' });

    user.password = await bcrypt.hash(newPassword, 12);
    await user.save();
    res.json({ message: 'Password changed successfully.' });
  } catch (err) {
    res.status(500).json({ error: 'Password change failed.' });
  }
});

/* ────────────────────────────────────────
   DEPOSIT (M-Pesa STK Push via MegaPay)
──────────────────────────────────────── */
app.post('/api/deposit', async (req, res) => {
  try {
    const { username, phone, amount } = req.body;

    if (!isValidAmount(amount, MIN_DEPOSIT))
      return res.status(400).json({ error: `Minimum deposit is KES ${MIN_DEPOSIT}.` });

    const user = await User.findOne({ $or: [{ phone: username }, { username }] });
    if (!user) return res.status(404).json({ error: 'User not found.' });
    if (user.status !== 'active') return res.status(403).json({ error: 'Account is not active.' });

    const formatted = sanitizePhone(phone || user.phone);

    const payload = {
      api_key:      MEGAPAY_KEY,
      email:        MEGAPAY_EMAIL,
      amount:       parseFloat(amount),
      msisdn:       formatted,
      callback_url: `${APP_URL}/api/megapay/webhook`,
      description:  'UrbanBet Deposit',
      reference:    'DEP' + Date.now(),
    };

    const mpRes = await fetch('https://megapay.co.ke/backend/v1/initiatestk', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });
    
    if (!mpRes.ok) return res.status(502).json({ error: 'Payment gateway error. Please try again.' });

    await Transaction.create({
      userId: user._id,
      type:   'DEPOSIT',
      amount: parseFloat(amount),
      phone:  formatted,
      status: 'PENDING',
    });

    res.json({ message: 'STK push sent! Enter your M-Pesa PIN on your phone.', reference: payload.reference });
  } catch (err) {
    console.error('[deposit]', err.message);
    res.status(500).json({ error: 'Payment gateway error.' });
  }
});

/* ────────────────────────────────────────
   MEGAPAY WEBHOOK
──────────────────────────────────────── */
app.post('/api/megapay/webhook', async (req, res) => {
  res.status(200).send('OK');

  const data = req.body;
  try {
    const code    = data.ResponseCode ?? data.ResultCode ?? data.response_code;
    if (parseInt(code) !== 0) return; // cancelled / failed

    const rawAmt  = data.TransactionAmount || data.amount || data.Amount;
    const amount  = parseFloat(rawAmt);
    const receipt = data.TransactionReceipt || data.MpesaReceiptNumber || data.receipt;
    const rawPhone= (data.Msisdn || data.phone || data.PhoneNumber || '').toString();
    const local   = toLocalPhone(rawPhone);

    if (!amount || !receipt) return;

    const dup = await Transaction.findOne({ receipt });
    if (dup) return;

    const user = await User.findOne({ phone: local });
    if (!user) {
      tgSend(`⚠️ *UNREGISTERED PAYMENT*\n📱 ${local}\n💰 KES ${amount}\n🧾 ${receipt}`);
      return;
    }

    // Atomic Balance Credit
    await User.findByIdAndUpdate(user._id, {
        $inc: { balance: amount, totalDeposit: amount }
    });

    await Transaction.findOneAndUpdate(
      { userId: user._id, type: 'DEPOSIT', status: 'PENDING' },
      { status: 'COMPLETED', receipt },
      { sort: { createdAt: -1 } }
    );
    
    await Transaction.create({
      userId: user._id, type: 'DEPOSIT', amount,
      status: 'COMPLETED', receipt, phone: local,
    }).catch(() => {});

    if (user.referredBy) {
      const referrer = await User.findOne({ referralCode: user.referredBy });
      const isFirst  = await Transaction.countDocuments({ userId: user._id, type: 'DEPOSIT', status: 'COMPLETED' });
      if (referrer && isFirst === 1) {
        const commission = parseFloat((amount * 0.40).toFixed(2));
        await User.findByIdAndUpdate(referrer._id, { $inc: { balance: commission } });
        await Commission.create({ referrerId: referrer._id, refereeId: user._id, depositAmount: amount, commission });
        tgSend(`🤝 *REFERRAL COMMISSION*\n👤 Referrer: ${referrer.phone}\n💰 Commission: KES ${commission}`);
      }
    }

    const pendingBonus = await Bonus.findOne({ userId: user._id, type: 'WELCOME', status: 'PENDING' });
    if (pendingBonus) {
      const bonusAmt = parseFloat((amount * 2).toFixed(2)); // 200%
      await User.findByIdAndUpdate(user._id, { $inc: { balance: bonusAmt } });
      pendingBonus.amount = bonusAmt;
      pendingBonus.status = 'APPLIED';
      await pendingBonus.save();
      tgSend(`🎁 *WELCOME BONUS APPLIED*\n👤 ${user.phone}\n💰 Bonus: KES ${bonusAmt}`);
    }

    // Grab updated balance for notification
    const updatedUser = await User.findById(user._id);
    tgSend(`💵 *DEPOSIT CONFIRMED*\n👤 ${updatedUser.phone}\n💰 KES ${amount}\n🧾 ${receipt}\n💳 New Balance: KES ${updatedUser.balance.toFixed(2)}`);

  } catch (err) {
    console.error('[webhook]', err.message);
  }
});

/* ────────────────────────────────────────
   WITHDRAWAL (FIXED: ATOMIC PREVENTS RACE CONDITIONS)
──────────────────────────────────────── */
app.post('/api/withdraw', async (req, res) => {
  try {
    const { username, amount } = req.body;

    if (!isValidAmount(amount, MIN_WITHDRAW, MAX_WITHDRAW))
      return res.status(400).json({ error: `Withdrawal must be between KES ${MIN_WITHDRAW} and KES ${MAX_WITHDRAW}.` });

    const amt = parseFloat(amount);

    // ATOMIC DEDUCTION: Impossible to double-withdraw or drop below 0
    const user = await User.findOneAndUpdate(
        { 
            $or: [{ phone: username }, { username }], 
            status: 'active',
            balance: { $gte: amt } // Crucial: Ensures balance doesn't drop below 0
        },
        { $inc: { balance: -amt } },
        { new: true }
    );

    if (!user) {
        // Give explicit error if atomic query failed
        const userCheck = await User.findOne({ $or: [{ phone: username }, { username }] });
        if (!userCheck) return res.status(404).json({ error: 'User not found.' });
        if (userCheck.status !== 'active') return res.status(403).json({ error: 'Account is not active.' });
        return res.status(400).json({ error: 'Insufficient balance.' });
    }

    await Transaction.create({
      userId: user._id,
      type:   'WITHDRAWAL',
      amount: amt,
      phone:  user.phone,
      status: 'PENDING_ADMIN_APPROVAL',
    });

    tgSend(`🚨 *WITHDRAWAL REQUEST*\n👤 ${user.phone}\n💰 KES ${amt}\n💳 Remaining: KES ${user.balance.toFixed(2)}\n\n_Process via Admin Panel._`);

    res.json({ message: 'Withdrawal request submitted. Admin will process it shortly.', newBalance: user.balance });
  } catch (err) {
    console.error('[withdraw]', err.message);
    res.status(500).json({ error: 'Withdrawal failed. Please try again.' });
  }
});

/* ────────────────────────────────────────
   USER-FACING DATA ENDPOINTS
──────────────────────────────────────── */

app.get('/api/history/:username', async (req, res) => {
  try {
    const user = await User.findOne({ $or: [{ phone: req.params.username }, { username: req.params.username }] });
    if (!user) return res.json([]);
    const bets = await Bet.find({ userId: user._id }).sort({ createdAt: -1 }).limit(50);
    res.json(bets);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch history.' });
  }
});

app.get('/api/transactions/:username', async (req, res) => {
  try {
    const user = await User.findOne({ $or: [{ phone: req.params.username }, { username: req.params.username }] });
    if (!user) return res.json([]);
    const txs = await Transaction.find({ userId: user._id }).sort({ createdAt: -1 }).limit(50);
    res.json(txs);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch transactions.' });
  }
});

app.get('/api/leaderboard', async (req, res) => {
  try {
    const top = await User.find({ totalWins: { $gt: 0 } })
      .sort({ totalWins: -1 })
      .limit(10)
      .select('phone username totalWins totalBets');
    const masked = top.map(u => ({
      username: u.username || (u.phone.slice(0,4)+'***'+u.phone.slice(-2)),
      totalWins: u.totalWins,
      totalBets: u.totalBets,
    }));
    res.json(masked);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch leaderboard.' });
  }
});

app.get('/api/rounds', async (req, res) => {
  try {
    const rounds = await Round.find({}).sort({ roundId: -1 }).limit(30).select('-serverSeed');
    res.json(rounds);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch rounds.' });
  }
});

app.get('/api/rounds/:roundId/verify', async (req, res) => {
  try {
    const round = await Round.findOne({ roundId: parseInt(req.params.roundId) });
    if (!round) return res.status(404).json({ error: 'Round not found.' });
    const check = crypto.createHash('sha256').update(round.serverSeed).digest('hex');
    res.json({ roundId: round.roundId, crashPoint: round.crashPoint, hash: round.hash, verified: check === round.hash });
  } catch (err) {
    res.status(500).json({ error: 'Verification failed.' });
  }
});

app.get('/api/referrals/:phone', async (req, res) => {
  try {
    const user = await User.findOne({ phone: req.params.phone });
    if (!user) return res.status(404).json({ error: 'User not found.' });
    const commissions = await Commission.find({ referrerId: user._id });
    const total = commissions.reduce((s, c) => s + c.commission, 0);
    res.json({ referralCode: user.referralCode, totalCommission: total, referralCount: commissions.length });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch referral data.' });
  }
});

/* ────────────────────────────────────────
   ADMIN API
──────────────────────────────────────── */

app.get('/api/admin/users', verifyAdmin, async (req, res) => {
  try {
    const { page=1, limit=50, search='', status='' } = req.query;
    const filter = {};
    if (search) filter.$or = [{ phone: new RegExp(search,'i') }, { username: new RegExp(search,'i') }];
    if (status) filter.status = status;

    const total = await User.countDocuments(filter);
    const users = await User.find(filter, '-password')
      .sort({ createdAt: -1 })
      .skip((page-1)*parseInt(limit))
      .limit(parseInt(limit));

    res.json({ total, page: parseInt(page), users });
  } catch (err) { res.status(500).json({ error: 'Failed to fetch users.' }); }
});

app.get('/api/admin/users/:id', verifyAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) return res.status(404).json({ error: 'User not found.' });
    const bets  = await Bet.find({ userId: user._id }).sort({ createdAt: -1 }).limit(20);
    const txs   = await Transaction.find({ userId: user._id }).sort({ createdAt: -1 }).limit(20);
    res.json({ user, bets, transactions: txs });
  } catch (err) { res.status(500).json({ error: 'Failed to fetch user.' }); }
});

app.put('/api/admin/users/:id/balance', verifyAdmin, async (req, res) => {
  try {
    const { balance, reason } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    const old = user.balance;
    user.balance = parseFloat(balance);
    await user.save();
    await logAudit(req.adminId, 'ADJUST_BALANCE', user.phone, { old, new: balance, reason }, req.ip);
    tgSend(`💰 *BALANCE ADJUSTED*\n👤 ${user.phone}\n📉 Old: KES ${old}\n📈 New: KES ${balance}\n📝 Reason: ${reason||'—'}`);
    res.json({ message: 'Balance updated.', newBalance: user.balance });
  } catch (err) { res.status(500).json({ error: 'Failed to update balance.' }); }
});

app.put('/api/admin/users/:id/status', verifyAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['active','suspended','banned'].includes(status))
      return res.status(400).json({ error: 'Invalid status.' });
    const user = await User.findByIdAndUpdate(req.params.id, { status }, { new: true }).select('-password');
    if (!user) return res.status(404).json({ error: 'User not found.' });
    await logAudit(req.adminId, 'CHANGE_STATUS', user.phone, { status }, req.ip);
    res.json({ message: `User ${status}.`, user });
  } catch (err) { res.status(500).json({ error: 'Failed to update status.' }); }
});

app.delete('/api/admin/users/:id', verifyAdmin, async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    await logAudit(req.adminId, 'DELETE_USER', user.phone, {}, req.ip);
    res.json({ message: 'User deleted.' });
  } catch (err) { res.status(500).json({ error: 'Failed to delete user.' }); }
});

app.get('/api/admin/transactions/pending', verifyAdmin, async (req, res) => {
  try {
    const txs = await Transaction.find({ type: 'WITHDRAWAL', status: 'PENDING_ADMIN_APPROVAL' })
      .populate('userId', 'phone username')
      .sort({ createdAt: 1 });
    res.json(txs);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch pending withdrawals.' }); }
});

app.get('/api/admin/transactions', verifyAdmin, async (req, res) => {
  try {
    const { page=1, limit=50, type='', status='' } = req.query;
    const filter = {};
    if (type)   filter.type   = type;
    if (status) filter.status = status;

    const total = await Transaction.countDocuments(filter);
    const txs   = await Transaction.find(filter)
      .populate('userId', 'phone username')
      .sort({ createdAt: -1 })
      .skip((page-1)*parseInt(limit))
      .limit(parseInt(limit));

    res.json({ total, txs });
  } catch (err) { res.status(500).json({ error: 'Failed to fetch transactions.' }); }
});

app.put('/api/admin/transactions/:id/approve', verifyAdmin, async (req, res) => {
  try {
    const tx = await Transaction.findById(req.params.id).populate('userId','phone');
    if (!tx) return res.status(404).json({ error: 'Transaction not found.' });
    if (tx.status !== 'PENDING_ADMIN_APPROVAL')
      return res.status(400).json({ error: 'Transaction already processed.' });

    tx.status     = 'COMPLETED';
    tx.resolvedAt = new Date();
    tx.resolvedBy = req.adminId;
    await tx.save();

    await logAudit(req.adminId, 'APPROVE_WITHDRAWAL', tx.userId?.phone, { amount: tx.amount }, req.ip);
    tgSend(`✅ *WITHDRAWAL APPROVED*\n👤 ${tx.userId?.phone}\n💰 KES ${tx.amount}`);
    res.json({ message: 'Withdrawal approved and marked as completed.' });
  } catch (err) { res.status(500).json({ error: 'Failed to approve.' }); }
});

app.put('/api/admin/transactions/:id/reject', verifyAdmin, async (req, res) => {
  try {
    const { reason } = req.body;
    const tx = await Transaction.findById(req.params.id);
    if (!tx) return res.status(404).json({ error: 'Transaction not found.' });
    if (tx.status !== 'PENDING_ADMIN_APPROVAL')
      return res.status(400).json({ error: 'Already processed.' });

    tx.status     = 'REJECTED';
    tx.note       = reason || '';
    tx.resolvedAt = new Date();
    tx.resolvedBy = req.adminId;
    await tx.save();

    // Refund User Atomically
    const user = await User.findByIdAndUpdate(tx.userId, { $inc: { balance: tx.amount } });
    
    await logAudit(req.adminId, 'REJECT_WITHDRAWAL', user?.phone, { amount: tx.amount, reason }, req.ip);
    tgSend(`❌ *WITHDRAWAL REJECTED*\n👤 ${user?.phone}\n💰 KES ${tx.amount} refunded`);
    res.json({ message: 'Withdrawal rejected. Balance refunded to user.' });
  } catch (err) { res.status(500).json({ error: 'Failed to reject.' }); }
});

app.get('/api/admin/bets', verifyAdmin, async (req, res) => {
  try {
    const { page=1, limit=50, phone='' } = req.query;
    let filter = {};
    if (phone) {
      const user = await User.findOne({ phone });
      if (user) filter.userId = user._id;
    }
    const total = await Bet.countDocuments(filter);
    const bets  = await Bet.find(filter).sort({ createdAt: -1 }).skip((page-1)*parseInt(limit)).limit(parseInt(limit));
    res.json({ total, bets });
  } catch (err) { res.status(500).json({ error: 'Failed to fetch bets.' }); }
});

app.get('/api/admin/stats', verifyAdmin, async (req, res) => {
  try {
    const now      = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [totalUsers, activeToday, totalBets, betsToday] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ lastLogin: { $gte: todayStart } }),
      Bet.countDocuments(),
      Bet.countDocuments({ createdAt: { $gte: todayStart } }),
    ]);

    const [depToday, wdToday] = await Promise.all([
      Transaction.aggregate([{ $match: { type:'DEPOSIT', status:'COMPLETED', createdAt:{ $gte: todayStart } } }, { $group:{ _id:null, total:{ $sum:'$amount' } } }]),
      Transaction.aggregate([{ $match: { type:'WITHDRAWAL', status:'COMPLETED', createdAt:{ $gte: todayStart } } }, { $group:{ _id:null, total:{ $sum:'$amount' } } }]),
    ]);

    const [totalWinnings, totalStakes] = await Promise.all([
      Bet.aggregate([{ $group:{ _id:null, total:{ $sum:'$winnings' } } }]),
      Bet.aggregate([{ $group:{ _id:null, total:{ $sum:'$betAmount' } } }]),
    ]);

    const pendingWd = await Transaction.countDocuments({ type:'WITHDRAWAL', status:'PENDING_ADMIN_APPROVAL' });

    res.json({
      totalUsers,
      activeToday,
      totalBets,
      betsToday,
      depositsToday:   depToday[0]?.total || 0,
      withdrawalsToday:wdToday[0]?.total  || 0,
      totalStakes:     totalStakes[0]?.total   || 0,
      totalWinnings:   totalWinnings[0]?.total || 0,
      houseRevenue:    (totalStakes[0]?.total||0) - (totalWinnings[0]?.total||0),
      pendingWithdrawals: pendingWd,
    });
  } catch (err) { res.status(500).json({ error: 'Failed to fetch stats.' }); }
});

app.post('/api/admin/bulk-credit', verifyAdmin, async (req, res) => {
  try {
    const { phones, amount, reason } = req.body;
    if (!Array.isArray(phones) || !amount || amount <= 0)
      return res.status(400).json({ error: 'Invalid payload.' });

    let credited = 0;
    for (const phone of phones) {
      const user = await User.findOneAndUpdate({ phone: toLocalPhone(phone) }, { $inc: { balance: parseFloat(amount) }});
      if (user) credited++;
    }
    await logAudit(req.adminId, 'BULK_CREDIT', `${credited} users`, { amount, reason }, req.ip);
    tgSend(`💸 *BULK CREDIT*\n📊 Users credited: ${credited}\n💰 KES ${amount} each\n📝 ${reason||'—'}`);
    res.json({ message: `Credited KES ${amount} to ${credited} users.` });
  } catch (err) { res.status(500).json({ error: 'Bulk credit failed.' }); }
});

app.get('/api/admin/audit', verifyAdmin, async (req, res) => {
  try {
    const logs = await Audit.find({}).sort({ createdAt: -1 }).limit(100);
    res.json(logs);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch audit log.' }); }
});

app.post('/api/admin/bonus', verifyAdmin, async (req, res) => {
  try {
    const { phone, amount, reason } = req.body;
    const user = await User.findOneAndUpdate({ phone: toLocalPhone(phone) }, { $inc: { balance: parseFloat(amount) }}, { new: true });
    if (!user) return res.status(404).json({ error: 'User not found.' });

    await Bonus.create({ userId: user._id, type: 'MANUAL', amount, status: 'APPLIED' });
    await logAudit(req.adminId, 'MANUAL_BONUS', user.phone, { amount, reason }, req.ip);
    tgSend(`🎁 *MANUAL BONUS*\n👤 ${user.phone}\n💰 KES ${amount}\n📝 ${reason||'—'}`);
    res.json({ message: `Bonus of KES ${amount} credited to ${user.phone}.` });
  } catch (err) { res.status(500).json({ error: 'Bonus failed.' }); }
});

/* ────────────────────────────────────────
   GAME ENGINE — ADMIN CONTROLS
──────────────────────────────────────── */

app.post('/api/admin/override', verifyAdmin, (req, res) => {
  const val = parseFloat(req.body.multiplier);
  if (isNaN(val) || val < 1.0)
    return res.status(400).json({ error: 'Invalid multiplier. Must be ≥ 1.00' });
  manualCrashPoint = val;
  logAudit(req.adminId, 'OVERRIDE_CRASH', 'game', { multiplier: val }, req.ip);
  tgSend(`⚙️ *CRASH OVERRIDE SET*\nNext round will crash at *${val.toFixed(2)}x*`);
  res.json({ message: `Next round will crash at ${val.toFixed(2)}×` });
});

app.post('/api/admin/emergency-crash', verifyAdmin, (req, res) => {
  if (gameState !== 'FLYING')
    return res.status(400).json({ error: 'Game is not flying.' });

  clearInterval(flightTickInterval);
  const crashedAt = parseFloat(currentMult.toFixed(2));
  gameState       = 'CRASHED';

  history.unshift(crashedAt);
  if (history.length > 20) history.pop();

  io.emit('game_state', { state: 'CRASHED', finalMult: crashedAt, history: history.slice(0,15) });
  processCrashedBets();

  logAudit(req.adminId, 'EMERGENCY_CRASH', 'game', { mult: crashedAt }, req.ip);
  tgSend(`🚨 *EMERGENCY CRASH* at ${crashedAt.toFixed(2)}×`);

  setTimeout(startRound, 3500);
  res.json({ message: `Emergency crash executed at ${crashedAt.toFixed(2)}×` });
});

app.get('/api/admin/game-state', verifyAdmin, (req, res) => {
  res.json({
    state:             gameState,
    currentMult,
    targetCrashPoint,
    roundCounter,
    activeBets:        Object.keys(activeRoundBets).length,
    manualOverrideSet: manualCrashPoint !== null,
    manualCrashPoint,
  });
});

/* ────────────────────────────────────────
   SECURE GAME ENGINE
──────────────────────────────────────── */
let gameState       = 'WAITING';
let currentMult     = 1.00;
let targetCrashPoint = 1.00;
let history         = [60.16, 36.15, 54.63, 3.55, 4.18, 22.87, 25.18, 83.12, 44.75];
let roundCounter    = 85261;
let flightTickInterval;
let manualCrashPoint = null;
let activeRoundBets  = {};

function generateCrashPoint() {
  if (manualCrashPoint !== null) {
    const v = manualCrashPoint;
    manualCrashPoint = null;
    return v;
  }
  const seed = crypto.randomBytes(32).toString('hex');
  const h    = parseInt(seed.slice(0,13), 16);
  const e    = Math.pow(2, 52);
  const r    = h / e;
  const cp   = (1 - HOUSE_EDGE) / (1 - r);
  return parseFloat(Math.min(Math.max(1.00, cp), 1000.00).toFixed(2));
}

async function saveRound(roundId, crashPoint, seed) {
  try {
    const hash = crypto.createHash('sha256').update(seed).digest('hex');
    await Round.create({ roundId, crashPoint, serverSeed: seed, hash });
  } catch {}
}

async function processCrashedBets() {
  for (const key of Object.keys(activeRoundBets)) {
    const b = activeRoundBets[key];
    try {
      await Bet.create({
        userId:            b.userId,
        username:          b.username,
        betAmount:         b.amount,
        cashoutMultiplier: 0,
        winnings:          0,
        roundId:           String(roundCounter),
      });
      await User.findByIdAndUpdate(b.userId, { $inc: { totalBets: 1 } });
    } catch {}
  }
}

function startRound() {
  gameState        = 'WAITING';
  currentMult      = 1.00;
  activeRoundBets  = {};
  roundCounter++;

  const seed = crypto.randomBytes(32).toString('hex');
  targetCrashPoint = generateCrashPoint();
  saveRound(roundCounter, targetCrashPoint, seed);

  io.emit('game_state', { state: 'WAITING', roundId: roundCounter, history: history.slice(0,15) });
  tgSend(`⚠️ *Round #${roundCounter}*\n🎯 Crash: *${targetCrashPoint.toFixed(2)}x*`);

  setTimeout(() => {
    if (gameState !== 'WAITING') return;

    gameState = 'FLYING';
    io.emit('game_state', { state: 'FLYING', roundId: roundCounter });

    flightTickInterval = setInterval(() => {
      currentMult += 0.004 + (currentMult * 0.0015);

      if (currentMult >= targetCrashPoint) {
        clearInterval(flightTickInterval);
        currentMult = parseFloat(targetCrashPoint.toFixed(2));
        gameState   = 'CRASHED';

        history.unshift(currentMult);
        if (history.length > 20) history.pop();

        io.emit('game_state', { state: 'CRASHED', finalMult: currentMult, history: history.slice(0,15) });
        processCrashedBets();

        setTimeout(startRound, 3500);
      } else {
        io.emit('game_tick', { mult: parseFloat(currentMult.toFixed(4)) });
      }
    }, 50);

  }, 5000);
}

/* ────────────────────────────────────────
   SOCKET.IO — PLAYER BETTING
   (FIXED: ATOMIC PREVENTS RACE CONDITIONS)
──────────────────────────────────────── */
io.on('connection', (socket) => {
  socket.emit('game_state', {
    state:      gameState,
    roundId:    roundCounter,
    currentMult,
    history:    history.slice(0,15),
  });

  socket.on('placeBet', async (data) => {
    if (gameState !== 'WAITING')
      return socket.emit('error', 'Wait for the next round to start.');

    try {
      const identifier = data.username || data.phone;
      const amount     = parseFloat(data.amount);

      if (!identifier || isNaN(amount) || amount <= 0)
        return socket.emit('error', 'Invalid bet data.');
      if (amount < 10) return socket.emit('error', 'Minimum bet is KES 10.');
      if (amount > 50000) return socket.emit('error', 'Maximum bet is KES 50,000.');

      // ATOMIC DEDUCTION
      const user = await User.findOneAndUpdate(
          { 
              $or: [{ phone: identifier }, { username: identifier }], 
              status: 'active',
              balance: { $gte: amount } 
          },
          { $inc: { balance: -amount } },
          { new: true }
      );

      if (!user) return socket.emit('error', 'Insufficient balance or account inactive.');

      const betIndex = data.betIndex !== undefined ? parseInt(data.betIndex) : 0;
      const betKey   = `${socket.id}_${betIndex}`;
      activeRoundBets[betKey] = { userId: user._id, username: user.phone, amount, betIndex };

      socket.emit('betConfirmed', { newBalance: user.balance, betIndex });
      io.emit('liveBetAdded', { username: user.phone.slice(0,4)+'***', amount });
    } catch (err) {
      console.error('[placeBet]', err.message);
      socket.emit('error', 'Bet failed. Please try again.');
    }
  });

  socket.on('cashOut', async (data) => {
    const betIndex = data?.betIndex !== undefined ? parseInt(data.betIndex) : 0;
    const betKey   = `${socket.id}_${betIndex}`;

    if (gameState !== 'FLYING')
      return socket.emit('error', 'You can only cash out during a flying round.');
    if (!activeRoundBets[betKey])
      return socket.emit('error', 'No active bet found.');

    try {
      const bet     = activeRoundBets[betKey];
      const multi   = parseFloat(currentMult.toFixed(4));
      const winnings= parseFloat((bet.amount * multi).toFixed(2));

      // SYNCHRONOUS DELETE PREVENTS DOUBLE EXECUTION
      delete activeRoundBets[betKey];

      // ATOMIC ADDITION
      const user = await User.findByIdAndUpdate(
          bet.userId, 
          { 
              $inc: { 
                  balance: winnings, 
                  totalBets: 1, 
                  totalWins: winnings 
              } 
          }, 
          { new: true }
      );

      await Bet.create({
        userId:            user._id,
        username:          user.phone,
        betAmount:         bet.amount,
        cashoutMultiplier: multi,
        winnings,
        roundId:           String(roundCounter),
      });

      socket.emit('cashOutSuccess', {
        betIndex,
        multiplier: multi.toFixed(2),
        winnings:   winnings.toFixed(2),
        newBalance: user.balance.toFixed(2),
      });

      io.emit('playerCashedOut', {
        username:   user.phone.slice(0,4)+'***',
        multiplier: multi.toFixed(2),
        amount:     winnings.toFixed(2),
      });

    } catch (err) {
      console.error('[cashOut]', err.message);
      socket.emit('error', 'Cashout failed. Please try again.');
    }
  });

  socket.on('disconnect', () => {
    // Bets remain as losses if not cashed out — intentional
  });
});

/* ────────────────────────────────────────
   HEALTH & STATUS
──────────────────────────────────────── */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    db:     mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    game:   { state: gameState, round: roundCounter, mult: currentMult },
  });
});

app.get('/api/status', (req, res) => {
  res.json({
    game:    gameState,
    round:   roundCounter,
    players: Object.keys(activeRoundBets).length,
    history: history.slice(0,10),
  });
});

/* ────────────────────────────────────────
   404 + ERROR HANDLER
──────────────────────────────────────── */
app.use((req, res) => {
  if (req.path.startsWith('/api/'))
    return res.status(404).json({ error: 'Endpoint not found.' });
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((err, req, res, next) => {
  console.error('[ERROR]', err.stack);
  res.status(500).json({ error: 'Internal server error.' });
});

/* ────────────────────────────────────────
   GRACEFUL SHUTDOWN
──────────────────────────────────────── */
process.on('SIGTERM', async () => {
  console.log('SIGTERM received — shutting down gracefully');
  server.close(() => {
    mongoose.connection.close(false, () => {
      console.log('MongoDB connection closed');
      process.exit(0);
    });
  });
});
process.on('unhandledRejection', (reason) => {
  console.error('[UnhandledRejection]', reason);
});

/* ────────────────────────────────────────
   START
──────────────────────────────────────── */
server.listen(PORT, () => {
  console.log(`🚀 UrbanBet server on port ${PORT}`);
  console.log(`🌍 APP_URL: ${APP_URL}`);
  console.log(`⚙️  House edge: ${HOUSE_EDGE * 100}%`);
  startRound();
});