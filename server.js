// Configuration MUST be at the very top to load secrets
require('dotenv').config(); 

// Import Dependencies
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors'); 
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Import Models
const User = require('./models/User');
const Product = require('./models/Product');
const Order = require('./models/Order');

const app = express();
const PORT = process.env.PORT || 5000;

// Define the trusted origin URL (uses Render variable or local fallback)
const allowedOrigin = process.env.CORS_ORIGIN || 'http://localhost:5173';

// --- MIDDLEWARE ---
// Robust CORS Configuration
app.use(cors({
    origin: allowedOrigin, 
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
}));

// Required to parse JSON bodies
app.use(express.json());

// --- DATABASE CONNECTION ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ MongoDB Connected Successfully"))
    .catch(err => console.error("❌ MongoDB Connection Error:", err));

// --- API ROUTES ---

// Health Check Route
app.get('/', (req, res) => {
    res.json({ status: "Active", message: "SwiftLogi System Online" });
});

// JWT Auth Middleware
const auth = (req, res, next) => {
    try {
        const token = req.header('Authorization').replace('Bearer ', '');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded; 
        next(); 
    } catch (e) {
        res.status(401).send({ error: 'Authentication required.' });
    }
};

// USER REGISTRATION
app.post('/api/register', async (req, res) => {
    try {
        const { name, email, password, role } = req.body;
        if (!email || !password) return res.status(400).json({ error: "Please enter all required fields" });

        const existingUser = await User.findOne({ email });
        // NOTE: Allowing overwrite for development simplicity. In production, this should block registration.
        if (existingUser) {
            // If user exists, update password and role (for testing multiple roles)
            const salt = await bcrypt.genSalt(10);
            existingUser.password = await bcrypt.hash(password, salt);
            existingUser.role = role || 'buyer';
            await existingUser.save();

            const token = jwt.sign({ id: existingUser._id, role: existingUser.role }, process.env.JWT_SECRET, { expiresIn: '1h' });
            return res.status(200).json({
                message: "User updated successfully!",
                token,
                user: { id: existingUser._id, name: existingUser.name, email: existingUser.email, role: existingUser.role }
            });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newUser = new User({ name, email, password: hashedPassword, role: role || 'buyer' });
        const savedUser = await newUser.save();

        const token = jwt.sign({ id: savedUser._id, role: savedUser.role }, process.env.JWT_SECRET, { expiresIn: '1h' });

        res.status(201).json({
            message: "User registered successfully!",
            token,
            user: { id: savedUser._id, name: savedUser.name, email: savedUser.email, role: savedUser.role }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// USER LOGIN 
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ error: "User not found" });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ error: "Invalid credentials" });

        const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1h' });

        res.json({
            token,
            user: { id: user._id, email: user.email, role: user.role }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET ALL PRODUCTS (Example Protected Route)
app.get('/api/products', auth, async (req, res) => {
    try {
        // Populate the seller field to return seller details in the JSON
        const products = await Product.find({}).populate('seller', 'name email');
        res.json(products);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ORDER ROUTE (Income Logic) - FULLY IMPLEMENTED
app.post('/api/orders', auth, async (req, res) => {
    const COMMISSION_RATE = 0.10; 
    try {
        const { productId, deliveryFee } = req.body;
        const buyerId = req.user.id; // Extracted from JWT token via auth middleware

        // CRITICAL STEP: Fetch the full product data to get price and seller ID
        const product = await Product.findById(productId);

        if (!product) {
            return res.status(404).json({ error: 'Product not found.' });
        }

        const price = product.price; // Base price
        const sellerId = product.seller; // Seller's ObjectId

        // Calculate totals
        const totalAmount = price + (deliveryFee || 0);
        const calculatedCommission = price * COMMISSION_RATE;

        // Create the new order document
        const newOrder = new Order({
            product: productId,
            buyer: buyerId,
            seller: sellerId, // Now correctly populated
            totalAmount: totalAmount, // Now correctly populated
            commission: calculatedCommission,
            status: 'Placed',
            orderDate: new Date(),
        });

        const savedOrder = await newOrder.save();

        res.status(201).json({ 
            message: 'Order created successfully. Commission tracked.',
            order: savedOrder,
            yourCommission: calculatedCommission
        });

    } catch (err) {
        console.error("Order creation error:", err);
        // If the error is still a validation error, it means we missed a required field
        res.status(500).json({ error: `Order creation failed: ${err.message}` });
    }
});

// Start Server
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});
