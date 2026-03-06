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
// --- TELEGRAM BOT CONFIGURATION ---
// ==========================================
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';

async function sendTelegramMessage(text) {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
    try {
        const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
        // Uses native fetch (Requires Node.js 18+)
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                chat_id: TELEGRAM_CHAT_ID, 
                text: text,
                parse_mode: 'Markdown'
            })
        });
    } catch (error) {
        console.error('Telegram notification failed:', error.message);
    }
}

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
    phone: { type: String, required: true, unique: true }, 
    username: { type: String, required: true }, 
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
    receipt: { type: String, unique: true, sparse: true }, // Added to prevent double-crediting
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
            username: username || phone, 
            password: hashedPassword,
            balance: 0.00 
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
        res.json({ token, user: { username: user.phone, phone: user.phone, balance: user.balance } });
    } catch (err) {
        res.status(500).json({ error: `Backend Error: ${err.message}` });
    }
});

// ==========================================
// --- MEGAPAY STK PUSH (DEPOSIT) ---
// ==========================================
app.post('/api/deposit', async (req, res) => {
    try {
        const { username, phone, amount } = req.body;
        if (amount < 50) return res.status(400).json({ error: 'Minimum deposit is 50 KES.' });

        const user = await User.findOne({ $or: [{ phone: username }, { username: username }] });
        if (!user) return res.status(404).json({ error: 'User not found.' });

        // Use the provided phone from the form, fallback to registered phone
        let targetPhone = phone || user.phone;
        let formattedPhone = targetPhone.replace(/\D/g, ''); 
        
        if (formattedPhone.startsWith('0')) formattedPhone = '254' + formattedPhone.substring(1);
        if (formattedPhone.startsWith('7') || formattedPhone.startsWith('1')) formattedPhone = '254' + formattedPhone;

        // Uses environment variable, falls back to your Render domain
        const APP_URL = process.env.APP_URL || 'https://bet-6jn6.onrender.com';

        const payload = {
            api_key: "MGPY26G5iWPw", 
            email: "kanyingiwaitara@gmail.com", 
            amount: amount, 
            msisdn: formattedPhone,
            callback_url: `${APP_URL}/api/megapay/webhook`,
            description: "UrbanBet Deposit", 
            reference: "DEP" + Date.now()
        };

        // Call Megapay using native fetch
        const response = await fetch('https://megapay.co.ke/backend/v1/initiatestk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        // Log the attempt as pending
        await Transaction.create({ userId: user._id, type: 'DEPOSIT', amount, status: 'PENDING' });

        res.status(200).json({ message: "STK Push Sent! Check your phone." });
    } catch (error) { 
        console.error("STK Error:", error);
        res.status(500).json({ error: "Payment Gateway Error" }); 
    }
});

// ==========================================
// --- MEGAPAY WEBHOOK (RECEIVES PAYMENT) ---
// ==========================================
app.post('/api/megapay/webhook', async (req, res) => {
    // 1. Immediately acknowledge receipt to Megapay so they stop retrying
    res.status(200).send("OK");
    
    const data = req.body;
    try {
        // 2. Check if the payment was actually successful (Code 0)
        const responseCode = data.ResponseCode !== undefined ? data.ResponseCode : data.ResultCode;
        if (responseCode != 0) return; // User cancelled or failed

        // 3. Extract the M-Pesa data
        const amount = parseFloat(data.TransactionAmount || data.amount || data.Amount);
        const receipt = data.TransactionReceipt || data.MpesaReceiptNumber;
        let phone = (data.Msisdn || data.phone || data.PhoneNumber).toString();
        
        // Format phone back to local format (e.g., 07...) to match your Database
        if (phone.startsWith('254')) phone = '0' + phone.substring(3);

        // 4. Find the matching user in UrbanBet
        const user = await User.findOne({ phone: phone });
        if (!user) {
            console.log(`Webhook Error: Unregistered phone paid ${amount} - ${phone}`);
            return;
        }

        // 5. Prevent Duplicate Processing (Check if receipt exists)
        const existingTx = await Transaction.findOne({ receipt: receipt });
        if (existingTx) {
            console.log(`Duplicate Webhook ignored for receipt: ${receipt}`);
            return;
        }

        // 6. Update User Balance
        user.balance += amount;
        await user.save();

        // 7. Save the official completed transaction
        await Transaction.create({
            userId: user._id,
            type: "DEPOSIT",
            amount: amount,
            status: "COMPLETED",
            receipt: receipt
        });

        // 8. Send Telegram Alert
        sendTelegramMessage(`💵 *DEPOSIT CONFIRMED*\n👤 User: ${user.phone}\n💰 Amount: KES ${amount}\n🧾 Receipt: ${receipt}`);
        
    } catch (err) { 
        console.error("Webhook Processing Error:", err); 
    }
});

// ==========================================
// --- WITHDRAWAL ---
// ==========================================
app.post('/api/withdraw', async (req, res) => {
    try {
        const { username, amount } = req.body;
        const user = await User.findOne({ $or: [{ phone: username }, { username: username }] });
        if (!user) return res.status(404).json({ error: 'User not found.' });
        if (user.balance < amount) return res.status(400).json({ error: 'Insufficient balance.' });

        // Deduct balance instantly
        user.balance -= parseFloat(amount);
        await user.save();
        
        // Log transaction as pending admin approval
        await Transaction.create({ userId: user._id, type: 'WITHDRAWAL', amount, status: 'PENDING_ADMIN_APPROVAL' });

        // Alert Admin via Telegram
        sendTelegramMessage(`🚨 *NEW WITHDRAWAL REQUEST* 🚨\n\n👤 *User:* ${user.phone}\n💰 *Amount:* KES ${amount}\n💳 *Remaining Balance:* KES ${user.balance.toFixed(2)}\n\n_Please process this manually via M-Pesa B2C or Admin Panel._`);

        res.json({ message: 'Withdrawal request sent! Admin will process it shortly.', newBalance: user.balance });
    } catch (err) {
        res.status(500).json({ error: 'Withdrawal failed.' });
    }
});

// FETCH WALLET TRANSACTIONS (DEPOSITS & WITHDRAWALS)
app.get('/api/transactions/:username', async (req, res) => {
    try {
        const user = await User.findOne({ $or: [{ phone: req.params.username }, { username: req.params.username }] });
        if (!user) return res.status(404).json([]);
        
        const transactions = await Transaction.find({ userId: user._id }).sort({ createdAt: -1 }).limit(30);
        res.json(transactions);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch wallet transactions.' });
    }
});

// ==========================================
// --- ADMIN API ROUTES ---
// ==========================================
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'key1905';

const verifyAdmin = (req, res, next) => {
    if (req.headers['x-admin-secret'] === ADMIN_SECRET) next();
    else res.status(403).json({ error: 'Unauthorized Admin Access' });
};

app.get('/api/admin/users', verifyAdmin, async (req, res) => {
    try {
        const users = await User.find({}, '-password').sort({ createdAt: -1 });
        res.json(users);
    } catch (err) { res.status(500).json({ error: 'Failed to fetch users.' }); }
});

app.put('/api/admin/users/:id/balance', verifyAdmin, async (req, res) => {
    try {
        const { balance } = req.body;
        const user = await User.findByIdAndUpdate(req.params.id, { balance: parseFloat(balance) }, { new: true });
        if (!user) return res.status(404).json({ error: 'User not found.' });
        res.json({ message: 'Balance updated successfully.', newBalance: user.balance });
    } catch (err) { res.status(500).json({ error: 'Failed to update balance.' }); }
});

app.delete('/api/admin/users/:id', verifyAdmin, async (req, res) => {
    try {
        const user = await User.findByIdAndDelete(req.params.id);
        if (!user) return res.status(404).json({ error: 'User not found.' });
        res.json({ message: 'User deleted successfully.' });
    } catch (err) { res.status(500).json({ error: 'Failed to delete user.' }); }
});
// ADMIN: FETCH PENDING WITHDRAWALS
app.get('/api/admin/transactions/pending', verifyAdmin, async (req, res) => {
    try {
        // Fetch all pending withdrawals and pull the user's phone number with it
        const pendingTxs = await Transaction.find({ type: 'WITHDRAWAL', status: 'PENDING_ADMIN_APPROVAL' })
            .populate('userId', 'phone')
            .sort({ createdAt: 1 }); // Oldest first
        res.json(pendingTxs);
    } catch (err) { res.status(500).json({ error: 'Failed to fetch pending withdrawals.' }); }
});

// ADMIN: MARK WITHDRAWAL AS PAID
app.put('/api/admin/transactions/:id/approve', verifyAdmin, async (req, res) => {
    try {
        const tx = await Transaction.findByIdAndUpdate(req.params.id, { status: 'COMPLETED' }, { new: true });
        if (!tx) return res.status(404).json({ error: 'Transaction not found.' });
        res.json({ message: 'Withdrawal marked as COMPLETED.' });
    } catch (err) { res.status(500).json({ error: 'Failed to approve withdrawal.' }); }
});

// ADMIN: REJECT WITHDRAWAL & REFUND USER
app.put('/api/admin/transactions/:id/reject', verifyAdmin, async (req, res) => {
    try {
        const tx = await Transaction.findById(req.params.id);
        if (!tx) return res.status(404).json({ error: 'Transaction not found.' });
        if (tx.status !== 'PENDING_ADMIN_APPROVAL') return res.status(400).json({ error: 'Already processed.' });
        
        tx.status = 'REJECTED';
        await tx.save();

        // Refund the user's balance
        const user = await User.findById(tx.userId);
        if(user) {
            user.balance += tx.amount;
            await user.save();
        }
        res.json({ message: 'Withdrawal rejected. Money refunded to user.' });
    } catch (err) { res.status(500).json({ error: 'Failed to reject withdrawal.' }); }
});
// ADMIN: OVERRIDE NEXT ROUND MULTIPLIER
app.post('/api/admin/override', verifyAdmin, (req, res) => {
    try {
        const { multiplier } = req.body;
        const val = parseFloat(multiplier);
        if (isNaN(val) || val < 1.0) return res.status(400).json({ error: 'Invalid multiplier' });
        
        manualCrashPoint = val; 
        res.json({ message: `Success! The next round will crash exactly at ${val.toFixed(2)}x` });
    } catch (err) {
        res.status(500).json({ error: 'Failed to set override' });
    }
});

// ADMIN: EMERGENCY INSTANT CRASH
app.post('/api/admin/emergency-crash', verifyAdmin, (req, res) => {
    try {
        if (gameState !== 'FLYING') {
            return res.status(400).json({ error: 'Game is not currently flying.' });
        }
        
        // Stop the flight instantly
        clearInterval(flightTickInterval);
        targetCrashPoint = currentMult; // Set target to exact current multiplier
        gameState = 'CRASHED';
        
        history.unshift(currentMult);
        if(history.length > 20) history.pop();

        io.emit('game_state', { state: 'CRASHED', finalMult: currentMult, history: history.slice(0, 15) });
        processCrashedBets();
        
        sendTelegramMessage(`🚨 *EMERGENCY CRASH TRIGGERED* at ${currentMult.toFixed(2)}x!`);

        setTimeout(startRound, 3500); 
        
        res.json({ message: `Emergency Crash Executed successfully at ${currentMult.toFixed(2)}x` });
    } catch (err) {
        res.status(500).json({ error: 'Failed to execute emergency crash' });
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

// Override variable
let manualCrashPoint = null; 
let activeRoundBets = {}; 

function generateSecureCrashPoint() {
    // 1. CHECK FOR ADMIN OVERRIDE FIRST
    if (manualCrashPoint !== null) {
        const override = manualCrashPoint;
        manualCrashPoint = null; // Reset immediately for next round
        return override;
    }

    // 2. NORMAL RANDOM LOGIC (Permanent 4% House Edge protection applied early)
    const hash = crypto.randomBytes(32).toString('hex');
    const h = parseInt(hash.slice(0, 13), 16);
    const e = Math.pow(2, 52);
    const r = h / e; 

    const houseEdge = 0.04; 
    const crashPoint = (1 - houseEdge) / (1 - r);
    
    return Math.min(Math.max(1.00, crashPoint), 1000.00); 
}

function startRound() {
    gameState = 'WAITING';
    currentMult = 1.00;
    roundCounter++;
    activeRoundBets = {}; 

    // Generate crash point EARLY to send to Telegram 5 seconds before flight
    targetCrashPoint = generateSecureCrashPoint();
    
    // Fire Telegram Bot Message
    sendTelegramMessage(`⚠️ *Round #${roundCounter} Preparing*\n🎯 Scheduled Crash: *${targetCrashPoint.toFixed(2)}x*`);

    io.emit('game_state', { state: 'WAITING', roundId: roundCounter, history: history.slice(0, 15) });

    setTimeout(() => {
        // If an emergency crash happened during WAITING, abort starting the flight
        if(gameState !== 'WAITING') return; 

        gameState = 'FLYING';
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