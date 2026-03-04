const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// --- MIDDLEWARE ---
app.use(cors());
app.use(express.json()); 
app.use(express.static(path.join(__dirname, 'public')));

// --- DATABASE CONNECTION ---
const dbURI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/tab-pesa';
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_dev_key';

mongoose.connect(dbURI)
    .then(() => console.log('✅ Connected to MongoDB'))
    .catch(err => console.log('❌ MongoDB connection error:', err));

// --- MONGODB MODELS ---

const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
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


// --- REST API ROUTES (AUTH & WALLET) ---

// Register User
app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;

        // 1. Validate inputs
        if (!username || !password) {
            return res.status(400).json({ error: 'Phone number and password are required.' });
        }

        // 2. Check for existing user
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(400).json({ error: 'Phone number already registered. Please login.' });
        }

        // 3. Hash password and save
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ 
            username, 
            password: hashedPassword,
            balance: 50.00 // Welcome bonus
        });
        
        await newUser.save();
        res.status(201).json({ message: 'User registered successfully!', user: { username: newUser.username, balance: newUser.balance } });

    } catch (err) {
        console.error('Registration Error:', err); // This prints the exact database error to Render logs
        res.status(500).json({ error: 'Server error during registration. Check logs.' });
    }
});

// Login User
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Phone number and password are required.' });
        }

        const user = await User.findOne({ username });
        if (!user) return res.status(400).json({ error: 'Invalid phone number or password.' });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ error: 'Invalid phone number or password.' });

        const token = jwt.sign({ id: user._id, username: user.username }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ token, user: { username: user.username, balance: user.balance } });

    } catch (err) {
        console.error('Login Error:', err);
        res.status(500).json({ error: 'Server error during login.' });
    }
});

app.post('/api/deposit', async (req, res) => {
    try {
        const { username, amount } = req.body;
        if (amount < 10) return res.status(400).json({ error: 'Minimum deposit is 10 KES' });

        const user = await User.findOne({ username });
        if (!user) return res.status(404).json({ error: 'User not found' });

        user.balance += parseFloat(amount);
        await user.save();
        await Transaction.create({ userId: user._id, type: 'DEPOSIT', amount });

        res.json({ message: 'Deposit successful', newBalance: user.balance });
    } catch (err) {
        console.error('Deposit Error:', err);
        res.status(500).json({ error: 'Deposit failed' });
    }
});

app.post('/api/withdraw', async (req, res) => {
    try {
        const { username, amount } = req.body;
        
        const user = await User.findOne({ username });
        if (!user) return res.status(404).json({ error: 'User not found' });
        if (user.balance < amount) return res.status(400).json({ error: 'Insufficient balance' });

        user.balance -= parseFloat(amount);
        await user.save();
        await Transaction.create({ userId: user._id, type: 'WITHDRAWAL', amount });

        res.json({ message: 'Withdrawal successful', newBalance: user.balance });
    } catch (err) {
        console.error('Withdraw Error:', err);
        res.status(500).json({ error: 'Withdrawal failed' });
    }
});

app.get('/api/history/:username', async (req, res) => {
    try {
        const history = await Bet.find({ username: req.params.username }).sort({ createdAt: -1 }).limit(20);
        res.json(history);
    } catch (err) {
        console.error('History Error:', err);
        res.status(500).json({ error: 'Failed to fetch history' });
    }
});


// --- GAME ENGINE STATE ---
let gameState = 'WAITING'; 
let currentMultiplier = 1.00;
let crashPoint = 0;
let startTime = 0;
let gameInterval;
let currentRoundId = Date.now().toString();
let activeRoundBets = {}; 

function generateCrashPoint() {
    const houseEdge = 0.04; 
    if (Math.random() < houseEdge) return 1.00;
    const r = Math.random();
    const multiplier = 0.99 / (1 - r);
    return Math.min(Math.max(1.01, multiplier), 10000.00);
}

