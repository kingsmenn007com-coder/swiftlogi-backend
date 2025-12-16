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

mongoose.connect(MONGO_URI)
    .then(() => console.log('MongoDB connected'))
    .catch(err => console.error(err));

const UserSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['buyer', 'seller', 'rider', 'admin'], default: 'buyer' }
});

// Root fix: Ensure password hashing is only applied once
UserSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
});

const User = mongoose.model('User', UserSchema);

const ProductSchema = new mongoose.Schema({
    name: String,
    description: String,
    price: Number,
    stock: Number,
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
});
const Product = mongoose.model('Product', ProductSchema);

const OrderSchema = new mongoose.Schema({
    buyer: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    price: Number,
    deliveryFee: Number,
    status: { type: String, default: 'pending' },
    rider: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    createdAt: { type: Date, default: Date.now }
});
const Order = mongoose.model('Order', OrderSchema);

// API ROUTES
app.post('/api/register', async (req, res) => {
    try {
        const { name, email, password, role } = req.body;
        // Logic fix: Check if user exists, if so, update them to fix password/role
        let user = await User.findOne({ email });
        if (user) {
            user.name = name;
            user.password = password; // pre-save hook will hash this
            user.role = role;
            await user.save();
            return res.status(200).json({ message: 'Account updated successfully.' });
        }
        user = new User({ name, email, password, role });
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
        if (!user) return res.status(401).json({ error: 'User not found.' });
        
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(401).json({ error: 'Invalid credentials.' });

        const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: '1d' });
        res.json({ token, user: { id: user._id, name: user.name, role: user.role } });
    } catch (err) {
        res.status(500).json({ error: 'Server error.' });
    }
});

app.get('/api/products', async (req, res) => {
    const products = await Product.find().populate('seller', 'name');
    res.json(products);
});

app.get('/api/user/orders', async (req, res) => {
    // Basic fetch to show history - authentication usually goes here
    const orders = await Order.find().populate('product').populate('rider', 'name').sort({ createdAt: -1 });
    res.json(orders);
});

app.listen(PORT, () => console.log(`Server on ${PORT}`));
