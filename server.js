const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();

// --- Configuration ---
const MONGO_URI = process.env.MONGO_URI; 
const JWT_SECRET = process.env.JWT_SECRET || 'SUPER_SECRET_KEY_FOR_PROTOTYPE'; // FIXED JWT SECRET
const PORT = process.env.PORT || 3001;
const COMMISSION_RATE = 0.05; // 5% commission

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
    rider: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, // NEW FIELD for rider
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
        const buyerId = req.user.id;

        if (!sellerId) {
            return res.status(400).json({ error: "Seller ID is required to place an order." });
        }

        const product = await Product.findById(productId);
        if (!product || product.stock < 1) {
            return res.status(400).json({ error: "Product is out of stock or not found." });
        }

        const commission = price * COMMISSION_RATE;
        const netPrice = price - commission;

        const order = new Order({
            buyer: buyerId,
            seller: sellerId,
            product: productId,
            price: price,
            deliveryFee: deliveryFee,
            commission: commission,
            status: 'pending' // Order is pending delivery
        });

        await order.save();
        product.stock -= 1;
        await product.save();

        res.status(201).json({ 
            message: "Order placed successfully. It is now awaiting a rider.", 
            order: order, 
            yourCommission: commission,
            netSellerPayout: netPrice
        });

    } catch (err) {
        console.error("Order error:", err);
        res.status(500).json({ error: 'Failed to place order. ' + err.message });
    }
});

// 5. Rider Jobs Route (READ - Protected & Role-restricted) - NEW ROUTE
app.get('/api/jobs', auth, async (req, res) => {
    // Optional: Restrict access only to users with role 'rider'
    if (req.user.role !== 'rider' && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Access denied. Only riders can view jobs.' });
    }

    try {
        // Find all orders that are 'pending' and have not yet been assigned a rider
        const availableJobs = await Order.find({ 
            status: 'pending', 
            rider: null 
        })
        .populate('product', 'name description') // Get product details
        .populate('seller', 'name')             // Get seller name
        .populate('buyer', 'name');             // Get buyer name
        
        // Format the output for the rider
        const jobsList = availableJobs.map(job => ({
            orderId: job._id,
            pickup: job.seller.name,
            dropoff: job.buyer.name, // Placeholder: In a real app, this would be a real address
            productName: job.product.name,
            deliveryFee: job.deliveryFee,
            commission: job.commission,
            riderPayout: job.deliveryFee // Rider gets the full delivery fee
        }));

        res.json(jobsList);
    } catch (err) {
        console.error("Jobs fetch error:", err);
        res.status(500).json({ error: 'Failed to fetch available jobs.' });
    }
});

// 6. Accept Job Route (UPDATE - Protected & Role-restricted) - NEW ROUTE
app.post('/api/jobs/:orderId/accept', auth, async (req, res) => {
    if (req.user.role !== 'rider') {
        return res.status(403).json({ error: 'Access denied. Only riders can accept jobs.' });
    }

    try {
        const orderId = req.params.orderId;
        const riderId = req.user.id;

        // Find the job, ensure it's pending and unassigned
        const order = await Order.findOneAndUpdate(
            { 
                _id: orderId, 
                status: 'pending', 
                rider: null 
            },
            { 
                $set: { 
                    status: 'shipped', // Status moves to shipped/in-transit
                    rider: riderId 
                } 
            },
            { new: true } // Return the updated document
        );

        if (!order) {
            return res.status(404).json({ error: 'Job not found, already accepted, or status changed.' });
        }

        res.json({ 
            message: `Job accepted successfully. Order is now marked as Shipped.`,
            orderId: order._id
        });

    } catch (err) {
        console.error("Job acceptance error:", err);
        res.status(500).json({ error: 'Failed to accept job.' });
    }
});


// --- Server Start ---
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

app.get('/', (req, res) => {
    res.send('SwiftLogi Backend Service is Active');
});