function runGameCycle() {
    gameState = 'WAITING';
    currentMultiplier = 1.00;
    currentRoundId = Date.now().toString(); 
    activeRoundBets = {}; 

    io.emit('gameState', { state: gameState, multiplier: 1.00, timeToNextRound: 5000, roundId: currentRoundId });

    setTimeout(() => {
        gameState = 'FLYING';
        crashPoint = generateCrashPoint();
        startTime = Date.now();
        console.log(`[NEW ROUND ${currentRoundId}] Flying. Crash at: ${crashPoint.toFixed(2)}x`);
        
        io.emit('gameStarted');

        gameInterval = setInterval(() => {
            const timeElapsed = (Date.now() - startTime) / 1000;
            currentMultiplier = Math.pow(Math.E, 0.08 * timeElapsed);

            if (currentMultiplier >= crashPoint) {
                currentMultiplier = crashPoint;
                clearInterval(gameInterval);
                gameState = 'CRASHED';
                
                io.emit('crashed', { crashPoint: currentMultiplier });
                console.log(`[CRASHED] at ${currentMultiplier.toFixed(2)}x`);
                
                processCrashedBets();
                setTimeout(runGameCycle, 4000);
            } else {
                io.emit('tick', { multiplier: currentMultiplier.toFixed(2) });
            }
        }, 50);

    }, 5000); 
}

async function processCrashedBets() {
    for (const socketId in activeRoundBets) {
        const betData = activeRoundBets[socketId];
        try {
            await Bet.create({
                userId: betData.userId,
                username: betData.username,
                betAmount: betData.amount,
                cashoutMultiplier: 0,
                winnings: 0,
                roundId: currentRoundId
            });
        } catch (err) {
            console.error('Failed to save crashed bet:', err);
        }
    }
}


// --- SOCKET CONNECTIONS (BETTING LOGIC) ---
io.on('connection', (socket) => {
    console.log(`Player connected: ${socket.id}`);
    
    socket.emit('gameState', { state: gameState, multiplier: currentMultiplier.toFixed(2), roundId: currentRoundId });

    socket.on('placeBet', async (data) => {
        if (gameState !== 'WAITING') {
            return socket.emit('error', 'Wait for next round.');
        }

        try {
            const user = await User.findOne({ username: data.username });
            if (!user) return socket.emit('error', 'User not found');
            if (user.balance < data.amount) return socket.emit('error', 'Insufficient balance');

            user.balance -= data.amount;
            await user.save();

            activeRoundBets[socket.id] = { 
                userId: user._id, 
                username: user.username,
                amount: data.amount 
            };

            socket.emit('betConfirmed', { newBalance: user.balance });
            io.emit('liveBetAdded', { username: user.username, amount: data.amount });

        } catch (err) {
            console.error('Socket Bet Error:', err);
            socket.emit('error', 'Bet processing failed');
        }
    });

    socket.on('cashOut', async () => {
        if (gameState !== 'FLYING' || !activeRoundBets[socket.id]) {
            return socket.emit('error', 'Cannot cash out');
        }

        try {
            const betData = activeRoundBets[socket.id];
            const lockedMultiplier = currentMultiplier; 
            const winnings = betData.amount * lockedMultiplier;

            delete activeRoundBets[socket.id]; 

            const user = await User.findById(betData.userId);
            user.balance += winnings;
            await user.save();

            await Bet.create({
                userId: user._id,
                username: user.username,
                betAmount: betData.amount,
                cashoutMultiplier: lockedMultiplier,
                winnings: winnings,
                roundId: currentRoundId
            });

            socket.emit('cashOutSuccess', { 
                multiplier: lockedMultiplier.toFixed(2), 
                winnings: winnings.toFixed(2),
                newBalance: user.balance.toFixed(2)
            });
            
            io.emit('playerCashedOut', { 
                username: user.username, 
                multiplier: lockedMultiplier.toFixed(2), 
                amount: winnings.toFixed(2) 
            });

        } catch (err) {
            console.error('Socket Cashout Error:', err);
            socket.emit('error', 'Cashout processing failed');
        }
    });

    socket.on('disconnect', () => {
        console.log(`Player disconnected: ${socket.id}`);
    });
});

runGameCycle();

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Crash Server running on port ${PORT}`));