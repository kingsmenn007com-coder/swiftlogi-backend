const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();

// --- Configuration ---
// Ensure you set this in your Render environment variables!
const MONGO_URI = process.env.MONGO_URI; 
const JWT_SECRET = process.env.JWT_SECRET || 'SUPER_SECRET_KEY_FOR_PROTOTYPE';
const PORT = process.env.PORT || 3001;
const COMMISSION_RATE = 0.05; // 5% commission

// --- Middleware ---
app.use(cors()); // Allows cross-origin requests from Vercel Frontend
app.use(express.json()); // Body parser for JSON requests

// --- Database Connection ---
mongoose.connect(MONGO_URI)
    .then(() => console.log('MongoDB connected successfully.'))
    .catch(err => console.error('MongoDB connection error:', err));

// --- Database Schemas ---

const UserSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['buyer', 'seller', 'rider', 'admin'], default: 'buyer' }
});
// Hash password before saving
UserSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
});
const User = mongoose.model('User', UserSchema);

const ProductSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: { type: String, required: true },
    price: { type: Number, required: true },
    stock: { type: Number, required: true, default: 0 },
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true } // REQUIRED FIELD
});
const Product = mongoose.model('Product', ProductSchema);

const OrderSchema = new mongoose.Schema({
    buyer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    price: { type: Number, required: true },
    deliveryFee: { type: Number, required: true, default: 1500 },
    commission: { type: Number, required: true },
    status: { type: String, enum: ['pending', 'shipped', 'delivered'], default: 'pending' },
    createdAt: { type: Date, default: Date.now }
});
const Order = mongoose.model('Order', OrderSchema);

// --- JWT Authentication Middleware ---
const auth = (req, res, next) => {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
        return res.status(401).json({ error: 'Authentication required.' });
    }
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        res.status(401).json({ error: 'Invalid or expired token.' });
    }
};

// --- API Routes ---

// 1. Register Route (Simplified for quick setup)
app.post('/api/register', async (req, res) => {
    try {
        const { name, email, password, role } = req.body;
        const user = new User({ name, email, password, role });
        await user.save();
        res.status(201).json({ message: 'User registered successfully. Please log in.' });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// 2. Login Route
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ error: 'Invalid credentials.' });
        }

        const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: '1d' });
        res.json({ token, user: { id: user._id, name: user.name, role: user.role } });

    } catch (err) {
        res.status(500).json({ error: 'Server error during login.' });
    }
});

// 3. Products Route (READ - Protected)
app.get('/api/products', auth, async (req, res) => {
    try {
        // CRITICAL FIX: Populate the seller field to send full seller object to Frontend
        const products = await Product.find().populate('seller', 'name');
        res.json(products);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch products.' });
    }
});

// 4. Orders Route (CREATE - Protected)
app.post('/api/orders', auth, async (req, res) => {
    try {
        const { productId, price, sellerId, deliveryFee } = req.body;
        const buyerId = req.user.id; // Extracted from JWT token

        if (!sellerId) {
            // This check serves as a backup, but the issue should be fixed by now.
            return res.status(400).json({ error: "Seller ID is required to place an order." });
        }

        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({ error: "Product not found." });
        }
        if (product.stock < 1) {
            return res.status(400).json({ error: "Product is out of stock." });
        }

        // Calculate commission
        const commission = price * COMMISSION_RATE;
        const netPrice = price - commission; // The amount the seller receives

        const order = new Order({
            buyer: buyerId,
            seller: sellerId,
            product: productId,
            price: price,
            deliveryFee: deliveryFee,
            commission: commission
        });

        await order.save();

        // Optionally decrement stock
        product.stock -= 1;
        await product.save();

        res.status(201).json({ 
            message: "Order placed successfully.", 
            order: order, 
            yourCommission: commission,
            netSellerPayout: netPrice
        });

    } catch (err) {
        console.error("Order error:", err);
        res.status(500).json({ error: 'Failed to place order. ' + err.message });
    }
});

// --- Server Start ---
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

// Keep the Render service alive by listening on the root path
app.get('/', (req, res) => {
    res.send('SwiftLogi Backend Service is Active');
});
