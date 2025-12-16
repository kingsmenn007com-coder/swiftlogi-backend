const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();

// --- Configuration ---
const MONGO_URI = process.env.MONGO_URI; 
const JWT_SECRET = process.env.JWT_SECRET || 'SUPER_SECRET_KEY_FOR_PROTOTYPE';
const PORT = process.env.PORT || 3001;
const COMMISSION_RATE = 0.05;

// --- Middleware ---
app.use(cors());
app.use(express.json());

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
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
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
    rider: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    createdAt: { type: Date, default: Date.now }
});
const Order = mongoose.model('Order', OrderSchema);

// --- JWT Authentication Middleware ---
const auth = (req, res, next) => {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Authentication required.' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        res.status(401).json({ error: 'Invalid or expired token.' });
    }
};

// --- API Routes ---
app.post('/api/register', async (req, res) => {
    try {
        const { name, email, password, role } = req.body;
        const user = new User({ name, email, password, role });
        await user.save();
        res.status(201).json({ message: 'User registered successfully.' });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

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

app.get('/api/products', auth, async (req, res) => {
    try {
        const products = await Product.find().populate('seller', 'name');
        res.json(products);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch products.' });
    }
});

app.post('/api/orders', auth, async (req, res) => {
    try {
        const { productId, price, sellerId, deliveryFee } = req.body;
        const commission = price * COMMISSION_RATE;
        const order = new Order({
            buyer: req.user.id,
            seller: sellerId,
            product: productId,
            price,
            deliveryFee,
            commission,
            status: 'pending'
        });
        await order.save();
        res.status(201).json({ message: "Order placed.", order, yourCommission: commission });
    } catch (err) {
        res.status(500).json({ error: 'Failed to place order.' });
    }
});

app.get('/api/jobs', auth, async (req, res) => {
    if (req.user.role !== 'rider' && req.user.role !== 'admin') return res.status(403).json({ error: 'Denied.' });
    try {
        const availableJobs = await Order.find({ status: 'pending', rider: null })
            .populate('product', 'name').populate('seller', 'name').populate('buyer', 'name');
        const jobsList = availableJobs.map(job => ({
            orderId: job._id,
            pickup: job.seller.name,
            dropoff: job.buyer.name,
            productName: job.product.name,
            riderPayout: job.deliveryFee
        }));
        res.json(jobsList);
    } catch (err) {
        res.status(500).json({ error: 'Failed jobs fetch.' });
    }
});

app.post('/api/jobs/:orderId/accept', auth, async (req, res) => {
    if (req.user.role !== 'rider') return res.status(403).json({ error: 'Denied.' });
    try {
        const order = await Order.findOneAndUpdate(
            { _id: req.params.orderId, status: 'pending', rider: null },
            { $set: { status: 'shipped', rider: req.user.id } },
            { new: true }
        );
        if (!order) return res.status(404).json({ error: 'Not found.' });
        res.json({ message: `Accepted.` });
    } catch (err) {
        res.status(500).json({ error: 'Failed.' });
    }
});

app.get('/api/user/orders', auth, async (req, res) => {
    try {
        const query = (req.user.role === 'buyer') ? { buyer: req.user.id } : 
                      (req.user.role === 'rider') ? { rider: req.user.id } : 
                      { seller: req.user.id };
        const orders = await Order.find(query).populate('product', 'name').populate('rider', 'name').sort({ createdAt: -1 });
        res.json(orders);
    } catch (err) {
        res.status(500).json({ error: 'Failed history.' });
    }
});

app.listen(PORT, () => console.log(`Running on ${PORT}`));
app.get('/', (req, res) => res.send('SwiftLogi Active'));
