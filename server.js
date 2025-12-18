const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();
const MONGO_URI = process.env.MONGO_URI; 
const JWT_SECRET = process.env.JWT_SECRET || 'SUPER_SECRET_KEY_FOR_PROTOTYPE';
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

mongoose.connect(MONGO_URI).then(() => console.log('MongoDB connected')).catch(err => console.error(err));

// --- Schemas ---

const User = mongoose.model('User', new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['user', 'rider'], default: 'user' }
}));

// Added location and sellerName for Marketplace transparency
const Product = mongoose.model('Product', new mongoose.Schema({
    name: String, 
    price: Number, 
    location: { type: String, default: 'Nigeria' },
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    sellerName: String,
    image: { type: String, default: '' }, // For future actual image uploads
    createdAt: { type: Date, default: Date.now }
}));

const Order = mongoose.model('Order', new mongoose.Schema({
    buyer: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    items: [{
        product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
        name: String,
        price: Number,
        quantity: { type: Number, default: 1 }
    }],
    totalPrice: Number,
    deliveryFee: { type: Number, default: 2500 },
    status: { type: String, enum: ['pending', 'shipped', 'delivered', 'cancelled'], default: 'pending' },
    rider: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    createdAt: { type: Date, default: Date.now }
}));

// --- Routes ---

app.post('/api/register', async (req, res) => {
    try {
        const hashedPassword = await bcrypt.hash(req.body.password, 10);
        const user = new User({ ...req.body, password: hashedPassword });
        await user.save();
        res.status(201).json({ message: 'Registered.' });
    } catch (err) { res.status(400).json({ error: 'User exists' }); }
});

app.post('/api/login', async (req, res) => {
    const user = await User.findOne({ email: req.body.email });
    if (!user || !(await bcrypt.compare(req.body.password, user.password))) return res.status(401).json({ error: 'Invalid' });
    res.json({ token: jwt.sign({ id: user._id }, JWT_SECRET), user: { id: user._id, name: user.name, role: user.role } });
});

// GET: All Products (Marketplace Search)
app.get('/api/products', async (req, res) => { res.json(await Product.find().sort({ createdAt: -1 })); });

// POST: Upload New Product
app.post('/api/products', async (req, res) => {
    try {
        const product = new Product(req.body);
        await product.save();
        res.status(201).json(product);
    } catch (err) { res.status(400).json({ error: 'Upload failed' }); }
});

// GET: Filtered history by User ID
app.get('/api/user/orders/:userId', async (req, res) => {
    res.json(await Order.find({ $or: [{ buyer: req.params.userId }, { rider: req.params.userId }] }).populate('items.product').sort({ createdAt: -1 }));
});

// GET: Rider Jobs
app.get('/api/jobs', async (req, res) => {
    res.json(await Order.find({ status: 'pending', rider: null }).populate('items.product'));
});

// POST: Accept Job
app.post('/api/jobs/:orderId/accept', async (req, res) => {
    await Order.findByIdAndUpdate(req.params.orderId, { rider: req.body.riderId, status: 'shipped' });
    res.json({ message: 'Job Accepted' });
});

app.listen(PORT, () => console.log(`Server on ${PORT}`));
