const express = require('express');
const axios = require('axios');
const cors = require('cors');
const helmet = require('helmet');

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Rate limiting
const rateLimit = new Map();

// Simple cache system
const cache = new Map();

// API Key validation
const validKeys = new Set([
    'vishalboss_key_fdc25670cee8c9f060f1fc1a0e7faf26224a3624',
    'your_custom_key_1',
    'your_custom_key_2'
]);

// Rate limiting middleware
function checkRateLimit(ip) {
    const now = Date.now();
    const windowStart = now - 60000; // 1 minute window
    
    if (!rateLimit.has(ip)) {
        rateLimit.set(ip, []);
    }
    
    const requests = rateLimit.get(ip).filter(time => time > windowStart);
    rateLimit.set(ip, requests);
    
    if (requests.length >= 10) { // 10 requests per minute
        return false;
    }
    
    requests.push(now);
    return true;
}

// Authentication middleware
function authenticate(req, res, next) {
    const apiKey = req.query.key || req.headers['x-api-key'];
    
    if (!apiKey) {
        return res.status(401).json({
            error: 'API key missing',
            message: 'Please provide API key in query parameter or header'
        });
    }
    
    if (!validKeys.has(apiKey)) {
        return res.status(403).json({
            error: 'Invalid API key',
            message: 'The provided API key is not valid'
        });
    }
    
    // Rate limiting check
    const clientIP = req.ip || req.connection.remoteAddress;
    if (!checkRateLimit(clientIP)) {
        return res.status(429).json({
            error: 'Rate limit exceeded',
            message: 'Too many requests, please try again later'
        });
    }
    
    next();
}

// Main API endpoint - Original API clone
app.get('/api.php', authenticate, async (req, res) => {
    try {
        const { number } = req.query;

        // Validate number parameter
        if (!number) {
            return res.status(400).json({
                error: 'Number parameter required',
                message: 'Please provide number parameter'
            });
        }

        // Validate phone number format
        if (!/^\d{10,15}$/.test(number)) {
            return res.status(400).json({
                error: 'Invalid number format',
                message: 'Number should be 10-15 digits'
            });
        }

        // Check cache first
        const cacheKey = `number_${number}`;
        const cached = cache.get(cacheKey);
        
        if (cached && Date.now() < cached.expiry) {
            console.log(`✅ Cache hit for: ${number}`);
            return res.json({
                ...cached.data,
                cached: true,
                timestamp: new Date().toISOString()
            });
        }

        console.log(`🔄 Fetching from original API: ${number}`);
        
        // Call original API
        const originalResponse = await axios.get('https://numberimfo.vishalboss.sbs/api.php', {
            params: {
                number: number,
                key: 'vishalboss_key_fdc25670cee8c9f060f1fc1a0e7faf26224a3624'
            },
            timeout: 15000
        });

        // Cache the response for 5 minutes
        cache.set(cacheKey, {
            data: originalResponse.data,
            expiry: Date.now() + 300000 // 5 minutes
        });

        // Clean old cache entries (optional)
        if (cache.size > 1000) {
            const now = Date.now();
            for (let [key, value] of cache.entries()) {
                if (now > value.expiry) {
                    cache.delete(key);
                }
            }
        }

        // Return response
        res.json({
            ...originalResponse.data,
            cached: false,
            timestamp: new Date().toISOString(),
            source: 'vishalboss_clone'
        });

    } catch (error) {
        console.error('❌ API Error:', error.message);
        
        if (error.code === 'ECONNABORTED') {
            return res.status(504).json({
                error: 'Timeout',
                message: 'Original API timeout'
            });
        }
        
        if (error.response) {
            return res.status(error.response.status).json({
                error: 'Upstream error',
                message: 'Error from original API',
                status: error.response.status
            });
        }
        
        res.status(500).json({
            error: 'Server error',
            message: 'Internal server error occurred'
        });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        message: 'API is running',
        timestamp: new Date().toISOString(),
        cacheSize: cache.size
    });
});

// Add new API key (simple admin function)
app.post('/admin/add-key', (req, res) => {
    const { admin_key, new_key } = req.body;
    
    // Simple admin authentication
    if (admin_key !== 'your_admin_password') {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    if (new_key) {
        validKeys.add(new_key);
        res.json({ 
            success: true, 
            message: 'API key added',
            total_keys: validKeys.size 
        });
    } else {
        res.status(400).json({ error: 'New key required' });
    }
});

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({
        error: 'Endpoint not found',
        message: 'Check API documentation'
    });
});

// Error handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        error: 'Internal server error',
        message: 'Something went wrong'
    });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 API Server running on port ${PORT}`);
    console.log(`📊 Main endpoint: http://localhost:${PORT}/api.php`);
    console.log(`❤️ Health check: http://localhost:${PORT}/health`);
    console.log(`🔑 Valid API keys: ${validKeys.size}`);
});
