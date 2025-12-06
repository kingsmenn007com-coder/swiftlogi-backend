require('dotenv').config();
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

// Middleware Setup
const allowedOrigins = ['https://YOUR_VERCEL_URL', 'http://localhost:5173']; 

app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or curl) or from our specific list
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
}));
app.use(express.json());

// --- JWT AUTH MIDDLEWARE ---
// Use this function on routes that require the user to be logged in (e.g., placing orders)
const auth = (req, res, next) => {
    try {
        const token = req.header('Authorization').replace('Bearer ', '');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        req.user = decoded; // Attach user info (id, role)
        next(); // Proceed to the route handler
    } catch (e) {
        res.status(401).send({ error: 'Authentication required to access this resource.' });
    }
};

// --- DATABASE CONNECTION ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ MongoDB Connected Successfully"))
    .catch(err => console.error("❌ MongoDB Connection Error:", err));

// --- ROUTES ---

// 1. Health Check
app.get('/', (req, res) => {
    res.json({ status: 'Active', message: 'SwiftLogi System Online' });
});

// 2. USER REGISTRATION
app.post('/api/register', async (req, res) => {
    try {
        const { name, email, password, role } = req.body;
        if (!name || !email || !password) return res.status(400).json({ error: "Please enter all fields" });

        const existingUser = await User.findOne({ email });
        if (existingUser) return res.status(400).json({ error: "User already exists" });

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newUser = new User({ name, email, password: hashedPassword, role: role || 'buyer' });
        const savedUser = await newUser.save();

        const token = jwt.sign({ id: savedUser._id, role: savedUser.role }, process.env.JWT_SECRET, { expiresIn: '1h' });

        res.status(201).json({
            message: "User registered successfully!",
            token,
            user: { id: savedUser._id, name: savedUser.name, email: savedUser.email, role: savedUser.role, walletBalance: savedUser.walletBalance }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. USER LOGIN
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
            user: { id: user._id, name: user.name, email: user.email, role: user.role, walletBalance: user.walletBalance }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 4. ADD PRODUCT (Requires Seller ID - should be protected)
app.post('/api/products', async (req, res) => {
    try {
        const { sellerId, name, description, price, stock } = req.body;
        const newProduct = new Product({ seller: sellerId, name, description, price, stock });
        const savedProduct = await newProduct.save();
        res.status(201).json(savedProduct);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 5. GET ALL PRODUCTS (Public Marketplace View)
app.get('/api/products', async (req, res) => {
    try {
        const products = await Product.find().populate('seller', 'name email');
        res.json(products);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 6. ADD ORDER (The Money Flow Route)
// NOTE: This route needs the auth middleware and the final code will need a check for buyer role
app.post('/api/orders', async (req, res) => {
    try {
        const COMMISSION_RATE = 0.10; // 10% commission on product price
        const { buyerId, productId, price, deliveryFee } = req.body;

        const product = await Product.findById(productId);
        if (!product) return res.status(404).json({ error: 'Product not found' });

        const calculatedCommission = price * COMMISSION_RATE;
        const totalAmount = price + deliveryFee;

        const newOrder = new Order({
            buyer: buyerId,
            seller: product.seller,
            product: productId,
            deliveryFee,
            totalAmount,
            commission: calculatedCommission,
            status: 'pending'
        });

        const savedOrder = await newOrder.save();
        
        res.status(201).json({ 
            message: "Order placed successfully! Awaiting payment gateway processing.",
            order: savedOrder,
            yourCommission: calculatedCommission
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 7. VIEW ADMIN COMMISSION (Protected Profit Report)
// NOTE: The 'auth' middleware is applied here to protect the route!
app.get('/api/admin/commission', auth, async (req, res) => {
    try {
        const result = await Order.aggregate([
            { $group: { _id: null, totalCommission: { $sum: "$commission" } } }
        ]);

        const totalProfit = result.length > 0 ? result[0].totalCommission : 0;
        
        res.json({
            message: "Your passive income report.",
            totalProfit: totalProfit,
            role_of_caller: req.user.role, // Proves the auth middleware worked
            note: "This route is now secured and only runs if a valid JWT token is provided."
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// Start Server
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});
// 6. RIDER ACCEPT JOB (Protected by Auth)
// This route is called when a Rider clicks 'Accept Job' on the frontend.
app.post('/api/orders/accept/:orderId', auth, async (req, res) => {
    try {
        const orderId = req.params.orderId;
        const riderId = req.user.id; // Extracted securely from the JWT token
        const riderRole = req.user.role;

        // Security Check: Only allow Riders to accept jobs
        if (riderRole !== 'rider') {
            return res.status(403).json({ error: 'Permission denied. Only Riders can accept jobs.' });
        }

        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({ error: 'Order not found.' });
        }

        // Check if the order is already assigned
        if (order.rider !== null) {
            return res.status(400).json({ error: 'This job is already assigned.' });
        }

        // Update the order in MongoDB
        order.rider = riderId;
        order.status = 'shipping'; // Change status from 'pending' to 'shipping'
        await order.save();

        res.json({
            message: `Order ${orderId} successfully assigned to Rider ${req.user.id}. Status changed to Shipping.`,
            order: order
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
