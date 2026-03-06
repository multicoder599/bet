const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// ==========================================
// --- MIDDLEWARE ---
// ==========================================
app.use(cors());
app.use(express.json()); 
app.use(express.static(path.join(__dirname, 'public'))); 

// ==========================================
// --- DATABASE CONNECTION ---
// ==========================================
const dbURI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/urban-bet';
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_dev_key';

mongoose.connect(dbURI)
    .then(() => console.log('✅ Connected to MongoDB (urban-bet)'))
    .catch(err => console.error('❌ MongoDB connection error:', err));

// ==========================================
// --- MONGODB MODELS ---
// ==========================================
const UserSchema = new mongoose.Schema({
    phone: { type: String, required: true, unique: true }, // Login uses phone
    username: { type: String, required: true }, // Display name
    password: { type: String, required: true },
    balance: { type: Number, default: 0.00 } 
});
const User = mongoose.model('User', UserSchema);

const BetSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    username: String,
    betAmount: Number,
    cashoutMultiplier: { type: Number, default: 0 }, 
    winnings: { type: Number, default: 0 },
    roundId: String,
    createdAt: { type: Date, default: Date.now }
});
const Bet = mongoose.model('Bet', BetSchema);

const TransactionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    type: { type: String, enum: ['DEPOSIT', 'WITHDRAWAL'] },
    amount: Number,
    status: { type: String, default: 'COMPLETED' }, 
    createdAt: { type: Date, default: Date.now }
});
const Transaction = mongoose.model('Transaction', TransactionSchema);

// ==========================================
// --- REST API ROUTES (AUTH & WALLET) ---
// ==========================================
app.post('/api/register', async (req, res) => {
    try {
        const { username, phone, password } = req.body;
        if (!phone || !password) return res.status(400).json({ error: 'Phone and password are required.' });

        const existingUser = await User.findOne({ phone });
        if (existingUser) return res.status(400).json({ error: 'Phone number already registered. Please login.' });

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ 
            phone: phone, 
            username: username || phone, // Fallback to phone to ensure uniqueness
            password: hashedPassword,
            balance: 0.00 // Bonus removed. Users now start with 0.00 KES
        });
        
        await newUser.save();
        res.status(201).json({ message: 'User registered successfully!' });
    } catch (err) {
        res.status(500).json({ error: `Backend Error: ${err.message}` });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const phoneToLogin = req.body.username || req.body.phone; 
        const password = req.body.password;

        if (!phoneToLogin || !password) return res.status(400).json({ error: 'Phone and password required.' });

        const user = await User.findOne({ phone: phoneToLogin });
        if (!user) return res.status(400).json({ error: 'Invalid phone number or password.' });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ error: 'Invalid phone number or password.' });

        const token = jwt.sign({ id: user._id, phone: user.phone }, JWT_SECRET, { expiresIn: '24h' });
        
        // IMPORTANT FIX: Return phone as the 'username' property so the frontend session uses the unique phone number
        res.json({ token, user: { username: user.phone, phone: user.phone, balance: user.balance } });
    } catch (err) {
        res.status(500).json({ error: `Backend Error: ${err.message}` });
    }
});

app.post('/api/deposit', async (req, res) => {
    try {
        const { username, amount } = req.body;
        if (amount < 10) return res.status(400).json({ error: 'Minimum deposit is 10 KES.' });

        // Support searching by phone or username
        const user = await User.findOne({ $or: [{ phone: username }, { username: username }] });
        if (!user) return res.status(404).json({ error: 'User not found.' });

        user.balance += parseFloat(amount);
        await user.save();
        await Transaction.create({ userId: user._id, type: 'DEPOSIT', amount });

        res.json({ message: 'Deposit successful', newBalance: user.balance });
    } catch (err) {
        res.status(500).json({ error: 'Deposit failed.' });
    }
});

app.post('/api/withdraw', async (req, res) => {
    try {
        const { username, amount } = req.body;
        const user = await User.findOne({ $or: [{ phone: username }, { username: username }] });
        if (!user) return res.status(404).json({ error: 'User not found.' });
        if (user.balance < amount) return res.status(400).json({ error: 'Insufficient balance.' });

        user.balance -= parseFloat(amount);
        await user.save();
        await Transaction.create({ userId: user._id, type: 'WITHDRAWAL', amount });

        res.json({ message: 'Withdrawal successful', newBalance: user.balance });
    } catch (err) {
        res.status(500).json({ error: 'Withdrawal failed.' });
    }
});

app.get('/api/history/:username', async (req, res) => {
    try {
        const history = await Bet.find({ username: req.params.username }).sort({ createdAt: -1 }).limit(20);
        res.json(history);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch history.' });
    }
});

// ==========================================
// --- SECURE GAME ENGINE STATE ---
// ==========================================
let gameState = 'WAITING'; 
let currentMult = 1.00;
let targetCrashPoint = 1.00;
let history = [60.16, 36.15, 54.63, 3.55, 4.18, 22.87, 25.18, 83.12, 44.75];
let roundCounter = 85261;
let flightTickInterval;

