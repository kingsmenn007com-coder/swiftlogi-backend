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

// Define the list of trusted origins (CRITICAL FIX for CORS)
const allowedOrigins = [
    'http://localhost:5173', // For local development
    'https://swiftlogi-prototype.vercel.app', // Your Vercel Frontend
];

// --- MIDDLEWARE ---
// Robust CORS Configuration
app.use(cors({
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) === -1) {
            const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
            return callback(new Error(msg), false);
        }
        return callback(null, true);
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
}));

// Required to parse JSON bodies
app.use(express.json());

// --- DATABASE CONNECTION ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ MongoDB Connected Successfully"))
    .catch(err => console.error("❌ MongoDB Connection Error:", err));

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

// ... (User Registration and Login routes omitted for brevity) ...

// GET ALL PRODUCTS (Protected Route) - FINAL FIX
app.get('/api/products', auth, async (req, res) => {
    try {
        // CRITICAL FIX: Populate the seller field to send the seller object to the Frontend
        const products = await Product.find({})
            .populate('seller', 'name'); // Populate the seller field, only including the 'name' 
                                        // The rest of the seller object (including _id) will be available.
        res.json(products);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ORDER ROUTE (Income Logic) - FINAL FIX
app.post('/api/orders', auth, async (req, res) => {
    const COMMISSION_RATE = 0.10; 
    try {
        const { productId, price, sellerId, deliveryFee } = req.body;
        const buyerId = req.user.id; 

        if (!productId || !price || !sellerId) {
            return res.status(400).json({ error: 'Missing required order fields: productId, price, or sellerId.' });
        }

        const totalAmount = price + (deliveryFee || 0);
        const calculatedCommission = price * COMMISSION_RATE;

        // Create the new order document
        const newOrder = new Order({
            product: productId,
            buyer: buyerId,
            seller: sellerId,
            totalAmount: totalAmount, 
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
        res.status(500).json({ error: `Order creation failed: ${err.message}` });
    }
});

// Start Server
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});
