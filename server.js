// Import Dependencies
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors'); // Ensure this is imported for the new fix
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Import Models
const User = require('./models/User');
const Product = require('./models/Product');
const Order = require('./models/Order');

// Configure Environment and App
dotenv.config();
const app = express();
const PORT = process.env.PORT || 5000;

// NEW: Define the trusted origin URL from the environment (Render)
const allowedOrigin = process.env.CORS_ORIGIN || 'http://localhost:5173';

// --- MIDDLEWARE (Simple, Reliable CORS Configuration) ---
app.use(cors({
    origin: allowedOrigin, // Trust the domain provided by the CORS_ORIGIN environment variable
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
}));

// This is required to parse JSON bodies from incoming requests
app.use(express.json());

// --- Database Connection ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('✅ MongoDB Connected Successfully'))
    .catch(err => console.error('❌ MongoDB Connection Error:', err));


// --- API ROUTES ---

// Health Check Route (for Render verification)
app.get('/', (req, res) => {
    res.json({ status: "Active", message: "SwiftLogi System Online" });
});


// Login Route
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });
        res.json({ token, user: { id: user._id, email: user.email, role: user.role } });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error during login' });
    }
});


// AUTH MIDDLEWARE (Used for protecting routes)
const auth = (req, res, next) => {
    try {
        const token = req.header('Authorization').replace('Bearer ', '');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        res.status(401).json({ message: 'Authentication required' });
    }
};

// Route to get all products (Example Protected Route)
app.get('/api/products', auth, async (req, res) => {
    try {
        const products = await Product.find({});
        res.json(products);
    } catch (err) {
        res.status(500).json({ message: 'Server error fetching products' });
    }
});

// Route for creating a new order (Protected Route with Logic)
app.post('/api/orders', auth, async (req, res) => {
    // This is the core logic that tracks income
    const { userId, productId, quantity, price } = req.body;
    const COMMISSION_RATE = 0.10; // 10% commission
    
    // Calculate commission
    const totalValue = quantity * price;
    const commission = totalValue * COMMISSION_RATE;
    
    try {
        const newOrder = new Order({
            user: userId,
            product: productId,
            quantity,
            price,
            commission
        });

        await newOrder.save();
        
        // This is the commission generated for the platform owner (you)
        res.status(201).json({ 
            message: 'Order created successfully. Commission tracked.',
            commission_amount: commission 
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error during order creation' });
    }
});

// --- Server Startup ---
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));

// Export the app for testing (optional)
module.exports = app;