// Tracks active bets using a composite key: { "socketId_betIndex": { userId, username, amount, betIndex } }
let activeRoundBets = {}; 

function generateSecureCrashPoint(hasRealBets) {
    const hash = crypto.randomBytes(32).toString('hex');
    const h = parseInt(hash.slice(0, 13), 16);
    const e = Math.pow(2, 52);
    const r = h / e; 

    let crashPoint;
    if (hasRealBets) {
        const houseEdge = 0.04; // 4% House Edge protects your bankroll
        crashPoint = (1 - houseEdge) / (1 - r);
    } else {
        crashPoint = 1 / (1 - r); 
        if (Math.random() < 0.25) crashPoint = Math.max(crashPoint, (Math.random() * 13) + 2);
    }
    return Math.min(Math.max(1.00, crashPoint), 1000.00); 
}

function startRound() {
    gameState = 'WAITING';
    currentMult = 1.00;
    roundCounter++;
    activeRoundBets = {}; 

    io.emit('game_state', { state: 'WAITING', roundId: roundCounter, history: history.slice(0, 15) });

    setTimeout(() => {
        gameState = 'FLYING';
        const hasRealBets = Object.keys(activeRoundBets).length > 0;
        targetCrashPoint = generateSecureCrashPoint(hasRealBets);
        
        io.emit('game_state', { state: 'FLYING', roundId: roundCounter });

        flightTickInterval = setInterval(() => {
            currentMult += 0.004 + (currentMult * 0.0015);

            if (currentMult >= targetCrashPoint) {
                clearInterval(flightTickInterval);
                currentMult = targetCrashPoint; 
                gameState = 'CRASHED';
                
                history.unshift(currentMult);
                if(history.length > 20) history.pop();

                io.emit('game_state', { state: 'CRASHED', finalMult: currentMult, history: history.slice(0, 15) });
                processCrashedBets();

                setTimeout(startRound, 3500); 
            } else {
                io.emit('game_tick', { mult: currentMult });
            }
        }, 50);
    }, 5000); 
}

async function processCrashedBets() {
    for (const betKey in activeRoundBets) {
        const betData = activeRoundBets[betKey];
        try {
            await Bet.create({
                userId: betData.userId,
                username: betData.username,
                betAmount: betData.amount,
                cashoutMultiplier: 0,
                winnings: 0,
                roundId: roundCounter.toString()
            });
        } catch (err) { console.error('Failed to log crashed bet:', err); }
    }
}

// ==========================================
// --- SOCKET CONNECTIONS (BETTING) ---
// ==========================================
io.on('connection', (socket) => {
    socket.emit('game_state', { state: gameState, roundId: roundCounter, currentMult: currentMult, history: history.slice(0, 15) });

    socket.on('placeBet', async (data) => {
        if (gameState !== 'WAITING') return socket.emit('error', 'Wait for next round.');
        try {
            // Match by phone or username since frontend sends phone as username now
            const user = await User.findOne({ $or: [{ phone: data.username }, { username: data.username }] });
            if (!user) return socket.emit('error', 'User not found in database.');
            if (user.balance < data.amount) return socket.emit('error', 'Insufficient balance.');

            user.balance -= data.amount;
            await user.save();

            const betIndex = data.betIndex !== undefined ? data.betIndex : 0;
            const betKey = `${socket.id}_${betIndex}`;

            activeRoundBets[betKey] = { userId: user._id, username: user.phone, amount: data.amount, betIndex: betIndex };

            socket.emit('betConfirmed', { newBalance: user.balance, betIndex: betIndex });
            io.emit('liveBetAdded', { username: user.phone, amount: data.amount });
        } catch (err) {
            socket.emit('error', 'Bet processing failed: ' + err.message);
        }
    });

    socket.on('cashOut', async (data) => {
        const betIndex = data && data.betIndex !== undefined ? data.betIndex : 0;
        const betKey = `${socket.id}_${betIndex}`;

        if (gameState !== 'FLYING' || !activeRoundBets[betKey]) return socket.emit('error', 'Cannot cash out right now.');

        try {
            const betData = activeRoundBets[betKey];
            const lockedMultiplier = currentMult; 
            const winnings = betData.amount * lockedMultiplier;

            delete activeRoundBets[betKey]; 

            const user = await User.findById(betData.userId);
            user.balance += winnings;
            await user.save();

            await Bet.create({
                userId: user._id,
                username: user.phone,
                betAmount: betData.amount,
                cashoutMultiplier: lockedMultiplier,
                winnings: winnings,
                roundId: roundCounter.toString()
            });

            socket.emit('cashOutSuccess', { betIndex: betIndex, multiplier: lockedMultiplier.toFixed(2), winnings: winnings.toFixed(2), newBalance: user.balance.toFixed(2) });
            io.emit('playerCashedOut', { username: user.phone, multiplier: lockedMultiplier.toFixed(2), amount: winnings.toFixed(2) });
        } catch (err) {
            socket.emit('error', 'Cashout processing failed.');
        }
    });
    
    socket.on('disconnect', () => {
        // Keep active bets even on disconnect to act as losses if not cashed out.
    });
});

startRound();

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 UrbanBet Server running on port ${PORT}`));