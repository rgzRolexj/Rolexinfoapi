const express = require('express');
const axios = require('axios');

const app = express();

// Middleware
app.use(express.json());
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    next();
});

// Simple in-memory storage
let requestCount = 0;
const requestTimestamps = [];

// Valid API Keys
const validKeys = [
    'vishalboss_key_fdc25670cee8c9f060f1fc1a0e7faf26224a3624',
    'rolex_key_123',
    'test_key_456'
];

// Simple rate limiting
function checkRateLimit(ip) {
    const now = Date.now();
    const windowMs = 60000; // 1 minute
    
    // Clean old timestamps
    const recentRequests = requestTimestamps.filter(time => now - time < windowMs);
    requestTimestamps.length = 0;
    requestTimestamps.push(...recentRequests);
    
    // Check limit
    if (recentRequests.length >= 20) {
        return false;
    }
    
    requestTimestamps.push(now);
    return true;
}

// Simple cache
const cache = {};

// Main API endpoint
app.get('/api', async (req, res) => {
    try {
        const { number, key } = req.query;

        // Check API key
        if (!key || !validKeys.includes(key)) {
            return res.json({
                success: false,
                error: 'Invalid API key',
                message: 'Please provide valid API key'
            });
        }

        // Check rate limit
        const clientIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
        if (!checkRateLimit(clientIP)) {
            return res.json({
                success: false,
                error: 'Rate limit exceeded',
                message: 'Too many requests'
            });
        }

        // Check number
        if (!number) {
            return res.json({
                success: false,
                error: 'Number required',
                message: 'Please provide number parameter'
            });
        }

        // Validate number
        if (!/^\d{10,15}$/.test(number.toString())) {
            return res.json({
                success: false,
                error: 'Invalid number',
                message: 'Number must be 10-15 digits'
            });
        }

        // Check cache
        const cacheKey = number.toString();
        if (cache[cacheKey] && Date.now() - cache[cacheKey].timestamp < 300000) {
            console.log('Serving from cache:', number);
            return res.json({
                ...cache[cacheKey].data,
                cached: true,
                server: 'rolexinfoapi.vercel.app'
            });
        }

        console.log('Fetching from original API:', number);
        
        // Call original API
        const response = await axios.get('https://numberimfo.vishalboss.sbs/api.php', {
            params: {
                number: number,
                key: 'vishalboss_key_fdc25670cee8c9f060f1fc1a0e7faf26224a3624'
            },
            timeout: 10000
        });

        // Cache response
        cache[cacheKey] = {
            data: response.data,
            timestamp: Date.now()
        };

        // Clean old cache entries
        const now = Date.now();
        Object.keys(cache).forEach(key => {
            if (now - cache[key].timestamp > 300000) {
                delete cache[key];
            }
        });

        // Send response
        res.json({
            ...response.data,
            cached: false,
            server: 'rolexinfoapi.vercel.app',
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('API Error:', error.message);
        
        let errorResponse = {
            success: false,
            error: 'Internal error',
            message: 'Something went wrong'
        };

        if (error.code === 'ECONNABORTED') {
            errorResponse = {
                success: false,
                error: 'Timeout',
                message: 'Request timeout'
            };
        } else if (error.response) {
            errorResponse = {
                success: false,
                error: 'Upstream error',
                message: 'Error from source API'
            };
        }

        res.json(errorResponse);
    }
});

// Simple health check
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        server: 'Rolex Info API',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Test endpoint
app.get('/test', (req, res) => {
    res.json({
        success: true,
        message: 'API is working!',
        server: 'rolexinfoapi.vercel.app',
        timestamp: new Date().toISOString()
    });
});

// 404 handler
app.use('*', (req, res) => {
    res.json({
        success: false,
        error: 'Endpoint not found',
        message: 'Use /api endpoint for number information'
    });
});

// Export for Vercel
module.exports = app;
