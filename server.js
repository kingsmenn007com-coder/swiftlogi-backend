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
app.use(cors({ origin: allowedOrigin, methods: 'GET,HEAD,PUT,PATCH,POST,DELETE', credentials: true }));
app.use(express.json());

// --- DATABASE CONNECTION (omitted for brevity, assume unchanged)
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ MongoDB Connected Successfully"))
    .catch(err => console.error("❌ MongoDB Connection Error:", err));

// JWT Auth Middleware (omitted for brevity, assume unchanged)
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

// GET ALL PRODUCTS (Protected Route)
app.get('/api/products', auth, async (req, res) => {
    try {
        const products = await Product.find({});
        res.json(products);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ORDER ROUTE (Income Logic) - FINAL FIX
app.post('/api/orders', auth, async (req, res) => {
    const COMMISSION_RATE = 0.10; 
    try {
        // UPDATED: Now expecting sellerId and price from the Frontend
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
            seller: sellerId, // Directly using the ID passed from the frontend
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

// Start Server (omitted for brevity, assume unchanged)
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});
