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
app.use(express.json()); // Allows Express to parse JSON bodies
app.use(express.static(path.join(__dirname, 'public')));

// --- DATABASE CONNECTION ---
const dbURI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/tab-pesa';
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_dev_key';

mongoose.connect(dbURI)
    .then(() => console.log('✅ Connected to MongoDB'))
    .catch(err => console.log('❌ MongoDB connection error:', err));

// --- MONGODB MODELS ---

// 1. User Model
const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    balance: { type: Number, default: 0.00 } // Balance in KES
});
const User = mongoose.model('User', UserSchema);

// 2. Bet History Model
const BetSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    username: String,
    betAmount: Number,
    cashoutMultiplier: { type: Number, default: 0 }, // 0 means crashed/lost
    winnings: { type: Number, default: 0 },
    roundId: String,
    createdAt: { type: Date, default: Date.now }
});
const Bet = mongoose.model('Bet', BetSchema);

// 3. Transaction Model (Deposits/Withdrawals)
const TransactionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    type: { type: String, enum: ['DEPOSIT', 'WITHDRAWAL'] },
    amount: Number,
    status: { type: String, default: 'COMPLETED' }, // Would be 'PENDING' for real M-Pesa
    createdAt: { type: Date, default: Date.now }
});
const Transaction = mongoose.model('Transaction', TransactionSchema);


// --- REST API ROUTES (AUTH & WALLET) ---

// Register User
app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        const existingUser = await User.findOne({ username });
        if (existingUser) return res.status(400).json({ error: 'Username taken' });

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ username, password: hashedPassword });
        
        // Give new users a 50 KES test bonus
        newUser.balance = 50.00; 
        await newUser.save();

        res.status(201).json({ message: 'User registered successfully!' });
    } catch (err) {
        res.status(500).json({ error: 'Server error during registration' });
    }
});

// Login User
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username });
        if (!user) return res.status(400).json({ error: 'Invalid credentials' });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ error: 'Invalid credentials' });

        const token = jwt.sign({ id: user._id, username: user.username }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ token, user: { username: user.username, balance: user.balance } });
    } catch (err) {
        res.status(500).json({ error: 'Server error during login' });
    }
});

// Mock Deposit (Later: Replace with M-Pesa Daraja STK Push)
app.post('/api/deposit', async (req, res) => {
    try {
        // In a real app, you would verify the JWT token here first
        const { username, amount } = req.body;
        if (amount < 10) return res.status(400).json({ error: 'Minimum deposit is 10 KES' });

        const user = await User.findOne({ username });
        if (!user) return res.status(404).json({ error: 'User not found' });

        user.balance += parseFloat(amount);
        await user.save();

        await Transaction.create({ userId: user._id, type: 'DEPOSIT', amount });

        res.json({ message: 'Deposit successful', newBalance: user.balance });
    } catch (err) {
        res.status(500).json({ error: 'Deposit failed' });
    }
});

// Mock Withdrawal 
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
        res.status(500).json({ error: 'Withdrawal failed' });
    }
});

// Get User Bet History
app.get('/api/history/:username', async (req, res) => {
    try {
        const history = await Bet.find({ username: req.params.username }).sort({ createdAt: -1 }).limit(20);
        res.json(history);
    } catch (err) {
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

// Tracks active bets for the CURRENT round: { socketId: { userId, betAmount } }
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
    currentRoundId = Date.now().toString(); // New ID for each round
    activeRoundBets = {}; // Clear bets from last round

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
                
                // Process losses for anyone who didn't cash out
                processCrashedBets();

                setTimeout(runGameCycle, 4000);
            } else {
                io.emit('tick', { multiplier: currentMultiplier.toFixed(2) });
            }
        }, 50);

    }, 5000); 
}

// Any bet left in `activeRoundBets` when the plane crashes is a loss.
async function processCrashedBets() {
    for (const socketId in activeRoundBets) {
        const betData = activeRoundBets[socketId];
        
        // Log the loss in the database
        await Bet.create({
            userId: betData.userId,
            username: betData.username,
            betAmount: betData.amount,
            cashoutMultiplier: 0,
            winnings: 0,
            roundId: currentRoundId
        });
    }
}


// --- SOCKET CONNECTIONS (BETTING LOGIC) ---
io.on('connection', (socket) => {
    console.log(`Player connected: ${socket.id}`);
    
    socket.emit('gameState', { state: gameState, multiplier: currentMultiplier.toFixed(2), roundId: currentRoundId });

    // PLACING A BET
    socket.on('placeBet', async (data) => {
        // data expects: { username: "player1", amount: 100 }
        if (gameState !== 'WAITING') {
            return socket.emit('error', 'Wait for next round.');
        }

        try {
            const user = await User.findOne({ username: data.username });
            if (!user) return socket.emit('error', 'User not found');
            if (user.balance < data.amount) return socket.emit('error', 'Insufficient balance');

            // Deduct balance
            user.balance -= data.amount;
            await user.save();

            // Store bet in server memory for this round
            activeRoundBets[socket.id] = { 
                userId: user._id, 
                username: user.username,
                amount: data.amount 
            };

            socket.emit('betConfirmed', { newBalance: user.balance });
            // Broadcast to chat/live bets panel
            io.emit('liveBetAdded', { username: user.username, amount: data.amount });

        } catch (err) {
            socket.emit('error', 'Bet processing failed');
        }
    });

    // CASHING OUT
    socket.on('cashOut', async () => {
        if (gameState !== 'FLYING' || !activeRoundBets[socket.id]) {
            return socket.emit('error', 'Cannot cash out');
        }

        try {
            const betData = activeRoundBets[socket.id];
            const lockedMultiplier = currentMultiplier; // Lock it in immediately
            const winnings = betData.amount * lockedMultiplier;

            // Remove from active bets so they don't lose it when the plane crashes
            delete activeRoundBets[socket.id]; 

            const user = await User.findById(betData.userId);
            user.balance += winnings;
            await user.save();

            // Save winning bet to history
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
            
            // Broadcast win to everyone
            io.emit('playerCashedOut', { 
                username: user.username, 
                multiplier: lockedMultiplier.toFixed(2), 
                amount: winnings.toFixed(2) 
            });

        } catch (err) {
            socket.emit('error', 'Cashout processing failed');
        }
    });

    socket.on('disconnect', () => {
        // Note: If a user disconnects while plane is flying, they lose the bet. 
        // Real casinos use "Auto Cashout" to protect against disconnects.
        console.log(`Player disconnected: ${socket.id}`);
    });
});

runGameCycle();

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Crash Server running on port ${PORT}`));